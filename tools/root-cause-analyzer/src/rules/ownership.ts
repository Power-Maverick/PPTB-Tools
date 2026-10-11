import type { RuleOutput, Severity, TimelineEvent } from "../model/types";
import { parsePrivilegeError } from "../parse/privilegeError";
import { fmtTime, quote, RuleHelpers, unavailable, type Rule, type RuleContext } from "./context";

const ACCESS_MESSAGES = new Set(["GrantAccess", "ModifyAccess", "RevokeAccess"]);

/**
 * Ownership and access: owner changes and shares in the window, especially when access errors follow —
 * a common reason a user suddenly can't see or edit a record.
 */
export const ownershipRule: Rule = {
    id: "ownership",
    title: "Ownership and access",
    run(ctx: RuleContext): RuleOutput[] {
        if (!ctx.sources["history.audit"].available) {
            return [unavailable("ownership", "Ownership and access changes", `Unavailable — ${ctx.sources["history.audit"].reason ?? "audit history can't be read"}`)];
        }
        const h = new RuleHelpers(ctx);
        const out: RuleOutput[] = [];
        const accessErrors = ctx.timeline.events.filter((e) => e.source !== "audit" && parsePrivilegeError(e.error));

        for (const e of ctx.timeline.events) {
            if (e.source !== "audit" || !e.record) continue;
            const ownerChange = e.changes?.find((c) => c.column === "ownerid") ?? (e.messageName === "Assign" ? { column: "ownerid", oldValue: undefined, newValue: undefined } : undefined);
            const isShare = ACCESS_MESSAGES.has(e.messageName ?? "");
            if (!ownerChange && !isShare) continue;

            const later = accessErrors.filter((x) => x.time >= e.time && (x.record?.id === e.record!.id || h.chain(x.id).some((c) => c.record?.id === e.record!.id) || !x.record));
            const chain = h.chain(e.id);
            const via = chain.filter((c) => c.source !== "audit").map((c) => c.actor.name);
            const cascade = h.chainLinks(e.id).find((l) => /cascad/i.test(l.reason));
            const record = h.recordLabel(e.record);
            const severity: Severity = later.length ? "medium" : "low";

            const what = ownerChange
                ? `Owner of ${record} changed${ownerChange.oldValue || ownerChange.newValue ? ` from ${quote(ownerChange.oldValue)} to ${quote(ownerChange.newValue)}` : ""}`
                : e.messageName === "RevokeAccess"
                  ? `${record} was unshared`
                  : `${record} was shared${e.messageName === "ModifyAccess" ? " with different access" : ""}`;
            const share = isShare ? e.changes?.[0] : undefined;
            out.push({
                kind: "finding",
                id: `ownership:${e.id}`,
                rule: "ownership",
                severity,
                title: what,
                explanation: [
                    `${fmtTime(e.time)}: ${e.actor.name}${via.length ? ` (via ${via.join(" → ")})` : ""}${cascade ? `, cascaded from a change to a parent record (${cascade.reason})` : ""}.`,
                    share ? `${share.column}: ${quote(share.oldValue)} → ${quote(share.newValue)}.` : "",
                    ownerChange ? "Who owns a record decides who can see and edit it through their security roles' access levels (user, business unit, organization)." : "",
                    later.length ? `Access errors followed (${later.length}), first at ${fmtTime(later[0].time)}: ${later[0].error?.split("\n")[0]}` : "",
                ]
                    .filter(Boolean)
                    .join(" "),
                evidence: [h.eventEvidence(e), ...chain.slice(-2).map((c) => h.eventEvidence(c)), ...later.slice(0, 3).map((x: TimelineEvent) => h.eventEvidence(x, `Access error · ${fmtTime(x.time)}`))],
                confidence: "high",
            });
        }
        return out;
    },
};
