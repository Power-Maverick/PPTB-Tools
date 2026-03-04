import { ParsedPrivilege, Privilege, PrivilegeDepth, RolePrivilegeDepth, SecurityRole, parsePrivilegeName } from "../models/interfaces";

export class DataverseConnector {
    constructor(_envUrl: string) {}

    /** Fetch all security roles from the environment, sorted by name. */
    async fetchRoles(): Promise<SecurityRole[]> {
        const query = `roles?$select=roleid,name,_businessunitid_value&$orderby=name asc`;
        const result = await this.executeQuery(query);
        return (result.value || []) as SecurityRole[];
    }

    /**
     * Fetch the privileges associated with a role using the OData navigation property.
     * Returns privilege id, name, and access right.
     */
    async fetchRolePrivileges(roleId: string): Promise<Privilege[]> {
        const sanitizedId = this.sanitizeGuid(roleId);
        const query = `roles(${sanitizedId})/roleprivileges_association?$select=privilegeid,name,accessright`;
        const result = await this.executeQuery(query);
        return (result.value || []) as Privilege[];
    }

    /**
     * Fetch the privilege depth assignments for a role from the roleprivilegesbase intersect entity.
     * Falls back gracefully if the entity set is not accessible.
     */
    async fetchRolePrivilegeDepths(roleId: string): Promise<RolePrivilegeDepth[]> {
        try {
            const sanitizedId = this.sanitizeGuid(roleId);
            const query = `roleprivilegesbase?$filter=_roleid_value eq ${sanitizedId}&$select=_privilegeid_value,privilegedepthid`;
            const result = await this.executeQuery(query);
            const rows = (result.value || []) as Array<{ _privilegeid_value: string; privilegedepthid: number }>;
            return rows.map((row) => ({
                privilegeid: row._privilegeid_value,
                privilegedepthid: row.privilegedepthid as PrivilegeDepth,
            }));
        } catch {
            // roleprivilegesbase may not be directly queryable in all environments;
            // callers will treat all privileges as "Global" depth in that case.
            return [];
        }
    }

    /**
     * Build a unified list of ParsedPrivilege entries for all selected roles.
     * Each entry contains the depth per role so the comparison grid can be rendered.
     */
    async buildComparisonData(roleIds: string[]): Promise<ParsedPrivilege[]> {
        // Fetch privileges and depths for each role in parallel
        const roleData = await Promise.all(
            roleIds.map(async (roleId) => {
                const [privileges, depths] = await Promise.all([this.fetchRolePrivileges(roleId), this.fetchRolePrivilegeDepths(roleId)]);

                // Build a depth map keyed by privilege id
                const depthMap = new Map<string, PrivilegeDepth>();
                for (const d of depths) {
                    depthMap.set(d.privilegeid.toLowerCase(), d.privilegedepthid);
                }

                return { roleId, privileges, depthMap };
            }),
        );

        // Collect all unique privileges across all roles
        const privilegeMap = new Map<string, Privilege>();
        for (const { privileges } of roleData) {
            for (const priv of privileges) {
                if (!privilegeMap.has(priv.privilegeid)) {
                    privilegeMap.set(priv.privilegeid, priv);
                }
            }
        }

        // Build the comparison list
        const result: ParsedPrivilege[] = [];
        for (const [privilegeid, priv] of privilegeMap) {
            const parsed = parsePrivilegeName(priv.name);
            const depthByRole: Record<string, PrivilegeDepth> = {};

            for (const { roleId, privileges, depthMap } of roleData) {
                const hasPriv = privileges.some((p) => p.privilegeid === privilegeid);
                if (!hasPriv) {
                    depthByRole[roleId] = PrivilegeDepth.None;
                } else {
                    // If depth data was successfully fetched use it; otherwise assume Global
                    const depth = depthMap.get(privilegeid.toLowerCase());
                    depthByRole[roleId] = depth !== undefined ? depth : PrivilegeDepth.Global;
                }
            }

            result.push({
                privilegeid,
                rawName: priv.name,
                entity: parsed.entity,
                operation: parsed.operation,
                depthByRole,
            });
        }

        // Sort: by entity name, then by operation
        result.sort((a, b) => {
            const entityCmp = a.entity.localeCompare(b.entity);
            if (entityCmp !== 0) return entityCmp;
            return a.operation.localeCompare(b.operation);
        });

        return result;
    }

    private sanitizeGuid(rawValue: string): string {
        const trimmed = rawValue.trim().toLowerCase();
        const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
        if (!guidPattern.test(trimmed)) {
            throw new Error("Invalid identifier format detected");
        }
        return trimmed;
    }

    private async executeQuery(queryPath: string): Promise<any> {
        if (!window.dataverseAPI) {
            throw new Error("Dataverse API not available");
        }
        return await window.dataverseAPI.queryData(queryPath);
    }

    static async showMessage(title: string, message: string, severity: "success" | "error" | "warning" | "info"): Promise<void> {
        if (window.toolboxAPI) {
            await window.toolboxAPI.utils.showNotification({ title, body: message, type: severity });
        }
    }
}
