import { describe, expect, it } from "vitest";
import { ACCOUNT, at, auditRow, buildContext, syncStep, traceRow, USER } from "../fixtures/scenario";

describe("correlation: plugin updating its own record", () => {
    // Regression (user report): update → post-op plugin → plugin writes a column back on the same record.
    // The write-back must nest under the plugin, not under the original update.
    const update = auditRow("account", ACCOUNT, USER, at(0));
    const writeBack = auditRow("account", ACCOUNT, USER, at(78));
    const plugin = traceRow("dddddddd-0000-4000-8000-0000000000f1", { time: at(48), table: "account", correlation: "c1", duration: 60, block: `Score for ${ACCOUNT}` });

    it("update → plugin → write-back", () => {
        const ctx = buildContext({
            target: { table: "account", id: ACCOUNT },
            handlers: [syncStep()],
            audit: [
                { row: update, changes: [{ column: "address1_line1", oldValue: "a", newValue: "b" }] },
                { row: writeBack, changes: [{ column: "telephone1", oldValue: undefined, newValue: "38" }] },
            ],
            traces: [plugin],
        });
        const [u, p, w] = ctx.timeline.events;
        expect([u.source, p.source, w.source]).toEqual(["audit", "trace", "audit"]);
        expect(ctx.timeline.parentOf[p.id]).toBe(u.id);
        expect(ctx.timeline.parentOf[w.id]).toBe(p.id);
        expect(ctx.timeline.links.find((l) => l.to === w.id)).toMatchObject({ kind: "stitched", confidence: "medium", reason: expect.stringMatching(/under the same user as the request that ran the plugin/) });
    });

    it("a plugin with no known trigger doesn't claim a row on its own table (it might be the trigger)", () => {
        // No record ID in the output and several simultaneous requests → no trigger link for the plugin.
        const others = [2, 3, 4].map((n) => traceRow(`dddddddd-0000-4000-8000-0000000000f${n}`, { time: at(40 + n), table: "account", correlation: `c${n}` }));
        const ctx = buildContext({
            target: { table: "account", id: ACCOUNT },
            handlers: [syncStep()],
            audit: [{ row: update, changes: [{ column: "address1_line1", oldValue: "a", newValue: "b" }] }],
            traces: [{ ...plugin, messageblock: "" }, ...others],
        });
        expect(ctx.timeline.events.filter((e) => e.source === "audit").every((e) => !ctx.timeline.parentOf[e.id])).toBe(true);
    });
});
