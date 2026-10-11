// Helpers for reading Web API rows (with odata.include-annotations="*").

export const FORMATTED = "@OData.Community.Display.V1.FormattedValue";
export const LOOKUP_TABLE = "@Microsoft.Dynamics.CRM.lookuplogicalname";

type Row = Record<string, unknown>;

export function str(value: unknown): string | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    return typeof value === "string" ? value : String(value);
}

export function num(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
    return undefined;
}

export function bool(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === 1) return true;
    if (value === "false" || value === 0) return false;
    return undefined;
}

export function formatted(row: Row, key: string): string | undefined {
    return str(row[`${key}${FORMATTED}`]);
}

/** Lookup GUID, whether the row has `_col_value` (Web API) or `col` (some FetchXML shapes). */
export function lookupId(row: Row, column: string): string | undefined {
    const value = row[`_${column}_value`] ?? row[column];
    const s = str(value);
    return s && /^[0-9a-f-]{36}$/i.test(s) ? s.toLowerCase() : undefined;
}

export function lookupName(row: Row, column: string): string | undefined {
    return formatted(row, `_${column}_value`) ?? formatted(row, column);
}

export function lookupTable(row: Row, column: string): string | undefined {
    return str(row[`_${column}_value${LOOKUP_TABLE}`]) ?? str(row[`${column}${LOOKUP_TABLE}`]);
}

/** "_parentaccountid_value" → "parentaccountid" */
export function columnFromKey(key: string): string {
    const m = /^_(.+)_value$/.exec(key);
    return (m ? m[1] : key).toLowerCase();
}

/** Display value for a column: formatted value if present, otherwise the raw value. */
export function displayValue(row: Row, key: string): string | undefined {
    return formatted(row, key) ?? str(row[key]);
}

export function isAnnotationKey(key: string): boolean {
    return key.includes("@") || key.startsWith("odata.");
}

export function splitList(value: unknown): string[] | undefined {
    const s = str(value);
    if (!s) return undefined;
    const items = s
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    return items.length ? items : undefined;
}

export function guidLower(value: unknown): string | undefined {
    const s = str(value);
    return s ? s.replace(/[{}]/g, "").toLowerCase() : undefined;
}

export function truncate(text: string | undefined, max = 400): string | undefined {
    if (!text) return text;
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
