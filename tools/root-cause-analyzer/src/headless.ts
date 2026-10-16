/// <reference types="@pptb/types" />

import { loadTables, type TableInfo } from "./data/catalog";
import { evaluatePreflight, gatherPreflightFacts, type ConnectionFacts } from "./data/preflight";
import { evaluateTargetAudit, gatherTargetAudit, type TargetAuditFacts } from "./data/targetAudit";
import { runAnalysis, type AnalysisResult } from "./engine/analyze";
import { getDataverse, type ReadOnlyDataverse } from "./host/readOnlyDataverse";
import { getPowerAutomate, type ReadOnlyPowerAutomate } from "./host/readOnlyPowerPlatform";
import { DEFAULT_SETTINGS } from "./model/types";

type PlainObject = Record<string, unknown>;

interface HeadlessLogger {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}

interface HeadlessContext {
    logger?: Partial<HeadlessLogger>;
    updateProgress?: (percent: number, message: string) => void;
    dataverse?: ReadOnlyDataverse;
    powerAutomate?: ReadOnlyPowerAutomate;
    connection?: ConnectionFacts;
    tableCatalog?: TableInfo[];
}

interface ParsedRecordRef {
    table?: string;
    entitySet?: string;
    objectTypeCode?: number;
    recordId?: string;
}

interface NormalizedAnalysisInput {
    recordUrl?: string;
    table: string;
    recordId: string;
    column?: string;
    from: string;
    to: string;
    parseWarning?: string;
}

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function decodeSafe(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function normalizeGuid(value: unknown): string {
    const match = GUID.exec(decodeSafe(asString(value)));
    return match ? match[0].toLowerCase() : "";
}

function isoOrEmpty(value: unknown): string {
    const parsed = value ? new Date(asString(value)) : undefined;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "";
}

function parseRecordUrl(input: unknown): { ok: true; value: ParsedRecordRef } | { ok: false; error: string } {
    const text = asString(input);
    if (!text) return { ok: false, error: "Paste a record URL or ID." };

    const bare = text.replace(/^[{(]|[})]$/g, "");
    if (/^[0-9a-f-]{36}$/i.test(bare)) {
        const id = normalizeGuid(bare);
        return id ? { ok: true, value: { recordId: id } } : { ok: false, error: "That doesn't look like a valid record ID." };
    }

    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return { ok: false, error: "That isn't a valid URL or record ID." };
    }

    const value: ParsedRecordRef = {};
    const webApi = /\/api\/data\/v[\d.]+\/([A-Za-z0-9_]+)\(([^)]+)\)/.exec(decodeSafe(url.pathname));
    if (webApi) {
        value.entitySet = webApi[1];
        value.recordId = normalizeGuid(webApi[2]);
    } else {
        const params = new URLSearchParams(url.search);
        const hash = url.hash.replace(/^#/, "");
        if (hash.includes("=")) new URLSearchParams(hash).forEach((v, k) => (params.has(k) ? null : params.set(k, v)));
        const etn = params.get("etn");
        const etc = params.get("etc");
        const id = params.get("id");
        if (etn) value.table = etn.toLowerCase();
        if (etc && /^\d+$/.test(etc)) value.objectTypeCode = Number(etc);
        if (id) value.recordId = normalizeGuid(id);
    }

    if (!value.recordId) return { ok: false, error: "Couldn't find a record ID in that URL. Open the record and copy its URL from the address bar." };
    return { ok: true, value };
}

function inferTableFromRef(ref: ParsedRecordRef): string {
    if (ref.table) return asString(ref.table).toLowerCase();
    const entitySet = ref.entitySet ? asString(ref.entitySet).toLowerCase() : "";
    if (!entitySet) return "";
    if (entitySet.endsWith("ies")) return `${entitySet.slice(0, -3)}y`;
    if (entitySet.endsWith("ses")) return entitySet.slice(0, -2);
    if (entitySet.endsWith("s")) return entitySet.slice(0, -1);
    return entitySet;
}

function resolveAnalysisInput(input: PlainObject): { ok: true; value: NormalizedAnalysisInput } | { ok: false; error: string } {
    const recordUrl = asString(input.recordUrl);
    const rawTable = asString(input.table).toLowerCase();
    const rawRecordId = normalizeGuid(input.recordId);
    const column = asString(input.column).toLowerCase();

    let inferredTable = rawTable;
    let inferredRecordId = rawRecordId;
    let parseWarning = "";

    if (recordUrl) {
        const parsed = parseRecordUrl(recordUrl);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        inferredRecordId = parsed.value.recordId || inferredRecordId;
        inferredTable = inferredTable || inferTableFromRef(parsed.value);
        if (!inferredTable && parsed.value.objectTypeCode !== undefined) {
            parseWarning = "The URL only provided object type code (etc). Table inference was not possible without metadata.";
        }
    }

    if (!inferredRecordId) return { ok: false, error: "A record URL or record ID is required." };
    if (!inferredTable) return { ok: false, error: "Couldn't infer table from record URL. Use a URL with etn=<table> (or provide table explicitly)." };

    const defaultTo = new Date();
    const defaultFrom = new Date(defaultTo.getTime() - 7 * 24 * 60 * 60 * 1000);
    const to = isoOrEmpty(input.to) || defaultTo.toISOString();
    const from = isoOrEmpty(input.from) || defaultFrom.toISOString();

    return {
        ok: true,
        value: {
            recordUrl: recordUrl || undefined,
            table: inferredTable,
            recordId: inferredRecordId,
            column: column || undefined,
            from,
            to,
            parseWarning: parseWarning || undefined,
        },
    };
}

function buildHeadlessDataCollectionPlan(): PlainObject {
    return {
        status: "ready-for-evidence-collection",
        mode: "analysis",
        requiresConnection: true,
        steps: [
            "Run preflight to validate tracing, auditing, and read access.",
            "Read audit history, plugin trace logs, system jobs, and flow runs for the requested window.",
            "Correlate timeline and wiring to produce confidence-scored findings.",
            "Return structured findings and evidence links.",
        ],
    };
}

function resolveDataverse(context?: HeadlessContext): ReadOnlyDataverse | undefined {
    if (context?.dataverse) return context.dataverse;
    try {
        return getDataverse();
    } catch {
        return undefined;
    }
}

function resolvePowerAutomate(context?: HeadlessContext): ReadOnlyPowerAutomate | undefined {
    if (context?.powerAutomate) return context.powerAutomate;
    try {
        return getPowerAutomate();
    } catch {
        return undefined;
    }
}

function resolveConnection(input: PlainObject, context?: HeadlessContext): ConnectionFacts | null {
    if (context?.connection) return context.connection;
    const c = input.connection;
    if (!c || typeof c !== "object") return null;
    const conn = c as PlainObject;
    const name = asString(conn.name);
    const url = asString(conn.url);
    if (!name || !url) return null;
    return {
        name,
        url,
        environment: asString(conn.environment) || undefined,
        enabledForPowerPlatformAPI: typeof conn.enabledForPowerPlatformAPI === "boolean" ? (conn.enabledForPowerPlatformAPI as boolean) : undefined,
    };
}

function timelineHighlightsFrom(result: AnalysisResult): Array<Record<string, unknown>> {
    return result.timeline.events.slice(0, 20).map((e) => ({
        id: e.id,
        time: e.time,
        source: e.source,
        status: e.status,
        table: e.table,
        operation: e.operation,
        actor: e.actor.name,
        confidence: result.timeline.links.find((l) => l.to === e.id)?.confidence,
    }));
}

function toSerializableFindings(result: AnalysisResult): Array<Record<string, unknown>> {
    return result.findings.map((f) => {
        if (f.kind === "finding") {
            return {
                kind: f.kind,
                id: f.id,
                rule: f.rule,
                severity: f.severity,
                title: f.title,
                explanation: f.explanation,
                confidence: f.confidence,
                evidence: f.evidence,
            };
        }
        return {
            kind: f.kind,
            id: f.id,
            rule: f.rule,
            title: f.title,
            reason: f.reason,
        };
    });
}

function summarizeAnalysis(result: AnalysisResult, targetAuditChecks: ReturnType<typeof evaluateTargetAudit>, targetAuditFacts?: TargetAuditFacts): Record<string, unknown> {
    return {
        status: result.error ? "error" : result.cancelled ? "cancelled" : "complete",
        error: result.error,
        steps: result.steps,
        done: result.done,
        timeline: {
            eventCount: result.timeline.events.length,
            recordCount: result.timeline.records.length,
            warningCount: result.timeline.warnings.length,
            linkCount: result.timeline.links.length,
        },
        wiring: {
            tableCount: result.wiring.tables.length,
            handlerCount: result.wiring.handlers.length,
            cycleCount: result.wiring.cycles.length,
            warningCount: result.wiring.warnings.length,
        },
        checks: {
            targetAudit: targetAuditChecks,
            targetAuditFacts,
        },
    };
}

export async function invokeHeadless(input: PlainObject, context?: HeadlessContext): Promise<PlainObject> {
    const logger = context?.logger ?? console;
    const updateProgress = typeof context?.updateProgress === "function" ? context.updateProgress : () => undefined;

    logger.info?.("Root Cause Analyzer headless analysis started");
    updateProgress(10, "validating input");

    const resolved = resolveAnalysisInput(input || {});
    if (!resolved.ok) {
        logger.warn?.(`Headless invocation rejected: ${resolved.error}`);
        throw new Error(resolved.error);
    }

    const normalizedInput = resolved.value;

    const dv = resolveDataverse(context);
    if (!dv) {
        updateProgress(100, "done");
        logger.warn?.("Headless runtime could not access Dataverse APIs; returning analysis-request payload only.");
        return {
            operation: "analysis-request",
            analysisInput: normalizedInput,
            dataCollection: buildHeadlessDataCollectionPlan(),
            analysis: {
                status: "pending-live-collection",
                message: "No Dataverse API surface was available in this headless invocation context.",
                input: normalizedInput,
            },
            findings: [],
            timelineHighlights: [],
            evidenceSummary: {
                suppliedFindingCount: 0,
                suppliedTimelineHighlightCount: 0,
            },
            generatedAt: new Date().toISOString(),
        };
    }

    updateProgress(20, "loading table metadata");
    const tables = context?.tableCatalog && context.tableCatalog.length ? context.tableCatalog : await loadTables(dv);

    updateProgress(35, "running preflight checks");
    const connection = resolveConnection(input, context);
    const preflightFacts = await gatherPreflightFacts(dv, connection);
    const report = evaluatePreflight(preflightFacts);

    let targetAuditFacts: TargetAuditFacts | undefined;
    let targetAuditChecks: ReturnType<typeof evaluateTargetAudit> = [];
    if (normalizedInput.column) {
        updateProgress(45, "checking target table/column auditing");
        targetAuditFacts = await gatherTargetAudit(dv, normalizedInput.table, normalizedInput.column);
        const orgAudit = report.checks.find((c) => c.id === "audit-org");
        const orgAuditEnabled = orgAudit?.status === "ok" ? true : orgAudit?.status === "error" ? false : undefined;
        targetAuditChecks = evaluateTargetAudit(targetAuditFacts, orgAuditEnabled);
    }

    const pa = resolvePowerAutomate(context);
    let latest: AnalysisResult | undefined;

    updateProgress(55, "collecting and correlating Dataverse evidence");
    const final = await runAnalysis(
        { dv, pa, tables },
        {
            table: normalizedInput.table,
            recordId: normalizedInput.recordId,
            column: normalizedInput.column,
            from: new Date(normalizedInput.from),
            to: new Date(normalizedInput.to),
        },
        report,
        DEFAULT_SETTINGS,
        (partial) => {
            latest = partial;
            const progressFromSteps = Math.min(85, 55 + Math.floor((partial.steps.length || 1) * 2));
            updateProgress(progressFromSteps, partial.steps[partial.steps.length - 1] ?? "analyzing");
        },
    );

    const settled = latest ?? final;
    const findings = toSerializableFindings(settled);
    const timelineHighlights = timelineHighlightsFrom(settled);
    const analysis = summarizeAnalysis(settled, targetAuditChecks, targetAuditFacts);

    updateProgress(95, "preparing response payload");

    if (normalizedInput.parseWarning) logger.warn?.(normalizedInput.parseWarning);

    updateProgress(100, "done");
    logger.info?.("Root Cause Analyzer headless analysis complete");

    return {
        operation: settled.error ? "analysis-error" : "analysis-complete",
        analysisInput: normalizedInput,
        dataCollection: buildHeadlessDataCollectionPlan(),
        analysis,
        findings,
        timelineHighlights,
        evidenceSummary: {
            findingCount: findings.filter((f) => f.kind === "finding").length,
            unavailableCount: findings.filter((f) => f.kind === "unavailable").length,
            timelineHighlightCount: timelineHighlights.length,
            warningCount: settled.timeline.warnings.length,
        },
        generatedAt: new Date().toISOString(),
    };
}
