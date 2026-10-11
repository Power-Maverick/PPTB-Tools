import type {
    AnalysisInput,
    AnalysisSettings,
    ChildSet,
    Confidence,
    Evidence,
    EventLink,
    RuleId,
    RuleOutput,
    ScopeRecord,
    SourceId,
    SourceMap,
    Timeline,
    TimelineEvent,
    UnavailableFinding,
    WiringGraph,
    WiringHandler,
} from "../model/types";
import { recordKey, weakest } from "../model/types";
import { causeChain, matchHandler } from "../engine/correlate";

export interface RuleContext {
    input: AnalysisInput;
    timeline: Timeline;
    wiring: WiringGraph;
    sources: SourceMap;
    settings: AnalysisSettings;
    now: Date;
    children: ChildSet[];
    /** Problems while reading relationships / children, for the duplicate rule. */
    childWarnings?: string[];
}

export interface Rule {
    id: RuleId;
    title: string;
    run(ctx: RuleContext): RuleOutput[];
}

export class RuleHelpers {
    readonly events = new Map<string, TimelineEvent>();
    readonly handlers = new Map<string, WiringHandler>();
    readonly records = new Map<string, ScopeRecord>();
    private readonly linksTo = new Map<string, EventLink[]>();

    constructor(readonly ctx: RuleContext) {
        ctx.timeline.events.forEach((e) => this.events.set(e.id, e));
        ctx.wiring.handlers.forEach((h) => this.handlers.set(h.id, h));
        ctx.timeline.records.forEach((r) => this.records.set(recordKey(r.ref), r));
        for (const l of ctx.timeline.links) this.linksTo.set(l.to, [...(this.linksTo.get(l.to) ?? []), l]);
    }

    /** Root cause → … → parent of the event, as events. */
    chain(eventId: string): TimelineEvent[] {
        return causeChain(eventId, this.ctx.timeline.parentOf)
            .map((id) => this.events.get(id))
            .filter((e): e is TimelineEvent => !!e);
    }

    /** The link used as parent of each event in the chain (for confidence + reasons). */
    chainLinks(eventId: string): EventLink[] {
        const out: EventLink[] = [];
        let child = eventId;
        for (let i = 0; i < 50; i++) {
            const parent = this.ctx.timeline.parentOf[child];
            if (!parent) break;
            const link = (this.linksTo.get(child) ?? []).find((l) => l.from === parent);
            if (link) out.unshift(link);
            child = parent;
        }
        return out;
    }

    chainConfidence(eventId: string): Confidence {
        const links = this.chainLinks(eventId);
        return links.length ? weakest(...links.map((l) => l.confidence)) : "high";
    }

    /** Executions (trace / system job / flow run) that belong to a handler. */
    runsOf(handler: WiringHandler): TimelineEvent[] {
        return this.ctx.timeline.events.filter((e) => {
            if (e.source === "audit") return false;
            if (e.handlerId === handler.id || (handler.activationId && e.handlerId === `wf:${handler.activationId}`)) return true;
            return matchHandler(e, this.handlers)?.id === handler.id;
        });
    }

    /** True when `a` is in the cause chain of `b` (or the other way round). */
    related(a: TimelineEvent, b: TimelineEvent): boolean {
        return this.chain(b.id).some((c) => c.id === a.id) || this.chain(a.id).some((c) => c.id === b.id);
    }

    userName(userId: string | undefined): string | undefined {
        if (!userId) return undefined;
        return this.ctx.timeline.events.find((e) => e.userId === userId)?.actor.name;
    }

    incoming(eventId: string): EventLink[] {
        return this.linksTo.get(eventId) ?? [];
    }

    recordLabel(ref: { table: string; id: string } | undefined): string {
        if (!ref) return "a record";
        const rec = this.records.get(recordKey(ref));
        return rec?.name ? `${ref.table} '${rec.name}'` : `${ref.table} ${ref.id.slice(0, 8)}…`;
    }

    isTarget(e: TimelineEvent): boolean {
        return !!e.record && e.record.id === this.ctx.input.recordId;
    }

    eventEvidence(e: TimelineEvent, label?: string): Evidence {
        return { kind: "event", id: e.id, label: label ?? `${fmtTime(e.time)} · ${e.operation}` };
    }

    handlerEvidence(h: WiringHandler): Evidence {
        return { kind: "handler", id: h.id, label: `${KIND_LABEL[h.kind]} '${h.name}'` };
    }
}

export const KIND_LABEL: Record<WiringHandler["kind"], string> = {
    plugin: "Plugin step",
    workflow: "Workflow",
    "realtime-workflow": "Real-time workflow",
    businessrule: "Business rule",
    flow: "Cloud flow",
};

export function unavailable(rule: RuleId, title: string, reason: string, key = ""): UnavailableFinding {
    return { kind: "unavailable", id: `${rule}:unavailable:${key || title}`, rule, title, reason };
}

export function sourceReason(sources: SourceMap, ...ids: SourceId[]): string | undefined {
    const missing = ids.filter((id) => !sources[id].available);
    return missing.length === ids.length ? missing.map((id) => sources[id].reason ?? id).join("; ") : undefined;
}

export function fmtTime(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtGap(ms: number): string {
    const s = Math.round(Math.abs(ms) / 1000);
    if (s < 90) return `${s}s`;
    const m = Math.round(s / 60);
    if (m < 90) return `${m} min`;
    const h = Math.round(m / 6) / 10;
    if (h < 48) return `${h} h`;
    return `${Math.round(h / 24)} days`;
}

export function quote(value: string | undefined): string {
    return value === undefined || value === "" ? "(empty)" : `'${value.length > 80 ? `${value.slice(0, 80)}…` : value}'`;
}
