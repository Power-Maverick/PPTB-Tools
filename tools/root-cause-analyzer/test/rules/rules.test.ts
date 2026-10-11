import { describe, expect, it } from "vitest";
import type { ChildSet, Finding, RuleOutput } from "../../src/model/types";
import { duplicatesRule, discriminators } from "../../src/rules/duplicates";
import { expectedMissingRule } from "../../src/rules/expectedMissing";
import { failureRule } from "../../src/rules/failure";
import { loopRule } from "../../src/rules/loop";
import { overwriteRule } from "../../src/rules/overwrite";
import { stuckAsyncRule } from "../../src/rules/stuckAsync";
import {
    ACCOUNT,
    ADDR_BILLING,
    ADDR_PRIMARY,
    addressFlow,
    allSources,
    asyncRow,
    at,
    auditRow,
    buildContext,
    FLOW_OWNER,
    flowRunRow,
    INTEGRATION,
    syncStep,
    traceRow,
    USER,
} from "../fixtures/scenario";

const only = (out: RuleOutput[]) => out.filter((o): o is Finding => o.kind === "finding");
const SEC = 1000;
const HOUR = 3_600_000;

describe("overwrite", () => {
    const change = (user: string, t: number, oldValue: string, newValue: string, column = "cr_line1") => ({
        row: auditRow("cr_address", ADDR_PRIMARY, user, at(t)),
        changes: [{ column, oldValue, newValue }],
    });
    const run = (audit: ReturnType<typeof change>[], column?: string) => overwriteRule.run(buildContext({ target: { table: "cr_address", id: ADDR_PRIMARY, column }, handlers: [], audit }));

    it("flags a different actor replacing a value", () => {
        const [f] = only(run([change(USER, 0, "a", "b"), change(INTEGRATION, HOUR, "b", "c")]));
        expect(f).toMatchObject({ severity: "high", confidence: "high" });
    });

    it("ignores the same actor editing twice", () => {
        expect(only(run([change(USER, 0, "a", "b"), change(USER, HOUR, "b", "c")]))).toEqual([]);
    });

    it("ignores changes further apart than the window (24h)", () => {
        expect(only(run([change(USER, 0, "a", "b"), change(INTEGRATION, 25 * HOUR, "b", "c")]))).toEqual([]);
    });

    it("ignores a second write of the same value", () => {
        expect(only(run([change(USER, 0, "a", "b"), change(INTEGRATION, HOUR, "b", "b")]))).toEqual([]);
    });

    it("respects the column of interest", () => {
        const audit = [change(USER, 0, "a", "b", "cr_city"), change(INTEGRATION, HOUR, "b", "c", "cr_city")];
        expect(only(run(audit, "cr_line1"))).toEqual([]);
        expect(only(run(audit, "cr_city"))).toHaveLength(1);
    });

    it("without old/new values, falls back to changed columns and says so", () => {
        const a = auditRow("cr_address", ADDR_PRIMARY, USER, at(0));
        const b = auditRow("cr_address", ADDR_PRIMARY, INTEGRATION, at(HOUR));
        const ctx = buildContext({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [], audit: [{ row: a }, { row: b }] });
        ctx.timeline.events.forEach((e) => (e.changedColumns = ["cr_line1"]));
        const out = overwriteRule.run(ctx);
        expect(only(out)[0]).toMatchObject({ confidence: "medium", explanation: expect.stringMatching(/based on which columns changed/) });
        expect(out.some((o) => o.kind === "unavailable" && o.title === "Old → new values")).toBe(true);
    });

    it("is Unavailable without audit", () => {
        const ctx = buildContext({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [], audit: [], sources: { ...allSources(), "history.audit": { available: false, reason: "auditing is off for the environment" } } });
        expect(overwriteRule.run(ctx)).toEqual([expect.objectContaining({ kind: "unavailable", reason: "Unavailable — auditing is off for the environment" })]);
    });
});

describe("expected but missing", () => {
    const edit = (column: string, t = 0) => ({ row: auditRow("cr_address", ADDR_PRIMARY, USER, at(t)), changes: [{ column, oldValue: "x", newValue: "y" }] });
    const ctxWith = (opts: Parameters<typeof buildContext>[0]) => buildContext(opts);

    it("a change its column filter excludes is not a finding (working as designed)", () => {
        // Regression: editing other columns while the step filters on cr_line1 / cr_city produced a false positive.
        expect(expectedMissingRule.run(ctxWith({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [addressFlow()], audit: [edit("cr_notes"), edit("cr_demo", 30_000)] }))).toEqual([]);
    });

    it("regression: never says a filtered step didn't run when the trace shows it did", () => {
        // Step filtered on address1_city; the audit row only shows address1_line1 (e.g. set by a pre-op plugin,
        // or address1_city sent unchanged) — but the plugin's trace row proves it ran.
        const step = syncStep({ filteringattributes: "address1_city" });
        const audit = [{ row: auditRow("account", ACCOUNT, USER, at(0)), changes: [{ column: "address1_line1", oldValue: "a", newValue: "b" }] }];
        const traces = [traceRow("t1", { time: at(-50), table: "account", correlation: "c1", block: `Score for ${ACCOUNT}` })];
        const ctx = ctxWith({ target: { table: "account", id: ACCOUNT, column: "address1_line1" }, handlers: [step], audit, traces });
        expect(ctx.timeline.events.some((e) => e.source === "trace")).toBe(true);
        expect(expectedMissingRule.run(ctx)).toEqual([]);
    });

    it("an enabled flow with no run → missing, with the flowrun caveat", () => {
        const [f] = only(expectedMissingRule.run(ctxWith({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [addressFlow()], audit: [edit("cr_line1")] })));
        expect(f).toMatchObject({ severity: "medium", confidence: "medium", title: "Cloud flow 'Address – validate & sync' didn't run" });
        expect(f.explanation).toMatch(/only lists solution-aware flows/);
    });

    it("mentions trigger conditions and lowers confidence", () => {
        const flow = addressFlow({ condition: "@equals(triggerOutputs()?['body/cr_type'], 1)" });
        const [f] = only(expectedMissingRule.run(ctxWith({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [flow], audit: [edit("cr_line1")] })));
        expect(f).toMatchObject({ confidence: "low" });
        expect(f.explanation).toMatch(/trigger conditions .*@equals/);
    });

    it("a flow that ran produces nothing", () => {
        const ctx = ctxWith({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [addressFlow()], audit: [edit("cr_line1")], flowRuns: [flowRunRow("f1", at(10 * SEC), at(20 * SEC))] });
        expect(only(expectedMissingRule.run(ctx))).toEqual([]);
    });

    it("sync plugin on Exception-only tracing → Unavailable, not a false 'didn't run'", () => {
        const audit = [{ row: auditRow("account", ACCOUNT, INTEGRATION, at(0)), changes: [{ column: "address1_line1", oldValue: "a", newValue: "b" }] }];
        const sources = { ...allSources(), "history.traceSuccess": { available: false, reason: "plugin trace log is set to Exception" } };
        const out = expectedMissingRule.run(ctxWith({ target: { table: "account", id: ACCOUNT }, handlers: [syncStep()], audit, sources }));
        expect(out).toEqual([expect.objectContaining({ kind: "unavailable", reason: expect.stringMatching(/Exception/) })]);
    });

    it("sync plugin that ran (trace row) produces nothing; one that didn't is reported", () => {
        const audit = [{ row: auditRow("account", ACCOUNT, INTEGRATION, at(0)), changes: [{ column: "address1_line1", oldValue: "a", newValue: "b" }] }];
        const ran = ctxWith({ target: { table: "account", id: ACCOUNT }, handlers: [syncStep()], audit, traces: [traceRow("t1", { time: at(-200), table: "account", correlation: "c1", block: ACCOUNT })] });
        expect(only(expectedMissingRule.run(ran))).toEqual([]);
        const didnt = ctxWith({ target: { table: "account", id: ACCOUNT }, handlers: [syncStep()], audit });
        expect(only(expectedMissingRule.run(didnt))[0].title).toBe("Plugin step 'Contoso.Plugins.AccountAddressSync: Update of account' didn't run");
    });

    it("a run that can't be told apart from runs for other records → Unavailable", () => {
        const audit = [{ row: auditRow("account", ACCOUNT, INTEGRATION, at(0)), changes: [{ column: "address1_line1", oldValue: "a", newValue: "b" }] }];
        // 4 simultaneous requests (bulk upsert) with no record ID in the output → not linked
        const traces = [1, 2, 3, 4].map((n) => traceRow(`t${n}`, { time: at(-100 * n), table: "account", correlation: `c${n}` }));
        const out = expectedMissingRule.run(ctxWith({ target: { table: "account", id: ACCOUNT }, handlers: [syncStep()], audit, traces }));
        expect(out).toEqual([expect.objectContaining({ kind: "unavailable", reason: expect.stringMatching(/couldn't be told apart/) })]);
    });

    it("business rules can never be verified → Unavailable", () => {
        const rule = { ...addressFlow(), id: "wf:rule", kind: "businessrule" as const, name: "Require city", filteringColumns: undefined, messages: ["Update"] };
        const out = expectedMissingRule.run(ctxWith({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [rule], audit: [edit("cr_line1")] }));
        expect(out).toEqual([expect.objectContaining({ kind: "unavailable", reason: "Unavailable — business rules leave no execution history" })]);
    });
});

describe("failure", () => {
    it("a sync plugin exception is critical, with the error excerpt and the triggering change", () => {
        const audit = [{ row: auditRow("account", ACCOUNT, INTEGRATION, at(0)), changes: [{ column: "address1_line1", oldValue: "a", newValue: "b" }] }];
        const traces = [traceRow("t1", { time: at(-200), table: "account", correlation: "c1", block: ACCOUNT, exception: "System.NullReferenceException: Object reference not set\n   at Contoso..." })];
        const [f] = only(failureRule.run(buildContext({ target: { table: "account", id: ACCOUNT }, handlers: [syncStep()], audit, traces })));
        expect(f).toMatchObject({ severity: "critical", title: "Plugin Plugins.AccountAddressSync failed" });
        expect(f.explanation).toMatch(/rolled back/);
        expect(f.explanation).toMatch(/NullReferenceException/);
        expect(f.explanation).toMatch(/It ran because of Update of account/);
    });

    it("groups repeated identical errors", () => {
        const jobs = [1, 2, 3].map((n) => asyncRow(`j${n}`, { time: at(n * HOUR), statecode: 3, statuscode: 31, regarding: ADDR_PRIMARY, regardingTable: "cr_address", name: "Geo lookup", message: `Timeout calling geo service (request ${n})` }));
        const out = only(failureRule.run(buildContext({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [], audit: [], asyncJobs: jobs })));
        expect(out).toHaveLength(3); // different text after normalisation → separate
        const same = [1, 2].map((n) => asyncRow(`k${n}`, { time: at(n * HOUR), statecode: 3, statuscode: 31, regarding: ADDR_PRIMARY, regardingTable: "cr_address", name: "Geo lookup", message: "Timeout calling geo service" }));
        expect(only(failureRule.run(buildContext({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [], audit: [], asyncJobs: same })))[0].title).toBe("System job 'Geo lookup' failed 2 times");
    });

    it("reports which failure sources are unavailable", () => {
        const sources = { ...allSources(), "history.trace": { available: false, reason: "plugin trace log is Off" } };
        const out = failureRule.run(buildContext({ target: { table: "account", id: ACCOUNT }, handlers: [], audit: [], sources }));
        expect(out).toContainEqual(expect.objectContaining({ kind: "unavailable", title: "Plugin failures", reason: "Unavailable — plugin trace log is Off" }));
    });
});

describe("loop / depth", () => {
    it("a wiring cycle that ran is reported (flow → account → plugin → address → flow)", () => {
        // The plugin's write to cr_address is inferred from history (no declared writes for plugins).
        const audit = [
            { row: auditRow("cr_address", ADDR_PRIMARY, USER, at(0)), changes: [{ column: "cr_line1", oldValue: "a", newValue: "b" }] },
            { row: auditRow("account", ACCOUNT, FLOW_OWNER, at(25 * SEC)), changes: [{ column: "address1_line1", oldValue: "a", newValue: "b" }] },
            { row: auditRow("cr_address", ADDR_PRIMARY, FLOW_OWNER, at(25 * SEC + 300)), changes: [{ column: "cr_line1", oldValue: "b", newValue: "B" }] },
        ];
        const traces = [traceRow("t1", { time: at(25 * SEC - 100), table: "account", correlation: "c1", duration: 600, block: ACCOUNT })];
        const ctx = buildContext({
            target: { table: "cr_address", id: ADDR_PRIMARY },
            handlers: [addressFlow(), syncStep()],
            audit,
            traces,
            flowRuns: [flowRunRow("f1", at(10 * SEC), at(40 * SEC))],
            scope: [
                { table: "cr_address", id: ADDR_PRIMARY },
                { table: "account", id: ACCOUNT, hop: 1 },
            ],
        });
        expect(ctx.wiring.cycles.length).toBe(1);
        const [f] = only(loopRule.run(ctx)).filter((x) => x.id.startsWith("loop:cycle"));
        expect(f).toMatchObject({ severity: "high", title: expect.stringMatching(/^Automation loop: /) });
        expect(f.evidence.filter((e) => e.kind === "handler")).toHaveLength(2);
    });

    it("depth growth and the platform's loop protection", () => {
        const traces = [1, 2, 3, 4, 5].map((d) => traceRow(`t${d}`, { time: at(d * 100), table: "account", depth: d, correlation: "c1", block: ACCOUNT, exception: d === 5 ? "This workflow job was canceled because the workflow that started it included an infinite loop." : "" }));
        const out = only(loopRule.run(buildContext({ target: { table: "account", id: ACCOUNT }, handlers: [], audit: [], traces })));
        expect(out.find((f) => f.id.startsWith("loop:depth"))).toMatchObject({ severity: "medium", title: "One request went 5 levels deep" });
        expect(out.find((f) => f.id === "loop:platform")).toMatchObject({ severity: "high" });
    });

    it("the same automation repeating on one record", () => {
        const runs = [0, 2, 4].map((m) => flowRunRow(`f${m}`, at(m * 60 * SEC + 5 * SEC), at(m * 60 * SEC + 9 * SEC)));
        const audit = [0, 2, 4].map((m) => ({ row: auditRow("cr_address", ADDR_PRIMARY, m === 0 ? USER : FLOW_OWNER, at(m * 60 * SEC)), changes: [{ column: "cr_line1", oldValue: `${m}`, newValue: `${m + 1}` }] }));
        const out = only(loopRule.run(buildContext({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [addressFlow()], audit, flowRuns: runs })));
        expect(out.find((f) => f.id.startsWith("loop:repeat"))).toMatchObject({ title: "'Address – validate & sync' ran 3 times on the same record" });
    });
});

describe("duplicate side effects", () => {
    const set = (types: Array<[string, number, string]>, extraColumns: string[] = []): ChildSet => ({
        parent: { table: "account", id: ACCOUNT },
        table: "cr_address",
        lookup: "cr_accountid",
        relationship: "cr_account_cr_address",
        choiceColumns: ["cr_addresstype", "statuscode", ...extraColumns],
        records: types.map(([id, raw, label], i) => ({ id, name: `Address ${i}`, createdOn: at(i * HOUR), values: { cr_addresstype: { raw, label }, statuscode: { raw: 1, label: "Active" } } })),
    });
    const run = (children: ChildSet[], discriminator = "") => {
        const ctx = buildContext({ target: { table: "account", id: ACCOUNT }, handlers: [], audit: [], children, scope: [{ table: "account", id: ACCOUNT, name: "Contoso Ltd" }] });
        ctx.settings = { ...ctx.settings, duplicateDiscriminator: discriminator };
        return only(duplicatesRule.run(ctx));
    };

    it("two Primary addresses for one account → high", () => {
        const [f] = run([set([[ADDR_PRIMARY, 1, "Primary"], [ADDR_BILLING, 2, "Billing"], ["bbbbbbbb-0000-4000-8000-000000000003", 1, "Primary"]])]);
        expect(f).toMatchObject({ severity: "high", confidence: "medium", title: "2 active cr_address records with cr_addresstype = Primary under account 'Contoso Ltd'" });
        expect(f.evidence.filter((e) => e.kind === "record")).toHaveLength(2);
    });

    it("never groups on status columns, and nothing when every value is unique", () => {
        expect(run([set([[ADDR_PRIMARY, 1, "Primary"], [ADDR_BILLING, 2, "Billing"]])])).toEqual([]);
    });

    it("uses the configured discriminator with high confidence", () => {
        expect(discriminators(set([]), "cr_addresstype")).toEqual(["cr_addresstype"]);
        const [f] = run([set([[ADDR_PRIMARY, 2, "Billing"], [ADDR_BILLING, 2, "Billing"]])], "cr_addresstype");
        expect(f).toMatchObject({ confidence: "high", severity: "high" });
    });
});

describe("stuck async", () => {
    const job = (statecode: number, statuscode: number, hoursAgo: number) =>
        asyncRow("j1", { time: at(30 * HOUR - hoursAgo * HOUR), statecode, statuscode, regarding: ADDR_PRIMARY, regardingTable: "cr_address", name: "Geo lookup" });
    const run = (row: Record<string, unknown>) => only(stuckAsyncRule.run(buildContext({ target: { table: "cr_address", id: ADDR_PRIMARY }, handlers: [], audit: [], asyncJobs: [row] })));

    it("waiting longer than 30 minutes → medium", () => {
        expect(run(job(0, 10, 2))[0]).toMatchObject({ severity: "medium", title: "System job 'Geo lookup' has been still waiting for 2 h" });
    });
    it("recent jobs aren't stuck", () => {
        expect(run(job(0, 10, 0.1))).toEqual([]);
    });
    it("suspended or older than a day → high", () => {
        expect(run(job(1, 10, 1))[0].severity).toBe("high");
        expect(run(job(2, 20, 30))[0].severity).toBe("high");
    });
});
