/** Smoke test: every view renders the end-to-end result without throwing. */
import { FluentProvider, SSRProvider, webLightTheme } from "@fluentui/react-components";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Findings } from "../../src/ui/Findings";
import { ImpactMap } from "../../src/ui/ImpactMap";
import { PreflightPanel } from "../../src/ui/PreflightPanel";
import { Timeline } from "../../src/ui/Timeline";
import { evaluatePreflight } from "../../src/data/preflight";
import { healthyFacts } from "../fixtures/preflight";
import { run } from "../fixtures/endToEnd";

const html = (node: JSX.Element) =>
    renderToString(
        <SSRProvider>
            <FluentProvider theme={webLightTheme}>{node}</FluentProvider>
        </SSRProvider>,
    );

describe("views render", async () => {
    const { result } = await run();

    it("Timeline", () => {
        const out = html(<Timeline timeline={result.timeline} input={result.input} />);
        expect(out).toContain("Plugins.AccountAddressSync");
        expect(out).toContain("stitched · medium");
        expect(out).toContain("1 Old St → 2 New St");
    });

    it("Findings", () => {
        const out = html(<Findings findings={result.findings} done onNavigate={() => undefined} />);
        expect(out).toContain("was overwritten by ERP Integration");
        expect(out).toContain("medium confidence");
    });

    it("Impact Map", () => {
        expect(() => html(<ImpactMap graph={result.wiring} timeline={result.timeline} input={result.input} />)).not.toThrow();
    });

    it("Preflight", () => {
        const report = evaluatePreflight(healthyFacts());
        expect(html(<PreflightPanel checks={report.checks} loading={false} onRefresh={() => undefined} />)).toContain("Preflight");
    });
});
