import type { RuleOutput } from "../model/types";
import { RuleHelpers, type Rule, type RuleContext } from "./context";

const EXPLAIN: Record<string, string> = {
    calculated:
        "Its value is worked out from other columns every time the record is read, so nothing ever writes it — audit, plugins and flows never see it change. To find out why it has this value, look at the columns its formula uses (their changes are on the Timeline).",
    formula:
        "It's a Power Fx formula column: its value is worked out from other columns when the record is read, so nothing ever writes it and audit never records a change. Look at the columns the formula uses — their changes are on the Timeline.",
    rollup:
        "Its value is stored, but it's recalculated by a scheduled system job (incrementally, by default every hour) or when someone recalculates it on the form. Changes to the related records it adds up only show after the next recalculation, and the recalculation itself isn't audited as a change by a user.",
};

/** Explains why a calculated / rollup / formula column of interest has no change history. */
export const computedRule: Rule = {
    id: "computed",
    title: "Computed columns",
    run(ctx: RuleContext): RuleOutput[] {
        const column = ctx.input.column;
        if (!column) return [];
        const c = ctx.wiring.computed?.find((x) => x.table === ctx.input.table && x.column === column);
        if (!c) return [];
        const h = new RuleHelpers(ctx);
        const rollupJobs = c.kind === "rollup" ? ctx.timeline.events.filter((e) => e.source === "async" && /rollup/i.test(`${e.actor.name} ${e.operation}`)) : [];
        return [
            {
                kind: "finding",
                id: `computed:${c.table}:${c.column}`,
                rule: "computed",
                severity: "info",
                title: `${column} is a ${c.kind} column, so it has no change history of its own`,
                explanation: [EXPLAIN[c.kind], rollupJobs.length ? `${rollupJobs.length} rollup recalculation job(s) are on the Timeline.` : ""].filter(Boolean).join(" "),
                evidence: rollupJobs.slice(0, 3).map((e) => h.eventEvidence(e)),
                confidence: "high",
            },
        ];
    },
};
