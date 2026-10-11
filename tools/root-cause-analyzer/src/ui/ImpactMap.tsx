import { Badge, Button, Text, ToggleButton } from "@fluentui/react-components";
import { Dismiss16Regular } from "@fluentui/react-icons";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { memo, useEffect, useMemo, useState } from "react";
import { matchHandler } from "../engine/correlate";
import { STAGE_LABELS } from "../data/wiring";
import type { AnalysisInput, Timeline, WiringGraph, WiringHandler } from "../model/types";
import { tableNode } from "../model/types";
import { KIND_LABEL } from "../rules/context";
import { fmtDateTime } from "./format";

interface Props {
    graph: WiringGraph;
    timeline: Timeline;
    input: AnalysisInput;
    focusId?: string;
    onFocusHandled?: () => void;
}

/** Columns left → right in execution order. */
const PHASES: Array<{ key: string; label: string; match: (h: WiringHandler) => boolean }> = [
    { key: "rule", label: "Business rules", match: (h) => h.kind === "businessrule" },
    { key: "10", label: "Pre-validation", match: (h) => h.kind === "plugin" && h.mode === "sync" && h.stage === 10 },
    { key: "20", label: "Pre-operation", match: (h) => (h.kind === "plugin" && h.mode === "sync" && h.stage === 20) || h.kind === "realtime-workflow" },
    { key: "40", label: "Post-operation", match: (h) => h.kind === "plugin" && h.mode === "sync" && (h.stage === 40 || h.stage === 30 || h.stage === undefined) },
    { key: "async", label: "Async plugins", match: (h) => h.kind === "plugin" && h.mode === "async" },
    { key: "wf", label: "Workflows", match: (h) => h.kind === "workflow" },
    { key: "flow", label: "Cloud flows", match: (h) => h.kind === "flow" },
];

const COL_W = 270;
const ROW_H = 150;
const TABLE_W = 190;
const IMPL_ROW_H = 80;
const MAX_CHIPS = 6;

type HandlerData = { handler: WiringHandler; runs: number; column?: string; dimmed?: string; inCycle: boolean; focused: boolean; phase?: string };
type TableData = { table: string; isTarget: boolean; focused: boolean; column?: string; computed?: string };
type ImplData = { kind: "type" | "assembly"; title: string; subtitle?: string; steps: number; focused: boolean };

function Chips({ columns, highlight }: { columns: string[]; highlight?: string }) {
    const shown = columns.slice(0, MAX_CHIPS);
    return (
        <span className="map-chips">
            {shown.map((c) => (
                <span key={c} className={`map-chip ${c === highlight ? "match" : ""}`}>
                    {c}
                </span>
            ))}
            {columns.length > shown.length && (
                <span className="map-chip more" title={columns.slice(MAX_CHIPS).join(", ")}>
                    +{columns.length - shown.length}
                </span>
            )}
        </span>
    );
}

const HandlerNode = memo(({ data }: NodeProps<Node<HandlerData>>) => {
    const h = data.handler;
    const writesColumn = data.column && h.writes.some((w) => w.columns?.includes(data.column!));
    return (
        <div className={`map-node map-handler kind-${h.kind} ${h.enabled ? "" : "off"} ${data.dimmed ? "dimmed" : ""} ${data.inCycle ? "in-cycle" : ""} ${data.focused ? "focused" : ""}`} title={data.dimmed}>
            <Handle type="target" position={Position.Left} />
            <div className="map-kind">
                {KIND_LABEL[h.kind]}
                {data.phase ? ` · ${data.phase}` : ""}
                {h.kind === "plugin" ? ` · ${h.mode === "sync" ? "sync" : "async"}${h.rank !== undefined ? ` · rank ${h.rank}` : ""}` : ""}
            </div>
            <div className="map-name" title={h.name}>
                {h.kind === "plugin" && h.typeName ? h.typeName.split(".").pop() : h.name}
            </div>
            {h.kind === "plugin" && <div className="map-sub" title={h.name}>{h.messages.join(" / ")} of {h.table}</div>}
            <div className="map-row">
                <span className="map-label">{h.kind === "flow" || h.kind === "workflow" ? "When" : "Filter"}</span>
                {h.filteringColumns ? <Chips columns={h.filteringColumns} highlight={data.column} /> : <span className="muted">any column</span>}
            </div>
            {h.images.map((img, i) => (
                <div key={i} className="map-row">
                    <span className="map-label">{img.type.replace(" image", "").replace("-image", "")}</span>
                    {img.columns ? <Chips columns={img.columns} highlight={data.column} /> : <span className="muted">all columns</span>}
                </div>
            ))}
            <div className="map-meta">
                {!h.enabled && <Badge size="small" color="danger">Off</Badge>}
                {data.runs > 0 && (
                    <Badge size="small" appearance="tint" color="success">
                        {`ran ${data.runs}×`}
                    </Badge>
                )}
                {writesColumn && (
                    <Badge size="small" appearance="tint" color="warning">
                        {`writes ${data.column}`}
                    </Badge>
                )}
                {h.triggerConditions.length > 0 && <span className="muted">has conditions</span>}
            </div>
            <Handle type="source" position={Position.Right} />
            <Handle type="source" id="impl" position={Position.Bottom} />
        </div>
    );
});

const TableNode = memo(({ data }: NodeProps<Node<TableData>>) => (
    <div className={`map-node map-table ${data.isTarget ? "target" : ""} ${data.focused ? "focused" : ""}`}>
        <Handle type="target" position={Position.Left} />
        <div className="map-kind">Table</div>
        <div className="map-name">{data.table}</div>
        {data.isTarget && data.column && (
            <div className="map-sub">
                column: {data.column}
                {data.computed ? ` (${data.computed})` : ""}
            </div>
        )}
        <Handle type="source" position={Position.Right} />
    </div>
));

const ImplNode = memo(({ data }: NodeProps<Node<ImplData>>) => (
    <div className={`map-node map-impl impl-${data.kind} ${data.focused ? "focused" : ""}`}>
        <Handle type="target" position={Position.Left} />
        <div className="map-kind">
            {data.kind === "type" ? "Plugin type" : "Assembly"} · {data.steps} step{data.steps === 1 ? "" : "s"}
        </div>
        <div className="map-name" title={data.title}>
            {data.title}
        </div>
        {data.subtitle && <div className="map-sub">{data.subtitle}</div>}
        <Handle type="source" position={Position.Right} />
    </div>
));

const nodeTypes = { handler: HandlerNode, table: TableNode, impl: ImplNode };

export function ImpactMap(props: Props) {
    return (
        <ReactFlowProvider>
            <ImpactMapInner {...props} />
        </ReactFlowProvider>
    );
}

function ImpactMapInner({ graph, timeline, input, focusId, onFocusHandled }: Props) {
    const [selected, setSelected] = useState<string>();
    const [showImpl, setShowImpl] = useState(true);
    const flow = useReactFlow();

    const runs = useMemo(() => {
        const handlers = new Map(graph.handlers.map((h) => [h.id, h]));
        const counts = new Map<string, number>();
        for (const e of timeline.events) {
            if (e.source === "audit") continue;
            const id = matchHandler(e, handlers)?.id ?? e.handlerId;
            if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        return counts;
    }, [graph, timeline]);

    const cycleNodes = useMemo(() => new Set(graph.cycles.flat()), [graph.cycles]);
    const cycleEdges = useMemo(() => {
        const set = new Set<string>();
        for (const c of graph.cycles) for (let i = 0; i < c.length; i++) set.add(`${c[i]}>${c[(i + 1) % c.length]}`);
        return set;
    }, [graph.cycles]);

    const { nodes, edges } = useMemo(() => {
        const nodes: Node[] = [];
        const tables = [...graph.tables].sort((a, b) => (a === input.table ? -1 : b === input.table ? 1 : a.localeCompare(b)));
        let y = 0;
        let maxCols = 0;
        const placed = new Set<string>();
        const handlerY = new Map<string, number>();
        for (const table of tables) {
            const mine = graph.handlers.filter((h) => h.table === table);
            const columns = PHASES.map((p) => ({ phase: p, list: mine.filter((h) => p.match(h)).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.name.localeCompare(b.name)) }));
            const height = Math.max(1, ...columns.map((c) => c.list.length)) * ROW_H;
            const computed = graph.computed?.find((c) => c.table === table && c.column === input.column)?.kind;
            nodes.push({ id: tableNode(table), type: "table", position: { x: 0, y: y + height / 2 - 30 }, data: { table, isTarget: table === input.table, focused: focusId === tableNode(table), column: input.column, computed } satisfies TableData });
            let col = 0;
            for (const { phase, list } of columns) {
                if (!list.length) continue;
                list.forEach((h, i) => {
                    placed.add(h.id);
                    const dimmed =
                        input.column && table === input.table && h.filteringColumns && !h.filteringColumns.includes(input.column)
                            ? `Won't run when only ${input.column} changes (filtering columns: ${h.filteringColumns.join(", ")})`
                            : undefined;
                    const pos = { x: TABLE_W + 60 + col * COL_W, y: y + i * ROW_H };
                    handlerY.set(h.id, pos.y);
                    nodes.push({
                        id: h.id,
                        type: "handler",
                        position: pos,
                        data: { handler: h, runs: runs.get(h.id) ?? 0, column: table === input.table ? input.column : undefined, dimmed, inCycle: cycleNodes.has(h.id), focused: focusId === h.id || selected === h.id, phase: h.kind === "plugin" ? phase.label : undefined } satisfies HandlerData,
                    });
                });
                col++;
            }
            maxCols = Math.max(maxCols, col);
            y += height + 60;
        }
        // Writers without a Dataverse trigger (scheduled / manual flows) that write to these tables.
        graph.handlers
            .filter((h) => !placed.has(h.id))
            .forEach((h, i) => {
                const pos = { x: TABLE_W + 60 + (i % 4) * COL_W, y: y + Math.floor(i / 4) * ROW_H };
                handlerY.set(h.id, pos.y);
                maxCols = Math.max(maxCols, Math.min(4, i + 1));
                nodes.push({ id: h.id, type: "handler", position: pos, data: { handler: h, runs: runs.get(h.id) ?? 0, inCycle: cycleNodes.has(h.id), focused: focusId === h.id } satisfies HandlerData });
            });

        const edges: Edge[] = graph.edges.map((e) => {
            const inCycle = cycleEdges.has(`${e.from}>${e.to}`) || (e.kind === "trigger" && cycleNodes.has(e.to) && cycleNodes.has(e.from));
            return {
                id: e.id,
                source: e.from,
                target: e.to,
                label: e.kind === "trigger" ? undefined : e.label,
                animated: inCycle,
                className: `edge-${e.kind} ${inCycle ? "edge-cycle" : ""}`,
                style: e.kind === "inferred" ? { strokeDasharray: "6 4" } : undefined,
                markerEnd: { type: MarkerType.ArrowClosed },
                labelBgPadding: [4, 2] as [number, number],
            };
        });

        // Relationship cascades between tables in scope (parent → child).
        for (const c of graph.cascades ?? []) {
            edges.push({
                id: `cascade-${c.relationship}`,
                source: tableNode(c.parent),
                target: tableNode(c.child),
                label: `cascades ${Object.keys(c.behaviours).join(", ")}`,
                className: "edge-cascade",
                style: { strokeDasharray: "8 3 2 3" },
                markerEnd: { type: MarkerType.ArrowClosed },
                labelBgPadding: [4, 2] as [number, number],
            });
        }

        // Implementation: step → plugin type → assembly, in two extra columns on the right.
        if (showImpl) {
            const plugins = graph.handlers.filter((h) => h.kind === "plugin" && (h.pluginTypeId || h.typeName));
            const typeX = TABLE_W + 60 + maxCols * COL_W + 80;
            const types = new Map<string, { id: string; name: string; steps: WiringHandler[]; assembly?: WiringHandler["assembly"] }>();
            for (const h of plugins) {
                const key = `type:${h.pluginTypeId ?? h.typeName}`;
                const t = types.get(key) ?? { id: key, name: h.typeName ?? "Plugin type", steps: [], assembly: h.assembly };
                t.steps.push(h);
                types.set(key, t);
            }
            const assemblies = new Map<string, { id: string; name: string; version?: string; isolation?: string; modifiedOn?: string; types: string[]; steps: number }>();
            const typeYs = new Map<string, number>();
            const spread = (items: Array<{ id: string; want: number }>) => {
                const sorted = [...items].sort((a, b) => a.want - b.want);
                let last = -Infinity;
                return new Map(sorted.map((i) => [i.id, (last = Math.max(i.want, last + IMPL_ROW_H))]));
            };
            const typeTargets = [...types.values()].map((t) => ({ id: t.id, want: avg(t.steps.map((s) => handlerY.get(s.id) ?? 0)) }));
            spread(typeTargets).forEach((v, k) => typeYs.set(k, v));
            for (const t of types.values()) {
                nodes.push({
                    id: t.id,
                    type: "impl",
                    position: { x: typeX, y: typeYs.get(t.id)! },
                    data: { kind: "type", title: t.name.split(".").pop() ?? t.name, subtitle: t.name, steps: t.steps.length, focused: focusId === t.id } satisfies ImplData,
                });
                for (const s of t.steps) edges.push({ id: `impl-${s.id}`, source: s.id, sourceHandle: "impl", target: t.id, className: "edge-impl", style: { strokeDasharray: "2 4" } });
                if (t.assembly) {
                    const key = `asm:${t.assembly.id ?? t.assembly.name}`;
                    const a = assemblies.get(key) ?? { id: key, name: t.assembly.name, version: t.assembly.version, isolation: t.assembly.isolation, modifiedOn: t.assembly.modifiedOn, types: [], steps: 0 };
                    a.types.push(t.id);
                    a.steps += t.steps.length;
                    assemblies.set(key, a);
                }
            }
            const asmYs = spread([...assemblies.values()].map((a) => ({ id: a.id, want: avg(a.types.map((t) => typeYs.get(t) ?? 0)) })));
            for (const a of assemblies.values()) {
                nodes.push({
                    id: a.id,
                    type: "impl",
                    position: { x: typeX + COL_W, y: asmYs.get(a.id)! },
                    data: { kind: "assembly", title: a.name, subtitle: [a.version && `v${a.version}`, a.isolation && `${a.isolation} isolation`, a.modifiedOn && `updated ${fmtDateTime(a.modifiedOn)}`].filter(Boolean).join(" · ") || undefined, steps: a.steps, focused: focusId === a.id } satisfies ImplData,
                });
                for (const t of a.types) edges.push({ id: `asm-${t}-${a.id}`, source: t, target: a.id, className: "edge-impl", style: { strokeDasharray: "2 4" } });
            }
        }
        return { nodes, edges };
    }, [graph, input, runs, cycleNodes, cycleEdges, focusId, selected, showImpl]);

    useEffect(() => {
        if (!focusId) return;
        setSelected(focusId.startsWith("table:") ? undefined : focusId);
        const node = nodes.find((n) => n.id === focusId);
        if (node) setTimeout(() => flow.setCenter(node.position.x + 100, node.position.y + 60, { zoom: 1.1, duration: 400 }), 50);
        onFocusHandled?.();
    }, [focusId, nodes, flow, onFocusHandled]);

    const handler = graph.handlers.find((h) => h.id === selected);

    if (!graph.handlers.length) {
        return (
            <div className="empty">
                <Text>No plugins, workflows, business rules or cloud flows are registered on {graph.tables.join(", ") || input.table}.</Text>
                {graph.warnings.length > 0 && <Text className="muted">{graph.warnings.join(" ")}</Text>}
            </div>
        );
    }

    return (
        <div className="impact-map">
            <div className="map-legend">
                <span>
                    <i className="lg-trigger" /> triggers
                </span>
                <span>
                    <i className="lg-declared" /> writes (declared)
                </span>
                <span>
                    <i className="lg-inferred" /> writes (inferred from history)
                </span>
                <span>
                    <i className="lg-impl" /> implemented by
                </span>
                <span>
                    <i className="lg-cycle" /> cycle
                </span>
                {(graph.cascades?.length ?? 0) > 0 && (
                    <span>
                        <i className="lg-cascade" /> relationship cascade
                    </span>
                )}
                {input.column && (
                    <span>
                        <span className="map-chip match">{input.column}</span> your column
                    </span>
                )}
                <span className="spacer" />
                <ToggleButton size="small" checked={showImpl} onClick={() => setShowImpl(!showImpl)}>
                    Plugin types &amp; assemblies
                </ToggleButton>
                <span className="muted">{graph.cycles.length ? `${graph.cycles.length} cycle${graph.cycles.length === 1 ? "" : "s"}` : "No cycles"} · runs left → right</span>
            </div>
            <div className="map-body">
                <div className="map-canvas">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        fitView
                        minZoom={0.15}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        onNodeClick={(_, n) => setSelected(n.type === "handler" ? n.id : undefined)}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background gap={24} />
                        <Controls showInteractive={false} />
                    </ReactFlow>
                </div>
                {handler && <HandlerPanel handler={handler} runs={runs.get(handler.id) ?? 0} column={input.column} onClose={() => setSelected(undefined)} />}
            </div>
        </div>
    );
}

function avg(values: number[]): number {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function HandlerPanel({ handler: h, runs, column, onClose }: { handler: WiringHandler; runs: number; column?: string; onClose: () => void }) {
    const rows: Array<[string, string]> = [
        ["Type", KIND_LABEL[h.kind]],
        ["Status", h.state],
        ["Runs on", `${h.messages.join(" / ") || "on demand"} of ${h.table}`],
    ];
    if (h.kind === "plugin") {
        rows.push(["Stage", h.stage !== undefined ? (STAGE_LABELS[h.stage] ?? String(h.stage)) : "?"], ["Mode", h.mode === "sync" ? "Synchronous" : "Asynchronous"], ["Rank", String(h.rank ?? "")]);
        if (h.typeName) rows.push(["Plugin type (class)", h.typeName]);
        if (h.assembly) rows.push(["Assembly", [h.assembly.name, h.assembly.version && `v${h.assembly.version}`, h.assembly.isolation && `${h.assembly.isolation} isolation`].filter(Boolean).join(" · ")]);
        if (h.assembly?.modifiedOn) rows.push(["Assembly updated", `${fmtDateTime(h.assembly.modifiedOn)}${h.assembly.modifiedByName ? ` by ${h.assembly.modifiedByName}` : ""}`]);
        if (h.asyncAutoDelete) rows.push(["Async jobs", "deleted when they succeed"]);
    }
    rows.push(["Filtering columns", h.filteringColumns?.join(", ") ?? "any column"]);
    if (column && h.filteringColumns) rows.push([`Runs for ${column}?`, h.filteringColumns.includes(column) ? "Yes — it's a filtering column" : "Not on its own — it isn't a filtering column"]);
    if (h.ownerName) rows.push(["Owner", h.ownerName]);
    if (h.modifiedOn) rows.push(["Last modified", `${fmtDateTime(h.modifiedOn)}${h.modifiedByName ? ` by ${h.modifiedByName}` : ""}`]);
    rows.push(["Ran in this window", String(runs)]);
    return (
        <aside className="map-panel">
            <header>
                <Text weight="semibold">{h.name}</Text>
                <Button size="small" appearance="subtle" icon={<Dismiss16Regular />} onClick={onClose} aria-label="Close" />
            </header>
            <dl className="details">
                {rows.map(([k, v]) => (
                    <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                    </div>
                ))}
            </dl>
            {h.triggerConditions.length > 0 && (
                <>
                    <Text weight="semibold" size={200}>
                        Trigger conditions
                    </Text>
                    {h.triggerConditions.map((c, i) => (
                        <pre key={i} className="tl-error">
                            {c}
                        </pre>
                    ))}
                </>
            )}
            {h.writes.length > 0 && (
                <>
                    <Text weight="semibold" size={200}>
                        Writes to
                    </Text>
                    <ul className="plain">
                        {h.writes.map((w, i) => (
                            <li key={i}>
                                {w.operation} <strong>{w.table}</strong>
                                {w.columns?.length ? ` (${w.columns.join(", ")})` : ""} <Badge size="small" appearance="outline">{w.kind}</Badge>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {h.images.length > 0 && (
                <>
                    <Text weight="semibold" size={200}>
                        Images
                    </Text>
                    <ul className="plain">
                        {h.images.map((img, i) => (
                            <li key={i}>
                                {img.type}
                                {img.alias ? ` '${img.alias}'` : ""}: {img.columns?.join(", ") ?? "all columns"}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {h.warnings.map((w, i) => (
                <p key={i} className="muted">
                    {w}
                </p>
            ))}
        </aside>
    );
}
