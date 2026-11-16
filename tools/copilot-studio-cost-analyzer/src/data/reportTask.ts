import type { Granularity, ReportProgress, ReportRange } from "../api/reports";

export interface ReportSnapshot<Row> {
    status: "idle" | "loading" | "ready" | "error" | "stopped";
    rows?: Row[];
    range?: ReportRange;
    granularity?: Granularity;
    progress?: ReportProgress;
    error?: string;
    failure?: unknown;
    retrievedAt?: Date;
}

export type ReportLoader<Row> = (range: ReportRange, granularity: Granularity, onProgress: (progress: ReportProgress) => void, signal: AbortSignal) => Promise<Row[]>;

export function reportErrorMessage(reason: unknown): string {
    if (reason && typeof reason === "object" && "status" in reason) {
        const failure = reason as { status?: unknown; code?: unknown; message?: unknown };
        if (failure.status === 401) return "Authentication failed. Reconnect your delegated Power Platform account and try again.";
        if (failure.status === 403) return "Access denied. Confirm your account has an eligible tenant administrator role.";
        if (failure.status === 404) return "The report API or selected report is not enabled for this tenant yet.";
        if (failure.status === 429) return "The report API is throttling requests. Wait a little and try again.";
        if (failure.code === "InvalidRequestContent") return "The report request was rejected. Check the date range and confirm JSON report downloads are enabled for this tenant.";
        if (typeof failure.message === "string" && failure.message) return failure.message;
    }
    return reason instanceof Error ? reason.message : "The report request failed unexpectedly. Check the console for diagnostic details.";
}

export function logReportFailure(reason: unknown): void {
    const failure = reason && typeof reason === "object"
        ? reason as { name?: unknown; status?: unknown; code?: unknown; message?: unknown }
        : undefined;
    console.error("Copilot Studio report request failed.", {
        name: typeof failure?.name === "string" ? failure.name : "UnknownError",
        status: typeof failure?.status === "number" ? failure.status : undefined,
        code: typeof failure?.code === "string" ? failure.code : undefined,
        message: reportErrorMessage(reason).replace(/Bearer\s+\S+/gi, "******"),
    });
}

export class ReportTask<Row> {
    private snapshot: ReportSnapshot<Row> = { status: "idle" };
    private controller?: AbortController;
    private listeners = new Set<() => void>();

    constructor(private readonly loader: ReportLoader<Row>, initial?: ReportSnapshot<Row>) {
        if (initial) this.snapshot = initial;
    }

    getSnapshot = (): ReportSnapshot<Row> => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private update(snapshot: ReportSnapshot<Row>): void {
        this.snapshot = snapshot;
        this.listeners.forEach((listener) => listener());
    }

    run = async (range: ReportRange, granularity: Granularity): Promise<void> => {
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const requestRange = { ...range };
        this.update({ status: "loading", range: requestRange, granularity, progress: { message: "Submitting report request…", elapsedMs: 0 } });
        try {
            const rows = await this.loader(requestRange, granularity, (progress) => {
                if (this.controller === controller) this.update({ ...this.snapshot, progress });
            }, controller.signal);
            if (this.controller === controller) this.update({ status: "ready", rows, range: requestRange, granularity, retrievedAt: new Date() });
        } catch (reason) {
            if (this.controller !== controller) return;
            if (reason instanceof Error && reason.name === "AbortError") {
                this.update({ ...this.snapshot, status: "stopped", progress: undefined });
            } else {
                logReportFailure(reason);
                this.update({ ...this.snapshot, status: "error", progress: undefined, error: reportErrorMessage(reason), failure: reason });
            }
        } finally {
            if (this.controller === controller) this.controller = undefined;
        }
    };

    stop = (): void => {
        if (!this.controller) return;
        const controller = this.controller;
        this.controller = undefined;
        controller.abort();
        this.update({ ...this.snapshot, status: "stopped", progress: undefined });
    };

    clear = (): void => {
        this.stop();
        this.update({ status: "idle" });
    };
}
