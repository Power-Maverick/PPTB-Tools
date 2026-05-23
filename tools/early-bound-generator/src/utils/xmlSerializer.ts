import { DEFAULT_SETTINGS, EbgSettings } from "../models/interfaces";

const XSD = "http://www.w3.org/2001/XMLSchema";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";

function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Multiline pipe format: each item on its own line, pipe-suffixed except last. */
function pipeJoin(items: string[]): string {
    if (items.length === 0) return "";
    return items.map((item, i) => (i < items.length - 1 ? esc(item) + "|" : esc(item))).join("\n");
}

function recordPipeJoin(record: Record<string, string>): string {
    const entries = Object.entries(record).map(([k, v]) => `${k}:${v}`);
    return pipeJoin(entries);
}

function attrSpecifiedPipeJoin(record: Record<string, string[]>): string {
    const entries = Object.entries(record).map(([k, v]) => `${k}:${v.join(",")}`);
    return pipeJoin(entries);
}

/** Outer element (2-space indent). Empty value → self-closing tag. */
function el(name: string, value: string): string {
    if (value === "") return `  <${name} />\n`;
    return `  <${name}>${value}</${name}>\n`;
}

function elBool(name: string, value: boolean): string {
    return `  <${name}>${value ? "true" : "false"}</${name}>\n`;
}

/** Inner element (4-space indent, inside ExtensionConfig). Empty → self-closing. */
function eli(name: string, value: string): string {
    if (value === "") return `    <${name} />\n`;
    return `    <${name}>${value}</${name}>\n`;
}

function eliBool(name: string, value: boolean): string {
    return `    <${name}>${value ? "true" : "false"}</${name}>\n`;
}

function eliNullableInt(name: string, value: number | null): string {
    // C# XmlSerializer emits xsi:nil on a separate line with extra indent:
    //   <OptionSetLanguageCodeOverride
    //     xsi:nil="true" />
    if (value === null) return `    <${name}\n      xsi:nil="true" />\n`;
    return `    <${name}>${value}</${name}>\n`;
}

function eliList(name: string, items: string[]): string {
    return eli(name, pipeJoin(items));
}

function eliRecord(name: string, record: Record<string, string>): string {
    return eli(name, recordPipeJoin(record));
}

function eliAttrSpecified(name: string, record: Record<string, string[]>): string {
    return eli(name, attrSpecifiedPipeJoin(record));
}

// ── serialise ────────────────────────────────────────────────────────────────

export function settingsToXml(s: EbgSettings, appVersion: string): string {
    const settingsVersion = appVersion;
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
    xml += `<Config xmlns:xsd="${XSD}" xmlns:xsi="${XSI}">\n`;

    // Top-level fields that come before ExtensionConfig alphabetically:
    // AudibleCompletionNotification, CodeCustomizationService ... EntityTypesFolder
    xml += elBool("AudibleCompletionNotification", false);
    xml += el("CodeCustomizationService", esc(s.codeCustomizationService));
    xml += el("CodeGenerationService", esc(s.codeGenerationService));
    xml += el("CodeWriterFilterService", esc(s.codeWriterFilterService));
    xml += el("CodeWriterMessageFilterService", esc(s.codeWriterMessageFilterService));
    xml += elBool("EmitEntityETC", s.emitEntityETC);
    xml += elBool("EmitVirtualAttributes", s.emitVirtualAttributes);
    xml += el("EntityTypesFolder", esc(s.entityTypesFolder));

    // ExtensionConfig block (comes between EntityTypesFolder and GenerateMessages alphabetically)
    xml += `  <ExtensionConfig>\n`;
    xml += eliList("ActionPrefixesWhitelist", s.messagePrefixesWhitelist);
    xml += eliList("ActionsWhitelist", s.messagesWhitelist);
    xml += eliList("ActionsToSkip", s.messagesToSkip);
    xml += eliBool("AddDebuggerNonUserCode", s.addDebuggerNonUserCode);
    xml += eliBool("AddNewFilesToProject", s.addNewFilesToProject);
    xml += eliBool("AddOptionSetMetadataAttribute", s.addOptionSetMetadataAttribute);
    xml += eliBool("AdjustCasingForEnumOptions", s.adjustCasingForEnumOptions);
    xml += eliList("AttributeBlacklist", s.attributeBlacklist);
    xml += eli("BuilderSettingsJsonRelativePath", esc(s.builderSettingsJsonRelativePath));
    xml += eliBool("CamelCaseClassNames", s.camelCaseClassNames);
    xml += eliList("CamelCaseCustomWords", s.camelCaseCustomWords);
    xml += eliBool("CamelCaseMemberNames", s.camelCaseMemberNames);
    xml += eli("CamelCaseNamesDictionaryRelativePath", esc(s.camelCaseNamesDictionaryRelativePath));
    xml += eliBool("CleanupCrmSvcUtilLocalOptionSets", s.cleanupCrmSvcUtilLocalOptionSets);
    xml += eliBool("CreateOneFilePerAction", s.createOneFilePerMessage);
    xml += eliBool("CreateOneFilePerEntity", s.createOneFilePerEntity);
    xml += eliBool("CreateOneFilePerOptionSet", s.createOneFilePerOptionSet);
    xml += eliBool("DeleteFilesFromOutputFolders", s.deleteFilesFromOutputFolders);
    xml += eliList("EntitiesToSkip", s.entitiesToSkip);
    xml += eliList("EntitiesWhitelist", s.entitiesWhitelist);
    xml += eliAttrSpecified("EntityAttributeSpecifiedNames", s.entityAttributeSpecifiedNames);
    xml += eliRecord("EntityClassNameOverrides", s.entityClassNameOverrides);
    xml += eliList("EntityPrefixesToSkip", s.entityPrefixesToSkip);
    xml += eliList("EntityPrefixesWhitelist", s.entityPrefixesWhitelist);
    xml += eliBool("GenerateActionAttributeNameConsts", s.generateMessageAttributeNameConsts);
    xml += eliBool("GenerateAllOptionSetLabelMetadata", s.generateAllOptionSetLabelMetadata);
    xml += eliBool("GenerateAttributeNameConsts", s.generateAttributeNameConsts);
    xml += eliBool("GenerateAnonymousTypeConstructor", s.generateAnonymousTypeConstructor);
    xml += eliBool("GenerateConstructorsSansLogicalName", s.generateConstructorsSansLogicalName);
    xml += eliBool("GenerateEntityRelationships", s.generateEntityRelationships);
    xml += eliBool("GenerateEnumProperties", s.generateEnumProperties);
    xml += eliBool("GenerateGlobalOptionSets", s.generateGlobalOptionSets);
    xml += eliBool("GenerateINotifyPattern", s.generateINotifyPattern);
    xml += eliBool("GenerateOptionSetMetadataAttribute", s.generateOptionSetMetadataAttribute);
    xml += eliBool("GenerateTypesAsInternal", s.generateTypesAsInternal);
    xml += eliBool("GroupLocalOptionSetsByEntity", s.groupLocalOptionSetsByEntity);
    xml += eliBool("GroupMessageRequestWithResponse", s.groupMessageRequestWithResponse);
    xml += eli("InvalidCSharpNamePrefix", esc(s.invalidCSharpNamePrefix));
    xml += eliBool("MakeAllFieldsEditable", s.makeAllFieldsEditable);
    xml += eliBool("MakeReadonlyFieldsEditable", s.makeReadonlyFieldsEditable);
    xml += eliBool("MakeResponseActionsEditable", s.makeResponseMessagesEditable);
    xml += eli("LocalOptionSetFormat", esc(s.localOptionSetFormat));
    xml += eliBool("MakeReferenceTypesNullable", s.makeReferenceTypesNullable);
    xml += eli("ModelBuilderLogLevel", esc(s.modelBuilderLogLevel));
    xml += eliBool("ObsoleteDeprecated", s.obsoleteDeprecated);
    xml += eliList("ObsoleteTokens", s.obsoleteTokens);
    xml += eliNullableInt("OptionSetLanguageCodeOverride", s.optionSetLanguageCodeOverride);
    xml += eliRecord("OptionSetNames", s.optionSetNames);
    xml += eliRecord("OptionNameOverrides", s.optionNameOverrides);
    xml += eli("ProjectNameForEarlyBoundFiles", esc(s.projectNameForEarlyBoundFiles));
    xml += eliList("PropertyEnumMappings", s.propertyEnumMappings);
    xml += eliBool("ReadSerializedMetadata", s.readSerializedMetadata);
    xml += eliBool("RemoveRuntimeVersionComment", s.removeRuntimeVersionComment);
    xml += eliBool("ReplaceOptionSetPropertiesWithEnum", s.replaceOptionSetPropertiesWithEnum);
    xml += eliBool("SerializeMetadata", s.serializeMetadata);
    xml += eliBool("SuppressAutogeneratedFileHeaderComment", s.suppressAutogeneratedFileHeaderComment);
    xml += eliList("TokenCapitalizationOverrides", s.tokenCapitalizationOverrides);
    xml += eli("TransliterationRelativePath", esc(s.transliterationRelativePath));
    xml += eliBool("UseCrmSvcUtilStateEnumNamingConvention", s.useCrmSvcUtilStateEnumNamingConvention);
    xml += eliBool("UseDisplayNameForBpfName", s.useDisplayNameForBpfName);
    xml += eliBool("UseEnumForStateCodes", s.useEnumForStateCodes);
    xml += eliBool("UseLogicalNames", s.useLogicalNames);
    xml += eliBool("WaitForAttachedDebugger", s.waitForAttachedDebugger);
    xml += `  </ExtensionConfig>\n`;

    // Remaining top-level fields alphabetically after ExtensionConfig:
    // GenerateMessages, IncludeCommandLine, MessageTypesFolder, Metadata*, NamingService,
    // Namespace, OptionSetsTypesFolder, ServiceContextName, SettingsVersion,
    // SuppressGeneratedCodeAttribute, UpdateBuilderSettingsJson, Version
    xml += elBool("GenerateMessages", s.generateMessages);
    xml += elBool("IncludeCommandLine", s.includeCommandLine);
    xml += el("MessageTypesFolder", esc(s.messageTypesFolder));
    xml += el("MetadataProviderService", esc(s.metadataProviderService));
    xml += el("MetadataQueryProviderService", esc(s.metadataQueryProviderService));
    xml += el("NamingService", esc(s.namingService));
    xml += el("OptionSetsTypesFolder", esc(s.optionSetsTypesFolder));
    xml += el("Namespace", esc(s.namespace));
    xml += el("ServiceContextName", esc(s.serviceContextName));
    xml += elBool("SuppressGeneratedCodeAttribute", s.suppressGeneratedCodeAttribute);
    xml += el("SettingsVersion", settingsVersion);
    xml += elBool("UpdateBuilderSettingsJson", s.updateBuilderSettingsJson);
    xml += el("Version", settingsVersion);

    xml += `</Config>`;
    return xml;
}

// ── deserialise ───────────────────────────────────────────────────────────────

function getText(parent: Element, tagName: string): string | null {
    const el = parent.getElementsByTagName(tagName)[0];
    if (!el) return null;
    return el.textContent ?? null;
}

function getBool(parent: Element, tagName: string, fallback: boolean): boolean {
    const v = getText(parent, tagName);
    if (v === null) return fallback;
    return v.trim().toLowerCase() === "true";
}

function getNullableInt(parent: Element, tagName: string): number | null {
    const el = parent.getElementsByTagName(tagName)[0];
    if (!el) return null;
    if (el.getAttribute("xsi:nil") === "true" || el.getAttributeNS(XSI, "nil") === "true") return null;
    const v = el.textContent?.trim();
    if (!v) return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
}

function getList(parent: Element, tagName: string, fallback: string[]): string[] {
    const v = getText(parent, tagName);
    if (v === null) return fallback;
    if (v.trim() === "") return [];
    // Support both single-line and multiline pipe-delimited formats
    return v
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
}

function getRecord(parent: Element, tagName: string): Record<string, string> {
    const v = getText(parent, tagName);
    if (!v || v.trim() === "") return {};
    const result: Record<string, string> = {};
    for (const part of v.split("|")) {
        const trimmed = part.trim();
        const idx = trimmed.indexOf(":");
        if (idx > 0) {
            result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
        }
    }
    return result;
}

function getAttrSpecified(parent: Element, tagName: string): Record<string, string[]> {
    const v = getText(parent, tagName);
    if (!v || v.trim() === "") return {};
    const result: Record<string, string[]> = {};
    for (const part of v.split("|")) {
        const trimmed = part.trim();
        const idx = trimmed.indexOf(":");
        if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const vals = trimmed.slice(idx + 1).trim();
            result[key] = vals
                ? vals
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                : [];
        }
    }
    return result;
}

function getStr(parent: Element, tagName: string, fallback: string): string {
    const v = getText(parent, tagName);
    return v !== null ? v : fallback;
}

export function xmlToSettings(xml: string): { settings: EbgSettings; settingsVersion: string } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    const config = doc.getElementsByTagName("Config")[0];
    if (!config) throw new Error("Invalid settings file: missing <Config> root element");

    const ext = config.getElementsByTagName("ExtensionConfig")[0];

    const d = DEFAULT_SETTINGS;

    const topStr = (tag: string, fb: string) => getStr(config, tag, fb);
    const topBool = (tag: string, fb: boolean) => getBool(config, tag, fb);

    const extStr = (tag: string, fb: string) => (ext ? getStr(ext, tag, fb) : fb);
    const extBool = (tag: string, fb: boolean) => (ext ? getBool(ext, tag, fb) : fb);
    const extList = (tag: string, fb: string[]) => (ext ? getList(ext, tag, fb) : fb);

    const settingsVersion = topStr("SettingsVersion", "");

    return {
        settingsVersion,
        settings: {
            // ── top-level ──
            namespace: topStr("Namespace", d.namespace),
            serviceContextName: topStr("ServiceContextName", d.serviceContextName),
            entityTypesFolder: topStr("EntityTypesFolder", d.entityTypesFolder),
            optionSetsTypesFolder: topStr("OptionSetsTypesFolder", d.optionSetsTypesFolder),
            messageTypesFolder: topStr("MessageTypesFolder", d.messageTypesFolder),
            generateMessages: topBool("GenerateMessages", d.generateMessages),
            includeCommandLine: topBool("IncludeCommandLine", d.includeCommandLine),
            suppressGeneratedCodeAttribute: topBool("SuppressGeneratedCodeAttribute", d.suppressGeneratedCodeAttribute),
            updateBuilderSettingsJson: topBool("UpdateBuilderSettingsJson", d.updateBuilderSettingsJson),
            emitEntityETC: topBool("EmitEntityETC", d.emitEntityETC),
            emitVirtualAttributes: topBool("EmitVirtualAttributes", d.emitVirtualAttributes),
            codeCustomizationService: topStr("CodeCustomizationService", d.codeCustomizationService),
            codeGenerationService: topStr("CodeGenerationService", d.codeGenerationService),
            codeWriterFilterService: topStr("CodeWriterFilterService", d.codeWriterFilterService),
            codeWriterMessageFilterService: topStr("CodeWriterMessageFilterService", d.codeWriterMessageFilterService),
            metadataProviderService: topStr("MetadataProviderService", d.metadataProviderService),
            metadataQueryProviderService: topStr("MetadataQueryProviderService", d.metadataQueryProviderService),
            namingService: topStr("NamingService", d.namingService),

            // ── ExtensionConfig ──
            addDebuggerNonUserCode: extBool("AddDebuggerNonUserCode", d.addDebuggerNonUserCode),
            addNewFilesToProject: extBool("AddNewFilesToProject", d.addNewFilesToProject),
            addOptionSetMetadataAttribute: extBool("AddOptionSetMetadataAttribute", d.addOptionSetMetadataAttribute),
            adjustCasingForEnumOptions: extBool("AdjustCasingForEnumOptions", d.adjustCasingForEnumOptions),
            attributeBlacklist: extList("AttributeBlacklist", d.attributeBlacklist),
            builderSettingsJsonRelativePath: extStr("BuilderSettingsJsonRelativePath", d.builderSettingsJsonRelativePath),
            camelCaseClassNames: extBool("CamelCaseClassNames", d.camelCaseClassNames),
            camelCaseCustomWords: extList("CamelCaseCustomWords", d.camelCaseCustomWords),
            camelCaseMemberNames: extBool("CamelCaseMemberNames", d.camelCaseMemberNames),
            camelCaseNamesDictionaryRelativePath: extStr("CamelCaseNamesDictionaryRelativePath", d.camelCaseNamesDictionaryRelativePath),
            cleanupCrmSvcUtilLocalOptionSets: extBool("CleanupCrmSvcUtilLocalOptionSets", d.cleanupCrmSvcUtilLocalOptionSets),
            createOneFilePerMessage: extBool("CreateOneFilePerAction", d.createOneFilePerMessage),
            createOneFilePerEntity: extBool("CreateOneFilePerEntity", d.createOneFilePerEntity),
            createOneFilePerOptionSet: extBool("CreateOneFilePerOptionSet", d.createOneFilePerOptionSet),
            deleteFilesFromOutputFolders: extBool("DeleteFilesFromOutputFolders", d.deleteFilesFromOutputFolders),
            entitiesToSkip: extList("EntitiesToSkip", d.entitiesToSkip),
            entitiesWhitelist: extList("EntitiesWhitelist", d.entitiesWhitelist),
            entityAttributeSpecifiedNames: ext ? getAttrSpecified(ext, "EntityAttributeSpecifiedNames") : d.entityAttributeSpecifiedNames,
            entityClassNameOverrides: ext ? getRecord(ext, "EntityClassNameOverrides") : d.entityClassNameOverrides,
            entityPrefixesToSkip: extList("EntityPrefixesToSkip", d.entityPrefixesToSkip),
            entityPrefixesWhitelist: extList("EntityPrefixesWhitelist", d.entityPrefixesWhitelist),
            filePrefixText: extStr("FilePrefixText", d.filePrefixText),
            generateMessageAttributeNameConsts: extBool("GenerateActionAttributeNameConsts", d.generateMessageAttributeNameConsts),
            generateAllOptionSetLabelMetadata: extBool("GenerateAllOptionSetLabelMetadata", d.generateAllOptionSetLabelMetadata),
            generateAnonymousTypeConstructor: extBool("GenerateAnonymousTypeConstructor", d.generateAnonymousTypeConstructor),
            generateAttributeNameConsts: extBool("GenerateAttributeNameConsts", d.generateAttributeNameConsts),
            generateConstructorsSansLogicalName: extBool("GenerateConstructorsSansLogicalName", d.generateConstructorsSansLogicalName),
            generateEntityRelationships: extBool("GenerateEntityRelationships", d.generateEntityRelationships),
            generateEnumProperties: extBool("GenerateEnumProperties", d.generateEnumProperties),
            generateGlobalOptionSets: extBool("GenerateGlobalOptionSets", d.generateGlobalOptionSets),
            generateINotifyPattern: extBool("GenerateINotifyPattern", d.generateINotifyPattern),
            generateOptionSetMetadataAttribute: extBool("GenerateOptionSetMetadataAttribute", d.generateOptionSetMetadataAttribute),
            generateTypesAsInternal: extBool("GenerateTypesAsInternal", d.generateTypesAsInternal),
            groupLocalOptionSetsByEntity: extBool("GroupLocalOptionSetsByEntity", d.groupLocalOptionSetsByEntity),
            groupMessageRequestWithResponse: extBool("GroupMessageRequestWithResponse", d.groupMessageRequestWithResponse),
            invalidCSharpNamePrefix: extStr("InvalidCSharpNamePrefix", d.invalidCSharpNamePrefix),
            localOptionSetFormat: extStr("LocalOptionSetFormat", d.localOptionSetFormat),
            makeAllFieldsEditable: extBool("MakeAllFieldsEditable", d.makeAllFieldsEditable),
            makeReferenceTypesNullable: extBool("MakeReferenceTypesNullable", d.makeReferenceTypesNullable),
            makeReadonlyFieldsEditable: extBool("MakeReadonlyFieldsEditable", d.makeReadonlyFieldsEditable),
            makeResponseMessagesEditable: extBool("MakeResponseActionsEditable", d.makeResponseMessagesEditable),
            messagePrefixesWhitelist: extList("ActionPrefixesWhitelist", d.messagePrefixesWhitelist),
            messagesToSkip: extList("ActionsToSkip", d.messagesToSkip),
            messagesWhitelist: extList("ActionsWhitelist", d.messagesWhitelist),
            modelBuilderLogLevel: extStr("ModelBuilderLogLevel", d.modelBuilderLogLevel),
            obsoleteDeprecated: extBool("ObsoleteDeprecated", d.obsoleteDeprecated),
            obsoleteTokens: extList("ObsoleteTokens", d.obsoleteTokens),
            optionNameOverrides: ext ? getRecord(ext, "OptionNameOverrides") : d.optionNameOverrides,
            optionSetLanguageCodeOverride: ext ? getNullableInt(ext, "OptionSetLanguageCodeOverride") : d.optionSetLanguageCodeOverride,
            optionSetNames: ext ? getRecord(ext, "OptionSetNames") : d.optionSetNames,
            outputRelativeDirectory: extStr("OutputRelativeDirectory", d.outputRelativeDirectory),
            projectNameForEarlyBoundFiles: extStr("ProjectNameForEarlyBoundFiles", d.projectNameForEarlyBoundFiles),
            propertyEnumMappings: extList("PropertyEnumMappings", d.propertyEnumMappings),
            readSerializedMetadata: extBool("ReadSerializedMetadata", d.readSerializedMetadata),
            removeRuntimeVersionComment: extBool("RemoveRuntimeVersionComment", d.removeRuntimeVersionComment),
            replaceOptionSetPropertiesWithEnum: extBool("ReplaceOptionSetPropertiesWithEnum", d.replaceOptionSetPropertiesWithEnum),
            serializeMetadata: extBool("SerializeMetadata", d.serializeMetadata),
            suppressAutogeneratedFileHeaderComment: extBool("SuppressAutogeneratedFileHeaderComment", d.suppressAutogeneratedFileHeaderComment),
            tokenCapitalizationOverrides: extList("TokenCapitalizationOverrides", d.tokenCapitalizationOverrides),
            transliterationRelativePath: extStr("TransliterationRelativePath", d.transliterationRelativePath),
            useCrmSvcUtilStateEnumNamingConvention: extBool("UseCrmSvcUtilStateEnumNamingConvention", d.useCrmSvcUtilStateEnumNamingConvention),
            useDisplayNameForBpfName: extBool("UseDisplayNameForBpfName", d.useDisplayNameForBpfName),
            useEnumForStateCodes: extBool("UseEnumForStateCodes", d.useEnumForStateCodes),
            useLogicalNames: extBool("UseLogicalNames", d.useLogicalNames),
            waitForAttachedDebugger: extBool("WaitForAttachedDebugger", d.waitForAttachedDebugger),
        },
    };
}
