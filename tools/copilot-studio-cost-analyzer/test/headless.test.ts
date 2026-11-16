import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeHeadless } from "../src/headless";
import type { AzureAPI } from "../src/types/azureAPI";

function bytes(value: unknown): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(value));
}

function gzipBytes(value: unknown): Uint8Array {
    return new Uint8Array(gzipSync(JSON.stringify(value)));
}

function createLogger() {
    const entries: Array<Record<string, unknown>> = [];
    const write = (message: string) => {
        entries.push(JSON.parse(message.slice(message.indexOf("{"))));
    };
    return { entries, debug: vi.fn(write), info: vi.fn(write), warn: vi.fn(write), error: vi.fn(write) };
}

function createPowerPlatformClient() {
    return {
        Post: vi.fn(async (path?: string) => {
            const report = path?.includes("BillingDetailsPerEnvironment")
                ? "BillingDetailsPerEnvironment"
                : "FeatureDetailsPerResource";
            return {
                status: 202,
                headers: {
                    location: `https://api.powerplatform.com/copilotstudio/licensing/reports/${report}/operations/op-1`,
                },
                body: new Uint8Array(),
            };
        }),
        Get: vi.fn(async (path?: string) => {
            const report = path?.includes("BillingDetailsPerEnvironment")
                ? "BillingDetailsPerEnvironment"
                : "FeatureDetailsPerResource";
            if (path?.includes("/operations/")) {
                return {
                    status: 200,
                    headers: {
                        location: `https://api.powerplatform.com/copilotstudio/licensing/reports/${report}/files/report.json.gz`,
                    },
                    body: bytes({ status: "Succeeded" }),
                };
            }
            const data = report === "FeatureDetailsPerResource"
                ? [{
                    "Agent Name": "Returns Helper",
                    "Agent Id": "agent-1",
                    "Billed credit": 12.5,
                    "Non-billed credit": 2,
                    "Environment Id": "environment-1",
                    "Environment Name": "Production",
                    "Consumption Date": "2026-11-14",
                }]
                : [{
                    EnvironmentId: "environment-1",
                    EnvironmentName: "Production",
                    PrepaidConsumedQuantity: 100,
                    PayGoConsumedQuantity: 25.5,
                }];
            return { status: 200, headers: {}, body: gzipBytes(data) };
        }),
    };
}

describe("invokeHeadless", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("rejects invalid date ranges before calling the APIs", async () => {
        const logger = createLogger();
        await expect(invokeHeadless({ startDate: "2026-02-30", endDate: "2026-03-01" }, { logger }))
            .rejects.toThrow('"startDate" is not a valid calendar date.');
        expect(logger.entries).toMatchObject([
            { event: "run.started" },
            { event: "validation.failed", message: '"startDate" is not a valid calendar date.' },
        ]);
    });

    it.each([
        [undefined, "subscription_id_required"],
        ["", "subscription_id_required"],
        ["   ", "subscription_id_required"],
        [null, "subscription_id_required"],
        [123, "subscription_id_required"],
        ["not-a-guid", "subscription_id_invalid"],
    ])("requests user input for subscriptionId %s without starting reports", async (subscriptionId, code) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-16T05:00:00Z"));
        const client = createPowerPlatformClient();
        const logger = createLogger();
        const progress = vi.fn();
        const azureGetter = vi.fn(() => { throw new Error("Azure API must not be accessed before collecting subscriptionId."); });
        const input = {
            startDate: "2026-11-10",
            endDate: "2026-11-14",
            granularity: "Summary",
            includeAzure: true,
            subscriptionId,
            costType: "AmortizedCost",
            scopeFilter: "all",
            grouping: "ResourceId",
        };

        const result = await invokeHeadless(
            { ...input, __pptb: { authToken: "not-for-return" } },
            { powerplatformAPI: { CopilotStudio: { Raw: client } }, get azureAPI() { return azureGetter(); }, logger, updateProgress: progress },
        );

        expect(result).toMatchObject({
            operation: "needs-user-input",
            status: "requires_input",
            code,
            input: { ...input, subscriptionId: typeof subscriptionId === "string" ? subscriptionId.trim() : undefined },
            requiredInputs: [{ name: "subscriptionId", type: "string", format: "uuid", prompt: expect.stringContaining("Please provide") }],
            nextAction: { type: "ask-user-and-reinvoke", instructions: expect.stringContaining("keep includeAzure true") },
            generatedAt: "2026-11-16T05:00:00.000Z",
        });
        expect(result).not.toHaveProperty("reports");
        expect(result).not.toHaveProperty("summary");
        expect(JSON.stringify(result)).not.toContain("not-for-return");
        expect(client.Post).not.toHaveBeenCalled();
        expect(client.Get).not.toHaveBeenCalled();
        expect(azureGetter).not.toHaveBeenCalled();
        expect(logger.entries).toContainEqual(expect.objectContaining({ event: "run.requires-input", field: "subscriptionId", code }));
        expect(JSON.stringify(logger.entries)).not.toContain("not-for-return");
        expect(progress).toHaveBeenLastCalledWith(100, "waiting for user-provided subscription ID");
    });

    it("loads both credit reports and returns structured totals", async () => {
        vi.useFakeTimers();
        const client = createPowerPlatformClient();
        const now = new Date();
        const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10);
        const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2)).toISOString().slice(0, 10);
        const progress = vi.fn();
        const logger = createLogger();

        const resultPromise = invokeHeadless(
            { startDate, endDate },
            { powerplatformAPI: { CopilotStudio: { Raw: client } }, updateProgress: progress, logger },
        );
        await vi.advanceTimersByTimeAsync(60_000);
        const result = await resultPromise;
        const reports = result.reports as Record<string, { status: string; rowCount: number }>;

        expect(client.Post).toHaveBeenCalledTimes(2);
        expect(reports.agentUsage).toMatchObject({ status: "succeeded", rowCount: 1 });
        expect(reports.environmentCapacity).toMatchObject({ status: "succeeded", rowCount: 1 });
        expect(reports.azureCosts.status).toBe("skipped");
        expect(result.summary).toMatchObject({
            agentCount: 1,
            billedCredits: 12.5,
            nonBilledCredits: 2,
            environmentCount: 1,
            prepaidConsumed: 100,
            payGoConsumed: 25.5,
        });
        expect(progress).toHaveBeenLastCalledWith(100, "analysis complete");
        expect(logger.entries).toContainEqual(expect.objectContaining({ event: "apis.resolved", powerPlatformAvailable: true }));
        expect(logger.entries).toContainEqual(expect.objectContaining({ event: "azure-report.skipped", reason: "not-requested" }));
        for (const report of ["FeatureDetailsPerResource", "BillingDetailsPerEnvironment"]) {
            const progressLogs = logger.entries.filter((entry) => entry.event === "credit-report.progress" && entry.report === report);
            expect(progressLogs.length).toBeGreaterThanOrEqual(3);
            expect(progressLogs.length).toBeLessThanOrEqual(6);
            expect(logger.entries).toContainEqual(expect.objectContaining({ event: "credit-report.succeeded", report, rowCount: 1, durationMs: 60_000 }));
        }
        expect(new Set(logger.entries.map((entry) => entry.runId)).size).toBe(1);
        expect(logger.entries.every((entry) => typeof entry.timestamp === "string" && typeof entry.elapsedMs === "number")).toBe(true);
        expect(logger.entries.at(-1)).toMatchObject({ event: "run.completed", failureCount: 0, agentRowCount: 1 });
        expect(JSON.stringify(logger.entries)).not.toContain("Returns Helper");
    });

    it("includes optional Azure cost rows and currency totals", async () => {
        vi.useFakeTimers();
        const client = createPowerPlatformClient();
        const logger = createLogger();
        const queryCosts = vi.fn(async () => ({
            status: 200,
            headers: {},
            data: {
                properties: {
                    columns: [
                        { name: "PreTaxCost", type: "Number" },
                        { name: "UsageDate", type: "Number" },
                        { name: "Meter", type: "String" },
                        { name: "Currency", type: "String" },
                    ],
                    rows: [[4.5, 20261114, "Copilot Studio", "USD"]],
                },
            },
        }));
        const azureAPI = {
            arm: { queryCosts },
            cancelRequest: vi.fn(async () => undefined),
            onConnectionChanged: vi.fn(() => () => undefined),
        } as unknown as AzureAPI.API;
        const now = new Date();
        const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10);
        const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2)).toISOString().slice(0, 10);
        const needsInput = await invokeHeadless(
            { startDate, endDate, includeAzure: true, costType: "AmortizedCost", scopeFilter: "all", grouping: "Meter" },
            { powerplatformAPI: { CopilotStudio: { Raw: client } }, azureAPI, logger },
        );
        expect(needsInput.status).toBe("requires_input");
        expect(queryCosts).not.toHaveBeenCalled();
        expect(client.Post).not.toHaveBeenCalled();
        const retryInput = needsInput.input;
        if (!retryInput || typeof retryInput !== "object" || Array.isArray(retryInput)) throw new Error("Missing retry input.");
        const resultPromise = invokeHeadless(
            { ...retryInput, subscriptionId: " 11111111-2222-3333-4444-555555555555 " },
            { powerplatformAPI: { CopilotStudio: { Raw: client } }, azureAPI, logger },
        );
        await vi.advanceTimersByTimeAsync(60_000);
        const result = await resultPromise;
        const reports = result.reports as Record<string, { status: string; rowCount: number }>;

        expect(queryCosts).toHaveBeenCalledWith(
            "/subscriptions/11111111-2222-3333-4444-555555555555",
            expect.objectContaining({
                timeframe: "Custom",
                type: "AmortizedCost",
                timePeriod: { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z` },
                dataset: expect.not.objectContaining({ filter: expect.anything() }),
            }),
            expect.objectContaining({ connectionTarget: "primary" }),
        );
        expect(reports.azureCosts).toMatchObject({ status: "succeeded", rowCount: 1 });
        expect(reports.agentUsage.status).toBe("succeeded");
        expect(reports.environmentCapacity.status).toBe("succeeded");
        expect(result).not.toHaveProperty("requiredInputs");
        expect(result.summary).toMatchObject({ azureTotalsByCurrency: [{ currency: "USD", total: 4.5, rows: 1 }] });
        expect(logger.entries).toContainEqual(expect.objectContaining({ event: "azure-report.page-requested", page: 1 }));
        expect(logger.entries).toContainEqual(expect.objectContaining({ event: "azure-report.succeeded", pages: 1, rowCount: 1, currencyCount: 1 }));
        expect(new Set(logger.entries.map((entry) => entry.runId)).size).toBe(2);
        expect(JSON.stringify(logger.entries)).not.toContain("11111111-2222-3333-4444-555555555555");
    });

    it("logs safe failure metadata and a failed-run summary without exposing service payloads", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-16T05:00:00Z"));
        const logger = createLogger();
        const client = createPowerPlatformClient();
        client.Post.mockRejectedValue({
            status: 403, code: "accessDenied",
            message: "Bearer secret-token", body: bytes({ confidential: "report-content" }),
        });
        const result = await invokeHeadless(
            { startDate: "2026-11-10", endDate: "2026-11-14", __pptb: { authToken: "secret-token" } },
            { powerplatformAPI: { CopilotStudio: { Raw: client } }, logger },
        );
        expect(result.operation).toBe("cost-analysis");
        expect(logger.entries.filter((entry) => entry.event === "credit-report.failed")).toHaveLength(2);
        expect(logger.entries).toContainEqual(expect.objectContaining({ event: "credit-report.failed", status: 403, code: "accessDenied" }));
        expect(logger.entries.at(-1)).toMatchObject({ event: "run.completed", failureCount: 2 });
        expect(logger.warn).toHaveBeenCalled();
        expect(JSON.stringify(logger.entries)).not.toMatch(/secret-token|report-content|Bearer/);
    });

    it("logs unavailable API surfaces explicitly", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-16T05:00:00Z"));
        const logger = createLogger();
        await invokeHeadless({
            startDate: "2026-11-10", endDate: "2026-11-14", includeAzure: true,
            subscriptionId: "11111111-2222-3333-4444-555555555555",
        }, { logger });
        expect(logger.entries).toContainEqual(expect.objectContaining({ event: "apis.resolved", powerPlatformAvailable: false, azureAvailable: false }));
        expect(logger.entries.filter((entry) => entry.event === "credit-report.unavailable")).toHaveLength(2);
        expect(logger.entries).toContainEqual(expect.objectContaining({ event: "azure-report.unavailable" }));
        expect(logger.entries.at(-1)).toMatchObject({ event: "run.completed", failureCount: 3 });
    });

    it("falls back to console for missing logger levels", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        await expect(invokeHeadless(null, { logger: { info: vi.fn() } })).rejects.toThrow("Provide an input object");
        expect(error).toHaveBeenCalledWith(expect.stringContaining('"event":"validation.failed"'));
    });
});
