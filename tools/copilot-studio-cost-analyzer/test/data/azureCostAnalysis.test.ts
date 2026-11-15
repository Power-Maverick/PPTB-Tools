import { describe, expect, it } from "vitest";
import { dailyCostSeries, displayGroup, groupTotals, normalizeCostDate, parseCostResult, totalsByCurrency } from "../../src/data/azureCostAnalysis";
import { azureChecks, powerPlatformChecks } from "../../src/data/prerequisites";

describe("Azure cost parsing", () => {
    it("locates columns by name regardless of order", () => {
        const rows = parseCostResult({
            properties: {
                columns: [
                    { name: "Currency", type: "String" },
                    { name: "ResourceGroupName", type: "String" },
                    { name: "UsageDate", type: "Number" },
                    { name: "Cost", type: "Number" },
                ],
                rows: [["usd", "rg-pp", 20260301, 4.25], ["USD", null, "2026-03-02T00:00:00", 1], ["USD", "rg", 20260303, "n/a"]],
            },
        }, "ResourceGroupName");
        expect(rows).toEqual([
            { date: "2026-03-01", group: "rg-pp", cost: 4.25, currency: "USD" },
            { date: "2026-03-02", group: "Unassigned", cost: 1, currency: "USD" },
        ]);
    });

    it("rejects pages without a cost column and accepts empty pages", () => {
        expect(parseCostResult({ properties: { columns: [], rows: [] } })).toEqual([]);
        expect(() => parseCostResult({ properties: { columns: [{ name: "Currency", type: "String" }], rows: [["USD"]] } })).toThrow(/cost column/);
    });

    it("normalizes supported date formats", () => {
        expect(normalizeCostDate(20260301)).toBe("2026-03-01");
        expect(normalizeCostDate("2026-03-01T00:00:00Z")).toBe("2026-03-01");
        expect(normalizeCostDate(null)).toBe("");
    });
});

describe("Azure cost aggregation", () => {
    const rows = [
        { date: "2026-03-01", group: "Copilot Studio", cost: 30, currency: "USD" },
        { date: "2026-03-02", group: "Copilot Studio", cost: 10, currency: "USD" },
        { date: "2026-03-01", group: "Dataverse", cost: 10, currency: "USD" },
        { date: "2026-03-01", group: "Copilot Studio", cost: 7, currency: "EUR" },
    ];

    it("never combines currencies", () => {
        expect(totalsByCurrency(rows)).toEqual([
            { currency: "USD", total: 50, rows: 3 },
            { currency: "EUR", total: 7, rows: 1 },
        ]);
    });

    it("computes group shares within each currency", () => {
        expect(groupTotals(rows)).toEqual([
            { group: "Copilot Studio", currency: "EUR", total: 7, share: 1 },
            { group: "Copilot Studio", currency: "USD", total: 40, share: 0.8 },
            { group: "Dataverse", currency: "USD", total: 10, share: 0.2 },
        ]);
    });

    it("builds a daily series for one currency", () => {
        expect(dailyCostSeries(rows, "USD")).toEqual([{ date: "2026-03-01", total: 40 }, { date: "2026-03-02", total: 10 }]);
    });

    it("shortens ARM resource IDs for display", () => {
        expect(displayGroup("/subscriptions/x/resourcegroups/rg/providers/microsoft.powerplatform/accounts/plan-a")).toBe("plan-a");
        expect(displayGroup("Copilot Studio")).toBe("Copilot Studio");
    });
});

describe("prerequisite checks", () => {
    it("reports Power Platform role and availability from report outcomes", () => {
        const denied = powerPlatformChecks({ connection: "ready", reportOutcome: "accessDenied" });
        expect(denied.find((check) => check.id === "pp-role")?.status).toBe("denied");
        expect(denied.find((check) => check.id === "pp-availability")?.status).toBe("unverified");
        expect(powerPlatformChecks({ connection: "disabled" }).find((check) => check.id === "pp-connection")?.status).toBe("missing");
    });

    it("explains missing Azure host support", () => {
        const checks = azureChecks({ available: false, approved: false, subscriptionId: "", subscriptionValid: false });
        expect(checks).toEqual([expect.objectContaining({ id: "azure-host", status: "missing" })]);
    });

    it("separates confirmed, missing, denied, and unverified Azure checks", () => {
        const checks = azureChecks({
            available: true,
            connection: {
                configured: false,
                signedIn: true,
                status: "disabled",
                connectionId: "c",
                connectionName: "Prod",
                authentication: "application",
                access: "unverified",
            },
            approved: false,
            subscriptionId: "11111111-2222-3333-4444-555555555555",
            subscriptionValid: true,
            lastErrorCode: "accessDenied",
        });
        const status = Object.fromEntries(checks.map((check) => [check.id, check.status]));
        expect(status).toMatchObject({
            "azure-host": "ok",
            "azure-enabled": "missing",
            "azure-approval": "unverified",
            "azure-scope": "ok",
            "azure-cost-access": "denied",
        });
        expect(checks.find((check) => check.id === "azure-identity")?.detail).toContain("service principal");
    });
});
