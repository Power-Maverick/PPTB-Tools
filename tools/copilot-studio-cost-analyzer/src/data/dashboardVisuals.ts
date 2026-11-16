import type { BillingRow, FeatureRow, ReportRange } from "../api/reports";
import { dailySeries } from "./analysis";
import { dailyCostSeries, type AzureCostRow } from "./azureCostAnalysis";

export interface TrendPoint {
    date: string;
    values: number[] | undefined;
}

export function dashboardTrend(
    metric: "credits" | "capacity" | "azure",
    range: ReportRange,
    agents: FeatureRow[],
    billing: BillingRow[],
    costs: AzureCostRow[],
    currency: string,
): TrendPoint[] {
    const values = new Map<string, number[]>();
    if (metric === "azure") {
        for (const day of dailyCostSeries(costs, currency)) values.set(day.date, [day.total]);
    } else if (metric === "credits") {
        for (const row of agents) {
            const date = row.consumptionDate.slice(0, 10);
            values.set(date, [(values.get(date)?.[0] ?? 0) + row.billedCredit]);
        }
    } else {
        for (const row of billing) {
            const date = row.billedDate.slice(0, 10);
            const current = values.get(date) ?? [0, 0];
            values.set(date, [current[0] + row.prepaidConsumed, current[1] + row.payGoConsumed]);
        }
    }
    return dailySeries([], range.startDate, range.endDate).map(({ date }) => ({ date, values: values.get(date) }));
}

export function trendDomain(points: TrendPoint[]): { min: number; max: number } {
    const positive = points.map((point) => (point.values ?? []).reduce((sum, value) => sum + Math.max(0, value), 0));
    const negative = points.map((point) => (point.values ?? []).reduce((sum, value) => sum + Math.min(0, value), 0));
    const min = Math.min(0, ...negative);
    const max = Math.max(0, ...positive);
    return { min, max: max === min ? min + 1 : max };
}

export function trendSegments(points: TrendPoint[]): Array<Array<{ index: number; value: number }>> {
    const segments: Array<Array<{ index: number; value: number }>> = [];
    let segment: Array<{ index: number; value: number }> = [];
    points.forEach((point, index) => {
        if (point.values) segment.push({ index, value: point.values[0] });
        else if (segment.length) {
            segments.push(segment);
            segment = [];
        }
    });
    if (segment.length) segments.push(segment);
    return segments;
}

export function consumptionShare(part: number, whole: number): number | undefined {
    return whole > 0 && part >= 0 && part <= whole ? part / whole * 100 : undefined;
}
