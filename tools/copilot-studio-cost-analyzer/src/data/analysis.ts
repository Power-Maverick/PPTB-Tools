import type { BillingRow, FeatureRow } from "../api/reports";

export interface AgentTotal {
    agentId: string;
    agentName: string;
    environmentId: string;
    environmentName: string;
    rows: number;
    billedCredit: number;
    nonBilledCredit: number;
}

export interface DayTotal {
    date: string;
    billedCredit: number;
}

export interface BillingTotal {
    environmentId: string;
    environmentName: string;
    rows: number;
    prepaidConsumed: number;
    payGoConsumed: number;
}

export interface PeriodComparison {
    earlierStart: string;
    earlierEnd: string;
    laterStart: string;
    laterEnd: string;
    earlierBilled: number;
    laterBilled: number;
    agents: Array<{
        agentId: string;
        agentName: string;
        earlierBilled: number;
        laterBilled: number;
    }>;
}

export interface UsageSpike {
    date: string;
    billedCredit: number;
    baselineAverage: number;
}

function addDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

export function dailySeries(rows: FeatureRow[], startDate: string, endDate: string): DayTotal[] {
    const totals = new Map(aggregateDays(rows).map(({ date, billedCredit }) => [date.slice(0, 10), billedCredit]));
    const days: DayTotal[] = [];
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
        days.push({ date, billedCredit: totals.get(date) ?? 0 });
    }
    return days;
}

export function comparePeriods(rows: FeatureRow[], startDate: string, endDate: string): PeriodComparison | undefined {
    const days = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
    if (!Number.isFinite(days) || days < 2) return undefined;
    const laterDays = Math.ceil(days / 2);
    const laterStart = addDays(startDate, days - laterDays);
    const earlierEnd = addDays(laterStart, -1);
    const earlierRows = rows.filter((row) => row.consumptionDate.slice(0, 10) >= startDate && row.consumptionDate.slice(0, 10) <= earlierEnd);
    const laterRows = rows.filter((row) => row.consumptionDate.slice(0, 10) >= laterStart && row.consumptionDate.slice(0, 10) <= endDate);
    const earlierByAgent = new Map<string, number>();
    const laterByAgent = new Map<string, number>();
    const agentNames = new Map<string, string>();
    for (const row of earlierRows) {
        const key = row.agentId || row.agentName;
        earlierByAgent.set(key, (earlierByAgent.get(key) ?? 0) + row.billedCredit);
        if (row.agentName) agentNames.set(key, row.agentName);
    }
    for (const row of laterRows) {
        const key = row.agentId || row.agentName;
        laterByAgent.set(key, (laterByAgent.get(key) ?? 0) + row.billedCredit);
        if (row.agentName) agentNames.set(key, row.agentName);
    }
    const agentKeys = new Set([...earlierByAgent.keys(), ...laterByAgent.keys()]);
    return {
        earlierStart: startDate,
        earlierEnd,
        laterStart,
        laterEnd: endDate,
        earlierBilled: [...earlierByAgent.values()].reduce((total, value) => total + value, 0),
        laterBilled: [...laterByAgent.values()].reduce((total, value) => total + value, 0),
        agents: [...agentKeys].map((agentId) => ({
            agentId,
            agentName: agentNames.get(agentId) || agentId || "Unknown agent",
            earlierBilled: earlierByAgent.get(agentId) ?? 0,
            laterBilled: laterByAgent.get(agentId) ?? 0,
        })).sort((a, b) => b.laterBilled - a.laterBilled),
    };
}

export function detectUsageSpikes(days: DayTotal[], multiplier = 2): UsageSpike[] {
    const spikes: UsageSpike[] = [];
    for (let index = 7; index < days.length; index++) {
        const baseline = days.slice(index - 7, index).reduce((total, day) => total + day.billedCredit, 0) / 7;
        const current = days[index];
        if (current.billedCredit > 0 && current.billedCredit > baseline * multiplier) {
            spikes.push({ date: current.date, billedCredit: current.billedCredit, baselineAverage: baseline });
        }
    }
    return spikes;
}

export function forecastMonthEnd(days: DayTotal[], year: number, monthIndex: number): number | undefined {
    if (days.length !== 30) return undefined;
    const averageDaily = days.reduce((total, day) => total + day.billedCredit, 0) / 30;
    return averageDaily * new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function aggregateAgents(rows: FeatureRow[]): AgentTotal[] {
    const totals = new Map<string, AgentTotal>();
    for (const row of rows) {
        const key = `${row.agentId}|${row.environmentId}`;
        const total = totals.get(key) ?? {
            agentId: row.agentId,
            agentName: row.agentName,
            environmentId: row.environmentId,
            environmentName: row.environmentName,
            rows: 0,
            billedCredit: 0,
            nonBilledCredit: 0,
        };
        total.rows++;
        total.billedCredit += row.billedCredit;
        total.nonBilledCredit += row.nonBilledCredit;
        if (!total.agentName && row.agentName) total.agentName = row.agentName;
        if (!total.environmentName && row.environmentName) total.environmentName = row.environmentName;
        totals.set(key, total);
    }
    return [...totals.values()].sort((a, b) => b.billedCredit - a.billedCredit);
}

export function aggregateDays(rows: FeatureRow[]): DayTotal[] {
    const totals = new Map<string, number>();
    for (const row of rows) {
        const date = row.consumptionDate.slice(0, 10);
        if (date) totals.set(date, (totals.get(date) ?? 0) + row.billedCredit);
    }
    return [...totals].map(([date, billedCredit]) => ({ date, billedCredit })).sort((a, b) => a.date.localeCompare(b.date));
}

export function aggregateBilling(rows: BillingRow[]): BillingTotal[] {
    const totals = new Map<string, BillingTotal>();
    for (const row of rows) {
        const total = totals.get(row.environmentId) ?? {
            environmentId: row.environmentId,
            environmentName: row.environmentName,
            rows: 0,
            prepaidConsumed: 0,
            payGoConsumed: 0,
        };
        total.rows++;
        total.prepaidConsumed += row.prepaidConsumed;
        total.payGoConsumed += row.payGoConsumed;
        if (!total.environmentName && row.environmentName) total.environmentName = row.environmentName;
        totals.set(row.environmentId, total);
    }
    return [...totals.values()].sort((a, b) => b.payGoConsumed + b.prepaidConsumed - (a.payGoConsumed + a.prepaidConsumed));
}
