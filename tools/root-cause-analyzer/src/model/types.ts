// Shared model types.

export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export function weakest(...values: Confidence[]): Confidence {
    return values.reduce((a, b) => (CONFIDENCE_RANK[b] < CONFIDENCE_RANK[a] ? b : a), "high" as Confidence);
}

/** Anything the tool could not evaluate is reported, never dropped. */
export interface Unavailable {
    kind: "unavailable";
    reason: string;
}

// ---------------------------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------------------------

export type CheckStatus = "ok" | "info" | "warning" | "error";

export interface PreflightCheck {
    id: string;
    group: "connection" | "tracing" | "audit" | "access" | "flows" | "schema";
    title: string;
    status: CheckStatus;
    /** One-line plain-language result. */
    summary: string;
    /** What the tool will not be able to show because of this. */
    impact?: string;
    /** How an admin can fix it. The tool never changes settings itself. */
    fix?: string;
    details?: string[];
}

/**
 * Data sources the analysis depends on. Rules declare which they need, and the runner turns
 * an unavailable source into an Unavailable result with the reason given here.
 */
export type SourceId =
    | "wiring.plugins"
    | "wiring.workflows"
    | "history.trace"
    | "history.traceSuccess"
    | "history.async"
    | "history.audit"
    | "history.flowrun"
    | "history.flowrunApi";

export interface SourceState {
    available: boolean;
    /** Why it's unavailable, or what is partially missing when available. */
    reason?: string;
    partial?: boolean;
}

export type SourceMap = Record<SourceId, SourceState>;

export interface PreflightReport {
    checkedAt: string;
    checks: PreflightCheck[];
    sources: SourceMap;
    /** Columns actually present per table, from metadata. Queries select only from these. */
    schema: Record<string, TableSchema>;
}

export interface TableSchema {
    table: string;
    exists: boolean;
    entitySetName?: string;
    ownership?: string;
    columns: string[];
    missingRequired: string[];
    missingOptional: string[];
    error?: string;
}

export interface AnalysisInput {
    table: string;
    recordId: string;
    column?: string;
    from: Date;
    to: Date;
}

// ---------------------------------------------------------------------------------------------
// History (timeline)
// ---------------------------------------------------------------------------------------------

export interface RecordRef {
    table: string;
    id: string;
}

export const recordKey = (r: RecordRef) => `${r.table}:${r.id}`;

export type ActorKind = "user" | "app" | "plugin" | "flow" | "workflow" | "system";

export interface Actor {
    /** Stable lane key, e.g. "user:<guid>", "plugin:Contoso.AddressSync", "flow:<guid>" */
    key: string;
    kind: ActorKind;
    name: string;
}

export type EventSource = "audit" | "trace" | "async" | "flowrun";
export type EventStatus = "success" | "failed" | "waiting" | "inprogress" | "suspended" | "canceled" | "unknown";

export interface ValueChange {
    column: string;
    oldValue?: string;
    newValue?: string;
}

export interface TimelineEvent {
    id: string;
    source: EventSource;
    /** ISO UTC */
    time: string;
    endTime?: string;
    actor: Actor;
    /** Display text, e.g. "Update", "Plugin Contoso.AddressSync", "Flow run" */
    operation: string;
    /** Dataverse message used for matching against wiring (Create, Update, Delete, …) */
    messageName?: string;
    /** The record the event is about, when known exactly. */
    record?: RecordRef;
    /** Table the event ran against (trace logs know the table, not the record). */
    table: string;
    depth?: number;
    correlationId?: string;
    transactionId?: string;
    status: EventStatus;
    changes?: ValueChange[];
    changedColumns?: string[];
    error?: string;
    /** Wiring handler id when known exactly (step:<id>, wf:<id>). */
    handlerId?: string;
    /** Name used to match a handler when the id isn't known (plugin type name, job name). */
    handlerName?: string;
    userId?: string;
    callingUserId?: string;
    /** Free text searched for record IDs (trace message block, flow run payload). */
    searchText?: string;
    details: Array<[string, string]>;
    warnings: string[];
}

export interface EventLink {
    /** Cause */
    from: string;
    /** Effect */
    to: string;
    kind: "exact" | "stitched";
    confidence: Confidence;
    reason: string;
}

export interface ScopeRecord {
    ref: RecordRef;
    name?: string;
    hop: number;
    /** How this record was pulled into the analysis. */
    via?: string;
    viaConfidence?: Confidence;
    parentKey?: string;
}

export interface Timeline {
    events: TimelineEvent[];
    links: EventLink[];
    /** child event id → parent event id (strongest cause link) */
    parentOf: Record<string, string>;
    records: ScopeRecord[];
    warnings: string[];
    /** Executions in the window that couldn't be tied to these records (not shown; used to avoid false "didn't run"). */
    unlinked?: TimelineEvent[];
}

// ---------------------------------------------------------------------------------------------
// Wiring (impact map)
// ---------------------------------------------------------------------------------------------

export type HandlerKind = "plugin" | "workflow" | "realtime-workflow" | "businessrule" | "flow";

export interface HandlerWrite {
    table: string;
    columns?: string[];
    operation: string;
    kind: "declared" | "inferred";
    reason?: string;
}

export interface WiringHandler {
    /** "step:<guid>" or "wf:<guid>" */
    id: string;
    rawId: string;
    kind: HandlerKind;
    name: string;
    table: string;
    messages: string[];
    /** 10 pre-validation, 20 pre-operation, 40 post-operation (plugins only) */
    stage?: number;
    mode: "sync" | "async";
    rank?: number;
    enabled: boolean;
    state: string;
    /** undefined = fires for any column */
    filteringColumns?: string[];
    triggerConditions: string[];
    writes: HandlerWrite[];
    typeName?: string;
    /** Plugins: the class (plugin type) and the assembly that contains it. */
    pluginTypeId?: string;
    assembly?: { id?: string; name: string; version?: string; isolation?: string; modifiedOn?: string; modifiedByName?: string };
    runAsUserId?: string;
    ownerId?: string;
    ownerName?: string;
    modifiedOn?: string;
    modifiedByName?: string;
    /** For classic workflows: the activation record id that system jobs point at. */
    activationId?: string;
    images: Array<{ type: string; alias?: string; columns?: string[] }>;
    asyncAutoDelete?: boolean;
    system?: boolean;
    warnings: string[];
}

export interface WiringEdge {
    id: string;
    /** "table:<name>" or a handler id */
    from: string;
    to: string;
    kind: "trigger" | "declared" | "inferred";
    label: string;
}

/** Relationship cascade behaviour between two tables (parent → child), non-"NoCascade" entries only. */
export interface CascadeRule {
    parent: string;
    child: string;
    lookup: string;
    relationship: string;
    /** e.g. { Assign: "Cascade", Delete: "RemoveLink" } */
    behaviours: Record<string, string>;
}

/** Columns whose values are computed by the platform rather than written (so audit doesn't see them change). */
export interface ComputedColumn {
    table: string;
    column: string;
    kind: "calculated" | "rollup" | "formula";
}

export interface WiringGraph {
    tables: string[];
    handlers: WiringHandler[];
    edges: WiringEdge[];
    cascades?: CascadeRule[];
    computed?: ComputedColumn[];
    /** Each cycle is a list of node ids (tables and handlers), enabled handlers only. */
    cycles: string[][];
    warnings: string[];
}

export const tableNode = (table: string) => `table:${table}`;

// ---------------------------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------------------------

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export const SEVERITY_RANK: Record<Severity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

export type RuleId =
    | "overwrite"
    | "expected-missing"
    | "failure"
    | "loop"
    | "duplicate"
    | "stuck-async"
    | "config-change"
    | "performance"
    | "ownership"
    | "race"
    | "computed";

export interface Evidence {
    kind: "event" | "handler" | "record";
    id: string;
    label: string;
}

export interface Finding {
    kind: "finding";
    id: string;
    rule: RuleId;
    severity: Severity;
    title: string;
    explanation: string;
    evidence: Evidence[];
    confidence: Confidence;
}

export interface UnavailableFinding {
    kind: "unavailable";
    id: string;
    rule: RuleId;
    title: string;
    reason: string;
}

export type RuleOutput = Finding | UnavailableFinding;

/** Current child records under a parent, used for duplicate detection. */
export interface ChildSet {
    parent: RecordRef;
    table: string;
    lookup: string;
    relationship: string;
    /** Choice / yes-no columns on the child table (candidate discriminators). */
    choiceColumns: string[];
    records: Array<{ id: string; name?: string; createdOn?: string; modifiedOn?: string; values: Record<string, { raw: unknown; label: string }> }>;
}

export interface AnalysisSettings {
    stuckAsyncMinutes: number;
    overwriteWindowHours: number;
    maxHops: number;
    maxRecords: number;
    flowTriggerWindowMinutes: number;
    loopDepthThreshold: number;
    /** Two different writers within this many seconds count as a race. */
    raceWindowSeconds: number;
    /** Synchronous plugins slower than this are flagged. */
    slowPluginSeconds: number;
    includeSystemSteps: boolean;
    /** Column that tells child records apart (e.g. address type). Empty = heuristic. */
    duplicateDiscriminator: string;
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
    stuckAsyncMinutes: 30,
    overwriteWindowHours: 24,
    maxHops: 3,
    maxRecords: 20,
    flowTriggerWindowMinutes: 15,
    loopDepthThreshold: 4,
    raceWindowSeconds: 5,
    slowPluginSeconds: 10,
    includeSystemSteps: false,
    duplicateDiscriminator: "",
};
