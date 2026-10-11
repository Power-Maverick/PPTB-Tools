import type { ReadOnlyDataverse } from "../host/readOnlyDataverse";
import type { HandlerWrite, TableSchema, WiringHandler } from "../model/types";
import { parseFlowClientData } from "../parse/flowClientData";
import { parseWorkflowXaml } from "../parse/workflowXaml";
import { bool, formatted, guidLower, lookupId, lookupName, lookupTable, num, splitList, str } from "../parse/values";
import { entityNameFilter, fetchPages, type FetchSpec } from "./fetchXml";
import { normalizeTypeName, present } from "./history";

type Row = Record<string, unknown>;

export interface WiringLoad {
    handlers: WiringHandler[];
    warnings: string[];
}

async function rowsOf(dv: ReadOnlyDataverse, spec: FetchSpec, maxPages = 10, pageSize = 250): Promise<{ rows: Row[]; truncated: boolean }> {
    const rows: Row[] = [];
    let truncated = false;
    for await (const page of fetchPages(dv, spec, { pageSize, maxPages })) {
        rows.push(...page.rows);
        truncated = page.truncated;
    }
    return { rows, truncated };
}

async function inChunks(dv: ReadOnlyDataverse, ids: string[], build: (chunk: string[]) => FetchSpec): Promise<Row[]> {
    const unique = [...new Set(ids)];
    const rows: Row[] = [];
    for (let i = 0; i < unique.length; i += 100) rows.push(...(await rowsOf(dv, build(unique.slice(i, i + 100)), 4)).rows);
    return rows;
}

// ---------------------------------------------------------------------------------------------
// Plugin steps
// ---------------------------------------------------------------------------------------------

export const STAGE_LABELS: Record<number, string> = { 10: "Pre-validation", 20: "Pre-operation", 30: "Main operation", 40: "Post-operation" };
const IMAGE_TYPES: Record<number, string> = { 0: "Pre-image", 1: "Post-image", 2: "Pre & post image" };

export interface StepContext {
    filters: Map<string, { table: string; message: string }>;
    types: Map<string, Row>;
    images: Map<string, Row[]>;
    assemblies?: Map<string, Row>;
}

/** Pure */
export function mapStep(row: Row, ctx: StepContext): WiringHandler | undefined {
    const id = guidLower(row.sdkmessageprocessingstepid);
    const filterId = lookupId(row, "sdkmessagefilterid");
    const filter = filterId ? ctx.filters.get(filterId) : undefined;
    if (!id || !filter) return undefined;
    const handlerId = lookupId(row, "eventhandler") ?? lookupId(row, "plugintypeid");
    const handlerTable = lookupTable(row, "eventhandler");
    const type = handlerId ? ctx.types.get(handlerId) : undefined;
    const typeName = type ? normalizeTypeName(type.typename) : handlerTable === "serviceendpoint" ? "Service endpoint" : (lookupName(row, "eventhandler") ?? "Unknown handler");
    const stage = num(row.stage);
    const enabled = num(row.statecode) === 0;
    const hidden = bool(row.ishidden) === true;
    const system = hidden || num(row.customizationlevel) === 0 || /^Microsoft\./.test(typeName);
    const assemblyId = type ? lookupId(type, "pluginassemblyid") : undefined;
    const assemblyRow = assemblyId ? ctx.assemblies?.get(assemblyId) : undefined;
    const assemblyName = str(assemblyRow?.name) ?? (type ? str(type.assemblyname) : undefined) ?? (type ? lookupName(type, "pluginassemblyid") : undefined);
    return {
        id: `step:${id}`,
        rawId: id,
        kind: "plugin",
        name: str(row.name) ?? typeName,
        table: filter.table,
        messages: [filter.message],
        stage,
        mode: num(row.mode) === 1 ? "async" : "sync",
        rank: num(row.rank),
        enabled,
        state: formatted(row, "statecode") ?? (enabled ? "Enabled" : "Disabled"),
        filteringColumns: splitList(row.filteringattributes),
        triggerConditions: [],
        writes: [],
        typeName,
        pluginTypeId: type ? handlerId : undefined,
        assembly: assemblyName
            ? {
                  id: assemblyId,
                  name: assemblyName,
                  version: assemblyRow ? str(assemblyRow.version) : undefined,
                  isolation: assemblyRow ? (formatted(assemblyRow, "isolationmode") ?? (num(assemblyRow.isolationmode) === 2 ? "Sandbox" : num(assemblyRow.isolationmode) === 1 ? "None" : undefined)) : undefined,
                  modifiedOn: assemblyRow ? str(assemblyRow.modifiedon) : undefined,
                  modifiedByName: assemblyRow ? lookupName(assemblyRow, "modifiedby") : undefined,
              }
            : undefined,
        runAsUserId: lookupId(row, "impersonatinguserid"),
        modifiedOn: str(row.modifiedon),
        modifiedByName: lookupName(row, "modifiedby"),
        images: (ctx.images.get(id) ?? []).map((img) => ({
            type: IMAGE_TYPES[num(img.imagetype) ?? -1] ?? "Image",
            alias: str(img.entityalias),
            columns: splitList(img.attributes),
        })),
        asyncAutoDelete: bool(row.asyncautodelete),
        system,
        warnings: handlerTable === "serviceendpoint" ? ["Sends the message to a service endpoint (webhook / Service Bus); downstream effects aren't visible."] : [],
    };
}

export async function loadPluginSteps(dv: ReadOnlyDataverse, schema: Record<string, TableSchema>, tables: string[], typeCodes?: Map<string, number>): Promise<WiringLoad> {
    const warnings: string[] = [];
    if (!tables.length) return { handlers: [], warnings };
    const filterRows = (
        await rowsOf(dv, {
            entity: "sdkmessagefilter",
            attributes: ["sdkmessagefilterid", ...present(schema.sdkmessagefilter, ["primaryobjecttypecode", "sdkmessageid"])],
            ...entityNameFilter("primaryobjecttypecode", tables, typeCodes),
        })
    ).rows;
    if (!filterRows.length) return { handlers: [], warnings };

    const messageIds = filterRows.map((r) => lookupId(r, "sdkmessageid")).filter((x): x is string => !!x);
    const messages = new Map(
        (await inChunks(dv, messageIds, (chunk) => ({ entity: "sdkmessage", attributes: ["sdkmessageid", "name"], conditions: [{ attribute: "sdkmessageid", operator: "in", value: chunk }] }))).map((r) => [
            guidLower(r.sdkmessageid)!,
            str(r.name) ?? "?",
        ]),
    );
    const filters = new Map<string, { table: string; message: string }>();
    for (const r of filterRows) {
        const id = guidLower(r.sdkmessagefilterid);
        const msgId = lookupId(r, "sdkmessageid");
        if (id) filters.set(id, { table: String(r.primaryobjecttypecode).toLowerCase(), message: (msgId && messages.get(msgId)) || lookupName(r, "sdkmessageid") || "?" });
    }

    const stepColumns = present(schema.sdkmessageprocessingstep, [
        "name",
        "stage",
        "mode",
        "rank",
        "filteringattributes",
        "statecode",
        "sdkmessagefilterid",
        "eventhandler",
        "plugintypeid",
        "impersonatinguserid",
        "asyncautodelete",
        "modifiedon",
        "modifiedby",
        "ishidden",
        "customizationlevel",
    ]);
    const stepRows = await inChunks(dv, [...filters.keys()], (chunk) => ({
        entity: "sdkmessageprocessingstep",
        attributes: ["sdkmessageprocessingstepid", ...stepColumns],
        conditions: [{ attribute: "sdkmessagefilterid", operator: "in", value: chunk }],
    }));

    const typeIds = stepRows.map((r) => lookupId(r, "eventhandler") ?? lookupId(r, "plugintypeid")).filter((x): x is string => !!x);
    const types = new Map(
        (
            await inChunks(dv, typeIds, (chunk) => ({
                entity: "plugintype",
                attributes: ["plugintypeid", ...present(schema.plugintype, ["typename", "assemblyname", "friendlyname", "pluginassemblyid"])],
                conditions: [{ attribute: "plugintypeid", operator: "in", value: chunk }],
            }))
        ).map((r) => [guidLower(r.plugintypeid)!, r]),
    );

    const assemblies = new Map<string, Row>();
    const assemblyIds = [...types.values()].map((t) => lookupId(t, "pluginassemblyid")).filter((x): x is string => !!x);
    if (schema.pluginassembly?.exists && assemblyIds.length) {
        try {
            for (const r of await inChunks(dv, assemblyIds, (chunk) => ({
                entity: "pluginassembly",
                attributes: ["pluginassemblyid", ...present(schema.pluginassembly, ["name", "version", "isolationmode", "modifiedon", "modifiedby"])],
                conditions: [{ attribute: "pluginassemblyid", operator: "in", value: chunk }],
            })))
                assemblies.set(guidLower(r.pluginassemblyid)!, r);
        } catch {
            warnings.push("Plugin assemblies couldn't be read; steps show the assembly name only.");
        }
    }

    const images = new Map<string, Row[]>();
    if (schema.sdkmessageprocessingstepimage?.exists) {
        try {
            const imageRows = await inChunks(dv, stepRows.map((r) => guidLower(r.sdkmessageprocessingstepid)!), (chunk) => ({
                entity: "sdkmessageprocessingstepimage",
                attributes: present(schema.sdkmessageprocessingstepimage, ["imagetype", "attributes", "entityalias", "sdkmessageprocessingstepid"]),
                conditions: [{ attribute: "sdkmessageprocessingstepid", operator: "in", value: chunk }],
            }));
            for (const img of imageRows) {
                const stepId = lookupId(img, "sdkmessageprocessingstepid");
                if (stepId) images.set(stepId, [...(images.get(stepId) ?? []), img]);
            }
        } catch {
            warnings.push("Step images couldn't be read.");
        }
    }

    const handlers = stepRows.map((r) => mapStep(r, { filters, types, images, assemblies })).filter((h): h is WiringHandler => !!h);
    return { handlers, warnings };
}

// ---------------------------------------------------------------------------------------------
// Classic workflows & business rules
// ---------------------------------------------------------------------------------------------

/** Pure */
export function mapClassicWorkflow(row: Row): WiringHandler | undefined {
    const id = guidLower(row.workflowid);
    if (!id) return undefined;
    const category = num(row.category);
    const isRule = category === 2;
    const realtime = !isRule && num(row.mode) === 1;
    const messages: string[] = [];
    if (isRule) messages.push("Create", "Update");
    else {
        if (bool(row.triggeroncreate)) messages.push("Create");
        if (str(row.triggeronupdateattributelist) !== undefined || bool(row.triggeronupdate)) messages.push("Update");
        if (bool(row.triggerondelete)) messages.push("Delete");
    }
    const enabled = num(row.statecode) === 1;
    const xaml = parseWorkflowXaml(row.xaml);
    const warnings = [...xaml.warnings];
    if (isRule) warnings.push("Business rules run inside the platform and leave no execution history.");
    else if (realtime) warnings.push("Real-time workflows leave no execution history unless they fail and error logging is on.");
    if (!messages.length && !isRule) warnings.push("Runs on demand or as a child process only.");
    return {
        id: `wf:${id}`,
        rawId: id,
        kind: isRule ? "businessrule" : realtime ? "realtime-workflow" : "workflow",
        name: str(row.name) ?? "Process",
        table: (str(row.primaryentity) ?? "none").toLowerCase(),
        messages,
        mode: isRule || realtime ? "sync" : "async",
        enabled,
        state: formatted(row, "statecode") ?? (enabled ? "Activated" : "Draft"),
        filteringColumns: isRule ? undefined : splitList(row.triggeronupdateattributelist),
        triggerConditions: [],
        writes: xaml.writes.map((w): HandlerWrite => ({ table: w.table, columns: w.columns.length ? w.columns : undefined, operation: w.operation, kind: "declared", reason: "from the workflow definition" })),
        ownerId: lookupId(row, "ownerid"),
        ownerName: lookupName(row, "ownerid"),
        modifiedOn: str(row.modifiedon),
        modifiedByName: lookupName(row, "modifiedby"),
        activationId: lookupId(row, "activeworkflowid"),
        images: [],
        warnings,
    };
}

export async function loadClassicWorkflows(dv: ReadOnlyDataverse, schema: TableSchema | undefined, tables: string[], typeCodes?: Map<string, number>): Promise<WiringLoad> {
    if (!tables.length || !schema?.exists) return { handlers: [], warnings: [] };
    const nameFilter = entityNameFilter("primaryentity", tables, typeCodes);
    const { rows } = await rowsOf(dv, {
        entity: "workflow",
        attributes: [
            "workflowid",
            ...present(schema, [
                "name",
                "category",
                "statecode",
                "primaryentity",
                "mode",
                "type",
                "triggeroncreate",
                "triggerondelete",
                "triggeronupdateattributelist",
                "modifiedon",
                "modifiedby",
                "ownerid",
                "activeworkflowid",
                "xaml",
            ]),
        ],
        conditions: [
            ...(nameFilter.conditions ?? []),
            { attribute: "category", operator: "in", value: [0, 2] },
            { attribute: "type", operator: "eq", value: 1 },
        ],
        subFilters: nameFilter.subFilters,
    });
    return { handlers: rows.map(mapClassicWorkflow).filter((h): h is WiringHandler => !!h), warnings: [] };
}

// ---------------------------------------------------------------------------------------------
// Cloud flows
// ---------------------------------------------------------------------------------------------

/** Pure */
export function mapFlow(row: Row, entitySetToTable: Map<string, string>): WiringHandler | undefined {
    const id = guidLower(row.workflowid);
    if (!id) return undefined;
    const parsed = parseFlowClientData(row.clientdata);
    const warnings = [...parsed.warnings];
    const dataverseTriggers = parsed.triggers.filter((t) => t.kind !== "other");
    if (dataverseTriggers.length > 1) warnings.push("Flow has more than one Dataverse trigger; only the first is shown.");
    const trigger = dataverseTriggers[0];
    const writes: HandlerWrite[] = [];
    for (const w of parsed.writes) {
        if (!w.entitySet) continue;
        const table = entitySetToTable.get(w.entitySet) ?? (entitySetToTable.size === 0 ? w.entitySet : undefined);
        if (!table) {
            warnings.push(`Action '${w.action}' writes to '${w.entitySet}', which couldn't be matched to a table.`);
            continue;
        }
        writes.push({ table, columns: w.columns.length ? w.columns : undefined, operation: w.operation, kind: "declared", reason: `action '${w.action}'` });
    }
    const state = num(row.statecode);
    return {
        id: `wf:${id}`,
        rawId: id,
        kind: "flow",
        name: str(row.name) ?? "Cloud flow",
        table: trigger?.table ?? "none",
        messages: trigger?.messages ?? [],
        mode: "async",
        enabled: state === 1,
        state: formatted(row, "statecode") ?? (state === 1 ? "On" : state === 2 ? "Suspended" : "Off"),
        filteringColumns: trigger?.filteringColumns,
        triggerConditions: trigger?.conditions ?? [],
        writes,
        ownerId: lookupId(row, "ownerid"),
        ownerName: lookupName(row, "ownerid"),
        modifiedOn: str(row.modifiedon),
        modifiedByName: lookupName(row, "modifiedby"),
        images: [],
        warnings: trigger ? warnings : [...warnings, "Not triggered by a Dataverse change (scheduled, manual or another connector)."],
    };
}

/**
 * Solution-aware cloud flows (they live in the workflow table) whose definition mentions one of the
 * given tables — by logical name (trigger) or entity set name (actions), both quoted in the JSON.
 * Filtering on the server avoids downloading every flow definition in the environment.
 */
export async function loadCloudFlows(dv: ReadOnlyDataverse, schema: TableSchema | undefined, entitySetToTable: Map<string, string>, tables: string[]): Promise<WiringLoad> {
    if (!schema?.exists || !tables.length) return { handlers: [], warnings: [] };
    if (!schema.columns.includes("clientdata")) return { handlers: [], warnings: ["Cloud flow definitions (workflow.clientdata) aren't readable, so flows can't be placed on the map."] };
    const setOf = new Map([...entitySetToTable].map(([set, table]) => [table, set]));
    const terms = [...new Set(tables.flatMap((t) => [t, setOf.get(t)].filter((x): x is string => !!x)))];
    const base: FetchSpec = {
        entity: "workflow",
        attributes: ["workflowid", ...present(schema, ["name", "statecode", "clientdata", "modifiedon", "modifiedby", "ownerid"])],
        conditions: [
            { attribute: "category", operator: "eq", value: 5 },
            { attribute: "type", operator: "eq", value: 1 },
        ],
    };
    const warnings: string[] = [];
    let result: { rows: Row[]; truncated: boolean };
    try {
        result = await rowsOf(dv, { ...base, subFilters: [{ type: "or", conditions: terms.map((t) => ({ attribute: "clientdata", operator: "like" as const, value: `%"${t}"%` })) }] }, 10, 50);
    } catch {
        warnings.push("Flows couldn't be filtered by table on the server; scanning up to 500 flow definitions instead.");
        result = await rowsOf(dv, base, 10, 50);
    }
    if (result.truncated) warnings.push("Not every cloud flow could be checked (more than 500 matched); the map may be missing some.");
    const handlers = result.rows
        .map((r) => mapFlow(r, entitySetToTable))
        .filter((h): h is WiringHandler => !!h && (tables.includes(h.table) || h.writes.some((w) => tables.includes(w.table))));
    return { handlers, warnings };
}
