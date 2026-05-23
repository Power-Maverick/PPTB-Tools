import type { EbgSettings } from "../models/interfaces";
import type { EntityMetadata, AttributeMetadata, OptionSetMetadata, OptionMetadata, Label } from "./types";
import { CamelCaser } from "./camelCaser";

function getLocalOrDefaultText(label: Label | undefined, langCode = 1033): string {
    if (!label) return "";
    const match = label.LocalizedLabels?.find((l) => l.LanguageCode === langCode && l.Label);
    if (match) return match.Label;
    return label.LocalizedLabels?.find((l) => l.Label)?.Label ?? label.UserLocalizedLabel?.Label ?? "";
}

function removeInvalidCSharpIdentifierChars(input: string): string {
    let result = "";
    for (const ch of input) {
        const code = ch.charCodeAt(0);
        const isValidPart = (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || ch === "_";
        result += isValidPart ? ch : "_";
    }
    return result;
}

function removeDiacritics(s: string): string {
    return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function titleCase(word: string): string {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

const CASING_BY_GLOBAL_OPTION_SET: Readonly<Record<string, string>> = {
    budgetstatus: "BudgetStatus",
    componentstate: "ComponentState",
    componenttype: "ComponentType",
    connectionrole_category: "ConnectionRole_Category",
    convertrule_channelactivity: "ConvertRule_ChannelActivity",
    dependencytype: "DependencyType",
    emailserverprofile_authenticationprotocol: "EmailServerProfile_AuthenticationProtocol",
    field_security_permission_type: "Field_Security_Permission_Type",
    goal_fiscalperiod: "Goal_FiscalPeriod",
    goal_fiscalyear: "Goal_FiscalYear",
    incident_caseorigincode: "Incident_CaseOriginCode",
    initialcommunication: "InitialCommunication",
    lead_salesstage: "Lead_SalesStage",
    metric_goaltype: "Metric_GoalType",
    need: "Need",
    opportunity_salesstage: "Opportunity_SalesStage",
    principalsyncattributemapping_syncdirection: "PrincipalSyncAttributeMapping_SyncDirection",
    processstage_category: "Processstage_Category",
    purchaseprocess: "PurchaseProcess",
    purchasetimeframe: "PurchaseTimeFrame",
    qooi_pricingerrorcode: "Qooi_PricingErrorCode",
    qooiproduct_producttype: "QooiProduct_ProductType",
    qooiproduct_propertiesconfigurationstatus: "QooiProduct_PropertiesConfigurationStatus",
    recurrencerule_monthofyear: "RecurrenceRule_MonthOfYear",
    servicestage: "ServiceStage",
    sharepoint_validationstatus: "SharePoint_ValidationStatus",
    sharepoint_validationstatusreason: "SharePoint_ValidationStatusReason",
    sharepointdocumentlocation_locationtype: "SharePointDocumentLocation_LocationType",
    socialactivity_postmessagetype: "SocialActivity_PostMessageType",
    socialprofile_community: "SocialProfile_Community",
    syncattributemapping_syncdirection: "SyncAttributeMapping_SyncDirection",
    workflow_runas: "Workflow_RunAs",
    workflow_stage: "Workflow_Stage",
    workflowlog_objecttypecode: "WorkflowLog_ObjectTypeCode",
};

export class NamingService {
    private readonly settings: EbgSettings;
    private readonly caser: CamelCaser;
    private readonly entityNameCache = new Map<string, string>();
    private readonly optionSetNameCache = new Map<string, string>();
    private readonly attributeNameCache = new Map<string, string>();

    private readonly optionDupCache = new Map<string, Map<string, boolean>>();

    constructor(settings: EbgSettings, caser: CamelCaser) {
        this.settings = settings;
        this.caser = caser;
    }

    camelCase(name: string, preferredEndings?: string[]): string {
        if (!name) return name;
        return this.caser.caseWord(name, preferredEndings);
    }

    getNameForEntity(entity: EntityMetadata): string {
        const cached = this.entityNameCache.get(entity.LogicalName);
        if (cached !== undefined) return cached;

        const override = this.settings.entityClassNameOverrides[entity.LogicalName.toLowerCase()];
        const baseName = override ?? (entity.SchemaName || entity.LogicalName);
        let name: string;

        if (!override && this.settings.useDisplayNameForBpfName) {
            const bpfResolved = this.getBpfDisplayName(baseName, entity);
            if (bpfResolved !== baseName) {
                name = this.settings.camelCaseClassNames ? this.camelCase(bpfResolved) : bpfResolved;
                this.entityNameCache.set(entity.LogicalName, name);
                return name;
            }
        }

        if (this.settings.camelCaseClassNames) {
            name = this.camelCase(baseName);
        } else {
            name = baseName;
        }

        this.entityNameCache.set(entity.LogicalName, name);
        return name;
    }

    private getBpfDisplayName(name: string, entity: EntityMetadata): string {
        const parts = name.split("_");
        const bpfIndex = parts.map((p) => p.toLowerCase()).lastIndexOf("bpf");
        if (bpfIndex < 0 || bpfIndex + 1 >= parts.length) return name;
        const id = parts[bpfIndex + 1];

        if (!/^[0-9a-f]{8}[0-9a-f]{4}[0-9a-f]{4}[0-9a-f]{4}[0-9a-f]{12}$/i.test(id)) return name;
        const displayName = getLocalOrDefaultText(entity.DisplayName);
        if (!displayName) return name;
        const validDisplayName = removeInvalidCSharpIdentifierChars(displayName).replace(/_+/g, "");
        const prefix = parts.slice(0, bpfIndex + 1).join("_") + "_";
        const postfix = bpfIndex + 2 < parts.length ? "_" + parts.slice(bpfIndex + 2).join("_") : "";
        return prefix + validDisplayName + postfix;
    }

    getNameForAttribute(entity: EntityMetadata, attr: AttributeMetadata): string {
        const cacheKey = `${entity.LogicalName}.${attr.LogicalName}`;
        const cached = this.attributeNameCache.get(cacheKey);
        if (cached !== undefined) return cached;

        const specifiedNames = this.settings.entityAttributeSpecifiedNames[entity.LogicalName];
        if (specifiedNames) {
            const hit = specifiedNames.find((s) => s.toLowerCase() === attr.LogicalName.toLowerCase());
            if (hit) {
                this.attributeNameCache.set(cacheKey, hit);
                return hit;
            }
        }

        let name: string;
        if (this.settings.useLogicalNames) {
            name = attr.LogicalName;
        } else {
            const base = attr.SchemaName || attr.LogicalName;
            name = this.settings.camelCaseMemberNames ? this.camelCase(base) : base;
        }

        if (name === this.getNameForEntity(entity)) {
            name += "__Member";
        }

        this.attributeNameCache.set(cacheKey, name);
        return name;
    }

    getNameForOptionSet(entity: EntityMetadata | null, optionSet: OptionSetMetadata): string {
        const cacheKey = `${entity?.LogicalName ?? ""}||${optionSet.Name}`;
        const cached = this.optionSetNameCache.get(cacheKey);
        if (cached !== undefined) return cached;

        let name: string;

        if (optionSet.IsGlobal) {
            const camelName = this.settings.camelCaseClassNames ? this.camelCase(optionSet.Name, ["StateCode", "Status", "State"]) : optionSet.Name;

            name = CASING_BY_GLOBAL_OPTION_SET[optionSet.Name.toLowerCase()] ?? camelName;
        } else if (optionSet.OptionSetType === "State" || optionSet.OptionSetType === "Status") {
            if (optionSet.OptionSetType === "Status") {
                const entityName = entity ? this.getNameForEntity(entity) : "Unknown";
                name = this.settings.localOptionSetFormat.replace("{0}", entityName).replace("{1}", "StatusCode");
            } else {
                if (this.settings.useCrmSvcUtilStateEnumNamingConvention && entity) {
                    const hasStateAttr = entity.Attributes?.some((a) => a.AttributeType === "State");
                    if (hasStateAttr && optionSet.Name.toLowerCase().endsWith("_statecode")) {
                        name = this.getNameForEntity(entity) + "State";
                    } else {
                        name = this.settings.camelCaseClassNames ? this.camelCase(optionSet.Name, ["StateCode", "Status", "State"]) : optionSet.Name;
                    }
                } else {
                    name = this.settings.camelCaseClassNames ? this.camelCase(optionSet.Name, ["StateCode", "Status", "State"]) : optionSet.Name;
                }
            }
        } else {
            const entityName = entity ? this.getNameForEntity(entity) : "Unknown";

            const ownerAttr = entity?.Attributes.find((a) => a.AttributeType === "Picklist" && (a.OptionSet?.MetadataId === optionSet.MetadataId || a.OptionSet?.Name === optionSet.Name));

            if (!ownerAttr) {
                name = this.settings.camelCaseClassNames ? this.camelCase(optionSet.Name) : optionSet.Name;
            } else {
                const attrBase = ownerAttr.SchemaName || ownerAttr.LogicalName;
                const attrName = this.settings.camelCaseMemberNames ? this.camelCase(attrBase) : attrBase;
                name = this.settings.localOptionSetFormat.replace("{0}", entityName).replace("{1}", attrName);
            }
        }

        const lowerName = name.toLowerCase();
        const nameOverride = Object.entries(this.settings.optionSetNames).find(([k]) => k.toLowerCase() === lowerName);
        if (nameOverride) name = nameOverride[1];

        this.optionSetNameCache.set(cacheKey, name);
        return name;
    }

    getPossiblyDuplicateNameForOption(_optionSet: OptionSetMetadata, option: OptionMetadata, langCode = 1033): string {
        const rawLabel = getLocalOrDefaultText(option.Label, langCode);
        let name: string;

        if (this.settings.adjustCasingForEnumOptions) {
            name = rawLabel ? removeDiacritics(rawLabel) : "";
            name = this.nameFromLabel(name);
        } else {
            name = rawLabel ? removeDiacritics(rawLabel) : "";
            name = this.validCSharpName(name);
        }

        if (!name) {
            name = `UnknownLabel${option.Value ?? 0}`;
        }

        for (const [key, val] of Object.entries(this.settings.optionNameOverrides)) {
            if (name.toLowerCase().includes(key.toLowerCase())) {
                name = name.replace(new RegExp(key, "gi"), val);
            }
        }

        return this.validCSharpName(name);
    }

    getNameForOption(optionSet: OptionSetMetadata, option: OptionMetadata, langCode = 1033): string {
        const possiblyDupName = this.getPossiblyDuplicateNameForOption(optionSet, option, langCode);
        return this.appendValueForDuplicateOptionSetValueNames(optionSet, possiblyDupName, option.Value ?? 0, langCode);
    }

    private getDuplicateNameMap(optionSet: OptionSetMetadata, langCode: number): Map<string, boolean> {
        const cacheKey = `${optionSet.Name}||${langCode}`;
        const cached = this.optionDupCache.get(cacheKey);
        if (cached) return cached;

        const nameValueDups = new Map<string, boolean>();
        for (const opt of optionSet.Options ?? []) {
            if (opt.Value === null || opt.Value === undefined) continue;
            const name = this.getPossiblyDuplicateNameForOption(optionSet, opt, langCode);
            nameValueDups.set(name, nameValueDups.has(name));

            if (optionSet.OptionSetType === "Status") {
                const stateAppended = name + "_" + (((opt as { State?: number }).State ?? 1) === 0 ? "Active" : "Inactive");
                nameValueDups.set(stateAppended, nameValueDups.has(stateAppended));
            }
        }

        this.optionDupCache.set(cacheKey, nameValueDups);
        return nameValueDups;
    }

    private appendValueForDuplicateOptionSetValueNames(optionSet: OptionSetMetadata, name: string, value: number, langCode: number): string {
        const dupMap = this.getDuplicateNameMap(optionSet, langCode);
        if (!dupMap.get(name)) {
            return name;
        }

        if (optionSet.OptionSetType === "Status") {
            const option = (optionSet.Options ?? []).find((o) => o.Value === value);
            const state = option ? ((option as { State?: number }).State ?? 1) : 1;
            const withState = name + "_" + (state === 0 ? "Active" : "Inactive");
            if (!dupMap.get(withState)) {
                return withState;
            }

            name = withState;
        }

        if (value < 0) {
            return name + "_neg" + Math.abs(value);
        }
        return name + "_" + value;
    }

    private nameFromLabel(label: string): string {
        if (!label) return "";
        label = label.replace(/'s /g, "s ").replace(/'S /g, "S ");
        if (label.toLowerCase().endsWith("'s")) label = label.slice(0, -2) + "s";
        const underscored = removeInvalidCSharpIdentifierChars(label);
        return underscored
            .split("_")
            .filter(Boolean)
            .map((w) => titleCase(w))
            .join("");
    }

    private validCSharpName(name: string): string {
        name = removeInvalidCSharpIdentifierChars(name).replace(/_+/g, "");
        if (name.length > 0 && !/^[a-zA-Z_]/.test(name)) {
            return this.settings.invalidCSharpNamePrefix + name;
        }
        return name || this.settings.invalidCSharpNamePrefix;
    }
}

export { getLocalOrDefaultText };
