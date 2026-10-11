/**
 * Orchestrates one analysis: hop expansion (≤ maxHops), readers, correlation, graph, rules.
 * Emits partial results after every hop so the UI never waits for a full scan.
 */
import type { TableInfo } from "../data/catalog";
import { getEnvironmentId, readFlowRunsFromApi } from "../data/flowApi";
import {
    mapAsyncRow,
    mapAuditRow,
    mapFlowRunRow,
    mapTraceRow,
    readAsyncByCorrelation,
    readAsyncForRecords,
    readAudit,
    readAuditByTransaction,
    readChangeHistory,
    readFlowRuns,
    readTraceByCorrelation,
    readTraceForTables,
    type ReadResult,
} from "../data/history";
import { managedBool } from "../data/targetAudit";
import { loadUsers, type UserIndex } from "../data/users";
import { loadClassicWorkflows, loadCloudFlows, loadPluginSteps } from "../data/wiring";
import { buildFetchXml } from "../data/fetchXml";
import { classifyError } from "../host/errors";
import type { ReadOnlyDataverse } from "../host/readOnlyDataverse";
import type { ReadOnlyPowerAutomate } from "../host/readOnlyPowerPlatform";
import {
    recordKey,
    type AnalysisInput,
    type AnalysisSettings,
    type CascadeRule,
    type ComputedColumn,
    type ChildSet,
    type Confidence,
    type PreflightReport,
    type RecordRef,
    type RuleOutput,
    type ScopeRecord,
    type Timeline,
    type TimelineEvent,
    type ValueChange,
    type WiringGraph,
    type WiringHandler,
} from "../model/types";
import { formatted, guidLower, lookupId, lookupTable, str } from "../parse/values";
import { runRules } from "../rules";
import { correlate } from "./correlate";
import { buildGraph, type InferredWrite } from "./graph";

type Row = Record<string, unknown>;

export interface AnalysisDeps {
    dv: ReadOnlyDataverse;
    pa?: ReadOnlyPowerAutomate;
    tables: TableInfo[];
    now?: () => Date;
}

export interface AnalysisResult {
    input: AnalysisInput;
    timeline: Timeline;
    wiring: WiringGraph;
    findings: RuleOutput[];
    children: ChildSet[];
    steps: string[];
    done: boolean;
    cancelled?: boolean;
    error?: string;
    /** Current values of the target record. */
    snapshot?: Row;
}

interface Relationship {
    schemaName: string;
    otherTable: string;
    lookup: string;
    cascade?: Record<string, string>;
}

interface TableMeta {
    table: string;
    primaryId: string;
    primaryName?: string;
    columnNumbers: Map<number, string>;
    columns: Set<string>;
    choiceColumns: string[];
    computed: ComputedColumn[];
    oneToMany: Relationship[];
    manyToOne: Relationship[];
}

const MAX_NEIGHBOURS_PER_RECORD = 8;
const MAX_FLOW_API_CALLS = 20;

export async function runAnalysis(
    deps: AnalysisDeps,
    input: AnalysisInput,
    report: PreflightReport,
    settings: AnalysisSettings,
    onUpdate: (result: AnalysisResult) => void,
    signal?: AbortSignal,
): Promise<AnalysisResult> {
    const { dv } = deps;
    const S = report.sources;
    const schema = report.schema;
    const now = deps.now ?? (() => new Date());
    const window = { from: input.from, to: input.to };
    const steps: string[] = [];
    const warnings: string[] = [];
    const childWarnings: string[] = [];

    const typeCodes = new Map(deps.tables.filter((t) => typeof t.objectTypeCode === "number").map((t) => [t.logicalName, t.objectTypeCode!]));
    const entitySetToTable = new Map(deps.tables.filter((t) => t.entitySetName).map((t) => [t.entitySetName!.toLowerCase(), t.logicalName]));
    const users: UserIndex = new Map();
    const handlers = new Map<string, WiringHandler>();
    const scope = new Map<string, ScopeRecord>();
    const meta = new Map<string, Promise<TableMeta>>();
    const auditRows = new Map<string, Row[]>();
    const changeMaps = new Map<string, Map<string, ValueChange[]>>();
    const asyncRows = new Map<string, Row>();
    const traceRows = new Map<string, Row>();
    const flowEvents = new Map<string, TimelineEvent>();
    const snapshots = new Map<string, Row>();
    const children: ChildSet[] = [];
    const loadedWiringTables = new Set<string>();
    const loadedTraceTables = new Set<string>();
    const loadedFlowRuns = new Set<string>();
    const queriedCorrelations = new Set<string>();
    const allFlows: WiringHandler[] = [];
    let environmentId: string | undefined | null = null;
    let flowApiCalls = 0;
    let last: AnalysisResult | undefined;

    const target: RecordRef = { table: input.table, id: input.recordId.toLowerCase() };
    scope.set(recordKey(target), { ref: target, hop: 0, via: "the record you picked" });

    const progress = (message: string) => {
        steps.push(message);
        if (last) onUpdate({ ...last, steps: [...steps] });
    };
    const note = (result: ReadResult, what: string) => {
        if (result.error) warnings.push(`${what} couldn't be read: ${result.error}`);
        if (result.truncated) warnings.push(`${what}: there were more rows than the tool reads in one go; narrow the time window to see everything.`);
    };

    // ---------------------------------------------------------------------------------------
    const getMeta = (table: string): Promise<TableMeta> => {
        let pending = meta.get(table);
        if (!pending) {
            pending = (async () => {
                const m: TableMeta = { table, primaryId: `${table}id`, columnNumbers: new Map(), columns: new Set(), choiceColumns: [], computed: [], oneToMany: [], manyToOne: [] };
                try {
                    const em = await dv.entityMetadata(table, ["LogicalName", "PrimaryIdAttribute", "PrimaryNameAttribute", "IsAuditEnabled"]);
                    m.primaryId = String(em.PrimaryIdAttribute ?? m.primaryId);
                    if (S["history.audit"].available && managedBool(em.IsAuditEnabled) === false) {
                        warnings.push(`Auditing is off for ${table}, so changes to ${table} records (who changed what) can't be shown or checked for overwrites.`);
                    }
                    m.primaryName = str(em.PrimaryNameAttribute);
                    const attrs = await dv.entityAttributes(table, ["LogicalName", "ColumnNumber", "AttributeType", "AttributeOf"]);
                    for (const a of attrs) {
                        const name = String(a.LogicalName);
                        m.columns.add(name);
                        if (typeof a.ColumnNumber === "number") m.columnNumbers.set(a.ColumnNumber, name);
                        if (!a.AttributeOf && (a.AttributeType === "Picklist" || a.AttributeType === "Boolean")) m.choiceColumns.push(name);
                    }
                } catch (error) {
                    warnings.push(`Metadata for ${table} couldn't be read: ${classifyError(error).message}`);
                }
                // Separate call: if SourceType can't be selected, the rest of the metadata still works.
                try {
                    const sources = await dv.entityAttributes(table, ["LogicalName", "SourceType"]);
                    for (const a of sources) {
                        const st = typeof a.SourceType === "number" ? a.SourceType : 0;
                        if (st > 0) m.computed.push({ table, column: String(a.LogicalName), kind: st === 1 ? "calculated" : st === 2 ? "rollup" : "formula" });
                    }
                } catch {
                    // Computed-column detection is a nice-to-have.
                }
                try {
                    const [o2m, m2o] = await Promise.all([
                        dv.entityRelationships(table, "OneToManyRelationships", ["SchemaName", "ReferencingEntity", "ReferencingAttribute", "CascadeConfiguration"]),
                        dv.entityRelationships(table, "ManyToOneRelationships", ["SchemaName", "ReferencedEntity", "ReferencingAttribute"]),
                    ]);
                    m.oneToMany = o2m.map((r) => ({ schemaName: String(r.SchemaName), otherTable: String(r.ReferencingEntity), lookup: String(r.ReferencingAttribute), cascade: activeCascades(r.CascadeConfiguration) }));
                    m.manyToOne = m2o.map((r) => ({ schemaName: String(r.SchemaName), otherTable: String(r.ReferencedEntity), lookup: String(r.ReferencingAttribute) }));
                } catch (error) {
                    childWarnings.push(`relationships of ${table} couldn't be read (${classifyError(error).message})`);
                }
                return m;
            })();
            meta.set(table, pending);
        }
        return pending;
    };

    // ---------------------------------------------------------------------------------------
    const relevantFlows = (tables: Set<string>) => allFlows.filter((f) => tables.has(f.table) || f.writes.some((w) => tables.has(w.table)));

    const loadWiring = async (tables: string[]) => {
        const fresh = tables.filter((t) => !loadedWiringTables.has(t));
        if (!fresh.length) return;
        fresh.forEach((t) => loadedWiringTables.add(t));
        if (S["wiring.plugins"].available) {
            try {
                const r = await loadPluginSteps(dv, schema, fresh, typeCodes);
                r.handlers.forEach((h) => handlers.set(h.id, h));
                warnings.push(...r.warnings);
            } catch (error) {
                warnings.push(`Plugin steps couldn't be read: ${classifyError(error).message}`);
            }
        }
        if (S["wiring.workflows"].available) {
            try {
                const r = await loadClassicWorkflows(dv, schema.workflow, fresh, typeCodes);
                r.handlers.forEach((h) => handlers.set(h.id, h));
            } catch (error) {
                warnings.push(`Workflows couldn't be read: ${classifyError(error).message}`);
            }
            try {
                const r = await loadCloudFlows(dv, schema.workflow, entitySetToTable, fresh);
                const known = new Set(allFlows.map((f) => f.id));
                allFlows.push(...r.handlers.filter((f) => !known.has(f.id)));
                warnings.push(...r.warnings);
            } catch (error) {
                warnings.push(`Cloud flows couldn't be read: ${classifyError(error).message}`);
            }
        }
        relevantFlows(new Set(loadedWiringTables)).forEach((f) => handlers.set(f.id, f));
    };

    const activationToDefinition = () => {
        const map = new Map<string, string>();
        for (const h of handlers.values()) if (h.activationId) map.set(h.activationId, h.rawId);
        return map;
    };

    // ---------------------------------------------------------------------------------------
    const buildTimeline = () => {
        const events: TimelineEvent[] = [];
        for (const [key, rows] of auditRows) {
            const table = key.split(":")[0];
            for (const row of rows) {
                events.push(mapAuditRow(row, { table, users, columnNumbers: metaSync.get(table)?.columnNumbers ?? new Map(), changes: changeMaps.get(key) }));
            }
        }
        const activations = activationToDefinition();
        for (const row of asyncRows.values()) events.push(mapAsyncRow(row, { activationToDefinition: activations }));
        for (const row of traceRows.values()) events.push(mapTraceRow(row));
        events.push(...flowEvents.values());
        const unique = [...new Map(events.map((e) => [e.id, e])).values()];
        const scopeIds = new Set([...scope.values()].map((r) => r.ref.id));
        const c = correlate({ events: unique, handlers, scopeIds, settings, cascades: cascadesInScope() });
        const keptIds = new Set(c.kept.map((e) => e.id));
        const timelineWarnings = [...warnings];
        if (c.hidden.trace) timelineWarnings.push(`${c.hidden.trace} plugin trace row(s) in this window couldn't be tied to these records and are hidden.`);
        if (c.hidden.flowrun) timelineWarnings.push(`${c.hidden.flowrun} flow run(s) in this window couldn't be tied to these records and are hidden.`);
        const timeline: Timeline = {
            events: c.kept.sort((a, b) => a.time.localeCompare(b.time)),
            links: c.links,
            parentOf: c.parentOf,
            records: [...scope.values()],
            warnings: [...new Set(timelineWarnings)],
            unlinked: unique.filter((e) => !keptIds.has(e.id) && e.source !== "audit"),
        };
        return { timeline, inferred: c.inferredWrites };
    };

    // Synchronous view of resolved metadata for mapping.
    const metaSync = new Map<string, TableMeta>();
    const resolveMeta = async (table: string) => {
        const m = await getMeta(table);
        metaSync.set(table, m);
        return m;
    };

    const graphOf = (inferred: InferredWrite[]): WiringGraph => {
        const scopeTables = [...new Set([...scope.values()].map((r) => r.ref.table))];
        const list = [...handlers.values()].filter((h) => (settings.includeSystemSteps || !h.system) && (scopeTables.includes(h.table) || h.writes.some((w) => scopeTables.includes(w.table))));
        const graph = buildGraph(list, inferred, scopeTables);
        graph.warnings = [...new Set(list.flatMap((h) => h.warnings.map((w) => `${h.name}: ${w}`)))];
        graph.cascades = cascadesInScope();
        graph.computed = scopeTables.flatMap((t) => metaSync.get(t)?.computed ?? []);
        return graph;
    };

    const emit = (done: boolean, extra: Partial<AnalysisResult> = {}): AnalysisResult => {
        const { timeline, inferred } = buildTimeline();
        const wiring = graphOf(inferred);
        const findings = done
            ? runRules({ input, timeline, wiring, sources: S, settings, now: now(), children, childWarnings })
            : [];
        last = { input, timeline, wiring, findings, children, steps: [...steps], done, snapshot: snapshots.get(recordKey(target)), ...extra };
        onUpdate(last);
        return last;
    };

    // ---------------------------------------------------------------------------------------
    try {
        emit(false);

        let frontier: ScopeRecord[] = [scope.get(recordKey(target))!];
        for (let hop = 0; hop <= settings.maxHops && frontier.length; hop++) {
            if (signal?.aborted) return emit(true, { cancelled: true });
            const tables = [...new Set(frontier.map((r) => r.ref.table))];
            progress(hop === 0 ? `Reading ${input.table} history…` : `Hop ${hop}: reading ${frontier.length} related record(s) (${tables.join(", ")})…`);

            await Promise.all(tables.map(resolveMeta));
            await loadWiring(tables);

            // Per record: current values + audit.
            for (const rec of frontier) {
                if (signal?.aborted) break;
                const m = metaSync.get(rec.ref.table)!;
                try {
                    const snap = await dv.retrieve(rec.ref.table, rec.ref.id);
                    snapshots.set(recordKey(rec.ref), snap);
                    if (m.primaryName && str(snap[m.primaryName])) rec.name = str(snap[m.primaryName]);
                } catch (error) {
                    const e = classifyError(error);
                    warnings.push(e.kind === "notFound" ? `${rec.ref.table} ${rec.ref.id} doesn't exist any more (deleted?). Its history is still shown if audited.` : `${rec.ref.table} ${rec.ref.id} couldn't be read: ${e.message}`);
                }
                if (S["history.audit"].available) {
                    const r = await readAudit(dv, schema.audit, rec.ref, window);
                    note(r, `Audit history of ${rec.ref.table}`);
                    auditRows.set(recordKey(rec.ref), r.rows);
                    if (r.rows.length) {
                        const ch = await readChangeHistory(dv, rec.ref, input.from, m.primaryId);
                        changeMaps.set(recordKey(rec.ref), ch.byAuditId);
                        if (ch.warning) warnings.push(ch.warning);
                    }
                }
            }

            if (S["history.async"].available) {
                const r = await readAsyncForRecords(dv, schema.asyncoperation, frontier.map((f) => f.ref.id), window);
                note(r, "System jobs");
                r.rows.forEach((row) => asyncRows.set(String(row.asyncoperationid).toLowerCase(), row));
            }

            if (S["history.trace"].available) {
                const fresh = tables.filter((t) => !loadedTraceTables.has(t));
                fresh.forEach((t) => loadedTraceTables.add(t));
                if (fresh.length) {
                    const r = await readTraceForTables(dv, schema.plugintracelog, fresh, window);
                    note(r, `Plugin trace logs for ${fresh.join(", ")}`);
                    r.rows.forEach((row) => traceRows.set(String(row.plugintracelogid).toLowerCase(), row));
                }
            }

            await readFlowRunsFor(new Set([...scope.values()].map((r) => r.ref.table)));

            // Follow the request chains we found: everything else that ran under the same correlation IDs.
            const { timeline: partial } = buildTimeline();
            const correlations = [...new Set(partial.events.map((e) => e.correlationId).filter((c): c is string => !!c && !queriedCorrelations.has(c)))];
            if (correlations.length) {
                correlations.forEach((c) => queriedCorrelations.add(c));
                if (S["history.trace"].available) {
                    const r = await readTraceByCorrelation(dv, schema.plugintracelog, correlations);
                    note(r, "Plugin trace logs (same requests)");
                    r.rows.forEach((row) => traceRows.set(String(row.plugintracelogid).toLowerCase(), row));
                }
                if (S["history.async"].available) {
                    const r = await readAsyncByCorrelation(dv, schema.asyncoperation, correlations);
                    note(r, "System jobs (same requests)");
                    r.rows.forEach((row) => asyncRows.set(String(row.asyncoperationid).toLowerCase(), row));
                }
            }

            await loadUsers(dv, schema.systemuser, collectUserIds(), users);
            const snapshot = emit(false);
            if (hop === settings.maxHops) break;

            progress(`Looking for related records (hop ${hop + 1} of ${settings.maxHops})…`);
            frontier = await discoverNeighbours(frontier, hop + 1, snapshot.timeline);
        }

        progress("Checking findings…");
        return emit(true);
    } catch (error) {
        return emit(true, { error: classifyError(error).message });
    }

    // =======================================================================================

    /** Cascade rules between tables that are both part of this analysis. */
    function cascadesInScope(): CascadeRule[] {
        const tables = new Set([...scope.values()].map((r) => r.ref.table));
        const out: CascadeRule[] = [];
        for (const t of tables) {
            for (const rel of metaSync.get(t)?.oneToMany ?? []) {
                if (tables.has(rel.otherTable) && rel.cascade && Object.keys(rel.cascade).length) {
                    out.push({ parent: t, child: rel.otherTable, lookup: rel.lookup, relationship: rel.schemaName, behaviours: rel.cascade });
                }
            }
        }
        return out;
    }

    async function readFlowRunsFor(tables: Set<string>) {
        const flows = relevantFlows(tables).filter((f) => f.table !== "none" && tables.has(f.table) && !loadedFlowRuns.has(f.id));
        if (!flows.length) return;
        flows.forEach((f) => {
            loadedFlowRuns.add(f.id);
            handlers.set(f.id, f);
        });
        if (S["history.flowrun"].available) {
            const r = await readFlowRuns(dv, schema.flowrun, flows.map((f) => f.rawId), window);
            note(r, "Cloud flow runs");
            for (const row of r.rows) {
                const e = mapFlowRunRow(row, handlers);
                if (e) flowEvents.set(e.id, e);
            }
        }
        if (S["history.flowrunApi"].available && deps.pa) {
            if (environmentId === null) environmentId = await getEnvironmentId(dv);
            if (!environmentId) {
                warnings.push("The environment ID couldn't be read, so the Power Automate API wasn't used.");
                return;
            }
            for (const flow of flows) {
                if (flowApiCalls++ >= MAX_FLOW_API_CALLS) {
                    warnings.push(`Only the first ${MAX_FLOW_API_CALLS} flows were checked through the Power Automate API.`);
                    break;
                }
                const r = await readFlowRunsFromApi(deps.pa, environmentId, flow, window.from, window.to);
                if (r.warning) warnings.push(r.warning);
                for (const e of r.events) mergeFlowRun(e);
            }
        }
    }

    /** The same run can come from Dataverse and the API: keep one, but keep the API payload for exact linking. */
    function mergeFlowRun(e: TimelineEvent) {
        const twin = [...flowEvents.values()].find((x) => x.handlerId === e.handlerId && Math.abs(new Date(x.time).getTime() - new Date(e.time).getTime()) < 1500);
        if (twin) twin.searchText = `${twin.searchText ?? ""}\n${e.searchText ?? ""}`;
        else flowEvents.set(e.id, e);
    }

    function collectUserIds(): string[] {
        const ids: string[] = [];
        for (const rows of auditRows.values()) for (const r of rows) ids.push(...[lookupId(r, "userid"), lookupId(r, "callinguserid")].filter((x): x is string => !!x));
        for (const r of asyncRows.values()) {
            const owner = lookupId(r, "ownerid");
            if (owner) ids.push(owner);
        }
        for (const h of handlers.values()) ids.push(...[h.ownerId, h.runAsUserId].filter((x): x is string => !!x));
        return ids;
    }

    /** Tables connected to `table` by automation (either direction) or by requests seen in history. */
    function neighbourTables(table: string, timeline: Timeline): Set<string> {
        const out = new Set<string>();
        for (const h of [...handlers.values(), ...allFlows]) {
            if (h.table === table) h.writes.forEach((w) => out.add(w.table));
            if (h.writes.some((w) => w.table === table) && h.table !== "none") out.add(h.table);
        }
        const correlations = new Set(timeline.events.filter((e) => e.table === table && e.correlationId).map((e) => e.correlationId!));
        for (const e of timeline.events) if (e.correlationId && correlations.has(e.correlationId) && e.table !== "none") out.add(e.table);
        out.delete(table);
        return out;
    }

    async function discoverNeighbours(frontier: ScopeRecord[], hop: number, timeline: Timeline): Promise<ScopeRecord[]> {
        const next: ScopeRecord[] = [];
        const budgetLeft = () => settings.maxRecords - scope.size;
        const addCandidate = (ref: RecordRef, via: string, viaConfidence: Confidence, parentKey: string, perRecord: Map<string, number>) => {
            const key = recordKey(ref);
            if (scope.has(key) || budgetLeft() <= 0) return;
            const used = perRecord.get(parentKey) ?? 0;
            if (used >= MAX_NEIGHBOURS_PER_RECORD) return;
            perRecord.set(parentKey, used + 1);
            const rec: ScopeRecord = { ref, hop, via, viaConfidence, parentKey };
            scope.set(key, rec);
            next.push(rec);
        };
        const perRecord = new Map<string, number>();
        const frontierKeys = new Set(frontier.map((f) => recordKey(f.ref)));

        // a) System jobs in the same requests, about other records (exact).
        const frontierCorrelations = new Set(
            timeline.events.filter((e) => e.correlationId && (frontierKeys.has(e.record ? recordKey(e.record) : "") || e.source === "trace")).map((e) => e.correlationId!),
        );
        for (const row of asyncRows.values()) {
            const cid = guidLower(row.correlationid);
            const id = lookupId(row, "regardingobjectid");
            const table = lookupTable(row, "regardingobjectid");
            if (!cid || !id || !table || !frontierCorrelations.has(cid)) continue;
            const source = frontier.find((f) => timeline.events.some((e) => e.correlationId === cid && e.record?.id === f.ref.id)) ?? frontier[0];
            addCandidate({ table, id }, "a system job in the same request ran for it", "high", recordKey(source.ref), perRecord);
        }

        // b) Changed in the same database transaction (exact).
        if (S["history.audit"].available && schema.audit?.columns.includes("transactionid")) {
            const txToRecord = new Map<string, string>();
            for (const f of frontier) for (const r of auditRows.get(recordKey(f.ref)) ?? []) if (guidLower(r.transactionid)) txToRecord.set(guidLower(r.transactionid)!, recordKey(f.ref));
            const r = await readAuditByTransaction(dv, schema.audit, [...txToRecord.keys()]);
            note(r, "Audit rows in the same transactions");
            for (const row of r.rows) {
                const id = lookupId(row, "objectid");
                const table = str(row.objecttypecode)?.toLowerCase();
                if (id && table) addCandidate({ table, id }, "changed in the same database transaction", "high", txToRecord.get(guidLower(row.transactionid)!) ?? recordKey(frontier[0].ref), perRecord);
            }
        }

        // c) Relationships to tables that automation connects.
        for (const f of frontier) {
            if (budgetLeft() <= 0) break;
            const m = metaSync.get(f.ref.table) ?? (await resolveMeta(f.ref.table));
            const neighbours = neighbourTables(f.ref.table, timeline);
            const key = recordKey(f.ref);

            for (const rel of m.oneToMany.filter((r) => neighbours.has(r.otherTable))) {
                const set = await readChildren(f.ref, rel);
                if (!set) continue;
                children.push(set);
                for (const child of set.records) {
                    const modified = child.modifiedOn ?? child.createdOn;
                    if (modified && new Date(modified) >= input.from) addCandidate({ table: rel.otherTable, id: child.id }, `related through ${rel.lookup} and changed in this window`, "medium", key, perRecord);
                }
            }
            const snap = snapshots.get(key);
            for (const rel of m.manyToOne.filter((r) => neighbours.has(r.otherTable))) {
                const parentId = snap ? lookupId(snap, rel.lookup) : undefined;
                if (parentId) addCandidate({ table: rel.otherTable, id: parentId }, `its ${rel.lookup} (automation connects the two tables)`, "medium", key, perRecord);
            }
        }
        return next;
    }

    async function readChildren(parent: RecordRef, rel: Relationship): Promise<ChildSet | undefined> {
        try {
            const m = await resolveMeta(rel.otherTable);
            const conditions = [{ attribute: rel.lookup, operator: "eq" as const, value: parent.id }];
            if (m.columns.has("statecode")) conditions.push({ attribute: "statecode", operator: "eq" as const, value: 0 as never });
            const attributes = [m.primaryId, ...(m.primaryName ? [m.primaryName] : []), "createdon", "modifiedon", ...m.choiceColumns].filter((c, i, a) => m.columns.has(c) && a.indexOf(c) === i);
            const result = await dv.fetchXml(buildFetchXml({ entity: rel.otherTable, attributes, conditions, top: 50 }));
            return {
                parent,
                table: rel.otherTable,
                lookup: rel.lookup,
                relationship: rel.schemaName,
                choiceColumns: m.choiceColumns,
                records: (result.value ?? []).map((row) => ({
                    id: String(row[m.primaryId]).toLowerCase(),
                    name: m.primaryName ? str(row[m.primaryName]) : undefined,
                    createdOn: str(row.createdon),
                    modifiedOn: str(row.modifiedon),
                    values: Object.fromEntries(m.choiceColumns.filter((c) => c in row).map((c) => [c, { raw: row[c], label: formatted(row, c) ?? String(row[c]) }])),
                })),
            };
        } catch (error) {
            childWarnings.push(`${rel.otherTable} records under ${parent.table} couldn't be read (${classifyError(error).message})`);
            return undefined;
        }
    }
}

/** CascadeConfiguration → only the behaviours that actually cascade (not NoCascade / RemoveLink / Restrict). */
export function activeCascades(config: unknown): Record<string, string> | undefined {
    if (!config || typeof config !== "object") return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
        if (k.startsWith("@") || typeof v !== "string") continue;
        if (["Cascade", "Active", "UserOwned"].includes(v)) out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
}
