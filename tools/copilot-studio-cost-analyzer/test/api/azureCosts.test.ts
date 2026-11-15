import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    AzureRequestError,
    azureErrorMessage,
    buildCostQuery,
    checkSubscriptionAccess,
    listAllSubscriptions,
    loadAzureCosts,
    POWER_PLATFORM_RESOURCE_TYPE,
    type AzureCostRequest,
} from "../../src/api/azureCosts";
import type { AzureAPI } from "../../src/types/azureAPI";

const SUBSCRIPTION = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2026-03-15T10:00:00Z");

function response<T>(data: T | null, continuation?: string): AzureAPI.Response<T> {
    return { status: 200, headers: {}, data, continuation };
}

function costPage(rows: Array<Array<string | number | null>>): AzureAPI.CostQueryResult {
    return {
        properties: {
            columns: [
                { name: "PreTaxCost", type: "Number" },
                { name: "UsageDate", type: "Number" },
                { name: "Meter", type: "String" },
                { name: "Currency", type: "String" },
            ],
            rows,
        },
    };
}

function createApi(overrides: Partial<AzureAPI.ArmClient> = {}) {
    const arm = {
        getConnectionState: vi.fn(),
        authenticate: vi.fn(),
        Get: vi.fn(),
        nextPage: vi.fn(),
        listSubscriptions: vi.fn(),
        queryCosts: vi.fn(),
        checkCostAccess: vi.fn(),
        ...overrides,
    };
    const api = { arm, cancelRequest: vi.fn(async () => undefined), onConnectionChanged: vi.fn(() => () => undefined) };
    return api as unknown as AzureAPI.API & { arm: typeof arm; cancelRequest: ReturnType<typeof vi.fn> };
}

const request: AzureCostRequest = {
    subscriptionId: SUBSCRIPTION,
    costType: "ActualCost",
    period: "MonthToDate",
    grouping: "Meter",
    scopeFilter: "powerPlatform",
};

describe("buildCostQuery", () => {
    it("builds a daily, grouped, Power Platform-filtered query", () => {
        expect(buildCostQuery(request, NOW)).toEqual({
            type: "ActualCost",
            timeframe: "MonthToDate",
            dataset: {
                granularity: "Daily",
                aggregation: { totalCost: { name: "PreTaxCost", function: "Sum" } },
                grouping: [{ type: "Dimension", name: "Meter" }],
                filter: { dimensions: { name: "ResourceType", operator: "In", values: [POWER_PLATFORM_RESOURCE_TYPE] } },
            },
        });
    });

    it("uses a custom period for the last 30 complete UTC days and omits optional parts", () => {
        const query = buildCostQuery({ ...request, period: "Last30Days", grouping: "None", scopeFilter: "all", costType: "AmortizedCost" }, NOW);
        expect(query).toEqual({
            type: "AmortizedCost",
            timeframe: "Custom",
            timePeriod: { from: "2026-02-13T00:00:00Z", to: "2026-03-14T23:59:59Z" },
            dataset: { granularity: "Daily", aggregation: { totalCost: { name: "PreTaxCost", function: "Sum" } } },
        });
    });
});

describe("Azure cost client", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("pages through subscriptions using continuation handles", async () => {
        const api = createApi({
            listSubscriptions: vi.fn(async () => response({ value: [{ subscriptionId: "b", displayName: "Zeta", state: "Enabled" }] }, "handle-1")),
            nextPage: vi.fn(async () => response({ value: [{ subscriptionId: "a", displayName: "Alpha", state: "Enabled" }] })) as AzureAPI.ArmClient["nextPage"],
        });
        const subscriptions = await listAllSubscriptions(api);
        expect(subscriptions.map((subscription) => subscription.displayName)).toEqual(["Alpha", "Zeta"]);
        expect(api.arm.nextPage).toHaveBeenCalledWith("handle-1", expect.objectContaining({ connectionTarget: "primary", requestId: expect.stringMatching(/^csca-/) }));
    });

    it("loads every cost page against the subscription scope and keeps currencies", async () => {
        const onPage = vi.fn();
        const api = createApi({
            queryCosts: vi.fn(async () => response(costPage([[12.5, 20260301, "Copilot Studio", "USD"]]), "next")),
            nextPage: vi.fn(async () => response(costPage([[3, 20260302, "Copilot Studio", "EUR"]]))) as AzureAPI.ArmClient["nextPage"],
        });
        const result = await loadAzureCosts(api, request, undefined, onPage, NOW);
        expect(api.arm.queryCosts).toHaveBeenCalledWith(`/subscriptions/${SUBSCRIPTION}`, expect.any(Object), expect.objectContaining({ timeoutMs: 60000 }));
        expect(result.pages).toBe(2);
        expect(onPage.mock.calls).toEqual([[1], [2]]);
        expect(result.rows).toEqual([
            { date: "2026-03-01", group: "Copilot Studio", cost: 12.5, currency: "USD" },
            { date: "2026-03-02", group: "Copilot Studio", cost: 3, currency: "EUR" },
        ]);
        expect(result.timePeriod).toEqual({ from: "2026-03-01", to: "2026-03-15" });
    });

    it("rejects invalid subscription IDs before calling the host", async () => {
        const api = createApi();
        await expect(loadAzureCosts(api, { ...request, subscriptionId: "not-a-guid" })).rejects.toMatchObject({ code: "invalidRequest" });
        expect(api.arm.queryCosts).not.toHaveBeenCalled();
    });

    it("maps structured host errors and preserves safe diagnostics", async () => {
        const api = createApi({
            queryCosts: vi.fn(async () => {
                throw { name: "AzureApiError", code: "accessDenied", message: "Forbidden", status: 403, requestId: "req-1", correlationId: "corr-1" };
            }),
        });
        const failure = await loadAzureCosts(api, request).catch((reason: unknown) => reason);
        expect(failure).toBeInstanceOf(AzureRequestError);
        expect(failure).toMatchObject({ code: "accessDenied", status: 403, requestId: "req-1", correlationId: "corr-1" });
        expect(azureErrorMessage(failure)).toContain("Cost Management Reader");
    });

    it("retries once after a short Retry-After when throttled", async () => {
        let calls = 0;
        const api = createApi({
            queryCosts: vi.fn(async () => {
                if (++calls === 1) throw { name: "AzureApiError", code: "throttled", message: "Too many requests", status: 429, retryAfterMs: 5000 };
                return response(costPage([[1, 20260301, "Meter", "USD"]]));
            }),
        });
        const pending = loadAzureCosts(api, request, undefined, undefined, NOW);
        await vi.advanceTimersByTimeAsync(4999);
        expect(api.arm.queryCosts).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await expect(pending).resolves.toMatchObject({ pages: 1 });
        expect(api.arm.queryCosts).toHaveBeenCalledTimes(2);
    });

    it("does not wait out long throttling windows", async () => {
        const api = createApi({
            queryCosts: vi.fn(async () => {
                throw { name: "AzureApiError", code: "throttled", message: "Too many requests", status: 429, retryAfterMs: 120000 };
            }),
        });
        const failure = await loadAzureCosts(api, request).catch((reason: unknown) => reason);
        expect(failure).toMatchObject({ code: "throttled" });
        expect(azureErrorMessage(failure)).toContain("120 seconds");
        expect(api.arm.queryCosts).toHaveBeenCalledTimes(1);
    });

    it("cancels the in-flight host request on Stop and discards late results", async () => {
        let resolveQuery: (value: AzureAPI.Response<AzureAPI.CostQueryResult>) => void = () => undefined;
        const api = createApi({
            queryCosts: vi.fn(() => new Promise<AzureAPI.Response<AzureAPI.CostQueryResult>>((resolve) => { resolveQuery = resolve; })),
        });
        const controller = new AbortController();
        const pending = loadAzureCosts(api, request, controller.signal);
        const options = (api.arm.queryCosts.mock.calls[0] as unknown[])[2] as AzureAPI.Options;
        controller.abort();
        resolveQuery(response(costPage([[1, 20260301, "Meter", "USD"]])));
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(api.cancelRequest).toHaveBeenCalledWith(options.requestId);
    });

    it("returns the host access check for a valid subscription", async () => {
        const check: AzureAPI.CostAccessCheck = { configured: true, signedIn: true, scopeSelected: true, costData: "accessible", checkedAt: NOW.toISOString() };
        const api = createApi({ checkCostAccess: vi.fn(async () => check) });
        await expect(checkSubscriptionAccess(api, SUBSCRIPTION.toUpperCase())).resolves.toEqual(check);
        expect(api.arm.checkCostAccess).toHaveBeenCalledWith(`/subscriptions/${SUBSCRIPTION}`, expect.any(Object));
    });
});
