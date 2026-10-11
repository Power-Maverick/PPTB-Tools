/**
 * The brief's motivating example, as raw Web API rows.
 *
 * - An integration (app user) upserts Account.
 * - Plugin AccountAddressSync (account Update, post-op, sync) copies the address to the Address
 *   table (cr_address, assumed name) as Primary.
 * - Users edit cr_address; cloud flow "Address – validate & sync" (cr_address Update) sets lat/long
 *   and pushes the address back onto Account.
 */
import { mapAsyncRow, mapAuditRow, mapFlowRunRow, mapTraceRow } from "../../src/data/history";
import { classifyUser, type UserIndex } from "../../src/data/users";
import { mapFlow, mapStep } from "../../src/data/wiring";
import { correlate } from "../../src/engine/correlate";
import { buildGraph } from "../../src/engine/graph";
import { DEFAULT_SETTINGS, type CascadeRule, type ChildSet, type ComputedColumn, type SourceMap, type TimelineEvent, type WiringHandler } from "../../src/model/types";
import type { RuleContext } from "../../src/rules/context";

export const ACCOUNT = "aaaaaaaa-0000-4000-8000-000000000001";
export const ADDR_PRIMARY = "bbbbbbbb-0000-4000-8000-000000000001";
export const ADDR_BILLING = "bbbbbbbb-0000-4000-8000-000000000002";
export const USER = "11111111-0000-4000-8000-000000000001";
export const INTEGRATION = "22222222-0000-4000-8000-000000000002";
export const FLOW_OWNER = "33333333-0000-4000-8000-000000000003";
export const STEP_SYNC = "44444444-0000-4000-8000-000000000004";
export const FLOW = "55555555-0000-4000-8000-000000000005";
const TYPE_SYNC = "66666666-0000-4000-8000-000000000006";
const FILTER_ACCOUNT_UPDATE = "77777777-0000-4000-8000-000000000007";

export const T0 = "2026-10-09T10:00:00.000Z";
export const at = (offsetMs: number) => new Date(new Date(T0).getTime() + offsetMs).toISOString();
const SEC = 1000;
const HOUR = 3_600_000;

const F = "@OData.Community.Display.V1.FormattedValue";

export const users: UserIndex = new Map(
    [
        { systemuserid: USER, fullname: "Dana Field", accessmode: 0 },
        { systemuserid: INTEGRATION, fullname: "ERP Integration", applicationid: "99999999-0000-4000-8000-000000000009", accessmode: 4 },
        { systemuserid: FLOW_OWNER, fullname: "Flow Service Account", accessmode: 0 },
    ].map((r) => {
        const u = classifyUser(r);
        return [u.id, u];
    }),
);

// ---------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------

export function stepRow(overrides: Record<string, unknown> = {}) {
    return {
        sdkmessageprocessingstepid: STEP_SYNC,
        name: "Contoso.Plugins.AccountAddressSync: Update of account",
        stage: 40,
        mode: 0,
        rank: 1,
        filteringattributes: "address1_line1,address1_city",
        statecode: 0,
        [`statecode${F}`]: "Enabled",
        _sdkmessagefilterid_value: FILTER_ACCOUNT_UPDATE,
        _eventhandler_value: TYPE_SYNC,
        "_eventhandler_value@Microsoft.Dynamics.CRM.lookuplogicalname": "plugintype",
        ishidden: false,
        customizationlevel: 1,
        ...overrides,
    };
}

export function syncStep(overrides: Record<string, unknown> = {}): WiringHandler {
    return mapStep(stepRow(overrides), {
        filters: new Map([[FILTER_ACCOUNT_UPDATE, { table: "account", message: "Update" }]]),
        types: new Map([[TYPE_SYNC, { plugintypeid: TYPE_SYNC, typename: "Contoso.Plugins.AccountAddressSync" }]]),
        images: new Map(),
    })!;
}

export function flowClientData(opts: { filtering?: string; condition?: string } = {}) {
    return JSON.stringify({
        properties: {
            definition: {
                triggers: {
                    When_an_address_is_modified: {
                        type: "OpenApiConnectionWebhook",
                        inputs: {
                            host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", operationId: "SubscribeWebhookTrigger" },
                            parameters: {
                                "subscriptionRequest/message": 3,
                                "subscriptionRequest/entityname": "cr_address",
                                "subscriptionRequest/scope": 4,
                                ...(opts.filtering !== undefined ? { "subscriptionRequest/filteringattributes": opts.filtering } : {}),
                            },
                        },
                        ...(opts.condition ? { conditions: [{ expression: opts.condition }] } : {}),
                    },
                },
                actions: {
                    Set_geo: {
                        type: "OpenApiConnection",
                        inputs: {
                            host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", operationId: "UpdateRecord" },
                            parameters: { entityName: "cr_addresses", recordId: "@triggerOutputs()?['body/cr_addressid']", "item/cr_latitude": 51.5, "item/cr_longitude": -0.12 },
                        },
                    },
                    If_primary: {
                        type: "If",
                        actions: {
                            Update_account: {
                                type: "OpenApiConnection",
                                inputs: {
                                    host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps", operationId: "UpdateRecord" },
                                    parameters: { entityName: "accounts", recordId: "@x", "item/address1_line1": "@x", "item/address1_city": "@x" },
                                },
                            },
                        },
                        else: { actions: {} },
                    },
                },
            },
        },
    });
}

export const entitySets = new Map([
    ["accounts", "account"],
    ["cr_addresses", "cr_address"],
]);

export function addressFlow(opts: { on?: boolean; filtering?: string; condition?: string } = {}): WiringHandler {
    return mapFlow(
        {
            workflowid: FLOW,
            name: "Address – validate & sync",
            statecode: opts.on === false ? 0 : 1,
            [`statecode${F}`]: opts.on === false ? "Draft" : "Activated",
            clientdata: flowClientData({ filtering: opts.filtering ?? "cr_line1,cr_city", condition: opts.condition }),
            modifiedon: "2026-10-08T16:20:00Z",
            _modifiedby_value: USER,
            [`_modifiedby_value${F}`]: "Alex Admin",
            _ownerid_value: FLOW_OWNER,
            [`_ownerid_value${F}`]: "Flow Service Account",
        },
        entitySets,
    )!;
}

// ---------------------------------------------------------------------------------------------
// History rows
// ---------------------------------------------------------------------------------------------

let auditSeq = 0;
export function auditRow(table: string, recordId: string, user: string, time: string, action = 2) {
    auditSeq++;
    return {
        auditid: `cccccccc-0000-4000-8000-${String(auditSeq).padStart(12, "0")}`,
        createdon: time,
        action,
        [`action${F}`]: action === 1 ? "Create" : action === 3 ? "Delete" : "Update",
        operation: action,
        _userid_value: user,
        [`_userid_value${F}`]: users.get(user)?.name,
        _objectid_value: recordId,
        objecttypecode: table,
        attributemask: "",
    };
}

export function traceRow(id: string, opts: { time: string; table: string; message?: string; depth?: number; correlation: string; typeName?: string; duration?: number; exception?: string; block?: string; stepId?: string }) {
    return {
        plugintracelogid: id,
        createdon: opts.time,
        performanceexecutionstarttime: opts.time,
        performanceexecutionduration: opts.duration ?? 400,
        typename: opts.typeName ?? "Contoso.Plugins.AccountAddressSync",
        messagename: opts.message ?? "Update",
        primaryentity: opts.table,
        depth: opts.depth ?? 1,
        mode: 0,
        operationtype: 1,
        correlationid: opts.correlation,
        exceptiondetails: opts.exception ?? "",
        messageblock: opts.block ?? "",
        ...(opts.stepId ? { pluginstepid: opts.stepId } : {}),
    };
}

export function flowRunRow(id: string, start: string, end: string, status = "Succeeded", extra: Record<string, unknown> = {}) {
    return { flowrunid: id, name: `08585${id.slice(0, 8)}`, _workflow_value: FLOW, starttime: start, endtime: end, status, ...extra };
}

export function asyncRow(id: string, opts: { time: string; statecode: number; statuscode: number; regarding: string; regardingTable: string; name: string; message?: string; correlation?: string }) {
    return {
        asyncoperationid: id,
        name: opts.name,
        operationtype: 10,
        statecode: opts.statecode,
        statuscode: opts.statuscode,
        createdon: opts.time,
        _regardingobjectid_value: opts.regarding,
        "_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname": opts.regardingTable,
        message: opts.message,
        correlationid: opts.correlation,
        depth: 1,
    };
}

// ---------------------------------------------------------------------------------------------
// Assembling a rule context the same way the orchestrator does
// ---------------------------------------------------------------------------------------------

export const allSources = (): SourceMap => ({
    "wiring.plugins": { available: true },
    "wiring.workflows": { available: true },
    "history.trace": { available: true },
    "history.traceSuccess": { available: true },
    "history.async": { available: true },
    "history.audit": { available: true },
    "history.flowrun": { available: true },
    "history.flowrunApi": { available: false, reason: "Power Platform API isn't enabled on this connection" },
});

export interface ScenarioInput {
    target: { table: string; id: string; column?: string };
    handlers: WiringHandler[];
    audit: Array<{ row: Record<string, unknown>; changes?: Array<{ column: string; oldValue?: string; newValue?: string }> }>;
    traces?: Array<Record<string, unknown>>;
    flowRuns?: Array<Record<string, unknown>>;
    asyncJobs?: Array<Record<string, unknown>>;
    scope?: Array<{ table: string; id: string; name?: string; hop?: number }>;
    sources?: SourceMap;
    children?: ChildSet[];
    cascades?: CascadeRule[];
    computed?: ComputedColumn[];
    now?: string;
}

export function buildContext(s: ScenarioInput): RuleContext {
    const handlers = new Map(s.handlers.map((h) => [h.id, h]));
    const events: TimelineEvent[] = [
        ...s.audit.map(({ row, changes }) => {
            const changeMap = changes ? new Map([[String(row.auditid), changes]]) : undefined;
            return mapAuditRow(row, { table: String(row.objecttypecode), users, columnNumbers: new Map(), changes: changeMap });
        }),
        ...(s.traces ?? []).map(mapTraceRow),
        ...(s.flowRuns ?? []).map((r) => mapFlowRunRow(r, handlers)!).filter(Boolean),
        ...(s.asyncJobs ?? []).map((r) => mapAsyncRow(r, { activationToDefinition: new Map() })),
    ];
    const scope = s.scope ?? [{ table: s.target.table, id: s.target.id }];
    const c = correlate({ events, handlers, scopeIds: new Set(scope.map((r) => r.id)), settings: DEFAULT_SETTINGS, cascades: s.cascades });
    const wiring = buildGraph(s.handlers, c.inferredWrites, [...new Set(scope.map((r) => r.table))]);
    wiring.cascades = s.cascades;
    wiring.computed = s.computed;
    const kept = new Set(c.kept.map((e) => e.id));
    return {
        input: { table: s.target.table, recordId: s.target.id, column: s.target.column, from: new Date(at(-24 * HOUR)), to: new Date(at(24 * HOUR)) },
        timeline: {
            events: c.kept.sort((a, b) => a.time.localeCompare(b.time)),
            links: c.links,
            parentOf: c.parentOf,
            records: scope.map((r) => ({ ref: { table: r.table, id: r.id }, name: r.name, hop: r.hop ?? 0 })),
            warnings: [],
            unlinked: events.filter((e) => !kept.has(e.id) && e.source !== "audit"),
        },
        wiring,
        sources: s.sources ?? allSources(),
        settings: DEFAULT_SETTINGS,
        now: new Date(s.now ?? at(30 * HOUR)),
        children: s.children ?? [],
    };
}

/** The full overwrite chain from the brief. */
export function overwriteScenario(target: { table: string; id: string; column?: string } = { table: "cr_address", id: ADDR_PRIMARY, column: "cr_line1" }): ScenarioInput {
    const a1 = auditRow("cr_address", ADDR_PRIMARY, USER, at(0)); // user edits the address
    const a2 = auditRow("cr_address", ADDR_PRIMARY, FLOW_OWNER, at(30 * SEC)); // flow sets geo
    const a3 = auditRow("account", ACCOUNT, FLOW_OWNER, at(35 * SEC)); // flow pushes the address to account
    const a5 = auditRow("account", ACCOUNT, INTEGRATION, at(2 * HOUR)); // integration upsert
    const a6 = auditRow("cr_address", ADDR_PRIMARY, INTEGRATION, at(2 * HOUR + 350)); // plugin copies back to address
    return {
        target,
        handlers: [syncStep(), addressFlow()],
        scope: [
            { table: "cr_address", id: ADDR_PRIMARY, name: "Primary – 2 New St" },
            { table: "account", id: ACCOUNT, name: "Contoso Ltd", hop: 1 },
        ],
        audit: [
            { row: a1, changes: [{ column: "cr_line1", oldValue: "1 Old St", newValue: "2 New St" }] },
            { row: a2, changes: [{ column: "cr_latitude", oldValue: undefined, newValue: "51.5" }] },
            { row: a3, changes: [{ column: "address1_line1", oldValue: "1 Old St", newValue: "2 New St" }] },
            { row: a5, changes: [{ column: "address1_line1", oldValue: "2 New St", newValue: "1 Old St" }] },
            { row: a6, changes: [{ column: "cr_line1", oldValue: "2 New St", newValue: "1 Old St" }] },
        ],
        traces: [
            // the flow's account update ran the sync plugin (same value, no address change audited)
            traceRow("dddddddd-0000-4000-8000-000000000001", { time: at(35 * SEC - 300), table: "account", correlation: "eeeeeeee-0000-4000-8000-000000000001", block: `Syncing address for ${ACCOUNT}` }),
            // the integration upsert ran the sync plugin, which updated the address
            traceRow("dddddddd-0000-4000-8000-000000000002", { time: at(2 * HOUR - 100), table: "account", correlation: "eeeeeeee-0000-4000-8000-000000000002", duration: 600, block: `Syncing address for ${ACCOUNT}` }),
        ],
        flowRuns: [flowRunRow("ffffffff-0000-4000-8000-000000000001", at(20 * SEC), at(40 * SEC))],
    };
}
