import { useState } from "react";

interface KeyValueEditorProps {
    entries: Record<string, string>;
    onChange: (entries: Record<string, string>) => void;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    keyHeader?: string;
    valueHeader?: string;
}

export function KeyValueEditor({ entries, onChange, keyPlaceholder = "Key", valuePlaceholder = "Value", keyHeader = "Key", valueHeader = "Value" }: KeyValueEditorProps) {
    const [keyInput, setKeyInput] = useState("");
    const [valueInput, setValueInput] = useState("");

    const pairs = Object.entries(entries);

    const handleAdd = () => {
        const k = keyInput.trim();
        const v = valueInput.trim();
        if (!k || !v) return;
        onChange({ ...entries, [k]: v });
        setKeyInput("");
        setValueInput("");
    };

    const handleRemove = (key: string) => {
        const next = { ...entries };
        delete next[key];
        onChange(next);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
        }
    };

    return (
        <div>
            <div className="kv-table">
                <div className="kv-table-header">
                    <span className="kv-col-key">{keyHeader}</span>
                    <span className="kv-col-value">{valueHeader}</span>
                    <span className="kv-col-action" />
                </div>
                {pairs.length > 0 ? (
                    <div className="kv-table-body">
                        {pairs.map(([k, v]) => (
                            <div key={k} className="kv-row">
                                <span className="kv-col-key kv-cell" title={k}>
                                    {k}
                                </span>
                                <span className="kv-col-value kv-cell" title={v}>
                                    {v}
                                </span>
                                <span className="kv-col-action">
                                    <button className="string-list-remove" onClick={() => handleRemove(k)} title="Remove">
                                        ✕
                                    </button>
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="string-list-empty">No overrides</div>
                )}
            </div>
            <div className="kv-add-row">
                <input className="form-input kv-add-key" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={keyPlaceholder} />
                <input className="form-input kv-add-value" value={valueInput} onChange={(e) => setValueInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={valuePlaceholder} />
                <button className="string-list-add-btn" onClick={handleAdd} disabled={!keyInput.trim() || !valueInput.trim()}>
                    Add
                </button>
            </div>
        </div>
    );
}
