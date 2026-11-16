import { describe, expect, it } from "vitest";
import { dashboardRangeError, dateCoverage, isLatestThirtyDays, reportReadinessMessage } from "../../src/data/dashboard";

const now = new Date("2026-11-15T12:00:00Z");
const range = { startDate: "2026-10-16", endDate: "2026-11-14" };

describe("report readiness", () => {
    it("does not announce readiness before a source succeeds", () => {
        expect(reportReadinessMessage(false, false, false)).toBeUndefined();
    });

    it.each([
        [true, false, false, "Agent usage is ready · 1 of 3 reports ready."],
        [false, true, false, "Environment capacity is ready · 1 of 3 reports ready."],
        [false, false, true, "Azure costs are ready · 1 of 3 reports ready."],
        [true, true, false, "Ready: Agent usage and Environment capacity · 2 of 3 reports ready."],
        [true, false, true, "Ready: Agent usage and Azure costs · 2 of 3 reports ready."],
        [false, true, true, "Ready: Environment capacity and Azure costs · 2 of 3 reports ready."],
        [true, true, true, "All 3 reports are ready."],
    ])("identifies completed sources (%s, %s, %s)", (agents, billing, azure, message) => {
        expect(reportReadinessMessage(agents, billing, azure)).toBe(message);
    });
});

describe("dashboard coverage and dates", () => {
    it("accepts only valid, retained, completed UTC days", () => {
        expect(dashboardRangeError(range, now)).toBeUndefined();
        expect(dashboardRangeError({ ...range, startDate: "2026-10-15" }, now)).toContain("retained");
        expect(dashboardRangeError({ ...range, endDate: "2026-11-15" }, now)).toContain("completed");
        expect(dashboardRangeError({ ...range, startDate: "2026-11-31" }, now)).toContain("valid");
        expect(dashboardRangeError({ ...range, startDate: "" }, now)).toContain("valid");
        expect(dashboardRangeError({ startDate: range.endDate, endDate: range.startDate }, now)).toContain("valid");
    });

    it("enables the forecast only for the latest 30 complete UTC days", () => {
        expect(isLatestThirtyDays(range, now)).toBe(true);
        expect(isLatestThirtyDays({ ...range, startDate: "2026-10-17" }, now)).toBe(false);
        expect(isLatestThirtyDays({ startDate: "2026-10-15", endDate: "2026-11-13" }, now)).toBe(false);
    });

    it("shows actual returned coverage without inferring data for missing dates", () => {
        expect(dateCoverage(["", "2026-11-12T12:30:00Z", "2026-11-03", "invalid"])).toBe("2026-11-03 – 2026-11-12 (UTC)");
        expect(dateCoverage([])).toBe("No dated rows returned");
    });
});
