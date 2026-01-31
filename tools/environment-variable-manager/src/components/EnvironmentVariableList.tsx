import { EnvironmentVariableListProps, VariableType } from "../models/interfaces";

export function EnvironmentVariableList({
    variables,
    selectedVariable,
    onSelectVariable,
    onDelete,
    loading,
}: EnvironmentVariableListProps) {
    const getTypeLabel = (type: number): string => {
        switch (type) {
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

    if (loading && variables.length === 0) {
        return (
            <div className="list-container">
                <div className="loading-message">
                    <div className="spinner"></div>
                    <p>Loading environment variables...</p>
                </div>
            </div>
        );
    }

    if (variables.length === 0) {
        return (
            <div className="list-container">
                <div className="empty-message">
                    <p>No environment variables found</p>
                    <p className="hint">Click "New Variable" to create one</p>
                </div>
            </div>
        );
    }

    return (
        <div className="list-container">
            <div className="list-header">
                <span className="count">{variables.length} variable{variables.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="variable-list">
                {variables.map((variable) => (
                    <div
                        key={variable.definition.environmentvariabledefinitionid}
                        className={`variable-item ${
                            selectedVariable?.definition.environmentvariabledefinitionid ===
                            variable.definition.environmentvariabledefinitionid
                                ? "selected"
                                : ""
                        }`}
                    >
                        <div
                            className="variable-item-content"
                            onClick={() => onSelectVariable(variable)}
                        >
                            <div className="variable-header">
                                <span className="variable-name">
                                    {variable.definition.displayname}
                                </span>
                                {variable.hasCustomValue && (
                                    <span className="custom-badge" title="Has environment-specific value">
                                        🔧
                                    </span>
                                )}
                                <span className="variable-type">
                                    {getTypeLabel(variable.definition.type)}
                                </span>
                            </div>
                            <div className="variable-schema">
                                {variable.definition.schemaname}
                            </div>
                            {variable.definition.description && (
                                <div className="variable-description">
                                    {variable.definition.description}
                                </div>
                            )}
                            <div className="variable-value">
                                <span className="value-label">
                                    {variable.hasCustomValue ? "Current:" : "Default:"}
                                </span>
                                <span className="value-text">
                                    {variable.currentValue || "(empty)"}
                                </span>
                            </div>
                        </div>
                        <button
                            className="delete-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(variable);
                            }}
                            title="Delete variable"
                        >
                            🗑️
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
