import { CopyOptions, CopyResultItem, ViewInfo } from "../models/interfaces";

interface CopyPanelProps {
    options: CopyOptions;
    onOptionsChange: (options: CopyOptions) => void;
    sourceView?: ViewInfo;
    targetCount: number;
    /** names of selected lookup-view targets when the source's first column is not the primary name attribute */
    lookupWarningViews: string[];
    primaryNameAttribute: string;
    componentsAvailable: boolean;
    isCopying: boolean;
    results: CopyResultItem[];
    publishStatus: "pending" | "success" | "error" | null;
    publishMessage?: string;
    onCopy: () => void;
    onReset: () => void;
}

export function CopyPanel({
    options,
    onOptionsChange,
    sourceView,
    targetCount,
    lookupWarningViews,
    primaryNameAttribute,
    componentsAvailable,
    isCopying,
    results,
    publishStatus,
    publishMessage,
    onCopy,
    onReset,
}: CopyPanelProps) {
    const nothingToCopy = !options.columnLayout && !options.sortOrder && !options.components;
    const canCopy = !!sourceView && targetCount > 0 && !nothingToCopy && !isCopying;

    const toggle = (key: keyof CopyOptions) => onOptionsChange({ ...options, [key]: !options[key] });

    return (
        <section className="panel copy-panel">
            <header className="panel-header">
                <div>
                    <div className="panel-title">Copy options</div>
                    <div className="panel-subtitle">What to copy to the targets</div>
                </div>
            </header>

            <div className="copy-options">
                <label className="option-item">
                    <input type="checkbox" checked={options.columnLayout} onChange={() => toggle("columnLayout")} />
                    <span>
                        <span className="option-name">Column layout</span>
                        <span className="option-detail">Columns, order and widths</span>
                    </span>
                </label>
                <label className="option-item">
                    <input type="checkbox" checked={options.sortOrder} onChange={() => toggle("sortOrder")} />
                    <span>
                        <span className="option-name">Sort order</span>
                        <span className="option-detail">Replaces the targets' sorting</span>
                    </span>
                </label>
                <label className={`option-item ${!componentsAvailable ? "disabled" : ""}`}>
                    <input type="checkbox" checked={options.components && componentsAvailable} disabled={!componentsAvailable} onChange={() => toggle("components")} />
                    <span>
                        <span className="option-name">Components configuration</span>
                        <span className="option-detail">{componentsAvailable ? "Custom controls / grid components" : "Source view has no components configuration"}</span>
                    </span>
                </label>

                <div className="filters-note">
                    <span aria-hidden="true">ⓘ</span> View filters are never copied — each target keeps its own filter criteria. Changes are published automatically.
                </div>
            </div>

            {lookupWarningViews.length > 0 && (
                <div className="warning-box" role="alert">
                    <strong>Lookup view warning</strong>
                    <p>
                        A lookup view should always have <code>{primaryNameAttribute}</code> (the primary name column) as its <em>first</em> column, otherwise lookups will have difficulty working on
                        forms. The source layout's first column is different, and it would be applied to:
                    </p>
                    <ul>
                        {lookupWarningViews.map((name) => (
                            <li key={name}>{name}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="copy-actions">
                <button type="button" className="btn btn-primary" onClick={onCopy} disabled={!canCopy}>
                    {isCopying ? "Copying…" : `Copy & publish (${targetCount})`}
                </button>
                <button type="button" className="btn btn-secondary" onClick={onReset} disabled={isCopying}>
                    Reset
                </button>
            </div>
            {nothingToCopy && <div className="list-hint">Select at least one option to copy.</div>}

            {(results.length > 0 || publishStatus) && (
                <div className="progress-list">
                    {results.map((item) => (
                        <div key={item.viewId} className={`progress-item ${item.status}`}>
                            <span className="status-icon" aria-hidden="true">
                                {item.status === "success" && "✓"}
                                {item.status === "error" && "✕"}
                                {item.status === "pending" && "…"}
                            </span>
                            <span className="progress-body">
                                <span className="progress-name">{item.viewName}</span>
                                {item.message && <span className="progress-message">{item.message}</span>}
                            </span>
                        </div>
                    ))}
                    {publishStatus && (
                        <div className={`progress-item publish-item ${publishStatus}`}>
                            <span className="status-icon" aria-hidden="true">
                                {publishStatus === "success" && "✓"}
                                {publishStatus === "error" && "✕"}
                                {publishStatus === "pending" && "…"}
                            </span>
                            <span className="progress-body">
                                <span className="progress-name">Publish</span>
                                {publishMessage && <span className="progress-message">{publishMessage}</span>}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
