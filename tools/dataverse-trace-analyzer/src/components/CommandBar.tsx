interface CommandBarProps {
    onRetrieve: () => void;
    onOpenFilters: () => void;
    onSaveFilter: () => void;
    onLoadFilter: () => void;
    isLoading: boolean;
    logCount: number;
    activeFilterCount: number;
    hasFiltersToSave: boolean;
}

export function CommandBar({ 
    onRetrieve, 
    onOpenFilters, 
    onSaveFilter, 
    onLoadFilter, 
    isLoading, 
    logCount, 
    activeFilterCount,
    hasFiltersToSave 
}: CommandBarProps) {
    return (
        <div className="command-bar">
            <button className="btn btn-primary" onClick={onRetrieve} disabled={isLoading}>
                {isLoading ? "Loading..." : "📥 Retrieve"}
            </button>
            <button className="btn btn-secondary" onClick={onOpenFilters}>
                🔍 Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
            <button 
                className="btn btn-secondary" 
                onClick={onSaveFilter}
                disabled={!hasFiltersToSave}
                title={hasFiltersToSave ? "Save current filters" : "Apply filters first"}
            >
                💾 Save Current
            </button>
            <button className="btn btn-secondary" onClick={onLoadFilter}>
                📂 Load Saved
            </button>
            <div className="command-spacer"></div>
            <span className="log-count">{logCount} logs</span>
        </div>
    );
}
