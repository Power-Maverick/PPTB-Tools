import { Badge, Button, Text, ToggleButton, Tooltip } from "@fluentui/react-components";
import { ChevronDown16Regular, ChevronRight16Regular, Link16Regular, Warning16Filled } from "@fluentui/react-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActorKind, AnalysisInput, EventLink, Timeline as TimelineData, TimelineEvent } from "../model/types";
import { recordKey } from "../model/types";
import { ACTOR_LABEL, confidenceColor, fmtDateTime, fmtMs, fmtTimelineTime, STATUS_LABEL, statusColor } from "./format";

const PAGE = 200;
const MAX_LANES = 10;

interface Props {
    timeline: TimelineData;
    input: AnalysisInput;
    focusId?: string;
    onFocusHandled?: () => void;
    onOpenHandler?: (handlerId: string) => void;
}

interface Row {
    event: TimelineEvent;
    level: number;
}

export function Timeline({ timeline, input, focusId, onFocusHandled, onOpenHandler }: Props) {
    const [hiddenKinds, setHiddenKinds] = useState<Set<ActorKind>>(new Set());
    const [nested, setNested] = useState(true);
    const [shown, setShown] = useState(PAGE);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [highlight, setHighlight] = useState<string>();
    const listRef = useRef<HTMLDivElement>(null);

    const recordNames = useMemo(() => new Map(timeline.records.map((r) => [recordKey(r.ref), r])), [timeline.records]);
    const incoming = useMemo(() => {
        const map = new Map<string, EventLink>();
        for (const l of timeline.links) if (timeline.parentOf[l.to] === l.from) map.set(l.to, l);
        return map;
    }, [timeline]);

    const lanes = useMemo(() => {
        const seen = new Map<string, { key: string; kind: ActorKind; name: string }>();
        for (const e of timeline.events) if (!seen.has(e.actor.key)) seen.set(e.actor.key, e.actor);
        const all = [...seen.values()];
        return all.length > MAX_LANES ? [...all.slice(0, MAX_LANES - 1), { key: "__other", kind: "system" as ActorKind, name: `${all.length - MAX_LANES + 1} more` }] : all;
    }, [timeline.events]);
    const laneIndex = (e: TimelineEvent) => {
        const i = lanes.findIndex((l) => l.key === e.actor.key);
        return i === -1 ? lanes.length - 1 : i;
    };

    const rows = useMemo<Row[]>(() => {
        const visible = timeline.events.filter((e) => !hiddenKinds.has(e.actor.kind));
        const visibleIds = new Set(visible.map((e) => e.id));
        if (!nested) return visible.map((event) => ({ event, level: 0 }));
        const children = new Map<string, TimelineEvent[]>();
        const roots: TimelineEvent[] = [];
        for (const e of visible) {
            const parent = timeline.parentOf[e.id];
            if (parent && visibleIds.has(parent)) children.set(parent, [...(children.get(parent) ?? []), e]);
            else roots.push(e);
        }
        const out: Row[] = [];
        const walk = (e: TimelineEvent, level: number) => {
            out.push({ event: e, level });
            for (const c of children.get(e.id) ?? []) walk(c, Math.min(level + 1, 8));
        };
        roots.forEach((r) => walk(r, 0));
        return out;
    }, [timeline, hiddenKinds, nested]);

    // Jump to an event from a finding.
    useEffect(() => {
        if (!focusId) return;
        const index = rows.findIndex((r) => r.event.id === focusId);
        if (index === -1) {
            // Hidden by a lane filter: clear filters and try again on the next render.
            if (hiddenKinds.size) setHiddenKinds(new Set());
            else onFocusHandled?.();
            return;
        }
        if (index >= shown) setShown(index + 20);
        setExpanded((prev) => new Set(prev).add(focusId));
        setHighlight(focusId);
        requestAnimationFrame(() => listRef.current?.querySelector(`[data-event-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
        onFocusHandled?.();
    }, [focusId, rows, shown, hiddenKinds, onFocusHandled]);

    const kinds = [...new Set(timeline.events.map((e) => e.actor.kind))];
    const toggleKind = (k: ActorKind) =>
        setHiddenKinds((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });

    if (!timeline.events.length) {
        return (
            <div className="empty">
                <Text>No activity was found for these records in this window.</Text>
                <Text className="muted">Check the preflight panel: if auditing, trace logging or read access is missing, history can't be shown.</Text>
            </div>
        );
    }

    return (
        <div className="timeline">
            <div className="toolbar">
                {kinds.map((k) => (
                    <ToggleButton key={k} size="small" checked={!hiddenKinds.has(k)} onClick={() => toggleKind(k)} className={`lane-toggle lane-${k}`}>
                        {ACTOR_LABEL[k]}
                    </ToggleButton>
                ))}
                <span className="spacer" />
                <ToggleButton size="small" checked={nested} onClick={() => setNested(!nested)}>
                    Nest by cause
                </ToggleButton>
                <Text size={200} className="muted">
                    {rows.length} event{rows.length === 1 ? "" : "s"} · {timeline.records.length} record{timeline.records.length === 1 ? "" : "s"}
                </Text>
            </div>

            {timeline.warnings.length > 0 && (
                <ul className="inline-warnings">
                    {timeline.warnings.map((w, i) => (
                        <li key={i}>
                            <Warning16Filled className="status-warning" /> {w}
                        </li>
                    ))}
                </ul>
            )}

            <div className="tl-grid tl-head" style={{ ["--lanes" as string]: lanes.length }}>
                <div className="tl-lanes">
                    {lanes.map((l) => (
                        <Tooltip key={l.key} content={`${ACTOR_LABEL[l.kind]}: ${l.name}`} relationship="label">
                            <span className={`lane-head lane-${l.kind}`}>{initials(l.name)}</span>
                        </Tooltip>
                    ))}
                </div>
                <span>Time</span>
                <span>What happened</span>
                <span>Actor</span>
                <span>Depth</span>
                <span>{input.column ? `${input.column} (before → after)` : "Change"}</span>
                <span>Status</span>
            </div>

            <div className="tl-body" ref={listRef}>
                {rows.slice(0, shown).map(({ event, level }) => {
                    const link = incoming.get(event.id);
                    const isOpen = expanded.has(event.id);
                    const rec = event.record ? recordNames.get(recordKey(event.record)) : undefined;
                    const lane = laneIndex(event);
                    return (
                        <div key={event.id} data-event-id={event.id} className={`tl-row ${highlight === event.id ? "tl-highlight" : ""} ${event.status === "failed" ? "tl-failed" : ""}`}>
                            <div className="tl-grid" style={{ ["--lanes" as string]: lanes.length }} onClick={() => setExpanded((prev) => toggle(prev, event.id))}>
                                <div className="tl-lanes">
                                    {lanes.map((l, i) => (
                                        <span key={l.key} className={`lane-cell ${i === lane ? `lane-dot lane-${event.actor.kind}` : ""}`} />
                                    ))}
                                </div>
                                <span className="mono nowrap" title={fmtDateTime(event.time)}>
                                    {fmtTimelineTime(event.time)}
                                    <span className="muted">{fmtMs(event.time)}</span>
                                </span>
                                <span className="tl-what" style={{ paddingLeft: level * 16 }}>
                                    <span className="tl-lead">
                                        {isOpen ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
                                        {level > 0 && <span className="tl-branch">└</span>}
                                    </span>
                                    <span className="tl-main">
                                        <span className="tl-op">{event.operation}</span>
                                        {rec && (
                                            <Badge appearance="outline" size="small" className="tl-record">
                                                {rec.ref.table}
                                                {rec.name ? ` · ${rec.name}` : ""}
                                                {rec.hop > 0 ? ` · hop ${rec.hop}` : ""}
                                            </Badge>
                                        )}
                                        {!rec && event.source === "trace" && (
                                            <Badge appearance="outline" size="small" className="tl-record">
                                                {event.table}
                                            </Badge>
                                        )}
                                        {link && (
                                            <Tooltip content={`${link.kind === "exact" ? "Exact link" : "Stitched link"}: ${link.reason}`} relationship="description">
                                                <Badge size="small" appearance="tint" color={link.kind === "exact" ? "brand" : confidenceColor(link.confidence)} icon={<Link16Regular />}>
                                                    {link.kind === "exact" ? "exact" : `stitched · ${link.confidence}`}
                                                </Badge>
                                            </Tooltip>
                                        )}
                                        {event.warnings.length > 0 && <Warning16Filled className="status-warning" />}
                                    </span>
                                </span>
                                <span className="ellipsis" title={event.actor.name}>
                                    {event.actor.name}
                                </span>
                                <span className="mono">{event.depth ?? ""}</span>
                                <span className="ellipsis">{changeSummary(event, input)}</span>
                                <span>
                                    <Badge size="small" appearance="tint" color={statusColor(event.status)}>
                                        {STATUS_LABEL[event.status]}
                                    </Badge>
                                </span>
                            </div>
                            {isOpen && <EventDetail event={event} link={link} onOpenHandler={onOpenHandler} />}
                        </div>
                    );
                })}
                {rows.length > shown && (
                    <div className="tl-more">
                        <Button onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</Button>
                    </div>
                )}
            </div>
        </div>
    );
}

function EventDetail({ event, link, onOpenHandler }: { event: TimelineEvent; link?: EventLink; onOpenHandler?: (id: string) => void }) {
    return (
        <div className="tl-detail">
            {link && (
                <p>
                    <strong>{link.kind === "exact" ? "Linked (exact)" : `Linked (stitched, ${link.confidence} confidence)`}:</strong> {link.reason}
                    {link.kind === "stitched" && <span className="muted"> — inferred, not certain.</span>}
                </p>
            )}
            {event.error && (
                <pre className="tl-error" tabIndex={0}>
                    {event.error}
                </pre>
            )}
            {event.warnings.map((w, i) => (
                <p key={i} className="status-warning">
                    {w}
                </p>
            ))}
            {event.changes && event.changes.length > 0 && (
                <table className="changes">
                    <thead>
                        <tr>
                            <th>Column</th>
                            <th>Before</th>
                            <th>After</th>
                        </tr>
                    </thead>
                    <tbody>
                        {event.changes.map((c) => (
                            <tr key={c.column}>
                                <td className="mono">{c.column}</td>
                                <td>{c.oldValue ?? <span className="muted">(empty)</span>}</td>
                                <td>{c.newValue ?? <span className="muted">(empty)</span>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {!event.changes && event.changedColumns && event.changedColumns.length > 0 && <p>Changed columns: {event.changedColumns.join(", ")}</p>}
            <dl className="details">
                {event.details.map(([k, v]) => (
                    <div key={k}>
                        <dt>{k}</dt>
                        <dd className={v.length > 200 ? "pre" : undefined}>{v}</dd>
                    </div>
                ))}
                {event.correlationId && (
                    <div>
                        <dt>Correlation ID</dt>
                        <dd className="mono">{event.correlationId}</dd>
                    </div>
                )}
            </dl>
            {event.handlerId && onOpenHandler && (
                <Button size="small" onClick={() => onOpenHandler(event.handlerId!)}>
                    Show on Impact Map
                </Button>
            )}
        </div>
    );
}

function changeSummary(event: TimelineEvent, input: AnalysisInput): string {
    if (event.source !== "audit") return event.error ? event.error.split("\n")[0] : "";
    if (input.column && event.record?.table === input.table) {
        const c = event.changes?.find((x) => x.column === input.column);
        if (c) return `${c.oldValue ?? "(empty)"} → ${c.newValue ?? "(empty)"}`;
        if (event.changedColumns?.includes(input.column)) return "changed (values unavailable)";
        return "";
    }
    const n = event.changes?.length ?? event.changedColumns?.length ?? 0;
    if (n === 1 && event.changes?.[0]) return `${event.changes[0].column}: ${event.changes[0].oldValue ?? "(empty)"} → ${event.changes[0].newValue ?? "(empty)"}`;
    return n ? `${n} columns` : "";
}

function initials(name: string): string {
    const parts = name
        .replace(/[^A-Za-z0-9 .]/g, " ")
        .split(/[ .]+/)
        .filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}
