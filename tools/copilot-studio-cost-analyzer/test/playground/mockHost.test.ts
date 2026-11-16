import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCostQuery } from "../../src/api/azureCosts";
import { loadReport } from "../../src/api/reports";
import { parseCostResult, totalsByCurrency } from "../../src/data/azureCostAnalysis";
import { createPlaygroundHost, sampleCosts, sampleCreditRows, sampleDates, SAMPLE_SUBSCRIPTION } from "../../src/playground/mockHost";

const now = new Date("2026-11-15T12:00:00Z");
const range = { startDate: "2026-10-16", endDate: "2026-11-14" };
const sum = (rows: Record<string, string | number>[], key: string) => rows.reduce((total, row) => total + Number(row[key]), 0);

afterEach(() => vi.useRealTimers());

describe("offline playground fixtures", () => {
    it("rolls dates with UTC today without modifying the browser clock", () => {
        expect(sampleDates(now)).toHaveLength(30);
        expect(sampleDates(now)[0]).toBe(range.startDate);
        expect(sampleDates(now).at(-1)).toBe(range.endDate);
        expect(sampleDates(new Date("2027-01-01T00:01:00Z")).at(-1)).toBe("2026-12-31");
    });

    it("keeps all agent totals consistent between Daily and Summary reports", () => {
        const daily = sampleCreditRows("FeatureDetailsPerResource", range, "Daily", now);
        const summary = sampleCreditRows("FeatureDetailsPerResource", range, "Summary", now);
        expect(daily).toHaveLength(240);
        expect(summary).toHaveLength(8);
        expect(sum(daily, "Billed credit")).toBe(124860);
        expect(sum(daily, "Non-billed credit")).toBe(6240);
        expect(sum(summary, "Billed credit")).toBe(sum(daily, "Billed credit"));
        expect(sum(summary, "Non-billed credit")).toBe(sum(daily, "Non-billed credit"));
        expect(summary.every((row) => !("Consumption Date" in row))).toBe(true);
    });

    it("keeps capacity classifications and selected date ranges separate", () => {
        const daily = sampleCreditRows("BillingDetailsPerEnvironment", range, "Daily", now);
        const summary = sampleCreditRows("BillingDetailsPerEnvironment", range, "Summary", now);
        expect(sum(daily, "PrepaidConsumedQuantity")).toBe(95000);
        expect(sum(daily, "PayGoConsumedQuantity")).toBe(30000);
        expect(sum(summary, "PrepaidConsumedQuantity")).toBe(95000);
        expect(summary.every((row) => !("BilledDate" in row))).toBe(true);
        const subset = sampleCreditRows("FeatureDetailsPerResource", { ...range, startDate: "2026-11-01" }, "Daily", now);
        expect(subset.every((row) => String(row["Consumption Date"]) >= "2026-11-01")).toBe(true);
        expect(sampleCreditRows("FeatureDetailsPerResource", { startDate: "2020-01-01", endDate: "2020-01-02" }, "Daily", now)).toEqual([]);
    });

    it("responds to real cost queries, grouping, filters, subscriptions and cost types", () => {
        const request = { costType: "ActualCost", period: "Last30Days", grouping: "Meter", scopeFilter: "powerPlatform" } as const;
        const query = buildCostQuery(request, now);
        const scope = `/subscriptions/${SAMPLE_SUBSCRIPTION}`;
        const result = parseCostResult(sampleCosts(query, scope, now), "Meter");
        expect(totalsByCurrency(result)[0].total).toBeCloseTo(602.4);
        expect(result).toHaveLength(120);
        const groupedQuery = buildCostQuery({ ...request, grouping: "ResourceGroupName" }, now);
        const grouped = parseCostResult(sampleCosts(groupedQuery, scope, now), "ResourceGroupName");
        expect(new Set(grouped.map((row) => row.group))).toEqual(new Set(["pp-production", "pp-sandbox", "pp-development"]));
        const amortizedQuery = buildCostQuery({ ...request, costType: "AmortizedCost" }, now);
        const amortized = parseCostResult(sampleCosts(amortizedQuery, scope, now), "Meter");
        expect(totalsByCurrency(amortized)[0].total).toBeCloseTo(602.4);
        expect(amortized[0].cost).not.toBe(result[0].cost);
        const allQuery = buildCostQuery({ ...request, scopeFilter: "all" }, now);
        expect(totalsByCurrency(parseCostResult(sampleCosts(allQuery, scope, now), "Meter"))[0].total).toBeCloseTo(822.4);
        const noGroups = buildCostQuery({ ...request, grouping: "None" }, now);
        expect(parseCostResult(sampleCosts(noGroups, scope, now)).every((row) => row.group === "All costs")).toBe(true);
        const other = sampleCosts(query, "/subscriptions/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", now);
        expect(totalsByCurrency(parseCostResult(other, "Meter"))[0].total).toBeCloseTo(301.2);
    });
});

describe("mock host uses the real reporting workflow", () => {
    it("implements host theme, connection and notification contracts without sign-in", async () => {
        const notify = vi.fn();
        const { toolbox, azure } = createPlaygroundHost("dark", notify, () => now);
        expect(await toolbox.utils.getCurrentTheme()).toBe("dark");
        expect(await toolbox.connections.getActiveConnection()).toMatchObject({ enabledForPowerPlatformAPI: true });
        await toolbox.utils.showNotification({ title: "Sample", body: "Offline notification" });
        expect(notify).toHaveBeenCalledWith("Sample: Offline notification");
        expect(await azure.arm.authenticate()).toMatchObject({ signedIn: true, connectionId: "playground" });
        expect((await azure.arm.listSubscriptions()).data?.value).toHaveLength(2);
    });

    it("runs independent jobs through the unmodified loader with its one-minute wait and gzip decoding", async () => {
        vi.useFakeTimers();
        const { raw } = createPlaygroundHost("light", () => undefined, () => now);
        const post = vi.spyOn(raw, "Post");
        const get = vi.spyOn(raw, "Get");
        const agents = loadReport("FeatureDetailsPerResource", range, "Daily", () => undefined, undefined, raw);
        const billing = loadReport("BillingDetailsPerEnvironment", range, "Daily", () => undefined, undefined, raw);
        await vi.advanceTimersByTimeAsync(59999);
        expect(post).toHaveBeenCalledTimes(2);
        expect(get).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(await agents).toHaveLength(240);
        expect(await billing).toHaveLength(90);
        expect(get).toHaveBeenCalledTimes(4);
    });

    it("rejects unsupported routes instead of forwarding any request to a service", async () => {
        const { raw, azure } = createPlaygroundHost("dark", () => undefined, () => now);
        await expect(raw.Get("https://example.invalid")).rejects.toThrow("Unknown playground");
        await expect(raw.Post("unexpected", {})).rejects.toThrow("Unsupported playground");
        await expect(azure.arm.Get("unexpected")).rejects.toThrow("not implemented");
        await expect(azure.arm.nextPage("unexpected")).rejects.toThrow("not implemented");
    });
});
