import type { EbgSettings } from "../models/interfaces";
import type { EntityMetadata, OptionSetMetadata, OptionMetadata } from "./types";
import { CODEGEN_TOOL_NAME } from "./types";
import { NamingService, getLocalOrDefaultText } from "./naming";
import type { FilterService } from "./filters";
import { T, T2, escapeXmlComment, codeFileHeader } from "./helpers";

export function generateEnumDeclaration(
    entity: EntityMetadata | null,
    optionSet: OptionSetMetadata,
    namingService: NamingService,
    settings: EbgSettings,
    appVersion: string,
    langCode = 1033,
): string | null {
    if (!optionSet.Options || optionSet.Options.length === 0) return null;

    const enumName = namingService.getNameForOptionSet(entity, optionSet);

    const description = getLocalOrDefaultText(optionSet.Description, langCode);

    const lines: string[] = [];
    lines.push(`${T}`);

    if (description) {
        lines.push(`${T}/// <summary>`);

        const descLines = description.split(/\r?\n/);
        let isFirst = true;
        for (const dl of descLines) {
            if (dl === "") {
                lines.push(`${T}///`);
            } else if (isFirst) {
                lines.push(`${T}/// ${escapeXmlComment(dl)}`);
            } else {
                lines.push(`${T}///${escapeXmlComment(dl)}`);
            }
            isFirst = false;
        }
        lines.push(`${T}/// </summary>`);
    }

    lines.push(`${T}[System.Runtime.Serialization.DataContractAttribute()]`);
    if (!settings.suppressGeneratedCodeAttribute) {
        lines.push(`${T}[System.CodeDom.Compiler.GeneratedCodeAttribute("${CODEGEN_TOOL_NAME}", "${appVersion}")]`);
    }
    lines.push(`${T}public enum ${enumName}`);
    lines.push(`${T}{`);

    const metadataOrderByValue = new Map<number, number>();
    optionSet.Options.forEach((opt, i) => {
        if (opt.Value !== null && opt.Value !== undefined) {
            metadataOrderByValue.set(opt.Value, i);
        }
    });

    const namedOptions: Array<{ name: string; label: string; value: number; metadataIdx: number; color: string; optionDescription: string }> = [];

    for (const opt of optionSet.Options) {
        if (opt.Value === null || opt.Value === undefined) continue;
        const name = namingService.getNameForOption(optionSet, opt, langCode);

        const labelText = getLocalOrDefaultText(opt.Label, langCode);
        const optionDescription = getLocalOrDefaultText(opt.Description, langCode) ?? "";
        const color = opt.Color ?? "";
        namedOptions.push({
            name,
            label: labelText,
            value: opt.Value,
            metadataIdx: metadataOrderByValue.get(opt.Value) ?? 0,
            color,
            optionDescription,
        });
    }

    namedOptions.sort((a, b) => a.name.localeCompare(b.name));

    for (const opt of namedOptions) {
        lines.push(`${T2}`);

        if (opt.optionDescription) {
            lines.push(`${T2}/// <summary>`);
            lines.push(`${T2}/// ${escapeXmlComment(opt.optionDescription)}`);
            lines.push(`${T2}/// </summary>`);
        }
        lines.push(`${T2}[System.Runtime.Serialization.EnumMemberAttribute()]`);
        if (settings.generateOptionSetMetadataAttribute || settings.addOptionSetMetadataAttribute) {
            const optAttrArgs: string[] = [`"${escapeStringLiteral(opt.label)}"`, `${opt.metadataIdx}`];
            if (opt.color) {
                optAttrArgs.push(`"${escapeStringLiteral(opt.color)}"`);
                if (opt.optionDescription) {
                    optAttrArgs.push(`"${escapeStringLiteral(opt.optionDescription)}"`);
                }
            }
            lines.push(`${T2}[OptionSetMetadataAttribute(${optAttrArgs.join(", ")})]`);
        }
        lines.push(`${T2}${opt.name} = ${opt.value},`);
    }

    lines.push(`${T}}`);
    return lines.join("\n");
}

function escapeStringLiteral(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

export function generateOptionSetsFile(
    entityOptionSets: Array<{ entity: EntityMetadata | null; optionSet: OptionSetMetadata }>,
    namingService: NamingService,
    settings: EbgSettings,
    appVersion: string,
): string {
    const lines = [...codeFileHeader(settings.namespace), `${T}`];

    const sorted = [...entityOptionSets].sort((a, b) => {
        const nameA = namingService.getNameForOptionSet(a.entity, a.optionSet);
        const nameB = namingService.getNameForOptionSet(b.entity, b.optionSet);
        return nameA.localeCompare(nameB);
    });

    for (const { entity, optionSet } of sorted) {
        const enumDecl = generateEnumDeclaration(entity, optionSet, namingService, settings, appVersion);
        if (enumDecl) {
            lines.push(enumDecl);
        }
    }

    lines.push("}");
    lines.push("#pragma warning restore CS1591");
    return lines.join("\n") + "\n";
}

export function generateEntityOptionSetsFile(entity: EntityMetadata, optionSets: OptionSetMetadata[], namingService: NamingService, settings: EbgSettings, appVersion: string): string {
    const lines = [...codeFileHeader(settings.namespace), `${T}`];

    for (const optionSet of optionSets) {
        const enumDecl = generateEnumDeclaration(entity, optionSet, namingService, settings, appVersion);
        if (enumDecl) {
            lines.push(enumDecl);
        }
    }

    lines.push("}");
    lines.push("#pragma warning restore CS1591");
    return lines.join("\n");
}

export function generateSingleOptionSetFile(entity: EntityMetadata | null, optionSet: OptionSetMetadata, namingService: NamingService, settings: EbgSettings, appVersion: string): string {
    const lines = [...codeFileHeader(settings.namespace), `${T}`];
    const enumDecl = generateEnumDeclaration(entity, optionSet, namingService, settings, appVersion);
    if (enumDecl) lines.push(enumDecl);
    lines.push("}");
    lines.push("#pragma warning restore CS1591");
    return lines.join("\n");
}

export function collectOptionSets(entities: EntityMetadata[], settings: EbgSettings, _filterService: FilterService): Array<{ entity: EntityMetadata | null; optionSet: OptionSetMetadata }> {
    const result: Array<{ entity: EntityMetadata | null; optionSet: OptionSetMetadata }> = [];
    const globalSeen = new Set<string>();
    const localSeen = new Set<string>();

    for (const entity of entities) {
        for (const attr of entity.Attributes ?? []) {
            const os = attr.OptionSet;
            if (!os) continue;
            if (attr.AttributeOf) continue;

            if (!settings.emitEntityETC && (attr.LogicalName === "record1objecttypecode" || attr.LogicalName === "record2objecttypecode")) continue;

            if (os.IsGlobal) {
                const key = os.MetadataId ?? os.Name;
                const alreadySeen = globalSeen.has(key);

                if (!alreadySeen) {
                    globalSeen.add(key);
                    result.push({ entity: null, optionSet: os });
                }
            } else {
                const key = `${entity.LogicalName}||${os.Name}`;
                if (!localSeen.has(key)) {
                    localSeen.add(key);
                    result.push({ entity, optionSet: os });
                }
            }
        }
    }

    return result;
}

export type { OptionMetadata, OptionSetMetadata };
