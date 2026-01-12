interface CommandBarProps {
    onRetrieve: () => void;
    onOpenFilters: () => void;
    isLoading: boolean;
    logCount: number;
    activeFilterCount: number;
}

export function CommandBar({ onRetrieve, onOpenFilters, isLoading, logCount, activeFilterCount }: CommandBarProps) {
    return (
        <div className="command-bar">
            <button className="btn btn-primary" onClick={onRetrieve} disabled={isLoading}>
                {isLoading ? "Loading..." : "📥 Retrieve"}
            </button>
            <button className="btn btn-secondary" onClick={onOpenFilters}>
                🔍 Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
            <div className="command-spacer"></div>
            <span className="log-count">{logCount} logs</span>
        </div>
    );
}
