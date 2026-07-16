import { ViewInfo } from "../models/interfaces";
import { isLookupView } from "../models/viewTypes";
import { ViewTypeBadge } from "./ViewTypeBadge";

interface SourcePanelProps {
    mode: "source";
    views: ViewInfo[];
    selectedId: string;
    onSelect: (viewId: string) => void;
}

interface TargetPanelProps {
    mode: "target";
    views: ViewInfo[];
    sourceId: string;
    selectedIds: Set<string>;
    onToggle: (viewId: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
}

type ViewListPanelProps = SourcePanelProps | TargetPanelProps;

export function ViewListPanel(props: ViewListPanelProps) {
    const isTarget = props.mode === "target";
    const views = isTarget ? props.views.filter((v) => v.id !== props.sourceId) : props.views;

    return (
        <section className="panel">
            <header className="panel-header">
                <div>
                    <div className="panel-title">{isTarget ? "Target views" : "Source view"}</div>
                    <div className="panel-subtitle">{isTarget ? "Apply the layout to these views" : "Copy the layout from this view"}</div>
                </div>
                {isTarget && views.length > 0 && (
                    <div className="panel-actions">
                        <button type="button" className="link-button" onClick={props.onSelectAll}>
                            All
                        </button>
                        <button type="button" className="link-button" onClick={props.onClearAll}>
                            None
                        </button>
                    </div>
                )}
            </header>

            <div className="view-list" role={isTarget ? "group" : "radiogroup"}>
                {views.map((view) => {
                    const checked = isTarget ? props.selectedIds.has(view.id) : props.selectedId === view.id;
                    return (
                        <label key={view.id} className={`view-item ${checked ? "checked" : ""}`} title={view.description || view.name}>
                            <input
                                type={isTarget ? "checkbox" : "radio"}
                                name={isTarget ? undefined : "source-view"}
                                checked={checked}
                                onChange={() => (isTarget ? props.onToggle(view.id) : props.onSelect(view.id))}
                            />
                            <span className="view-item-body">
                                <span className="view-item-name">
                                    {view.name}
                                    {isTarget && isLookupView(view) && checked && (
                                        <span className="lookup-flag" title="Lookup view selected as target — check the first-column warning">
                                            ⚠
                                        </span>
                                    )}
                                </span>
                                <ViewTypeBadge view={view} />
                            </span>
                        </label>
                    );
                })}
                {views.length === 0 && <div className="list-hint">{isTarget ? "No other views available." : "No views with a layout found for this table."}</div>}
            </div>
        </section>
    );
}
