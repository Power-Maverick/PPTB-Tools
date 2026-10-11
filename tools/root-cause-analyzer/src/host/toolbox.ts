import type { ConnectionFacts } from "../data/preflight";

export function hasToolbox(): boolean {
    return typeof window !== "undefined" && !!window.toolboxAPI;
}

export async function getConnectionFacts(): Promise<ConnectionFacts | null> {
    if (!hasToolbox()) return null;
    const connection = await window.toolboxAPI.connections.getActiveConnection();
    if (!connection) return null;
    return {
        name: connection.name,
        url: connection.url,
        environment: connection.environment,
        enabledForPowerPlatformAPI: connection.enabledForPowerPlatformAPI,
    };
}

export interface Prefill {
    recordUrl?: string;
    table?: string;
    recordId?: string;
    column?: string;
    from?: string;
    to?: string;
}

/** Launch context shape isn't fixed across host versions; accept prefill at the root or under `prefill`. */
export async function getPrefill(): Promise<Prefill> {
    if (!hasToolbox() || !window.toolboxAPI.invocation) return {};
    try {
        const context = await window.toolboxAPI.invocation.getLaunchContext();
        if (!context) return {};
        const source = (context.prefill && typeof context.prefill === "object" ? context.prefill : context) as Record<string, unknown>;
        const pick = (key: keyof Prefill) => (typeof source[key] === "string" ? (source[key] as string) : undefined);
        return { recordUrl: pick("recordUrl"), table: pick("table"), recordId: pick("recordId"), column: pick("column"), from: pick("from"), to: pick("to") };
    } catch {
        return {};
    }
}

export function onConnectionChange(callback: () => void): () => void {
    if (!hasToolbox()) return () => undefined;
    const handler = (_event: unknown, payload: ToolBoxAPI.ToolBoxEventPayload) => {
        if (payload?.event?.startsWith("connection:")) callback();
    };
    window.toolboxAPI.events.on(handler);
    return () => window.toolboxAPI.events.off(handler);
}

export async function notify(title: string, body: string, type: "info" | "success" | "warning" | "error" = "info") {
    if (!hasToolbox()) return;
    await window.toolboxAPI.utils.showNotification({ title, body, type });
}

const SETTINGS_KEY = "analysisSettings";

/** Per-tool ToolBox settings (local to this machine) — never Dataverse. */
export async function loadToolSettings<T extends object>(defaults: T): Promise<T> {
    if (!hasToolbox()) return defaults;
    try {
        const saved = await window.toolboxAPI.settings.get(SETTINGS_KEY);
        return saved && typeof saved === "object" ? { ...defaults, ...(saved as Partial<T>) } : defaults;
    } catch {
        return defaults;
    }
}

export async function saveToolSettings<T extends object>(value: T): Promise<void> {
    if (!hasToolbox()) return;
    try {
        await window.toolboxAPI.settings.set(SETTINGS_KEY, value);
    } catch {
        // Settings only persist for convenience; failing to save isn't fatal.
    }
}

export async function copyText(text: string): Promise<boolean> {
    try {
        if (hasToolbox()) await window.toolboxAPI.utils.copyToClipboard(text);
        else await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
