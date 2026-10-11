import { classifyError } from "../host/errors";
import type { ReadOnlyDataverse } from "../host/readOnlyDataverse";
import type { PreflightCheck } from "../model/types";

export interface TargetAuditFacts {
    table: string;
    tableExists: boolean;
    tableAudit?: boolean;
    column?: { name: string; exists: boolean; audit?: boolean };
    error?: string;
}

/** IsAuditEnabled is a BooleanManagedProperty ({ Value }) on both tables and columns. */
export function managedBool(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object" && typeof (value as { Value?: unknown }).Value === "boolean") return (value as { Value: boolean }).Value;
    return undefined;
}

export async function gatherTargetAudit(dv: ReadOnlyDataverse, table: string, column?: string): Promise<TargetAuditFacts> {
    try {
        const meta = await dv.entityMetadata(table, ["LogicalName", "IsAuditEnabled"]);
        const facts: TargetAuditFacts = { table, tableExists: true, tableAudit: managedBool(meta.IsAuditEnabled) };
        if (column) {
            const attributes = await dv.entityAttributes(table, ["LogicalName", "IsAuditEnabled"]);
            const attr = attributes.find((a) => String(a.LogicalName).toLowerCase() === column.toLowerCase());
            facts.column = { name: column, exists: !!attr, audit: attr ? managedBool(attr.IsAuditEnabled) : undefined };
        }
        return facts;
    } catch (error) {
        const classified = classifyError(error);
        return { table, tableExists: classified.kind !== "notFound", error: classified.message };
    }
}

const AUDIT_FIX = "An admin can enable it in the table's (and column's) properties under Advanced options → \"Audit changes to its data\", then publish.";

export function evaluateTargetAudit(facts: TargetAuditFacts, orgAuditEnabled: boolean | undefined): PreflightCheck[] {
    const checks: PreflightCheck[] = [];
    if (!facts.tableExists) {
        return [{ id: `audit-table-${facts.table}`, group: "audit", title: `Table: ${facts.table}`, status: "error", summary: `Table '${facts.table}' doesn't exist in this environment.` }];
    }
    if (facts.error) {
        return [{ id: `audit-table-${facts.table}`, group: "audit", title: `Auditing: ${facts.table}`, status: "warning", summary: `Couldn't read audit settings for ${facts.table}.`, details: [facts.error] }];
    }

    const orgOff = orgAuditEnabled === false;
    if (facts.tableAudit === true) {
        checks.push({
            id: `audit-table-${facts.table}`,
            group: "audit",
            title: `Auditing: ${facts.table}`,
            status: orgOff ? "warning" : "ok",
            summary: orgOff ? `Auditing is on for ${facts.table}, but has no effect while environment auditing is off.` : `Auditing is on for ${facts.table}.`,
        });
    } else if (facts.tableAudit === false) {
        checks.push({
            id: `audit-table-${facts.table}`,
            group: "audit",
            title: `Auditing: ${facts.table}`,
            status: "error",
            summary: `Auditing is off for ${facts.table}.`,
            impact: `Changes to ${facts.table} records (who, when, old → new values) won't be available, so Overwrite can't be evaluated for this table.`,
            fix: AUDIT_FIX,
        });
    } else {
        checks.push({ id: `audit-table-${facts.table}`, group: "audit", title: `Auditing: ${facts.table}`, status: "warning", summary: `Couldn't tell whether auditing is on for ${facts.table}.` });
    }

    if (facts.column) {
        const id = `audit-column-${facts.table}-${facts.column.name}`;
        const title = `Auditing: ${facts.table}.${facts.column.name}`;
        if (!facts.column.exists) {
            checks.push({ id, group: "audit", title, status: "error", summary: `Column '${facts.column.name}' doesn't exist on ${facts.table}.` });
        } else if (facts.column.audit === false) {
            checks.push({
                id,
                group: "audit",
                title,
                status: "error",
                summary: `Auditing is off for column ${facts.column.name}.`,
                impact: "Before → after values for this column won't be available.",
                fix: AUDIT_FIX,
            });
        } else if (facts.column.audit === true) {
            checks.push({ id, group: "audit", title, status: facts.tableAudit === false || orgOff ? "warning" : "ok", summary: `Auditing is on for column ${facts.column.name}.` });
        }
    }
    return checks;
}
