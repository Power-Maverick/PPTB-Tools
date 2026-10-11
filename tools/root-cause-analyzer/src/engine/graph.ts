import { tableNode, type HandlerWrite, type WiringEdge, type WiringGraph, type WiringHandler } from "../model/types";

export interface InferredWrite {
    handlerId: string;
    write: HandlerWrite;
}

/** Does writing `write` re-trigger `target`? Unknown columns are treated as "could". */
export function writeTriggers(write: HandlerWrite, target: WiringHandler): boolean {
    if (write.table !== target.table) return false;
    const ops = write.operation === "Upsert" ? ["Create", "Update"] : [write.operation];
    if (!target.messages.some((m) => ops.includes(m))) return false;
    if (!target.filteringColumns || !write.columns?.length || !ops.includes("Update")) return true;
    return write.columns.some((c) => target.filteringColumns!.includes(c));
}

/** Pure: builds the impact-map graph and finds cycles across enabled handlers. */
export function buildGraph(handlers: WiringHandler[], inferred: InferredWrite[], scopeTables: string[]): WiringGraph {
    const byId = new Map(handlers.map((h) => [h.id, { ...h, writes: [...h.writes] }]));
    for (const { handlerId, write } of inferred) {
        const h = byId.get(handlerId);
        if (!h) continue;
        const existing = h.writes.find((w) => w.table === write.table && w.operation === write.operation);
        if (existing) {
            if (write.columns?.length) existing.columns = [...new Set([...(existing.columns ?? []), ...write.columns])];
        } else h.writes.push(write);
    }
    const all = [...byId.values()];
    const tables = [...new Set([...scopeTables, ...all.map((h) => h.table).filter((t) => t !== "none"), ...all.flatMap((h) => h.writes.map((w) => w.table))])].sort();

    const edges: WiringEdge[] = [];
    for (const h of all) {
        if (h.table !== "none") {
            const filter = h.filteringColumns ? ` · when ${h.filteringColumns.join(", ")} change` : "";
            edges.push({ id: `t-${h.id}`, from: tableNode(h.table), to: h.id, kind: "trigger", label: `${h.messages.join(" / ") || "on demand"}${filter}` });
        }
        for (const w of h.writes) {
            edges.push({
                id: `w-${h.id}-${w.table}-${w.operation}`,
                from: h.id,
                to: tableNode(w.table),
                kind: w.kind,
                label: `${w.operation}${w.columns?.length ? ` ${w.columns.slice(0, 4).join(", ")}${w.columns.length > 4 ? "…" : ""}` : ""} · ${w.kind}`,
            });
        }
    }

    return { tables, handlers: all, edges, cycles: findCycles(all), warnings: [] };
}

/** Simple cycles in handler → handler reachability (via a written table). Bounded for safety. */
export function findCycles(handlers: WiringHandler[], maxLength = 8, maxCycles = 25): string[][] {
    const enabled = handlers.filter((h) => h.enabled);
    const next = new Map<string, Array<{ to: string; table: string }>>();
    for (const h of enabled) {
        const targets: Array<{ to: string; table: string }> = [];
        for (const w of h.writes) for (const t of enabled) if (writeTriggers(w, t)) targets.push({ to: t.id, table: w.table });
        next.set(h.id, targets);
    }
    const ids = enabled.map((h) => h.id).sort();
    const cycles: string[][] = [];
    const seen = new Set<string>();

    const dfs = (start: string, current: string, path: string[], tables: string[]) => {
        if (cycles.length >= maxCycles) return;
        for (const { to, table } of next.get(current) ?? []) {
            if (to === start) {
                const key = [...path].sort().join("|");
                if (!seen.has(key)) {
                    seen.add(key);
                    const nodes: string[] = [];
                    path.forEach((p, i) => nodes.push(p, tableNode(i < tables.length ? tables[i] : table)));
                    nodes[nodes.length - 1] = tableNode(table);
                    cycles.push(nodes);
                }
                continue;
            }
            // Only extend through nodes "after" start to report each cycle once from its smallest id.
            if (path.includes(to) || to < start || path.length >= maxLength) continue;
            dfs(start, to, [...path, to], [...tables, table]);
        }
    };
    for (const id of ids) dfs(id, id, [id], []);
    return cycles;
}
