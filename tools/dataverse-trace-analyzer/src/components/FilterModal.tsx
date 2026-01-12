import { FilterOption } from "../models/interfaces";

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: () => void;
    onClearAll: () => void;
    
    // Filter values
    dateFrom: string;
    dateTo: string;
    selectedPlugins: string[];
    selectedMessage: string;
    selectedEntities: string[];
    selectedModes: number[];
    correlationFilter: string;
    exceptionOnly: boolean;
    
    // Filter change handlers
    onDateFromChange: (value: string) => void;
    onDateToChange: (value: string) => void;
    onTogglePlugin: (plugin: string) => void;
    onMessageChange: (message: string) => void;
    onToggleEntity: (entity: string) => void;
    onToggleMode: (mode: number) => void;
    onCorrelationChange: (value: string) => void;
    onExceptionOnlyChange: (checked: boolean) => void;
    
    // Filter options
    pluginOptions: FilterOption[];
    messageOptions: FilterOption[];
    entityOptions: FilterOption[];
}

export function FilterModal({
    isOpen,
    onClose,
    onApply,
    onClearAll,
    dateFrom,
    dateTo,
    selectedPlugins,
    selectedMessage,
    selectedEntities,
    selectedModes,
    correlationFilter,
    exceptionOnly,
    onDateFromChange,
    onDateToChange,
    onTogglePlugin,
    onMessageChange,
    onToggleEntity,
    onToggleMode,
    onCorrelationChange,
    onExceptionOnlyChange,
    pluginOptions,
    messageOptions,
    entityOptions,
}: FilterModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content filter-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Filter Trace Logs</h3>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    {/* Date Filters */}
                    <div className="filter-section">
                        <label>Date Range</label>
                        <div className="filter-group-horizontal">
                            <div className="filter-field">
                                <label className="filter-sublabel">From</label>
                                <input
                                    type="datetime-local"
                                    value={dateFrom}
                                    onChange={(e) => onDateFromChange(e.target.value)}
                                    className="filter-input-date"
                                />
                            </div>
                            <div className="filter-field">
                                <label className="filter-sublabel">To</label>
                                <input
                                    type="datetime-local"
                                    value={dateTo}
                                    onChange={(e) => onDateToChange(e.target.value)}
                                    className="filter-input-date"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Plugin Multi-Select */}
                    <div className="filter-section">
                        <label>Plugin/Step</label>
                        <div className="checkbox-list">
                            {pluginOptions.length === 0 && (
                                <div className="empty-message">No plugins available. Retrieve logs first.</div>
                            )}
                            {pluginOptions.map(opt => (
                                <label key={opt.value} className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        checked={selectedPlugins.includes(opt.value)}
                                        onChange={() => onTogglePlugin(opt.value)}
                                    />
                                    <span className="checkbox-label-text">
                                        {opt.label}
                                        <span className="item-count">({opt.count})</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Message Single-Select */}
                    <div className="filter-section">
                        <label>Message</label>
                        <select
                            className="filter-select"
                            value={selectedMessage}
                            onChange={(e) => onMessageChange(e.target.value)}
                        >
                            <option value="">All messages</option>
                            {messageOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label} ({opt.count})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Entity Multi-Select */}
                    <div className="filter-section">
                        <label>Entity</label>
                        <div className="checkbox-list">
                            {entityOptions.length === 0 && (
                                <div className="empty-message">No entities available. Retrieve logs first.</div>
                            )}
                            {entityOptions.map(opt => (
                                <label key={opt.value} className="checkbox-item">
                                    <input
                                        type="checkbox"
                                        checked={selectedEntities.includes(opt.value)}
                                        onChange={() => onToggleEntity(opt.value)}
                                    />
                                    <span className="checkbox-label-text">
                                        {opt.label}
                                        <span className="item-count">({opt.count})</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Mode Multi-Select */}
                    <div className="filter-section">
                        <label>Mode</label>
                        <div className="checkbox-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={selectedModes.includes(0)}
                                    onChange={() => onToggleMode(0)}
                                />
                                <span>Synchronous</span>
                            </label>
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={selectedModes.includes(1)}
                                    onChange={() => onToggleMode(1)}
                                />
                                <span>Asynchronous</span>
                            </label>
                        </div>
                    </div>

                    {/* Correlation ID */}
                    <div className="filter-section">
                        <label>Correlation ID</label>
                        <input
                            type="text"
                            placeholder="Enter correlation ID..."
                            value={correlationFilter}
                            onChange={(e) => onCorrelationChange(e.target.value)}
                            className="filter-input"
                        />
                    </div>

                    {/* Exception Only */}
                    <div className="filter-section">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={exceptionOnly}
                                onChange={(e) => onExceptionOnlyChange(e.target.checked)}
                            />
                            <span>Exceptions Only</span>
                        </label>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClearAll}>Clear All</button>
                    <div className="footer-spacer"></div>
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={onApply}>Apply Filters</button>
                </div>
            </div>
        </div>
    );
}
