import { describe, expect, it } from "vitest";
import { resolveTable, type TableInfo } from "../../src/data/catalog";
import { compareSchema, verifyTable } from "../../src/data/schema";
import { evaluateTargetAudit, managedBool } from "../../src/data/targetAudit";
import type { ReadOnlyDataverse } from "../../src/host/readOnlyDataverse";
import { classifyError } from "../../src/host/errors";

describe("schema verification", () => {
    const req = { table: "audit", required: ["objectid", "attributemask"], optional: ["transactionid"] };

    it("lists missing required and optional columns, case-insensitively", () => {
        const schema = compareSchema(req, ["ObjectId", "createdon"], { ownership: "OrganizationOwned" });
        expect(schema).toMatchObject({ exists: true, missingRequired: ["attributemask"], missingOptional: ["transactionid"], columns: ["createdon", "objectid"] });
    });

    it("a missing table is reported, not thrown", async () => {
        const dv = { entityMetadata: () => Promise.reject(new Error("Could not find entity with name 'flowrun' (0x80040217)")) } as unknown as ReadOnlyDataverse;
        const schema = await verifyTable(dv, { table: "flowrun", required: [], optional: [] });
        expect(schema).toMatchObject({ exists: false, error: "Table 'flowrun' does not exist in this environment" });
    });
});

describe("classifyError", () => {
    it("recognises Dataverse privilege, not-found and throttling errors", () => {
        expect(classifyError(new Error("Principal user (Id=…) is missing prvReadPluginTraceLog privilege")).kind).toBe("privilege");
        expect(classifyError({ error: { message: "0x80040220 SecLib::AccessCheckEx failed" } }).kind).toBe("privilege");
        expect(classifyError("Resource not found for the segment 'flowruns'").kind).toBe("notFound");
        expect(classifyError(new Error("Request failed with status 429")).kind).toBe("throttled");
        expect(classifyError(new Error("boom")).kind).toBe("other");
    });
});

describe("table audit evaluation", () => {
    it("reads managed boolean properties", () => {
        expect(managedBool({ Value: true, CanBeChanged: true })).toBe(true);
        expect(managedBool(false)).toBe(false);
        expect(managedBool(undefined)).toBeUndefined();
    });

    it("table and column audit on → ok", () => {
        const checks = evaluateTargetAudit({ table: "account", tableExists: true, tableAudit: true, column: { name: "address1_line1", exists: true, audit: true } }, true);
        expect(checks.map((c) => c.status)).toEqual(["ok", "ok"]);
    });

    it("table audit off → error explaining Overwrite can't be evaluated", () => {
        const [table] = evaluateTargetAudit({ table: "account", tableExists: true, tableAudit: false }, true);
        expect(table).toMatchObject({ status: "error", impact: expect.stringMatching(/Overwrite can't be evaluated/) });
    });

    it("column audit off → error about before → after values", () => {
        const checks = evaluateTargetAudit({ table: "account", tableExists: true, tableAudit: true, column: { name: "address1_line1", exists: true, audit: false } }, true);
        expect(checks[1]).toMatchObject({ status: "error", impact: expect.stringMatching(/Before → after/) });
    });

    it("table audit on but environment audit off → warning", () => {
        const [table] = evaluateTargetAudit({ table: "account", tableExists: true, tableAudit: true }, false);
        expect(table.status).toBe("warning");
    });

    it("unknown column → error", () => {
        const checks = evaluateTargetAudit({ table: "account", tableExists: true, tableAudit: true, column: { name: "nope", exists: false } }, true);
        expect(checks[1]).toMatchObject({ status: "error", summary: expect.stringMatching(/doesn't exist/) });
    });
});

describe("resolveTable", () => {
    const tables: TableInfo[] = [
        { logicalName: "account", displayName: "Account", entitySetName: "accounts", objectTypeCode: 1 },
        { logicalName: "cr123_address", displayName: "Address", entitySetName: "cr123_addresses", objectTypeCode: 10234 },
    ];

    it("resolves etn, entity set and type code", () => {
        expect(resolveTable({ table: "account" }, tables)).toBe("account");
        expect(resolveTable({ entitySet: "CR123_ADDRESSES" }, tables)).toBe("cr123_address");
        expect(resolveTable({ objectTypeCode: 1 }, tables)).toBe("account");
        expect(resolveTable({ objectTypeCode: 99 }, tables)).toBeUndefined();
    });
});
