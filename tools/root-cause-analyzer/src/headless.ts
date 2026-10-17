/// <reference types="@pptb/types" />

import { loadColumns, loadTables, resolveTable, type ColumnInfo, type TableInfo } from "./data/catalog";
import { evaluatePreflight, gatherPreflightFacts, type ConnectionFacts } from "./data/preflight";
import { evaluateTargetAudit, gatherTargetAudit, type TargetAuditFacts } from "./data/targetAudit";
import { runAnalysis, type AnalysisResult } from "./engine/analyze";
import { classifyError } from "./host/errors";
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
}

type PrefillField = "recordUrl" | "table" | "recordId" | "column" | "from" | "to";

export type ValidationCode = "invalid_input" | "invalid_type" | "invalid_format" | "required" | "conflict" | "invalid_range" | "not_found";

export interface ValidationIssue {
    field: PrefillField | "(input)";
    code: ValidationCode;
    message: string;
    received?: unknown;
    expected?: string;
    suggestions?: string[];
}

const PREFILL_FIELDS: PrefillField[] = ["recordUrl", "table", "recordId", "column", "from", "to"];
/** Non-prefill keys the headless runtime still understands. */
const EXTRA_FIELDS = ["connection"];

const EXPECTED: Record<PrefillField, string> = {
    recordUrl:
        "Model-driven record URL with etn=<table logical name>&id=<GUID> (or a Web API URL like https://<org>/api/data/v9.2/accounts(<GUID>)), e.g. https://contoso.crm.dynamics.com/main.aspx?etn=account&id=00000000-0000-0000-0000-000000000000",
    table: "Table logical name (lowercase, not the display name), e.g. account or cr_address",
    recordId: "Record GUID, e.g. 00000000-0000-0000-0000-000000000000",
    column: "Column logical name on the table (lowercase, not the display name), e.g. address1_line1",
    from: "ISO 8601 date/time earlier than 'to', e.g. 2026-10-01T00:00:00Z",
    to: "ISO 8601 date/time later than 'from', e.g. 2026-10-08T00:00:00Z",
};

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const STRICT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGICAL_NAME = /^[a-z][a-z0-9_]*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;
const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

function strictGuid(value: string): string {
    const bare = decodeSafe(value).trim().replace(/^[{(]|[})]$/g, "");
    return STRICT_GUID.test(bare) ? bare.toLowerCase() : "";
}

function parseIsoDate(value: string): Date | undefined {
    if (!ISO_DATE.test(value)) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
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

/** Best-effort guess used only when no table catalog is available to resolve the entity set name. */
function inferTableFromEntitySet(entitySet: string | undefined): string {
    const set = asString(entitySet).toLowerCase();
    if (!set) return "";
    if (set.endsWith("ies")) return `${set.slice(0, -3)}y`;
    if (set.endsWith("ses")) return set.slice(0, -2);
    if (set.endsWith("s")) return set.slice(0, -1);
    return set;
}

function describeReceived(value: unknown): unknown {
    if (value === null) return null;
    if (Array.isArray(value)) return "(array)";
    if (typeof value === "object") return "(object)";
    return value;
}

function levenshtein(a: string, b: string): number {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return row[b.length];
}

/** Ranks candidate logical names by how closely their logical name / aliases (display name, entity set) match the query. */
function suggest(query: string, candidates: Array<{ value: string; aliases: Array<string | undefined> }>, limit = 5): string[] {
    const squash = (v: string) => v.toLowerCase().replace(/[\s_-]/g, "");
    const q = squash(query);
    if (!q) return [];
    const scored: Array<{ value: string; score: number }> = [];
    for (const c of candidates) {
        let best = Number.POSITIVE_INFINITY;
        for (const alias of [c.value, ...c.aliases]) {
            if (!alias) continue;
            const a = squash(alias);
            if (a === q) best = Math.min(best, 0);
            else if (a.includes(q) || q.includes(a)) best = Math.min(best, 1);
            else {
                const distance = levenshtein(q, a);
                if (distance <= Math.max(2, Math.floor(q.length / 4))) best = Math.min(best, 1 + distance);
            }
        }
        if (Number.isFinite(best)) scored.push({ value: c.value, score: best });
    }
    return scored
        .sort((x, y) => x.score - y.score || x.value.localeCompare(y.value))
        .slice(0, limit)
        .map((s) => s.value);
}

interface PrefillDraft {
    received: Partial<Record<PrefillField, unknown>>;
    recordUrl?: string;
    urlRef?: ParsedRecordRef;
    table: string;
    /** Where `table` came from, so metadata errors point the agent at the right field. */
    tableField: "table" | "recordUrl";
    recordId: string;
    column?: string;
    from: string;
    to: string;
}

type DraftResult = { ok: true; draft: PrefillDraft; warnings: string[] } | { ok: false; errors: ValidationIssue[]; warnings: string[]; received: Partial<Record<PrefillField, unknown>> };

/** Structural validation of the prefill (types, formats, conflicts, window). Needs no Dataverse access. */
function validatePrefill(raw: unknown): DraftResult {
    const errors: ValidationIssue[] = [];
    const warnings: string[] = [];

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push({
            field: "(input)",
            code: "invalid_input",
            message: `Prefill must be a JSON object with any of: ${PREFILL_FIELDS.join(", ")}.`,
            received: describeReceived(raw),
            expected: '{ "recordUrl": "<record URL>", "column": "<column logical name>", "from": "<ISO date>", "to": "<ISO date>" }',
        });
        return { ok: false, errors, warnings, received: {} };
    }

    const input = raw as PlainObject;
    const received: Partial<Record<PrefillField, unknown>> = {};
    for (const key of Object.keys(input)) {
        if ((PREFILL_FIELDS as string[]).includes(key)) received[key as PrefillField] = describeReceived(input[key]);
        else if (!EXTRA_FIELDS.includes(key)) warnings.push(`Ignored unknown property '${key}'. Accepted properties: ${PREFILL_FIELDS.join(", ")}.`);
    }

    const read = (field: PrefillField): string => {
        const value = input[field];
        if (value === undefined || value === null) return "";
        if (typeof value !== "string") {
            errors.push({ field, code: "invalid_type", message: `'${field}' must be a string, received ${Array.isArray(value) ? "array" : typeof value}.`, received: describeReceived(value), expected: EXPECTED[field] });
            return "";
        }
        return value.trim();
    };

    const recordUrl = read("recordUrl");
    const tableText = read("table");
    const recordIdText = read("recordId");
    const columnText = read("column");
    const fromText = read("from");
    const toText = read("to");

    let urlRef: ParsedRecordRef | undefined;
    if (recordUrl) {
        const parsed = parseRecordUrl(recordUrl);
        if (parsed.ok) urlRef = parsed.value;
        else errors.push({ field: "recordUrl", code: "invalid_format", message: parsed.error, received: recordUrl, expected: EXPECTED.recordUrl });
    }

    let recordId = "";
    if (recordIdText) {
        recordId = strictGuid(recordIdText);
        if (!recordId) errors.push({ field: "recordId", code: "invalid_format", message: "'recordId' must be a GUID.", received: recordIdText, expected: EXPECTED.recordId });
    }

    const logicalName = (field: "table" | "column", text: string): string => {
        if (!text) return "";
        const lower = text.toLowerCase();
        if (LOGICAL_NAME.test(lower)) return lower;
        errors.push({
            field,
            code: "invalid_format",
            message: `'${field}' must be a ${field} logical name (letters, digits and underscores, starting with a letter). Display names aren't accepted.`,
            received: text,
            expected: EXPECTED[field],
        });
        return "";
    };
    const table = logicalName("table", tableText);
    const column = logicalName("column", columnText);

    if (urlRef?.recordId && recordId && urlRef.recordId !== recordId) {
        errors.push({
            field: "recordId",
            code: "conflict",
            message: `'recordId' (${recordId}) doesn't match the record ID in 'recordUrl' (${urlRef.recordId}). Send only one of them, or make them agree.`,
            received: recordIdText,
            expected: urlRef.recordId,
        });
    }
    if (urlRef?.table && table && urlRef.table !== table) {
        errors.push({
            field: "table",
            code: "conflict",
            message: `'table' (${table}) doesn't match etn=${urlRef.table} in 'recordUrl'. Send only one of them, or make them agree.`,
            received: tableText,
            expected: urlRef.table,
        });
    }

    if (!recordUrl && !recordIdText) {
        errors.push({ field: "recordUrl", code: "required", message: "Provide 'recordUrl' (preferred) or 'table' + 'recordId'.", expected: EXPECTED.recordUrl });
    } else if (urlRef && !urlRef.recordId && !recordId) {
        errors.push({ field: "recordId", code: "required", message: "A record ID is required; 'recordUrl' didn't contain one.", expected: EXPECTED.recordId });
    }
    if (!recordUrl && recordIdText && !tableText) {
        errors.push({ field: "table", code: "required", message: "'table' is required when 'recordId' is sent without 'recordUrl'.", expected: EXPECTED.table });
    }

    const from = fromText ? parseIsoDate(fromText) : undefined;
    const to = toText ? parseIsoDate(toText) : undefined;
    if (fromText && !from) errors.push({ field: "from", code: "invalid_format", message: "'from' must be an ISO 8601 date/time.", received: fromText, expected: EXPECTED.from });
    if (toText && !to) errors.push({ field: "to", code: "invalid_format", message: "'to' must be an ISO 8601 date/time.", received: toText, expected: EXPECTED.to });

    const toDate = to ?? new Date();
    const fromDate = from ?? new Date(toDate.getTime() - DEFAULT_WINDOW_MS);
    if ((!fromText || from) && (!toText || to) && fromDate.getTime() >= toDate.getTime()) {
        errors.push({
            field: "from",
            code: "invalid_range",
            message: `'from' (${fromDate.toISOString()}) must be earlier than 'to' (${toDate.toISOString()}${toText ? "" : ", defaulted to now"}).`,
            received: fromText,
            expected: EXPECTED.from,
        });
    }

    if (errors.length) return { ok: false, errors, warnings, received };

    return {
        ok: true,
        warnings,
        draft: {
            received,
            recordUrl: recordUrl || undefined,
            urlRef,
            table: table || urlRef?.table || "",
            tableField: table ? "table" : "recordUrl",
            recordId: recordId || urlRef?.recordId || "",
            column: column || undefined,
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
        },
    };
}

function finalizeWithoutCatalog(draft: PrefillDraft): { ok: true; value: NormalizedAnalysisInput } | { ok: false; errors: ValidationIssue[] } {
    const table = draft.table || inferTableFromEntitySet(draft.urlRef?.entitySet);
    if (!table) {
        const etcOnly = draft.urlRef?.objectTypeCode !== undefined;
        return {
            ok: false,
            errors: [
                {
                    field: "table",
                    code: "required",
                    message: etcOnly
                        ? "Couldn't infer table from record URL: it only has an object type code (etc=) and table metadata isn't available. Send 'table' or a URL with etn=<table>."
                        : "Couldn't infer table from record URL. Send 'table' or a URL with etn=<table>.",
                    received: draft.recordUrl,
                    expected: EXPECTED.table,
                },
            ],
        };
    }
    return { ok: true, value: toNormalized(draft, table) };
}

function toNormalized(draft: PrefillDraft, table: string): NormalizedAnalysisInput {
    return { recordUrl: draft.recordUrl, table, recordId: draft.recordId, column: draft.column, from: draft.from, to: draft.to };
}

function tableNotFound(draft: PrefillDraft, query: string, tables: TableInfo[], detail?: string): ValidationIssue {
    return {
        field: draft.tableField,
        code: "not_found",
        message: `Table '${query}' doesn't exist in this environment${detail ? ` (${detail})` : ""}.`,
        received: draft.tableField === "table" ? draft.received.table : draft.recordUrl,
        expected: EXPECTED.table,
        suggestions: suggest(
            query,
            tables.map((t) => ({ value: t.logicalName, aliases: [t.displayName, t.entitySetName] })),
        ),
    };
}

/** Metadata validation: table exists, column exists on it. Returns target-audit facts so they aren't fetched twice. */
async function validateAgainstMetadata(
    dv: ReadOnlyDataverse,
    tables: TableInfo[],
    draft: PrefillDraft,
): Promise<{ ok: true; value: NormalizedAnalysisInput; targetAuditFacts?: TargetAuditFacts } | { ok: false; errors: ValidationIssue[] }> {
    let table: string;
    if (tables.length) {
        if (draft.table) {
            const match = tables.find((t) => t.logicalName === draft.table);
            if (!match) return { ok: false, errors: [tableNotFound(draft, draft.table, tables)] };
            table = match.logicalName;
        } else {
            const resolved = draft.urlRef ? resolveTable(draft.urlRef, tables) : undefined;
            if (!resolved) {
                const ref = draft.urlRef;
                const query = ref?.entitySet ?? (ref?.objectTypeCode !== undefined ? String(ref.objectTypeCode) : "");
                const detail = ref?.entitySet ? "no table has that entity set name" : ref?.objectTypeCode !== undefined ? "no table has that object type code (etc)" : undefined;
                return { ok: false, errors: [tableNotFound(draft, query, tables, detail)] };
            }
            table = resolved;
        }
    } else {
        const fallback = finalizeWithoutCatalog(draft);
        if (!fallback.ok) return fallback;
        table = fallback.value.table;
    }

    const value = toNormalized(draft, table);

    if (value.column) {
        const facts = await gatherTargetAudit(dv, table, value.column);
        if (!facts.tableExists) return { ok: false, errors: [tableNotFound(draft, table, tables)] };
        if (facts.column && !facts.column.exists) {
            let columns: ColumnInfo[] = [];
            try {
                columns = await loadColumns(dv, table);
            } catch {
                columns = [];
            }
            return {
                ok: false,
                errors: [
                    {
                        field: "column",
                        code: "not_found",
                        message: `Column '${value.column}' doesn't exist on table '${table}'.`,
                        received: draft.received.column,
                        expected: EXPECTED.column,
                        suggestions: suggest(
                            value.column,
                            columns.map((c) => ({ value: c.logicalName, aliases: [c.displayName] })),
                        ),
                    },
                ],
            };
        }
        return { ok: true, value, targetAuditFacts: facts };
    }

    if (!tables.length) {
        try {
            await dv.entityMetadata(table, ["LogicalName"]);
        } catch (error) {
            if (classifyError(error).kind === "notFound") return { ok: false, errors: [tableNotFound(draft, table, tables)] };
        }
    }
    return { ok: true, value };
}

function validationSummary(errors: ValidationIssue[], warnings: string[]): PlainObject {
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        ...(errors.length
            ? {
                  message: `${errors.length} prefill value${errors.length === 1 ? " is" : "s are"} invalid: ${errors.map((e) => `[${e.field}] ${e.message}`).join(" ")} Correct the fields listed in validation.errors and invoke the tool again.`,
                  acceptedFields: EXPECTED,
              }
            : {}),
    };
}

function validationErrorPayload(received: Partial<Record<PrefillField, unknown>>, errors: ValidationIssue[], warnings: string[]): PlainObject {
    const validation = validationSummary(errors, warnings);
    return {
        operation: "validation-error",
        analysisInput: received,
        validation,
        dataCollection: { status: "blocked-by-invalid-input", mode: "analysis", requiresConnection: true, steps: [] },
        analysis: { status: "invalid-input", message: validation.message },
        findings: [],
        timelineHighlights: [],
        evidenceSummary: { findingCount: 0, unavailableCount: 0, timelineHighlightCount: 0, warningCount: 0 },
        generatedAt: new Date().toISOString(),
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

    const rejectInvalid = (received: Partial<Record<PrefillField, unknown>>, errors: ValidationIssue[], warnings: string[]): PlainObject => {
        for (const e of errors) logger.warn?.(`Invalid prefill '${e.field}' (${e.code}): ${e.message}`);
        updateProgress(100, "done");
        return validationErrorPayload(received, errors, warnings);
    };

    const checked = validatePrefill(input);
    for (const w of checked.warnings) logger.warn?.(w);
    if (!checked.ok) return rejectInvalid(checked.received, checked.errors, checked.warnings);
    const { draft, warnings } = checked;

    const dv = resolveDataverse(context);
    if (!dv) {
        const offline = finalizeWithoutCatalog(draft);
        if (!offline.ok) return rejectInvalid(draft.received, offline.errors, warnings);
        const normalizedInput = offline.value;
        updateProgress(100, "done");
        logger.warn?.("Headless runtime could not access Dataverse APIs; returning analysis-request payload only.");
        return {
            operation: "analysis-request",
            analysisInput: normalizedInput,
            validation: validationSummary([], warnings),
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

    updateProgress(30, "validating table and column");
    const verified = await validateAgainstMetadata(dv, tables, draft);
    if (!verified.ok) return rejectInvalid(draft.received, verified.errors, warnings);
    const normalizedInput = verified.value;

    updateProgress(35, "running preflight checks");
    const connection = resolveConnection(input, context);
    const preflightFacts = await gatherPreflightFacts(dv, connection);
    const report = evaluatePreflight(preflightFacts);

    const targetAuditFacts = verified.targetAuditFacts;
    let targetAuditChecks: ReturnType<typeof evaluateTargetAudit> = [];
    if (targetAuditFacts) {
        updateProgress(45, "checking target table/column auditing");
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

    updateProgress(100, "done");
    logger.info?.("Root Cause Analyzer headless analysis complete");

    return {
        operation: settled.error ? "analysis-error" : "analysis-complete",
        analysisInput: normalizedInput,
        validation: validationSummary([], warnings),
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
