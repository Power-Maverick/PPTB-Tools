import type { RuleOutput, TimelineEvent } from "../model/types";
import { fmtGap, fmtTime, quote, RuleHelpers, unavailable, type Rule, type RuleContext } from "./context";

export const CONCURRENCY = /ConcurrencyVersionMismatch|0x80060882|deadlock|was deadlocked|optimistic concurrency|record is being (updated|modified)|cannot (obtain|acquire) (a )?lock|lock (request )?time ?out/i;

/**
 * Race conditions: two independent writers changing the same columns of a record within seconds,
 * system jobs running on the same record at the same time, and concurrency / deadlock errors.
 */
export const raceRule: Rule = {
    id: "race",
    title: "Race conditions",
    run(ctx: RuleContext): RuleOutput[] {
        const out: RuleOutput[] = [];
        const h = new RuleHelpers(ctx);
        const windowMs = ctx.settings.raceWindowSeconds * 1000;
        const ms = (e: TimelineEvent) => new Date(e.time).getTime();

        // 1. Two writers, same record, same columns, within seconds, neither caused by the other.
        if (!ctx.sources["history.audit"].available) {
            out.push(unavailable("race", "Simultaneous writers", `Unavailable — ${ctx.sources["history.audit"].reason ?? "audit history can't be read"}`, "writers"));
        } else {
            const byRecord = new Map<string, TimelineEvent[]>();
            for (const e of ctx.timeline.events) if (e.source === "audit" && e.record && e.messageName === "Update") byRecord.set(e.record.id, [...(byRecord.get(e.record.id) ?? []), e]);
            for (const events of byRecord.values()) {
                const sorted = [...events].sort((a, b) => ms(a) - ms(b));
                for (let i = 0; i < sorted.length; i++) {
                    for (let j = i + 1; j < sorted.length && ms(sorted[j]) - ms(sorted[i]) <= windowMs; j++) {
                        const [a, b] = [sorted[i], sorted[j]];
                        if (a.actor.key === b.actor.key || h.related(a, b)) continue;
                        const shared = (a.changedColumns ?? []).filter((c) => b.changedColumns?.includes(c));
                        if (!shared.length) continue;
                        const isTarget = h.isTarget(a);
                        const focus = isTarget && ctx.input.column ? shared.includes(ctx.input.column) : true;
                        const values = shared.slice(0, 3).map((c) => {
                            const av = a.changes?.find((x) => x.column === c)?.newValue;
                            const bv = b.changes?.find((x) => x.column === c)?.newValue;
                            return a.changes && b.changes ? `${c}: ${a.actor.name} wrote ${quote(av)}, then ${b.actor.name} wrote ${quote(bv)}` : c;
                        });
                        out.push({
                            kind: "finding",
                            id: `race:${a.id}:${b.id}`,
                            rule: "race",
                            severity: focus && isTarget ? "high" : "medium",
                            title: `${a.actor.name} and ${b.actor.name} changed ${shared.slice(0, 3).join(", ")} on ${h.recordLabel(a.record)} ${fmtGap(ms(b) - ms(a))} apart`,
                            explanation: [
                                `${fmtTime(a.time)} and ${fmtTime(b.time)} — two independent writers (neither caused the other) changed the same column(s): ${values.join("; ")}.`,
                                "Dataverse keeps the last write, so which value wins depends on timing. That makes the result look random.",
                                "Usual fixes: make one system the owner of the column, or have writers check the row version (optimistic concurrency) before updating.",
                            ].join(" "),
                            evidence: [h.eventEvidence(a), h.eventEvidence(b)],
                            confidence: a.changes && b.changes ? "high" : "medium",
                        });
                    }
                }
            }
        }

        // 2. System jobs overlapping on the same record.
        const jobs = ctx.timeline.events.filter((e) => e.source === "async" && e.record);
        const now = ctx.now.getTime();
        const seen = new Set<string>();
        for (const a of jobs) {
            const overlapping = jobs.filter(
                (b) => b.id !== a.id && b.record!.id === a.record!.id && b.handlerId !== undefined && b.handlerId !== a.handlerId && ms(b) >= ms(a) && ms(b) < (a.endTime ? new Date(a.endTime).getTime() : now) && !h.related(a, b),
            );
            const group = [a, ...overlapping];
            const key = group.map((g) => g.id).sort().join("|");
            if (!overlapping.length || seen.has(key)) continue;
            seen.add(key);
            out.push({
                kind: "finding",
                id: `race:jobs:${key}`,
                rule: "race",
                severity: "medium",
                title: `${group.length} system jobs ran on ${h.recordLabel(a.record)} at the same time`,
                explanation: `${group.map((g) => `'${g.actor.name}'`).join(", ")} overlapped starting ${fmtTime(a.time)}. Jobs running in parallel on one record can overwrite each other or fail with concurrency errors.`,
                evidence: group.slice(0, 5).map((g) => h.eventEvidence(g)),
                confidence: "high",
            });
        }

        // 3. Concurrency / deadlock errors.
        const conflicts = ctx.timeline.events.filter((e) => e.error && CONCURRENCY.test(e.error));
        if (conflicts.length) {
            out.push({
                kind: "finding",
                id: "race:errors",
                rule: "race",
                severity: "high",
                title: `${conflicts.length} concurrency error${conflicts.length === 1 ? "" : "s"} (conflicting updates or deadlocks)`,
                explanation: `e.g. ${conflicts[0].operation} at ${fmtTime(conflicts[0].time)}: ${conflicts[0].error?.split("\n")[0]}. Two requests tried to change the same data at once; one of them failed.`,
                evidence: conflicts.slice(0, 5).map((e) => h.eventEvidence(e)),
                confidence: "high",
            });
        }
        return out;
    },
};
