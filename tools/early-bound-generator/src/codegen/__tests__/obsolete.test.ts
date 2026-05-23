import { describe, it, expect } from "vitest";
import { generateEntityFile } from "../entityGenerator";
import { makeSettings, TEST_VERSION } from "./helpers/settings";
import { buildNamingService, buildFilterService } from "./helpers/naming";
import type { EntityMetadata } from "../types";

function makeEntitiesMap(...entities: EntityMetadata[]): Map<string, EntityMetadata> {
    return new Map(entities.map((e) => [e.LogicalName.toLowerCase(), e]));
}

const queueLikeEntity: EntityMetadata = {
    LogicalName: "queue",
    SchemaName: "Queue",
    DisplayName: { LocalizedLabels: [{ Label: "Queue", LanguageCode: 1033 }] },
    LogicalCollectionName: "queues",
    EntitySetName: "queues",
    PrimaryIdAttribute: "queueid",
    PrimaryNameAttribute: "name",
    Keys: [],
    Attributes: [
        {
            LogicalName: "queueid",
            SchemaName: "QueueId",
            DisplayName: { LocalizedLabels: [{ Label: "Queue", LanguageCode: 1033 }] },
            AttributeType: "Uniqueidentifier",
            IsPrimaryId: true,
            IsValidForCreate: true,
            IsValidForUpdate: false,
            IsValidForRead: true,
        },
        {
            LogicalName: "name",
            SchemaName: "Name",
            DisplayName: { LocalizedLabels: [{ Label: "Name", LanguageCode: 1033 }] },
            AttributeType: "String",
            IsPrimaryName: true,
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
        },

        {
            LogicalName: "emailaddress",
            SchemaName: "EmailAddress",
            DisplayName: { LocalizedLabels: [{ Label: "Incoming Email", LanguageCode: 1033 }] },
            AttributeType: "String",
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
        },

        {
            LogicalName: "businessunitid",
            SchemaName: "BusinessUnitId",
            DisplayName: { LocalizedLabels: [{ Label: "Business Unit", LanguageCode: 1033 }] },
            AttributeType: "Lookup",
            Targets: ["businessunit"],
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
            DeprecatedVersion: "7.0.0.0",
        },

        {
            LogicalName: "primaryuserid",
            SchemaName: "PrimaryUserId",
            DisplayName: { LocalizedLabels: [{ Label: "Owner (Deprecated)", LanguageCode: 1033 }] },
            AttributeType: "Lookup",
            Targets: ["systemuser"],
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
        },
    ],
    OneToManyRelationships: [],
    ManyToOneRelationships: [],
    ManyToManyRelationships: [],
};

const run = (overrides: Parameters<typeof makeSettings>[0] = {}) => {
    const settings = makeSettings(overrides);
    const naming = buildNamingService(settings);
    const filter = buildFilterService(settings);
    return generateEntityFile(queueLikeEntity, makeEntitiesMap(queueLikeEntity), {
        settings,
        namingService: naming,
        filterService: filter,
        suppressGeneratedCode: settings.suppressGeneratedCodeAttribute,
        appVersion: TEST_VERSION,
    });
};

describe("obsolete attribute handling", () => {
    it("emits [System.ObsoleteAttribute()] for DeprecatedVersion attribute", () => {
        const output = run();
        const marker = '[Microsoft.Xrm.Sdk.AttributeLogicalNameAttribute("businessunitid")]';
        const idx = output.indexOf(marker);
        expect(idx).toBeGreaterThan(-1);
        const snippet = output.slice(idx, idx + 200);
        expect(snippet).toContain("[System.ObsoleteAttribute()]");
    });

    it("emits [System.ObsoleteAttribute()] for display name token match", () => {
        const output = run({ obsoleteTokens: ["*(Deprecated)*"] });
        const marker = '[Microsoft.Xrm.Sdk.AttributeLogicalNameAttribute("primaryuserid")]';
        const idx = output.indexOf(marker);
        expect(idx).toBeGreaterThan(-1);
        const snippet = output.slice(idx, idx + 200);
        expect(snippet).toContain("[System.ObsoleteAttribute()]");
    });

    it("does NOT emit [System.ObsoleteAttribute()] for normal attribute", () => {
        const output = run();
        const marker = '[Microsoft.Xrm.Sdk.AttributeLogicalNameAttribute("emailaddress")]';
        const idx = output.indexOf(marker);
        expect(idx).toBeGreaterThan(-1);
        const snippet = output.slice(idx, idx + 200);
        expect(snippet).not.toContain("[System.ObsoleteAttribute()]");
    });

    it("does NOT emit [System.ObsoleteAttribute()] when obsoleteDeprecated = false", () => {
        const output = run({ obsoleteDeprecated: false });
        expect(output).not.toContain("[System.ObsoleteAttribute()]");
    });

    it("does NOT emit [System.ObsoleteAttribute()] for DeprecatedVersion when obsoleteDeprecated = false", () => {
        const output = run({ obsoleteDeprecated: false });
        const marker = '[Microsoft.Xrm.Sdk.AttributeLogicalNameAttribute("businessunitid")]';
        const idx = output.indexOf(marker);
        expect(idx).toBeGreaterThan(-1);
        const snippet = output.slice(idx, idx + 200);
        expect(snippet).not.toContain("[System.ObsoleteAttribute()]");
    });

    it("matches snapshot with both obsolete types present", () => {
        expect(run()).toMatchSnapshot();
    });
});
