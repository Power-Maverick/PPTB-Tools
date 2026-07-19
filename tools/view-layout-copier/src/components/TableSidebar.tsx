import { ReactNode, useMemo, useState } from "react";
import { TableInfo } from "../models/interfaces";

interface TableSidebarProps {
    tables: TableInfo[];
    /** MetadataIds of tables in the selected solution; null = no solution filter */
    solutionTableIds: Set<string> | null;
    selectedTable: string;
    onSelect: (logicalName: string) => void;
    loading: boolean;
    /** rendered in the header above the search bar (e.g. the solution picker) */
    headerSlot?: ReactNode;
}

export function TableSidebar({ tables, solutionTableIds, selectedTable, onSelect, loading, headerSlot }: TableSidebarProps) {
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        let list = tables;
        if (solutionTableIds) {
            list = list.filter((t) => solutionTableIds.has(t.metadataId));
        }
        const term = search.trim().toLowerCase();
        if (term) {
            list = list.filter((t) => t.displayName.toLowerCase().includes(term) || t.logicalName.toLowerCase().includes(term) || t.schemaName.toLowerCase().includes(term));
        }
        return list; // already alphabetized by display name
    }, [tables, solutionTableIds, search]);

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                {headerSlot}
                <input type="search" className="sidebar-search" placeholder="Search display or schema name…" value={search} onChange={(e) => setSearch(e.target.value)} disabled={loading} />
            </div>

            <div className="table-list">
                {loading && <div className="list-hint">Loading tables…</div>}

                {!loading &&
                    filtered.map((t) => (
                        <button
                            key={t.logicalName}
                            type="button"
                            className={`table-item ${t.logicalName === selectedTable ? "active" : ""}`}
                            onClick={() => onSelect(t.logicalName)}
                            title={`${t.displayName} (${t.logicalName})`}
                        >
                            <span className="table-item-display">{t.displayName}</span>
                            <span className="table-item-logical">{t.logicalName}</span>
                        </button>
                    ))}

                {!loading && filtered.length === 0 && <div className="list-hint">{search ? `No tables match "${search}"` : "No tables in this solution"}</div>}
            </div>

            <div className="sidebar-footer">
                {!loading && (
                    <span>
                        {filtered.length} table{filtered.length === 1 ? "" : "s"}
                        {solutionTableIds ? " in solution" : ""}
                    </span>
                )}
            </div>
        </aside>
    );
}
