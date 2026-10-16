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

    it("throws when URL does not allow table inference", async () => {
        await expect(
            invokeHeadless(
                {
                    recordUrl: "https://contoso.crm.dynamics.com/main.aspx?etc=1&id=aaaaaaaa-0000-4000-8000-000000000001",
                },
                {
                    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
                    updateProgress: vi.fn(),
                },
            ),
        ).rejects.toThrow(/Couldn't infer table from record URL/i);
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
        expect(output.analysis).toMatchObject({ status: "complete" });
        expect(Array.isArray(output.findings)).toBe(true);
        expect((output.findings as Array<unknown>).length).toBeGreaterThan(0);
        expect(Array.isArray(output.timelineHighlights)).toBe(true);
        expect((output.timelineHighlights as Array<unknown>).length).toBeGreaterThanOrEqual(0);
        expect(output.evidenceSummary).toMatchObject({ findingCount: expect.any(Number), timelineHighlightCount: expect.any(Number) });
        expect(logger.info).toHaveBeenCalled();
    });
});
