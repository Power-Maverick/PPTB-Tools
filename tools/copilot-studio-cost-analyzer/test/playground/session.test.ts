import { describe, expect, it, vi } from "vitest";
import { ReportTask } from "../../src/data/reportTask";
import { dailySeries, detectUsageSpikes } from "../../src/data/analysis";
import { createPlaygroundHost } from "../../src/playground/mockHost";
import { createPlaygroundSession } from "../../src/playground/session";

const now = new Date("2026-11-15T12:00:00Z");

describe("preloaded playground session", () => {
    it("shows exactly one genuine potential spike using the live detection threshold", async () => {
        const host = createPlaygroundHost("light", () => undefined, () => now);
        const session = await createPlaygroundSession(host, now);
        const rows = session.credits.agents.initial.rows!;
        const range = session.credits.agents.initial.range!;
        const spikes = detectUsageSpikes(dailySeries(rows, range.startDate, range.endDate));
        expect(spikes).toHaveLength(1);
        expect(spikes[0].date).toBe("2026-11-07");
        expect(spikes[0].billedCredit).toBeGreaterThan(spikes[0].baselineAverage * 2);
        expect(rows.reduce((sum, row) => sum + row.billedCredit, 0)).toBe(124860);
        const rerun = await session.credits.agents.loader(range, "Daily", () => undefined, new AbortController().signal);
        expect(detectUsageSpikes(dailySeries(rerun, range.startDate, range.endDate))).toEqual(spikes);
    });

    it("starts all three reports ready, with Azure approved and a subscription selected", async () => {
        const host = createPlaygroundHost("light", () => undefined, () => now);
        const session = await createPlaygroundSession(host, now);
        expect(session.credits.agents.initial).toMatchObject({ status: "ready", granularity: "Daily" });
        expect(session.credits.agents.initial.rows).toHaveLength(240);
        expect(session.credits.billing.initial.rows).toHaveLength(90);
        expect(session.azure).toMatchObject({ approved: true, subscriptionsLoaded: true });
        expect(session.azure.subscriptionId).toBe(session.azure.result?.request.subscriptionId);
        expect(session.azure.result?.rows).toHaveLength(120);
        expect(session.azure.result?.rows.reduce((sum, row) => sum + row.cost, 0)).toBeCloseTo(602.4);
    });

    it("preloads ReportTask without starting work, then reruns instantly with changed dates and detail", async () => {
        const host = createPlaygroundHost("light", () => undefined, () => now);
        const { credits } = await createPlaygroundSession(host, now);
        const loader = vi.fn(credits.agents.loader);
        const task = new ReportTask(loader, credits.agents.initial);
        expect(task.getSnapshot().status).toBe("ready");
        expect(loader).not.toHaveBeenCalled();
        const range = { startDate: "2026-11-01", endDate: "2026-11-14" };
        const timeout = vi.spyOn(globalThis, "setTimeout");
        try {
            await task.run(range, "Summary");
            expect(timeout).not.toHaveBeenCalled();
        } finally {
            timeout.mockRestore();
        }
        expect(task.getSnapshot()).toMatchObject({ status: "ready", range, granularity: "Summary" });
        expect(task.getSnapshot().rows).toHaveLength(8);
        expect(task.getSnapshot().rows?.every((row) => row.consumptionDate === "")).toBe(true);
        task.clear();
        expect(task.getSnapshot().status).toBe("idle");
        await task.run(range, "Daily");
        expect(task.getSnapshot().rows).toHaveLength(112);
    });

    it("leaves normal report tasks idle unless an explicit initial snapshot is supplied", () => {
        const task = new ReportTask(async () => [1]);
        expect(task.getSnapshot()).toEqual({ status: "idle" });
    });
});
