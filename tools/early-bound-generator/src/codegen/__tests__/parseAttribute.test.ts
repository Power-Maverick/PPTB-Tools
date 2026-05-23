import { describe, it, expect } from "vitest";
import { parseAttribute } from "../orchestrator";

function makeRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        LogicalName: "name",
        SchemaName: "Name",
        DisplayName: { LocalizedLabels: [{ Label: "Name", LanguageCode: 1033 }] },
        Description: { LocalizedLabels: [] },
        AttributeType: "String",
        AttributeTypeName: { Value: "StringType" },
        IsValidForCreate: true,
        IsValidForUpdate: true,
        IsValidForRead: true,
        IsPrimaryId: false,
        IsPrimaryName: true,
        IsRenameable: { Value: true },
        Targets: undefined,
        DeprecatedVersion: null,
        ...overrides,
    };
}

describe("parseAttribute", () => {
    it("maps DeprecatedVersion when present", () => {
        const attr = parseAttribute(makeRaw({ DeprecatedVersion: "7.0.0.0" }));
        expect(attr.DeprecatedVersion).toBe("7.0.0.0");
    });

    it("maps DeprecatedVersion as null when explicitly null", () => {
        const attr = parseAttribute(makeRaw({ DeprecatedVersion: null }));
        expect(attr.DeprecatedVersion).toBeNull();
    });

    it("maps DeprecatedVersion as undefined when absent from raw response", () => {
        const raw = makeRaw();
        delete raw["DeprecatedVersion"];
        const attr = parseAttribute(raw);
        expect(attr.DeprecatedVersion).toBeUndefined();
    });

    it("maps core scalar fields correctly", () => {
        const attr = parseAttribute(makeRaw());
        expect(attr.LogicalName).toBe("name");
        expect(attr.SchemaName).toBe("Name");
        expect(attr.AttributeType).toBe("String");
        expect(attr.IsPrimaryId).toBe(false);
        expect(attr.IsPrimaryName).toBe(true);
        expect(attr.IsValidForCreate).toBe(true);
        expect(attr.IsValidForUpdate).toBe(true);
        expect(attr.IsValidForRead).toBe(true);
    });
});
