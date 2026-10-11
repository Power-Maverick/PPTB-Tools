export interface ParsedRecordRef {
    host?: string;
    /** Logical name, from `etn=` */
    table?: string;
    /** From Web API URLs like /api/data/v9.2/accounts(<id>) */
    entitySet?: string;
    /** From legacy `etc=` URLs */
    objectTypeCode?: number;
    recordId?: string;
}

export type ParseResult = { ok: true; value: ParsedRecordRef } | { ok: false; error: string };

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function normalizeGuid(value: string): string | undefined {
    const match = GUID.exec(decodeSafe(value));
    return match ? match[0].toLowerCase() : undefined;
}

function decodeSafe(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/** Accepts a model-driven record URL, a Web API record URL, or a bare GUID. Never throws. */
export function parseRecordUrl(input: string): ParseResult {
    const text = input.trim();
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

    const value: ParsedRecordRef = { host: url.hostname.toLowerCase() };

    const webApi = /\/api\/data\/v[\d.]+\/([A-Za-z0-9_]+)\(([^)]+)\)/.exec(decodeSafe(url.pathname));
    if (webApi) {
        value.entitySet = webApi[1];
        value.recordId = normalizeGuid(webApi[2]);
    } else {
        // Model-driven apps put parameters in the query string, older URLs sometimes in the hash.
        const params = new URLSearchParams(url.search);
        const hash = url.hash.replace(/^#/, "");
        if (hash.includes("=")) new URLSearchParams(hash).forEach((v, k) => params.has(k) || params.set(k, v));
        const etn = params.get("etn");
        const etc = params.get("etc");
        const id = params.get("id");
        if (etn) value.table = etn.toLowerCase();
        if (etc && /^\d+$/.test(etc)) value.objectTypeCode = Number(etc);
        if (id) value.recordId = normalizeGuid(id);
    }

    if (!value.recordId) return { ok: false, error: "Couldn't find a record ID in that URL. Open the record and copy its URL from the address bar." };
    if (!value.table && !value.entitySet && value.objectTypeCode === undefined) {
        return { ok: false, error: "Couldn't tell which table that record belongs to. Pick the table manually." };
    }
    return { ok: true, value };
}

/** True when the URL points at a different environment than the active connection. */
export function isDifferentEnvironment(ref: ParsedRecordRef, connectionUrl: string | undefined): boolean {
    if (!ref.host || !connectionUrl) return false;
    try {
        return new URL(connectionUrl).hostname.toLowerCase() !== ref.host;
    } catch {
        return false;
    }
}
