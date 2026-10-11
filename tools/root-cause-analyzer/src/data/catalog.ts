import type { ReadOnlyDataverse } from "../host/readOnlyDataverse";
import type { ParsedRecordRef } from "../parse/recordUrl";

export interface TableInfo {
    logicalName: string;
    displayName: string;
    entitySetName?: string;
    objectTypeCode?: number;
}

export interface ColumnInfo {
    logicalName: string;
    displayName: string;
    type?: string;
}

export function label(value: unknown): string | undefined {
    const localized = (value as { UserLocalizedLabel?: { Label?: string }; LocalizedLabels?: Array<{ Label?: string }> } | undefined) ?? undefined;
    return localized?.UserLocalizedLabel?.Label ?? localized?.LocalizedLabels?.[0]?.Label;
}

export async function loadTables(dv: ReadOnlyDataverse): Promise<TableInfo[]> {
    const entities = await dv.allEntities(["LogicalName", "DisplayName", "EntitySetName", "ObjectTypeCode"]);
    return entities
        .map((e) => ({
            logicalName: e.LogicalName,
            displayName: label(e.DisplayName) ?? e.LogicalName,
            entitySetName: e.EntitySetName as string | undefined,
            objectTypeCode: e.ObjectTypeCode as number | undefined,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function loadColumns(dv: ReadOnlyDataverse, table: string): Promise<ColumnInfo[]> {
    const attributes = await dv.entityAttributes(table, ["LogicalName", "DisplayName", "AttributeType", "AttributeOf", "IsValidForRead"]);
    return attributes
        .filter((a) => !a.AttributeOf && a.IsValidForRead !== false)
        .map((a) => ({ logicalName: String(a.LogicalName), displayName: label(a.DisplayName) ?? String(a.LogicalName), type: a.AttributeType as string | undefined }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Pure: maps whatever the URL gave us (etn / entity set / type code) to a logical name. */
export function resolveTable(ref: ParsedRecordRef, tables: TableInfo[]): string | undefined {
    if (ref.table) return tables.find((t) => t.logicalName === ref.table)?.logicalName ?? ref.table;
    if (ref.entitySet) return tables.find((t) => t.entitySetName?.toLowerCase() === ref.entitySet!.toLowerCase())?.logicalName;
    if (ref.objectTypeCode !== undefined) return tables.find((t) => t.objectTypeCode === ref.objectTypeCode)?.logicalName;
    return undefined;
}
