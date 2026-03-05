/** A selectable Dataverse entity */
export interface DataverseEntity {
    logicalName: string;
    displayName: string;
    primaryIdAttribute: string;
    primaryNameAttribute: string;
    objectTypeCode: number;
    isAuditEnabled: boolean;
}

/** A single field-level change inside an audit entry */
export interface AuditFieldChange {
    logicalName: string;
    displayName: string;
    oldValue: string;
    newValue: string;
}

/** A processed audit entry (one audit record from Dataverse) */
export interface AuditEntry {
    auditId: string;
    recordId: string;
    recordName: string;
    entityLogicalName: string;
    action: number;
    actionLabel: string;
    createdOn: string;
    userName: string;
    changedFields: AuditFieldChange[];
}

/** Raw audit record returned by the Dataverse API */
export interface RawAuditRecord {
    auditid: string;
    createdon: string;
    action: number;
    objecttypecode: string | number;
    changedata?: string | null;
    attributemask?: string | null;
    _objectid_value?: string;
    "username.fullname"?: string;
    username_fullname?: string;
    [key: string]: unknown;
}

/** Audit action types */
export const AUDIT_ACTIONS: Record<number, string> = {
    1: "Create",
    2: "Update",
    3: "Delete",
    4: "Activate",
    5: "Deactivate",
    11: "Cascade",
    12: "Merge",
    13: "Assign",
    41: "E-mail",
    55: "Win",
    56: "Lose",
    57: "Retire",
    65: "Resolve",
    70: "Publish",
    71: "Publish All",
    72: "Send",
    73: "Receive",
    74: "Unresolved",
    76: "Close",
};

/** Active filters for the audit query */
export interface AuditFilters {
    dateFrom: string;
    dateTo: string;
    selectedActions: number[];
    fetchXml: string;
    topCount: number;
    /** Primary record ID (GUID) or primary name — applied server-side at query time */
    recordSearch: string;
    /** Client-side: show only audit entries that touched this field (logical name substring match) */
    changedFieldFilter: string;
}
