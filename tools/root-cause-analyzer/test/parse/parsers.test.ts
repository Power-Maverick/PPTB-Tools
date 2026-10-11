import { describe, expect, it } from "vitest";
import { mapApiRun } from "../../src/data/flowApi";
import { asyncStatus, flowRunStatus, mapAsyncRow, mapAuditRow, mapTraceRow } from "../../src/data/history";
import { classifyUser } from "../../src/data/users";
import { mapClassicWorkflow, mapStep } from "../../src/data/wiring";
import { findCycles, writeTriggers } from "../../src/engine/graph";
import { decodeAttributeMask } from "../../src/parse/attributeMask";
import { parseChangeHistory } from "../../src/parse/changeHistory";
import { parseFlowClientData } from "../../src/parse/flowClientData";
import { parseWorkflowXaml } from "../../src/parse/workflowXaml";
import { addressFlow, flowClientData, syncStep, users } from "../fixtures/scenario";

describe("flow clientdata", () => {
    it("reads the Dataverse trigger, filtering columns, conditions and nested writes", () => {
        const parsed = parseFlowClientData(flowClientData({ filtering: "cr_line1, CR_City", condition: "@equals(1,1)" }));
        expect(parsed.warnings).toEqual([]);
        expect(parsed.triggers).toEqual([
            { name: "When_an_address_is_modified", kind: "dataverse", table: "cr_address", messages: ["Update"], filteringColumns: ["cr_line1", "cr_city"], conditions: ["@equals(1,1)"], scope: "Organization" },
        ]);
        expect(parsed.writes).toEqual([
            { entitySet: "cr_addresses", operation: "Update", columns: ["cr_latitude", "cr_longitude"], action: "Set_geo", dynamic: undefined },
            { entitySet: "accounts", operation: "Update", columns: ["address1_line1", "address1_city"], action: "Update_account", dynamic: undefined },
        ]);
    });

    it("maps all change-type codes and the Filter rows expression", () => {
        const def = (message: number, extra = {}) =>
            parseFlowClientData({
                properties: {
                    definition: {
                        triggers: { t: { inputs: { host: { apiId: "x/shared_commondataserviceforapps" }, parameters: { "subscriptionRequest/message": message, "subscriptionRequest/entityname": "account", ...extra } } } },
                    },
                },
            }).triggers[0];
        expect(def(4).messages).toEqual(["Create", "Update"]);
        expect(def(7).messages).toEqual(["Create", "Update", "Delete"]);
        expect(def(3, { "subscriptionRequest/filterexpression": "statecode eq 0" }).conditions).toEqual(["Filter rows: statecode eq 0"]);
        expect(def(3).filteringColumns).toBeUndefined();
    });

    it("never throws on malformed input", () => {
        for (const bad of [undefined, null, "", "{not json", "[]", "{}", JSON.stringify({ properties: { definition: { triggers: 5, actions: { a: null, b: { actions: "x" } } } } })]) {
            const parsed = parseFlowClientData(bad);
            expect(parsed.triggers).toEqual([]);
            expect(parsed.warnings.length).toBeGreaterThan(0);
        }
    });

    it("warns about writes to a table chosen at run time, and about non-Dataverse triggers", () => {
        const parsed = parseFlowClientData({
            properties: {
                definition: {
                    triggers: { Recurrence: { type: "Recurrence" } },
                    actions: { Dyn: { inputs: { host: { apiId: "shared_commondataserviceforapps", operationId: "CreateRecord" }, parameters: { entityName: "@variables('t')" } } } },
                },
            },
        });
        expect(parsed.triggers[0].kind).toBe("other");
        expect(parsed.writes[0]).toMatchObject({ dynamic: true, entitySet: undefined });
        expect(parsed.warnings.join(" ")).toMatch(/chosen at run time/);
    });

    it("maps a flow row to a handler with tables resolved from entity sets", () => {
        const flow = addressFlow();
        expect(flow).toMatchObject({ id: expect.stringMatching(/^wf:/), kind: "flow", table: "cr_address", messages: ["Update"], enabled: true, state: "Activated", filteringColumns: ["cr_line1", "cr_city"] });
        expect(flow.writes.map((w) => `${w.operation} ${w.table} ${w.kind}`)).toEqual(["Update cr_address declared", "Update account declared"]);
    });
});

describe("classic workflow XAML", () => {
    const xaml = `<Activity><mxswa:UpdateEntity DisplayName="Update account" Entity="[x]" EntityName="account" />
        <mxswa:SetEntityProperty Attribute="address1_line1" Entity="[y]" EntityName="account" />
        <mxswa:CreateEntity EntityName="task" /></Activity>`;

    it("finds the tables and columns written", () => {
        expect(parseWorkflowXaml(xaml).writes).toEqual([
            { table: "account", operation: "Update", columns: ["address1_line1"] },
            { table: "task", operation: "Create", columns: [] },
        ]);
        expect(parseWorkflowXaml(undefined)).toEqual({ writes: [], warnings: [] });
    });

    it("maps triggers, real-time mode and status", () => {
        const wf = mapClassicWorkflow({ workflowid: "W1", name: "Sync", category: 0, mode: 1, statecode: 1, primaryentity: "account", triggeroncreate: true, triggeronupdateattributelist: "name,telephone1", xaml });
        expect(wf).toMatchObject({ kind: "realtime-workflow", mode: "sync", messages: ["Create", "Update"], filteringColumns: ["name", "telephone1"], enabled: true });
        expect(wf!.writes[0]).toMatchObject({ table: "account", kind: "declared" });
        const rule = mapClassicWorkflow({ workflowid: "R1", name: "Rule", category: 2, statecode: 0, primaryentity: "account" });
        expect(rule).toMatchObject({ kind: "businessrule", enabled: false, messages: ["Create", "Update"] });
    });
});

describe("plugin steps", () => {
    it("maps stage, mode, filtering columns and status", () => {
        expect(syncStep()).toMatchObject({ kind: "plugin", table: "account", messages: ["Update"], stage: 40, mode: "sync", rank: 1, enabled: true, filteringColumns: ["address1_line1", "address1_city"], typeName: "Contoso.Plugins.AccountAddressSync", system: false });
        expect(syncStep({ statecode: 1, "statecode@OData.Community.Display.V1.FormattedValue": "Disabled" })).toMatchObject({ enabled: false, state: "Disabled" });
        expect(syncStep({ ishidden: true }).system).toBe(true);
    });

    it("carries the plugin type and its assembly (version, isolation)", () => {
        const step = mapStep(
            { sdkmessageprocessingstepid: "cccccccc-0000-4000-8000-0000000000c1", name: "Step", stage: 20, mode: 0, statecode: 0, _sdkmessagefilterid_value: "dddddddd-0000-4000-8000-0000000000d1", _eventhandler_value: "aaaaaaaa-0000-4000-8000-0000000000a1" },
            {
                filters: new Map([["dddddddd-0000-4000-8000-0000000000d1", { table: "pmav_superhero", message: "Update" }]]),
                types: new Map([["aaaaaaaa-0000-4000-8000-0000000000a1", { typename: "PowerTips.Plugins.Training.CalculateSuperHeroScore", _pluginassemblyid_value: "bbbbbbbb-0000-4000-8000-0000000000b1" }]]),
                images: new Map(),
                assemblies: new Map([["bbbbbbbb-0000-4000-8000-0000000000b1", { name: "PowerTips.Plugins", version: "1.0.0.0", isolationmode: 2 }]]),
            },
        );
        expect(step).toMatchObject({
            pluginTypeId: "aaaaaaaa-0000-4000-8000-0000000000a1",
            typeName: "PowerTips.Plugins.Training.CalculateSuperHeroScore",
            assembly: { id: "bbbbbbbb-0000-4000-8000-0000000000b1", name: "PowerTips.Plugins", version: "1.0.0.0", isolation: "Sandbox" },
        });
    });
});

describe("change history", () => {
    const response = {
        AuditDetailCollection: {
            MoreRecords: true,
            PagingCookie: "<cookie/>",
            AuditDetails: [
                {
                    "@odata.type": "#Microsoft.Dynamics.CRM.AttributeAuditDetail",
                    AuditRecord: { auditid: "A1", createdon: "2026-10-09T10:00:00Z" },
                    OldValue: { cr_line1: "1 Old St", _cr_accountid_value: "x", "_cr_accountid_value@OData.Community.Display.V1.FormattedValue": "Contoso", modifiedon: "a", cr_type: 1, "cr_type@OData.Community.Display.V1.FormattedValue": "Primary" },
                    NewValue: { cr_line1: "2 New St", _cr_accountid_value: "y", "_cr_accountid_value@OData.Community.Display.V1.FormattedValue": "Fabrikam", modifiedon: "b", cr_type: 1, "cr_type@OData.Community.Display.V1.FormattedValue": "Primary" },
                },
                { "@odata.type": "#Microsoft.Dynamics.CRM.RelationshipAuditDetail", AuditRecord: { auditid: "A2", createdon: "2026-10-01T00:00:00Z" } },
            ],
        },
    };

    it("diffs old/new images using formatted values, ignoring noise and unchanged columns", () => {
        const parsed = parseChangeHistory(response);
        expect(parsed.byAuditId.get("a1")).toEqual([
            { column: "cr_accountid", oldValue: "Contoso", newValue: "Fabrikam" },
            { column: "cr_line1", oldValue: "1 Old St", newValue: "2 New St" },
        ]);
        expect(parsed.byAuditId.has("a2")).toBe(false);
        expect(parsed).toMatchObject({ more: true, pagingCookie: "<cookie/>", oldest: "2026-10-01T00:00:00Z" });
    });

    it("tolerates odd responses", () => {
        expect(parseChangeHistory(undefined).warnings).toHaveLength(1);
        expect(parseChangeHistory({ AuditDetailCollection: {} }).warnings).toHaveLength(1);
    });
});

describe("history mappers", () => {
    it("decodes attribute masks, keeping unknown numbers", () => {
        expect(decodeAttributeMask(",12,47,99,12,", new Map([[12, "name"], [47, "telephone1"]]))).toEqual({ columns: ["name", "telephone1"], unknown: [99] });
        expect(decodeAttributeMask(null, new Map())).toEqual({ columns: [], unknown: [] });
    });

    it("maps audit rows with actor classification", () => {
        const e = mapAuditRow(
            { auditid: "A1", createdon: "2026-10-09T10:00:00Z", action: 2, _userid_value: "22222222-0000-4000-8000-000000000002", _objectid_value: "BBBBBBBB-0000-4000-8000-000000000001", objecttypecode: "cr_address", attributemask: ",3," },
            { table: "cr_address", users, columnNumbers: new Map([[3, "cr_line1"]]) },
        );
        expect(e).toMatchObject({ id: "audit:a1", messageName: "Update", actor: { kind: "app", name: "ERP Integration" }, record: { table: "cr_address", id: "bbbbbbbb-0000-4000-8000-000000000001" }, changedColumns: ["cr_line1"] });
    });

    it("maps trace rows, keeping the step id and exception", () => {
        const e = mapTraceRow({ plugintracelogid: "T1", performanceexecutionstarttime: "2026-10-09T10:00:00Z", performanceexecutionduration: 250, typename: "Contoso.Plugins.Sync, Contoso.Plugins, Version=1.0", messagename: "Update", primaryentity: "account", depth: 2, mode: 0, operationtype: 1, correlationid: "{C1}", exceptiondetails: "boom", pluginstepid: "S1" });
        expect(e).toMatchObject({ handlerId: "step:s1", handlerName: "Contoso.Plugins.Sync", depth: 2, correlationId: "c1", status: "failed", error: "boom", endTime: "2026-10-09T10:00:00.250Z" });
    });

    it("maps system job states", () => {
        expect([asyncStatus(3, 30), asyncStatus(3, 31), asyncStatus(1, 10), asyncStatus(0, 0), asyncStatus(2, 20), asyncStatus(3, 32)]).toEqual(["success", "failed", "suspended", "waiting", "inprogress", "canceled"]);
        const e = mapAsyncRow({ asyncoperationid: "J1", name: "Geo", operationtype: 10, statecode: 3, statuscode: 31, createdon: "2026-10-09T10:00:00Z", _workflowactivationid_value: "aaaaaaaa-0000-4000-8000-00000000000a", message: "Timeout" }, { activationToDefinition: new Map([["aaaaaaaa-0000-4000-8000-00000000000a", "def"]]) });
        expect(e).toMatchObject({ handlerId: "wf:def", status: "failed", error: "Timeout", actor: { kind: "workflow" } });
    });

    it("maps flow run status words", () => {
        expect(["Succeeded", "Failed", "Cancelled", "Running", "Waiting", "TimedOut", "Skipped", "?"].map(flowRunStatus)).toEqual(["success", "failed", "canceled", "inprogress", "waiting", "failed", "canceled", "unknown"]);
    });

    it("maps Power Automate API runs defensively", () => {
        const flow = addressFlow();
        expect(mapApiRun({ name: "085851", properties: { startTime: "2026-10-09T10:00:00Z", status: "Failed", error: { message: "Bad" }, trigger: { name: "When" } } }, flow)).toMatchObject({ id: "flowrun:085851", status: "failed", error: "Bad", handlerId: flow.id });
        expect(mapApiRun({ id: "/x/runs/R2", startTime: "2026-10-09T10:00:00Z", status: "Succeeded" }, flow)).toMatchObject({ id: "flowrun:r2", status: "success" });
        expect(mapApiRun({ properties: {} }, flow)).toBeUndefined();
    });

    it("classifies users", () => {
        expect(classifyUser({ systemuserid: "A", fullname: "SYSTEM" }).kind).toBe("system");
        expect(classifyUser({ systemuserid: "A", fullname: "x", applicationid: "id" }).kind).toBe("app");
        expect(classifyUser({ systemuserid: "A", fullname: "x", accessmode: 4 }).kind).toBe("app");
        expect(classifyUser({ systemuserid: "A", fullname: "x", accessmode: 0 }).kind).toBe("user");
    });
});

describe("graph", () => {
    it("a write only re-triggers handlers on the right message and columns", () => {
        const step = syncStep();
        expect(writeTriggers({ table: "account", operation: "Update", columns: ["address1_line1"], kind: "declared" }, step)).toBe(true);
        expect(writeTriggers({ table: "account", operation: "Update", columns: ["telephone1"], kind: "declared" }, step)).toBe(false);
        expect(writeTriggers({ table: "account", operation: "Create", kind: "declared" }, step)).toBe(false);
        expect(writeTriggers({ table: "account", operation: "Upsert", kind: "declared" }, step)).toBe(true);
    });

    it("finds each cycle once, over enabled handlers only", () => {
        const step = { ...syncStep(), writes: [{ table: "cr_address", operation: "Update", columns: ["cr_line1"], kind: "inferred" as const }] };
        const flow = addressFlow();
        expect(findCycles([step, flow])).toEqual([[flow.id, "table:account", step.id, "table:cr_address"]].map((c) => (c[0] < c[2] ? c : [c[2], c[3], c[0], c[1]])));
        expect(findCycles([step, { ...flow, enabled: false }])).toEqual([]);
    });
});
