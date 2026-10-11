/**
 * The ONLY module allowed to touch window.dataverseAPI (enforced by test/host/readOnlyGuard.test.ts).
 *
 * Root Cause Analyzer is strictly read-only: this wrapper exposes queries, metadata reads and an
 * allowlist of Web API *functions* (HTTP GET). Actions, create/update/delete, associate and every
 * other write path are deliberately not reachable from the rest of the code base.
 */
import { TimeoutError } from "./errors";

/** The subset of the host API this wrapper is permitted to call. */
export type DataverseReadSurface = Pick<
    DataverseAPI.API,
    "fetchXmlQuery" | "queryData" | "retrieve" | "execute" | "getEntityMetadata" | "getEntityRelatedMetadata" | "getAllEntitiesMetadata"
>;

/** Web API functions (GET, no side effects) the tool may call. Never add actions here. */
export const ALLOWED_FUNCTIONS = [
    "WhoAmI",
    "RetrieveVersion",
    "RetrieveCurrentOrganization",
    "RetrieveUserPrivilegeByPrivilegeName",
    "RetrieveRecordChangeHistory",
] as const;
export type AllowedFunction = (typeof ALLOWED_FUNCTIONS)[number];

export interface FunctionCall {
    name: AllowedFunction;
    parameters?: Record<string, unknown>;
    /** Bound functions, e.g. systemuser(<id>)/RetrieveUserPrivilegeByPrivilegeName */
    boundTo?: { table: string; id: string };
}

const ANNOTATIONS = { Prefer: 'odata.include-annotations="*"' };

export interface ReadOnlyDataverse {
    fetchXml(fetchXml: string): Promise<DataverseAPI.FetchXmlResult>;
    /** OData path + query, e.g. "organizations?$select=plugintracelogsetting" */
    query(odata: string): Promise<{ value: Record<string, unknown>[] }>;
    retrieve(table: string, id: string, columns?: string[]): Promise<Record<string, unknown>>;
    callFunction(call: FunctionCall): Promise<Record<string, unknown>>;
    entityMetadata(table: string, properties?: string[]): Promise<DataverseAPI.EntityMetadata>;
    entityAttributes(table: string, properties?: string[]): Promise<Record<string, unknown>[]>;
    entityPrivileges(table: string): Promise<Record<string, unknown>[]>;
    entityRelationships(table: string, kind: "OneToManyRelationships" | "ManyToOneRelationships", properties?: string[]): Promise<Record<string, unknown>[]>;
    allEntities(properties?: string[]): Promise<DataverseAPI.EntityMetadata[]>;
}

export interface ReadOnlyOptions {
    maxConcurrent?: number;
    timeoutMs?: number;
}

export function createReadOnlyDataverse(api: DataverseReadSurface, options: ReadOnlyOptions = {}): ReadOnlyDataverse {
    const limit = createLimiter(options.maxConcurrent ?? 6);
    const timeoutMs = options.timeoutMs ?? 90_000;
    const run = <T>(label: string, op: () => Promise<T>) => limit(() => withTimeout(label, op(), timeoutMs));

    const client: ReadOnlyDataverse = {
        fetchXml: (fetchXml) => run("FetchXML query", () => api.fetchXmlQuery(fetchXml, "primary", ANNOTATIONS)),
        query: (odata) => run("OData query", () => api.queryData(odata, "primary", ANNOTATIONS)),
        retrieve: (table, id, columns) => run(`Retrieve ${table}`, () => api.retrieve(table, id, columns, "primary", ANNOTATIONS)),
        callFunction: (call) => {
            if (!(ALLOWED_FUNCTIONS as readonly string[]).includes(call.name)) {
                return Promise.reject(new Error(`Function '${call.name}' is not on the read-only allowlist`));
            }
            return run(call.name, () =>
                api.execute(
                    {
                        operationName: call.name,
                        operationType: "function",
                        entityName: call.boundTo?.table,
                        entityId: call.boundTo?.id,
                        parameters: call.parameters,
                    },
                    "primary",
                    ANNOTATIONS,
                ),
            );
        },
        entityMetadata: (table, properties) => run(`Metadata ${table}`, () => api.getEntityMetadata(table, true, properties, "primary")),
        entityAttributes: async (table, properties) => {
            const result = await run(`Columns ${table}`, () => api.getEntityRelatedMetadata(table, "Attributes", properties, "primary"));
            return result.value;
        },
        entityPrivileges: async (table) => {
            const result = await run(`Privileges ${table}`, () => api.getEntityRelatedMetadata(table, "Privileges", undefined, "primary"));
            return result.value;
        },
        entityRelationships: async (table, kind, properties) => {
            const result = await run(`Relationships ${table}`, () => api.getEntityRelatedMetadata(table, kind, properties, "primary"));
            return result.value;
        },
        allEntities: async (properties) => {
            const result = await run("Table list", () => api.getAllEntitiesMetadata(properties, "primary"));
            return result.value;
        },
    };
    return Object.freeze(client);
}

let defaultClient: ReadOnlyDataverse | undefined;

/** Lazily bound to the host so modules can be imported in tests without a window. */
export function getDataverse(): ReadOnlyDataverse {
    if (!defaultClient) {
        if (typeof window === "undefined" || !window.dataverseAPI) {
            throw new Error("Dataverse API is not available. Open this tool inside Power Platform ToolBox.");
        }
        defaultClient = createReadOnlyDataverse(window.dataverseAPI);
    }
    return defaultClient;
}

function withTimeout<T>(label: string, promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createLimiter(max: number) {
    let active = 0;
    const queue: Array<() => void> = [];
    const next = () => {
        if (active >= max) return;
        const start = queue.shift();
        if (start) start();
    };
    return <T>(task: () => Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            queue.push(() => {
                active++;
                task()
                    .then(resolve, reject)
                    .finally(() => {
                        active--;
                        next();
                    });
            });
            next();
        });
}
