import type { RuleOutput, Severity, TimelineEvent } from "../model/types";
import { describePrivilegeProblem, parsePrivilegeError } from "../parse/privilegeError";
import { fmtTime, RuleHelpers, unavailable, type Rule, type RuleContext } from "./context";

const FAILED = new Set(["failed", "suspended"]);

/** Failure: plugin exceptions, failed / suspended system jobs and failed flow runs, grouped by cause. */
export const failureRule: Rule = {
    id: "failure",
    title: "Failures",
    run(ctx: RuleContext): RuleOutput[] {
        const s = ctx.sources;
        const out: RuleOutput[] = [];
        if (!s["history.trace"].available) out.push(unavailable("failure", "Plugin failures", `Unavailable — ${s["history.trace"].reason}`, "trace"));
        if (!s["history.async"].available) out.push(unavailable("failure", "System job failures", `Unavailable — ${s["history.async"].reason}`, "async"));
        if (!s["history.flowrun"].available && !s["history.flowrunApi"].available) out.push(unavailable("failure", "Cloud flow failures", `Unavailable — ${s["history.flowrun"].reason}; ${s["history.flowrunApi"].reason}`, "flow"));

        const h = new RuleHelpers(ctx);
        const groups = new Map<string, TimelineEvent[]>();
        for (const e of ctx.timeline.events) {
            if (e.source === "audit" || !FAILED.has(e.status)) continue;
            const key = `${e.source}|${e.handlerId ?? e.actor.key}|${firstLine(e.error)}`;
            groups.set(key, [...(groups.get(key) ?? []), e]);
        }
        for (const [key, events] of groups) {
            const first = events[0];
            const sync = first.source === "trace" && !/asynchronous/i.test(first.operation);
            const what = first.source === "trace" ? `Plugin ${first.actor.name}` : first.source === "flowrun" ? `Cloud flow '${first.actor.name}'` : `System job '${first.actor.name}'`;
            const verb = first.status === "suspended" ? "is suspended" : "failed";
            const severity: Severity = sync ? "critical" : "high";
            const confidence = events.map((e) => (e.record && e.record.id === ctx.input.recordId ? "high" : h.chainConfidence(e.id))).reduce((a, b) => (a === "low" || b === "low" ? "low" : a === "medium" || b === "medium" ? "medium" : "high"));
            const chain = h.chain(first.id);
            const trigger = chain.find((c) => c.source === "audit");
            const permission = parsePrivilegeError(first.error);
            const userName = permission?.userId ? ctx.timeline.events.find((e) => e.userId === permission.userId)?.actor.name : undefined;
            out.push({
                kind: "finding",
                id: `failure:${key}`,
                rule: "failure",
                severity,
                title: `${what} ${verb}${events.length > 1 ? ` ${events.length} times` : ""}${permission ? ` — ${permission.kind === "missing-privilege" ? `missing ${permission.access} permission on ${permission.table}` : "no access to the record"}` : ""}`,
                explanation: [
                    `${fmtTime(first.time)}${events.length > 1 ? ` (and ${events.length - 1} more)` : ""}: ${first.operation}${first.record ? ` on ${h.recordLabel(first.record)}` : ""} ${verb}.`,
                    trigger ? `It ran because of ${trigger.messageName} of ${h.recordLabel(trigger.record)} by ${trigger.actor.name}.` : "",
                    sync ? "This was a synchronous plugin, so the operation that triggered it was rolled back and the caller got an error." : "",
                    permission ? `Cause: ${describePrivilegeProblem(permission, userName)}` : "",
                    first.error ? `Error: ${first.error}` : "No error text was recorded.",
                ]
                    .filter(Boolean)
                    .join(" "),
                evidence: [...events.slice(0, 5).map((e) => h.eventEvidence(e)), ...(trigger ? [h.eventEvidence(trigger, "Triggering change")] : [])],
                confidence,
            });
        }
        return out;
    },
};

function firstLine(text?: string): string {
    return (text ?? "").split(/\r?\n/)[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "<id>").slice(0, 160);
}
