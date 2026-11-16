import type { ReportRange } from "../api/reports";

export function reportReadinessMessage(agentsReady: boolean, billingReady: boolean, azureReady: boolean): string | undefined {
    const sources = [
        { name: "Agent usage", ready: agentsReady, verb: "is" },
        { name: "Environment capacity", ready: billingReady, verb: "is" },
        { name: "Azure costs", ready: azureReady, verb: "are" },
    ].filter((source) => source.ready);
    if (sources.length === 0) return undefined;
    if (sources.length === 3) return "All 3 reports are ready.";
    const description = sources.length === 1
        ? `${sources[0].name} ${sources[0].verb} ready`
        : `Ready: ${sources.map((source) => source.name).join(" and ")}`;
    return `${description} · ${sources.length} of 3 reports ready.`;
}

function utcDay(now: Date, daysAgo: number): string {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return date.toISOString().slice(0, 10);
}

export function dashboardRangeError(range: ReportRange, now = new Date()): string | undefined {
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(range.startDate) || !validDate(range.endDate) || range.startDate > range.endDate) return "Choose a valid UTC date range.";
    if (range.endDate > utcDay(now, 1)) return "Choose completed UTC days only (yesterday or earlier).";
    if (range.startDate < utcDay(now, 30)) return "The dashboard includes agent usage, which is retained for the last 30 complete UTC days.";
    return undefined;
}

export function isLatestThirtyDays(range: ReportRange, now = new Date()): boolean {
    return range.startDate === utcDay(now, 30) && range.endDate === utcDay(now, 1);
}

export function dateCoverage(values: string[]): string {
    const dates = values.map((value) => value.slice(0, 10)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
    return dates.length ? `${dates[0]} – ${dates[dates.length - 1]} (UTC)` : "No dated rows returned";
}
