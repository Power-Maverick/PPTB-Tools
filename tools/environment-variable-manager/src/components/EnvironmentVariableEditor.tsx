import { useState, useEffect } from "react";
import { EnvironmentVariableEditorProps, VariableType } from "../models/interfaces";

export function EnvironmentVariableEditor({
    variable,
    onSave,
    onCreate,
    onClose,
    saving,
}: EnvironmentVariableEditorProps) {
    const isNew = !variable;

    // Form state
    const [schemaName, setSchemaName] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [description, setDescription] = useState("");
    const [type, setType] = useState<number>(VariableType.String);
    const [defaultValue, setDefaultValue] = useState("");
    const [envValue, setEnvValue] = useState("");
    const [editMode, setEditMode] = useState<"default" | "environment">("default");

    // Initialize form with variable data
    useEffect(() => {
        if (variable) {
            setSchemaName(variable.definition.schemaname || "");
            setDisplayName(variable.definition.displayname || "");
            setDescription(variable.definition.description || "");
            setType(variable.definition.type);
            setDefaultValue(variable.definition.defaultvalue || "");
            setEnvValue(variable.value?.value || "");
            setEditMode(variable.hasCustomValue ? "environment" : "default");
        } else {
            // Reset for new variable
            setSchemaName("");
            setDisplayName("");
            setDescription("");
            setType(VariableType.String);
            setDefaultValue("");
            setEnvValue("");
            setEditMode("default");
        }
    }, [variable]);

    const handleSave = async () => {
        if (isNew) {
            // Create new variable
            if (!schemaName || !displayName) {
                alert("Schema Name and Display Name are required");
                return;
            }
            await onCreate(schemaName, displayName, type, defaultValue, description);
        } else {
            // Update existing variable
            const valueToSave = editMode === "default" ? defaultValue : envValue;
            await onSave(variable, valueToSave, editMode === "default");
        }
    };

    const getTypeLabel = (typeValue: number): string => {
        switch (typeValue) {
            case VariableType.String:
                return "String";
            case VariableType.Number:
                return "Number";
            case VariableType.Boolean:
                return "Boolean";
            case VariableType.JSON:
                return "JSON";
            case VariableType.DataSource:
                return "Data Source";
            default:
                return "Unknown";
        }
    };

    return (
        <div className="editor-overlay">
            <div className="editor-container">
                <div className="editor-header">
                    <h2>{isNew ? "Create New Variable" : "Edit Variable"}</h2>
                    <button className="close-btn" onClick={onClose} disabled={saving}>
                        ✕
                    </button>
                </div>

                <div className="editor-content">
                    {isNew ? (
                        <>
                            <div className="form-group">
                                <label>Schema Name *</label>
                                <input
                                    type="text"
                                    value={schemaName}
                                    onChange={(e) => setSchemaName(e.target.value)}
                                    placeholder="e.g., new_MyVariable"
                                    disabled={saving}
                                />
                            </div>

                            <div className="form-group">
                                <label>Display Name *</label>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder="e.g., My Variable"
                                    disabled={saving}
                                />
                            </div>

                            <div className="form-group">
                                <label>Type *</label>
                                <select
                                    value={type}
                                    onChange={(e) => setType(Number(e.target.value))}
                                    disabled={saving}
                                >
                                    <option value={VariableType.String}>String</option>
                                    <option value={VariableType.Number}>Number</option>
                                    <option value={VariableType.Boolean}>Boolean</option>
                                    <option value={VariableType.JSON}>JSON</option>
                                    <option value={VariableType.DataSource}>Data Source</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Optional description"
                                    rows={3}
                                    disabled={saving}
                                />
                            </div>

                            <div className="form-group">
                                <label>Default Value</label>
                                <textarea
                                    value={defaultValue}
                                    onChange={(e) => setDefaultValue(e.target.value)}
                                    placeholder="Optional default value"
                                    rows={4}
                                    disabled={saving}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="info-section">
                                <div className="info-row">
                                    <span className="info-label">Schema Name:</span>
                                    <span className="info-value">{variable.definition.schemaname}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Display Name:</span>
                                    <span className="info-value">{variable.definition.displayname}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Type:</span>
                                    <span className="info-value">{getTypeLabel(variable.definition.type)}</span>
                                </div>
                                {variable.definition.description && (
                                    <div className="info-row">
                                        <span className="info-label">Description:</span>
                                        <span className="info-value">{variable.definition.description}</span>
                                    </div>
                                )}
                            </div>

                            <div className="edit-mode-selector">
                                <button
                                    className={`mode-btn ${editMode === "default" ? "active" : ""}`}
                                    onClick={() => setEditMode("default")}
                                    disabled={saving}
                                >
                                    Default Value
                                </button>
                                <button
                                    className={`mode-btn ${editMode === "environment" ? "active" : ""}`}
                                    onClick={() => setEditMode("environment")}
                                    disabled={saving}
                                >
                                    Environment Value
                                </button>
                            </div>

                            {editMode === "default" ? (
                                <div className="form-group">
                                    <label>Default Value</label>
                                    <textarea
                                        value={defaultValue}
                                        onChange={(e) => setDefaultValue(e.target.value)}
                                        placeholder="Enter default value"
                                        rows={6}
                                        disabled={saving}
                                    />
                                    <p className="hint">
                                        This value will be used across all environments unless overridden
                                    </p>
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label>Environment-Specific Value</label>
                                    <textarea
                                        value={envValue}
                                        onChange={(e) => setEnvValue(e.target.value)}
                                        placeholder="Enter environment-specific value"
                                        rows={6}
                                        disabled={saving}
                                    />
                                    <p className="hint">
                                        This value overrides the default for this environment only
                                    </p>
                                    {variable.definition.defaultvalue && (
                                        <div className="default-reference">
                                            <span className="default-label">Default value:</span>
                                            <span className="default-value">{variable.definition.defaultvalue}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="editor-footer">
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? "Saving..." : isNew ? "Create" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
