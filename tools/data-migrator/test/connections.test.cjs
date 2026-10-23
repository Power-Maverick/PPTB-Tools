const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadSource(relativePath, window = {}) {
    const filename = path.resolve(__dirname, "../src", relativePath);
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const exports = {};
    vm.runInNewContext(outputText, {
        exports, window, console, setTimeout,
        require: (name) => loadSource(path.relative(path.resolve(__dirname, "../src"), path.resolve(path.dirname(filename), `${name}.ts`)), window),
    }, { filename });
    return exports;
}

const { resolveMigrationConnections, assertConnectionsUnchanged, getUnavailablePlaylistConnections } = loadSource("utils/connections.ts");
const connection = (id, url = `https://${id}.crm.dynamics.com`) => ({ id, url, name: id });
const slots = [connection("one"), null, connection("three"), connection("four"), connection("five"), connection("six")];
const config = { sourceConnectionId: "four", targetConnectionIds: ["one", "six"] };

test("playlist warnings identify missing source and target connections without losing entry order", () => {
    const playlist = [
        { ...config, entityDisplayName: "Accounts" },
        { sourceConnectionId: "missing-source", targetConnectionIds: ["three", "missing-target", "missing-target"], entityDisplayName: "Contacts" },
        { sourceConnectionId: "one", targetConnectionIds: ["removed"], entityDisplayName: "Teams" },
    ];
    const issues = getUnavailablePlaylistConnections(playlist, slots);
    assert.equal(issues.length, 2);
    assert.equal(issues[0].index, 1);
    assert.equal(issues[0].entityDisplayName, "Contacts");
    assert.deepEqual(Array.from(issues[0].missingIds), ["missing-source", "missing-target"]);
    assert.equal(issues[1].index, 2);
    const restored = [...slots, connection("missing-source"), connection("missing-target"), connection("removed")];
    assert.equal(getUnavailablePlaylistConnections(playlist, restored).length, 0);
    assert.equal(getUnavailablePlaylistConnections([], slots).length, 0);
});

test("any connection can be source; sparse numeric slots and destination order are preserved", () => {
    const result = resolveMigrationConnections(config, slots);
    assert.equal(result.source, 3);
    assert.deepEqual(Array.from(result.targets), [0, 5]);
});

test("one to five destinations are supported", () => {
    const six = Array.from({ length: 6 }, (_, i) => connection(`env${i}`));
    assert.equal(resolveMigrationConnections({ sourceConnectionId: "env5", targetConnectionIds: six.slice(0, 5).map((item) => item.id) }, six).targets.length, 5);
    assert.throws(() => resolveMigrationConnections({ ...config, targetConnectionIds: [] }, slots), /one and five/);
    assert.throws(() => resolveMigrationConnections({ ...config, targetConnectionIds: ["a", "b", "c", "d", "e", "f"] }, slots), /one and five/);
});

test("missing, duplicate, and same-environment connections are rejected", () => {
    assert.throws(() => resolveMigrationConnections({ ...config, sourceConnectionId: "missing" }, slots), /source/);
    assert.throws(() => resolveMigrationConnections({ ...config, sourceConnectionId: undefined }, slots), /source/);
    assert.throws(() => resolveMigrationConnections({ ...config, targetConnectionIds: ["missing"] }, slots), /unavailable/);
    assert.throws(() => resolveMigrationConnections({ ...config, targetConnectionIds: ["one", "one"] }, slots), /distinct/);
    assert.throws(() => resolveMigrationConnections({ ...config, targetConnectionIds: ["four"] }, slots), /different environments/);
    const aliases = [...slots, connection("alias", "HTTPS://FOUR.CRM.DYNAMICS.COM/")];
    assert.throws(() => resolveMigrationConnections({ ...config, targetConnectionIds: ["alias"] }, aliases), /different environments/);
    const duplicatedTarget = [...slots, connection("alias", slots[0].url)];
    assert.throws(() => resolveMigrationConnections({ ...config, targetConnectionIds: ["one", "alias"] }, duplicatedTarget), /only once/);
});

test("saved identities resolve after slot reordering, but a confirmed run rejects reassignment", () => {
    const reordered = [...slots];
    [reordered[0], reordered[5]] = [reordered[5], reordered[0]];
    assert.deepEqual(Array.from(resolveMigrationConnections(config, reordered).targets), [5, 0]);
    assert.throws(() => assertConnectionsUnchanged(config, slots, reordered), /assignments changed/);
    assert.throws(() => assertConnectionsUnchanged(config, slots, slots.map((item) => item?.id === "four" ? connection("four", "https://changed.crm.dynamics.com") : item)), /assignments changed/);
    assert.doesNotThrow(() => assertConnectionsUnchanged(config, slots, slots));
});

test("entity-set resolution and reads use the selected source slot, not primary", async () => {
    const calls = [];
    const { DataverseClient } = loadSource("utils/DataverseClient.ts", { dataverseAPI: {
        getEntityMetadata: async (...args) => { calls.push(args); return { EntitySetName: "accounts" }; },
        queryData: async (...args) => { calls.push(args); return { value: [{ accountid: "record" }] }; },
    } });
    await new DataverseClient(3).queryRecords("account", ["accountid"]);
    assert.equal(calls[0][3], 3);
    assert.equal(calls[1][1], 3);
    assert.equal(calls[1][0], "accounts?$select=accountid");
});

test("each destination engine has isolated system mappings and destination-scoped lookup metadata", async () => {
    const calls = [];
    const api = {
        getEntityMetadata: async (entity, _logical, fields, slot) => {
            calls.push({ operation: "metadata", entity, fields, slot });
            return { PrimaryIdAttribute: "accountid", PrimaryNameAttribute: "name", LogicalCollectionName: `users${slot}`, EntitySetName: entity === "systemuser" ? "systemusers" : "accounts" };
        },
        queryData: async (_query, slot) => ({ value: [{ systemuserid: `user${slot}`, fullname: "User", domainname: "user@example.com" }] }),
        retrieve: async () => null,
        create: async (_entity, data, slot) => { calls.push({ operation: "create", data, slot }); return { id: `created${slot}` }; },
    };
    const { MigrationEngine } = loadSource("utils/MigrationEngine.ts", { dataverseAPI: api });
    const migrationConfig = {
        entityLogicalName: "account", entityDisplayName: "Account", operations: ["create"], batchSize: 50,
        fieldMappings: [{ sourceField: "ownerid", targetField: "ownerid", isEnabled: true, fieldType: "Owner" }],
        lookupMappings: [{ fieldName: "ownerid", targetEntity: "systemuser", strategy: "auto" }],
    };
    const records = [{ data: { accountid: "record", name: "Account", _ownerid_value: "user3" } }];
    for (const target of [0, 5]) {
        const engine = new MigrationEngine(3, target);
        await engine.autoMapUsers();
        await engine.migrateRecords(migrationConfig, records, () => {});
    }
    const creates = calls.filter((call) => call.operation === "create");
    assert.equal(creates.length, 2);
    assert.equal(creates[0].slot, 0);
    assert.equal(creates[0].data["ownerid@odata.bind"], "/users0(user0)");
    assert.equal(creates[1].slot, 5);
    assert.equal(creates[1].data["ownerid@odata.bind"], "/users5(user5)");
    assert.ok(calls.filter((call) => call.fields?.includes("PrimaryIdAttribute")).every((call) => call.slot === 3));
    assert.deepEqual(calls.filter((call) => call.fields?.includes("LogicalCollectionName")).map((call) => call.slot), [0, 5]);
});

test("connection-change cancellation prevents a write after an in-flight read", async () => {
    const controller = new AbortController();
    let writes = 0;
    let progress;
    const { MigrationEngine } = loadSource("utils/MigrationEngine.ts", { dataverseAPI: {
        getEntityMetadata: async () => ({ PrimaryIdAttribute: "accountid", PrimaryNameAttribute: "name" }),
        retrieve: async () => {
            controller.abort(new Error("Connection assignment changed"));
            return null;
        },
        create: async () => { writes++; return { id: "created" }; },
    } });
    await assert.rejects(new MigrationEngine(0, 1).migrateRecords({
        entityLogicalName: "account", entityDisplayName: "Account", operations: ["create"], batchSize: 50,
        fieldMappings: [], lookupMappings: [],
    }, [{ data: { accountid: "one" } }, { data: { accountid: "two" } }], (next) => { progress = next; }, controller.signal), /Connection assignment changed/);
    assert.equal(writes, 0);
    assert.equal(progress.isInProgress, false);
    assert.equal(progress.processed, 1);
    assert.equal(progress.failed, 1);
});

test("connection-change cancellation stops remaining records after an already-started write", async () => {
    const controller = new AbortController();
    let writes = 0;
    let progress;
    const { MigrationEngine } = loadSource("utils/MigrationEngine.ts", { dataverseAPI: {
        getEntityMetadata: async () => ({ PrimaryIdAttribute: "accountid", PrimaryNameAttribute: "name" }),
        retrieve: async () => null,
        create: async () => {
            writes++;
            controller.abort(new Error("Connection assignment changed"));
            return { id: "created" };
        },
    } });
    await assert.rejects(new MigrationEngine(0, 1).migrateRecords({
        entityLogicalName: "account", entityDisplayName: "Account", operations: ["create"], batchSize: 50,
        fieldMappings: [], lookupMappings: [],
    }, [{ data: { accountid: "one" } }, { data: { accountid: "two" } }], (next) => { progress = next; }, controller.signal), /Connection assignment changed/);
    assert.equal(writes, 1);
    assert.equal(progress.isInProgress, false);
    assert.equal(progress.successful, 1);
});
