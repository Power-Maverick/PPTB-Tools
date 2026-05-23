import type { EbgSettings } from "../../../models/interfaces";
import { DEFAULT_SETTINGS } from "../../../models/interfaces";

export function makeSettings(overrides: Partial<EbgSettings> = {}): EbgSettings {
    return { ...DEFAULT_SETTINGS, ...overrides };
}

export const TEST_VERSION = "0.0.0";
