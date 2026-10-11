import { Badge, Button, Text } from "@fluentui/react-components";
import { ChevronDown16Regular, ChevronRight16Regular, CheckmarkCircle20Regular, Copy16Regular, Info16Regular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import type { Evidence, Finding, RuleId, RuleOutput, Severity, UnavailableFinding } from "../model/types";
import { confidenceColor, SEVERITY_LABEL, severityColor } from "./format";

const RULE_LABEL: Record<RuleId, string> = {
    overwrite: "Overwrite",
    "expected-missing": "Expected but missing",
    failure: "Failure",
    loop: "Loop / depth",
    duplicate: "Duplicate side effects",
    "stuck-async": "Stuck async",
    "config-change": "Automation changed",
    performance: "Performance / limits",
    ownership: "Ownership / access",
    race: "Race condition",
    computed: "Computed column",
};

interface Props {
    findings: RuleOutput[];
    done: boolean;
    onNavigate: (evidence: Evidence) => void;
    /** Copies a text summary for an incident ticket; resolves to true on success. */
    onCopySummary?: () => Promise<boolean>;
}

export function Findings({ findings, done, onNavigate, onCopySummary }: Props) {
    const [copied, setCopied] = useState<"yes" | "no">();
    const real = useMemo(() => findings.filter((f): f is Finding => f.kind === "finding"), [findings]);
    const unavailable = useMemo(() => findings.filter((f): f is UnavailableFinding => f.kind === "unavailable"), [findings]);
    const [showUnavailable, setShowUnavailable] = useState(true);
    const counts = useMemo(() => {
        const c: Partial<Record<Severity, number>> = {};
        real.forEach((f) => (c[f.severity] = (c[f.severity] ?? 0) + 1));
        return c;
    }, [real]);

    if (!done) return <div className="empty">Findings are checked once the analysis finishes.</div>;

    return (
        <div className="findings">
            <div className="toolbar">
                {(Object.keys(SEVERITY_LABEL) as Severity[])
                    .filter((s) => counts[s])
                    .map((s) => (
                        <Badge key={s} color={severityColor(s)}>
                            {counts[s]} {SEVERITY_LABEL[s].toLowerCase()}
                        </Badge>
                    ))}
                {unavailable.length > 0 && (
                    <Badge appearance="outline" color="subtle">
                        {unavailable.length} couldn't be checked
                    </Badge>
                )}
                <span className="spacer" />
                {onCopySummary && (
                    <Button
                        size="small"
                        icon={<Copy16Regular />}
                        onClick={async () => {
                            setCopied((await onCopySummary()) ? "yes" : "no");
                            setTimeout(() => setCopied(undefined), 2500);
                        }}
                    >
                        {copied === "yes" ? "Copied" : copied === "no" ? "Couldn't copy" : "Copy summary"}
                    </Button>
                )}
            </div>

            {real.length === 0 && (
                <div className="empty">
                    <CheckmarkCircle20Regular className="status-ok" />
                    <Text>No problems found for these records in this window.</Text>
                    {unavailable.length > 0 && <Text className="muted">Some checks couldn't run — see below. A problem could be hiding there.</Text>}
                </div>
            )}

            {real.map((f) => (
                <FindingCard key={f.id} finding={f} onNavigate={onNavigate} />
            ))}

            {unavailable.length > 0 && (
                <section className="unavailable">
                    <Button appearance="transparent" icon={showUnavailable ? <ChevronDown16Regular /> : <ChevronRight16Regular />} onClick={() => setShowUnavailable(!showUnavailable)}>
                        Couldn't check ({unavailable.length})
                    </Button>
                    {showUnavailable && (
                        <ul>
                            {unavailable.map((u) => (
                                <li key={u.id}>
                                    <Info16Regular className="muted" />
                                    <span>
                                        <strong>
                                            {RULE_LABEL[u.rule]} · {u.title}:
                                        </strong>{" "}
                                        {u.reason}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </div>
    );
}

function FindingCard({ finding: f, onNavigate }: { finding: Finding; onNavigate: (e: Evidence) => void }) {
    return (
        <article className={`finding sev-${f.severity}`}>
            <header>
                <Badge color={severityColor(f.severity)}>{SEVERITY_LABEL[f.severity]}</Badge>
                <Text weight="semibold" className="finding-title">
                    {f.title}
                </Text>
            </header>
            <div className="finding-meta">
                <span className="muted">{RULE_LABEL[f.rule]}</span>
                <Badge size="small" appearance="tint" color={confidenceColor(f.confidence)}>
                    {`${f.confidence} confidence`}
                </Badge>
            </div>
            <p className="finding-text">{f.explanation}</p>
            <div className="evidence">
                <Text size={200} className="muted">
                    Evidence:
                </Text>
                {f.evidence.map((e, i) => (
                    <Button key={`${e.id}-${i}`} size="small" appearance="outline" onClick={() => onNavigate(e)} title={e.kind === "handler" ? "Show on Impact Map" : "Show on Timeline"}>
                        {e.label}
                    </Button>
                ))}
            </div>
        </article>
    );
}
