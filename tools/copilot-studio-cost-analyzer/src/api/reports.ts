const API_VERSION = "2024-10-01";
const REPORT_NAMESPACE = "licensing/reports";
const REQUEST_OPTIONS: PowerPlatformAPI.RawRequestOptions = { requireDelegatedAuthentication: true };
export const REPORT_TIMEOUT_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60 * 1000;
const COUNTDOWN_TICK_MS = 1000;
const INITIAL_POLL_DELAY_MS = 60 * 1000;

export type ReportKind = "FeatureDetailsPerResource" | "BillingDetailsPerEnvironment";
export type Granularity = "Daily" | "Summary";
export interface ReportRange { startDate: string; endDate: string }
export interface ReportProgress { message: string; elapsedMs: number }

export interface FeatureRow {
    agentName: string;
    agentId: string;
    product: string;
    feature: string;
    billedCredit: number;
    nonBilledCredit: number;
    channel: string;
    knowledgeSources: string;
    toolUsed: string;
    model: string;
    scenarioName: string;
    environmentId: string;
    environmentName: string;
    consumptionDate: string;
}

export interface BillingRow {
    tenantId: string;
    environmentId: string;
    environmentName: string;
    entitlementId: string;
    billingPolicyId: string;
    entitledQuantity: number;
    prepaidConsumed: number;
    payGoConsumed: number;
    billedDate: string;
}

type JsonRecord = Record<string, unknown>;
type RawReportClient = Pick<PowerPlatformAPI.RawCategoryClient, "Get" | "Post">;
type ProgressCallback = (progress: ReportProgress) => void;

class ReportHttpError extends Error {
    constructor(readonly status: number, message: string, readonly code?: string) {
        super(message);
        this.name = "ReportHttpError";
    }
}

function assertStatus(response: PowerPlatformAPI.RawResponse, expectedStatus: number): void {
    if (response.status === expectedStatus) return;
    let message = `The report API returned HTTP ${response.status}.`;
    let code: string | undefined;
    try {
        const body = decodeJson(response);
        if (body && typeof body === "object" && !Array.isArray(body)) {
            const record = body as JsonRecord;
            code = stringValue(record.code) || undefined;
            const error = record.error;
            const nestedMessage = error && typeof error === "object" && !Array.isArray(error)
                ? (error as JsonRecord).message
                : error;
            const detail = stringValue(record.message || record.error_description || nestedMessage);
            if (detail) message = detail;
        }
    } catch {
        // Keep the HTTP status when the service response is not a JSON error document.
    }
    throw new ReportHttpError(response.status, message, code);
}

function requiredHeader(response: PowerPlatformAPI.RawResponse, name: string): string {
    const value = response.headers[name];
    if (!value) throw new Error(`The report API response did not include the ${name} header.`);
    return value;
}

function retryDelay(value: string | undefined): number {
    if (!value) return 5000;
    if (/^\d+$/.test(value)) return Number(value) * 1000;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) throw new Error("The report API returned an invalid Retry-After header.");
    return Math.max(0, timestamp - Date.now());
}

function abortError(): DOMException {
    return new DOMException("Report request stopped.", "AbortError");
}

function wait(ms: number, signal: AbortSignal | undefined, deadline: number, onCountdown: (remainingMs: number) => void): Promise<void> {
    if (signal?.aborted) return Promise.reject(new DOMException("Report request cancelled.", "AbortError"));
    return new Promise((resolve, reject) => {
        const end = Math.min(Date.now() + ms, deadline);
        let timer: ReturnType<typeof setTimeout>;
        const tick = () => {
            const remaining = Math.max(0, end - Date.now());
            onCountdown(remaining);
            if (remaining === 0) {
                cleanup();
                if (Date.now() >= deadline && end === deadline) reject(new Error("Report generation timed out after 15 minutes. Try a shorter date range and try again."));
                else resolve();
                return;
            }
            timer = setTimeout(tick, Math.min(COUNTDOWN_TICK_MS, remaining));
        };
        const cancel = () => {
            cleanup();
            reject(abortError());
        };
        const cleanup = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
        };
        signal?.addEventListener("abort", cancel, { once: true });
        tick();
    });
}

function guardedRequest<T>(request: Promise<T>, signal: AbortSignal | undefined, label: string, deadline: number): Promise<T> {
    request.catch(() => undefined);
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
            callback();
        };
        const cancel = () => finish(() => reject(abortError()));
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
            reject(new Error("Report generation timed out after 15 minutes. Try a shorter date range and try again."));
            return;
        }
        const requestTimeoutMs = Math.min(REQUEST_TIMEOUT_MS, remainingMs);
        const timer = setTimeout(() => finish(() => reject(
            requestTimeoutMs < REQUEST_TIMEOUT_MS
                ? new Error("Report generation timed out after 15 minutes. Try a shorter date range and try again.")
                : new Error(`${label} timed out after 60 seconds. Check your connection and try again.`),
        )), requestTimeoutMs);
        signal?.addEventListener("abort", cancel, { once: true });
        request.then(
            (value) => finish(() => resolve(value)),
            (error: unknown) => finish(() => reject(error)),
        );
    });
}

function decodeJson(response: PowerPlatformAPI.RawResponse): unknown {
    const text = new TextDecoder().decode(response.body);
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new Error("The report API returned an invalid JSON response.");
    }
}

async function decodeGzipJson(bytes: Uint8Array): Promise<unknown> {
    if (typeof DecompressionStream === "undefined") throw new Error("Gzip decompression is unavailable in this PPTB runtime.");
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new Error("The downloaded report did not contain valid JSON.");
    }
}

function stringValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}

function numberValue(value: unknown, column: string): number {
    if (value === null || value === undefined || value === "") return 0;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`The report contains an invalid number in "${column}".`);
    return parsed;
}

function objectRows(value: unknown): JsonRecord[] {
    if (!Array.isArray(value)) throw new Error("The downloaded report is not a JSON array.");
    return value.map((row, index) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`Report row ${index + 1} is not a JSON object.`);
        return row as JsonRecord;
    });
}

export function parseFeatureRows(value: unknown): FeatureRow[] {
    return objectRows(value).map((row) => ({
        agentName: stringValue(row["Agent Name"]),
        agentId: stringValue(row["Agent Id"]),
        product: stringValue(row.Product),
        feature: stringValue(row["AI Feature/Billable Feature"]),
        billedCredit: numberValue(row["Billed credit"], "Billed credit"),
        nonBilledCredit: numberValue(row["Non-billed credit"], "Non-billed credit"),
        channel: stringValue(row.Channel),
        knowledgeSources: stringValue(row["Knowledge Sources"]),
        toolUsed: stringValue(row["Tool Used"]),
        model: stringValue(row["LLM Model"]),
        scenarioName: stringValue(row["Scenario Name"]),
        environmentId: stringValue(row["Environment Id"]),
        environmentName: stringValue(row["Environment Name"]),
        consumptionDate: stringValue(row["Consumption Date"]),
    }));
}

export function parseBillingRows(value: unknown): BillingRow[] {
    return objectRows(value).map((row) => ({
        tenantId: stringValue(row.TenantId),
        environmentId: stringValue(row.EnvironmentId),
        environmentName: stringValue(row.EnvironmentName),
        entitlementId: stringValue(row.EntitlementId),
        billingPolicyId: stringValue(row.BillingPolicyId),
        entitledQuantity: numberValue(row.EntitledQuantity, "EntitledQuantity"),
        prepaidConsumed: numberValue(row.PrepaidConsumedQuantity, "PrepaidConsumedQuantity"),
        payGoConsumed: numberValue(row.PayGoConsumedQuantity, "PayGoConsumedQuantity"),
        billedDate: stringValue(row.BilledDate),
    }));
}

export function loadReport(
    report: "FeatureDetailsPerResource",
    range: ReportRange,
    granularity: Granularity,
    onProgress: ProgressCallback,
    signal?: AbortSignal,
    client?: RawReportClient,
): Promise<FeatureRow[]>;
export function loadReport(
    report: "BillingDetailsPerEnvironment",
    range: ReportRange,
    granularity: Granularity,
    onProgress: ProgressCallback,
    signal?: AbortSignal,
    client?: RawReportClient,
): Promise<BillingRow[]>;
export async function loadReport(
    report: ReportKind,
    range: ReportRange,
    granularity: Granularity,
    onProgress: ProgressCallback,
    signal?: AbortSignal,
    client: RawReportClient = window.powerplatformAPI.CopilotStudio.Raw,
): Promise<FeatureRow[] | BillingRow[]> {
    const requestStartedAt = Date.now();
    const deadline = requestStartedAt + REPORT_TIMEOUT_MS;
    const reportPath = `${REPORT_NAMESPACE}/${report}?api-version=${API_VERSION}`;
    const elapsed = () => Date.now() - requestStartedAt;
    onProgress({ message: "Submitting report request…", elapsedMs: 0 });
    const started = await guardedRequest(
        client.Post(
            reportPath,
            { startDate: range.startDate, endDate: range.endDate, granularity, format: "json" },
            undefined,
            undefined,
            REQUEST_OPTIONS,
        ),
        signal,
        "Submitting the report",
        deadline,
    );
    assertStatus(started, 202);

    let operationLocation = requiredHeader(started, "location");
    let delay = INITIAL_POLL_DELAY_MS;
    let pollCount = 0;

    while (Date.now() < deadline) {
        if (signal?.aborted) throw abortError();
        const initialDelay = pollCount === 0;
        await wait(
            delay,
            signal,
            deadline,
            (remainingMs) => onProgress({
                message: `${initialDelay ? "Report queued" : "Report is processing"} · next status check in ${formatDuration(remainingMs)}`,
                elapsedMs: elapsed(),
            }),
        );
        const operation = await guardedRequest(
            client.Get(operationLocation, undefined, undefined, REQUEST_OPTIONS),
            signal,
            "Checking report status",
            deadline,
        );
        assertStatus(operation, 200);
        const state = decodeJson(operation);
        if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("The report status response has an unexpected format.");
        const status = (state as JsonRecord).status;
        if (status === "Failed") {
            throw new Error(stringValue((state as JsonRecord).error) || "The report could not be generated.");
        }
        if (status === "Succeeded") {
            const downloadLocation = requiredHeader(operation, "location");
            onProgress({ message: "Downloading and unpacking report…", elapsedMs: elapsed() });
            const download = await guardedRequest(
                client.Get(downloadLocation, undefined, undefined, REQUEST_OPTIONS),
                signal,
                "Downloading the report",
                deadline,
            );
            assertStatus(download, 200);
            const result = await decodeGzipJson(download.body);
            return report === "FeatureDetailsPerResource" ? parseFeatureRows(result) : parseBillingRows(result);
        }
        if (status !== "Running") throw new Error(`The report API returned an unknown operation status: ${stringValue(status) || "(empty)"}.`);
        delay = retryDelay(operation.headers["retry-after"]);
        pollCount++;
    }
    throw new Error("Report generation timed out after 15 minutes. Try a shorter date range and try again.");
}

function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}
