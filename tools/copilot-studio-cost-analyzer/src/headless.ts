/// <reference types="@pptb/types" />

import {
    loadAzureCosts,
    type AzureCostRequest,
    type AzureCostType,
    type AzureGrouping,
    type AzureScopeFilter,
    isSubscriptionId,
} from "./api/azureCosts";
import { loadReport, type BillingRow, type FeatureRow, type Granularity, type ReportKind, type ReportProgress } from "./api/reports";
import { aggregateAgents, aggregateBilling } from "./data/analysis";
import { groupTotals, totalsByCurrency, type AzureCostRow } from "./data/azureCostAnalysis";
import type { AzureAPI } from "./types/azureAPI";

type PlainObject = Record<string, unknown>;
type HeadlessLogger = Pick<Console, "debug" | "info" | "warn" | "error">;
type RunLog = (level: keyof HeadlessLogger, event: string, details?: PlainObject) => void;

function createRunLog(logger?: Partial<HeadlessLogger>): RunLog {
    const runId = crypto.randomUUID();
    const startedAt = Date.now();
    return (level, event, details = {}) => {
        const entry = JSON.stringify({ runId, timestamp: new Date().toISOString(), elapsedMs: Date.now() - startedAt, event, ...details });
        const target = logger?.[level] ? logger : console;
        target[level]?.(`[Copilot Studio Cost Analyzer headless] ${entry}`);
    };
}

function errorDiagnostics(reason: unknown): PlainObject {
    const failure = reason && typeof reason === "object" ? reason : {};
    const knownCodes = [
        "invalidRequest", "capabilityDenied", "consentRequired", "notConfigured", "notConnected",
        "interactionRequired", "authenticationFailed", "accessDenied", "throttled",
        "costDataUnavailable", "networkError", "serviceError", "cancelled", "timeout",
        "connectionChanged", "invalidContinuation", "limitExceeded", "InvalidRequestContent",
    ];
    return {
        status: "status" in failure && typeof failure.status === "number" ? failure.status : undefined,
        code: "code" in failure && typeof failure.code === "string" && knownCodes.includes(failure.code) ? failure.code : "unknown",
        retryAfterMs: "retryAfterMs" in failure && typeof failure.retryAfterMs === "number" ? failure.retryAfterMs : undefined,
    };
}

interface HeadlessInput extends PlainObject {
    startDate: string;
    endDate: string;
    granularity: Granularity;
    includeAzure: boolean;
    subscriptionId?: string;
    costType: AzureCostType;
    scopeFilter: AzureScopeFilter;
    grouping: AzureGrouping;
}

interface HeadlessContext {
    logger?: Partial<HeadlessLogger>;
    updateProgress?: (percent: number, message: string) => void;
    powerplatformAPI?: Pick<PowerPlatformAPI.API, "CopilotStudio">;
    azureAPI?: AzureAPI.API;
}

interface ReportResult<Row> {
    status: "succeeded" | "failed";
    rowCount: number;
    rows: Row[];
    retrievedAt?: string;
    error?: string;
}

interface AzureResult {
    status: "succeeded" | "failed" | "skipped";
    rowCount: number;
    pages: number;
    rows: AzureCostRow[];
    totalsByCurrency: ReturnType<typeof totalsByCurrency>;
    groups: ReturnType<typeof groupTotals>;
    timePeriod?: { from: string; to: string };
    retrievedAt?: string;
    error?: string;
}

const COST_TYPES: AzureCostType[] = ["ActualCost", "AmortizedCost"];
const SCOPE_FILTERS: AzureScopeFilter[] = ["powerPlatform", "all"];
const GROUPINGS: AzureGrouping[] = ["None", "Meter", "MeterCategory", "ServiceName", "ResourceGroupName", "ResourceId"];

function isRecord(value: unknown): value is PlainObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dateValue(value: unknown, field: string): string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`"${field}" must be a date in YYYY-MM-DD format.`);
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error(`"${field}" is not a valid calendar date.`);
    }
    return value;
}

function parseInput(value: unknown, now = new Date()): HeadlessInput {
    if (!isRecord(value)) throw new Error("Provide an input object with startDate and endDate.");

    const startDate = dateValue(value.startDate, "startDate");
    const endDate = dateValue(value.endDate, "endDate");
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const latestCompleteDate = new Date(today);
    latestCompleteDate.setUTCDate(latestCompleteDate.getUTCDate() - 1);
    const earliestAgentDate = new Date(today);
    earliestAgentDate.setUTCDate(earliestAgentDate.getUTCDate() - 30);
    const latest = latestCompleteDate.toISOString().slice(0, 10);
    const earliest = earliestAgentDate.toISOString().slice(0, 10);

    if (startDate > endDate) throw new Error("startDate must be on or before endDate.");
    if (startDate < earliest || endDate > latest) {
        throw new Error(`The credit reports support completed UTC dates from ${earliest} through ${latest}.`);
    }

    const granularity = value.granularity ?? "Daily";
    if (granularity !== "Daily" && granularity !== "Summary") {
        throw new Error('"granularity" must be "Daily" or "Summary".');
    }
    const includeAzure = value.includeAzure ?? false;
    if (typeof includeAzure !== "boolean") throw new Error('"includeAzure" must be a boolean.');

    const subscriptionId = typeof value.subscriptionId === "string" ? value.subscriptionId.trim() : undefined;

    const costType = value.costType ?? "ActualCost";
    if (typeof costType !== "string" || !COST_TYPES.includes(costType as AzureCostType)) {
        throw new Error('"costType" must be "ActualCost" or "AmortizedCost".');
    }
    const scopeFilter = value.scopeFilter ?? "powerPlatform";
    if (typeof scopeFilter !== "string" || !SCOPE_FILTERS.includes(scopeFilter as AzureScopeFilter)) {
        throw new Error('"scopeFilter" must be "powerPlatform" or "all".');
    }
    const grouping = value.grouping ?? "Meter";
    if (typeof grouping !== "string" || !GROUPINGS.includes(grouping as AzureGrouping)) {
        throw new Error(`"grouping" must be one of: ${GROUPINGS.join(", ")}.`);
    }

    return { startDate, endDate, granularity, includeAzure, subscriptionId, costType: costType as AzureCostType, scopeFilter: scopeFilter as AzureScopeFilter, grouping: grouping as AzureGrouping };
}

function getPowerPlatformRaw(context?: HeadlessContext): Pick<PowerPlatformAPI.RawCategoryClient, "Get" | "Post"> | undefined {
    if (context?.powerplatformAPI) return context.powerplatformAPI.CopilotStudio.Raw;
    if (typeof window !== "undefined") return window.powerplatformAPI?.CopilotStudio.Raw;
    return undefined;
}

function getAzureApi(context?: HeadlessContext): AzureAPI.API | undefined {
    if (context?.azureAPI) return context.azureAPI;
    if (typeof window !== "undefined") return window.azureAPI;
    return undefined;
}

function reportResult<Row>(rows: Row[]): ReportResult<Row> {
    return { status: "succeeded", rowCount: rows.length, rows, retrievedAt: new Date().toISOString() };
}

function failedReport<Row>(reason: unknown): ReportResult<Row> {
    const error = reason instanceof Error ? reason.message : "The report request failed unexpectedly.";
    return { status: "failed", rowCount: 0, rows: [], error };
}

function skippedAzure(): AzureResult {
    return { status: "skipped", rowCount: 0, pages: 0, rows: [], totalsByCurrency: [], groups: [] };
}

function loadCreditReport(
    report: "FeatureDetailsPerResource",
    range: { startDate: string; endDate: string },
    granularity: Granularity,
    client: Pick<PowerPlatformAPI.RawCategoryClient, "Get" | "Post"> | undefined,
    log: RunLog,
): Promise<ReportResult<FeatureRow>>;
function loadCreditReport(
    report: "BillingDetailsPerEnvironment",
    range: { startDate: string; endDate: string },
    granularity: Granularity,
    client: Pick<PowerPlatformAPI.RawCategoryClient, "Get" | "Post"> | undefined,
    log: RunLog,
): Promise<ReportResult<BillingRow>>;
async function loadCreditReport(
    report: ReportKind,
    range: { startDate: string; endDate: string },
    granularity: Granularity,
    client: Pick<PowerPlatformAPI.RawCategoryClient, "Get" | "Post"> | undefined,
    log: RunLog,
): Promise<ReportResult<FeatureRow | BillingRow>> {
    const startedAt = Date.now();
    if (!client) {
        log("error", "credit-report.unavailable", { report });
        return failedReport(new Error("PPTB did not provide the Power Platform API in this headless invocation."));
    }
    log("info", "credit-report.started", {
        report, startDate: range.startDate, endDate: range.endDate, granularity, requireDelegatedAuthentication: true,
    });
    let lastPhase = "";
    let lastLoggedAt = -Infinity;
    const onProgress = (progress: ReportProgress) => {
        const phase = progress.message.split(" · ")[0];
        if (phase !== lastPhase || Date.now() - lastLoggedAt >= 30_000) {
            log("debug", "credit-report.progress", { report, message: progress.message, reportElapsedMs: progress.elapsedMs });
            lastPhase = phase;
            lastLoggedAt = Date.now();
        }
    };
    try {
        const rows: FeatureRow[] | BillingRow[] = report === "FeatureDetailsPerResource"
            ? await loadReport("FeatureDetailsPerResource", range, granularity, onProgress, undefined, client)
            : await loadReport("BillingDetailsPerEnvironment", range, granularity, onProgress, undefined, client);
        log("info", "credit-report.succeeded", { report, rowCount: rows.length, durationMs: Date.now() - startedAt });
        return reportResult<FeatureRow | BillingRow>(rows);
    } catch (reason) {
        log("error", "credit-report.failed", { report, durationMs: Date.now() - startedAt, ...errorDiagnostics(reason) });
        return failedReport(reason);
    }
}

async function loadAzureReport(input: HeadlessInput, api: AzureAPI.API | undefined, log: RunLog): Promise<AzureResult> {
    if (!input.includeAzure || !input.subscriptionId) return skippedAzure();
    if (!api) {
        log("error", "azure-report.unavailable");
        return { ...skippedAzure(), status: "failed", error: "PPTB did not provide the Azure API in this headless invocation." };
    }
    const startedAt = Date.now();
    log("info", "azure-report.started", {
        startDate: input.startDate, endDate: input.endDate,
        costType: input.costType, scopeFilter: input.scopeFilter, grouping: input.grouping,
    });
    const request: AzureCostRequest = {
        subscriptionId: input.subscriptionId,
        costType: input.costType,
        period: "Last30Days",
        timePeriod: { from: input.startDate, to: input.endDate },
        grouping: input.grouping,
        scopeFilter: input.scopeFilter,
    };
    try {
        const result = await loadAzureCosts(api, request, undefined, (page) => log("debug", "azure-report.page-requested", { page }));
        log("info", "azure-report.succeeded", {
            rowCount: result.rows.length, pages: result.pages,
            currencyCount: totalsByCurrency(result.rows).length, durationMs: Date.now() - startedAt,
        });
        return {
            status: "succeeded",
            rowCount: result.rows.length,
            pages: result.pages,
            rows: result.rows,
            totalsByCurrency: totalsByCurrency(result.rows),
            groups: groupTotals(result.rows),
            timePeriod: result.timePeriod,
            retrievedAt: new Date().toISOString(),
        };
    } catch (reason) {
        log("error", "azure-report.failed", { durationMs: Date.now() - startedAt, ...errorDiagnostics(reason) });
        return {
            ...skippedAzure(),
            status: "failed",
            error: reason instanceof Error ? reason.message : "The Azure cost request failed unexpectedly.",
        };
    }
}

function sum<T>(rows: T[], read: (row: T) => number): number {
    return rows.reduce((total, row) => total + read(row), 0);
}

export async function invokeHeadless(input: unknown, context?: HeadlessContext): Promise<PlainObject> {
    const log = createRunLog(context?.logger);
    log("info", "run.started");
    const updateProgress = context?.updateProgress ?? (() => undefined);
    updateProgress(5, "validating report request");
    let request: HeadlessInput;
    try {
        request = parseInput(input);
    } catch (reason) {
        log("error", "validation.failed", { message: reason instanceof Error ? reason.message : "Input validation failed." });
        throw reason;
    }
    log("debug", "validation.succeeded", {
        startDate: request.startDate, endDate: request.endDate, granularity: request.granularity,
        includeAzure: request.includeAzure, subscriptionIdProvided: Boolean(request.subscriptionId),
    });
    if (request.includeAzure && (!request.subscriptionId || !isSubscriptionId(request.subscriptionId))) {
        const message = "Azure cost analysis requires a valid Azure subscription ID.";
        log("warn", "run.requires-input", { field: "subscriptionId", code: request.subscriptionId ? "subscription_id_invalid" : "subscription_id_required" });
        updateProgress(100, "waiting for user-provided subscription ID");
        return {
            operation: "needs-user-input",
            status: "requires_input",
            code: request.subscriptionId ? "subscription_id_invalid" : "subscription_id_required",
            message,
            input: request,
            requiredInputs: [{
                name: "subscriptionId",
                type: "string",
                format: "uuid",
                prompt: "Which Azure subscription should I analyze? Please provide its subscription ID (GUID), available in Azure Portal > Subscriptions.",
            }],
            nextAction: {
                type: "ask-user-and-reinvoke",
                instructions: "Ask the user for a valid Azure subscriptionId GUID. Invoke this tool again using the returned input with subscriptionId replaced by the user-provided value. Preserve the dates and options, keep includeAzure true, and do not invent an ID or disable Azure analysis.",
            },
            generatedAt: new Date().toISOString(),
        };
    }

    const raw = getPowerPlatformRaw(context);
    const azure = getAzureApi(context);
    log("debug", "apis.resolved", { powerPlatformAvailable: Boolean(raw), azureAvailable: Boolean(azure) });
    if (!request.includeAzure) log("info", "azure-report.skipped", { reason: "not-requested" });
    let completed = 0;
    const total = request.includeAzure ? 3 : 2;
    const track = <T>(task: Promise<T>, name: string): Promise<T> => task.finally(() => {
        completed++;
        updateProgress(10 + Math.round((completed / total) * 80), `${name} complete`);
    });
    updateProgress(10, "requesting credit reports and Azure costs");
    const [agents, environmentCapacity, azureCosts] = await Promise.all([
        track(loadCreditReport("FeatureDetailsPerResource", request, request.granularity, raw, log), "Agent usage report"),
        track(loadCreditReport("BillingDetailsPerEnvironment", request, request.granularity, raw, log), "Environment capacity report"),
        request.includeAzure
            ? track(loadAzureReport(request, azure, log), "Azure cost report")
            : Promise.resolve(skippedAzure()),
    ]);

    const agentReport = agents;
    const capacityReport = environmentCapacity;
    const azureReport = azureCosts;
    const agentTotals = aggregateAgents(agentReport.rows);
    const billingTotals = aggregateBilling(capacityReport.rows);
    const output = {
        operation: "cost-analysis",
        input: {
            startDate: request.startDate,
            endDate: request.endDate,
            granularity: request.granularity,
            includeAzure: request.includeAzure,
            ...(request.includeAzure ? {
                subscriptionId: request.subscriptionId,
                costType: request.costType,
                scopeFilter: request.scopeFilter,
                grouping: request.grouping,
            } : {}),
        },
        reports: {
            agentUsage: agentReport,
            environmentCapacity: capacityReport,
            azureCosts: azureReport,
        },
        summary: {
            agentCount: agentTotals.length,
            billedCredits: sum(agentReport.rows, (row) => row.billedCredit),
            nonBilledCredits: sum(agentReport.rows, (row) => row.nonBilledCredit),
            environmentCount: billingTotals.length,
            prepaidConsumed: sum(capacityReport.rows, (row) => row.prepaidConsumed),
            payGoConsumed: sum(capacityReport.rows, (row) => row.payGoConsumed),
            azureTotalsByCurrency: azureReport.totalsByCurrency,
        },
        generatedAt: new Date().toISOString(),
    };
    updateProgress(100, "analysis complete");
    const failureCount = [agentReport, capacityReport, azureReport].filter((report) => report.status === "failed").length;
    log(failureCount ? "warn" : "info", "run.completed", {
        agentReport: agentReport.status,
        environmentCapacityReport: capacityReport.status,
        azureCostReport: azureReport.status,
        failureCount,
        agentRowCount: agentReport.rowCount,
        environmentRowCount: capacityReport.rowCount,
        azureRowCount: azureReport.rowCount,
    });
    return output;
}
