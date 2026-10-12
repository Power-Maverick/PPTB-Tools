import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { FilterOption } from "../models/interfaces";
import { SearchableFilterOptions } from "./SearchableFilterOptions";

interface FilterPanelProps {
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

export function FilterPanel({
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
}: FilterPanelProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const dialog = dialogRef.current;
        const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog?.showModal();
        return () => {
            dialog?.close();
            trigger?.focus();
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <dialog
            ref={dialogRef}
            className="filter-panel"
            id="trace-filter-panel"
            aria-labelledby="trace-filter-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose();
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    onClose();
                } else if (event.key === "Enter" && (event.target as HTMLInputElement).type !== "search" && !["BUTTON", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)) {
                    event.preventDefault();
                    onApply();
                }
            }}
        >
            <div className="filter-panel-header">
                <h3 id="trace-filter-title">Filters</h3>
                <button className="modal-close" onClick={onClose} aria-label="Close filters" title="Close filters" autoFocus>
                    <X size={18} aria-hidden="true" />
                </button>
            </div>
            <div className="filter-panel-body">
                <fieldset className="filter-category">
                    <legend>Time Range</legend>
                    <div className="filter-section">
                        <div className="filter-group-horizontal">
                            <div className="filter-field">
                                <label className="filter-sublabel" htmlFor="filter-date-from">
                                    From
                                </label>
                                <input id="filter-date-from" type="datetime-local" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className="filter-input-date" />
                            </div>
                            <div className="filter-field">
                                <label className="filter-sublabel" htmlFor="filter-date-to">
                                    To
                                </label>
                                <input id="filter-date-to" type="datetime-local" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="filter-input-date" />
                            </div>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="filter-category">
                    <legend>Plugin / Entity</legend>
                    <SearchableFilterOptions id="filter-plugin-search" label="Plugins" options={pluginOptions} selected={selectedPlugins} onToggle={onTogglePlugin} />

                    <div className="filter-section">
                        <label htmlFor="filter-message">Message</label>
                        <select id="filter-message" className="filter-select" value={selectedMessage} onChange={(e) => onMessageChange(e.target.value)}>
                            <option value="">All messages</option>
                            {selectedMessage && !messageOptions.some((option) => option.value === selectedMessage) && <option value={selectedMessage}>{selectedMessage}</option>}
                            {messageOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label} ({opt.count})
                                </option>
                            ))}
                        </select>
                    </div>

                    <SearchableFilterOptions id="filter-entity-search" label="Entities" options={entityOptions} selected={selectedEntities} onToggle={onToggleEntity} />
                </fieldset>

                <fieldset className="filter-category">
                    <legend>Execution</legend>
                    <div className="filter-section">
                        <label id="filter-mode-label">Mode</label>
                        <div className="checkbox-group" role="group" aria-labelledby="filter-mode-label">
                            <label className="checkbox-label">
                                <input type="checkbox" checked={selectedModes.includes(0)} onChange={() => onToggleMode(0)} />
                                <span>Synchronous</span>
                            </label>
                            <label className="checkbox-label">
                                <input type="checkbox" checked={selectedModes.includes(1)} onChange={() => onToggleMode(1)} />
                                <span>Asynchronous</span>
                            </label>
                        </div>
                    </div>

                    <div className="filter-section">
                        <label htmlFor="filter-correlation">Correlation ID</label>
                        <input
                            id="filter-correlation"
                            type="text"
                            placeholder="Enter correlation ID..."
                            value={correlationFilter}
                            onChange={(e) => onCorrelationChange(e.target.value)}
                            className="filter-input"
                        />
                    </div>

                    <div className="filter-section">
                        <label className="checkbox-label">
                            <input type="checkbox" checked={exceptionOnly} onChange={(e) => onExceptionOnlyChange(e.target.checked)} />
                            <span>Exceptions Only</span>
                        </label>
                    </div>
                </fieldset>
            </div>
            <div className="filter-panel-footer">
                <button className="btn btn-secondary" onClick={onClearAll}>
                    Reset
                </button>
                <div className="footer-spacer"></div>
                <button className="btn btn-secondary" onClick={onClose}>
                    Cancel
                </button>
                <button className="btn btn-primary" onClick={onApply}>
                    Apply Filters
                </button>
            </div>
        </dialog>
    );
}
