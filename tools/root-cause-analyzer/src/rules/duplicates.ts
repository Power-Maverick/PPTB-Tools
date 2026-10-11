import type { ChildSet, RuleOutput } from "../model/types";
import { fmtTime, RuleHelpers, unavailable, type Rule, type RuleContext } from "./context";

const DISCRIMINATOR_NAME = /(type|category|role|kind|primary|default|main|purpose)/i;
const IMPORTANT_VALUE = /primary|main|default|billing|shipping/i;
const IGNORED = new Set(["statecode", "statuscode"]);

/** Columns that tell child records apart: the user's choice, or choice columns with telling names. */
export function discriminators(set: ChildSet, override: string): string[] {
    if (override.trim()) return [override.trim().toLowerCase()];
    return set.choiceColumns.filter((c) => !IGNORED.has(c) && DISCRIMINATOR_NAME.test(c));
}

/** Duplicate side effects: the same child pattern exists more than once under one parent. */
export const duplicatesRule: Rule = {
    id: "duplicate",
    title: "Duplicate side effects",
    run(ctx: RuleContext): RuleOutput[] {
        const out: RuleOutput[] = [];
        if (ctx.childWarnings?.length) out.push(unavailable("duplicate", "Some related records", `Unavailable — ${ctx.childWarnings.join("; ")}`, "children"));
        const h = new RuleHelpers(ctx);
        const override = ctx.settings.duplicateDiscriminator;
        for (const set of ctx.children) {
            const columns = discriminators(set, override);
            if (override && !columns.every((c) => set.records.some((r) => c in r.values))) continue;
            for (const column of columns) {
                const groups = new Map<string, typeof set.records>();
                for (const r of set.records) {
                    const v = r.values[column];
                    if (!v || v.raw === null || v.raw === undefined || v.raw === false) continue;
                    groups.set(v.label, [...(groups.get(v.label) ?? []), r]);
                }
                for (const [label, records] of groups) {
                    if (records.length < 2) continue;
                    const createdInWindow = records.filter((r) => r.createdOn && new Date(r.createdOn) >= ctx.input.from);
                    const creators = ctx.timeline.events.filter((e) => e.source === "audit" && e.messageName === "Create" && records.some((r) => r.id === e.record?.id));
                    const parent = h.recordLabel(set.parent);
                    out.push({
                        kind: "finding",
                        id: `duplicate:${set.parent.id}:${set.table}:${column}:${label}`,
                        rule: "duplicate",
                        severity: IMPORTANT_VALUE.test(label) ? "high" : "medium",
                        title: `${records.length} active ${set.table} records with ${column} = ${label} under ${parent}`,
                        explanation: [
                            `${parent} has ${records.length} active ${set.table} records (related by ${set.lookup}) where ${column} is ${label}; usually there should be one.`,
                            createdInWindow.length ? `${createdInWindow.length} of them ${createdInWindow.length === 1 ? "was" : "were"} created in this window (${createdInWindow.map((r) => fmtTime(r.createdOn!)).join(", ")}).` : "They were all created before this window.",
                            creators.length ? `Created by: ${[...new Set(creators.map((c) => `${c.actor.name}${h.chain(c.id).length ? ` via ${h.chain(c.id).filter((x) => x.source !== "audit").map((x) => x.actor.name).join(" → ") || "a chain"}` : ""}`))].join("; ")}.` : "",
                            override ? "" : `"${column}" was picked automatically as the column that tells these records apart; set a different one in Settings if that's wrong.`,
                        ]
                            .filter(Boolean)
                            .join(" "),
                        evidence: [
                            ...records.slice(0, 6).map((r) => ({ kind: "record" as const, id: `${set.table}:${r.id}`, label: `${set.table} ${r.name ?? r.id.slice(0, 8)}${r.createdOn ? ` · created ${fmtTime(r.createdOn)}` : ""}` })),
                            ...creators.slice(0, 4).map((c) => h.eventEvidence(c)),
                        ],
                        confidence: override ? "high" : "medium",
                    });
                }
            }
        }
        return out;
    },
};
