import { changeMatchesFilter, matchHandler } from "../engine/correlate";
import type { Confidence, Finding, RuleOutput, Severity, TimelineEvent, WiringHandler } from "../model/types";
import { fmtTime, KIND_LABEL, RuleHelpers, unavailable, type Rule, type RuleContext } from "./context";

const SECOND = 1000;
const eqi = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Expected but missing: the wiring says something should have run for a change, but there's no
 * execution. Explains why when it can (turned off, filtering columns, trigger conditions).
 */
export const expectedMissingRule: Rule = {
    id: "expected-missing",
    title: "Expected but missing",
    run(ctx: RuleContext): RuleOutput[] {
        const s = ctx.sources;
        if (!s["wiring.plugins"].available && !s["wiring.workflows"].available) {
            return [unavailable("expected-missing", "Expected but missing", `Unavailable — the registered plugins and processes can't be read (${s["wiring.plugins"].reason}; ${s["wiring.workflows"].reason})`)];
        }
        if (!s["history.audit"].available) {
            return [unavailable("expected-missing", "Expected but missing", `Unavailable — the changes that should have triggered automation can't be seen (${s["history.audit"].reason})`)];
        }
        const h = new RuleHelpers(ctx);
        const out: RuleOutput[] = [];
        const changes = ctx.timeline.events.filter((e) => e.source === "audit" && e.record && ["Create", "Update", "Delete"].includes(e.messageName ?? ""));
        const handlers = ctx.wiring.handlers.filter((x) => ctx.settings.includeSystemSteps || !x.system);

        // Per handler: the changes it should have reacted to, split by outcome.
        const off = new Map<WiringHandler, TimelineEvent[]>();
        const missing = new Map<WiringHandler, TimelineEvent[]>();
        const cannotVerify = new Map<WiringHandler, string>();

        for (const e of changes) {
            for (const handler of handlers) {
                if (handler.table !== e.table || !handler.messages.some((m) => eqi(m, e.messageName))) continue;
                const match = changeMatchesFilter(e, handler);
                // Skipped because of its column filter: that's working as designed, not a problem, so it's not a
                // finding. (The Timeline shows it on the change itself.)
                if (match === false) continue;
                if (!handler.enabled) {
                    push(off, handler, e);
                    continue;
                }
                const verify = canVerify(handler, ctx);
                if (verify !== true) {
                    cannotVerify.set(handler, verify);
                    continue;
                }
                const ran = ranFor(handler, e, ctx, h);
                if (ran === "ambiguous") cannotVerify.set(handler, "it ran for other records at the same moment, and this run couldn't be told apart");
                else if (!ran) push(missing, handler, e);
            }
        }

        for (const [handler, events] of off) {
            const kind = KIND_LABEL[handler.kind];
            const last = handler.modifiedOn ? ` It was last modified ${fmtTime(handler.modifiedOn)}${handler.modifiedByName ? ` by ${handler.modifiedByName}` : ""} — probably when it was turned off, but the exact time isn't recorded unless the process table is audited.` : "";
            out.push(
                finding(h, "off", handler, events, handler.kind === "businessrule" ? "medium" : "high", "high", `${kind} '${handler.name}' is turned off`, [
                    `It's registered on ${handler.messages.join(" / ")} of ${handler.table}${handler.filteringColumns ? ` (when ${handler.filteringColumns.join(", ")} change)` : ""} and would have run for ${count(events, "change")}, starting ${fmtTime(events[0].time)}.`,
                    `Its status is ${handler.state}, so it didn't run.${last}`,
                ]),
            );
        }

        for (const [handler, events] of missing) {
            const { severity, confidence, reasons } = explainMissing(handler, ctx);
            out.push(finding(h, "missing", handler, events, severity, confidence, `${KIND_LABEL[handler.kind]} '${handler.name}' didn't run`, [
                `It's on and registered on ${handler.messages.join(" / ")} of ${handler.table}, so it should have run for ${count(events, "change")} (first at ${fmtTime(events[0].time)}), but no execution was found.`,
                ...reasons,
            ]));
        }

        for (const [handler, reason] of cannotVerify) {
            out.push(unavailable("expected-missing", `Whether ${KIND_LABEL[handler.kind].toLowerCase()} '${handler.name}' ran`, `Unavailable — ${reason}`, handler.id));
        }
        return out;
    },
};

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
    map.set(key, [...(map.get(key) ?? []), value]);
}

function count(events: TimelineEvent[], noun: string) {
    return `${events.length} ${noun}${events.length === 1 ? "" : "s"}`;
}

function canVerify(handler: WiringHandler, ctx: RuleContext): true | string {
    const s = ctx.sources;
    switch (handler.kind) {
        case "businessrule":
            return "business rules leave no execution history";
        case "realtime-workflow":
            return "real-time workflows leave no execution history unless they fail";
        case "flow":
            return s["history.flowrun"].available || s["history.flowrunApi"].available ? true : `flow run history can't be read (${s["history.flowrun"].reason}; ${s["history.flowrunApi"].reason})`;
        case "workflow":
            return s["history.async"].available ? true : `system jobs can't be read (${s["history.async"].reason})`;
        case "plugin":
            if (handler.mode === "async") return s["history.async"].available || s["history.traceSuccess"].available ? true : `neither system jobs nor plugin trace logs can be read`;
            return s["history.traceSuccess"].available ? true : `successful plugin runs aren't logged (${s["history.traceSuccess"].reason})`;
    }
}

function ranFor(handler: WiringHandler, e: TimelineEvent, ctx: RuleContext, h: RuleHelpers): boolean | "ambiguous" {
    const t0 = new Date(e.time).getTime();
    const linkedFromE = new Set(ctx.timeline.links.filter((l) => l.from === e.id).map((l) => l.to));
    const lookahead = handler.kind === "flow" ? ctx.settings.flowTriggerWindowMinutes * 60 * SECOND : handler.mode === "async" ? 10 * 60 * SECOND : 5 * SECOND;
    const matches = (x: TimelineEvent) => x.handlerId === handler.id || (!!handler.activationId && x.handlerId === `wf:${handler.activationId}`) || matchHandler(x, h.handlers)?.id === handler.id;
    const ran = ctx.timeline.events.some((x) => {
        if (x.source === "audit") return false;
        const tx = new Date(x.time).getTime();
        const inWindow = tx >= t0 - 5 * SECOND && tx <= t0 + lookahead;
        if (!inWindow && !linkedFromE.has(x.id)) return false;
        if (!matches(x)) return false;
        // Async jobs and flow runs: must be about this record, or linked to the change.
        if (x.record && x.record.id !== e.record!.id && !linkedFromE.has(x.id)) return false;
        return true;
    });
    if (ran) return true;
    const unlinked = (ctx.timeline.unlinked ?? []).some((x) => {
        const tx = new Date(x.time).getTime();
        return tx >= t0 - 5 * SECOND && tx <= t0 + lookahead && matches(x);
    });
    return unlinked ? "ambiguous" : false;
}

function explainMissing(handler: WiringHandler, ctx: RuleContext): { severity: Severity; confidence: Confidence; reasons: string[] } {
    const reasons: string[] = [];
    let confidence: Confidence = "medium";
    let severity: Severity = "medium";
    if (handler.triggerConditions.length) {
        reasons.push(`It has trigger conditions that may have been false at the time (not evaluated by this tool): ${handler.triggerConditions.map((c) => `\`${c}\``).join("; ")}.`);
        confidence = "low";
        severity = "low";
    }
    if (handler.kind === "flow") {
        if (ctx.sources["history.flowrunApi"].available) confidence = handler.triggerConditions.length ? "low" : "high";
        else reasons.push("Flow runs were read from Dataverse, which only lists solution-aware flows and keeps runs for a limited time.");
    }
    if (handler.mode === "async" && handler.kind === "plugin" && handler.asyncAutoDelete) {
        reasons.push("This step deletes its system jobs when they succeed, so a missing job may only mean it succeeded.");
        confidence = "low";
        severity = "low";
    }
    if (handler.kind === "workflow" || (handler.kind === "plugin" && handler.mode === "async")) {
        if (ctx.sources["history.async"].partial) {
            reasons.push(`System jobs may be incomplete: ${ctx.sources["history.async"].reason}.`);
            confidence = "low";
        }
        reasons.push("Completed system jobs can be removed by bulk-delete jobs, which would also hide a run.");
    }
    if (handler.kind === "plugin" && handler.mode === "sync") reasons.push("Plugin trace logs are usually purged after 24 hours; if this change is older, the run may have been deleted.");
    return { severity, confidence, reasons };
}

function finding(h: RuleHelpers, kind: string, handler: WiringHandler, events: TimelineEvent[], severity: Severity, confidence: Confidence, title: string, lines: string[]): Finding {
    return {
        kind: "finding",
        id: `expected-missing:${kind}:${handler.id}`,
        rule: "expected-missing",
        severity,
        title,
        explanation: lines.join(" "),
        evidence: [h.handlerEvidence(handler), ...events.slice(0, 5).map((e) => h.eventEvidence(e, `${fmtTime(e.time)} · ${e.messageName} ${h.recordLabel(e.record)} by ${e.actor.name}`))],
        confidence,
    };
}
