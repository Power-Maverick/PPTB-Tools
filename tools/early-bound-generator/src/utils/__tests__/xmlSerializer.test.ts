// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { settingsToXml, xmlToSettings } from "../xmlSerializer";
import { DEFAULT_SETTINGS } from "../../models/interfaces";

function roundTrip(overrides: Partial<typeof DEFAULT_SETTINGS>) {
    const settings = { ...DEFAULT_SETTINGS, ...overrides };
    const xml = settingsToXml(settings, "0.0.0");
    return xmlToSettings(xml).settings;
}

describe("xmlSerializer — entityClassNameOverrides round-trip", () => {
    it("serialises and deserialises a single override", () => {
        const result = roundTrip({ entityClassNameOverrides: { account: "MyAccount" } });
        expect(result.entityClassNameOverrides).toEqual({ account: "MyAccount" });
    });

    it("serialises and deserialises multiple overrides", () => {
        const input = { account: "MyAccount", contact: "MyContact", queue: "ServiceQueue" };
        const result = roundTrip({ entityClassNameOverrides: input });
        expect(result.entityClassNameOverrides).toEqual(input);
    });

    it("serialises an empty record as empty", () => {
        const result = roundTrip({ entityClassNameOverrides: {} });
        expect(result.entityClassNameOverrides).toEqual({});
    });

    it("produces pipe-delimited key:value format in the XML (ignoring whitespace)", () => {
        const settings = { ...DEFAULT_SETTINGS, entityClassNameOverrides: { account: "MyAccount", contact: "MyContact" } };
        const xml = settingsToXml(settings, "0.0.0");

        const normalised = xml.replace(/\s+/g, " ");
        expect(normalised).toContain("account:MyAccount| contact:MyContact");
    });

    it("does not corrupt other Record fields during the same round-trip", () => {
        const input = {
            entityClassNameOverrides: { account: "MyAccount" },
            optionSetNames: { industry: "IndustryCode" },
            optionNameOverrides: { "100000001": "Active" },
        };
        const result = roundTrip(input);
        expect(result.entityClassNameOverrides).toEqual(input.entityClassNameOverrides);
        expect(result.optionSetNames).toEqual(input.optionSetNames);
        expect(result.optionNameOverrides).toEqual(input.optionNameOverrides);
    });
});

describe("xmlSerializer — entityAttributeSpecifiedNames round-trip", () => {
    it("serialises and deserialises a single entity with one attribute", () => {
        const result = roundTrip({ entityAttributeSpecifiedNames: { account: ["name"] } });
        expect(result.entityAttributeSpecifiedNames).toEqual({ account: ["name"] });
    });

    it("serialises and deserialises a single entity with multiple attributes", () => {
        const result = roundTrip({ entityAttributeSpecifiedNames: { account: ["name", "telephone1", "emailaddress1"] } });
        expect(result.entityAttributeSpecifiedNames).toEqual({ account: ["name", "telephone1", "emailaddress1"] });
    });

    it("serialises and deserialises multiple entities", () => {
        const input = {
            account: ["name", "telephone1"],
            contact: ["fullname", "emailaddress1"],
        };
        const result = roundTrip({ entityAttributeSpecifiedNames: input });
        expect(result.entityAttributeSpecifiedNames).toEqual(input);
    });

    it("serialises an empty record as empty", () => {
        const result = roundTrip({ entityAttributeSpecifiedNames: {} });
        expect(result.entityAttributeSpecifiedNames).toEqual({});
    });

    it("produces entity:attr1,attr2 pipe-delimited format in the XML (ignoring whitespace)", () => {
        const settings = { ...DEFAULT_SETTINGS, entityAttributeSpecifiedNames: { account: ["name", "telephone1"] } };
        const xml = settingsToXml(settings, "0.0.0");
        const normalised = xml.replace(/\s+/g, " ");
        expect(normalised).toContain("account:name,telephone1");
    });

    it("does not corrupt entityClassNameOverrides during the same round-trip", () => {
        const input = {
            entityAttributeSpecifiedNames: { account: ["name", "telephone1"], contact: ["fullname"] },
            entityClassNameOverrides: { account: "MyAccount" },
        };
        const result = roundTrip(input);
        expect(result.entityAttributeSpecifiedNames).toEqual(input.entityAttributeSpecifiedNames);
        expect(result.entityClassNameOverrides).toEqual(input.entityClassNameOverrides);
    });
});

describe("xmlSerializer — optionSetNames round-trip", () => {
    it("serialises and deserialises a single entry", () => {
        const result = roundTrip({ optionSetNames: { account_rating: "AccountRating" } });
        expect(result.optionSetNames).toEqual({ account_rating: "AccountRating" });
    });

    it("serialises and deserialises multiple entries", () => {
        const input = { account_rating: "AccountRating", contact_type: "ContactType" };
        const result = roundTrip({ optionSetNames: input });
        expect(result.optionSetNames).toEqual(input);
    });

    it("serialises an empty record as empty", () => {
        const result = roundTrip({ optionSetNames: {} });
        expect(result.optionSetNames).toEqual({});
    });

    it("produces pipe-delimited key:value format in the XML (ignoring whitespace)", () => {
        const settings = { ...DEFAULT_SETTINGS, optionSetNames: { account_rating: "AccountRating" } };
        const xml = settingsToXml(settings, "0.0.0");
        const normalised = xml.replace(/\s+/g, " ");
        expect(normalised).toContain("account_rating:AccountRating");
    });
});

describe("xmlSerializer — optionNameOverrides round-trip", () => {
    it("serialises and deserialises the default entries", () => {
        const result = roundTrip({ optionNameOverrides: DEFAULT_SETTINGS.optionNameOverrides });
        expect(result.optionNameOverrides).toEqual(DEFAULT_SETTINGS.optionNameOverrides);
    });

    it("serialises and deserialises custom casing overrides", () => {
        const input = { fedex: "FedEx", linkedin: "LinkedIn", notset: "NotSet" };
        const result = roundTrip({ optionNameOverrides: input });
        expect(result.optionNameOverrides).toEqual(input);
    });

    it("serialises an empty record as empty", () => {
        const result = roundTrip({ optionNameOverrides: {} });
        expect(result.optionNameOverrides).toEqual({});
    });

    it("produces pipe-delimited key:value format in the XML (ignoring whitespace)", () => {
        const settings = { ...DEFAULT_SETTINGS, optionNameOverrides: { fedex: "FedEx", linkedin: "LinkedIn" } };
        const xml = settingsToXml(settings, "0.0.0");
        const normalised = xml.replace(/\s+/g, " ");
        expect(normalised).toContain("fedex:FedEx");
        expect(normalised).toContain("linkedin:LinkedIn");
    });

    it("does not corrupt optionSetNames during the same round-trip", () => {
        const input = {
            optionNameOverrides: { fedex: "FedEx" },
            optionSetNames: { account_rating: "AccountRating" },
        };
        const result = roundTrip(input);
        expect(result.optionNameOverrides).toEqual(input.optionNameOverrides);
        expect(result.optionSetNames).toEqual(input.optionSetNames);
    });
});
