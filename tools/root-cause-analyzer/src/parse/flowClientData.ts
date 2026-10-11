/**
 * Defensive parser for workflow.clientdata of cloud flows (category 5).
 * Malformed or unexpected shapes produce warnings, never exceptions.
 */

export interface ParsedTrigger {
    name: string;
    kind: "dataverse" | "dataverse-legacy" | "other";
    table?: string;
    messages: string[];
    /** undefined = any column */
    filteringColumns?: string[];
    /** Trigger conditions and the "Filter rows" expression, verbatim. */
    conditions: string[];
    scope?: string;
}

export interface ParsedWrite {
    /** Dataverse actions use the entity *set* name (e.g. "accounts"). */
    entitySet?: string;
    operation: "Create" | "Update" | "Delete" | "Upsert";
    columns: string[];
    action: string;
    dynamic?: boolean;
}

export interface ParsedFlow {
    triggers: ParsedTrigger[];
    writes: ParsedWrite[];
    warnings: string[];
}

// subscriptionRequest/message codes used by the Dataverse "When a row is added, modified or deleted" trigger.
const MESSAGE_CODES: Record<number, string[]> = {
    1: ["Create"],
    2: ["Delete"],
    3: ["Update"],
    4: ["Create", "Update"],
    5: ["Create", "Delete"],
    6: ["Update", "Delete"],
    7: ["Create", "Update", "Delete"],
};

const SCOPES: Record<number, string> = { 1: "User", 2: "Business unit", 3: "Parent: child business unit", 4: "Organization" };

const WRITE_OPERATIONS: Record<string, ParsedWrite["operation"]> = {
    createrecord: "Create",
    updaterecord: "Update",
    updateonlyrecord: "Update",
    deleterecord: "Delete",
    upsertrecord: "Upsert",
};

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function isDataverseApi(host: Obj | undefined): "current" | "legacy" | undefined {
    const id = String(host?.apiId ?? host?.connectionName ?? host?.connection ?? "").toLowerCase();
    if (id.includes("commondataserviceforapps")) return "current";
    if (id.includes("commondataservice")) return "legacy";
    return undefined;
}

export function parseFlowClientData(clientdata: unknown): ParsedFlow {
    const result: ParsedFlow = { triggers: [], writes: [], warnings: [] };
    let root: unknown = clientdata;
    if (typeof clientdata === "string") {
        if (!clientdata.trim()) {
            result.warnings.push("Flow definition is empty.");
            return result;
        }
        try {
            root = JSON.parse(clientdata);
        } catch {
            result.warnings.push("Flow definition isn't valid JSON; its trigger and actions couldn't be read.");
            return result;
        }
    }
    if (!isObj(root)) {
        result.warnings.push("Flow definition has an unexpected shape.");
        return result;
    }

    const properties = isObj(root.properties) ? root.properties : root;
    const definition = isObj(properties.definition) ? properties.definition : undefined;
    if (!definition) {
        result.warnings.push("Flow definition has no 'definition' section.");
        return result;
    }

    try {
        if (isObj(definition.triggers)) {
            for (const [name, trigger] of Object.entries(definition.triggers)) {
                if (isObj(trigger)) result.triggers.push(parseTrigger(name, trigger, result.warnings));
            }
        } else {
            result.warnings.push("Flow has no triggers section.");
        }
        if (isObj(definition.actions)) walkActions(definition.actions, result);
    } catch (error) {
        result.warnings.push(`Part of the flow definition couldn't be read: ${error instanceof Error ? error.message : String(error)}`);
    }
    return result;
}

function parseTrigger(name: string, trigger: Obj, warnings: string[]): ParsedTrigger {
    const inputs = isObj(trigger.inputs) ? trigger.inputs : {};
    const host = isObj(inputs.host) ? inputs.host : undefined;
    const params = isObj(inputs.parameters) ? inputs.parameters : {};
    const conditions = Array.isArray(trigger.conditions)
        ? trigger.conditions.map((c) => (isObj(c) && typeof c.expression === "string" ? c.expression : undefined)).filter((c): c is string => !!c)
        : [];
    const api = isDataverseApi(host);

    if (api === "current") {
        const messageCode = Number(params["subscriptionRequest/message"]);
        const messages = MESSAGE_CODES[messageCode];
        if (!messages) warnings.push(`Trigger '${name}' has an unrecognised change type (${String(params["subscriptionRequest/message"])}).`);
        const filter = params["subscriptionRequest/filterexpression"];
        if (typeof filter === "string" && filter.trim()) conditions.push(`Filter rows: ${filter.trim()}`);
        const filtering = params["subscriptionRequest/filteringattributes"];
        const scope = SCOPES[Number(params["subscriptionRequest/scope"])];
        return {
            name,
            kind: "dataverse",
            table: typeof params["subscriptionRequest/entityname"] === "string" ? (params["subscriptionRequest/entityname"] as string).toLowerCase() : undefined,
            messages: messages ?? [],
            filteringColumns: typeof filtering === "string" && filtering.trim() ? filtering.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean) : undefined,
            conditions,
            scope,
        };
    }
    if (api === "legacy") {
        warnings.push(`Trigger '${name}' uses the legacy Dataverse connector; its change type and columns are approximate.`);
        const op = String(host?.operationId ?? "").toLowerCase();
        const messages = op.includes("new") ? ["Create"] : op.includes("updated") ? ["Update"] : op.includes("deleted") ? ["Delete"] : [];
        const table = typeof params.table === "string" ? params.table.toLowerCase() : undefined;
        return { name, kind: "dataverse-legacy", table, messages, conditions };
    }
    return { name, kind: "other", messages: [], conditions };
}

function walkActions(actions: Obj, result: ParsedFlow, depth = 0) {
    if (depth > 30) {
        result.warnings.push("Flow actions are nested too deeply; some were skipped.");
        return;
    }
    for (const [name, action] of Object.entries(actions)) {
        if (!isObj(action)) continue;
        const inputs = isObj(action.inputs) ? action.inputs : {};
        const host = isObj(inputs.host) ? inputs.host : undefined;
        if (isDataverseApi(host)) {
            const operation = WRITE_OPERATIONS[String(host?.operationId ?? "").toLowerCase()];
            if (operation) {
                const params = isObj(inputs.parameters) ? inputs.parameters : {};
                const entity = params.entityName;
                const dynamic = typeof entity !== "string" || entity.startsWith("@");
                const columns = Object.keys(params)
                    .filter((k) => k.startsWith("item/"))
                    .map((k) =>
                        k
                            .slice(5)
                            .replace(/@odata\.bind$/i, "")
                            .toLowerCase(),
                    );
                result.writes.push({ entitySet: dynamic ? undefined : (entity as string).toLowerCase(), operation, columns, action: name, dynamic: dynamic || undefined });
                if (dynamic) result.warnings.push(`Action '${name}' writes to a table chosen at run time; it can't be placed on the map.`);
            }
        }
        // Containers: Scope / Foreach / Until (actions), Condition (actions + else.actions), Switch (cases.*.actions + default.actions)
        if (isObj(action.actions)) walkActions(action.actions, result, depth + 1);
        if (isObj(action.else) && isObj(action.else.actions)) walkActions(action.else.actions, result, depth + 1);
        if (isObj(action.default) && isObj(action.default.actions)) walkActions(action.default.actions, result, depth + 1);
        if (isObj(action.cases)) {
            for (const c of Object.values(action.cases)) if (isObj(c) && isObj(c.actions)) walkActions(c.actions, result, depth + 1);
        }
    }
}
