/**
 * End-to-end run of the orchestrator against an in-memory, read-only fake of the host API.
 * Proves the readers, hop expansion, correlation and rules fit together.
 */
import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/model/types";
import { run } from "../fixtures/endToEnd";
import { ADDR_BILLING } from "../fixtures/scenario";

describe("runAnalysis end to end", () => {
    it("follows the chain to the account (hop 1) and back to its addresses (hop 2)", async () => {
        const { result } = await run();
        expect(result.error).toBeUndefined();
        expect(result.done).toBe(true);
        const scope = result.timeline.records.map((r) => `${r.ref.table}:${r.hop}`);
        expect(scope).toContain("cr_address:0");
        expect(scope).toContain("account:1");
        // the duplicate Primary was created in the window → pulled in at hop 2; the old billing address isn't
        expect(result.timeline.records.find((r) => r.ref.id === "bbbbbbbb-0000-4000-8000-000000000003")?.hop).toBe(2);
        expect(result.timeline.records.some((r) => r.ref.id === ADDR_BILLING)).toBe(false);
    });

    it("produces the Overwrite finding, the duplicate Primary finding, and maps the wiring", async () => {
        const { result } = await run();
        const findings = result.findings.filter((f): f is Finding => f.kind === "finding");
        const overwrite = findings.find((f) => f.id.endsWith(":cr_line1"));
        expect(overwrite?.title).toBe("A user's change to cr_line1 on cr_address 'Primary' was overwritten by ERP Integration (via Plugins.AccountAddressSync)");
        expect(findings.find((f) => f.rule === "duplicate")?.title).toBe("2 active cr_address records with cr_addresstype = Primary under account 'Contoso Ltd'");
        expect(result.wiring.handlers.map((h) => h.kind).sort()).toEqual(["flow", "plugin"]);
        // the plugin's write to cr_address is learned from history
        expect(result.wiring.handlers.find((h) => h.kind === "plugin")!.writes).toContainEqual(expect.objectContaining({ table: "cr_address", kind: "inferred" }));
        expect(result.wiring.cycles).toHaveLength(1);
    });

    it("streams partial results and never calls anything but reads", async () => {
        const { updates, calls } = await run();
        expect(updates.length).toBeGreaterThan(3);
        expect(updates.filter((u) => u.done)).toHaveLength(1);
        expect(calls.filter((c) => c.startsWith("fn:")).every((c) => c === "fn:RetrieveRecordChangeHistory")).toBe(true);
    });
});
