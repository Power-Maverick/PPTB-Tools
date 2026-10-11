import { matchHandler } from "../engine/correlate";
import type { Evidence, RuleOutput, TimelineEvent, WiringHandler } from "../model/types";
import { fmtGap, fmtTime, KIND_LABEL, RuleHelpers, unavailable, type Rule, type RuleContext } from "./context";

const INFINITE_LOOP = /infinite loop|maximum depth|depth.{0,40}exceeded|0x80044182/i;

/**
 * Loop / depth: a wiring cycle that history shows was exercised, depth growth inside one request,
 * the platform's own infinite-loop protection, or the same automation repeating on one record.
 */
export const loopRule: Rule = {
    id: "loop",
    title: "Loops and depth",
    run(ctx: RuleContext): RuleOutput[] {
        const s = ctx.sources;
        const noWiring = !s["wiring.plugins"].available && !s["wiring.workflows"].available;
        if (noWiring && !s["history.trace"].available && !s["history.async"].available) {
            return [unavailable("loop", "Loops and depth", "Unavailable — neither the registered automation nor execution history can be read.")];
        }
        const h = new RuleHelpers(ctx);
        const out: RuleOutput[] = [];
        if (noWiring) out.push(unavailable("loop", "Loops in the wiring", `Unavailable — ${s["wiring.plugins"].reason}; ${s["wiring.workflows"].reason}`, "wiring"));
        if (!s["history.traceSuccess"].available) out.push(unavailable("loop", "Plugin depth growth", `Unavailable — ${s["history.traceSuccess"].reason}`, "depth"));

        const executions = ctx.timeline.events.filter((e) => e.source !== "audit");
        const handlerOf = (e: TimelineEvent) => matchHandler(e, h.handlers)?.id ?? e.handlerId;

        // 1. Wiring cycles that actually ran.
        for (const cycle of ctx.wiring.cycles) {
            const handlerIds = cycle.filter((n) => !n.startsWith("table:"));
            const ran = handlerIds.map((id) => executions.filter((e) => handlerOf(e) === id));
            const exercised = ran.filter((r) => r.length).length;
            if (!exercised) continue;
            const names = handlerIds.map((id) => h.handlers.get(id)).filter((x): x is WiringHandler => !!x);
            const all = exercised === handlerIds.length;
            out.push({
                kind: "finding",
                id: `loop:cycle:${handlerIds.join(">")}`,
                rule: "loop",
                severity: all ? "high" : "low",
                title: all ? `Automation loop: ${names.map((n) => n.name).join(" → ")} → back to the start` : `Possible loop through ${names.map((n) => n.name).join(" → ")}`,
                explanation: [
                    `${names.map((n) => `${KIND_LABEL[n.kind]} '${n.name}' writes to ${cycleNext(cycle, n.id)}`).join(", ")}, which triggers the next one again.`,
                    all ? "Every step of the cycle ran in this window." : `${exercised} of ${handlerIds.length} steps ran in this window, so the loop may be stopped by a condition that isn't visible here.`,
                    "Loops are usually broken with filtering columns, a trigger condition, or by not writing a value that hasn't changed.",
                ].join(" "),
                evidence: [...names.map((n) => h.handlerEvidence(n)), ...ran.flat().slice(0, 6).map((e) => h.eventEvidence(e))],
                confidence: all ? (ran.flat().every((e) => e.source === "trace") ? "high" : "medium") : "low",
            });
        }

        // 2. Depth growth within a request.
        const byCorrelation = new Map<string, TimelineEvent[]>();
        for (const e of executions) if (e.correlationId) byCorrelation.set(e.correlationId, [...(byCorrelation.get(e.correlationId) ?? []), e]);
        for (const [cid, events] of byCorrelation) {
            const deepest = events.reduce((a, b) => ((b.depth ?? 0) > (a.depth ?? 0) ? b : a));
            const depth = deepest.depth ?? 0;
            if (depth < ctx.settings.loopDepthThreshold) continue;
            out.push({
                kind: "finding",
                id: `loop:depth:${cid}`,
                rule: "loop",
                severity: depth >= 8 ? "high" : "medium",
                title: `One request went ${depth} levels deep`,
                explanation: `Starting ${fmtTime(events[0].time)}, automation kept triggering more automation in the same request until depth ${depth}${depth >= 8 ? " — Dataverse stops requests at depth 8 by default and fails them" : ""}. Deepest step: ${deepest.operation}.`,
                evidence: [...events]
                    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
                    .slice(0, 8)
                    .map((e) => h.eventEvidence(e, `depth ${e.depth ?? "?"} · ${e.operation}`)),
                confidence: "high",
            });
        }

        // 3. The platform's own loop protection.
        const stopped = executions.filter((e) => e.error && INFINITE_LOOP.test(e.error));
        if (stopped.length) {
            out.push({
                kind: "finding",
                id: "loop:platform",
                rule: "loop",
                severity: "high",
                title: "Dataverse stopped automation for looping",
                explanation: `${stopped.length} execution(s) were stopped by Dataverse's infinite-loop protection, e.g. ${stopped[0].operation} at ${fmtTime(stopped[0].time)}: ${stopped[0].error}`,
                evidence: stopped.slice(0, 5).map((e) => h.eventEvidence(e)),
                confidence: "high",
            });
        }

        // 4. Same automation repeating on one record in a short time (loops that span requests).
        const repeats = new Map<string, TimelineEvent[]>();
        for (const e of executions) {
            const handler = handlerOf(e);
            const record = e.record?.id ?? h.chain(e.id).find((c) => c.record)?.record?.id;
            if (handler && record) repeats.set(`${handler}|${record}`, [...(repeats.get(`${handler}|${record}`) ?? []), e]);
        }
        for (const [key, events] of repeats) {
            const sorted = [...events].sort((a, b) => a.time.localeCompare(b.time));
            for (let i = 0; i + 2 < sorted.length; i++) {
                const span = new Date(sorted[i + 2].time).getTime() - new Date(sorted[i].time).getTime();
                if (span > 10 * 60_000) continue;
                const handler = h.handlers.get(key.split("|")[0]);
                const evidence: Evidence[] = [...(handler ? [h.handlerEvidence(handler)] : []), ...sorted.slice(i, i + 5).map((e) => h.eventEvidence(e))];
                out.push({
                    kind: "finding",
                    id: `loop:repeat:${key}`,
                    rule: "loop",
                    severity: "medium",
                    title: `${handler ? `'${handler.name}'` : sorted[0].actor.name} ran ${sorted.length} times on the same record`,
                    explanation: `It ran ${sorted.length} times, including 3 runs within ${fmtGap(span)}. Repeated runs on one record usually mean automation is re-triggering itself (directly or through another flow or plugin).`,
                    evidence,
                    confidence: "medium",
                });
                break;
            }
        }
        return out;
    },
};

function cycleNext(cycle: string[], handlerId: string): string {
    const i = cycle.indexOf(handlerId);
    return (cycle[i + 1] ?? "").replace(/^table:/, "") || "its own table";
}
