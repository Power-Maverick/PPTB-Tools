import { describe, expect, it, vi } from "vitest";
import { invokeHeadless } from "../../src/headless";
import { createEndToEndHeadlessContext } from "../fixtures/endToEnd";
import { ADDR_PRIMARY } from "../fixtures/scenario";

describe("headless agent analysis runtime", () => {
    it("returns structured analysis request payload", async () => {
        const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
        const progress: Array<{ percent: number; message: string }> = [];

        const output = await invokeHeadless(
            {
                table: "account",
                recordId: "aaaaaaaa-0000-4000-8000-000000000001",
            },
            {
                logger,
                updateProgress: (percent: number, message: string) => progress.push({ percent, message }),
            },
        );

        expect(output.operation).toBe("analysis-request");
        expect(output.analysisInput).toMatchObject({ table: "account", recordId: "aaaaaaaa-0000-4000-8000-000000000001" });
        expect(output.dataCollection).toMatchObject({ status: "ready-for-evidence-collection", mode: "analysis", requiresConnection: true });
        expect(output.analysis).toMatchObject({ status: "pending-live-collection" });
        expect(output.findings).toEqual([]);
        expect(output.timelineHighlights).toEqual([]);
        expect(output.evidenceSummary).toMatchObject({ suppliedFindingCount: 0, suppliedTimelineHighlightCount: 0 });
        expect(typeof output.generatedAt).toBe("string");
        expect(progress.at(-1)).toEqual({ percent: 100, message: "done" });
        expect(logger.info).toHaveBeenCalled();
    });

    it("accepts UI-style recordUrl + optional column and returns analysis-request mode", async () => {
        const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

        const output = await invokeHeadless(
            {
                recordUrl: "https://contoso.crm.dynamics.com/main.aspx?etn=account&id=%7Baaaaaaaa-0000-4000-8000-000000000001%7D",
                column: "address1_line1",
            },
            {
                logger,
                updateProgress: vi.fn(),
            },
        );

        expect(output.operation).toBe("analysis-request");
        expect(output.analysisInput).toMatchObject({
            table: "account",
            recordId: "aaaaaaaa-0000-4000-8000-000000000001",
            column: "address1_line1",
        });
        expect(output.dataCollection).toMatchObject({ status: "ready-for-evidence-collection", mode: "analysis", requiresConnection: true });
        expect(output.evidenceSummary).toMatchObject({ suppliedFindingCount: 0, suppliedTimelineHighlightCount: 0 });
        expect(logger.info).toHaveBeenCalled();
    });

    it("returns a validation error when URL does not allow table inference", async () => {
        const output = await invokeHeadless(
            {
                recordUrl: "https://contoso.crm.dynamics.com/main.aspx?etc=1&id=aaaaaaaa-0000-4000-8000-000000000001",
            },
            {
                logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
                updateProgress: vi.fn(),
            },
        );

        expect(output.operation).toBe("validation-error");
        expect(output.validation).toMatchObject({ valid: false, errors: [{ field: "table", code: "required" }] });
        expect((output.validation as { message: string }).message).toMatch(/Couldn't infer table from record URL/i);
    });

    it("returns field-level validation errors instead of throwing for wrong prefill values", async () => {
        const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
        const progress = vi.fn();

        const output = await invokeHeadless(
            {
                table: "Contact Person",
                recordId: "not-a-guid",
                column: 42,
                from: "last week",
                to: "2026-10-10T00:00:00Z",
                extra: true,
            },
            { logger, updateProgress: progress },
        );

        expect(output.operation).toBe("validation-error");
        const validation = output.validation as { valid: boolean; errors: Array<Record<string, unknown>>; warnings: string[]; acceptedFields: Record<string, string> };
        expect(validation.valid).toBe(false);
        expect(validation.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: "table", code: "invalid_format", received: "Contact Person" }),
                expect.objectContaining({ field: "recordId", code: "invalid_format", received: "not-a-guid" }),
                expect.objectContaining({ field: "column", code: "invalid_type", received: 42 }),
                expect.objectContaining({ field: "from", code: "invalid_format", received: "last week" }),
            ]),
        );
        expect(validation.errors.every((e) => typeof e.expected === "string")).toBe(true);
        expect(validation.warnings).toEqual([expect.stringMatching(/unknown property 'extra'/)]);
        expect(validation.acceptedFields).toHaveProperty("recordUrl");
        expect(output.analysisInput).toMatchObject({ table: "Contact Person", recordId: "not-a-guid", column: 42 });
        expect(output.findings).toEqual([]);
        expect(output.analysis).toMatchObject({ status: "invalid-input" });
        expect(progress).toHaveBeenLastCalledWith(100, "done");
        expect(logger.warn).toHaveBeenCalled();
    });

    it("rejects non-object input, conflicting values and inverted windows", async () => {
        const ctx = { logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }, updateProgress: vi.fn() };

        const notObject = await invokeHeadless("account" as never, ctx);
        expect(notObject.validation).toMatchObject({ errors: [{ field: "(input)", code: "invalid_input" }] });

        const conflict = await invokeHeadless(
            {
                recordUrl: "https://contoso.crm.dynamics.com/main.aspx?etn=account&id=aaaaaaaa-0000-4000-8000-000000000001",
                table: "contact",
                recordId: "bbbbbbbb-0000-4000-8000-000000000002",
                from: "2026-10-10T00:00:00Z",
                to: "2026-10-01T00:00:00Z",
            },
            ctx,
        );
        expect(conflict.operation).toBe("validation-error");
        expect((conflict.validation as { errors: unknown[] }).errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: "table", code: "conflict", expected: "account" }),
                expect.objectContaining({ field: "recordId", code: "conflict", expected: "aaaaaaaa-0000-4000-8000-000000000001" }),
                expect.objectContaining({ field: "from", code: "invalid_range" }),
            ]),
        );
    });

    it("validates table and column against Dataverse metadata with suggestions", async () => {
        const ctx = createEndToEndHeadlessContext();
        const base = { logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }, updateProgress: vi.fn(), dataverse: ctx.dataverse, connection: ctx.connection, tableCatalog: ctx.tables };

        const badTable = await invokeHeadless({ table: "address", recordId: ADDR_PRIMARY }, base);
        expect(badTable.operation).toBe("validation-error");
        expect(badTable.validation).toMatchObject({ errors: [{ field: "table", code: "not_found", suggestions: ["cr_address"] }] });

        const badColumn = await invokeHeadless({ table: "cr_address", recordId: ADDR_PRIMARY, column: "line1" }, base);
        expect(badColumn.operation).toBe("validation-error");
        expect(badColumn.validation).toMatchObject({ errors: [{ field: "column", code: "not_found" }] });
        expect((badColumn.validation as { errors: Array<{ suggestions: string[] }> }).errors[0].suggestions).toContain("cr_line1");

        const viaEntitySet = await invokeHeadless(
            { recordUrl: `https://contoso.crm.dynamics.com/api/data/v9.2/cr_addresses(${ADDR_PRIMARY})`, column: "cr_line1", from: "2026-10-08T00:00:00Z", to: "2026-10-10T23:59:59Z" },
            base,
        );
        expect(viaEntitySet.operation).toBe("analysis-complete");
        expect(viaEntitySet.analysisInput).toMatchObject({ table: "cr_address" });
    });

    it("runs live Dataverse analysis when API surfaces are provided in context", async () => {
        const ctx = createEndToEndHeadlessContext();
        const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

        const output = await invokeHeadless(
            {
                table: "cr_address",
                recordId: ADDR_PRIMARY,
                column: "cr_line1",
                from: "2026-10-08T00:00:00.000Z",
                to: "2026-10-10T23:59:59.999Z",
            },
            {
                logger,
                updateProgress: vi.fn(),
                dataverse: ctx.dataverse,
                connection: ctx.connection,
                tableCatalog: ctx.tables,
            },
        );

        expect(output.operation).toBe("analysis-complete");
        expect(output.validation).toMatchObject({ valid: true, errors: [] });
        expect(output.analysis).toMatchObject({ status: "complete" });
        expect(Array.isArray(output.findings)).toBe(true);
        expect((output.findings as Array<unknown>).length).toBeGreaterThan(0);
        expect(Array.isArray(output.timelineHighlights)).toBe(true);
        expect((output.timelineHighlights as Array<unknown>).length).toBeGreaterThanOrEqual(0);
        expect(output.evidenceSummary).toMatchObject({ findingCount: expect.any(Number), timelineHighlightCount: expect.any(Number) });
        expect(logger.info).toHaveBeenCalled();
    });
});
