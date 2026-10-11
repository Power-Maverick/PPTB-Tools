import { classifyError } from "../host/errors";
import type { ReadOnlyDataverse } from "../host/readOnlyDataverse";
import type { EventStatus, RecordRef, TableSchema, TimelineEvent, ValueChange, WiringHandler } from "../model/types";
import { decodeAttributeMask } from "../parse/attributeMask";
import { parseChangeHistory } from "../parse/changeHistory";
import { formatted, guidLower, lookupId, lookupName, lookupTable, num, str, truncate } from "../parse/values";
import { fetchPages, type Condition, type FetchSpec } from "./fetchXml";
import { userActor, type UserIndex } from "./users";

type Row = Record<string, unknown>;

export interface Window {
    from: Date;
    to: Date;
}

export interface ReadResult {
    rows: Row[];
    truncated: boolean;
    error?: string;
}

/** Only select columns that metadata verification found. */
export function present(schema: TableSchema | undefined, columns: string[]): string[] {
    if (!schema?.exists) return [];
    return columns.filter((c) => schema.columns.includes(c));
}

async function readAll(dv: ReadOnlyDataverse, spec: FetchSpec, maxPages: number, pageSize = 250): Promise<ReadResult> {
    const rows: Row[] = [];
    let truncated = false;
    try {
        for await (const page of fetchPages(dv, spec, { pageSize, maxPages })) {
            rows.push(...page.rows);
            truncated = page.truncated;
        }
        return { rows, truncated };
    } catch (error) {
        return { rows, truncated, error: classifyError(error).message };
    }
}

function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

async function readChunked(dv: ReadOnlyDataverse, values: string[], build: (chunk: string[]) => FetchSpec, maxPages: number): Promise<ReadResult> {
    const all: ReadResult = { rows: [], truncated: false };
    for (const chunk of chunks([...new Set(values)], 50)) {
        const r = await readAll(dv, build(chunk), maxPages);
        all.rows.push(...r.rows);
        all.truncated ||= r.truncated;
        all.error ??= r.error;
    }
    return all;
}

// ---------------------------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------------------------

// Audit action → SDK message name (used to match wiring). Display text comes from the formatted value.
export const AUDIT_ACTIONS: Record<number, string> = { 1: "Create", 2: "Update", 3: "Delete", 13: "Assign", 14: "GrantAccess", 48: "ModifyAccess", 49: "RevokeAccess" };

export function readAudit(dv: ReadOnlyDataverse, schema: TableSchema | undefined, ref: RecordRef, window: Window): Promise<ReadResult> {
    return readAll(
        dv,
        {
            entity: "audit",
            attributes: present(schema, ["auditid", "createdon", "action", "operation", "userid", "callinguserid", "attributemask", "objectid", "objecttypecode", "transactionid"]),
            conditions: [
                { attribute: "objectid", operator: "eq", value: ref.id },
                { attribute: "createdon", operator: "ge", value: window.from },
                { attribute: "createdon", operator: "le", value: window.to },
            ],
            orders: [{ attribute: "createdon" }],
        },
        10,
    );
}

export function readAuditByTransaction(dv: ReadOnlyDataverse, schema: TableSchema | undefined, transactionIds: string[]): Promise<ReadResult> {
    if (!schema?.columns.includes("transactionid") || !transactionIds.length) return Promise.resolve({ rows: [], truncated: false });
    return readChunked(
        dv,
        transactionIds,
        (chunk) => ({
            entity: "audit",
            attributes: present(schema, ["auditid", "createdon", "action", "operation", "userid", "callinguserid", "attributemask", "objectid", "objecttypecode", "transactionid"]),
            conditions: [{ attribute: "transactionid", operator: "in", value: chunk }],
        }),
        2,
    );
}

export interface ChangeHistoryResult {
    byAuditId: Map<string, ValueChange[]>;
    warning?: string;
}

/** Old/new values come from RetrieveRecordChangeHistory; pages until older than the window. */
export async function readChangeHistory(dv: ReadOnlyDataverse, ref: RecordRef, from: Date, primaryIdColumn?: string): Promise<ChangeHistoryResult> {
    const byAuditId = new Map<string, ValueChange[]>();
    let pagingCookie: string | undefined;
    try {
        for (let page = 1; page <= 5; page++) {
            const response = await dv.callFunction({
                name: "RetrieveRecordChangeHistory",
                parameters: {
                    Target: { entityLogicalName: ref.table, id: ref.id },
                    PagingInfo: { PageNumber: page, Count: 100, ReturnTotalRecordCount: false, ...(pagingCookie ? { PagingCookie: pagingCookie } : {}) },
                },
            });
            const parsed = parseChangeHistory(response, primaryIdColumn);
            parsed.byAuditId.forEach((v, k) => byAuditId.set(k, v));
            if (parsed.warnings.length && page === 1 && parsed.byAuditId.size === 0) return { byAuditId, warning: parsed.warnings.join(" ") };
            if (!parsed.more || (parsed.oldest && new Date(parsed.oldest) < from)) break;
            pagingCookie = parsed.pagingCookie;
        }
        return { byAuditId };
    } catch (error) {
        const e = classifyError(error);
        return {
            byAuditId,
            warning:
                e.kind === "privilege"
                    ? "You don't have permission to view audit history details (View Audit History), so old → new values aren't shown."
                    : `Old → new values couldn't be read: ${e.message}`,
        };
    }
}

export interface AuditMapContext {
    table: string;
    users: UserIndex;
    columnNumbers: Map<number, string>;
    changes?: Map<string, ValueChange[]>;
}

export function mapAuditRow(row: Row, ctx: AuditMapContext): TimelineEvent {
    const auditId = String(row.auditid ?? "").toLowerCase();
    const action = num(row.action);
    const messageName = (action !== undefined && AUDIT_ACTIONS[action]) || formatted(row, "action") || "Change";
    const userId = lookupId(row, "userid");
    const callingUserId = lookupId(row, "callinguserid");
    const table = str(row.objecttypecode)?.toLowerCase() ?? ctx.table;
    const recordId = lookupId(row, "objectid");
    const mask = decodeAttributeMask(row.attributemask, ctx.columnNumbers);
    const changes = ctx.changes?.get(auditId);
    const details: Array<[string, string]> = [["Changed by", lookupName(row, "userid") ?? userId ?? "unknown"]];
    if (callingUserId && callingUserId !== userId) details.push(["On behalf of (calling user)", lookupName(row, "callinguserid") ?? callingUserId]);
    if (str(row.transactionid)) details.push(["Transaction", String(row.transactionid)]);
    const warnings: string[] = [];
    if (mask.unknown.length) warnings.push(`${mask.unknown.length} changed column(s) couldn't be named from metadata.`);
    return {
        id: `audit:${auditId}`,
        source: "audit",
        time: String(row.createdon),
        actor: userActor(ctx.users, userId, lookupName(row, "userid")),
        operation: formatted(row, "action") ?? messageName,
        messageName,
        record: recordId ? { table, id: recordId } : undefined,
        table,
        transactionId: guidLower(row.transactionid),
        status: "success",
        changes,
        changedColumns: changes?.map((c) => c.column) ?? mask.columns,
        userId,
        callingUserId,
        details,
        warnings,
    };
}

// ---------------------------------------------------------------------------------------------
// Plugin trace log
// ---------------------------------------------------------------------------------------------

const TRACE_COLUMNS = [
    "plugintracelogid",
    "createdon",
    "performanceexecutionstarttime",
    "performanceexecutionduration",
    "typename",
    "messagename",
    "primaryentity",
    "depth",
    "mode",
    "operationtype",
    "correlationid",
    "requestid",
    "exceptiondetails",
    "messageblock",
    "pluginstepid",
];

export function readTraceForTables(dv: ReadOnlyDataverse, schema: TableSchema | undefined, tables: string[], window: Window): Promise<ReadResult> {
    if (!tables.length) return Promise.resolve({ rows: [], truncated: false });
    return readAll(
        dv,
        {
            entity: "plugintracelog",
            attributes: present(schema, TRACE_COLUMNS),
            conditions: [
                { attribute: "primaryentity", operator: "in", value: tables },
                { attribute: "createdon", operator: "ge", value: window.from },
                { attribute: "createdon", operator: "le", value: window.to },
            ],
            orders: [{ attribute: "createdon" }],
        },
        8,
    );
}

export function readTraceByCorrelation(dv: ReadOnlyDataverse, schema: TableSchema | undefined, correlationIds: string[]): Promise<ReadResult> {
    return readChunked(dv, correlationIds, (chunk) => ({ entity: "plugintracelog", attributes: present(schema, TRACE_COLUMNS), conditions: [{ attribute: "correlationid", operator: "in", value: chunk }] }), 4);
}

export function normalizeTypeName(typeName: unknown): string {
    return (str(typeName) ?? "Unknown plugin").split(",")[0].trim();
}

export function shortTypeName(typeName: string): string {
    const parts = typeName.split(".");
    return parts.length > 2 ? parts.slice(-2).join(".") : typeName;
}

export function mapTraceRow(row: Row): TimelineEvent {
    const id = String(row.plugintracelogid ?? "").toLowerCase();
    const typeName = normalizeTypeName(row.typename);
    const start = str(row.performanceexecutionstarttime) ?? String(row.createdon);
    const duration = num(row.performanceexecutionduration);
    const isActivity = num(row.operationtype) === 2;
    const mode = formatted(row, "mode") ?? (num(row.mode) === 1 ? "Asynchronous" : "Synchronous");
    const table = (str(row.primaryentity) ?? "none").toLowerCase();
    const exception = str(row.exceptiondetails);
    const stepId = guidLower(row.pluginstepid ?? row._pluginstepid_value);
    const messageBlock = str(row.messageblock);
    return {
        id: `trace:${id}`,
        source: "trace",
        time: start,
        endTime: duration !== undefined ? new Date(new Date(start).getTime() + duration).toISOString() : undefined,
        actor: { key: `plugin:${typeName.toLowerCase()}`, kind: isActivity ? "workflow" : "plugin", name: shortTypeName(typeName) },
        operation: `${isActivity ? "Workflow activity" : "Plugin"} ${shortTypeName(typeName)} · ${str(row.messagename) ?? "?"} ${table} (${mode.toLowerCase()})`,
        messageName: str(row.messagename),
        table,
        depth: num(row.depth),
        correlationId: guidLower(row.correlationid),
        status: exception ? "failed" : "success",
        error: truncate(exception, 800),
        handlerId: stepId ? `step:${stepId}` : undefined,
        handlerName: typeName,
        searchText: `${messageBlock ?? ""}\n${exception ?? ""}`.toLowerCase(),
        details: [
            ["Plugin type", typeName],
            ["Mode", mode],
            ...(duration !== undefined ? [["Duration", `${duration} ms`] as [string, string]] : []),
            ...(str(row.requestid) ? [["Request", String(row.requestid)] as [string, string]] : []),
            ...(messageBlock ? [["Trace output", truncate(messageBlock, 1500)!] as [string, string]] : []),
        ],
        warnings: [],
    };
}

// ---------------------------------------------------------------------------------------------
// System jobs (asyncoperation)
// ---------------------------------------------------------------------------------------------

const ASYNC_COLUMNS = [
    "asyncoperationid",
    "name",
    "operationtype",
    "statecode",
    "statuscode",
    "message",
    "friendlymessage",
    "correlationid",
    "depth",
    "createdon",
    "startedon",
    "completedon",
    "regardingobjectid",
    "workflowactivationid",
    "owningextensionid",
    "ownerid",
    "errorcode",
    "retrycount",
];

export function readAsyncForRecords(dv: ReadOnlyDataverse, schema: TableSchema | undefined, ids: string[], window: Window): Promise<ReadResult> {
    return readChunked(
        dv,
        ids,
        (chunk) => ({
            entity: "asyncoperation",
            attributes: present(schema, ASYNC_COLUMNS),
            conditions: [
                { attribute: "regardingobjectid", operator: "in", value: chunk },
                { attribute: "createdon", operator: "le", value: window.to },
            ],
            // In the window, or still not completed (a job stuck since before the window still matters).
            subFilters: [
                {
                    type: "or",
                    conditions: [{ attribute: "createdon", operator: "ge", value: window.from }, { attribute: "statecode", operator: "ne", value: 3 }] as Condition[],
                },
            ],
            orders: [{ attribute: "createdon" }],
        }),
        6,
    );
}

export function readAsyncByCorrelation(dv: ReadOnlyDataverse, schema: TableSchema | undefined, correlationIds: string[]): Promise<ReadResult> {
    return readChunked(dv, correlationIds, (chunk) => ({ entity: "asyncoperation", attributes: present(schema, ASYNC_COLUMNS), conditions: [{ attribute: "correlationid", operator: "in", value: chunk }] }), 3);
}

export function asyncStatus(statecode: number | undefined, statuscode: number | undefined): EventStatus {
    if (statecode === 1) return "suspended";
    switch (statuscode) {
        case 30:
            return "success";
        case 31:
            return "failed";
        case 32:
            return "canceled";
        case 20:
        case 21:
        case 22:
            return "inprogress";
        case 0:
        case 10:
            return "waiting";
        default:
            return statecode === 3 ? "success" : "unknown";
    }
}

export function mapAsyncRow(row: Row, ctx: { activationToDefinition: Map<string, string> }): TimelineEvent {
    const id = String(row.asyncoperationid ?? "").toLowerCase();
    const opType = num(row.operationtype);
    const name = str(row.name) ?? "System job";
    const stepId = lookupId(row, "owningextensionid");
    const activationId = lookupId(row, "workflowactivationid");
    const definitionId = activationId ? (ctx.activationToDefinition.get(activationId) ?? activationId) : undefined;
    const handlerId = definitionId ? `wf:${definitionId}` : stepId ? `step:${stepId}` : undefined;
    const kind = opType === 10 || activationId ? "workflow" : opType === 1 ? "plugin" : "system";
    const status = asyncStatus(num(row.statecode), num(row.statuscode));
    const regardingId = lookupId(row, "regardingobjectid");
    const regardingTable = lookupTable(row, "regardingobjectid");
    const errorText = str(row.friendlymessage) ?? str(row.message);
    const details: Array<[string, string]> = [
        ["Job type", formatted(row, "operationtype") ?? String(opType ?? "?")],
        ["Status", formatted(row, "statuscode") ?? status],
    ];
    if (lookupName(row, "ownerid")) details.push(["Runs as / owner", lookupName(row, "ownerid")!]);
    if (str(row.startedon)) details.push(["Started", String(row.startedon)]);
    if (str(row.completedon)) details.push(["Completed", String(row.completedon)]);
    if (num(row.retrycount)) details.push(["Retries", String(row.retrycount)]);
    return {
        id: `async:${id}`,
        source: "async",
        time: String(row.createdon),
        endTime: str(row.completedon),
        actor: { key: handlerId ? `${kind}:${handlerId}` : `system:${name.toLowerCase()}`, kind, name },
        operation: `${kind === "workflow" ? "Workflow job" : kind === "plugin" ? "Async plugin job" : "System job"} · ${name}`,
        record: regardingId && regardingTable ? { table: regardingTable, id: regardingId } : undefined,
        table: regardingTable ?? "none",
        depth: num(row.depth),
        correlationId: guidLower(row.correlationid),
        status,
        error: status === "success" ? undefined : truncate(errorText, 800),
        handlerId,
        handlerName: name,
        userId: lookupId(row, "ownerid"),
        details,
        warnings: [],
    };
}

// ---------------------------------------------------------------------------------------------
// Cloud flow runs (Dataverse flowrun)
// ---------------------------------------------------------------------------------------------

export function flowRunColumns(schema: TableSchema | undefined): { lookup?: string; time?: string } {
    const cols = schema?.columns ?? [];
    return { lookup: ["workflow", "workflowid"].find((c) => cols.includes(c)), time: ["starttime", "createdon"].find((c) => cols.includes(c)) };
}

export function readFlowRuns(dv: ReadOnlyDataverse, schema: TableSchema | undefined, flowIds: string[], window: Window): Promise<ReadResult> {
    const { lookup, time } = flowRunColumns(schema);
    if (!lookup || !flowIds.length) return Promise.resolve({ rows: [], truncated: false, error: lookup ? undefined : "flowrun has no column linking a run to its flow" });
    return readChunked(
        dv,
        flowIds,
        (chunk) => ({
            entity: "flowrun",
            attributes: [], // all columns: flowrun's shape varies, the mapper reads what's there
            conditions: [
                { attribute: lookup, operator: "in", value: chunk },
                ...(time
                    ? ([
                          { attribute: time, operator: "ge", value: window.from },
                          { attribute: time, operator: "le", value: window.to },
                      ] as Condition[])
                    : []),
            ],
        }),
        4,
    );
}

export function flowRunStatus(text: string | undefined): EventStatus {
    const t = (text ?? "").toLowerCase();
    if (/succe/.test(t)) return "success";
    if (/fail|error|timedout|timed out/.test(t)) return "failed";
    if (/cancel/.test(t)) return "canceled";
    if (/run|progress/.test(t)) return "inprogress";
    if (/wait|suspend|pause/.test(t)) return "waiting";
    if (/skip/.test(t)) return "canceled";
    return "unknown";
}

export function mapFlowRunRow(row: Row, flows: Map<string, WiringHandler>): TimelineEvent | undefined {
    const flowId = lookupId(row, "workflow") ?? lookupId(row, "workflowid");
    const flow = flowId ? flows.get(`wf:${flowId}`) : undefined;
    const start = str(row.starttime) ?? str(row.createdon);
    if (!start) return undefined;
    const runId = str(row.flowrunid) ?? str(row.name) ?? `${flowId}-${start}`;
    const statusText = formatted(row, "status") ?? str(row.status);
    const status = flowRunStatus(statusText);
    const error = str(row.errormessage) ?? str(row.errorcode);
    return {
        id: `flowrun:${runId.toLowerCase()}`,
        source: "flowrun",
        time: start,
        endTime: str(row.endtime),
        actor: { key: `flow:${flowId}`, kind: "flow", name: flow?.name ?? lookupName(row, "workflow") ?? "Cloud flow" },
        operation: `Flow run · ${flow?.name ?? lookupName(row, "workflow") ?? "cloud flow"}`,
        table: flow?.table ?? "none",
        status,
        error: status === "success" ? undefined : truncate(error, 800),
        handlerId: flowId ? `wf:${flowId}` : undefined,
        handlerName: flow?.name,
        searchText: JSON.stringify(row).toLowerCase(),
        details: [
            ["Status", statusText ?? "unknown"],
            ...(str(row.triggertype) ? [["Trigger", formatted(row, "triggertype") ?? String(row.triggertype)] as [string, string]] : []),
            ...(str(row.name) ? [["Run", String(row.name)] as [string, string]] : []),
            ["Source", "Dataverse flowrun"],
        ],
        warnings: [],
    };
}
