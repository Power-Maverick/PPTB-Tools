import { useState } from "react";

interface StringListEditorProps {
    items: string[];
    onChange: (items: string[]) => void;
    placeholder?: string;
}

export function StringListEditor({ items, onChange, placeholder = "Add value..." }: StringListEditorProps) {
    const [inputValue, setInputValue] = useState("");

    const handleAdd = () => {
        const trimmed = inputValue.trim();
        if (!trimmed || items.includes(trimmed)) return;
        onChange([...items, trimmed]);
        setInputValue("");
    };

    const handleRemove = (index: number) => {
        onChange(items.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
        }
    };

    return (
        <div>
            {items.length > 0 ? (
                <div className="string-list">
                    {items.map((item, i) => (
                        <div key={i} className="string-list-item">
                            <span className="string-list-item-text" title={item}>
                                {item}
                            </span>
                            <button className="string-list-remove" onClick={() => handleRemove(i)} title="Remove">
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="string-list">
                    <div className="string-list-empty">No items</div>
                </div>
            )}
            <div className="string-list-add">
                <input className="form-input" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} placeholder={placeholder} />
                <button className="string-list-add-btn" onClick={handleAdd} disabled={!inputValue.trim()}>
                    Add
                </button>
            </div>
        </div>
    );
}
