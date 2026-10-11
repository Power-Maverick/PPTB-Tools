/**
 * Acceptance criterion: "No Dataverse write calls exist in the codebase."
 * These tests fail the build if any write path becomes reachable.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED_FUNCTIONS, createReadOnlyDataverse, type DataverseReadSurface } from "../../src/host/readOnlyDataverse";

const SRC = join(__dirname, "../../src");
const HOST_BOUNDARY = "host/readOnlyDataverse.ts";

function sourceFiles(dir = SRC): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return sourceFiles(full);
        return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [full] : [];
    });
}

const files = sourceFiles().map((path) => ({ path: relative(SRC, path).replace(/\\/g, "/"), text: stripComments(readFileSync(path, "utf8")) }));

function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Dataverse API methods that write data or change configuration. */
const WRITE_METHODS = [
    "create",
    "update",
    "delete",
    "upsert",
    "createMultiple",
    "updateMultiple",
    "associate",
    "disassociate",
    "deploySolution",
    "publishCustomizations",
    "createEntityDefinition",
    "updateEntityDefinition",
    "deleteEntityDefinition",
    "createAttribute",
    "updateAttribute",
    "deleteAttribute",
    "createPolymorphicLookupAttribute",
    "createRelationship",
    "updateRelationship",
    "deleteRelationship",
    "createGlobalOptionSet",
    "updateGlobalOptionSet",
    "deleteGlobalOptionSet",
    "insertOptionValue",
    "updateOptionValue",
    "deleteOptionValue",
    "orderOption",
    "batch",
];

const READ_METHODS = ["fetchXmlQuery", "queryData", "retrieve", "execute", "getEntityMetadata", "getEntityRelatedMetadata", "getAllEntitiesMetadata"];

describe("read-only guard (static)", () => {
    it("finds source files to scan", () => {
        expect(files.length).toBeGreaterThan(5);
        expect(files.some((f) => f.path === HOST_BOUNDARY)).toBe(true);
    });

    it("only the host boundary touches window.dataverseAPI", () => {
        const offenders = files.filter((f) => f.path !== HOST_BOUNDARY && /\bdataverseAPI\b/.test(f.text)).map((f) => f.path);
        expect(offenders).toEqual([]);
    });

    it("only src/host may touch powerplatformAPI or make raw HTTP calls", () => {
        const offenders = files
            .filter((f) => !f.path.startsWith("host/") && /\bpowerplatformAPI\b|\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(f.text))
            .map((f) => f.path);
        expect(offenders).toEqual([]);
    });

    it("the host boundary calls only read methods on the API", () => {
        const boundary = files.find((f) => f.path === HOST_BOUNDARY)!;
        const called = [...boundary.text.matchAll(/\bapi\.(\w+)/g)].map((m) => m[1]);
        expect(called.length).toBeGreaterThan(0);
        expect(called.filter((m) => !READ_METHODS.includes(m))).toEqual([]);
    });

    it("no source file names a Dataverse write method on an API object", () => {
        const pattern = new RegExp(`\\b(dataverseAPI|api|dv|client)\\s*\\.\\s*(${WRITE_METHODS.join("|")})\\b`);
        const offenders = files.filter((f) => pattern.test(f.text)).map((f) => `${f.path}: ${pattern.exec(f.text)![0]}`);
        expect(offenders).toEqual([]);
    });

    it("no source file names a write-only Dataverse API method at all", () => {
        const unique = WRITE_METHODS.filter((m) => !["create", "update", "delete", "upsert", "batch"].includes(m));
        const pattern = new RegExp(`\\.\\s*(${unique.join("|")})\\s*\\(`);
        const offenders = files.filter((f) => pattern.test(f.text)).map((f) => f.path);
        expect(offenders).toEqual([]);
    });

    it("never executes Web API actions (POST) and never issues mutating Power Platform calls", () => {
        const offenders = files
            .filter((f) => /operationType\s*:\s*["']action["']/.test(f.text) || /\.\s*(Post|Put|Patch|Delete)\s*\(/.test(f.text))
            .map((f) => f.path);
        expect(offenders).toEqual([]);
    });
});

describe("read-only guard (runtime)", () => {
    function recordingApi() {
        const calls: string[] = [];
        const api = new Proxy({} as Record<string, unknown>, {
            get: (_, prop: string) => {
                return (...args: unknown[]) => {
                    calls.push(prop);
                    if (prop === "execute") calls.push(`execute:${(args[0] as { operationType: string }).operationType}`);
                    return Promise.resolve(prop === "getEntityRelatedMetadata" || prop === "getAllEntitiesMetadata" ? { value: [] } : { value: [] });
                };
            },
        });
        return { api: api as unknown as DataverseReadSurface, calls };
    }

    it("exposes no write methods and cannot be extended", () => {
        const { api } = recordingApi();
        const dv = createReadOnlyDataverse(api);
        for (const method of WRITE_METHODS) expect(method in dv).toBe(false);
        expect(Object.isFrozen(dv)).toBe(true);
    });

    it("exercising every wrapper method only reaches read methods, and functions only as GET", async () => {
        const { api, calls } = recordingApi();
        const dv = createReadOnlyDataverse(api);
        await dv.fetchXml("<fetch />");
        await dv.query("organizations");
        await dv.retrieve("account", "00000000-0000-0000-0000-000000000001");
        await dv.entityMetadata("account");
        await dv.entityAttributes("account");
        await dv.entityPrivileges("account");
        await dv.entityRelationships("account", "OneToManyRelationships");
        await dv.allEntities();
        for (const name of ALLOWED_FUNCTIONS) await dv.callFunction({ name });

        const methods = calls.filter((c) => !c.startsWith("execute:"));
        expect(methods.filter((m) => !READ_METHODS.includes(m))).toEqual([]);
        expect(calls.filter((c) => c.startsWith("execute:"))).toEqual(ALLOWED_FUNCTIONS.map(() => "execute:function"));
    });

    it("rejects functions that are not on the allowlist", async () => {
        const { api, calls } = recordingApi();
        const dv = createReadOnlyDataverse(api);
        // @ts-expect-error — deliberately calling something not allowed
        await expect(dv.callFunction({ name: "SetState" })).rejects.toThrow(/allowlist/);
        expect(calls).toEqual([]);
    });

    it("the allowlist contains no known actions", () => {
        expect(ALLOWED_FUNCTIONS.every((n) => /^(WhoAmI|Retrieve)/.test(n))).toBe(true);
    });
});
