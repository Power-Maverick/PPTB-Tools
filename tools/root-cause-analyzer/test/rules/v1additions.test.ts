import { describe, expect, it } from "vitest";
import { activeCascades } from "../../src/engine/analyze";
import { buildSummary } from "../../src/engine/summary";
import type { Finding, RuleOutput } from "../../src/model/types";
import { parseChangeHistory } from "../../src/parse/changeHistory";
import { describePrivilegeProblem, parsePrivilegeError } from "../../src/parse/privilegeError";
import { runRules } from "../../src/rules";
import { computedRule } from "../../src/rules/computed";
import { configChangeRule } from "../../src/rules/configChange";
import { failureRule } from "../../src/rules/failure";
import { overwriteRule } from "../../src/rules/overwrite";
import { ownershipRule } from "../../src/rules/ownership";
import { performanceRule } from "../../src/rules/performance";
import { raceRule } from "../../src/rules/race";
import { ACCOUNT, ADDR_PRIMARY, asyncRow, at, auditRow, buildContext, INTEGRATION, syncStep, traceRow, USER } from "../fixtures/scenario";

const only = (out: RuleOutput[]) => out.filter((o): o is Finding => o.kind === "finding");
const SEC = 1000;
const HOUR = 3_600_000;
const trace = (id: string, t: number, extra: Partial<Parameters<typeof traceRow>[1]> = {}) => traceRow(id, { time: at(t), table: "account", correlation: `c-${id}`, block: ACCOUNT, ...extra });
const accountCtx = (extra: Partial<Parameters<typeof buildContext>[0]>) => buildContext({ target: { table: "account", id: ACCOUNT }, handlers: [syncStep()], audit: [], ...extra });

describe("automation changed", () => {
    it("failures that start right after a step was changed → high", () => {
        const step = syncStep({ modifiedon: at(HOUR), "_modifiedby_value@OData.Community.Display.V1.FormattedValue": "Alex Admin" });
        const ctx = accountCtx({ handlers: [step], traces: [trace("t1", 0), trace("t2", 2 * HOUR, { exception: "NullReferenceException" })] });
        const [f] = only(configChangeRule.run(ctx));
        expect(f).toMatchObject({ severity: "high", confidence: "medium", title: "Failures started after Plugin step 'Contoso.Plugins.AccountAddressSync: Update of account' was changed" });
        expect(f.explanation).toMatch(/by Alex Admin.*ran successfully 1 time\(s\) before the change and failed 1 time\(s\) after it/);
    });

    it("a step that stopped running after a change → medium", () => {
        const ctx = accountCtx({ handlers: [syncStep({ modifiedon: at(HOUR) })], traces: [trace("t1", 0)] });
        expect(only(configChangeRule.run(ctx))[0]).toMatchObject({ severity: "medium", title: expect.stringMatching(/stopped running after it was changed/) });
    });

    it("an assembly update is reported once with the steps that use it", () => {
        const a = { ...syncStep(), assembly: { id: "asm1", name: "Contoso.Plugins", version: "2.0.0.0", modifiedOn: at(HOUR) } };
        const b = { ...syncStep(), id: "step:other", name: "Other step", assembly: a.assembly };
        const [f] = only(configChangeRule.run(accountCtx({ handlers: [a, b] })));
        expect(f).toMatchObject({ severity: "info", title: "Plugin assembly 'Contoso.Plugins' (v2.0.0.0) was changed during this window" });
        expect(f.explanation).toMatch(/Steps using it: .*Other step/);
    });

    it("changes outside the window and turned-off automation are ignored", () => {
        expect(only(configChangeRule.run(accountCtx({ handlers: [syncStep({ modifiedon: at(-48 * HOUR) })] })))).toEqual([]);
        expect(only(configChangeRule.run(accountCtx({ handlers: [syncStep({ modifiedon: at(HOUR), statecode: 1 })] })))).toEqual([]);
    });
});

describe("performance and limits", () => {
    it("timeouts, near-limit and slow synchronous plugins", () => {
        const ctx = accountCtx({
            traces: [
                trace("slow", 0, { duration: 15_000 }),
                trace("near", HOUR, { duration: 100_000 }),
                trace("out", 2 * HOUR, { duration: 120_000, exception: "The plug-in execution failed because the operation has timed out at the Sandbox Host." }),
            ],
        });
        const out = only(performanceRule.run(ctx));
        expect(out.map((f) => f.id.split(":")[1]).sort()).toEqual(["near-limit", "slow", "timeout"]);
        expect(out.find((f) => f.id.includes("timeout"))).toMatchObject({ severity: "high", explanation: expect.stringMatching(/stopped after 2 minutes/) });
        expect(out.find((f) => f.id.includes("near-limit"))!.explanation).toMatch(/up to 100s/);
    });

    it("throttling (service protection limits)", () => {
        const job = asyncRow("j1", { time: at(0), statecode: 3, statuscode: 31, regarding: ACCOUNT, regardingTable: "account", name: "ERP sync", message: "Number of requests exceeded the limit of 6000 over time window of 300 seconds. 0x80072322" });
        const [f] = only(performanceRule.run(accountCtx({ handlers: [], asyncJobs: [job] })));
        expect(f).toMatchObject({ severity: "high", title: "ERP sync hit Dataverse service protection limits once" });
    });

    it("says when durations can't be checked", () => {
        const ctx = accountCtx({ sources: { ...buildContext({ target: { table: "account", id: ACCOUNT }, handlers: [], audit: [] }).sources, "history.traceSuccess": { available: false, reason: "plugin trace log is set to Exception" } } });
        expect(performanceRule.run(ctx)).toContainEqual(expect.objectContaining({ kind: "unavailable", reason: expect.stringMatching(/Exception.*still checked/) }));
    });
});

describe("permission errors", () => {
    const missing = "Principal user (Id=11111111-0000-4000-8000-000000000001, type=8, roleCount=1, privilegeCount=200, accessMode=0), is missing prvWriteAccount privilege (Id=abc) on OTC=1 for entity 'account'. context.Caller=…";
    const record = "SecLib::AccessCheckEx failed. Returned hr = -2147187962, ObjectID: x, OwnerId: y, OwnerIdType: 8 and CallingUser: 11111111-0000-4000-8000-000000000001. ObjectTypeCode: 1, objectBusinessUnitId: z, AccessRights: WriteAccess";

    it("parses both shapes", () => {
        expect(parsePrivilegeError(missing)).toEqual({ kind: "missing-privilege", privilege: "prvWriteAccount", access: "Write", table: "account", userId: USER });
        expect(parsePrivilegeError(record)).toEqual({ kind: "record-access", access: "Write", userId: USER });
        expect(parsePrivilegeError("is missing prvAppendTocr_address privilege")).toMatchObject({ access: "Append To", table: "cr_address" });
        expect(parsePrivilegeError("boom")).toBeUndefined();
        expect(describePrivilegeProblem(parsePrivilegeError(missing)!, "Dana Field")).toBe("Dana Field is missing Write permission on account (prvWriteAccount). An admin can add it to one of their security roles.");
    });

    it("failure findings explain the missing permission, naming the user", () => {
        const audit = [{ row: auditRow("account", ACCOUNT, USER, at(0)), changes: [{ column: "address1_line1", oldValue: "a", newValue: "b" }] }];
        const [f] = only(failureRule.run(accountCtx({ audit, traces: [trace("t1", -100, { exception: missing })] })));
        expect(f.title).toBe("Plugin Plugins.AccountAddressSync failed — missing Write permission on account");
        expect(f.explanation).toMatch(/Cause: Dana Field is missing Write permission on account/);
    });
});

describe("ownership and access", () => {
    const assign = (table: string, id: string, t: number) => ({
        row: { ...auditRow(table, id, INTEGRATION, at(t), 13), "action@OData.Community.Display.V1.FormattedValue": "Assign" },
        changes: [{ column: "ownerid", oldValue: "Dana Field", newValue: "ERP Integration" }],
    });

    it("owner change followed by an access error → medium, with the error", () => {
        const err = "SecLib::AccessCheckEx failed. CallingUser: 11111111-0000-4000-8000-000000000001. AccessRights: WriteAccess";
        const ctx = accountCtx({ audit: [assign("account", ACCOUNT, 0)], traces: [trace("t1", HOUR, { exception: err })] });
        const [f] = only(ownershipRule.run(ctx));
        expect(f).toMatchObject({ severity: "medium", title: "Owner of account aaaaaaaa… changed from 'Dana Field' to 'ERP Integration'" });
        expect(f.explanation).toMatch(/Access errors followed \(1\)/);
    });

    it("a cascaded assign is attributed to the parent's assign", () => {
        const ctx = buildContext({
            target: { table: "account", id: ACCOUNT },
            handlers: [],
            audit: [assign("account", ACCOUNT, 0), assign("cr_address", ADDR_PRIMARY, 400)],
            scope: [
                { table: "account", id: ACCOUNT },
                { table: "cr_address", id: ADDR_PRIMARY, hop: 1 },
            ],
            cascades: [{ parent: "account", child: "cr_address", lookup: "cr_accountid", relationship: "cr_account_cr_address", behaviours: { Assign: "Cascade" } }],
        });
        const link = ctx.timeline.links.find((l) => l.reason.startsWith("cascaded"));
        expect(link).toMatchObject({ kind: "stitched", confidence: "medium" });
        const child = only(ownershipRule.run(ctx)).find((f) => f.title.startsWith("Owner of cr_address"))!;
        expect(child.explanation).toMatch(/cascaded from a change to a parent record/);
    });

    it("share details from change history", () => {
        const parsed = parseChangeHistory({
            AuditDetailCollection: {
                AuditDetails: [{ AuditRecord: { auditid: "S1" }, Principal: { "@odata.type": "#Microsoft.Dynamics.CRM.team", teamid: "abcdef12-0000-4000-8000-000000000000" }, OldPrivileges: "None", NewPrivileges: "ReadAccess, WriteAccess" }],
            },
        });
        expect(parsed.byAuditId.get("s1")).toEqual([{ column: "access for team abcdef12", oldValue: undefined, newValue: "ReadAccess, WriteAccess" }]);
    });
});

describe("race conditions", () => {
    const write = (user: string, t: number, value: string) => ({ row: auditRow("account", ACCOUNT, user, at(t)), changes: [{ column: "address1_line1", oldValue: "x", newValue: value }] });

    it("two independent writers on the same column seconds apart → race, not overwrite", () => {
        const ctx = buildContext({ target: { table: "account", id: ACCOUNT, column: "address1_line1" }, handlers: [], audit: [write(USER, 0, "A"), write(INTEGRATION, 2 * SEC, "B")] });
        const [f] = only(raceRule.run(ctx));
        expect(f).toMatchObject({ severity: "high", confidence: "high", title: "Dana Field and ERP Integration changed address1_line1 on account aaaaaaaa… 2s apart" });
        expect(f.explanation).toMatch(/Dana Field wrote 'A', then ERP Integration wrote 'B'.*last write/);
        expect(only(overwriteRule.run(ctx))).toEqual([]);
    });

    it("writes further apart than the race window are an overwrite, not a race", () => {
        const ctx = buildContext({ target: { table: "account", id: ACCOUNT }, handlers: [], audit: [write(USER, 0, "A"), write(INTEGRATION, 60 * SEC, "B")] });
        expect(only(raceRule.run(ctx))).toEqual([]);
        expect(only(overwriteRule.run(ctx))).toHaveLength(1);
    });

    it("overlapping system jobs and concurrency errors", () => {
        const jobs = [
            { ...asyncRow("j1", { time: at(0), statecode: 3, statuscode: 30, regarding: ACCOUNT, regardingTable: "account", name: "Sync A" }), completedon: at(30 * SEC), _owningextensionid_value: "aaaaaaaa-0000-4000-8000-0000000000a1" },
            { ...asyncRow("j2", { time: at(10 * SEC), statecode: 3, statuscode: 31, regarding: ACCOUNT, regardingTable: "account", name: "Sync B", message: "Transaction (Process ID 72) was deadlocked on lock resources" }), completedon: at(20 * SEC), _owningextensionid_value: "aaaaaaaa-0000-4000-8000-0000000000a2" },
        ];
        const out = only(raceRule.run(accountCtx({ handlers: [], asyncJobs: jobs })));
        expect(out.find((f) => f.id.startsWith("race:jobs"))).toMatchObject({ title: "2 system jobs ran on account aaaaaaaa… at the same time" });
        expect(out.find((f) => f.id === "race:errors")).toMatchObject({ severity: "high" });
    });
});

describe("computed columns", () => {
    it("explains why a rollup column has no history", () => {
        const ctx = buildContext({ target: { table: "account", id: ACCOUNT, column: "cr_totalorders" }, handlers: [], audit: [], computed: [{ table: "account", column: "cr_totalorders", kind: "rollup" }] });
        expect(only(computedRule.run(ctx))[0]).toMatchObject({ severity: "info", title: "cr_totalorders is a rollup column, so it has no change history of its own" });
        expect(only(computedRule.run(buildContext({ target: { table: "account", id: ACCOUNT, column: "name" }, handlers: [], audit: [] })))).toEqual([]);
    });

    it("cascade configuration keeps only behaviours that cascade", () => {
        expect(activeCascades({ Assign: "Cascade", Delete: "RemoveLink", Share: "UserOwned", Merge: "NoCascade", "@odata.type": "x" })).toEqual({ Assign: "Cascade", Share: "UserOwned" });
        expect(activeCascades({ Assign: "NoCascade" })).toBeUndefined();
    });
});

describe("incident summary", () => {
    it("lists the record, window, findings and what couldn't be checked", () => {
        const ctx = buildContext({ target: { table: "account", id: ACCOUNT, column: "address1_line1" }, handlers: [], audit: [{ row: auditRow("account", ACCOUNT, USER, at(0)), changes: [{ column: "address1_line1", oldValue: "x", newValue: "A" }] }, { row: auditRow("account", ACCOUNT, INTEGRATION, at(2 * SEC)), changes: [{ column: "address1_line1", oldValue: "x", newValue: "B" }] }] });
        const findings = runRules({ ...ctx, sources: { ...ctx.sources, "history.async": { available: false, reason: "no read access to asyncoperation" } } });
        const text = buildSummary({ input: ctx.input, timeline: ctx.timeline, wiring: ctx.wiring, findings, children: [], steps: [], done: true }, { environment: "Contoso Prod", generatedAt: new Date("2026-10-10T00:00:00Z") });
        expect(text).toMatch(/^# Root cause analysis: account /);
        expect(text).toContain("- **Environment:** Contoso Prod");
        expect(text).toContain("- **Column of interest:** address1_line1");
        expect(text).toMatch(/1\. \*\*\[High · high confidence\] Dana Field and ERP Integration changed address1_line1/);
        expect(text).toMatch(/## Couldn't check\n\n- System job failures: no read access to asyncoperation\n- Stuck system jobs: no read access to asyncoperation/);
        expect(text).toContain("Stitched links are inferred");
    });
});
