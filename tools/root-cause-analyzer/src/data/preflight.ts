import { classifyError, type ClassifiedError } from "../host/errors";
import type { ReadOnlyDataverse } from "../host/readOnlyDataverse";
import type { PreflightCheck, PreflightReport, SourceId, SourceMap, SourceState, TableSchema } from "../model/types";
import { buildFetchXml } from "./fetchXml";
import { REQUIREMENTS, SOURCE_TABLES, verifyAll } from "./schema";

// ---------------------------------------------------------------------------------------------
// Facts (gathered from Dataverse) — kept separate from evaluation so evaluation is pure & tested.
// ---------------------------------------------------------------------------------------------

export type AccessDepth = "None" | "Basic" | "Local" | "Deep" | "Global" | "unknown";

export interface TableAccess {
    probe: "granted" | "denied" | "error" | "skipped";
    error?: string;
    /** Read depth from the user's roles; only meaningful for user-owned tables. */
    depth?: AccessDepth;
}

export interface ConnectionFacts {
    name: string;
    url: string;
    environment?: string;
    enabledForPowerPlatformAPI?: boolean;
}

export interface PreflightFacts {
    connection: ConnectionFacts | null;
    schema: Record<string, TableSchema>;
    org: { values: Record<string, unknown> } | { error: ClassifiedError };
    access: Record<string, TableAccess>;
}

export const TRACE_LEVELS: Record<number, "Off" | "Exception" | "All"> = { 0: "Off", 1: "Exception", 2: "All" };

const DEPTH_ORDER: AccessDepth[] = ["None", "Basic", "Local", "Deep", "Global"];
const DEPTH_NUMERIC: Record<number, AccessDepth> = { 0: "Basic", 1: "Local", 2: "Deep", 3: "Global" };

export function normalizeDepth(value: unknown): AccessDepth {
    if (typeof value === "number") return DEPTH_NUMERIC[value] ?? "unknown";
    if (typeof value === "string") {
        const match = DEPTH_ORDER.find((d) => d.toLowerCase() === value.toLowerCase());
        if (match) return match;
        if (/^\d+$/.test(value)) return DEPTH_NUMERIC[Number(value)] ?? "unknown";
    }
    return "unknown";
}

export function maxDepth(values: unknown[]): AccessDepth {
    const depths = values.map(normalizeDepth).filter((d) => d !== "unknown");
    if (depths.length === 0) return values.length === 0 ? "None" : "unknown";
    return depths.reduce((a, b) => (DEPTH_ORDER.indexOf(b) > DEPTH_ORDER.indexOf(a) ? b : a));
}

export async function gatherPreflightFacts(dv: ReadOnlyDataverse, connection: ConnectionFacts | null): Promise<PreflightFacts> {
    const schema = await verifyAll(dv);

    const orgColumns = REQUIREMENTS.find((r) => r.table === "organization")!;
    const orgPresent = [...orgColumns.required, ...orgColumns.optional].filter((c) => schema.organization?.columns.includes(c));
    let org: PreflightFacts["org"];
    try {
        const result = await dv.query(`organizations?$select=${orgPresent.join(",") || "organizationid"}`);
        org = { values: result.value[0] ?? {} };
    } catch (error) {
        org = { error: classifyError(error) };
    }

    let userId: string | undefined;
    try {
        userId = (await dv.callFunction({ name: "WhoAmI" })).UserId as string | undefined;
    } catch {
        userId = undefined;
    }

    const probeTables = REQUIREMENTS.map((r) => r.table).filter((t) => t !== "organization");
    const accessEntries = await Promise.all(probeTables.map(async (table) => [table, await probeAccess(dv, schema[table], userId)] as const));

    return { connection, schema, org, access: Object.fromEntries(accessEntries) };
}

async function probeAccess(dv: ReadOnlyDataverse, schema: TableSchema | undefined, userId: string | undefined): Promise<TableAccess> {
    if (!schema?.exists) return { probe: "skipped" };
    const column = schema.columns.includes("createdon") ? "createdon" : schema.columns[0];
    try {
        await dv.fetchXml(buildFetchXml({ entity: schema.table, attributes: column ? [column] : [], top: 1 }));
    } catch (error) {
        const classified = classifyError(error);
        return { probe: classified.kind === "privilege" ? "denied" : "error", error: classified.message };
    }
    if (schema.ownership !== "UserOwned" || !userId) return { probe: "granted" };
    return { probe: "granted", depth: await readDepth(dv, schema.table, userId) };
}

async function readDepth(dv: ReadOnlyDataverse, table: string, userId: string): Promise<AccessDepth> {
    try {
        const privileges = await dv.entityPrivileges(table);
        const read = privileges.find((p) => p.PrivilegeType === "Read" || p.PrivilegeType === 1);
        if (!read?.Name) return "unknown";
        const result = await dv.callFunction({
            name: "RetrieveUserPrivilegeByPrivilegeName",
            boundTo: { table: "systemuser", id: userId },
            parameters: { PrivilegeName: String(read.Name) },
        });
        const rolePrivileges = Array.isArray(result.RolePrivileges) ? (result.RolePrivileges as Record<string, unknown>[]) : [];
        return maxDepth(rolePrivileges.map((r) => r.Depth));
    } catch {
        return "unknown";
    }
}

// ---------------------------------------------------------------------------------------------
// Evaluation (pure)
// ---------------------------------------------------------------------------------------------

const TABLE_LABELS: Record<string, string> = {
    sdkmessageprocessingstep: "Plugin steps",
    sdkmessagefilter: "Step filters",
    sdkmessage: "SDK messages",
    plugintype: "Plugin types",
    pluginassembly: "Plugin assemblies",
    sdkmessageprocessingstepimage: "Step images",
    workflow: "Processes (workflows, business rules, cloud flows)",
    plugintracelog: "Plugin trace logs",
    asyncoperation: "System jobs",
    audit: "Audit history",
    flowrun: "Cloud flow runs",
    systemuser: "Users",
};

const ACCESS_IMPACT: Record<string, string> = {
    sdkmessageprocessingstep: "The Impact Map can't show plugin steps, and plugin-related findings are unavailable.",
    sdkmessagefilter: "Plugin steps can't be matched to tables.",
    sdkmessage: "Plugin steps can't be matched to messages (Create, Update, …).",
    plugintype: "Plugin steps will show without their class names.",
    pluginassembly: "Plugin steps will show without their assembly version and isolation mode.",
    sdkmessageprocessingstepimage: "Pre/post images won't be shown on the Impact Map.",
    workflow: "Workflows, business rules and cloud flows won't appear on the Impact Map, and Expected-but-missing can't check them.",
    plugintracelog: "Plugin executions and exceptions won't appear on the Timeline.",
    asyncoperation: "Async plugins, workflows and system-job failures won't appear on the Timeline.",
    audit: "Who changed what (and old → new values) won't be available; the Overwrite finding can't be evaluated.",
    flowrun: "Cloud flow runs won't be read from Dataverse.",
    systemuser: "Actors will show as IDs, and users can't be told apart from integration/application users.",
};

export function evaluatePreflight(facts: PreflightFacts, checkedAt = new Date()): PreflightReport {
    const checks: PreflightCheck[] = [];
    const orgValues = "values" in facts.org ? facts.org.values : undefined;

    // Connection ---------------------------------------------------------------------------
    if (facts.connection) {
        checks.push({
            id: "connection",
            group: "connection",
            title: "Connection",
            status: "ok",
            summary: `Connected to ${facts.connection.name}${facts.connection.environment ? ` (${facts.connection.environment})` : ""}.`,
            details: [facts.connection.url, "Read-only: this tool never writes to Dataverse or changes settings."],
        });
    } else {
        checks.push({ id: "connection", group: "connection", title: "Connection", status: "error", summary: "No active connection. Select a connection in ToolBox." });
    }

    // Plugin trace log level ----------------------------------------------------------------
    const traceSetting = orgValues?.plugintracelogsetting;
    const traceLevel = typeof traceSetting === "number" ? TRACE_LEVELS[traceSetting] : undefined;
    const traceFix =
        "An admin can change it in classic Settings → Administration → System Settings → Customization tab → \"Enable logging to plug-in trace log\" and set it to All. Trace logs are typically purged after 24 hours by a system bulk-delete job, so investigate soon after reproducing.";
    if (traceLevel === "All") {
        checks.push({
            id: "trace-level",
            group: "tracing",
            title: "Plugin trace log",
            status: "ok",
            summary: "Plugin trace log is set to All.",
            details: ["Trace logs are typically purged after 24 hours by a system bulk-delete job; older windows may have gaps."],
        });
    } else if (traceLevel === "Exception") {
        checks.push({
            id: "trace-level",
            group: "tracing",
            title: "Plugin trace log",
            status: "warning",
            summary: "Plugin trace log is set to Exception — only failed plugin executions are logged.",
            impact: "Successful plugin runs won't appear on the Timeline, chains through plugins can't be followed, and Expected-but-missing can't confirm whether a plugin step ran.",
            fix: traceFix,
        });
    } else if (traceLevel === "Off") {
        checks.push({
            id: "trace-level",
            group: "tracing",
            title: "Plugin trace log",
            status: "error",
            summary: "Plugin trace log is Off.",
            impact: "No plugin executions or exceptions are recorded. Plugin failures, plugin loops and whether a plugin step ran can't be evaluated.",
            fix: traceFix,
        });
    } else {
        checks.push({
            id: "trace-level",
            group: "tracing",
            title: "Plugin trace log",
            status: "warning",
            summary: "Couldn't read the plugin trace log setting.",
            impact: "The tool will still read whatever trace logs exist, but can't tell you what might be missing.",
            details: "error" in facts.org ? [facts.org.error.message] : undefined,
        });
    }

    // Org audit -----------------------------------------------------------------------------
    const orgAudit = orgValues?.isauditenabled;
    const retention = orgValues?.auditretentionperiodv2;
    const retentionText = typeof retention === "number" ? (retention === -1 ? "Audit retention: forever." : `Audit retention: ${retention} days.`) : undefined;
    if (orgAudit === true) {
        checks.push({
            id: "audit-org",
            group: "audit",
            title: "Auditing (environment)",
            status: "ok",
            summary: "Auditing is on for the environment. Table and column auditing are checked when you pick a record.",
            details: retentionText ? [retentionText] : undefined,
        });
    } else if (orgAudit === false) {
        checks.push({
            id: "audit-org",
            group: "audit",
            title: "Auditing (environment)",
            status: "error",
            summary: "Auditing is off for the environment.",
            impact: "No change history: user and integration edits, old → new values and the Overwrite finding are unavailable.",
            fix: "An admin can turn it on in Power Platform admin center → Environment → Settings → Audit and logs → Audit settings → Start auditing, then enable auditing on the tables and columns involved.",
        });
    } else {
        checks.push({ id: "audit-org", group: "audit", title: "Auditing (environment)", status: "warning", summary: "Couldn't read whether auditing is enabled." });
    }

    // Read access -----------------------------------------------------------------------------
    for (const [table, access] of Object.entries(facts.access)) {
        const schema = facts.schema[table];
        const label = TABLE_LABELS[table] ?? table;
        if (access.probe === "skipped") continue; // reported by the schema / flow checks
        if (access.probe === "denied") {
            checks.push({
                id: `access-${table}`,
                group: "access",
                title: `Read access: ${label}`,
                status: "error",
                summary: `You don't have read access to ${table}.`,
                impact: ACCESS_IMPACT[table],
                fix: `Ask an admin to grant read privilege on '${table}' through a security role.`,
                details: access.error ? [access.error] : undefined,
            });
        } else if (access.probe === "error") {
            checks.push({
                id: `access-${table}`,
                group: "access",
                title: `Read access: ${label}`,
                status: "warning",
                summary: `Reading ${table} failed for a reason other than permissions.`,
                impact: ACCESS_IMPACT[table],
                details: access.error ? [access.error] : undefined,
            });
        } else if (schema?.ownership === "UserOwned" && access.depth && access.depth !== "Global") {
            const scope = access.depth === "unknown" ? "couldn't be determined" : `is ${access.depth}`;
            checks.push({
                id: `access-${table}`,
                group: "access",
                title: `Read access: ${label}`,
                status: "warning",
                summary: `Your read access to ${table} ${scope}, not Organization.`,
                impact: `Rows owned by other users (integration users, flow connection owners) may be invisible, so ${label.toLowerCase()} can look incomplete.`,
                fix: `Ask an admin for Organization-level read on '${table}'. (Roles inherited through teams aren't included in this check.)`,
            });
        } else {
            checks.push({ id: `access-${table}`, group: "access", title: `Read access: ${label}`, status: "ok", summary: `You can read ${table}.` });
        }
    }

    // Flow runs -------------------------------------------------------------------------------
    const flowrun = facts.schema.flowrun;
    if (!flowrun?.exists) {
        checks.push({
            id: "flowrun",
            group: "flows",
            title: "Cloud flow run history (Dataverse)",
            status: "warning",
            summary: "The flowrun table isn't available in this environment.",
            impact: "Flow runs can only come from the Power Automate API; without it, whether a flow fired is unavailable.",
            details: flowrun?.error ? [flowrun.error] : undefined,
        });
    } else if (facts.access.flowrun?.probe === "granted") {
        checks.push({
            id: "flowrun",
            group: "flows",
            title: "Cloud flow run history (Dataverse)",
            status: "info",
            summary: "Flow run history is available.",
            details: [
                "Only solution-aware cloud flows appear in flowrun.",
                "Run history retention is limited (28 days by default), so older runs may be missing.",
                `Columns found: ${flowrun.columns.filter((c) => REQUIREMENTS.find((r) => r.table === "flowrun")!.optional.includes(c)).join(", ") || "none of the expected ones"}.`,
            ],
        });
    }

    const ppApi = facts.connection?.enabledForPowerPlatformAPI === true;
    checks.push(
        ppApi
            ? {
                  id: "flow-api",
                  group: "flows",
                  title: "Power Automate API",
                  status: "ok",
                  summary: "Power Platform API is enabled on this connection — flow runs can be tied to the exact record that triggered them.",
              }
            : {
                  id: "flow-api",
                  group: "flows",
                  title: "Power Automate API",
                  status: "warning",
                  summary: "Power Platform API isn't enabled on this connection.",
                  impact: "Flow runs will be linked to records by timing only (stitched, medium/low confidence) instead of by the record that triggered them.",
                  fix: "Edit this connection in ToolBox and enable Power Platform API access, then reconnect.",
              },
    );

    // Schema verification -------------------------------------------------------------------
    for (const schema of Object.values(facts.schema)) {
        if (schema.table === "flowrun") continue;
        if (!schema.exists) {
            checks.push({
                id: `schema-${schema.table}`,
                group: "schema",
                title: `Metadata: ${schema.table}`,
                status: "error",
                summary: `Couldn't read metadata for ${schema.table}.`,
                impact: ACCESS_IMPACT[schema.table],
                details: schema.error ? [schema.error] : undefined,
            });
        } else if (schema.missingRequired.length > 0) {
            checks.push({
                id: `schema-${schema.table}`,
                group: "schema",
                title: `Metadata: ${schema.table}`,
                status: "warning",
                summary: `${schema.table} is missing expected columns: ${schema.missingRequired.join(", ")}.`,
                impact: ACCESS_IMPACT[schema.table],
            });
        }
    }

    return { checkedAt: checkedAt.toISOString(), checks, sources: deriveSources(facts, traceLevel, orgAudit, ppApi), schema: facts.schema };
}

function tableUsable(facts: PreflightFacts, table: string): string | undefined {
    const schema = facts.schema[table];
    if (!schema?.exists) return schema?.error ?? `${table} isn't available`;
    if (schema.missingRequired.length) return `${table} is missing columns: ${schema.missingRequired.join(", ")}`;
    const access = facts.access[table];
    if (access?.probe === "denied") return `no read access to ${table}`;
    if (access?.probe === "error") return `reading ${table} failed: ${access.error ?? "unknown error"}`;
    return undefined;
}

function deriveSources(facts: PreflightFacts, traceLevel: string | undefined, orgAudit: unknown, ppApi: boolean): SourceMap {
    const fromTables = (id: SourceId): SourceState => {
        const problems = SOURCE_TABLES[id].map((t) => tableUsable(facts, t)).filter((p): p is string => !!p);
        return problems.length ? { available: false, reason: problems.join("; ") } : { available: true };
    };

    const plugins = fromTables("wiring.plugins");
    if (plugins.available && tableUsable(facts, "sdkmessageprocessingstepimage")) {
        plugins.partial = true;
        plugins.reason = "step images can't be read";
    }

    const trace = fromTables("history.trace");
    const traceSuccess = { ...trace };
    if (trace.available) {
        if (traceLevel === "Off") {
            trace.available = traceSuccess.available = false;
            trace.reason = traceSuccess.reason = "plugin trace log is Off";
        } else if (traceLevel === "Exception") {
            traceSuccess.available = false;
            traceSuccess.reason = "plugin trace log is set to Exception, so successful executions aren't logged";
        } else if (traceLevel === undefined) {
            trace.partial = traceSuccess.partial = true;
            trace.reason = traceSuccess.reason = "trace log level unknown";
        }
    }

    const asyncSource = fromTables("history.async");
    const asyncDepth = facts.access.asyncoperation?.depth;
    if (asyncSource.available && asyncDepth && asyncDepth !== "Global") {
        asyncSource.partial = true;
        asyncSource.reason = `read access to system jobs is ${asyncDepth}, so jobs owned by others may be missing`;
    }

    const audit = fromTables("history.audit");
    if (audit.available && orgAudit === false) {
        audit.available = false;
        audit.reason = "auditing is off for the environment";
    }

    return {
        "wiring.plugins": plugins,
        "wiring.workflows": fromTables("wiring.workflows"),
        "history.trace": trace,
        "history.traceSuccess": traceSuccess,
        "history.async": asyncSource,
        "history.audit": audit,
        "history.flowrun": fromTables("history.flowrun"),
        "history.flowrunApi": ppApi ? { available: true } : { available: false, reason: "Power Platform API isn't enabled on this connection" },
    };
}
