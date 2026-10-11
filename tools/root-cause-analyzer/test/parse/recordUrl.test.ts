import { describe, expect, it } from "vitest";
import { isDifferentEnvironment, parseRecordUrl } from "../../src/parse/recordUrl";
import { presetWindow, validateWindow } from "../../src/parse/timeWindow";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("parseRecordUrl", () => {
    it("parses a model-driven record URL", () => {
        const result = parseRecordUrl(`https://contoso.crm.dynamics.com/main.aspx?appid=abc&pagetype=entityrecord&etn=account&id=${ID}`);
        expect(result).toEqual({ ok: true, value: { host: "contoso.crm.dynamics.com", table: "account", recordId: ID } });
    });

    it("handles encoded braces and upper-case IDs", () => {
        const result = parseRecordUrl(`https://contoso.crm.dynamics.com/main.aspx?etn=Account&pagetype=entityrecord&id=%7B${ID.toUpperCase()}%7D`);
        expect(result).toMatchObject({ ok: true, value: { table: "account", recordId: ID } });
    });

    it("reads parameters from the hash on older URLs", () => {
        const result = parseRecordUrl(`https://contoso.crm.dynamics.com/main.aspx#etn=contact&id=${ID}&pagetype=entityrecord`);
        expect(result).toMatchObject({ ok: true, value: { table: "contact", recordId: ID } });
    });

    it("parses a legacy etc= URL to a type code", () => {
        expect(parseRecordUrl(`https://contoso.crm.dynamics.com/main.aspx?etc=1&id=${ID}`)).toMatchObject({ ok: true, value: { objectTypeCode: 1 } });
    });

    it("parses a Web API URL to an entity set", () => {
        expect(parseRecordUrl(`https://contoso.crm.dynamics.com/api/data/v9.2/accounts(${ID})`)).toMatchObject({ ok: true, value: { entitySet: "accounts", recordId: ID } });
    });

    it("accepts a bare GUID with or without braces", () => {
        expect(parseRecordUrl(ID)).toEqual({ ok: true, value: { recordId: ID } });
        expect(parseRecordUrl(`{${ID}}`)).toEqual({ ok: true, value: { recordId: ID } });
    });

    it("explains what's wrong instead of throwing", () => {
        expect(parseRecordUrl("")).toMatchObject({ ok: false });
        expect(parseRecordUrl("not a url")).toMatchObject({ ok: false, error: expect.stringMatching(/valid URL/) });
        expect(parseRecordUrl("https://contoso.crm.dynamics.com/main.aspx?etn=account")).toMatchObject({ ok: false, error: expect.stringMatching(/record ID/) });
        expect(parseRecordUrl(`https://contoso.crm.dynamics.com/main.aspx?id=${ID}`)).toMatchObject({ ok: false, error: expect.stringMatching(/which table/) });
        expect(parseRecordUrl("https://contoso.crm.dynamics.com/main.aspx?etn=account&id=%E0%A4%A")).toMatchObject({ ok: false });
    });

    it("flags URLs from another environment", () => {
        const parsed = parseRecordUrl(`https://contoso-uat.crm.dynamics.com/main.aspx?etn=account&id=${ID}`);
        if (!parsed.ok) throw new Error("expected ok");
        expect(isDifferentEnvironment(parsed.value, "https://contoso.crm.dynamics.com/")).toBe(true);
        expect(isDifferentEnvironment(parsed.value, "https://contoso-uat.crm.dynamics.com")).toBe(false);
    });
});

describe("time window", () => {
    it("defaults are relative to now", () => {
        const now = new Date("2026-10-10T12:00:00Z");
        expect(presetWindow("7d", now).from.toISOString()).toBe("2026-10-03T12:00:00.000Z");
    });

    it("validates order and completeness", () => {
        expect(validateWindow(new Date("2026-10-02"), new Date("2026-10-01"))).toMatch(/before/);
        expect(validateWindow(new Date("invalid"), new Date())).toMatch(/start/);
        expect(validateWindow(new Date("2026-10-01"), new Date("2026-10-02"))).toBeUndefined();
    });
});
