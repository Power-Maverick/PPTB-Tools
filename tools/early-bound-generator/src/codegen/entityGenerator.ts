import type { EbgSettings } from "../models/interfaces";
import type { EntityMetadata, AttributeMetadata } from "./types";
import { CODEGEN_TOOL_NAME } from "./types";
import { NamingService, getLocalOrDefaultText } from "./naming";
import type { FilterService } from "./filters";
import { T, T2, T3, T4, T5, escapeXmlComment, generateSummary, isObsolete, codeFileHeader } from "./helpers";

function getCSharpType(attr: AttributeMetadata): { csType: string; nullable: boolean; isEnum: boolean } {
    const t = attr.AttributeType;

    const typeName = attr.AttributeTypeName?.Value;
    if (typeName === "ImageType") return { csType: "byte[]", nullable: true, isEnum: false };
    if (typeName === "FileType") return { csType: "byte[]", nullable: true, isEnum: false };
    switch (t) {
        case "String":
        case "Memo":
        case "EntityName":
            return { csType: "string", nullable: true, isEnum: false };
        case "Integer":
        case "Virtual":
            return { csType: "System.Nullable<int>", nullable: false, isEnum: false };
        case "BigInt":
            return { csType: "System.Nullable<long>", nullable: false, isEnum: false };
        case "Double":
            return { csType: "System.Nullable<double>", nullable: false, isEnum: false };
        case "Decimal":
            return { csType: "System.Nullable<decimal>", nullable: false, isEnum: false };
        case "Money":
            return { csType: "Microsoft.Xrm.Sdk.Money", nullable: true, isEnum: false };
        case "Boolean":
            return { csType: "System.Nullable<bool>", nullable: false, isEnum: false };
        case "DateTime":
            return { csType: "System.Nullable<System.DateTime>", nullable: false, isEnum: false };
        case "Lookup":
        case "Customer":
        case "Owner":
            return { csType: "Microsoft.Xrm.Sdk.EntityReference", nullable: true, isEnum: false };
        case "Uniqueidentifier":
            return { csType: "System.Nullable<System.Guid>", nullable: false, isEnum: false };
        case "Picklist":
        case "Status":
        case "State":
            return { csType: "", nullable: false, isEnum: true };
        case "MultiSelectPicklist":
            return { csType: "Microsoft.Xrm.Sdk.OptionSetValueCollection", nullable: true, isEnum: false };
        case "Image":
        case "File":
            return { csType: "byte[]", nullable: true, isEnum: false };
        case "PartyList":
            return { csType: "System.Collections.Generic.IEnumerable<Microsoft.Xrm.Sdk.Entity>", nullable: true, isEnum: false };
        case "CalendarRules":
            return { csType: "System.Collections.Generic.IEnumerable<Microsoft.Xrm.Sdk.Entity>", nullable: true, isEnum: false };
        case "ManagedProperty":
            return { csType: "Microsoft.Xrm.Sdk.BooleanManagedProperty", nullable: true, isEnum: false };
        default:
            return { csType: "object", nullable: true, isEnum: false };
    }
}

const READONLY_FIELDS_EDITABLE_ATTRS = new Set(["createdby", "createdon", "modifiedby", "modifiedon", "owningbusinessunit", "owningteam", "owninguser"]);

function isReadOnly(attr: AttributeMetadata, settings: EbgSettings): boolean {
    if (settings.makeAllFieldsEditable) return false;

    if (settings.makeReadonlyFieldsEditable && READONLY_FIELDS_EDITABLE_ATTRS.has(attr.LogicalName)) return false;

    const canCreate = attr.IsValidForCreate !== false;
    const canUpdate = attr.IsValidForUpdate !== false;
    return !canCreate && !canUpdate;
}

function isPrimaryId(attr: AttributeMetadata): boolean {
    return attr.IsPrimaryId === true;
}

export interface EntityGeneratorOptions {
    settings: EbgSettings;
    namingService: NamingService;
    filterService: FilterService;
    suppressGeneratedCode: boolean;
    appVersion: string;

    legacyHeader?: boolean;
}

export function generateEntityFile(entity: EntityMetadata, allEntities: Map<string, EntityMetadata>, options: EntityGeneratorOptions): string {
    const { settings, namingService, appVersion } = options;
    const className = namingService.getNameForEntity(entity);
    const descriptionText = getLocalOrDefaultText(entity.Description);

    const classSummary = descriptionText || null;

    const lines: string[] = [];

    lines.push(...codeFileHeader(settings.namespace));
    lines.push(`${T}`);
    lines.push(`${T}`);

    if (classSummary) {
        lines.push(`${T}/// <summary>`);
        lines.push(`${T}/// ${escapeXmlComment(classSummary)}`);
        lines.push(`${T}/// </summary>`);
    }

    lines.push(`${T}[System.Runtime.Serialization.DataContractAttribute()]`);
    lines.push(`${T}[Microsoft.Xrm.Sdk.Client.EntityLogicalNameAttribute("${entity.LogicalName}")]`);
    if (!settings.suppressGeneratedCodeAttribute) {
        lines.push(`${T}[System.CodeDom.Compiler.GeneratedCodeAttribute("${CODEGEN_TOOL_NAME}", "${appVersion}")]`);
    }
    lines.push(`${T}public partial class ${className} : Microsoft.Xrm.Sdk.Entity`);
    lines.push(`${T}{`);
    lines.push(`${T2}`);

    lines.push(`${T2}/// <summary>`);
    lines.push(`${T2}/// Default Constructor.`);
    lines.push(`${T2}/// </summary>`);
    lines.push(`${T2}[System.Diagnostics.DebuggerNonUserCode()]`);
    lines.push(`${T2}public ${className}() : `);
    lines.push(`				base(EntityLogicalName)`);
    lines.push(`${T2}{`);
    lines.push(`${T2}}`);
    lines.push(`${T2}`);
    lines.push(`${T2}[System.Diagnostics.DebuggerNonUserCode()]`);
    lines.push(`${T2}public ${className}(System.Guid id) : `);
    lines.push(`				base(EntityLogicalName, id)`);
    lines.push(`${T2}{`);
    lines.push(`${T2}}`);
    lines.push(`${T2}`);
    lines.push(`${T2}[System.Diagnostics.DebuggerNonUserCode()]`);
    lines.push(`${T2}public ${className}(string keyName, object keyValue) : `);
    lines.push(`				base(EntityLogicalName, keyName, keyValue)`);
    lines.push(`${T2}{`);
    lines.push(`${T2}}`);
    lines.push(`${T2}`);
    lines.push(`${T2}[System.Diagnostics.DebuggerNonUserCode()]`);
    lines.push(`${T2}public ${className}(Microsoft.Xrm.Sdk.KeyAttributeCollection keyAttributes) : `);
    lines.push(`				base(EntityLogicalName, keyAttributes)`);
    lines.push(`${T2}{`);
    lines.push(`${T2}}`);
    lines.push(`${T2}`);

    if (entity.Keys && entity.Keys.length > 0) {
        const altKeyValue = entity.Keys.map((k) => [...k.KeyAttributes].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join(","))
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
            .join("|");
        lines.push(`${T2}public const string AlternateKeys = "${altKeyValue}";`);
        lines.push(`${T2}`);
    }
    lines.push(`${T2}public const string EntityLogicalName = "${entity.LogicalName}";`);
    lines.push(`${T2}`);
    if (entity.PrimaryIdAttribute) {
        lines.push(`${T2}public const string PrimaryIdAttribute = "${entity.PrimaryIdAttribute}";`);
        lines.push(`${T2}`);
    }
    if (entity.PrimaryNameAttribute) {
        lines.push(`${T2}public const string PrimaryNameAttribute = "${entity.PrimaryNameAttribute}";`);
        lines.push(`${T2}`);
    }
    lines.push(`${T2}public const string EntitySchemaName = "${entity.SchemaName}";`);
    lines.push(`${T2}`);
    if (entity.LogicalCollectionName) {
        lines.push(`${T2}public const string EntityLogicalCollectionName = "${entity.LogicalCollectionName}";`);
        lines.push(`${T2}`);
    }
    if (entity.EntitySetName) {
        lines.push(`${T2}public const string EntitySetName = "${entity.EntitySetName}";`);
        lines.push(`${T2}`);
    }

    if (settings.generateAttributeNameConsts) {
        const fieldsBlock = generateFieldsClass(entity, namingService);
        if (fieldsBlock) {
            lines.push(fieldsBlock);
            lines.push(`${T2}`);
        }
    }

    if (settings.generateEntityRelationships) {
        const relBlock = generateRelationshipsClass(entity, namingService);
        if (relBlock) {
            lines.push(relBlock);
            lines.push(`${T2}`);
        }
    }

    const attrs = (entity.Attributes ?? []).filter((a) => options.filterService.shouldGenerateAttribute(entity, a));
    for (const attr of attrs) {
        const propLines = generatePropertyBlock(entity, attr, allEntities, namingService, settings);
        if (propLines) {
            lines.push(propLines);
            lines.push(`${T2}`);
        }
    }

    if (settings.generateEntityRelationships) {
        const relProps = generateRelationshipProperties(entity, allEntities, namingService);
        for (const rp of relProps) {
            lines.push(rp);
            lines.push(`${T2}`);
        }
    }

    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
    }

    lines.push(`${T}}`);
    lines.push("}");
    lines.push("#pragma warning restore CS1591");

    return lines.join("\n") + "\n";
}

function generateFieldsClass(entity: EntityMetadata, namingService: NamingService): string | null {
    const entries: Array<[string, string]> = [];

    for (const attr of entity.Attributes ?? []) {
        const propName = namingService.getNameForAttribute(entity, attr);
        entries.push([propName, attr.LogicalName]);
    }

    if (entity.PrimaryIdAttribute) {
        entries.push(["Id", entity.PrimaryIdAttribute]);
    }

    if (!entries.length) return null;

    entries.sort((a, b) => a[0].localeCompare(b[0]));

    const innerLines: string[] = [];
    for (const [name, logical] of entries) {
        innerLines.push(`${T3}public const string ${name} = "${logical}";`);
    }

    const lines: string[] = [];
    lines.push(`${T2}public static partial class Fields`);
    lines.push(`${T2}{`);
    lines.push(...innerLines);
    lines.push(`${T2}}`);
    return lines.join("\n");
}

function generateRelationshipsClass(entity: EntityMetadata, _namingService: NamingService): string | null {
    const entries: Array<[string, string]> = [];

    for (const rel of entity.OneToManyRelationships ?? []) {
        const propName = rel.ReferencedEntityNavigationPropertyName ?? rel.SchemaName;
        entries.push([propName, rel.SchemaName]);
    }
    for (const rel of entity.ManyToOneRelationships ?? []) {
        const propName = rel.ReferencingEntityNavigationPropertyName ?? rel.SchemaName;
        entries.push([propName, rel.SchemaName]);
    }
    for (const rel of entity.ManyToManyRelationships ?? []) {
        const propName = rel.Entity1NavigationPropertyName ?? rel.SchemaName;
        entries.push([propName, rel.SchemaName]);
    }

    if (!entries.length) return null;

    entries.sort((a, b) => a[0].localeCompare(b[0]));

    const lines: string[] = [];
    lines.push(`${T2}public static partial class Relationships`);
    lines.push(`${T2}{`);
    for (const [name, schema] of entries) {
        lines.push(`${T3}public const string ${name} = "${schema}";`);
    }
    lines.push(`${T2}}`);
    return lines.join("\n");
}

function generatePropertyBlock(entity: EntityMetadata, attr: AttributeMetadata, _allEntities: Map<string, EntityMetadata>, namingService: NamingService, settings: EbgSettings): string | null {
    if (attr.IsValidForRead === false && attr.IsValidForCreate === false && attr.IsValidForUpdate === false) {
        return null;
    }

    const isEntityName = attr.AttributeType === "EntityName" || attr.AttributeTypeName?.Value === "EntityNameType" || attr.AttributeTypeName?.Value === "EntityName";
    if (isEntityName && attr.AttributeOf != null) {
        return null;
    }

    const propName = namingService.getNameForAttribute(entity, attr);
    const summary = getLocalOrDefaultText(attr.Description);
    const logicalName = attr.LogicalName;
    const readonly_ = isReadOnly(attr, settings);
    const isPrimId = isPrimaryId(attr);
    const typeInfo = getCSharpType(attr);

    const lines: string[] = [];

    const typeName = attr.AttributeTypeName?.Value;
    const isImageOrFile = typeName === "ImageType" || typeName === "FileType";
    const isNameAttr =
        !isImageOrFile &&
        settings.emitVirtualAttributes &&
        attr.AttributeOf != null &&
        (attr.AttributeType === "Virtual" || (attr.AttributeType === "String" && attr.LogicalName.endsWith("name"))) &&
        attr.LogicalName.length > 4;
    if (isNameAttr) {
        const parentLogical = attr.AttributeOf;
        if (summary) {
            lines.push(generateSummary(summary, T2).trimEnd());
        }
        lines.push(`${T2}[Microsoft.Xrm.Sdk.AttributeLogicalNameAttribute("${logicalName}")]`);
        if (settings.obsoleteDeprecated && (attr.DeprecatedVersion != null || isObsolete(getLocalOrDefaultText(attr.DisplayName), settings.obsoleteTokens))) {
            lines.push(`${T2}[System.ObsoleteAttribute()]`);
        }
        lines.push(`${T2}public string? ${propName}`);
        lines.push(`${T2}{`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}get`);
        lines.push(`${T3}{`);
        lines.push(`${T4}if (this.FormattedValues.Contains("${parentLogical}"))`);
        lines.push(`${T4}{`);
        lines.push(`${T5}return this.FormattedValues["${parentLogical}"];`);
        lines.push(`${T4}}`);
        lines.push(`${T4}else`);
        lines.push(`${T4}{`);
        lines.push(`${T5}return default(string);`);
        lines.push(`${T4}}`);
        lines.push(`${T3}}`);

        if (settings.makeAllFieldsEditable) {
            lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
            lines.push(`${T3}set`);
            lines.push(`${T3}{`);
            lines.push(`${T4}this.FormattedValues["${parentLogical}"] = value;`);
            lines.push(`${T3}}`);
        }
        lines.push(`${T2}}`);
        return lines.join("\n");
    }

    const isMultiSelectPicklist = attr.AttributeTypeName?.Value === "MultiSelectPicklistType";
    if (isMultiSelectPicklist && settings.generateEnumProperties && attr.OptionSet) {
        const enumName = namingService.getNameForOptionSet(entity, attr.OptionSet);
        if (summary) {
            lines.push(generateSummary(summary, T2).trimEnd());
        }
        lines.push(`${T2}[Microsoft.Xrm.Sdk.AttributeLogicalNameAttribute("${logicalName}")]`);
        if (settings.obsoleteDeprecated && (attr.DeprecatedVersion != null || isObsolete(getLocalOrDefaultText(attr.DisplayName), settings.obsoleteTokens))) {
            lines.push(`${T2}[System.ObsoleteAttribute()]`);
        }
        lines.push(`${T2}public virtual System.Collections.Generic.IEnumerable<${enumName}> ${propName}`);
        lines.push(`${T2}{`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}get`);
        lines.push(`${T3}{`);
        lines.push(`${T4}return EntityOptionSetEnum.GetMultiEnum<${enumName}>(this, "${logicalName}");`);
        lines.push(`${T3}}`);
        if (!readonly_) {
            lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
            lines.push(`${T3}set`);
            lines.push(`${T3}{`);
            lines.push(`${T4}this.SetAttributeValue("${logicalName}", EntityOptionSetEnum.GetMultiEnum(this, "${logicalName}", value));`);
            lines.push(`${T3}}`);
        }
        lines.push(`${T2}}`);
        return lines.join("\n");
    }

    if (summary) {
        lines.push(generateSummary(summary, T2).trimEnd());
    }

    lines.push(`${T2}[Microsoft.Xrm.Sdk.AttributeLogicalNameAttribute("${logicalName}")]`);
    if (settings.obsoleteDeprecated && (attr.DeprecatedVersion != null || isObsolete(getLocalOrDefaultText(attr.DisplayName), settings.obsoleteTokens))) {
        lines.push(`${T2}[System.ObsoleteAttribute()]`);
    }

    const optionSetExcluded = !settings.emitEntityETC && (attr.LogicalName === "record1objecttypecode" || attr.LogicalName === "record2objecttypecode");

    const effectiveTypeInfo =
        typeInfo.isEnum && optionSetExcluded
            ? { csType: "System.Nullable<int>", nullable: false, isEnum: false }
            : typeInfo.isEnum && !settings.generateEnumProperties
              ? { csType: "Microsoft.Xrm.Sdk.OptionSetValue", nullable: true, isEnum: false }
              : typeInfo;

    if (effectiveTypeInfo.isEnum && settings.generateEnumProperties) {
        if (settings.useEnumForStateCodes && logicalName === "statecode") {
            const entityStateType = "Microsoft.Xrm.Sdk.EntityState";
            lines.push(`${T2}public virtual ${entityStateType}? ${propName}`);
            lines.push(`${T2}{`);
            lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
            lines.push(`${T3}get`);
            lines.push(`${T3}{`);
            lines.push(`${T4}return ((${entityStateType}?)(EntityOptionSetEnum.GetEnum(this, "${logicalName}")));`);
            lines.push(`${T3}}`);
            if (!readonly_) {
                lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
                lines.push(`${T3}set`);
                lines.push(`${T3}{`);
                lines.push(`${T4}this.SetAttributeValue("${logicalName}", value.HasValue ? new Microsoft.Xrm.Sdk.OptionSetValue((int)value) : null);`);
                lines.push(`${T3}}`);
            }
            lines.push(`${T2}}`);
            return lines.join("\n");
        }

        const optionSet = attr.OptionSet;
        const enumName = optionSet ? namingService.getNameForOptionSet(entity, optionSet) : propName + "Enum";

        if (!settings.replaceOptionSetPropertiesWithEnum) {
            const optionSetValueLines: string[] = [];
            optionSetValueLines.push(`${T2}public virtual Microsoft.Xrm.Sdk.OptionSetValue? ${propName}`);
            optionSetValueLines.push(`${T2}{`);
            optionSetValueLines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
            optionSetValueLines.push(`${T3}get`);
            optionSetValueLines.push(`${T3}{`);
            optionSetValueLines.push(`${T4}return this.GetAttributeValue<Microsoft.Xrm.Sdk.OptionSetValue>("${logicalName}");`);
            optionSetValueLines.push(`${T3}}`);
            if (!readonly_) {
                optionSetValueLines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
                optionSetValueLines.push(`${T3}set`);
                optionSetValueLines.push(`${T3}{`);
                optionSetValueLines.push(`${T4}this.SetAttributeValue("${logicalName}", value);`);
                optionSetValueLines.push(`${T3}}`);
            }
            optionSetValueLines.push(`${T2}}`);
            lines.push(...optionSetValueLines);
            lines.push(`${T2}`);

            lines.push(`${T2}[Microsoft.Xrm.Sdk.AttributeLogicalNameAttribute("${logicalName}")]`);
            if (settings.obsoleteDeprecated && (attr.DeprecatedVersion != null || isObsolete(getLocalOrDefaultText(attr.DisplayName), settings.obsoleteTokens))) {
                lines.push(`${T2}[System.ObsoleteAttribute()]`);
            }
            lines.push(`${T2}public virtual ${enumName}? ${propName}Enum`);
            lines.push(`${T2}{`);
            lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
            lines.push(`${T3}get`);
            lines.push(`${T3}{`);
            lines.push(`${T4}return ((${enumName}?)(EntityOptionSetEnum.GetEnum(this, "${logicalName}")));`);
            lines.push(`${T3}}`);
            if (!readonly_) {
                lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
                lines.push(`${T3}set`);
                lines.push(`${T3}{`);
                lines.push(`${T4}this.SetAttributeValue("${logicalName}", value.HasValue ? new Microsoft.Xrm.Sdk.OptionSetValue((int)value) : null);`);
                lines.push(`${T3}}`);
            }
            lines.push(`${T2}}`);
            return lines.join("\n");
        }

        lines.push(`${T2}public virtual ${enumName}? ${propName}`);
        lines.push(`${T2}{`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}get`);
        lines.push(`${T3}{`);
        lines.push(`${T4}return ((${enumName}?)(EntityOptionSetEnum.GetEnum(this, "${logicalName}")));`);
        lines.push(`${T3}}`);
        if (!readonly_) {
            lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
            lines.push(`${T3}set`);
            lines.push(`${T3}{`);
            lines.push(`${T4}this.SetAttributeValue("${logicalName}", value.HasValue ? new Microsoft.Xrm.Sdk.OptionSetValue((int)value) : null);`);
            lines.push(`${T3}}`);
        }
        lines.push(`${T2}}`);
        return lines.join("\n");
    }

    if (isPrimId) {
        lines.push(`${T2}public System.Nullable<System.Guid> ${propName}`);
        lines.push(`${T2}{`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}get`);
        lines.push(`${T3}{`);
        lines.push(`${T4}return this.GetAttributeValue<System.Nullable<System.Guid>>("${logicalName}");`);
        lines.push(`${T3}}`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}set`);
        lines.push(`${T3}{`);
        lines.push(`${T4}this.SetAttributeValue("${logicalName}", value);`);
        lines.push(`${T4}if (value.HasValue)`);
        lines.push(`${T4}{`);
        lines.push(`${T5}base.Id = value.Value;`);
        lines.push(`${T4}}`);
        lines.push(`${T4}else`);
        lines.push(`${T4}{`);
        lines.push(`${T5}base.Id = System.Guid.Empty;`);
        lines.push(`${T4}}`);
        lines.push(`${T3}}`);
        lines.push(`${T2}}`);
        lines.push(`${T2}`);

        lines.push(`${T2}[Microsoft.Xrm.Sdk.AttributeLogicalNameAttribute("${logicalName}")]`);
        lines.push(`${T2}public override System.Guid Id`);
        lines.push(`${T2}{`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}get`);
        lines.push(`${T3}{`);
        lines.push(`${T4}return base.Id;`);
        lines.push(`${T3}}`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}set`);
        lines.push(`${T3}{`);
        lines.push(`${T4}this.${propName} = value;`);
        lines.push(`${T3}}`);
        lines.push(`${T2}}`);
        return lines.join("\n");
    }

    const csTypeRaw = effectiveTypeInfo.csType;
    const csType = effectiveTypeInfo.nullable ? `${csTypeRaw}?` : csTypeRaw;

    lines.push(`${T2}public ${optionSetExcluded ? "virtual " : ""}${csType} ${propName}`);
    lines.push(`${T2}{`);
    lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
    lines.push(`${T3}get`);
    lines.push(`${T3}{`);
    if (optionSetExcluded) {
        lines.push(`${T4}Microsoft.Xrm.Sdk.OptionSetValue value = this.GetAttributeValue<Microsoft.Xrm.Sdk.OptionSetValue>("${logicalName}");`);
        lines.push(`${T4}if ((value != null))`);
        lines.push(`${T4}{`);
        lines.push(`${T5}return value.Value;`);
        lines.push(`${T4}}`);
        lines.push(`${T4}return null;`);
    } else {
        lines.push(`${T4}return this.GetAttributeValue<${csTypeRaw}>("${logicalName}");`);
    }
    lines.push(`${T3}}`);

    if (!readonly_) {
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}set`);
        lines.push(`${T3}{`);
        lines.push(`${T4}this.SetAttributeValue("${logicalName}", value);`);
        lines.push(`${T3}}`);
    }

    lines.push(`${T2}}`);
    return lines.join("\n");
}

function generateRelationshipProperties(entity: EntityMetadata, allEntities: Map<string, EntityMetadata>, namingService: NamingService): string[] {
    const result: string[] = [];

    for (const rel of entity.OneToManyRelationships ?? []) {
        const targetEntityName = rel.ReferencingEntity
            ? allEntities.get(rel.ReferencingEntity?.toLowerCase())
                ? namingService.getNameForEntity(allEntities.get(rel.ReferencingEntity.toLowerCase())!)
                : rel.ReferencingEntity
            : "Microsoft.Xrm.Sdk.Entity";
        const propName = rel.ReferencedEntityNavigationPropertyName ?? rel.SchemaName;
        const lines: string[] = [];
        lines.push(`${T2}/// <summary>`);
        lines.push(`${T2}/// 1:N ${rel.SchemaName}`);
        lines.push(`${T2}/// </summary>`);
        lines.push(`${T2}[Microsoft.Xrm.Sdk.RelationshipSchemaNameAttribute("${rel.SchemaName}")]`);
        lines.push(`${T2}public System.Collections.Generic.IEnumerable<${targetEntityName}>? ${propName}`);
        lines.push(`${T2}{`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}get`);
        lines.push(`${T3}{`);
        lines.push(`${T4}return this.GetRelatedEntities<${targetEntityName}>("${rel.SchemaName}", null);`);
        lines.push(`${T3}}`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}set`);
        lines.push(`${T3}{`);
        lines.push(`${T4}this.OnPropertyChanging("${propName}");`);
        lines.push(`${T4}this.SetRelatedEntities<${targetEntityName}>("${rel.SchemaName}", null, value);`);
        lines.push(`${T4}this.OnPropertyChanged("${propName}");`);
        lines.push(`${T3}}`);
        lines.push(`${T2}}`);
        result.push(lines.join("\n"));
    }

    for (const rel of entity.ManyToOneRelationships ?? []) {
        const targetEntityName = rel.ReferencedEntity
            ? allEntities.get(rel.ReferencedEntity.toLowerCase())
                ? namingService.getNameForEntity(allEntities.get(rel.ReferencedEntity.toLowerCase())!)
                : rel.ReferencedEntity
            : "Microsoft.Xrm.Sdk.Entity";
        const propName = rel.ReferencingEntityNavigationPropertyName ?? rel.SchemaName;
        const lines: string[] = [];
        lines.push(`${T2}/// <summary>`);
        lines.push(`${T2}/// N:1 ${rel.SchemaName}`);
        lines.push(`${T2}/// </summary>`);
        lines.push(`${T2}[Microsoft.Xrm.Sdk.AttributeLogicalNameAttribute("${rel.SchemaName}")]`);
        lines.push(`${T2}[Microsoft.Xrm.Sdk.RelationshipSchemaNameAttribute("${rel.SchemaName}")]`);
        lines.push(`${T2}public ${targetEntityName}? ${propName}`);
        lines.push(`${T2}{`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}get`);
        lines.push(`${T3}{`);
        lines.push(`${T4}return this.GetRelatedEntity<${targetEntityName}>("${rel.SchemaName}", null);`);
        lines.push(`${T3}}`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}set`);
        lines.push(`${T3}{`);
        lines.push(`${T4}this.OnPropertyChanging("${propName}");`);
        lines.push(`${T4}this.SetRelatedEntity<${targetEntityName}>("${rel.SchemaName}", null, value);`);
        lines.push(`${T4}this.OnPropertyChanged("${propName}");`);
        lines.push(`${T3}}`);
        lines.push(`${T2}}`);
        result.push(lines.join("\n"));
    }

    for (const rel of entity.ManyToManyRelationships ?? []) {
        const otherEntityLogical = rel.Entity1LogicalName === entity.LogicalName ? rel.Entity2LogicalName : rel.Entity1LogicalName;
        const targetEntityName =
            otherEntityLogical && allEntities.has(otherEntityLogical.toLowerCase()) ? namingService.getNameForEntity(allEntities.get(otherEntityLogical.toLowerCase())!) : "Microsoft.Xrm.Sdk.Entity";
        const propName = rel.Entity1LogicalName === entity.LogicalName ? (rel.Entity1NavigationPropertyName ?? rel.SchemaName) : (rel.Entity2NavigationPropertyName ?? rel.SchemaName);
        const lines: string[] = [];
        lines.push(`${T2}/// <summary>`);
        lines.push(`${T2}/// N:N ${rel.SchemaName}`);
        lines.push(`${T2}/// </summary>`);
        lines.push(`${T2}[Microsoft.Xrm.Sdk.RelationshipSchemaNameAttribute("${rel.SchemaName}")]`);
        lines.push(`${T2}public System.Collections.Generic.IEnumerable<${targetEntityName}>? ${propName}`);
        lines.push(`${T2}{`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}get`);
        lines.push(`${T3}{`);
        lines.push(`${T4}return this.GetRelatedEntities<${targetEntityName}>("${rel.SchemaName}", null);`);
        lines.push(`${T3}}`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}set`);
        lines.push(`${T3}{`);
        lines.push(`${T4}this.OnPropertyChanging("${propName}");`);
        lines.push(`${T4}this.SetRelatedEntities<${targetEntityName}>("${rel.SchemaName}", null, value);`);
        lines.push(`${T4}this.OnPropertyChanged("${propName}");`);
        lines.push(`${T3}}`);
        lines.push(`${T2}}`);
        result.push(lines.join("\n"));
    }

    return result;
}
