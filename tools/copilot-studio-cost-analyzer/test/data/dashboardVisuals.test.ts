import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BillingRow, FeatureRow } from "../../src/api/reports";
import { ConsumptionSplit, DashboardVisuals, TrendChart } from "../../src/components/DashboardVisuals";
import { consumptionShare, dashboardTrend, trendDomain, trendSegments } from "../../src/data/dashboardVisuals";

const range = { startDate: "2026-11-10", endDate: "2026-11-12" };
const agent: FeatureRow = {
    agentId: "a", agentName: "Support", environmentId: "env", environmentName: "Production",
    product: "", feature: "", billedCredit: 10, nonBilledCredit: 2, channel: "", knowledgeSources: "",
    toolUsed: "", model: "", scenarioName: "", consumptionDate: "2026-11-10",
};
const billing: BillingRow = {
    tenantId: "", environmentId: "env", environmentName: "Production", entitlementId: "", billingPolicyId: "",
    entitledQuantity: 100, prepaidConsumed: 8, payGoConsumed: 2, billedDate: "2026-11-10",
};
const costs = [
    { date: "2026-11-10", group: "A", cost: 12, currency: "USD" },
    { date: "2026-11-10", group: "B", cost: 500, currency: "EUR" },
    { date: "2026-11-12", group: "A", cost: -4, currency: "USD" },
];

describe("dashboard visual data", () => {
    it("aggregates agent rows by UTC day and preserves missing dates versus reported zero", () => {
        expect(dashboardTrend("credits", range, [agent, { ...agent, billedCredit: 5 }, {
            ...agent, consumptionDate: "2026-11-12T10:00:00Z", billedCredit: 0,
        }], [], [], "")).toEqual([
            { date: "2026-11-10", values: [15] },
            { date: "2026-11-11", values: undefined },
            { date: "2026-11-12", values: [0] },
        ]);
    });

    it("keeps prepaid and PAYG values separate, without treating entitlement as consumption", () => {
        expect(dashboardTrend("capacity", range, [], [billing, { ...billing, prepaidConsumed: 2, payGoConsumed: 1 }], [], "")[0].values).toEqual([10, 3]);
    });

    it("isolates currency totals, preserves negative costs and does not invent data on missing dates", () => {
        const points = dashboardTrend("azure", range, [], [], costs, "USD");
        expect(points.map((point) => point.values)).toEqual([[12], undefined, [-4]]);
        expect(trendDomain(points)).toEqual({ min: -4, max: 12 });
        expect(trendSegments(points)).toEqual([[{ index: 0, value: 12 }], [{ index: 2, value: -4 }]]);
    });

    it("scales positive and negative stacks independently and handles empty/zero series", () => {
        expect(trendDomain([{ date: "", values: [8, -3] }])).toEqual({ min: -3, max: 8 });
        expect(trendDomain([])).toEqual({ min: 0, max: 1 });
        expect(trendDomain([{ date: "", values: [0] }])).toEqual({ min: 0, max: 1 });
        expect(trendSegments([{ date: "", values: [0] }])).toEqual([[{ index: 0, value: 0 }]]);
    });

    it("does not render misleading percentages for zero, negative or adjustment-dominated totals", () => {
        expect(consumptionShare(24, 100)).toBe(24);
        expect(consumptionShare(0, 100)).toBe(0);
        expect(consumptionShare(1, 0)).toBeUndefined();
        expect(consumptionShare(-1, 10)).toBeUndefined();
        expect(consumptionShare(12, 8)).toBeUndefined();
        expect(renderToStaticMarkup(createElement(ConsumptionSplit, { prepaid: 12, payg: -4 }))).toBe("");
    });
});

describe("dashboard visual rendering", () => {
    const props = {
        agents: [agent], billing: [billing], costs, agentRange: range, billingRange: range, azureRange: range,
        agentsReady: true, billingReady: true, azureReady: true, agentDaily: true, billingDaily: true,
        onAgent: () => undefined, onNavigate: () => undefined,
    };

    it("includes metric controls, currency selection, agent drilldowns and accessible daily values", () => {
        const html = renderToStaticMarkup(createElement(DashboardVisuals, props));
        expect(html).toContain('aria-label="Trend metric"');
        expect(html).toContain("Azure currency");
        expect(html).toContain('<option value="EUR"');
        expect(html).toContain("Accessible daily values");
        expect(html).toContain("Support");
        expect(html).toContain("No rows returned");
        expect(html).toContain("consumed credits are PAYG");
        expect(html).not.toContain("NaN");
    });

    it("falls back to Azure while credits are pending and disables unavailable metric controls", () => {
        const html = renderToStaticMarkup(createElement(DashboardVisuals, {
            ...props, agents: [], agentsReady: false, billing: [], billingReady: false,
        }));
        expect(html).toContain("Daily pre-tax charges");
        expect(html).toContain('aria-pressed="false" disabled="">Billed credits');
        expect(html).toContain("Waiting for the agent usage report");
        expect(html).not.toContain("potential daily usage spikes");
    });

    it("does not draw daily credit trends or forecasts for Summary data", () => {
        const html = renderToStaticMarkup(createElement(DashboardVisuals, {
            ...props, agentDaily: false, billingDaily: false, azureReady: false,
        }));
        expect(html).toContain("Load a Daily report");
        expect(html).toContain("Monthly estimate unavailable");
        expect(html).not.toContain("potential daily usage spikes");
    });

    it("renders a gap as separate lines and provides keyboard-focusable exact values", () => {
        const html = renderToStaticMarkup(createElement(TrendChart, {
            points: dashboardTrend("azure", range, [], [], costs, "USD"), labels: ["USD"],
            format: String, teal: true,
        }));
        expect(html.match(/<polyline/g)).toHaveLength(2);
        expect(html.match(/tabindex="0"/g)).toHaveLength(3);
        expect(html).toContain("2026-11-12: USD -4");
        expect(html).not.toContain("NaN");
    });
});
