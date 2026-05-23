import { describe, it, expect } from "vitest";
import { generateOptionSetsFile, generateEntityOptionSetsFile, generateSingleOptionSetFile, generateEnumDeclaration, collectOptionSets } from "../optionSetGenerator";
import { makeSettings, TEST_VERSION } from "./helpers/settings";
import { buildNamingService, buildFilterService } from "./helpers/naming";
import { contactEntity } from "./fixtures/contact";
import type { OptionSetMetadata } from "../types";

const genderOptionSet: OptionSetMetadata = contactEntity.Attributes.find((a) => a.LogicalName === "gendercode")!.OptionSet!;
const stateOptionSet: OptionSetMetadata = contactEntity.Attributes.find((a) => a.LogicalName === "statecode")!.OptionSet!;
const statusOptionSet: OptionSetMetadata = contactEntity.Attributes.find((a) => a.LogicalName === "statuscode")!.OptionSet!;

const globalOptionSet: OptionSetMetadata = {
    MetadataId: "bbb00001-0000-0000-0000-000000000001",
    Name: "contoso_priority",
    DisplayName: { LocalizedLabels: [{ Label: "Priority", LanguageCode: 1033 }] },
    Description: { LocalizedLabels: [{ Label: "Indicates the priority level.", LanguageCode: 1033 }] },
    OptionSetType: "Picklist",
    IsGlobal: true,
    Options: [
        { Value: 100000000, Label: { LocalizedLabels: [{ Label: "Low", LanguageCode: 1033 }] } },
        { Value: 100000001, Label: { LocalizedLabels: [{ Label: "Medium", LanguageCode: 1033 }] } },
        { Value: 100000002, Label: { LocalizedLabels: [{ Label: "High", LanguageCode: 1033 }] } },
    ],
};

describe("optionSetGenerator", () => {
    describe("generateEnumDeclaration", () => {
        it("generates a local Picklist enum", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateEnumDeclaration(contactEntity, genderOptionSet, naming, settings, TEST_VERSION);

            expect(output).toMatchSnapshot();
        });

        it("generates a State enum", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateEnumDeclaration(contactEntity, stateOptionSet, naming, settings, TEST_VERSION);

            expect(output).toMatchSnapshot();
        });

        it("generates a Status enum", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateEnumDeclaration(contactEntity, statusOptionSet, naming, settings, TEST_VERSION);

            expect(output).toMatchSnapshot();
        });

        it("generates a global option set enum", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateEnumDeclaration(null, globalOptionSet, naming, settings, TEST_VERSION);

            expect(output).toMatchSnapshot();
        });

        it("includes OptionSetMetadataAttribute when generateOptionSetMetadataAttribute = true", () => {
            const settings = makeSettings({ generateOptionSetMetadataAttribute: true });
            const naming = buildNamingService(settings);

            const output = generateEnumDeclaration(contactEntity, genderOptionSet, naming, settings, TEST_VERSION);

            expect(output).toContain("[OptionSetMetadataAttribute(");
        });

        it("omits OptionSetMetadataAttribute when generateOptionSetMetadataAttribute = false", () => {
            const settings = makeSettings({ generateOptionSetMetadataAttribute: false, addOptionSetMetadataAttribute: false });
            const naming = buildNamingService(settings);

            const output = generateEnumDeclaration(contactEntity, genderOptionSet, naming, settings, TEST_VERSION);

            expect(output).not.toContain("[OptionSetMetadataAttribute(");
        });

        it("returns null for an option set with no options", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);
            const emptyOptionSet: OptionSetMetadata = { ...genderOptionSet, Options: [] };

            const output = generateEnumDeclaration(contactEntity, emptyOptionSet, naming, settings, TEST_VERSION);

            expect(output).toBeNull();
        });
    });

    describe("generateOptionSetsFile", () => {
        it("generates a combined OptionSets.cs with multiple enums", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);
            const filter = buildFilterService(settings);
            const collected = collectOptionSets([contactEntity], settings, filter);

            const output = generateOptionSetsFile(collected, naming, settings, TEST_VERSION);

            expect(output).toMatchSnapshot();
        });

        it("includes global option sets in combined file when present", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateOptionSetsFile(
                [
                    { entity: null, optionSet: globalOptionSet },
                    { entity: contactEntity, optionSet: genderOptionSet },
                ],
                naming,
                settings,
                TEST_VERSION,
            );

            expect(output).toMatchSnapshot();
        });
    });

    describe("generateEntityOptionSetsFile", () => {
        it("generates a per-entity option set file", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateEntityOptionSetsFile(contactEntity, [genderOptionSet, stateOptionSet, statusOptionSet], naming, settings, TEST_VERSION);

            expect(output).toMatchSnapshot();
        });
    });

    describe("generateSingleOptionSetFile", () => {
        it("generates a single enum file", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateSingleOptionSetFile(contactEntity, genderOptionSet, naming, settings, TEST_VERSION);

            expect(output).toMatchSnapshot();
        });
    });

    describe("collectOptionSets", () => {
        it("collects local and deduplicates global option sets", () => {
            const settings = makeSettings();
            const filter = buildFilterService(settings);

            const entityWithGlobal = {
                ...contactEntity,
                Attributes: [
                    ...contactEntity.Attributes,
                    {
                        LogicalName: "contoso_priority",
                        SchemaName: "contoso_Priority",
                        DisplayName: { LocalizedLabels: [{ Label: "Priority", LanguageCode: 1033 as const }] },
                        AttributeType: "Picklist" as const,
                        IsValidForCreate: true,
                        IsValidForUpdate: true,
                        IsValidForRead: true,
                        OptionSet: globalOptionSet,
                    },

                    {
                        LogicalName: "contoso_priority2",
                        SchemaName: "contoso_Priority2",
                        DisplayName: { LocalizedLabels: [{ Label: "Priority 2", LanguageCode: 1033 as const }] },
                        AttributeType: "Picklist" as const,
                        IsValidForCreate: true,
                        IsValidForUpdate: true,
                        IsValidForRead: true,
                        OptionSet: globalOptionSet,
                    },
                ],
            };

            const collected = collectOptionSets([entityWithGlobal], settings, filter);
            const globalCount = collected.filter((c) => c.optionSet.IsGlobal).length;

            expect(globalCount).toBe(1);
        });
    });
});
