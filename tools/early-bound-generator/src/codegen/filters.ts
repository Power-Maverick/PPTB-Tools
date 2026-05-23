import type { EbgSettings } from "../models/interfaces";
import type { AttributeMetadata, EntityMetadata } from "./types";

function convertAsteriskToWildcardRegex(pattern: string): RegExp {
    const start = pattern.startsWith("*") ? "" : "^";
    const end = pattern.endsWith("*") ? "" : "$";
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*?");
    return new RegExp(start + escaped + end);
}

interface AttributeBlacklistLogic {
    blacklist: Set<string>;
    blacklistWildCards: RegExp[];
    blacklistByEntity: Map<string, Set<string>>;
    blacklistWildCardsByEntity: Map<string, RegExp[]>;
}

function buildAttributeBlacklistLogic(blacklist: string[]): AttributeBlacklistLogic {
    const result: AttributeBlacklistLogic = {
        blacklist: new Set(),
        blacklistWildCards: [],
        blacklistByEntity: new Map(),
        blacklistWildCardsByEntity: new Map(),
    };

    for (const raw of blacklist) {
        const item = raw.trim();
        if (!item) continue;

        const parts = item.split(".");
        if (parts.length === 1) {
            if (item.includes("*")) {
                result.blacklistWildCards.push(convertAsteriskToWildcardRegex(item));
            } else {
                result.blacklist.add(item);
            }
        } else if (parts.length === 2) {
            const [entity, attr] = parts;
            if (attr.includes("*")) {
                let entityWildCards = result.blacklistWildCardsByEntity.get(entity);
                if (!entityWildCards) {
                    entityWildCards = [];
                    result.blacklistWildCardsByEntity.set(entity, entityWildCards);
                }
                entityWildCards.push(convertAsteriskToWildcardRegex(attr));
            } else {
                let entityAttrs = result.blacklistByEntity.get(entity);
                if (!entityAttrs) {
                    entityAttrs = new Set();
                    result.blacklistByEntity.set(entity, entityAttrs);
                }
                entityAttrs.add(attr);
            }
        }
    }

    return result;
}

function isAttributeBlacklisted(logic: AttributeBlacklistLogic, entityName: string, attrName: string): boolean {
    if (logic.blacklist.has(attrName)) return true;
    if (logic.blacklistWildCards.some((r) => r.test(attrName))) return true;

    const entityAttrs = logic.blacklistByEntity.get(entityName);
    if (entityAttrs?.has(attrName)) return true;

    const entityWildCards = logic.blacklistWildCardsByEntity.get(entityName);
    if (entityWildCards?.some((r) => r.test(attrName))) return true;

    return false;
}

interface BlacklistLogic {
    blacklist: Set<string>;
    blacklistPrefixPatterns: RegExp[];
}

function injectMissingWildcards(entries: string[]): RegExp[] {
    return entries
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .map((v) => {
            const pattern = v.includes("*") ? v.replace(/\*/g, ".*") : v + ".*";
            return new RegExp(pattern);
        });
}

function buildBlacklistLogic(exactList: string[], prefixEntries: string[]): BlacklistLogic {
    return {
        blacklist: new Set(exactList.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)),
        blacklistPrefixPatterns: injectMissingWildcards(prefixEntries),
    };
}

function isBlacklistedByLogic(logic: BlacklistLogic, value: string): boolean {
    if (logic.blacklist.has(value.toLowerCase())) return true;
    if (logic.blacklistPrefixPatterns.some((r) => r.test(value))) return true;
    return false;
}

export class FilterService {
    private readonly attrBlacklist: AttributeBlacklistLogic;
    private readonly entityBlacklist: BlacklistLogic;
    private readonly messageBlacklist: BlacklistLogic;
    private readonly settings: EbgSettings;

    constructor(settings: EbgSettings) {
        this.settings = settings;

        this.attrBlacklist = buildAttributeBlacklistLogic(settings.attributeBlacklist);

        this.entityBlacklist = buildBlacklistLogic(settings.entitiesToSkip, settings.entityPrefixesToSkip);

        this.messageBlacklist = buildBlacklistLogic(settings.messagesToSkip, []);
    }

    shouldGenerateEntity(entity: EntityMetadata): boolean {
        const logical = entity.LogicalName.toLowerCase();

        const hasWhitelist = this.settings.entitiesWhitelist.length > 0;
        const hasPrefixWhitelist = this.settings.entityPrefixesWhitelist.length > 0;

        if (hasWhitelist || hasPrefixWhitelist) {
            const inExact = hasWhitelist && this.settings.entitiesWhitelist.some((w) => w.toLowerCase() === logical);
            const prefixPatterns = injectMissingWildcards(this.settings.entityPrefixesWhitelist);
            const inPrefix = hasPrefixWhitelist && prefixPatterns.some((r) => r.test(logical));
            if (!inExact && !inPrefix) return false;
        }

        if (isBlacklistedByLogic(this.entityBlacklist, logical)) return false;

        return true;
    }

    shouldGenerateAttribute(entity: EntityMetadata, attr: AttributeMetadata): boolean {
        if (attr.AttributeOf) {
            const typeName = attr.AttributeTypeName?.Value;
            const isImage = typeName === "ImageType" || attr.AttributeType === "Image";
            if (!isImage) {
                const ln = attr.LogicalName.toLowerCase();

                if (ln.endsWith("_url") || ln.endsWith("_timestamp")) return true;
                if (!this.settings.emitVirtualAttributes) {
                    return false;
                }

                const isNameAttr = ln.endsWith("name") && ln.length > 4;
                if (!isNameAttr) return false;
            }
        }
        return !isAttributeBlacklisted(this.attrBlacklist, entity.LogicalName.toLowerCase(), attr.LogicalName.toLowerCase());
    }

    shouldGenerateMessage(messageName: string): boolean {
        const lower = messageName.toLowerCase();

        const hasWhitelist = this.settings.messagesWhitelist.length > 0;
        const hasPrefixWhitelist = this.settings.messagePrefixesWhitelist.length > 0;

        if (hasWhitelist || hasPrefixWhitelist) {
            const inExact = hasWhitelist && this.settings.messagesWhitelist.some((w) => w.toLowerCase() === lower);
            const prefixPatterns = injectMissingWildcards(this.settings.messagePrefixesWhitelist);
            const inPrefix = hasPrefixWhitelist && prefixPatterns.some((r) => r.test(lower));
            if (!inExact && !inPrefix) return false;
        }

        if (isBlacklistedByLogic(this.messageBlacklist, lower)) return false;

        return true;
    }
}
