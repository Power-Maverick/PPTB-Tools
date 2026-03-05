import { AUDIT_ACTIONS, AuditEntry, AuditFieldChange, AuditFilters, DataverseEntity, RawAuditRecord } from "../models/interfaces";

/**
 * Parse the changedata JSON blob from a Dataverse audit record.
 * Returns an array of field-level changes, or an empty array if not available.
 */
function parseChangeData(changedata: string | null | undefined): AuditFieldChange[] {
    if (!changedata) return [];

    try {
        const parsed = JSON.parse(changedata) as {
            changedAttributes?: Array<{
                logicalName?: string;
                oldValue?: unknown;
                newValue?: unknown;
            }>;
        };

        if (!parsed.changedAttributes || !Array.isArray(parsed.changedAttributes)) {
            return [];
        }

        return parsed.changedAttributes.map((attr) => ({
            logicalName: attr.logicalName ?? "",
            displayName: attr.logicalName ?? "",
            oldValue: formatAuditValue(attr.oldValue),
            newValue: formatAuditValue(attr.newValue),
        }));
    } catch {
        return [];
    }
}

/** Format an audit value for display */
function formatAuditValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        // Handle EntityReference type
        if (obj.Name) return String(obj.Name);
        if (obj.name) return String(obj.name);
        if (obj.Id) return String(obj.Id);
        return JSON.stringify(value);
    }
    return String(value);
}

/**
 * Parse the attributemask (CSV of field logical names) into change objects.
 * Used as fallback when changedata is not available.
 */
function parseAttributeMask(attributemask: string | null | undefined): AuditFieldChange[] {
    if (!attributemask) return [];
    return attributemask
        .split(",")
        .filter(Boolean)
        .map((logicalName) => ({
            logicalName: logicalName.trim(),
            displayName: logicalName.trim(),
            oldValue: "",
            newValue: "",
        }));
}

/**
 * Client for querying Dataverse audit history via PPTB API
 */
export class AuditClient {
    /**
     * Fetch all entities from the environment (used to populate entity selector)
     */
    async fetchAllEntities(): Promise<DataverseEntity[]> {
        const result = await window.dataverseAPI.getAllEntitiesMetadata(
            ["DisplayName", "LogicalName", "PrimaryIdAttribute", "PrimaryNameAttribute", "ObjectTypeCode", "IsAuditEnabled"],
            "primary",
        );

        return result.value
            .map((meta: Record<string, unknown>) => {
                const displayName =
                    (meta.DisplayName as { UserLocalizedLabel?: { Label?: string }; LocalizedLabels?: Array<{ Label?: string }> } | null)
                        ?.UserLocalizedLabel?.Label ??
                    (meta.DisplayName as { UserLocalizedLabel?: { Label?: string }; LocalizedLabels?: Array<{ Label?: string }> } | null)
                        ?.LocalizedLabels?.[0]?.Label ??
                    String(meta.LogicalName ?? "");

                // IsAuditEnabled is a BooleanManagedProperty – the runtime value lives in .Value
                const auditProp = meta.IsAuditEnabled as { Value?: boolean } | boolean | null | undefined;
                const isAuditEnabled =
                    typeof auditProp === "boolean" ? auditProp : (auditProp?.Value ?? false);

                return {
                    logicalName: String(meta.LogicalName ?? ""),
                    displayName,
                    primaryIdAttribute: String(meta.PrimaryIdAttribute ?? ""),
                    primaryNameAttribute: String(meta.PrimaryNameAttribute ?? "name"),
                    objectTypeCode: Number(meta.ObjectTypeCode ?? 0),
                    isAuditEnabled,
                };
            })
            .filter((e: DataverseEntity) => e.logicalName && e.objectTypeCode > 0 && e.isAuditEnabled)
            .sort((a: DataverseEntity, b: DataverseEntity) => a.displayName.localeCompare(b.displayName));
    }

    /**
     * Build and execute an audit FetchXML query for a given entity.
     * Optionally filters by record IDs obtained from the user's FetchXML.
     */
    async fetchAuditHistory(entity: DataverseEntity, filters: AuditFilters): Promise<AuditEntry[]> {
        // If the user provided a FetchXML, get record IDs first
        let recordIds: string[] | null = null;
        if (filters.fetchXml.trim()) {
            recordIds = await this.getRecordIdsFromFetchXml(filters.fetchXml.trim(), entity.primaryIdAttribute);
            if (recordIds.length === 0) {
                return [];
            }
        }

        const auditRecords = await this.queryAuditTable(entity, filters, recordIds);
        return this.processAuditRecords(auditRecords, entity.logicalName);
    }

    /**
     * Execute the user-supplied FetchXML and return the primary key values.
     */
    private async getRecordIdsFromFetchXml(fetchXml: string, primaryIdAttribute: string): Promise<string[]> {
        const result = await window.dataverseAPI.fetchXmlQuery(fetchXml, "primary");
        const records = result.value ?? [];
        return records.map((r: Record<string, unknown>) => String(r[primaryIdAttribute] ?? "")).filter(Boolean);
    }

    /**
     * Query the Dataverse `audits` entity using FetchXML.
     */
    private async queryAuditTable(entity: DataverseEntity, filters: AuditFilters, recordIds: string[] | null): Promise<RawAuditRecord[]> {
        const conditions: string[] = [];

        // Filter by entity object type code
        conditions.push(`<condition attribute="objecttypecode" operator="eq" value="${entity.objectTypeCode}"/>`);

        // Date range filters
        if (filters.dateFrom) {
            conditions.push(`<condition attribute="createdon" operator="on-or-after" value="${filters.dateFrom}"/>`);
        }
        if (filters.dateTo) {
            conditions.push(`<condition attribute="createdon" operator="on-or-before" value="${filters.dateTo}"/>`);
        }

        // Action type filter
        if (filters.selectedActions.length > 0) {
            const actionConditions = filters.selectedActions
                .map((a) => `<condition attribute="action" operator="eq" value="${a}"/>`)
                .join("");
            conditions.push(`<filter type="or">${actionConditions}</filter>`);
        }

        // Record ID filter from FetchXML
        if (recordIds && recordIds.length > 0) {
            const idConditions = recordIds.map((id) => `<condition attribute="objectid" operator="eq" value="${id}"/>`).join("");
            conditions.push(`<filter type="or">${idConditions}</filter>`);
        }

        const filterBlock = conditions.length > 0 ? `<filter type="and">${conditions.join("")}</filter>` : "";

        const fetchXml = `
<fetch top="${filters.topCount}" no-lock="true">
  <entity name="audit">
    <attribute name="auditid"/>
    <attribute name="createdon"/>
    <attribute name="action"/>
    <attribute name="objecttypecode"/>
    <attribute name="changedata"/>
    <attribute name="attributemask"/>
    <attribute name="objectid"/>
    ${filterBlock}
    <order attribute="createdon" descending="true"/>
    <link-entity name="systemuser" from="systemuserid" to="userid" link-type="outer" alias="username">
      <attribute name="fullname"/>
    </link-entity>
  </entity>
</fetch>`.trim();

        const result = await window.dataverseAPI.fetchXmlQuery(fetchXml, "primary");
        return (result.value ?? []) as RawAuditRecord[];
    }

    /**
     * Convert raw audit records into structured AuditEntry objects.
     */
    private processAuditRecords(records: RawAuditRecord[], entityLogicalName: string): AuditEntry[] {
        return records.map((raw) => {
            const action = Number(raw.action ?? 0);
            const actionLabel = AUDIT_ACTIONS[action] ?? `Action ${action}`;

            // Extract the record ID.
            // FetchXML link-entity aliases produce "_objectid_value" in some PPTB builds
            // while a direct attribute alias returns "objectid". Both are handled here.
            const recordId = String(
                raw["_objectid_value"] ?? raw["objectid"] ?? "",
            );

            // Extract user name from the aliased link-entity column
            const userName = String(
                raw["username.fullname"] ??
                    raw["username_fullname"] ??
                    raw["fullname"] ??
                    "Unknown User",
            );

            // Parse field changes from changedata, fall back to attributemask
            let changedFields = parseChangeData(raw.changedata);
            if (changedFields.length === 0 && raw.attributemask) {
                changedFields = parseAttributeMask(raw.attributemask);
            }

            return {
                auditId: String(raw.auditid ?? ""),
                recordId,
                recordName: recordId,
                entityLogicalName,
                action,
                actionLabel,
                createdOn: String(raw.createdon ?? ""),
                userName,
                changedFields,
            } satisfies AuditEntry;
        });
    }
}
