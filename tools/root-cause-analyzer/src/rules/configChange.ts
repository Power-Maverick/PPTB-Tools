import type { Finding, RuleOutput, Severity, WiringHandler } from "../model/types";
import { fmtTime, KIND_LABEL, RuleHelpers, unavailable, type Rule, type RuleContext } from "./context";

interface Change {
    key: string;
    what: string;
    at: string;
    by?: string;
    handlers: WiringHandler[];
}

/**
 * Configuration change: a step, workflow, flow or plugin assembly involved here was modified during the
 * window. When failures start (or runs stop) right after the change, that's usually the cause.
 */
export const configChangeRule: Rule = {
    id: "config-change",
    title: "Automation changed",
    run(ctx: RuleContext): RuleOutput[] {
        if (!ctx.sources["wiring.plugins"].available && !ctx.sources["wiring.workflows"].available) {
            return [unavailable("config-change", "Automation changed", "Unavailable — the registered plugins and processes can't be read.")];
        }
        const h = new RuleHelpers(ctx);
        const from = ctx.input.from.getTime();
        const to = ctx.input.to.getTime();
        const inWindow = (iso?: string) => !!iso && new Date(iso).getTime() >= from && new Date(iso).getTime() <= to;
        const handlers = ctx.wiring.handlers.filter((x) => (ctx.settings.includeSystemSteps || !x.system) && x.enabled); // turned-off ones are explained by "Expected but missing"

        const changes = new Map<string, Change>();
        for (const handler of handlers) {
            if (inWindow(handler.modifiedOn)) {
                changes.set(handler.id, { key: handler.id, what: `${KIND_LABEL[handler.kind]} '${handler.name}'`, at: handler.modifiedOn!, by: handler.modifiedByName, handlers: [handler] });
            }
            const asm = handler.assembly;
            if (asm && inWindow(asm.modifiedOn)) {
                const key = `asm:${asm.id ?? asm.name}`;
                const existing = changes.get(key) ?? { key, what: `Plugin assembly '${asm.name}'${asm.version ? ` (v${asm.version})` : ""}`, at: asm.modifiedOn!, by: asm.modifiedByName, handlers: [] };
                existing.handlers.push(handler);
                changes.set(key, existing);
            }
        }

        const out: RuleOutput[] = [];
        for (const change of changes.values()) {
            const t = new Date(change.at).getTime();
            const runs = change.handlers.flatMap((x) => h.runsOf(x));
            const before = runs.filter((r) => new Date(r.time).getTime() < t);
            const after = runs.filter((r) => new Date(r.time).getTime() >= t);
            const failedBefore = before.filter((r) => r.status === "failed");
            const failedAfter = after.filter((r) => r.status === "failed");
            const okBefore = before.filter((r) => r.status === "success");

            let severity: Severity = "info";
            let title = `${change.what} was changed during this window`;
            const lines = [`It was modified ${fmtTime(change.at)}${change.by ? ` by ${change.by}` : ""}.`];
            if (failedAfter.length && !failedBefore.length) {
                severity = "high";
                title = `Failures started after ${change.what} was changed`;
                lines.push(`It ran ${okBefore.length ? `successfully ${okBefore.length} time(s) before the change` : "without failures before the change"} and failed ${failedAfter.length} time(s) after it.`);
            } else if (before.length && !after.length) {
                severity = "medium";
                title = `${change.what} stopped running after it was changed`;
                lines.push(`It ran ${before.length} time(s) before the change and not once after it — check its filtering columns, trigger conditions or registration.`);
            } else if (runs.length) {
                lines.push(`It ran ${before.length} time(s) before and ${after.length} time(s) after the change.`);
            }
            if (change.key.startsWith("asm:")) lines.push(`Steps using it: ${change.handlers.map((x) => x.name).join(", ")}.`);
            lines.push("Modified time is the last change to the definition (or its on/off state); what changed isn't recorded unless that table is audited.");

            const finding: Finding = {
                kind: "finding",
                id: `config-change:${change.key}`,
                rule: "config-change",
                severity,
                title,
                explanation: lines.join(" "),
                evidence: [...change.handlers.slice(0, 4).map((x) => h.handlerEvidence(x)), ...[...failedAfter, ...okBefore.slice(-1)].slice(0, 4).map((e) => h.eventEvidence(e))],
                confidence: severity === "info" ? "high" : "medium",
            };
            out.push(finding);
        }
        return out;
    },
};
