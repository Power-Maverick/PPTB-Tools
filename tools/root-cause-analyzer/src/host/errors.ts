export type ErrorKind = "privilege" | "notFound" | "throttled" | "timeout" | "other";

export interface ClassifiedError {
    kind: ErrorKind;
    message: string;
}

const PRIVILEGE = /0x80040220|0x80042f09|prv[A-Z][A-Za-z]+|missing .*privilege|insufficient permissions|\b403\b|forbidden/i;
const NOT_FOUND = /0x80060888|0x80040217|0x80041102|resource not found|does not exist|could not find|\b404\b/i;
const THROTTLED = /0x80072322|0x80072321|\b429\b|throttl|too many requests/i;
const TIMEOUT = /timed out|timeout/i;

export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
        const e = error as Record<string, unknown>;
        const inner = e.error as Record<string, unknown> | undefined;
        if (typeof inner?.message === "string") return inner.message;
        if (typeof e.message === "string") return e.message;
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }
    return String(error);
}

/** The host surfaces Dataverse errors as text, so classification is by known codes and phrases. */
export function classifyError(error: unknown): ClassifiedError {
    const message = errorMessage(error);
    if (error instanceof TimeoutError || TIMEOUT.test(message)) return { kind: "timeout", message };
    if (PRIVILEGE.test(message)) return { kind: "privilege", message };
    if (NOT_FOUND.test(message)) return { kind: "notFound", message };
    if (THROTTLED.test(message)) return { kind: "throttled", message };
    return { kind: "other", message };
}

export class TimeoutError extends Error {
    constructor(label: string, ms: number) {
        super(`${label} timed out after ${Math.round(ms / 1000)}s`);
        this.name = "TimeoutError";
    }
}
