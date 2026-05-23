import { useState, useEffect, useRef } from "react";
import { DataverseClient } from "../utils/DataverseClient";

interface EntityPickerDialogProps {
    isOpen: boolean;
    selectedEntities: string[];
    onConfirm: (entities: string[]) => void;
    onClose: () => void;
}

const client = new DataverseClient();

export function EntityPickerDialog({ isOpen, selectedEntities, onConfirm, onClose }: EntityPickerDialogProps) {
    const [entities, setEntities] = useState<Array<{ logicalName: string; displayName: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set(selectedEntities));

    const initRef = useRef<string[]>(selectedEntities);
    initRef.current = selectedEntities;

    useEffect(() => {
        if (!isOpen) return;
        setSelected(new Set(initRef.current));
        setSearch("");
        setEntities([]);
        setLoadError("");

        if (!window.dataverseAPI) {
            setLoadError("No Dataverse connection. Connect to an environment in PPTB first.");
            return;
        }

        setLoading(true);
        client
            .fetchAllEntities()
            .then(setEntities)
            .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, [isOpen]);

    if (!isOpen) return null;

    const q = search.toLowerCase();
    const filtered = entities.filter((e) => e.logicalName.includes(q) || e.displayName.toLowerCase().includes(q));

    const handleToggle = (logicalName: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(logicalName)) next.delete(logicalName);
            else next.add(logicalName);
            return next;
        });
    };

    const handleSelectAll = () => setSelected(new Set(filtered.map((e) => e.logicalName)));
    const handleClearAll = () => setSelected(new Set());
    const handleConfirm = () => onConfirm(Array.from(selected));

    return (
        <div className="dialog-overlay" style={{ zIndex: 1100 }}>
            <div className="dialog">
                <div className="dialog-header">
                    <span className="dialog-title">Select Entities</span>
                    <button className="dialog-close" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="dialog-body">
                    {loadError ? (
                        <div className="entity-picker-empty" style={{ color: "var(--button-danger-bg)" }}>
                            {loadError}
                        </div>
                    ) : (
                        <>
                            <input className="form-input" placeholder="Search entities..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: "8px" }} />
                            <div className="entity-picker-toolbar">
                                <button className="btn-secondary" style={{ padding: "3px 10px", fontSize: "11px" }} onClick={handleSelectAll} disabled={loading || filtered.length === 0}>
                                    Select All
                                </button>
                                <button className="btn-secondary" style={{ padding: "3px 10px", fontSize: "11px" }} onClick={handleClearAll} disabled={loading}>
                                    Clear All
                                </button>
                                <span className="entity-picker-count">{selected.size} selected</span>
                            </div>
                            {loading ? (
                                <div className="entity-picker-empty">Loading entities...</div>
                            ) : (
                                <div className="entity-picker-list">
                                    {filtered.length === 0 ? (
                                        <div className="entity-picker-empty">No matching entities</div>
                                    ) : (
                                        filtered.map((entity) => (
                                            <label key={entity.logicalName} className="entity-picker-item">
                                                <input type="checkbox" checked={selected.has(entity.logicalName)} onChange={() => handleToggle(entity.logicalName)} />
                                                <span className="entity-picker-logical">{entity.logicalName}</span>
                                                {entity.displayName && entity.displayName !== entity.logicalName && <span className="entity-picker-display">({entity.displayName})</span>}
                                            </label>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className="dialog-footer">
                    <button className="btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn-primary" onClick={handleConfirm}>
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
