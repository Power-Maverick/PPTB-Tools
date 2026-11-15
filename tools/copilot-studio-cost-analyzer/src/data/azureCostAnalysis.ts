import type { AzureAPI } from "../types/azureAPI";

export interface AzureCostRow {
    /** UTC date (YYYY-MM-DD), when the response includes one. */
    date: string;
    group: string;
    cost: number;
    currency: string;
}

export interface CurrencyTotal {
    currency: string;
    total: number;
    rows: number;
}

export interface GroupTotal {
    group: string;
    currency: string;
    total: number;
    share: number;
}

export interface CostDay {
    date: string;
    total: number;
}

const COST_COLUMNS = ["totalcost", "pretaxcost", "cost", "costusd"];
const DATE_COLUMNS = ["usagedate", "date", "billingmonth"];

function columnIndex(columns: Array<{ name: string }>, names: string[]): number {
    const lower = columns.map((column) => column.name.toLowerCase());
    for (const name of names) {
        const index = lower.indexOf(name);
        if (index >= 0) return index;
    }
    return -1;
}

export function normalizeCostDate(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    const text = String(value).trim();
    if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

/** Locates columns by name on every page; the service may reorder or rename them between agreements. */
export function parseCostResult(result: AzureAPI.CostQueryResult, grouping?: string): AzureCostRow[] {
    const columns = result.properties?.columns ?? [];
    const rows = result.properties?.rows ?? [];
    if (rows.length === 0) return [];
    const costIndex = columnIndex(columns, COST_COLUMNS);
    if (costIndex < 0) throw new Error("Azure returned cost rows without a recognizable cost column.");
    const currencyIndex = columnIndex(columns, ["currency", "billingcurrency"]);
    const dateIndex = columnIndex(columns, DATE_COLUMNS);
    const groupIndex = grouping ? columnIndex(columns, [grouping.toLowerCase()]) : -1;
    const parsed: AzureCostRow[] = [];
    for (const row of rows) {
        const cost = Number(row[costIndex]);
        if (!Number.isFinite(cost)) continue;
        const groupValue = groupIndex >= 0 ? row[groupIndex] : null;
        parsed.push({
            date: dateIndex >= 0 ? normalizeCostDate(row[dateIndex]) : "",
            group: groupValue === null || groupValue === undefined || groupValue === "" ? (grouping ? "Unassigned" : "All costs") : String(groupValue),
            cost,
            currency: currencyIndex >= 0 && row[currencyIndex] ? String(row[currencyIndex]).toUpperCase() : "Unknown",
        });
    }
    return parsed;
}

/** Totals are kept per currency; amounts in different currencies are never summed. */
export function totalsByCurrency(rows: AzureCostRow[]): CurrencyTotal[] {
    const totals = new Map<string, CurrencyTotal>();
    for (const row of rows) {
        const current = totals.get(row.currency) ?? { currency: row.currency, total: 0, rows: 0 };
        current.total += row.cost;
        current.rows += 1;
        totals.set(row.currency, current);
    }
    return [...totals.values()].sort((a, b) => b.total - a.total);
}

export function groupTotals(rows: AzureCostRow[]): GroupTotal[] {
    const currencyTotals = new Map(totalsByCurrency(rows).map((total) => [total.currency, total.total]));
    const groups = new Map<string, GroupTotal>();
    for (const row of rows) {
        const key = `${row.currency}\u0000${row.group}`;
        const current = groups.get(key) ?? { group: row.group, currency: row.currency, total: 0, share: 0 };
        current.total += row.cost;
        groups.set(key, current);
    }
    return [...groups.values()]
        .map((group) => {
            const currencyTotal = currencyTotals.get(group.currency) ?? 0;
            return { ...group, share: currencyTotal > 0 ? group.total / currencyTotal : 0 };
        })
        .sort((a, b) => a.currency.localeCompare(b.currency) || b.total - a.total);
}

export function dailyCostSeries(rows: AzureCostRow[], currency: string): CostDay[] {
    const days = new Map<string, number>();
    for (const row of rows) {
        if (row.currency !== currency || !row.date) continue;
        days.set(row.date, (days.get(row.date) ?? 0) + row.cost);
    }
    return [...days.entries()].map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Shortens ARM resource IDs for display; the full value remains available for export and tooltips. */
export function displayGroup(value: string): string {
    if (!value.startsWith("/subscriptions/")) return value;
    const segments = value.split("/").filter(Boolean);
    return segments[segments.length - 1] || value;
}
