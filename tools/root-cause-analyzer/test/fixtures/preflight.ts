import type { PreflightFacts, TableAccess } from "../../src/data/preflight";
import { compareSchema, REQUIREMENTS } from "../../src/data/schema";
import type { TableSchema } from "../../src/model/types";

const USER_OWNED = new Set(["asyncoperation", "workflow", "flowrun"]);

export function healthySchema(): Record<string, TableSchema> {
    return Object.fromEntries(
        REQUIREMENTS.map((req) => [req.table, compareSchema(req, [...req.required, ...req.optional, "createdon"], { ownership: USER_OWNED.has(req.table) ? "UserOwned" : "OrganizationOwned" })]),
    );
}

export function healthyAccess(): Record<string, TableAccess> {
    return Object.fromEntries(
        REQUIREMENTS.filter((r) => r.table !== "organization").map((r) => [r.table, USER_OWNED.has(r.table) ? { probe: "granted", depth: "Global" } : { probe: "granted" }]),
    );
}

/** Everything a fully-equipped environment would report; tests override one fact at a time. */
export function healthyFacts(overrides: Partial<PreflightFacts> = {}): PreflightFacts {
    return {
        connection: { name: "Contoso Prod", url: "https://contoso.crm.dynamics.com", environment: "Production", enabledForPowerPlatformAPI: true },
        schema: healthySchema(),
        org: { values: { plugintracelogsetting: 2, isauditenabled: true, auditretentionperiodv2: 90 } },
        access: healthyAccess(),
        ...overrides,
    };
}
