import { describe, it, expect } from "vitest";
import { generateEntityFile } from "../entityGenerator";
import { makeSettings, TEST_VERSION } from "./helpers/settings";
import { buildNamingService, buildFilterService } from "./helpers/naming";
import { contactEntity, systemUserEntity } from "./fixtures/contact";
import type { EntityMetadata } from "../types";

function makeEntitiesMap(...entities: EntityMetadata[]): Map<string, EntityMetadata> {
    return new Map(entities.map((e) => [e.LogicalName.toLowerCase(), e]));
}

describe("entityGenerator", () => {
    it("generates Contact with default settings", () => {
        const settings = makeSettings();
        const naming = buildNamingService(settings);
        const filter = buildFilterService(settings);
        const allEntities = makeEntitiesMap(contactEntity, systemUserEntity);

        const output = generateEntityFile(contactEntity, allEntities, {
            settings,
            namingService: naming,
            filterService: filter,
            suppressGeneratedCode: settings.suppressGeneratedCodeAttribute,
            appVersion: TEST_VERSION,
        });

        expect(output).toMatchSnapshot();
    });

    it("generates Contact with suppressGeneratedCodeAttribute = false", () => {
        const settings = makeSettings({ suppressGeneratedCodeAttribute: false });
        const naming = buildNamingService(settings);
        const filter = buildFilterService(settings);
        const allEntities = makeEntitiesMap(contactEntity, systemUserEntity);

        const output = generateEntityFile(contactEntity, allEntities, {
            settings,
            namingService: naming,
            filterService: filter,
            suppressGeneratedCode: false,
            appVersion: TEST_VERSION,
        });

        expect(output).toMatchSnapshot();
    });

    it("generates Contact without relationships", () => {
        const settings = makeSettings({ generateEntityRelationships: false });
        const naming = buildNamingService(settings);
        const filter = buildFilterService(settings);
        const allEntities = makeEntitiesMap(contactEntity, systemUserEntity);

        const output = generateEntityFile(contactEntity, allEntities, {
            settings,
            namingService: naming,
            filterService: filter,
            suppressGeneratedCode: settings.suppressGeneratedCodeAttribute,
            appVersion: TEST_VERSION,
        });

        expect(output).toMatchSnapshot();
    });

    it("generates Contact without attribute name consts", () => {
        const settings = makeSettings({ generateAttributeNameConsts: false });
        const naming = buildNamingService(settings);
        const filter = buildFilterService(settings);
        const allEntities = makeEntitiesMap(contactEntity, systemUserEntity);

        const output = generateEntityFile(contactEntity, allEntities, {
            settings,
            namingService: naming,
            filterService: filter,
            suppressGeneratedCode: settings.suppressGeneratedCodeAttribute,
            appVersion: TEST_VERSION,
        });

        expect(output).toMatchSnapshot();
    });

    it("generates Contact without enum properties (Picklist falls back to OptionSetValue)", () => {
        const settings = makeSettings({ generateEnumProperties: false });
        const naming = buildNamingService(settings);
        const filter = buildFilterService(settings);
        const allEntities = makeEntitiesMap(contactEntity, systemUserEntity);

        const output = generateEntityFile(contactEntity, allEntities, {
            settings,
            namingService: naming,
            filterService: filter,
            suppressGeneratedCode: settings.suppressGeneratedCodeAttribute,
            appVersion: TEST_VERSION,
        });

        expect(output).toMatchSnapshot();
    });

    it("generates Contact with a custom namespace", () => {
        const settings = makeSettings({ namespace: "RWWA.CrmBridge.CrmSdk" });
        const naming = buildNamingService(settings);
        const filter = buildFilterService(settings);
        const allEntities = makeEntitiesMap(contactEntity, systemUserEntity);

        const output = generateEntityFile(contactEntity, allEntities, {
            settings,
            namingService: naming,
            filterService: filter,
            suppressGeneratedCode: settings.suppressGeneratedCodeAttribute,
            appVersion: TEST_VERSION,
        });

        expect(output).toMatchSnapshot();
    });

    it("generates Contact with entity class name override", () => {
        const settings = makeSettings({ entityClassNameOverrides: { contact: "ContactRecord" } });
        const naming = buildNamingService(settings);
        const filter = buildFilterService(settings);
        const allEntities = makeEntitiesMap(contactEntity, systemUserEntity);

        const output = generateEntityFile(contactEntity, allEntities, {
            settings,
            namingService: naming,
            filterService: filter,
            suppressGeneratedCode: settings.suppressGeneratedCodeAttribute,
            appVersion: TEST_VERSION,
        });

        expect(output).toMatchSnapshot();
    });

    it("output contains EntityLogicalName constant", () => {
        const settings = makeSettings();
        const naming = buildNamingService(settings);
        const filter = buildFilterService(settings);
        const allEntities = makeEntitiesMap(contactEntity);

        const output = generateEntityFile(contactEntity, allEntities, {
            settings,
            namingService: naming,
            filterService: filter,
            suppressGeneratedCode: settings.suppressGeneratedCodeAttribute,
            appVersion: TEST_VERSION,
        });

        expect(output).toContain('public const string EntityLogicalName = "contact"');
    });

    it("output contains primary ID override for base.Id", () => {
        const settings = makeSettings();
        const naming = buildNamingService(settings);
        const filter = buildFilterService(settings);
        const allEntities = makeEntitiesMap(contactEntity);

        const output = generateEntityFile(contactEntity, allEntities, {
            settings,
            namingService: naming,
            filterService: filter,
            suppressGeneratedCode: settings.suppressGeneratedCodeAttribute,
            appVersion: TEST_VERSION,
        });

        expect(output).toContain("base.Id = value.Value;");
    });
});
