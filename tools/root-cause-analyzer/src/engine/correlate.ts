/**
 * Correlation engine (pure).
 *
 * Exact links: shared correlation ID (ordered by depth), shared audit transaction, record ID found in
 * a run's own data. Stitched links: timing + table/message + identity + declared writes; these always
 * carry a confidence and are never presented as certain.
 */
import type { AnalysisSettings, CascadeRule, Confidence, EventLink, TimelineEvent, WiringHandler } from "../model/types";
import type { InferredWrite } from "./graph";

export interface CorrelateInput {
    events: TimelineEvent[];
    handlers: Map<string, WiringHandler>;
    /** Lower-case record IDs in scope */
    scopeIds: Set<string>;
    settings: Pick<AnalysisSettings, "flowTriggerWindowMinutes">;
    /** Relationship cascade rules between tables in scope. */
    cascades?: CascadeRule[];
}

/** Message on the child → the CascadeConfiguration behaviour that would cause it. */
const CASCADE_KEY: Record<string, string> = { Assign: "Assign", GrantAccess: "Share", ModifyAccess: "Share", RevokeAccess: "Unshare", Delete: "Delete" };

export interface CorrelateOutput {
    links: EventLink[];
    parentOf: Record<string, string>;
    /** Events that belong to the records in scope (trace/flow runs for other records are dropped). */
    kept: TimelineEvent[];
    hidden: { trace: number; flowrun: number };
    inferredWrites: InferredWrite[];
}

const t = (e: TimelineEvent) => new Date(e.time).getTime();
const end = (e: TimelineEvent) => (e.endTime ? new Date(e.endTime).getTime() : t(e));
const SECOND = 1000;
const eqi = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const LINK_SCORE = (l: EventLink) => (l.kind === "exact" ? 10 : 0) + (l.confidence === "high" ? 3 : l.confidence === "medium" ? 2 : 1);

/** Match a trace/async execution to a wiring handler: by id when known, otherwise by type name + table + message. */
export function matchHandler(e: TimelineEvent, handlers: Map<string, WiringHandler>): WiringHandler | undefined {
    if (e.handlerId && handlers.has(e.handlerId)) return handlers.get(e.handlerId);
    if (e.source === "trace") {
        return [...handlers.values()].find((h) => h.kind === "plugin" && eqi(h.typeName, e.handlerName) && h.table === e.table && h.messages.some((m) => eqi(m, e.messageName)));
    }
    if (e.source === "async" && e.handlerName) {
        return [...handlers.values()].find((h) => (h.kind === "workflow" || h.kind === "plugin") && (eqi(h.name, e.handlerName) || eqi(h.typeName, e.handlerName)));
    }
    return undefined;
}

export function changeMatchesFilter(e: TimelineEvent, h: WiringHandler): boolean | "unknown" {
    if (!eqi(e.messageName, "Update") || !h.filteringColumns) return true;
    if (!e.changedColumns?.length) return "unknown";
    return e.changedColumns.some((c) => h.filteringColumns!.includes(c));
}

export function correlate(input: CorrelateInput): CorrelateOutput {
    const { events, handlers, scopeIds } = input;
    const links: EventLink[] = [];
    const linkKey = new Set<string>();
    const add = (link: EventLink) => {
        const key = `${link.from}>${link.to}`;
        if (link.from === link.to || linkKey.has(key) || linkKey.has(`${link.to}>${link.from}`)) return;
        linkKey.add(key);
        links.push(link);
    };

    const audit = events.filter((e) => e.source === "audit" && e.record && scopeIds.has(e.record.id));
    const traces = events.filter((e) => e.source === "trace");
    const asyncJobs = events.filter((e) => e.source === "async");
    const flowRuns = events.filter((e) => e.source === "flowrun");

    // Correlation groups (trace + async share correlation IDs within a request chain).
    const groups = new Map<string, TimelineEvent[]>();
    for (const e of [...traces, ...asyncJobs]) {
        if (!e.correlationId) continue;
        groups.set(e.correlationId, [...(groups.get(e.correlationId) ?? []), e]);
    }

    // 1. Which trace rows belong to the records in scope?
    const keptIds = new Set<string>();
    const keptCorrelations = new Set<string>();
    for (const x of traces) {
        if (x.searchText && [...scopeIds].some((id) => x.searchText!.includes(id))) {
            keptIds.add(x.id);
            if (x.correlationId) keptCorrelations.add(x.correlationId);
        }
    }
    for (const j of asyncJobs) {
        if (j.record && scopeIds.has(j.record.id) && j.correlationId) keptCorrelations.add(j.correlationId);
    }

    // 2. Audit change → plugin execution that it triggered (stitched by table, message and timing).
    const proposals: Array<{ e: TimelineEvent; root: TimelineEvent; idInOutput: boolean; link: EventLink }> = [];
    for (const e of audit) {
        const candidates = traces.filter((x) => x.table === e.table && eqi(x.messageName, e.messageName) && t(x) >= t(e) - 5 * SECOND && t(x) <= t(e) + 2 * SECOND);
        if (!candidates.length) continue;
        const byGroup = new Map<string, TimelineEvent[]>();
        for (const c of candidates) byGroup.set(c.correlationId ?? c.id, [...(byGroup.get(c.correlationId ?? c.id) ?? []), c]);
        const withId = candidates.filter((c) => c.searchText?.includes(e.record!.id));
        for (const [groupKey, members] of byGroup) {
            const root = members.reduce((a, b) => ((a.depth ?? 1) <= (b.depth ?? 1) ? a : b));
            const idInOutput = withId.some((w) => (w.correlationId ?? w.id) === groupKey);
            const nearest = Math.min(...members.map((m) => Math.abs(t(m) - t(e))));
            let confidence: Confidence;
            if (idInOutput) confidence = "high";
            else if (byGroup.size === 1 && nearest <= 2 * SECOND) confidence = "medium";
            else confidence = "low";
            // With several candidate requests and no ID in output, only keep the ones that are plausible.
            if (byGroup.size > 3 && !idInOutput) continue;
            proposals.push({
                e,
                root,
                idInOutput,
                link: {
                    from: e.id,
                    to: root.id,
                    kind: "stitched",
                    confidence,
                    reason: idInOutput
                        ? "the record ID appears in the plugin's trace output, and it ran at the same time as this change"
                        : `same table and message, ${Math.round(nearest / 100) / 10}s apart${byGroup.size > 1 ? ` (${byGroup.size} requests ran at that moment)` : ""}`,
                },
            });
            keptIds.add(root.id);
            if (root.correlationId) keptCorrelations.add(root.correlationId);
        }
    }
    // Each plugin execution has exactly one trigger: prefer a change whose record ID is in the trace output,
    // then the nearest change at or before the plugin started (a later change on the same table is more
    // likely the plugin's own write-back than its trigger).
    const byRoot = new Map<string, typeof proposals>();
    for (const p of proposals) byRoot.set(p.root.id, [...(byRoot.get(p.root.id) ?? []), p]);
    for (const list of byRoot.values()) {
        // Post-operation plugins start after their trigger is audited; pre-operation ones may start just before it,
        // so "at or before" wins first and the nearest after is the fallback.
        const rank = (p: (typeof proposals)[number]) => [p.idInOutput ? 0 : 1, t(p.e) <= t(p.root) ? 0 : 1, Math.abs(t(p.root) - t(p.e))];
        const best = [...list].sort((a, b) => {
            const [ra, rb] = [rank(a), rank(b)];
            return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
        })[0];
        add(best.link);
    }

    // Everything in a kept correlation group is part of the same request chain.
    for (const cid of keptCorrelations) for (const e of groups.get(cid) ?? []) keptIds.add(e.id);

    // 3. Exact: within a correlation group, depth d is caused by depth d-1.
    for (const members of groups.values()) {
        const sorted = [...members].sort((a, b) => t(a) - t(b) || (a.depth ?? 0) - (b.depth ?? 0));
        for (const y of sorted) {
            const d = y.depth ?? 1;
            if (d <= 1) continue;
            const parents = sorted.filter((p) => (p.depth ?? 1) === d - 1 && t(p) <= t(y) + SECOND);
            const parent = parents[parents.length - 1];
            if (parent) add({ from: parent.id, to: y.id, kind: "exact", confidence: "high", reason: `same request (correlation ID), depth ${d - 1} → ${d}` });
        }
    }

    const inferredWrites: InferredWrite[] = [];
    const incoming = (id: string) => links.filter((l) => l.to === id);
    const hasTrigger = (traceId: string) => links.some((l) => l.to === traceId && events.find((e) => e.id === l.from)?.source === "audit");

    // 4. Plugin → the changes it made (an audit row written while the plugin was running).
    const keptTraces = traces.filter((x) => keptIds.has(x.id));
    for (const e2 of audit) {
        const triggered = new Set(links.filter((l) => l.from === e2.id).map((l) => l.to));
        const running = keptTraces.filter((x) => {
            if (triggered.has(x.id) || t(e2) < t(x) - 50 || t(e2) > end(x) + 2 * SECOND) return false;
            // A plugin often updates its own record (same table and message). That's an effect — unless we
            // don't know what triggered the plugin, in which case this row might be the trigger itself.
            const sameOperation = x.table === e2.table && eqi(x.messageName, e2.messageName) && (x.depth ?? 1) === 1;
            return !sameOperation || hasTrigger(x.id);
        });
        if (!running.length) continue;
        const x = running.reduce((a, b) => ((b.depth ?? 0) > (a.depth ?? 0) || ((b.depth ?? 0) === (a.depth ?? 0) && t(b) > t(a)) ? b : a));
        const child = x.correlationId ? (groups.get(x.correlationId) ?? []).some((y) => (y.depth ?? 0) === (x.depth ?? 0) + 1 && y.table === e2.table && eqi(y.messageName, e2.messageName)) : false;
        // Plugins run as the calling user, so the change is audited under the same user as the request that ran the plugin.
        const trigger = links.find((l) => l.to === x.id && events.find((e) => e.id === l.from)?.source === "audit");
        const triggerUser = trigger ? events.find((e) => e.id === trigger.from)?.userId : undefined;
        const sameUser = !!triggerUser && (e2.userId === triggerUser || e2.callingUserId === triggerUser);
        add({
            from: x.id,
            to: e2.id,
            kind: "stitched",
            confidence: child || sameUser ? "medium" : "low",
            reason: [
                `written while ${x.actor.name} was running`,
                child ? `and the same request then ran ${e2.messageName} on ${e2.table}` : "",
                sameUser ? "under the same user as the request that ran the plugin" : "",
            ]
                .filter(Boolean)
                .join(", "),
        });
        const handler = matchHandler(x, handlers);
        if (handler && e2.messageName) inferredWrites.push({ handlerId: handler.id, write: { table: e2.table, columns: e2.changedColumns, operation: e2.messageName, kind: "inferred", reason: "seen in history" } });
    }

    // Trace rows at depth n+1 in the same request on another table → inferred writes.
    for (const x of keptTraces) {
        const handler = matchHandler(x, handlers);
        if (!handler || !x.correlationId) continue;
        for (const y of groups.get(x.correlationId) ?? []) {
            if (y.source === "trace" && (y.depth ?? 0) === (x.depth ?? 0) + 1 && y.messageName && t(y) >= t(x) && t(y) <= end(x) + SECOND) {
                inferredWrites.push({ handlerId: handler.id, write: { table: y.table, operation: y.messageName, kind: "inferred", reason: "seen in history" } });
            }
        }
    }

    // 5. System job ↔ the change that queued it (when no correlation link exists).
    for (const j of asyncJobs) {
        if (!j.record || !scopeIds.has(j.record.id) || incoming(j.id).length) continue;
        const before = audit.filter((e) => e.record!.id === j.record!.id && t(e) <= t(j) + SECOND && t(j) - t(e) <= 5 * SECOND);
        const e = before[before.length - 1];
        if (e) add({ from: e.id, to: j.id, kind: "stitched", confidence: before.length === 1 ? "medium" : "low", reason: "system job created right after this change on the same record" });
    }

    // 6. Cloud flow runs: the change that triggered them, and the changes they made.
    const windowMs = input.settings.flowTriggerWindowMinutes * 60 * SECOND;
    const keptFlowRuns = new Set<string>();
    for (const f of flowRuns) {
        const flow = f.handlerId ? handlers.get(f.handlerId) : undefined;
        if (!flow) continue;
        // Audit only lists columns whose value changed, so a filtering-column "mismatch" can't rule a change out:
        // prefer changes that match the filter, fall back to the others with low confidence.
        const timed = audit.filter((e) => e.table === flow.table && flow.messages.some((m) => eqi(m, e.messageName)) && t(f) >= t(e) - SECOND && t(f) - t(e) <= windowMs);
        const filtered = timed.filter((e) => changeMatchesFilter(e, flow) !== false);
        const candidates = filtered.length ? filtered : timed;
        const filterMismatch = !filtered.length && timed.length > 0;
        const exact = candidates.filter((e) => f.searchText?.includes(e.record!.id));
        if (exact.length) {
            const e = exact.reduce((a, b) => (t(b) > t(a) ? b : a));
            add({ from: e.id, to: f.id, kind: "exact", confidence: "high", reason: "the record ID is in the flow run's trigger data" });
            keptFlowRuns.add(f.id);
        } else if (candidates.length) {
            const e = candidates.reduce((a, b) => (t(b) > t(a) ? b : a));
            const gap = t(f) - t(e);
            const confidence: Confidence = !filterMismatch && candidates.length === 1 && gap <= 60 * SECOND ? "medium" : "low";
            add({
                from: e.id,
                to: f.id,
                kind: "stitched",
                confidence,
                reason: `flow started ${Math.max(0, Math.round(gap / SECOND))}s after this ${e.messageName} on ${e.table}${candidates.length > 1 ? ` (${candidates.length} changes could have triggered it)` : ""}${filterMismatch ? ", though the audited columns don't include its filtering columns" : ""}`,
            });
            keptFlowRuns.add(f.id);
        } else if (f.searchText && [...scopeIds].some((id) => f.searchText!.includes(id))) {
            keptFlowRuns.add(f.id);
        }
    }
    for (const e2 of audit) {
        if (incoming(e2.id).some((l) => l.kind === "exact")) continue;
        const runs = flowRuns.filter((f) => keptFlowRuns.has(f.id) && t(e2) >= t(f) && t(e2) <= (f.endTime ? end(f) + 5 * SECOND : t(f) + 10 * 60 * SECOND));
        for (const f of runs) {
            const flow = handlers.get(f.handlerId!);
            if (!flow) continue;
            const declared = flow.writes.some((w) => w.table === e2.table);
            const owner = !!flow.ownerId && (e2.userId === flow.ownerId || e2.callingUserId === flow.ownerId);
            if (!declared && !owner) continue;
            add({
                from: f.id,
                to: e2.id,
                kind: "stitched",
                confidence: declared && owner ? "medium" : "low",
                reason: [declared ? `the flow writes to ${e2.table}` : "", owner ? "the change was made by the flow owner's account" : "", "during the flow run"].filter(Boolean).join(", "),
            });
            if (!declared && e2.messageName) inferredWrites.push({ handlerId: flow.id, write: { table: e2.table, columns: e2.changedColumns, operation: e2.messageName, kind: "inferred", reason: "seen in history" } });
        }
    }

    // 7. Cascades: a child's Assign / Share / Delete right after the same operation on a parent whose
    //    relationship cascades it.
    for (const child of audit) {
        const key = CASCADE_KEY[child.messageName ?? ""];
        if (!key || incoming(child.id).length) continue;
        const rules = (input.cascades ?? []).filter((r) => r.child === child.table && r.behaviours[key]);
        if (!rules.length) continue;
        const parent = audit
            .filter((p) => p.id !== child.id && rules.some((r) => r.parent === p.table) && p.messageName === child.messageName && t(child) >= t(p) - SECOND && t(child) - t(p) <= 3 * SECOND)
            .sort((a, b) => Math.abs(t(child) - t(a)) - Math.abs(t(child) - t(b)))[0];
        if (!parent) continue;
        const rule = rules.find((r) => r.parent === parent.table)!;
        add({ from: parent.id, to: child.id, kind: "stitched", confidence: "medium", reason: `cascaded: the ${rule.relationship} relationship cascades ${key} from ${rule.parent} to ${rule.child}` });
    }

    // 8. Same database transaction (audit.transactionid) — only where nothing more specific explains it.
    const byTransaction = new Map<string, TimelineEvent[]>();
    for (const e of audit) if (e.transactionId) byTransaction.set(e.transactionId, [...(byTransaction.get(e.transactionId) ?? []), e]);
    for (const members of byTransaction.values()) {
        if (members.length < 2) continue;
        const sorted = [...members].sort((a, b) => t(a) - t(b));
        for (const e of sorted.slice(1)) {
            if (!incoming(e.id).length) add({ from: sorted[0].id, to: e.id, kind: "exact", confidence: "high", reason: "same database transaction" });
        }
    }

    // Parent = strongest incoming cause link, never creating a cycle.
    const parentOf: Record<string, string> = {};
    const createsCycle = (child: string, parent: string) => {
        let cur: string | undefined = parent;
        for (let i = 0; cur && i < 100; i++) {
            if (cur === child) return true;
            cur = parentOf[cur];
        }
        return false;
    };
    for (const link of [...links].sort((a, b) => LINK_SCORE(b) - LINK_SCORE(a))) {
        if (parentOf[link.to] || createsCycle(link.to, link.from)) continue;
        parentOf[link.to] = link.from;
    }

    const kept = events.filter((e) => {
        if (e.source === "trace") return keptIds.has(e.id);
        if (e.source === "flowrun") return keptFlowRuns.has(e.id);
        if (e.source === "async") return keptIds.has(e.id) || (!!e.record && scopeIds.has(e.record.id));
        return !!e.record && scopeIds.has(e.record.id);
    });
    const keptSet = new Set(kept.map((e) => e.id));
    return {
        links: links.filter((l) => keptSet.has(l.from) && keptSet.has(l.to)),
        parentOf: Object.fromEntries(Object.entries(parentOf).filter(([c, p]) => keptSet.has(c) && keptSet.has(p))),
        kept,
        hidden: { trace: traces.filter((x) => !keptIds.has(x.id)).length, flowrun: flowRuns.filter((f) => !keptFlowRuns.has(f.id)).length },
        inferredWrites,
    };
}

/** Walks parent links upward; returns the chain from the root cause down to (excluding) the event. */
export function causeChain(eventId: string, parentOf: Record<string, string>): string[] {
    const chain: string[] = [];
    let cur = parentOf[eventId];
    for (let i = 0; cur && i < 50; i++) {
        chain.unshift(cur);
        cur = parentOf[cur];
    }
    return chain;
}
