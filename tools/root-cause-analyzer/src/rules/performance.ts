import type { RuleOutput, Severity, TimelineEvent } from "../model/types";
import { fmtTime, RuleHelpers, unavailable, type Rule, type RuleContext } from "./context";

export const TIMEOUT = /\btimed?[ -]?out\b|\btimeout\b|took longer than|exceeded the (allowed )?time|2 minutes/i;
export const THROTTLED = /\b429\b|0x80072322|0x80072321|0x80072326|number of requests exceeded|combined execution time|concurrent requests|service protection|too many requests|throttl/i;
const SANDBOX_LIMIT_MS = 120_000;

const duration = (e: TimelineEvent) => (e.endTime ? new Date(e.endTime).getTime() - new Date(e.time).getTime() : undefined);
const isSync = (e: TimelineEvent) => e.source === "trace" && !/asynchronous/i.test(e.operation);

/** Performance and limits: timeouts, throttling, plugins near the 2-minute limit, slow synchronous plugins. */
export const performanceRule: Rule = {
    id: "performance",
    title: "Performance and limits",
    run(ctx: RuleContext): RuleOutput[] {
        const out: RuleOutput[] = [];
        if (!ctx.sources["history.traceSuccess"].available) {
            out.push(unavailable("performance", "Plugin durations", `Unavailable — ${ctx.sources["history.traceSuccess"].reason ?? "successful plugin runs aren't logged"}. Timeouts and throttling errors are still checked.`, "durations"));
        }
        const h = new RuleHelpers(ctx);
        const byActor = new Map<string, TimelineEvent[]>();
        for (const e of ctx.timeline.events) if (e.source !== "audit") byActor.set(e.actor.key, [...(byActor.get(e.actor.key) ?? []), e]);

        for (const [key, events] of byActor) {
            const name = events[0].actor.name;
            const throttled = events.filter((e) => e.error && THROTTLED.test(e.error));
            const timedOut = events.filter((e) => e.error && TIMEOUT.test(e.error) && !THROTTLED.test(e.error));
            const timed = events.filter((e) => e.source === "trace" && duration(e) !== undefined);
            const nearLimit = timed.filter((e) => duration(e)! >= SANDBOX_LIMIT_MS * 0.75 && !timedOut.includes(e));
            const slow = timed.filter((e) => isSync(e) && duration(e)! >= ctx.settings.slowPluginSeconds * 1000 && !nearLimit.includes(e) && !timedOut.includes(e));

            const push = (kind: string, severity: Severity, title: string, list: TimelineEvent[], lines: string[]) =>
                out.push({
                    kind: "finding",
                    id: `performance:${kind}:${key}`,
                    rule: "performance",
                    severity,
                    title,
                    explanation: lines.join(" "),
                    evidence: list.slice(0, 5).map((e) => h.eventEvidence(e, `${fmtTime(e.time)} · ${e.operation}${duration(e) !== undefined ? ` · ${seconds(duration(e)!)}` : ""}`)),
                    confidence: "high",
                });

            if (throttled.length) {
                push("throttled", "high", `${name} hit Dataverse service protection limits ${times(throttled.length)}`, throttled, [
                    `Dataverse rejected requests because too many were sent, or they used too much execution time, in a short period (first at ${fmtTime(throttled[0].time)}).`,
                    "Work done by throttled requests didn't happen. Integrations should retry after the delay Dataverse returns; spreading load or batching helps.",
                    `Error: ${throttled[0].error}`,
                ]);
            }
            if (timedOut.length) {
                push("timeout", "high", `${name} timed out ${times(timedOut.length)}`, timedOut, [
                    `First at ${fmtTime(timedOut[0].time)}.`,
                    events[0].source === "trace" ? "Plugins in the sandbox are stopped after 2 minutes, and the operation that triggered a synchronous plugin is rolled back." : "",
                    "Long calls to external services and large queries are the usual causes.",
                    `Error: ${timedOut[0].error}`,
                ].filter(Boolean));
            }
            if (nearLimit.length) {
                const max = Math.max(...nearLimit.map((e) => duration(e)!));
                push("near-limit", "medium", `${name} ran close to the 2-minute plugin limit`, nearLimit, [
                    `It took up to ${seconds(max)} (${nearLimit.length} run(s) over 90 seconds). A little more data or a slower external call will make it time out and fail.`,
                ]);
            }
            if (slow.length) {
                const max = Math.max(...slow.map((e) => duration(e)!));
                const avg = slow.reduce((a, e) => a + duration(e)!, 0) / slow.length;
                push("slow", slow.length > 2 || max > 30_000 ? "medium" : "low", `Synchronous plugin ${name} is slow`, slow, [
                    `${slow.length} run(s) took over ${ctx.settings.slowPluginSeconds}s (average ${seconds(avg)}, longest ${seconds(max)}).`,
                    "Synchronous plugins hold up the user or integration that made the change, and add to the time the whole request takes.",
                ]);
            }
        }
        return out;
    },
};

function seconds(ms: number): string {
    return ms >= 10_000 ? `${Math.round(ms / 1000)}s` : `${(ms / 1000).toFixed(1)}s`;
}

function times(n: number): string {
    return n === 1 ? "once" : `${n} times`;
}
