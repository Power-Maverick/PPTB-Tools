import { describe, expect, it } from "vitest";
import { evaluatePreflight, maxDepth, normalizeDepth } from "../../src/data/preflight";
import type { PreflightReport } from "../../src/model/types";
import { healthyAccess, healthyFacts, healthySchema } from "../fixtures/preflight";

const check = (report: PreflightReport, id: string) => report.checks.find((c) => c.id === id);

describe("evaluatePreflight", () => {
    it("reports a healthy environment with every source available", () => {
        const report = evaluatePreflight(healthyFacts());
        expect(report.checks.filter((c) => c.status === "error" || c.status === "warning")).toEqual([]);
        expect(Object.values(report.sources).every((s) => s.available && !s.partial)).toBe(true);
        expect(check(report, "trace-level")?.summary).toMatch(/All/);
        expect(check(report, "audit-org")?.details).toContain("Audit retention: 90 days.");
    });

    describe("plugin trace log level", () => {
        it("Off → error, all trace sources unavailable, with an admin fix", () => {
            const report = evaluatePreflight(healthyFacts({ org: { values: { plugintracelogsetting: 0, isauditenabled: true } } }));
            const trace = check(report, "trace-level")!;
            expect(trace.status).toBe("error");
            expect(trace.summary).toMatch(/Off/);
            expect(trace.fix).toMatch(/Enable logging to plug-in trace log/);
            expect(report.sources["history.trace"]).toEqual({ available: false, reason: "plugin trace log is Off" });
            expect(report.sources["history.traceSuccess"].available).toBe(false);
        });

        it("Exception → warning that says successful runs are missing", () => {
            const report = evaluatePreflight(healthyFacts({ org: { values: { plugintracelogsetting: 1, isauditenabled: true } } }));
            expect(check(report, "trace-level")?.status).toBe("warning");
            expect(check(report, "trace-level")?.impact).toMatch(/Successful plugin runs won't appear/);
            expect(report.sources["history.trace"].available).toBe(true);
            expect(report.sources["history.traceSuccess"]).toMatchObject({ available: false, reason: expect.stringMatching(/Exception/) });
        });

        it("unreadable setting → warning and trace marked partial, not silently fine", () => {
            const report = evaluatePreflight(healthyFacts({ org: { error: { kind: "privilege", message: "missing prvReadOrganization" } } }));
            expect(check(report, "trace-level")).toMatchObject({ status: "warning", details: ["missing prvReadOrganization"] });
            expect(report.sources["history.trace"]).toMatchObject({ available: true, partial: true });
        });
    });

    describe("auditing", () => {
        it("org audit off → error and audit source unavailable", () => {
            const report = evaluatePreflight(healthyFacts({ org: { values: { plugintracelogsetting: 2, isauditenabled: false } } }));
            expect(check(report, "audit-org")).toMatchObject({ status: "error", summary: "Auditing is off for the environment." });
            expect(report.sources["history.audit"]).toEqual({ available: false, reason: "auditing is off for the environment" });
        });

        it("shows unlimited retention", () => {
            const report = evaluatePreflight(healthyFacts({ org: { values: { plugintracelogsetting: 2, isauditenabled: true, auditretentionperiodv2: -1 } } }));
            expect(check(report, "audit-org")?.details).toEqual(["Audit retention: forever."]);
        });
    });

    describe("privileges", () => {
        it("missing read on plugintracelog → error naming the table, trace source unavailable", () => {
            const access = { ...healthyAccess(), plugintracelog: { probe: "denied" as const, error: "Principal user is missing prvReadPluginTraceLog privilege" } };
            const report = evaluatePreflight(healthyFacts({ access }));
            expect(check(report, "access-plugintracelog")).toMatchObject({ status: "error", summary: "You don't have read access to plugintracelog." });
            expect(report.sources["history.trace"]).toMatchObject({ available: false, reason: "no read access to plugintracelog" });
        });

        it("missing read on audit → audit unavailable even though auditing is on", () => {
            const access = { ...healthyAccess(), audit: { probe: "denied" as const } };
            const report = evaluatePreflight(healthyFacts({ access }));
            expect(check(report, "access-audit")?.status).toBe("error");
            expect(report.sources["history.audit"].available).toBe(false);
        });

        it("user-level read on system jobs → warning and async source partial", () => {
            const access = { ...healthyAccess(), asyncoperation: { probe: "granted" as const, depth: "Basic" as const } };
            const report = evaluatePreflight(healthyFacts({ access }));
            expect(check(report, "access-asyncoperation")).toMatchObject({ status: "warning", summary: expect.stringMatching(/is Basic, not Organization/) });
            expect(report.sources["history.async"]).toMatchObject({ available: true, partial: true });
        });

        it("missing read on a metadata table makes wiring unavailable", () => {
            const access = { ...healthyAccess(), sdkmessagefilter: { probe: "denied" as const } };
            const report = evaluatePreflight(healthyFacts({ access }));
            expect(report.sources["wiring.plugins"]).toMatchObject({ available: false, reason: "no read access to sdkmessagefilter" });
        });

        it("missing step images only make plugin wiring partial", () => {
            const access = { ...healthyAccess(), sdkmessageprocessingstepimage: { probe: "denied" as const } };
            const report = evaluatePreflight(healthyFacts({ access }));
            expect(report.sources["wiring.plugins"]).toMatchObject({ available: true, partial: true });
        });
    });

    describe("cloud flows", () => {
        it("missing flowrun table → warning, flowrun source unavailable", () => {
            const schema = healthySchema();
            schema.flowrun = { table: "flowrun", exists: false, columns: [], missingRequired: [], missingOptional: [], error: "Table 'flowrun' does not exist in this environment" };
            const access = { ...healthyAccess(), flowrun: { probe: "skipped" as const } };
            const report = evaluatePreflight(healthyFacts({ schema, access }));
            expect(check(report, "flowrun")?.status).toBe("warning");
            expect(report.sources["history.flowrun"].available).toBe(false);
        });

        it("available flowrun notes solution-aware-only and retention", () => {
            const report = evaluatePreflight(healthyFacts());
            expect(check(report, "flowrun")?.details?.join(" ")).toMatch(/solution-aware.*retention/s);
        });

        it("connection without Power Platform API → warning that flow links will be stitched", () => {
            const facts = healthyFacts();
            facts.connection = { ...facts.connection!, enabledForPowerPlatformAPI: false };
            const report = evaluatePreflight(facts);
            expect(check(report, "flow-api")).toMatchObject({ status: "warning", impact: expect.stringMatching(/stitched/) });
            expect(report.sources["history.flowrunApi"].available).toBe(false);
        });
    });

    it("missing required columns are reported and block the source", () => {
        const schema = healthySchema();
        schema.asyncoperation = { ...schema.asyncoperation, missingRequired: ["regardingobjectid"] };
        const report = evaluatePreflight(healthyFacts({ schema }));
        expect(check(report, "schema-asyncoperation")?.summary).toMatch(/regardingobjectid/);
        expect(report.sources["history.async"].available).toBe(false);
    });

    it("no connection → error, nothing else assumed", () => {
        const report = evaluatePreflight({ connection: null, schema: {}, org: { values: {} }, access: {} });
        expect(check(report, "connection")?.status).toBe("error");
        expect(Object.values(report.sources).every((s) => !s.available)).toBe(true);
    });
});

describe("access depth", () => {
    it("normalizes names and numbers", () => {
        expect(normalizeDepth("Global")).toBe("Global");
        expect(normalizeDepth("deep")).toBe("Deep");
        expect(normalizeDepth(0)).toBe("Basic");
        expect(normalizeDepth("3")).toBe("Global");
        expect(normalizeDepth("weird")).toBe("unknown");
    });

    it("takes the highest across roles", () => {
        expect(maxDepth(["Basic", "Deep", "Local"])).toBe("Deep");
        expect(maxDepth([])).toBe("None");
        expect(maxDepth(["???"])).toBe("unknown");
    });
});
