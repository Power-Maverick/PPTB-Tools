import { CONFIDENCE_RANK, SEVERITY_RANK, type RuleOutput } from "../model/types";
import type { Rule, RuleContext } from "./context";
import { duplicatesRule } from "./duplicates";
import { expectedMissingRule } from "./expectedMissing";
import { failureRule } from "./failure";
import { loopRule } from "./loop";
import { overwriteRule } from "./overwrite";
import { stuckAsyncRule } from "./stuckAsync";
import { computedRule } from "./computed";
import { configChangeRule } from "./configChange";
import { ownershipRule } from "./ownership";
import { performanceRule } from "./performance";
import { raceRule } from "./race";

export const RULES: Rule[] = [
    overwriteRule,
    expectedMissingRule,
    failureRule,
    loopRule,
    duplicatesRule,
    stuckAsyncRule,
    configChangeRule,
    performanceRule,
    ownershipRule,
    raceRule,
    computedRule,
];

/** Runs every rule in isolation; a rule that throws becomes an Unavailable result, never a crash. */
export function runRules(ctx: RuleContext, rules: Rule[] = RULES): RuleOutput[] {
    const out: RuleOutput[] = [];
    for (const rule of rules) {
        try {
            out.push(...rule.run(ctx));
        } catch (error) {
            out.push({ kind: "unavailable", id: `${rule.id}:error`, rule: rule.id, title: rule.title, reason: `Unavailable — the check failed: ${error instanceof Error ? error.message : String(error)}` });
        }
    }
    const seen = new Set<string>();
    return out
        .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
        .sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === "finding" ? -1 : 1;
            if (a.kind === "finding" && b.kind === "finding") return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
            return 0;
        });
}
