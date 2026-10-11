/**
 * Turns Dataverse permission errors into plain language. Two shapes are common:
 *   "Principal user (Id=<guid>, type=8, …) is missing prvWriteAccount privilege (Id=…) on OTC=1 for entity 'account'"
 *   "SecLib::AccessCheckEx failed. … CallingUser: <guid>. ObjectTypeCode: 1, … AccessRights: WriteAccess"
 */
export interface PrivilegeProblem {
    kind: "missing-privilege" | "record-access";
    /** Create, Read, Write, Delete, Append, Append To, Assign, Share */
    access: string;
    /** Logical name when the message says it, otherwise the privilege's schema-name part. */
    table?: string;
    privilege?: string;
    userId?: string;
}

const ACCESS_LABEL: Record<string, string> = {
    Create: "Create",
    Read: "Read",
    Write: "Write",
    Delete: "Delete",
    Append: "Append",
    AppendTo: "Append To",
    Assign: "Assign",
    Share: "Share",
};

const GUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function parsePrivilegeError(text: string | undefined): PrivilegeProblem | undefined {
    if (!text) return undefined;
    const missing = /is missing (prv(AppendTo|Append|Create|Read|Write|Delete|Assign|Share)(\w+)) privilege/i.exec(text);
    if (missing) {
        const entity = /for entity '([a-z0-9_]+)'/i.exec(text)?.[1];
        return {
            kind: "missing-privilege",
            privilege: missing[1],
            access: accessLabel(missing[2]),
            table: (entity ?? missing[3]).toLowerCase(),
            userId: new RegExp(`Principal user \\(Id=(${GUID})`, "i").exec(text)?.[1]?.toLowerCase(),
        };
    }
    if (/AccessCheckEx|does not have .*(privilege|access)|insufficient permissions/i.test(text)) {
        const rights = /AccessRights:\s*(\w+)/i.exec(text)?.[1];
        return {
            kind: "record-access",
            access: rights ? accessLabel(rights.replace(/Access$/i, "")) : "the required",
            userId: new RegExp(`CallingUser:\\s*(${GUID})`, "i").exec(text)?.[1]?.toLowerCase(),
        };
    }
    return undefined;
}

/** Plain-language explanation; `userName` resolves the user ID when known. */
export function describePrivilegeProblem(p: PrivilegeProblem, userName?: string): string {
    const who = userName ?? (p.userId ? `User ${p.userId.slice(0, 8)}…` : "The user");
    if (p.kind === "missing-privilege") {
        return `${who} is missing ${p.access} permission on ${p.table ?? "this table"} (${p.privilege}). An admin can add it to one of their security roles.`;
    }
    return `${who} doesn't have ${p.access} access to this particular record — usually because of who owns it (or its business unit) and the access level in their security roles, or because it isn't shared with them.`;
}

function accessLabel(raw: string): string {
    const key = Object.keys(ACCESS_LABEL).find((k) => k.toLowerCase() === raw.toLowerCase());
    return key ? ACCESS_LABEL[key] : raw;
}
