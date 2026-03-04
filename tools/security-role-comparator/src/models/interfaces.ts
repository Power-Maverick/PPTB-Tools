export interface SecurityRole {
    roleid: string;
    name: string;
    _businessunitid_value?: string;
}

export interface Privilege {
    privilegeid: string;
    name: string;
    accessright: number;
}

export interface RolePrivilegeDepth {
    privilegeid: string;
    privilegedepthid: PrivilegeDepth;
}

/** Privilege depth levels as used by Dataverse */
export enum PrivilegeDepth {
    None = 0,
    Basic = 1, // User level
    Local = 2, // Business Unit level
    Deep = 4, // Parent-Child Business Unit level
    Global = 8, // Organization level
}

/** Maps depth enum to a display label */
export const DEPTH_LABELS: Record<PrivilegeDepth, string> = {
    [PrivilegeDepth.None]: "None",
    [PrivilegeDepth.Basic]: "User",
    [PrivilegeDepth.Local]: "Business Unit",
    [PrivilegeDepth.Deep]: "Parent-Child BU",
    [PrivilegeDepth.Global]: "Organization",
};

/** A resolved privilege entry with entity and operation parsed from the privilege name */
export interface ParsedPrivilege {
    privilegeid: string;
    rawName: string;
    entity: string;
    operation: string;
    /** Depth per role (keyed by roleid) */
    depthByRole: Record<string, PrivilegeDepth>;
}

/** Standard privilege operations extracted from privilege names */
export const PRIVILEGE_OPERATIONS = ["Create", "Read", "Write", "Delete", "Append", "AppendTo", "Assign", "Share"] as const;
export type PrivilegeOperation = (typeof PRIVILEGE_OPERATIONS)[number];

/** Parsed details of a privilege name */
export interface ParsedPrivilegeName {
    entity: string;
    operation: string;
}

/**
 * Parses a Dataverse privilege name like "prvCreateAccount" into entity + operation.
 * Falls back to a "Miscellaneous" entity for non-standard privilege names.
 */
export function parsePrivilegeName(name: string): ParsedPrivilegeName {
    const stripped = name.startsWith("prv") ? name.substring(3) : name;
    for (const op of PRIVILEGE_OPERATIONS) {
        if (stripped.startsWith(op)) {
            const entity = stripped.substring(op.length) || "Global";
            return { entity, operation: op };
        }
    }
    return { entity: "Miscellaneous", operation: stripped };
}
