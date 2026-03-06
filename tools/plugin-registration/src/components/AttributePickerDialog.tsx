import { useState, useEffect, useRef } from "react";
import { DataverseClient } from "../utils/DataverseClient";

interface EntityAttribute {
    logicalName: string;
    displayName: string;
}

interface AttributePickerDialogProps {
    isOpen: boolean;
    entityName: string;
    selectedAttributes: string[]; // already-selected logical names
    onConfirm: (attrs: string[]) => void;
    onClose: () => void;
}

const client = new DataverseClient();

export function AttributePickerDialog({
    isOpen,
    entityName,
    selectedAttributes,
    onConfirm,
    onClose,
}: AttributePickerDialogProps) {
    const [attributes, setAttributes] = useState<EntityAttribute[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set(selectedAttributes));

    const noEntity = !entityName || entityName === "none" || entityName === "any";

    // Keep a ref so the effect can always read the latest selectedAttributes
    // without needing it in the dependency array (we only want to snapshot on open).
    const initAttrsRef = useRef<string[]>(selectedAttributes);
    initAttrsRef.current = selectedAttributes;

    useEffect(() => {
        if (!isOpen) return;
        setSelected(new Set(initAttrsRef.current));
        setSearch("");
        setAttributes([]);
        setLoadError("");
        if (noEntity) return;
        setLoading(true);
        client.fetchEntityAttributes(entityName)
            .then(setAttributes)
            .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, [isOpen, entityName, noEntity]);

    if (!isOpen) return null;

    const q = search.toLowerCase();
    const filtered = attributes.filter(
        (a) => a.logicalName.includes(q) || a.displayName.toLowerCase().includes(q),
    );

    const handleToggle = (logicalName: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(logicalName)) next.delete(logicalName);
            else next.add(logicalName);
            return next;
        });
    };

    const handleSelectAll = () => setSelected(new Set(filtered.map((a) => a.logicalName)));
    const handleClearAll = () => setSelected(new Set());
    const handleConfirm = () => onConfirm(Array.from(selected));

    return (
        <div className="dialog-overlay" style={{ zIndex: 1100 }}>
            <div className="dialog attr-picker-dialog">
                <div className="dialog-header">
                    <span className="dialog-title">
                        Select Attributes{!noEntity ? ` — ${entityName}` : ""}
                    </span>
                    <button className="dialog-close" onClick={onClose}>✕</button>
                </div>
                <div className="dialog-body attr-picker-body">
                    {noEntity ? (
                        <div className="attr-picker-empty">
                            No entity selected. Please select a Primary Entity first.
                        </div>
                    ) : loadError ? (
                        <div className="attr-picker-empty" style={{ color: "var(--button-danger-bg)" }}>
                            {loadError}
                        </div>
                    ) : (
                        <>
                            <input
                                className="form-input"
                                placeholder="Search attributes…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ marginBottom: "8px" }}
                            />
                            <div className="attr-picker-toolbar">
                                <button
                                    className="btn-secondary attr-picker-ctrl-btn"
                                    onClick={handleSelectAll}
                                    disabled={loading || filtered.length === 0}
                                >
                                    Select All
                                </button>
                                <button
                                    className="btn-secondary attr-picker-ctrl-btn"
                                    onClick={handleClearAll}
                                    disabled={loading}
                                >
                                    Clear All
                                </button>
                                <span className="attr-picker-count">{selected.size} selected</span>
                            </div>
                            {loading ? (
                                <div className="attr-picker-list-placeholder">Loading attributes…</div>
                            ) : (
                                <div className="attr-picker-list">
                                    {filtered.length === 0 ? (
                                        <div className="attr-picker-empty">No matching attributes</div>
                                    ) : (
                                        filtered.map((attr) => (
                                            <label key={attr.logicalName} className="attr-picker-item">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(attr.logicalName)}
                                                    onChange={() => handleToggle(attr.logicalName)}
                                                />
                                                <span className="attr-picker-logical">{attr.logicalName}</span>
                                                {attr.displayName && attr.displayName !== attr.logicalName && (
                                                    <span className="attr-picker-display">({attr.displayName})</span>
                                                )}
                                            </label>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className="dialog-footer">
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={handleConfirm}
                        disabled={noEntity}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
