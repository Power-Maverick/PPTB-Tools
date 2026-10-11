/**
 * audit.attributemask is a comma-separated list of AttributeMetadata.ColumnNumber values,
 * e.g. ",12,47,". Unknown numbers are returned separately rather than dropped.
 */
export function decodeAttributeMask(mask: unknown, columnNumbers: Map<number, string>): { columns: string[]; unknown: number[] } {
    if (typeof mask !== "string" || !mask.trim()) return { columns: [], unknown: [] };
    const columns: string[] = [];
    const unknown: number[] = [];
    for (const part of mask.split(",")) {
        const n = Number(part.trim());
        if (!part.trim() || !Number.isInteger(n)) continue;
        const name = columnNumbers.get(n);
        if (name) {
            if (!columns.includes(name)) columns.push(name);
        } else unknown.push(n);
    }
    return { columns, unknown };
}
