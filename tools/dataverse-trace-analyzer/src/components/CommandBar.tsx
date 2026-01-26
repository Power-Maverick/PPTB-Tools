interface CommandBarProps {
    onRetrieve: () => void;
    onOpenFilters: () => void;
    onSaveFilter: () => void;
    onLoadFilter: () => void;
    onOpenAutoRefresh: () => void;
    onOpenTracingControl: () => void;
    isLoading: boolean;
    logCount: number;
    activeFilterCount: number;
    hasFiltersToSave: boolean;
    autoRefreshMode: 'off' | 'auto' | 'notify';
    newLogsCount?: number;
}

export function CommandBar({ 
    onRetrieve, 
    onOpenFilters, 
    onSaveFilter, 
    onLoadFilter, 
    onOpenAutoRefresh,
    onOpenTracingControl,
    isLoading, 
    logCount, 
    activeFilterCount,
    hasFiltersToSave,
    autoRefreshMode,
    newLogsCount
}: CommandBarProps) {
    const getAutoRefreshButtonText = () => {
        if (autoRefreshMode === 'off') return '🔄 Auto-Refresh: Off';
        if (autoRefreshMode === 'auto') return '🔄 Auto: On';
        return '🔄 Notify: On';
    };

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
            <button 
                className={`btn ${autoRefreshMode !== 'off' ? 'btn-success' : 'btn-secondary'}`}
                onClick={onOpenAutoRefresh}
                title="Configure auto-refresh settings"
            >
                {getAutoRefreshButtonText()}
            </button>
            <button 
                className="btn btn-secondary"
                onClick={onOpenTracingControl}
                title="Enable/disable plugin tracing"
            >
                ⚙️ Tracing
            </button>
            <div className="command-spacer"></div>
            {newLogsCount !== undefined && newLogsCount > 0 && (
                <span className="new-logs-badge">+{newLogsCount} new</span>
            )}
            <span className="log-count">{logCount} logs</span>
        </div>
    );
}
