import { useState } from "react";

interface EntityAttributeEditorProps {
    entries: Record<string, string[]>;
    onChange: (entries: Record<string, string[]>) => void;
}

export function EntityAttributeEditor({ entries, onChange }: EntityAttributeEditorProps) {
    const [entityInput, setEntityInput] = useState("");
    const [attrInput, setAttrInput] = useState("");

    const [addAttrInputs, setAddAttrInputs] = useState<Record<string, string>>({});

    const entityNames = Object.keys(entries);

    const handleAddEntity = () => {
        const entity = entityInput.trim().toLowerCase();
        const attr = attrInput.trim().toLowerCase();
        if (!entity || !attr || entries[entity]) return;
        onChange({ ...entries, [entity]: [attr] });
        setEntityInput("");
        setAttrInput("");
    };

    const handleRemoveEntity = (entity: string) => {
        const next = { ...entries };
        delete next[entity];
        onChange(next);
    };

    const handleAddAttr = (entity: string) => {
        const attr = (addAttrInputs[entity] ?? "").trim().toLowerCase();
        if (!attr || (entries[entity] ?? []).includes(attr)) return;
        onChange({ ...entries, [entity]: [...(entries[entity] ?? []), attr] });
        setAddAttrInputs((prev) => ({ ...prev, [entity]: "" }));
    };

    const handleRemoveAttr = (entity: string, attr: string) => {
        const updated = (entries[entity] ?? []).filter((a) => a !== attr);
        if (updated.length === 0) {
            const next = { ...entries };
            delete next[entity];
            onChange(next);
        } else {
            onChange({ ...entries, [entity]: updated });
        }
    };

    const handleEntityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAddEntity();
        }
    };

    const handleInlineKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, entity: string) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAddAttr(entity);
        }
    };

    return (
        <div>
            <div className="ea-table">
                {entityNames.length === 0 ? (
                    <div className="string-list-empty">No entries</div>
                ) : (
                    entityNames.map((entity) => (
                        <div key={entity} className="ea-entity-row">
                            <div className="ea-entity-header">
                                <span className="ea-entity-name" title={entity}>
                                    {entity}
                                </span>
                                <button className="string-list-remove" onClick={() => handleRemoveEntity(entity)} title="Remove entity">
                                    ✕
                                </button>
                            </div>
                            <div className="ea-attr-area">
                                <div className="ea-chip-list">
                                    {(entries[entity] ?? []).map((attr) => (
                                        <span key={attr} className="ea-chip">
                                            <span className="ea-chip-label">{attr}</span>
                                            <button className="ea-chip-remove" onClick={() => handleRemoveAttr(entity, attr)} title="Remove attribute">
                                                ✕
                                            </button>
                                        </span>
                                    ))}
                                    <span className="ea-inline-add">
                                        <input
                                            className="form-input ea-inline-input"
                                            value={addAttrInputs[entity] ?? ""}
                                            onChange={(e) => setAddAttrInputs((prev) => ({ ...prev, [entity]: e.target.value }))}
                                            onKeyDown={(e) => handleInlineKeyDown(e, entity)}
                                            placeholder="Add attribute..."
                                        />
                                        <button className="string-list-add-btn" onClick={() => handleAddAttr(entity)} disabled={!(addAttrInputs[entity] ?? "").trim()}>
                                            Add
                                        </button>
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div className="ea-add-row">
                <input className="form-input ea-add-entity" value={entityInput} onChange={(e) => setEntityInput(e.target.value)} onKeyDown={handleEntityKeyDown} placeholder="Entity logical name..." />
                <input className="form-input ea-add-attr" value={attrInput} onChange={(e) => setAttrInput(e.target.value)} onKeyDown={handleEntityKeyDown} placeholder="First attribute..." />
                <button className="string-list-add-btn" onClick={handleAddEntity} disabled={!entityInput.trim() || !attrInput.trim() || !!entries[entityInput.trim().toLowerCase()]}>
                    Add
                </button>
            </div>
        </div>
    );
}
