import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportTask } from "../../src/data/reportTask";
import type { ReportProgress } from "../../src/api/reports";

const range = { startDate: "2026-11-01", endDate: "2026-11-14" };

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
    return { promise, resolve, reject };
}

describe("independent report tasks", () => {
    afterEach(() => vi.restoreAllMocks());

    it("starts both credit reports and Azure work before any source finishes, publishing partial success", async () => {
        const agentResult = deferred<number[]>();
        const billingResult = deferred<number[]>();
        const azureResult = deferred<number[]>();
        const agentLoader = vi.fn(() => agentResult.promise);
        const billingLoader = vi.fn(() => billingResult.promise);
        const azureLoader = vi.fn(() => azureResult.promise);
        const agents = new ReportTask(agentLoader);
        const billing = new ReportTask(billingLoader);
        const azure = new ReportTask(azureLoader);
        const listener = vi.fn();
        agents.subscribe(listener);

        const work = [agents.run(range, "Daily"), billing.run(range, "Daily"), azure.run(range, "Daily")];
        expect(agentLoader).toHaveBeenCalledOnce();
        expect(billingLoader).toHaveBeenCalledOnce();
        expect(azureLoader).toHaveBeenCalledOnce();
        expect([agents, billing, azure].map((task) => task.getSnapshot().status)).toEqual(["loading", "loading", "loading"]);
        azureResult.resolve([10]);
        await work[2];
        expect(azure.getSnapshot()).toMatchObject({ status: "ready", rows: [10], range, granularity: "Daily" });
        expect(agents.getSnapshot().status).toBe("loading");
        expect(billing.getSnapshot().status).toBe("loading");
        agentResult.resolve([20]);
        billingResult.resolve([30]);
        await Promise.all(work);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("retains completed sources when a sibling fails, and retries only the failed source", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const agentsLoader = vi.fn(async () => [12]);
        const billingLoader = vi.fn<() => Promise<number[]>>()
            .mockRejectedValueOnce({ status: 403 }).mockResolvedValueOnce([5]);
        const agents = new ReportTask(agentsLoader);
        const billing = new ReportTask(billingLoader);
        await Promise.all([agents.run(range, "Daily"), billing.run(range, "Daily")]);
        expect(agents.getSnapshot().rows).toEqual([12]);
        expect(billing.getSnapshot()).toMatchObject({ status: "error", error: expect.stringContaining("Access denied") });
        expect(log).toHaveBeenCalledOnce();
        await billing.run(range, "Daily");
        expect(agentsLoader).toHaveBeenCalledOnce();
        expect(agents.getSnapshot().rows).toEqual([12]);
        expect(billing.getSnapshot()).toMatchObject({ status: "ready", rows: [5] });
    });

    it("stops outstanding work and ignores late completion without discarding completed sources", async () => {
        const result = deferred<number[]>();
        let signal: AbortSignal | undefined;
        const pending = new ReportTask((_range, _granularity, _progress, cancellation) => { signal = cancellation; return result.promise; });
        const completed = new ReportTask(async () => [2]);
        const pendingRun = pending.run(range, "Daily");
        await completed.run(range, "Daily");
        pending.stop();
        completed.stop();
        expect(signal?.aborted).toBe(true);
        expect(pending.getSnapshot().status).toBe("stopped");
        expect(completed.getSnapshot()).toMatchObject({ status: "ready", rows: [2] });
        result.resolve([99]);
        await pendingRun;
        expect(pending.getSnapshot()).toMatchObject({ status: "stopped" });
        expect(pending.getSnapshot().rows).toBeUndefined();
    });

    it("does not allow superseded requests or progress to overwrite a newer run", async () => {
        const first = deferred<number[]>();
        const second = deferred<number[]>();
        let oldProgress: ((progress: ReportProgress) => void) | undefined;
        const loader = vi.fn()
            .mockImplementationOnce((_range, _granularity, onProgress) => { oldProgress = onProgress; return first.promise; })
            .mockImplementationOnce(() => second.promise);
        const task = new ReportTask<number>(loader);
        const firstRun = task.run(range, "Daily");
        const nextRange = { ...range, startDate: "2026-11-05" };
        const secondRun = task.run(nextRange, "Summary");
        second.resolve([2]);
        await secondRun;
        oldProgress?.({ message: "Old progress", elapsedMs: 2000 });
        first.resolve([1]);
        await firstRun;
        expect(task.getSnapshot()).toMatchObject({ rows: [2], range: nextRange, granularity: "Summary", status: "ready" });
        expect(task.getSnapshot().progress).toBeUndefined();
    });

    it("clears cached tenant data and prevents a late result from restoring it", async () => {
        const pending = deferred<number[]>();
        const task = new ReportTask(() => pending.promise);
        const run = task.run(range, "Daily");
        task.clear();
        pending.resolve([8]);
        await run;
        expect(task.getSnapshot()).toEqual({ status: "idle" });
    });

    it("preserves the submitted range and exposes timeout failures", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const input = { ...range };
        const pending = deferred<number[]>();
        const task = new ReportTask(() => pending.promise);
        const run = task.run(input, "Daily");
        input.startDate = "2026-11-08";
        pending.reject(new Error("Report generation timed out after 15 minutes."));
        await run;
        expect(task.getSnapshot()).toMatchObject({ status: "error", range, error: expect.stringContaining("timed out") });
    });
});
