import { Badge, Button, Spinner, Text, Tooltip } from "@fluentui/react-components";
import { ArrowClockwise20Regular, CheckmarkCircle16Filled, ChevronDown16Regular, ChevronRight16Regular, DismissCircle16Filled, Info16Filled, Warning16Filled } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import type { CheckStatus, PreflightCheck } from "../model/types";

const STATUS_ICON: Record<CheckStatus, JSX.Element> = {
    ok: <CheckmarkCircle16Filled className="status-ok" />,
    info: <Info16Filled className="status-info" />,
    warning: <Warning16Filled className="status-warning" />,
    error: <DismissCircle16Filled className="status-error" />,
};

const GROUP_LABELS: Record<PreflightCheck["group"], string> = {
    connection: "Connection",
    tracing: "Plugin tracing",
    audit: "Auditing",
    access: "Read access",
    flows: "Cloud flows",
    schema: "Metadata",
};

const STATUS_RANK: Record<CheckStatus, number> = { error: 0, warning: 1, info: 2, ok: 3 };

interface Props {
    checks: PreflightCheck[];
    loading: boolean;
    error?: string;
    onRefresh: () => void;
}

export function PreflightPanel({ checks, loading, error, onRefresh }: Props) {
    const counts = useMemo(() => {
        const c = { error: 0, warning: 0, info: 0, ok: 0 };
        checks.forEach((check) => c[check.status]++);
        return c;
    }, [checks]);
    const [expanded, setExpanded] = useState(false);
    const showList = expanded || counts.error > 0;

    const grouped = useMemo(() => {
        const map = new Map<PreflightCheck["group"], PreflightCheck[]>();
        [...checks]
            .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])
            .forEach((check) => map.set(check.group, [...(map.get(check.group) ?? []), check]));
        return [...map.entries()];
    }, [checks]);

    return (
        <section className="panel preflight" aria-label="Preflight check">
            <header className="panel-header">
                <Button
                    appearance="transparent"
                    icon={showList ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
                    onClick={() => setExpanded(!showList)}
                    aria-expanded={showList}
                >
                    <Text weight="semibold">Preflight</Text>
                </Button>
                {loading ? (
                    <Spinner size="tiny" label="Checking environment…" />
                ) : (
                    <div className="preflight-counts">
                        {counts.error > 0 && <Badge color="danger">{counts.error} blocking</Badge>}
                        {counts.warning > 0 && <Badge color="warning">{counts.warning} warnings</Badge>}
                        <Badge appearance="outline" color="success">
                            {counts.ok + counts.info} ok
                        </Badge>
                    </div>
                )}
                <Tooltip content="Re-run preflight" relationship="label">
                    <Button appearance="subtle" icon={<ArrowClockwise20Regular />} onClick={onRefresh} disabled={loading} />
                </Tooltip>
            </header>

            {error && <div className="preflight-error">{error}</div>}

            {showList && !loading && (
                <div className="preflight-groups">
                    {grouped.map(([group, items]) => (
                        <div key={group} className="preflight-group">
                            <Text size={200} weight="semibold" className="muted">
                                {GROUP_LABELS[group]}
                            </Text>
                            <ul>
                                {items.map((check) => (
                                    <CheckRow key={check.id} check={check} />
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function CheckRow({ check }: { check: PreflightCheck }) {
    const hasMore = !!(check.impact || check.fix || check.details?.length);
    const [open, setOpen] = useState(check.status === "error");
    return (
        <li className={`check check-${check.status}`}>
            <div className="check-line">
                {STATUS_ICON[check.status]}
                <Text>{check.summary}</Text>
                {hasMore && (
                    <Button size="small" appearance="transparent" onClick={() => setOpen(!open)}>
                        {open ? "Less" : "More"}
                    </Button>
                )}
            </div>
            {open && hasMore && (
                <div className="check-more">
                    {check.impact && (
                        <p>
                            <strong>What's affected:</strong> {check.impact}
                        </p>
                    )}
                    {check.fix && (
                        <p>
                            <strong>How to fix:</strong> {check.fix}
                        </p>
                    )}
                    {check.details?.map((d, i) => (
                        <p key={i} className="muted">
                            {d}
                        </p>
                    ))}
                </div>
            )}
        </li>
    );
}
