/**
 * The ONLY module allowed to touch window.powerplatformAPI. GET requests only — enforced by
 * test/host/readOnlyGuard.test.ts.
 */
import { TimeoutError } from "./errors";

export interface ReadOnlyPowerAutomate {
    get(path: string): Promise<Record<string, unknown>>;
}

export type PowerAutomateReadSurface = Pick<PowerPlatformAPI.PowerAutomate, "Get">;

export function createReadOnlyPowerAutomate(api: PowerAutomateReadSurface, timeoutMs = 60_000): ReadOnlyPowerAutomate {
    return Object.freeze({
        get: (path: string) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new TimeoutError("Power Automate API", timeoutMs)), timeoutMs);
            });
            return Promise.race([api.Get(path, "primary"), timeout]).finally(() => clearTimeout(timer)) as Promise<Record<string, unknown>>;
        },
    });
}

export function getPowerAutomate(): ReadOnlyPowerAutomate | undefined {
    if (typeof window === "undefined" || !window.powerplatformAPI?.PowerAutomate) return undefined;
    return createReadOnlyPowerAutomate(window.powerplatformAPI.PowerAutomate);
}
