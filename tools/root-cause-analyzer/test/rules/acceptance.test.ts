/**
 * Acceptance criteria from the brief, on fixture data shaped like real Web API rows.
 */
import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/model/types";
import { runRules } from "../../src/rules";
import { ACCOUNT, ADDR_PRIMARY, addressFlow, at, auditRow, buildContext, overwriteScenario, syncStep, USER } from "../fixtures/scenario";

const findings = (ctx: ReturnType<typeof buildContext>) => runRules(ctx).filter((o): o is Finding => o.kind === "finding");

describe("motivating example: user's address edit overwritten by the next integration upsert", () => {
    const ctx = buildContext(overwriteScenario());

    it("shows the full chain on the timeline", () => {
        const ops = ctx.timeline.events.map((e) => `${e.source}:${e.table}`);
        expect(ops).toEqual([
            "audit:cr_address", // user edit
            "flowrun:cr_address", // address flow
            "audit:cr_address", // flow sets geo
            "trace:account", // sync plugin (from the flow's account update)
            "audit:account", // flow pushes address to account
            "trace:account", // sync plugin (integration upsert)
            "audit:account", // integration upsert
            "audit:cr_address", // plugin copies the old address back
        ]);
        // the overwrite is nested: integration upsert → plugin → address update
        const overwrite = ctx.timeline.events[7];
        const plugin = ctx.timeline.events[5];
        const upsert = ctx.timeline.events[6];
        expect(ctx.timeline.parentOf[overwrite.id]).toBe(plugin.id);
        expect(ctx.timeline.parentOf[plugin.id]).toBe(upsert.id);
    });

    it("never presents stitched links as exact", () => {
        const flowLink = ctx.timeline.links.find((l) => l.to.startsWith("flowrun:"))!;
        expect(flowLink).toMatchObject({ kind: "stitched", confidence: "medium" });
        expect(ctx.timeline.links.every((l) => l.kind === "exact" || l.reason.length > 0)).toBe(true);
    });

    it("produces an Overwrite finding naming the user, the integration and the plugin", () => {
        const overwrite = findings(ctx).find((f) => f.rule === "overwrite" && f.id.endsWith(":cr_line1"))!;
        expect(overwrite).toBeDefined();
        expect(overwrite.severity).toBe("high");
        expect(overwrite.title).toBe("A user's change to cr_line1 on cr_address 'Primary – 2 New St' was overwritten by ERP Integration (via Plugins.AccountAddressSync)");
        expect(overwrite.explanation).toMatch(/Dana Field changed cr_line1 from '1 Old St' to '2 New St'/);
        expect(overwrite.explanation).toMatch(/ERP Integration \(integration \/ application user\) changed it back to '1 Old St' via Plugins\.AccountAddressSync, triggered by Update of account 'Contoso Ltd'/);
        expect(overwrite.confidence).toBe("medium"); // the plugin → address step is stitched by timing + identity
        expect(overwrite.evidence.map((e) => e.kind)).toEqual(["event", "event", "event", "event"]);
    });

    it("also explains the account side, attributed to the flow, at low severity (automation vs automation, not the target record)", () => {
        const account = findings(ctx).find((f) => f.rule === "overwrite" && f.id.endsWith(":address1_line1"))!;
        expect(account.title).toMatch(/^Address – validate & sync's change to address1_line1 on account 'Contoso Ltd' was overwritten by ERP Integration/);
        expect(account.severity).toBe("low");
    });

    it("the most severe finding comes first", () => {
        expect(findings(ctx)[0].rule).toBe("overwrite");
    });
});

describe("disabled address flow → Expected but missing", () => {
    const edit = auditRow("cr_address", ADDR_PRIMARY, USER, at(0));
    const ctx = buildContext({
        target: { table: "cr_address", id: ADDR_PRIMARY },
        handlers: [addressFlow({ on: false }), syncStep()],
        audit: [{ row: edit, changes: [{ column: "cr_line1", oldValue: "1 Old St", newValue: "2 New St" }] }],
    });

    it("names the flow and says it's off", () => {
        const missing = findings(ctx).find((f) => f.rule === "expected-missing")!;
        expect(missing.title).toBe("Cloud flow 'Address – validate & sync' is turned off");
        expect(missing.explanation).toMatch(/Its status is Draft, so it didn't run/);
        expect(missing.explanation).toMatch(/last modified .* by Alex Admin/);
        expect(missing.confidence).toBe("high");
        expect(missing.evidence[0]).toMatchObject({ kind: "handler", id: addressFlow().id });
    });

    it("doesn't blame unrelated automation (the account plugin isn't registered on cr_address)", () => {
        expect(findings(ctx).filter((f) => f.rule === "expected-missing")).toHaveLength(1);
    });
});

describe("findings never silently disappear when data is missing", () => {
    it("every rule reports Unavailable with a reason when its data source is missing", () => {
        const scenario = overwriteScenario();
        const sources = Object.fromEntries(Object.keys(buildContext(scenario).sources).map((k) => [k, { available: false, reason: `no ${k}` }])) as never;
        const out = runRules(buildContext({ ...scenario, sources }));
        expect(out.every((o) => o.kind === "unavailable")).toBe(true);
        for (const rule of ["overwrite", "expected-missing", "failure", "loop", "stuck-async"]) {
            expect(out.some((o) => o.rule === rule && o.kind === "unavailable" && o.reason.startsWith("Unavailable — "))).toBe(true);
        }
    });

    it("choosing the account as the target still finds the user's overwritten address edit", () => {
        const ctx = buildContext(overwriteScenario({ table: "account", id: ACCOUNT }));
        const address = findings(ctx).find((f) => f.id.endsWith(":cr_line1"));
        expect(address).toMatchObject({ severity: "medium" }); // not the target record → one level lower
    });
});
