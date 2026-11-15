import { describe, expect, it } from "vitest";
import type { FeatureRow } from "../../src/api/reports";
import { comparePeriods, dailySeries, detectUsageSpikes, forecastMonthEnd } from "../../src/data/analysis";
import { serializeCsv } from "../../src/data/export";

function featureRow(date: string, agentId: string, billedCredit: number): FeatureRow {
    return {
        agentName: agentId,
        agentId,
        product: "",
        feature: "",
        billedCredit,
        nonBilledCredit: 0,
        channel: "",
        knowledgeSources: "",
        toolUsed: "",
        model: "",
        scenarioName: "",
        environmentId: "",
        environmentName: "",
        consumptionDate: date,
    };
}

describe("usage analysis helpers", () => {
    it("fills days without report rows with zero usage for the selected range", () => {
        expect(dailySeries([
            featureRow("2026-11-10", "agent-1", 10),
            featureRow("2026-11-12", "agent-1", 5),
        ], "2026-11-10", "2026-11-12")).toEqual([
            { date: "2026-11-10", billedCredit: 10 },
            { date: "2026-11-11", billedCredit: 0 },
            { date: "2026-11-12", billedCredit: 5 },
        ]);
    });

    it("compares the two halves of a selected period by agent", () => {
        const comparison = comparePeriods([
            featureRow("2026-11-10", "agent-1", 4),
            featureRow("2026-11-11", "agent-1", 6),
            featureRow("2026-11-12", "agent-1", 12),
            featureRow("2026-11-13", "agent-2", 7),
        ], "2026-11-10", "2026-11-13");

        expect(comparison).toMatchObject({
            earlierBilled: 10,
            laterBilled: 19,
            agents: [
                { agentId: "agent-1", earlierBilled: 10, laterBilled: 12 },
                { agentId: "agent-2", earlierBilled: 0, laterBilled: 7 },
            ],
        });
        expect(comparison?.earlierStart).toBe("2026-11-10");
        expect(comparison?.earlierEnd).toBe("2026-11-11");
    });

    it("flags daily usage greater than twice the preceding 7-day average", () => {
        const days = Array.from({ length: 8 }, (_, index) => ({
            date: `2026-11-${String(index + 1).padStart(2, "0")}`,
            billedCredit: index === 7 ? 21 : 10,
        }));

        expect(detectUsageSpikes(days)).toEqual([
            { date: "2026-11-08", billedCredit: 21, baselineAverage: 10 },
        ]);
    });

    it("forecasts month-end from exactly 30 daily values", () => {
        const days = Array.from({ length: 30 }, (_, index) => ({
            date: `2026-10-${String(index + 1).padStart(2, "0")}`,
            billedCredit: 10,
        }));

        expect(forecastMonthEnd(days, 2026, 10)).toBe(300);
        expect(forecastMonthEnd(days.slice(1), 2026, 10)).toBeUndefined();
    });

    it("escapes quotes and prefixes exported CSV for spreadsheet compatibility", () => {
        expect(serializeCsv(["Agent", "Credits"], [['Agent "A"', 12]])).toBe(
            '\uFEFF"Agent","Credits"\r\n"Agent ""A""","12"',
        );
    });
});
