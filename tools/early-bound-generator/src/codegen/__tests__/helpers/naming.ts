import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EbgSettings } from "../../../models/interfaces";
import { CamelCaser, buildDictionary } from "../../camelCaser";
import { NamingService } from "../../naming";
import { FilterService } from "../../filters";

export function buildNamingService(settings: EbgSettings): NamingService {
    const dictPath = resolve(__dirname, "../../../../public/dictionary.txt");
    const raw = readFileSync(dictPath, "utf-8");
    const dict = buildDictionary(raw, settings.camelCaseCustomWords);
    const sortedOverrides = [...settings.tokenCapitalizationOverrides].sort((a, b) => b.length - a.length);
    const caser = new CamelCaser(dict, sortedOverrides);
    return new NamingService(settings, caser);
}

export function buildFilterService(settings: EbgSettings): FilterService {
    return new FilterService(settings);
}
