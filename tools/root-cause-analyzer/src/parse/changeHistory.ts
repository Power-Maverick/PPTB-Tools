import type { ValueChange } from "../model/types";
import { columnFromKey, FORMATTED, isAnnotationKey, str } from "./values";

export interface ParsedChangeHistory {
    /** auditid → column changes */
    byAuditId: Map<string, ValueChange[]>;
    /** Oldest audit createdon seen on this page (ISO), to know when to stop paging. */
    oldest?: string;
    more: boolean;
    pagingCookie?: string;
    warnings: string[];
}

type Row = Record<string, unknown>;

/** Columns present in every audited entity image that aren't real changes. */
const NOISE = new Set(["versionnumber", "modifiedon", "modifiedby", "modifiedonbehalfby", "@odata.etag"]);

/**
 * Parses the RetrieveRecordChangeHistory response:
 * { AuditDetailCollection: { AuditDetails: [{ AuditRecord, OldValue, NewValue }], MoreRecords, PagingCookie } }
 * Never throws; unexpected shapes become warnings.
 */
export function parseChangeHistory(response: unknown, primaryIdColumn?: string): ParsedChangeHistory {
    const result: ParsedChangeHistory = { byAuditId: new Map(), more: false, warnings: [] };
    if (!response || typeof response !== "object") {
        result.warnings.push("Change history response was empty.");
        return result;
    }
    const root = response as Row;
    const collection = (root.AuditDetailCollection ?? root) as Row;
    const details = collection.AuditDetails;
    if (!Array.isArray(details)) {
        result.warnings.push("Change history response had no AuditDetails.");
        return result;
    }
    result.more = collection.MoreRecords === true;
    result.pagingCookie = str(collection.PagingCookie);

    for (const detail of details as Row[]) {
        const record = detail.AuditRecord as Row | undefined;
        const auditId = str(record?.auditid)?.toLowerCase();
        if (!auditId) continue;
        const createdOn = str(record?.createdon);
        if (createdOn && (!result.oldest || createdOn < result.oldest)) result.oldest = createdOn;

        if (detail.Principal !== undefined || detail.NewPrivileges !== undefined) {
            result.byAuditId.set(auditId, [shareChange(detail)]);
            continue;
        }
        const oldValue = (detail.OldValue ?? {}) as Row;
        const newValue = (detail.NewValue ?? {}) as Row;
        if (detail.OldValue === undefined && detail.NewValue === undefined) continue; // relationship / other detail types
        result.byAuditId.set(auditId, diffImages(oldValue, newValue, primaryIdColumn));
    }
    return result;
}

/** ShareAuditDetail: who the record was shared with, and the access before / after. */
export function shareChange(detail: Row): ValueChange {
    const principal = (detail.Principal ?? {}) as Row;
    const type = str(principal["@odata.type"])?.replace(/^#Microsoft\.Dynamics\.CRM\./, "") ?? "principal";
    const id = Object.entries(principal).find(([k, v]) => !k.includes("@") && typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v))?.[1] as string | undefined;
    const access = (v: unknown) => (v === undefined || v === null || v === "" || v === "None" ? undefined : String(v));
    return { column: `access for ${type}${id ? ` ${id.slice(0, 8)}` : ""}`, oldValue: access(detail.OldPrivileges), newValue: access(detail.NewPrivileges) };
}

export function diffImages(oldValue: Row, newValue: Row, primaryIdColumn?: string): ValueChange[] {
    const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)].filter((k) => !isAnnotationKey(k)));
    const changes: ValueChange[] = [];
    for (const key of keys) {
        const column = columnFromKey(key);
        if (NOISE.has(column) || column === primaryIdColumn) continue;
        const before = render(oldValue, key);
        const after = render(newValue, key);
        if (before === after) continue;
        changes.push({ column, oldValue: before, newValue: after });
    }
    return changes.sort((a, b) => a.column.localeCompare(b.column));
}

function render(row: Row, key: string): string | undefined {
    if (!(key in row)) return undefined;
    const f = row[`${key}${FORMATTED}`];
    if (typeof f === "string") return f;
    const v = row[key];
    if (v === null || v === undefined) return undefined;
    return typeof v === "object" ? JSON.stringify(v) : String(v);
}
