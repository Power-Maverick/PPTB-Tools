import { describe, expect, it } from "vitest";
import { buildFetchXml, extractPagingCookie, fetchPages } from "../../src/data/fetchXml";
import type { ReadOnlyDataverse } from "../../src/host/readOnlyDataverse";

describe("buildFetchXml", () => {
    it("escapes values so user input can't change the query", () => {
        const xml = buildFetchXml({ entity: "account", attributes: ["name"], conditions: [{ attribute: "name", operator: "eq", value: `a" /><condition attribute="x` }] });
        expect(xml).toContain('value="a&quot; /&gt;&lt;condition attribute=&quot;x"');
    });

    it("builds in-lists, null checks, orders, top and dates", () => {
        const xml = buildFetchXml({
            entity: "audit",
            attributes: ["createdon"],
            conditions: [
                { attribute: "objectid", operator: "in", value: ["a", "b"] },
                { attribute: "attributemask", operator: "not-null" },
                { attribute: "createdon", operator: "ge", value: new Date("2026-10-01T00:00:00Z") },
            ],
            orders: [{ attribute: "createdon", descending: true }],
            top: 1,
        });
        expect(xml).toBe(
            '<fetch top="1"><entity name="audit"><attribute name="createdon" /><order attribute="createdon" descending="true" />' +
                '<filter type="and"><condition attribute="objectid" operator="in"><value>a</value><value>b</value></condition>' +
                '<condition attribute="attributemask" operator="not-null" /><condition attribute="createdon" operator="ge" value="2026-10-01T00:00:00.000Z" /></filter></entity></fetch>',
        );
    });

    it("uses page/count instead of top when paging, and escapes the cookie", () => {
        const xml = buildFetchXml({ entity: "account", attributes: [], top: 5 }, { page: 2, count: 100, cookie: '<cookie page="1"/>' });
        expect(xml).toMatch(/^<fetch page="2" count="100" paging-cookie="&lt;cookie page=&quot;1&quot;\/&gt;">/);
        expect(xml).not.toContain("top=");
    });
});

describe("extractPagingCookie", () => {
    it("decodes the double-encoded inner cookie", () => {
        const inner = '<cookie page="1"><accountid last="{A}" first="{B}" /></cookie>';
        const annotation = `<cookie pagenumber="2" pagingcookie="${encodeURIComponent(encodeURIComponent(inner))}" istracking="False" />`;
        expect(extractPagingCookie(annotation)).toBe(inner);
    });

    it("tolerates missing or malformed annotations", () => {
        expect(extractPagingCookie(undefined)).toBeUndefined();
        expect(extractPagingCookie("<cookie />")).toBeUndefined();
        expect(extractPagingCookie('<cookie pagingcookie="%E0%A4%A" />')).toBeUndefined();
    });
});

describe("fetchPages", () => {
    function fakeDv(pages: Array<Record<string, unknown>>) {
        const requests: string[] = [];
        const dv = {
            fetchXml: async (xml: string) => {
                requests.push(xml);
                return pages[requests.length - 1] as never;
            },
        } as unknown as ReadOnlyDataverse;
        return { dv, requests };
    }

    const cookie = (n: number) => `<cookie pagenumber="${n + 1}" pagingcookie="${encodeURIComponent(encodeURIComponent(`<cookie page="${n}" />`))}" />`;

    it("follows paging cookies until Dataverse says there are no more records", async () => {
        const { dv, requests } = fakeDv([
            { value: [{ id: 1 }, { id: 2 }], "@Microsoft.Dynamics.CRM.morerecords": true, "@Microsoft.Dynamics.CRM.fetchxmlpagingcookie": cookie(1) },
            { value: [{ id: 3 }], "@Microsoft.Dynamics.CRM.morerecords": false },
        ]);
        const pages = [];
        for await (const page of fetchPages(dv, { entity: "account", attributes: ["name"] }, { pageSize: 2 })) pages.push(page);
        expect(pages.map((p) => p.rows.length)).toEqual([2, 1]);
        expect(pages.every((p) => !p.truncated)).toBe(true);
        expect(requests[1]).toContain('page="2"');
        expect(requests[1]).toContain('paging-cookie="&lt;cookie page=&quot;1&quot; /&gt;"');
    });

    it("stops at maxPages and reports truncation rather than scanning everything", async () => {
        const full = { value: [{}, {}], "@Microsoft.Dynamics.CRM.morerecords": true };
        const { dv, requests } = fakeDv([full, full, full]);
        const pages = [];
        for await (const page of fetchPages(dv, { entity: "account", attributes: [] }, { pageSize: 2, maxPages: 2 })) pages.push(page);
        expect(requests).toHaveLength(2);
        expect(pages[1].truncated).toBe(true);
    });

    it("stops when aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const { dv, requests } = fakeDv([{ value: [] }]);
        for await (const _ of fetchPages(dv, { entity: "account", attributes: [] }, { signal: controller.signal })) void _;
        expect(requests).toHaveLength(0);
    });
});
