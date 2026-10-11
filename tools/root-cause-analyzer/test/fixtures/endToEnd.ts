/**
 * End-to-end run of the orchestrator against an in-memory, read-only fake of the host API.
 * Proves the readers, hop expansion, correlation and rules fit together.
 */
import { evaluatePreflight } from "../../src/data/preflight";
import { runAnalysis, type AnalysisResult } from "../../src/engine/analyze";
import type { ReadOnlyDataverse } from "../../src/host/readOnlyDataverse";
import { DEFAULT_SETTINGS } from "../../src/model/types";
import { healthyFacts } from "./preflight";
import { ACCOUNT, ADDR_BILLING, ADDR_PRIMARY, at, auditRow, flowClientData, flowRunRow, FLOW, FLOW_OWNER, INTEGRATION, STEP_SYNC, traceRow, USER } from "./scenario";

type Row = Record<string, unknown>;
const SEC = 1000;
const HOUR = 3_600_000;
const F = "@OData.Community.Display.V1.FormattedValue";

function scenarioStore() {
    const a1 = auditRow("cr_address", ADDR_PRIMARY, USER, at(0));
    const a2 = auditRow("cr_address", ADDR_PRIMARY, FLOW_OWNER, at(30 * SEC));
    const a3 = auditRow("account", ACCOUNT, FLOW_OWNER, at(35 * SEC));
    const a5 = auditRow("account", ACCOUNT, INTEGRATION, at(2 * HOUR));
    const a6 = auditRow("cr_address", ADDR_PRIMARY, INTEGRATION, at(2 * HOUR + 350));
    const changes: Record<string, [string, unknown, unknown][]> = {
        [String(a1.auditid)]: [["cr_line1", "1 Old St", "2 New St"]],
        [String(a2.auditid)]: [["cr_latitude", null, 51.5]],
        [String(a3.auditid)]: [["address1_line1", "1 Old St", "2 New St"]],
        [String(a5.auditid)]: [["address1_line1", "2 New St", "1 Old St"]],
        [String(a6.auditid)]: [["cr_line1", "2 New St", "1 Old St"]],
    };
    const tables: Record<string, Row[]> = {
        audit: [a1, a2, a3, a5, a6],
        plugintracelog: [
            traceRow("dddddddd-0000-4000-8000-000000000001", { time: at(35 * SEC - 300), table: "account", correlation: "eeeeeeee-0000-4000-8000-000000000001", block: `Syncing ${ACCOUNT}` }),
            traceRow("dddddddd-0000-4000-8000-000000000002", { time: at(2 * HOUR - 100), table: "account", correlation: "eeeeeeee-0000-4000-8000-000000000002", duration: 600, block: `Syncing ${ACCOUNT}` }),
        ],
        asyncoperation: [],
        flowrun: [flowRunRow("ffffffff-0000-4000-8000-000000000001", at(20 * SEC), at(40 * SEC))],
        sdkmessagefilter: [{ sdkmessagefilterid: "77777777-0000-4000-8000-000000000007", primaryobjecttypecode: "account", _sdkmessageid_value: "88888888-0000-4000-8000-000000000008" }],
        sdkmessage: [{ sdkmessageid: "88888888-0000-4000-8000-000000000008", name: "Update" }],
        sdkmessageprocessingstep: [
            {
                sdkmessageprocessingstepid: STEP_SYNC,
                name: "AccountAddressSync: Update of account",
                stage: 40,
                mode: 0,
                rank: 1,
                filteringattributes: "address1_line1,address1_city",
                statecode: 0,
                _sdkmessagefilterid_value: "77777777-0000-4000-8000-000000000007",
                _eventhandler_value: "66666666-0000-4000-8000-000000000006",
                "_eventhandler_value@Microsoft.Dynamics.CRM.lookuplogicalname": "plugintype",
                customizationlevel: 1,
            },
        ],
        plugintype: [{ plugintypeid: "66666666-0000-4000-8000-000000000006", typename: "Contoso.Plugins.AccountAddressSync" }],
        sdkmessageprocessingstepimage: [],
        workflow: [{ workflowid: FLOW, name: "Address – validate & sync", category: 5, type: 1, statecode: 1, clientdata: flowClientData({ filtering: "cr_line1,cr_city" }), _ownerid_value: FLOW_OWNER }],
        systemuser: [
            { systemuserid: USER, fullname: "Dana Field", accessmode: 0 },
            { systemuserid: INTEGRATION, fullname: "ERP Integration", applicationid: "9", accessmode: 4 },
            { systemuserid: FLOW_OWNER, fullname: "Flow Service Account", accessmode: 0 },
        ],
        cr_address: [
            { cr_addressid: ADDR_PRIMARY, cr_name: "Primary", _cr_accountid_value: ACCOUNT, cr_addresstype: 1, [`cr_addresstype${F}`]: "Primary", statecode: 0, createdon: at(-48 * HOUR), modifiedon: at(2 * HOUR) },
            { cr_addressid: ADDR_BILLING, cr_name: "Billing", _cr_accountid_value: ACCOUNT, cr_addresstype: 2, [`cr_addresstype${F}`]: "Billing", statecode: 0, createdon: at(-48 * HOUR), modifiedon: at(-48 * HOUR) },
            { cr_addressid: "bbbbbbbb-0000-4000-8000-000000000003", cr_name: "Primary (dup)", _cr_accountid_value: ACCOUNT, cr_addresstype: 1, [`cr_addresstype${F}`]: "Primary", statecode: 0, createdon: at(2 * HOUR + 400), modifiedon: at(2 * HOUR + 400) },
        ],
        account: [{ accountid: ACCOUNT, name: "Contoso Ltd", address1_line1: "1 Old St", statecode: 0 }],
    };
    return { tables, changes };
}

/** Minimal FetchXML evaluator: entity, eq / in / ne conditions (dates accepted), top. */
function fakeDataverse(store: ReturnType<typeof scenarioStore>, calls: string[]): ReadOnlyDataverse {
    const value = (row: Row, attr: string) => row[attr] ?? row[`_${attr}_value`];
    const norm = (v: unknown) => String(v).toLowerCase();
    const evalFetch = (xml: string): Row[] => {
        const entity = /<entity name="([^"]+)"/.exec(xml)![1];
        calls.push(`fetch:${entity}`);
        let rows = store.tables[entity] ?? [];
        const top = /<fetch top="(\d+)"/.exec(xml);
        // Only the outer "and" conditions are applied; nested or-groups are ignored (fine for this data).
        const outer = xml.replace(/<filter type="or">.*?<\/filter>/g, "");
        for (const m of outer.matchAll(/<condition attribute="([^"]+)" operator="(eq|ne)" value="([^"]*)" \/>/g)) {
            const [, attr, op, v] = m;
            if (/T\d\d:/.test(v)) continue;
            rows = rows.filter((r) => (op === "eq" ? norm(value(r, attr)) === norm(v) : norm(value(r, attr)) !== norm(v)));
        }
        for (const m of outer.matchAll(/<condition attribute="([^"]+)" operator="in">(.*?)<\/condition>/g)) {
            const values = [...m[2].matchAll(/<value>([^<]*)<\/value>/g)].map((x) => norm(x[1]));
            rows = rows.filter((r) => values.includes(norm(value(r, m[1]))));
        }
        return top ? rows.slice(0, Number(top[1])) : rows;
    };
    const attrs: Record<string, Array<[string, number, string]>> = {
        account: [["accountid", 1, "Uniqueidentifier"], ["name", 2, "String"], ["address1_line1", 3, "String"], ["statecode", 4, "State"]],
        cr_address: [["cr_addressid", 1, "Uniqueidentifier"], ["cr_name", 2, "String"], ["cr_line1", 3, "String"], ["cr_accountid", 4, "Lookup"], ["cr_addresstype", 5, "Picklist"], ["statecode", 6, "State"], ["createdon", 7, "DateTime"], ["modifiedon", 8, "DateTime"], ["cr_latitude", 9, "Decimal"]],
    };
    return {
        fetchXml: async (xml) => ({ value: evalFetch(xml), "@Microsoft.Dynamics.CRM.morerecords": false }) as never,
        query: async () => ({ value: [] }),
        retrieve: async (table, id) => {
            const row = (store.tables[table] ?? []).find((r) => norm(r[`${table}id`]) === norm(id));
            if (!row) throw new Error("Could not find record (0x80040217)");
            return row;
        },
        callFunction: async (call) => {
            calls.push(`fn:${call.name}`);
            if (call.name !== "RetrieveRecordChangeHistory") return {};
            const target = (call.parameters!.Target as { id: string }).id;
            const details = store.tables.audit
                .filter((a) => norm(a._objectid_value) === norm(target))
                .map((a) => {
                    const ch = store.changes[String(a.auditid)] ?? [];
                    return { AuditRecord: { auditid: a.auditid, createdon: a.createdon }, OldValue: Object.fromEntries(ch.map(([c, o]) => [c, o])), NewValue: Object.fromEntries(ch.map(([c, , n]) => [c, n])) };
                });
            return { AuditDetailCollection: { AuditDetails: details, MoreRecords: false } };
        },
        entityMetadata: async (table) => ({ MetadataId: table, LogicalName: table, PrimaryIdAttribute: `${table}id`, PrimaryNameAttribute: table === "account" ? "name" : "cr_name" }),
        entityAttributes: async (table) => (attrs[table] ?? []).map(([LogicalName, ColumnNumber, AttributeType]) => ({ LogicalName, ColumnNumber, AttributeType })),
        entityPrivileges: async () => [],
        entityRelationships: async (table, kind) => {
            if (table === "account" && kind === "OneToManyRelationships") return [{ SchemaName: "cr_account_cr_address", ReferencingEntity: "cr_address", ReferencingAttribute: "cr_accountid" }];
            if (table === "cr_address" && kind === "ManyToOneRelationships") return [{ SchemaName: "cr_account_cr_address", ReferencedEntity: "account", ReferencingAttribute: "cr_accountid" }];
            return [];
        },
        allEntities: async () => [],
    };
}

export async function run() {
    const store = scenarioStore();
    const calls: string[] = [];
    const report = evaluatePreflight(healthyFacts({ connection: { name: "Test", url: "https://contoso.crm.dynamics.com", enabledForPowerPlatformAPI: false } }));
    const updates: AnalysisResult[] = [];
    const result = await runAnalysis(
        {
            dv: fakeDataverse(store, calls),
            tables: [
                { logicalName: "account", displayName: "Account", entitySetName: "accounts" },
                { logicalName: "cr_address", displayName: "Address", entitySetName: "cr_addresses" },
            ],
            now: () => new Date(at(3 * HOUR)),
        },
        { table: "cr_address", recordId: ADDR_PRIMARY, column: "cr_line1", from: new Date(at(-24 * HOUR)), to: new Date(at(3 * HOUR)) },
        report,
        DEFAULT_SETTINGS,
        (r) => updates.push(r),
    );
    return { result, updates, calls };
}

