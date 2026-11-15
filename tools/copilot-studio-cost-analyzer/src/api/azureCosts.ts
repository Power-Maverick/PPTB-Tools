import type { AzureAPI } from "../types/azureAPI";
import { parseCostResult, type AzureCostRow } from "../data/azureCostAnalysis";

export const AZURE_REQUEST_TIMEOUT_MS = 60_000;
export const AZURE_AUTH_TIMEOUT_MS = 120_000;
export const AZURE_MAX_THROTTLE_WAIT_MS = 60_000;
export const POWER_PLATFORM_RESOURCE_TYPE = "microsoft.powerplatform/accounts";

const SUBSCRIPTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGES = 100;

export type AzureCostType = AzureAPI.CostQuery["type"];
export type AzurePeriod = "MonthToDate" | "TheLastMonth" | "Last30Days";
export type AzureGrouping = "None" | "Meter" | "MeterCategory" | "ServiceName" | "ResourceGroupName" | "ResourceId";
export type AzureScopeFilter = "powerPlatform" | "all";

export interface AzureCostRequest {
    subscriptionId: string;
    costType: AzureCostType;
    period: AzurePeriod;
    grouping: AzureGrouping;
    scopeFilter: AzureScopeFilter;
}

export interface AzureCostResult {
    rows: AzureCostRow[];
    pages: number;
    timePeriod: { from: string; to: string };
}

export type AzureErrorCode = AzureAPI.ErrorCode | "unavailable";

export class AzureRequestError extends Error {
    readonly code: AzureErrorCode;
    readonly status?: number;
    readonly serviceCode?: string;
    readonly requestId?: string;
    readonly correlationId?: string;
    readonly retryAfterMs?: number;

    constructor(code: AzureErrorCode, message: string, details: Partial<Pick<AzureRequestError, "status" | "serviceCode" | "requestId" | "correlationId" | "retryAfterMs">> = {}) {
        super(message);
        this.name = "AzureRequestError";
        this.code = code;
        Object.assign(this, details);
    }
}

export function getAzureApi(): AzureAPI.API | undefined {
    return typeof window === "undefined" ? undefined : window.azureAPI;
}

export function isSubscriptionId(value: string): boolean {
    return SUBSCRIPTION_ID.test(value.trim());
}

export function subscriptionScope(subscriptionId: string): string {
    if (!isSubscriptionId(subscriptionId)) throw new AzureRequestError("invalidRequest", "Enter a valid Azure subscription ID (GUID).");
    return `/subscriptions/${subscriptionId.trim().toLowerCase()}`;
}

function abortError(): DOMException {
    return new DOMException("The Azure request was stopped.", "AbortError");
}

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}

export function toAzureError(reason: unknown): AzureRequestError {
    if (reason instanceof AzureRequestError) return reason;
    if (reason && typeof reason === "object" && typeof (reason as { code?: unknown }).code === "string") {
        const failure = reason as Partial<AzureAPI.ApiError>;
        return new AzureRequestError(failure.code as AzureAPI.ErrorCode, optionalString(failure.message) ?? "Azure request failed.", {
            status: typeof failure.status === "number" ? failure.status : undefined,
            serviceCode: optionalString(failure.serviceCode),
            requestId: optionalString(failure.requestId),
            correlationId: optionalString(failure.correlationId),
            retryAfterMs: typeof failure.retryAfterMs === "number" ? failure.retryAfterMs : undefined,
        });
    }
    return new AzureRequestError("serviceError", reason instanceof Error ? reason.message : "Azure request failed unexpectedly.");
}

export function isAbortError(reason: unknown): boolean {
    return reason instanceof DOMException ? reason.name === "AbortError" : reason instanceof Error && reason.name === "AbortError";
}

/** Runs one host call with a unique request ID so Stop can cancel it in the host; late results are discarded. */
export async function runAzureRequest<T>(
    api: AzureAPI.API,
    run: (options: AzureAPI.Options) => Promise<T>,
    signal?: AbortSignal,
    timeoutMs = AZURE_REQUEST_TIMEOUT_MS,
): Promise<T> {
    if (signal?.aborted) throw abortError();
    const requestId = `csca-${crypto.randomUUID()}`;
    const cancel = () => {
        void api.cancelRequest(requestId).catch((reason: unknown) => {
            console.warn("Could not confirm Azure request cancellation.", { code: toAzureError(reason).code });
        });
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
        const result = await run({ connectionTarget: "primary", requestId, timeoutMs });
        if (signal?.aborted) throw abortError();
        return result;
    } catch (reason) {
        if (signal?.aborted) throw abortError();
        throw toAzureError(reason);
    } finally {
        signal?.removeEventListener("abort", cancel);
    }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError());
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/** Honors a short Retry-After once; longer throttling is surfaced to the user instead of retried. */
async function withThrottleRetry<T>(api: AzureAPI.API, run: (options: AzureAPI.Options) => Promise<T>, signal?: AbortSignal): Promise<T> {
    try {
        return await runAzureRequest(api, run, signal);
    } catch (reason) {
        const failure = toAzureError(reason);
        if (isAbortError(reason) || failure.code !== "throttled" || failure.retryAfterMs === undefined || failure.retryAfterMs > AZURE_MAX_THROTTLE_WAIT_MS) throw reason;
        await wait(failure.retryAfterMs, signal);
        return runAzureRequest(api, run, signal);
    }
}

export function authenticateAzure(api: AzureAPI.API, signal?: AbortSignal): Promise<AzureAPI.ConnectionState> {
    return runAzureRequest(api, (options) => api.arm.authenticate(options), signal, AZURE_AUTH_TIMEOUT_MS);
}

export async function listAllSubscriptions(api: AzureAPI.API, signal?: AbortSignal): Promise<AzureAPI.Subscription[]> {
    const subscriptions: AzureAPI.Subscription[] = [];
    let response = await withThrottleRetry(api, (options) => api.arm.listSubscriptions(options), signal);
    subscriptions.push(...(response.data?.value ?? []));
    for (let page = 1; response.continuation; page++) {
        if (page >= MAX_PAGES) throw new AzureRequestError("limitExceeded", "Too many subscription pages were returned. Enter the subscription ID manually.");
        const handle = response.continuation;
        response = await withThrottleRetry(api, (options) => api.arm.nextPage<AzureAPI.SubscriptionList>(handle, options), signal);
        subscriptions.push(...(response.data?.value ?? []));
    }
    return subscriptions.sort((a, b) => (a.displayName || a.subscriptionId).localeCompare(b.displayName || b.subscriptionId));
}

export function checkSubscriptionAccess(api: AzureAPI.API, subscriptionId: string, signal?: AbortSignal): Promise<AzureAPI.CostAccessCheck> {
    const scope = subscriptionScope(subscriptionId);
    return runAzureRequest(api, (options) => api.arm.checkCostAccess(scope, options), signal);
}

function utcDay(now: Date, daysAgo: number): string {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return date.toISOString().slice(0, 10);
}

/** Calendar boundaries shown to the user; the service applies the named timeframes itself. */
export function describePeriod(period: AzurePeriod, now = new Date()): { from: string; to: string } {
    if (period === "Last30Days") return { from: utcDay(now, 30), to: utcDay(now, 1) };
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    if (period === "TheLastMonth") {
        return {
            from: new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10),
            to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
        };
    }
    return { from: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10), to: utcDay(now, 0) };
}

export function buildCostQuery(request: Omit<AzureCostRequest, "subscriptionId">, now = new Date()): AzureAPI.CostQuery {
    const dataset: AzureAPI.CostQuery["dataset"] = {
        granularity: "Daily",
        aggregation: { totalCost: { name: "PreTaxCost", function: "Sum" } },
    };
    if (request.grouping !== "None") dataset.grouping = [{ type: "Dimension", name: request.grouping }];
    if (request.scopeFilter === "powerPlatform") {
        dataset.filter = { dimensions: { name: "ResourceType", operator: "In", values: [POWER_PLATFORM_RESOURCE_TYPE] } };
    }
    if (request.period === "Last30Days") {
        const period = describePeriod("Last30Days", now);
        return { type: request.costType, timeframe: "Custom", timePeriod: { from: `${period.from}T00:00:00Z`, to: `${period.to}T23:59:59Z` }, dataset };
    }
    return { type: request.costType, timeframe: request.period, dataset };
}

export async function loadAzureCosts(
    api: AzureAPI.API,
    request: AzureCostRequest,
    signal?: AbortSignal,
    onPage?: (page: number) => void,
    now = new Date(),
): Promise<AzureCostResult> {
    const scope = subscriptionScope(request.subscriptionId);
    const query = buildCostQuery(request, now);
    const grouping = request.grouping === "None" ? undefined : request.grouping;
    const rows: AzureCostRow[] = [];
    onPage?.(1);
    let response = await withThrottleRetry(api, (options) => api.arm.queryCosts(scope, query, options), signal);
    if (response.data) rows.push(...parseCostResult(response.data, grouping));
    let pages = 1;
    while (response.continuation) {
        if (pages >= MAX_PAGES) throw new AzureRequestError("limitExceeded", "Azure returned too many result pages. Choose a shorter period or a different grouping.");
        const handle = response.continuation;
        onPage?.(++pages);
        response = await withThrottleRetry(api, (options) => api.arm.nextPage<AzureAPI.CostQueryResult>(handle, options), signal);
        if (response.data) rows.push(...parseCostResult(response.data, grouping));
    }
    return { rows, pages, timePeriod: describePeriod(request.period, now) };
}

export function azureErrorMessage(reason: unknown): string {
    const failure = toAzureError(reason);
    switch (failure.code) {
        case "unavailable":
            return "This PPTB version doesn't provide Azure API support. Update Power Platform ToolBox to use Azure cost reports.";
        case "notConfigured":
            return "Azure Resource Manager API isn't enabled on this connection. In PPTB, edit the connection and turn on Additional APIs › Azure Resource Manager API.";
        case "notConnected":
            return "The PPTB connection isn't signed in. Reconnect it in PPTB, then try again.";
        case "capabilityDenied":
            return "PPTB didn't allow this tool to call Azure Resource Manager. Update the tool or PPTB.";
        case "consentRequired":
            return "Select Connect Azure and approve the PPTB prompt to allow read-only Azure cost access.";
        case "interactionRequired":
            return "Azure needs you to sign in again (for example, MFA or Conditional Access). Select Connect Azure.";
        case "authenticationFailed":
            return "Azure sign-in failed. Check that the connection's app registration has Azure Service Management › user_impersonation, consent is granted, and the credentials are valid.";
        case "accessDenied":
            return "Azure denied cost access for this subscription. Ask an administrator to verify Cost Management Reader (or equivalent) on the subscription and your agreement's billing visibility settings. A 403 can't identify one exact missing role.";
        case "throttled":
            return `Azure Cost Management is throttling requests. Try again${failure.retryAfterMs ? ` in about ${Math.ceil(failure.retryAfterMs / 1000)} seconds` : " shortly"}.`;
        case "costDataUnavailable":
            return "Azure reports no cost data for this subscription and period. This isn't a permissions failure and doesn't confirm zero spend.";
        case "invalidRequest":
            return "Azure rejected the request. Check the subscription ID and selected options.";
        case "invalidContinuation":
            return "The result pages expired or the connection changed. Load costs again.";
        case "networkError":
            return "Azure couldn't be reached. Check network and proxy settings, then try again.";
        case "timeout":
            return "Azure didn't respond in time. Choose a shorter period or try again.";
        case "connectionChanged":
            return "The PPTB connection changed. Results were cleared; select the subscription again.";
        case "limitExceeded":
            return "The result is too large. Choose a shorter period or a different grouping.";
        case "cancelled":
            return "The Azure request was cancelled.";
        default:
            return "Azure Cost Management returned a service error. Try again later.";
    }
}

export function logAzureFailure(operation: string, reason: unknown): void {
    const failure = toAzureError(reason);
    console.error(`Azure ${operation} failed.`, {
        code: failure.code,
        status: failure.status,
        serviceCode: failure.serviceCode,
        requestId: failure.requestId,
        correlationId: failure.correlationId,
        retryAfterMs: failure.retryAfterMs,
    });
}
