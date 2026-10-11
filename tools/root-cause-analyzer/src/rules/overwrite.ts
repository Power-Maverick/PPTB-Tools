import type { Confidence, Finding, RuleOutput, Severity, TimelineEvent, ValueChange } from "../model/types";
import { weakest } from "../model/types";
import { fmtGap, fmtTime, quote, RuleHelpers, unavailable, type Rule, type RuleContext } from "./context";

/**
 * Overwrite: a value set by one actor was replaced by a different actor shortly after.
 * Audit says *that* it happened (certain); the cause chain says *who/what* did it (may be stitched).
 */
export const overwriteRule: Rule = {
    id: "overwrite",
    title: "Overwritten changes",
    run(ctx: RuleContext): RuleOutput[] {
        if (!ctx.sources["history.audit"].available) {
            return [unavailable("overwrite", "Overwritten changes", `Unavailable — ${ctx.sources["history.audit"].reason ?? "audit history can't be read"}`)];
        }
        const h = new RuleHelpers(ctx);
        const windowMs = ctx.settings.overwriteWindowHours * 3_600_000;
        const out: RuleOutput[] = [];
        const audit = ctx.timeline.events.filter((e) => e.source === "audit" && e.record).sort((a, b) => a.time.localeCompare(b.time));
        const targetComponent = connectedToTarget(ctx, h);
        let valuesMissing = false;

        const byRecord = new Map<string, TimelineEvent[]>();
        for (const e of audit) byRecord.set(e.record!.id, [...(byRecord.get(e.record!.id) ?? []), e]);

        for (const [recordId, events] of byRecord) {
            const isTarget = recordId === ctx.input.recordId;
            const columns = new Map<string, Array<{ e: TimelineEvent; change?: ValueChange }>>();
            for (const e of events) {
                if (e.changes) for (const c of e.changes) columns.set(c.column, [...(columns.get(c.column) ?? []), { e, change: c }]);
                else {
                    valuesMissing ||= !!e.changedColumns?.length;
                    for (const c of e.changedColumns ?? []) columns.set(c, [...(columns.get(c) ?? []), { e }]);
                }
            }
            for (const [column, seq] of columns) {
                if (isTarget && ctx.input.column && column !== ctx.input.column) continue;
                for (let i = 0; i + 1 < seq.length; i++) {
                    const a = seq[i];
                    const b = seq[i + 1];
                    const gap = new Date(b.e.time).getTime() - new Date(a.e.time).getTime();
                    if (gap > windowMs || a.e.actor.key === b.e.actor.key) continue;
                    if (a.change && b.change && (b.change.newValue === a.change.newValue || a.e.messageName === "Delete")) continue;
                    if (!isTarget && !targetComponent.has(a.e.id) && !targetComponent.has(b.e.id)) continue;
                    // Independent writes seconds apart are reported by the race rule instead.
                    if (gap <= ctx.settings.raceWindowSeconds * 1000 && !h.related(a.e, b.e)) continue;
                    out.push(buildFinding(h, column, a, b, gap, isTarget));
                }
            }
        }
        if (valuesMissing) {
            out.push(unavailable("overwrite", "Old → new values", "Unavailable — old → new values couldn't be read, so some overwrites are based on which columns changed only.", "values"));
        }
        return out;
    },
};

function buildFinding(h: RuleHelpers, column: string, a: { e: TimelineEvent; change?: ValueChange }, b: { e: TimelineEvent; change?: ValueChange }, gap: number, isTarget: boolean): Finding {
    const chain = h.chain(b.e.id);
    const root = chain[0];
    const via = chain.filter((c) => c.source !== "audit").map((c) => c.actor.name);
    const attribution = chain.length ? h.chainConfidence(b.e.id) : "high";
    const confidence: Confidence = a.change && b.change ? attribution : weakest(attribution, "medium");

    // Who really made the first change: a flow/plugin in its cause chain, otherwise the audited user.
    const aVia = h.chain(a.e.id).filter((c) => c.source !== "audit").map((c) => c.actor.name);
    const aAuthor = aVia.length ? aVia[aVia.length - 1] : undefined;
    const userThenAutomation = !aAuthor && a.e.actor.kind === "user" && (b.e.actor.kind !== "user" || via.length > 0);
    const consequence = chain.some((c) => c.id === a.e.id);
    let severity: Severity = consequence ? "low" : userThenAutomation ? "high" : "medium";
    if (!isTarget && !consequence) severity = severity === "high" ? "medium" : "low";

    const record = h.recordLabel(a.e.record);
    const who = (e: TimelineEvent) => `${e.actor.name}${e.actor.kind === "app" ? " (integration / application user)" : e.actor.kind === "system" ? " (system)" : ""}`;
    const viaText = via.length ? ` via ${[...new Set(via)].join(" → ")}` : "";
    const rootText = root && root.id !== b.e.id && root.record?.id !== b.e.record?.id ? `, triggered by ${root.operation} of ${h.recordLabel(root.record)} by ${who(root)}` : "";
    const values = a.change && b.change ? `from ${quote(a.change.oldValue)} to ${quote(a.change.newValue)}` : "";
    const after = a.change && b.change ? `back to ${quote(b.change.newValue)}` : "again";

    const uncertain = h.chainLinks(b.e.id).filter((l) => l.kind === "stitched" && l.confidence !== "high");
    const explanation = [
        `${fmtTime(a.e.time)}: ${who(a.e)}${aAuthor ? ` (via ${aAuthor})` : ""} changed ${column} ${values}`.trim() + ".",
        `${fmtTime(b.e.time)} (${fmtGap(gap)} later): ${who(b.e)} changed it ${after}${viaText}${rootText}.`,
        a.change && b.change ? "" : "Values aren't available, so this is based on which columns changed.",
        uncertain.length ? `The link to ${via.join(" → ") || "the cause"} is inferred, not certain: ${uncertain.map((l) => l.reason).join("; ")}.` : "",
    ]
        .filter(Boolean)
        .join(" ");

    return {
        kind: "finding",
        id: `overwrite:${b.e.id}:${column}`,
        rule: "overwrite",
        severity,
        title: consequence
            ? `${column} on ${record} was changed again by ${via[via.length - 1] ?? b.e.actor.name} as a result of ${a.e.actor.name}'s change`
            : `${aAuthor ? `${aAuthor}'s` : a.e.actor.kind === "user" ? "A user's" : `${a.e.actor.name}'s`} change to ${column} on ${record} was overwritten by ${b.e.actor.name}${via.length ? ` (via ${via[via.length - 1]})` : ""}`,
        explanation,
        evidence: [h.eventEvidence(a.e, `Change by ${a.e.actor.name}`), h.eventEvidence(b.e, `Overwrite by ${b.e.actor.name}`), ...chain.map((c) => h.eventEvidence(c))],
        confidence,
    };
}

/** Events linked (in either direction) to an event on the target record. */
function connectedToTarget(ctx: RuleContext, h: RuleHelpers): Set<string> {
    const adj = new Map<string, string[]>();
    for (const l of ctx.timeline.links) {
        adj.set(l.from, [...(adj.get(l.from) ?? []), l.to]);
        adj.set(l.to, [...(adj.get(l.to) ?? []), l.from]);
    }
    const seen = new Set<string>();
    const queue = ctx.timeline.events.filter((e) => h.isTarget(e)).map((e) => e.id);
    while (queue.length) {
        const id = queue.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push(...(adj.get(id) ?? []));
    }
    return seen;
}
