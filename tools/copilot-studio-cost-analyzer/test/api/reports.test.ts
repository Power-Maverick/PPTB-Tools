import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadReport, type ReportKind } from "../../src/api/reports";

function rawResponse(status: number, headers: Record<string, string>, body: Uint8Array = new Uint8Array()): PowerPlatformAPI.RawResponse {
    return { status, headers, body };
}

function jsonResponse(value: unknown): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(value));
}

function gzipJson(value: unknown): Uint8Array {
    return new Uint8Array(gzipSync(JSON.stringify(value)));
}

function createClient(responses: PowerPlatformAPI.RawResponse[]) {
    return {
        Post: vi.fn(async () => responses.shift() ?? rawResponse(500, {})),
        Get: vi.fn(async () => responses.shift() ?? rawResponse(500, {})),
    };
}

describe("loadReport", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("submits a delegated report request, polls its operation, and parses gzip JSON", async () => {
        const client = createClient([
            rawResponse(202, { location: "https://api.powerplatform.com/copilotstudio/licensing/reports/FeatureDetailsPerResource/operations/op-1?api-version=2024-10-01", "retry-after": "0" }),
            rawResponse(200, { location: "https://api.powerplatform.com/copilotstudio/licensing/reports/FeatureDetailsPerResource/files/report.json.gz?api-version=2024-10-01" }, jsonResponse({ status: "Succeeded" })),
            rawResponse(200, { "content-type": "application/gzip" }, gzipJson([{
                "Agent Name": "Returns Helper",
                "Agent Id": "agent-1",
                "AI Feature/Billable Feature": "Generative answers",
                "Billed credit": 12.5,
                "Non-billed credit": 2,
                "Environment Id": "environment-1",
                "Consumption Date": "2026-11-10",
            }])),
        ]);
        const progress = vi.fn();

        const request = loadReport(
            "FeatureDetailsPerResource",
            { startDate: "2026-11-10", endDate: "2026-11-10" },
            "Daily",
            progress,
            undefined,
            client,
        );
        await vi.advanceTimersByTimeAsync(60_000);
        const rows = await request;

        expect(client.Post).toHaveBeenCalledWith(
            "licensing/reports/FeatureDetailsPerResource?api-version=2024-10-01",
            { startDate: "2026-11-10", endDate: "2026-11-10", granularity: "Daily", format: "json" },
            undefined,
            undefined,
            { requireDelegatedAuthentication: true },
        );
        expect(client.Get).toHaveBeenNthCalledWith(1, expect.stringContaining("/operations/op-1"), undefined, undefined, { requireDelegatedAuthentication: true });
        expect(client.Get).toHaveBeenNthCalledWith(2, expect.stringContaining("/files/report.json.gz"), undefined, undefined, { requireDelegatedAuthentication: true });
        expect(rows).toMatchObject([{ agentName: "Returns Helper", billedCredit: 12.5, nonBilledCredit: 2 }]);
        expect(progress).toHaveBeenCalledWith(expect.objectContaining({ message: "Downloading and unpacking report…" }));
    });

    it("parses environment prepaid and pay-as-you-go quantities", async () => {
        const client = createClient([
            rawResponse(202, { location: "https://api.powerplatform.com/copilotstudio/licensing/reports/BillingDetailsPerEnvironment/operations/op-2?api-version=2024-10-01", "retry-after": "0" }),
            rawResponse(200, { location: "https://api.powerplatform.com/copilotstudio/licensing/reports/BillingDetailsPerEnvironment/files/report.json.gz?api-version=2024-10-01" }, jsonResponse({ status: "Succeeded" })),
            rawResponse(200, {}, gzipJson([{
                EnvironmentId: "env-1",
                EnvironmentName: "Production",
                PrepaidConsumedQuantity: 100,
                PayGoConsumedQuantity: 25.5,
                BilledDate: "2026-11-10",
            }])),
        ]);

        const request = loadReport(
            "BillingDetailsPerEnvironment" satisfies ReportKind,
            { startDate: "2026-11-10", endDate: "2026-11-10" },
            "Summary",
            () => undefined,
            undefined,
            client,
        );
        await vi.advanceTimersByTimeAsync(60_000);
        const rows = await request;

        expect(rows).toMatchObject([{ environmentName: "Production", prepaidConsumed: 100, payGoConsumed: 25.5 }]);
    });

    it("polls again using the operation's Retry-After header while the report is running", async () => {
        const client = createClient([
            rawResponse(202, { location: "https://api.powerplatform.com/copilotstudio/licensing/reports/FeatureDetailsPerResource/operations/op-4?api-version=2024-10-01", "retry-after": "0" }),
            rawResponse(200, { "retry-after": "0" }, jsonResponse({ status: "Running" })),
            rawResponse(200, { location: "https://api.powerplatform.com/copilotstudio/licensing/reports/FeatureDetailsPerResource/files/report.json.gz?api-version=2024-10-01" }, jsonResponse({ status: "Succeeded" })),
            rawResponse(200, {}, gzipJson([])),
        ]);

        const request = loadReport(
            "FeatureDetailsPerResource",
            { startDate: "2026-11-10", endDate: "2026-11-10" },
            "Daily",
            () => undefined,
            undefined,
            client,
        );
        await vi.advanceTimersByTimeAsync(60_000);
        const rows = await request;

        expect(rows).toEqual([]);
        expect(client.Get).toHaveBeenCalledTimes(3);
    });

    it("surfaces report-generation failures instead of treating them as empty data", async () => {
        const client = createClient([
            rawResponse(202, { location: "https://api.powerplatform.com/copilotstudio/licensing/reports/FeatureDetailsPerResource/operations/op-3?api-version=2024-10-01", "retry-after": "0" }),
            rawResponse(200, {}, jsonResponse({ status: "Failed", error: "Report data is not ready." })),
        ]);

        const request = loadReport(
            "FeatureDetailsPerResource",
            { startDate: "2026-11-10", endDate: "2026-11-10" },
            "Daily",
            () => undefined,
            undefined,
            client,
        );
        const rejection = expect(request).rejects.toThrow("Report data is not ready.");
        await vi.advanceTimersByTimeAsync(60_000);
        await rejection;
    });

    it("waits one minute before the first poll, then follows Retry-After and supports cancellation", async () => {
        const client = createClient([
            rawResponse(202, { location: "https://api.powerplatform.com/copilotstudio/licensing/reports/FeatureDetailsPerResource/operations/op-5?api-version=2024-10-01", "retry-after": "300" }),
            rawResponse(200, { "retry-after": "300" }, jsonResponse({ status: "Running" })),
        ]);
        const controller = new AbortController();
        const progress = vi.fn();
        const request = loadReport(
            "FeatureDetailsPerResource",
            { startDate: "2026-11-10", endDate: "2026-11-10" },
            "Daily",
            progress,
            controller.signal,
            client,
        );
        const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });

        try {
            await vi.advanceTimersByTimeAsync(0);
            expect(progress).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining("next status check in 1m 00s"),
            }));
            await vi.advanceTimersByTimeAsync(59_000);
            expect(client.Get).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1_000);
            expect(client.Get).toHaveBeenCalledTimes(1);
            expect(progress).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining("next status check in 5m 00s"),
            }));
            controller.abort();

            await rejection;
        } finally {
            vi.useRealTimers();
        }
    });

    it("surfaces HTTP authentication errors with their status and message", async () => {
        const client = createClient([
            rawResponse(403, { "content-type": "application/json" }, jsonResponse({
                code: "Forbidden",
                message: "The signed-in user is not authorized.",
            })),
        ]);

        await expect(loadReport(
            "FeatureDetailsPerResource",
            { startDate: "2026-11-10", endDate: "2026-11-10" },
            "Daily",
            () => undefined,
            undefined,
            client,
        )).rejects.toMatchObject({
            name: "ReportHttpError",
            status: 403,
            code: "Forbidden",
            message: "The signed-in user is not authorized.",
        });
    });

    it("times out a report API request that does not return", async () => {
        try {
            const client = {
                Post: vi.fn(() => new Promise<PowerPlatformAPI.RawResponse>(() => undefined)),
                Get: vi.fn(async () => rawResponse(500, {})),
            };
            const request = loadReport(
                "FeatureDetailsPerResource",
                { startDate: "2026-11-10", endDate: "2026-11-10" },
                "Daily",
                () => undefined,
                undefined,
                client,
            );
            const rejection = expect(request).rejects.toThrow("Submitting the report timed out after 60 seconds.");

            await vi.advanceTimersByTimeAsync(60_000);
            await rejection;
        } finally {
            vi.useRealTimers();
        }
    });
});
