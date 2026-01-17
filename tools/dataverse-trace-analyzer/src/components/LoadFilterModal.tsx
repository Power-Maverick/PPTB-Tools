import { SavedFilter } from "../models/interfaces";

interface LoadFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoad: (filter: SavedFilter) => void;
    onDelete: (name: string) => void;
    savedFilters: SavedFilter[];
}

export function LoadFilterModal({ isOpen, onClose, onLoad, onDelete, savedFilters }: LoadFilterModalProps) {
    if (!isOpen) return null;

    const handleLoad = (filter: SavedFilter) => {
        onLoad(filter);
        onClose();
    };

    const handleDelete = (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete the filter "${name}"?`)) {
            onDelete(name);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString() + " " + date.toLocaleTimeString();
    };

    const getFilterSummary = (filter: SavedFilter): string => {
        const parts: string[] = [];
        
        if (filter.filter.startDate) parts.push("Date Range");
        if (filter.filter.pluginNames && filter.filter.pluginNames.length > 0) 
            parts.push(`${filter.filter.pluginNames.length} Plugin(s)`);
        if (filter.filter.messageName) parts.push("Message");
        if (filter.filter.entityNames && filter.filter.entityNames.length > 0) 
            parts.push(`${filter.filter.entityNames.length} Entity(ies)`);
        if (filter.filter.modes && filter.filter.modes.length > 0) 
            parts.push("Mode");
        if (filter.filter.correlationId) parts.push("Correlation ID");
        if (filter.filter.hasException) parts.push("Exceptions Only");
        
        return parts.length > 0 ? parts.join(", ") : "No filters";
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content load-filter-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Load Saved Filter</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {savedFilters.length === 0 ? (
                        <div className="no-saved-filters">
                            <p>No saved filters found.</p>
                            <p className="hint">Apply filters and click "Save Current" to save a filter.</p>
                        </div>
                    ) : (
                        <div className="saved-filters-list">
                            {savedFilters.map((filter) => (
                                <div 
                                    key={filter.name} 
                                    className="saved-filter-item"
                                    onClick={() => handleLoad(filter)}
                                >
                                    <div className="filter-item-header">
                                        <strong className="filter-name">{filter.name}</strong>
                                        <button
                                            className="btn-delete-filter"
                                            onClick={(e) => handleDelete(filter.name, e)}
                                            title="Delete this filter"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                    <div className="filter-item-summary">{getFilterSummary(filter)}</div>
                                    <div className="filter-item-date">Saved: {formatDate(filter.createdAt)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
}
