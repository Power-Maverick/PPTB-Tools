import type { ActorKind, Confidence, EventStatus, Severity } from "../model/types";

export function fmtDateTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Compact, one-line timeline time: "Oct 10 22:14:42" (24h, so milliseconds can follow). */
export function fmtTimelineTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    return `${date} ${time}`;
}

export function fmtMs(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : `.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export const ACTOR_LABEL: Record<ActorKind, string> = {
    user: "User",
    app: "Integration / app user",
    plugin: "Plugin",
    flow: "Cloud flow",
    workflow: "Workflow",
    system: "System",
};

export const STATUS_LABEL: Record<EventStatus, string> = {
    success: "Succeeded",
    failed: "Failed",
    waiting: "Waiting",
    inprogress: "In progress",
    suspended: "Suspended",
    canceled: "Canceled",
    unknown: "Unknown",
};

export const statusColor = (s: EventStatus): "success" | "danger" | "warning" | "informative" | "subtle" =>
    s === "success" ? "success" : s === "failed" ? "danger" : s === "suspended" || s === "waiting" ? "warning" : s === "inprogress" ? "informative" : "subtle";

export const severityColor = (s: Severity): "danger" | "severe" | "warning" | "informative" | "subtle" =>
    s === "critical" ? "danger" : s === "high" ? "severe" : s === "medium" ? "warning" : s === "low" ? "informative" : "subtle";

export const confidenceColor = (c: Confidence): "success" | "warning" | "danger" => (c === "high" ? "success" : c === "medium" ? "warning" : "danger");

export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
