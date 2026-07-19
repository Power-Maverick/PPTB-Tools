import { useMemo } from "react";
import { ViewInfo } from "../models/interfaces";
import { LayoutColumn, parseLayoutColumns, parseSortOrders, SortOrder } from "../utils/layoutUtils";

interface LayoutPreviewProps {
    view: ViewInfo;
    /** attribute logical name -> display name for the current table */
    attributeNames: Map<string, string>;
}

function columnDisplayName(column: LayoutColumn, attributeNames: Map<string, string>): string {
    if (column.name.includes(".")) {
        const [alias, attribute] = column.name.split(".");
        return `${alias} › ${attribute}`;
    }
    return attributeNames.get(column.name) ?? column.name;
}

function sortForColumn(column: LayoutColumn, sorts: SortOrder[]): { index: number; descending: boolean } | undefined {
    const [alias, attribute] = column.name.includes(".") ? column.name.split(".") : [undefined, column.name];
    const index = sorts.findIndex((s) => s.attribute === attribute && (s.entityAlias ?? undefined) === alias);
    if (index === -1) return undefined;
    return { index, descending: sorts[index].descending };
}

export function LayoutPreview({ view, attributeNames }: LayoutPreviewProps) {
    const parsed = useMemo(() => {
        try {
            return {
                columns: parseLayoutColumns(view.layoutxml),
                sorts: parseSortOrders(view.fetchxml),
                error: undefined as string | undefined,
            };
        } catch (error: any) {
            return { columns: [] as LayoutColumn[], sorts: [] as SortOrder[], error: error.message as string };
        }
    }, [view]);

    if (parsed.error) {
        return <div className="preview-error">Could not parse this view's layout: {parsed.error}</div>;
    }

    const visible = parsed.columns.filter((c) => !c.isHidden);
    const totalWidth = visible.reduce((sum, c) => sum + c.width, 0) || 1;

    return (
        <div className="layout-preview">
            <div className="layout-preview-header">
                <span className="layout-preview-title">
                    Layout of <strong>{view.name}</strong>
                </span>
                <span className="layout-preview-meta">
                    {visible.length} column{visible.length === 1 ? "" : "s"}
                    {parsed.sorts.length > 0 && (
                        <>
                            {" · sorted by "}
                            {parsed.sorts.map((s, i) => (
                                <span key={`${s.entityAlias ?? ""}.${s.attribute}`}>
                                    {i > 0 && ", "}
                                    <strong>{attributeNames.get(s.attribute) ?? s.attribute}</strong> {s.descending ? "↓" : "↑"}
                                </span>
                            ))}
                        </>
                    )}
                </span>
            </div>

            <div className="layout-columns">
                {visible.map((column, i) => {
                    const sort = sortForColumn(column, parsed.sorts);
                    const isLinked = column.name.includes(".");
                    return (
                        <div
                            key={`${column.name}-${i}`}
                            className={`layout-column ${isLinked ? "linked" : ""}`}
                            style={{ flexGrow: column.width, flexBasis: 0 }}
                            title={`${column.name} — ${column.width}px`}
                        >
                            <div className="layout-column-name">
                                {i + 1}. {columnDisplayName(column, attributeNames)}
                                {sort && <span className="layout-column-sort">{sort.descending ? " ▼" : " ▲"}</span>}
                            </div>
                            <div className="layout-column-detail">
                                {column.name} · {column.width}px
                                {isLinked && " · related"}
                            </div>
                        </div>
                    );
                })}
                {visible.length === 0 && <div className="list-hint">This view has no visible columns.</div>}
            </div>
        </div>
    );
}
