import { useState } from "react";

interface SaveFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
    existingNames: string[];
}

export function SaveFilterModal({ isOpen, onClose, onSave, existingNames }: SaveFilterModalProps) {
    const [filterName, setFilterName] = useState<string>("");
    const [error, setError] = useState<string>("");

    if (!isOpen) return null;

    const handleSave = () => {
        const trimmedName = filterName.trim();
        
        if (!trimmedName) {
            setError("Filter name is required");
            return;
        }

        if (trimmedName.length > 50) {
            setError("Filter name must be 50 characters or less");
            return;
        }

        if (existingNames.includes(trimmedName)) {
            // Ask for confirmation to overwrite
            if (!window.confirm(`A filter named "${trimmedName}" already exists. Do you want to overwrite it?`)) {
                return;
            }
        }

        onSave(trimmedName);
        setFilterName("");
        setError("");
        onClose();
    };

    const handleCancel = () => {
        setFilterName("");
        setError("");
        onClose();
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSave();
        } else if (e.key === "Escape") {
            handleCancel();
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal save-filter-modal">
                <div className="modal-header">
                    <h3>Save Filter</h3>
                    <button className="close-button" onClick={handleCancel}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label htmlFor="filterName">Filter Name:</label>
                        <input
                            type="text"
                            id="filterName"
                            className="filter-name-input"
                            value={filterName}
                            onChange={(e) => {
                                setFilterName(e.target.value);
                                setError("");
                            }}
                            onKeyDown={handleKeyPress}
                            placeholder="Enter a name for this filter"
                            autoFocus
                            maxLength={50}
                        />
                        {error && <div className="error-message">{error}</div>}
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
}
