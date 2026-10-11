import type { RuleOutput } from "../model/types";
import { fmtGap, fmtTime, RuleHelpers, unavailable, type Rule, type RuleContext } from "./context";

const STUCK = new Set(["waiting", "inprogress", "suspended"]);

/** Stuck async: system jobs or flow runs still waiting / in progress beyond the threshold. */
export const stuckAsyncRule: Rule = {
    id: "stuck-async",
    title: "Stuck background work",
    run(ctx: RuleContext): RuleOutput[] {
        const out: RuleOutput[] = [];
        if (!ctx.sources["history.async"].available) out.push(unavailable("stuck-async", "Stuck system jobs", `Unavailable — ${ctx.sources["history.async"].reason}`, "async"));
        const h = new RuleHelpers(ctx);
        const threshold = ctx.settings.stuckAsyncMinutes * 60_000;
        for (const e of ctx.timeline.events) {
            if ((e.source !== "async" && e.source !== "flowrun") || !STUCK.has(e.status)) continue;
            const age = ctx.now.getTime() - new Date(e.time).getTime();
            if (age < threshold) continue;
            const state = e.status === "inprogress" ? "still in progress" : e.status === "suspended" ? "suspended (waiting for someone to resume it)" : "still waiting";
            out.push({
                kind: "finding",
                id: `stuck-async:${e.id}`,
                rule: "stuck-async",
                severity: age > 24 * 3_600_000 || e.status === "suspended" ? "high" : "medium",
                title: `${e.source === "flowrun" ? "Flow run" : "System job"} '${e.actor.name}' has been ${state.split(" (")[0]} for ${fmtGap(age)}`,
                explanation: [
                    `Created ${fmtTime(e.time)}${e.record ? ` for ${h.recordLabel(e.record)}` : ""} and ${state}.`,
                    e.error ? `Last message: ${e.error}` : "",
                    "Anything it was supposed to do (update related records, call out to another system) hasn't happened yet.",
                ]
                    .filter(Boolean)
                    .join(" "),
                evidence: [h.eventEvidence(e)],
                confidence: e.record?.id === ctx.input.recordId ? "high" : h.chainConfidence(e.id),
            });
        }
        return out;
    },
};
