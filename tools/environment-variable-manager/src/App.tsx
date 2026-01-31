import { useCallback, useEffect, useState } from "react";
import { CommandBar } from "./components/CommandBar";
import { EnvironmentVariableEditor } from "./components/EnvironmentVariableEditor";
import { EnvironmentVariableList } from "./components/EnvironmentVariableList";
import { EnvironmentVariable } from "./models/interfaces";
import "./styles/App.css";
import { DataverseClient } from "./utils/DataverseClient";

function App() {
    const [isPPTB, setIsPPTB] = useState<boolean>(false);
    const [connectionUrl, setConnectionUrl] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");

    const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
    const [filteredVariables, setFilteredVariables] = useState<EnvironmentVariable[]>([]);
    const [selectedVariable, setSelectedVariable] = useState<EnvironmentVariable | null>(null);
    const [loadingVariables, setLoadingVariables] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [showEditor, setShowEditor] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>("");

    // Detect environment and initialize
    useEffect(() => {
        const initializeEnvironment = async () => {
            if (window.toolboxAPI) {
                setIsPPTB(true);

                try {
                    const activeConnection = await window.toolboxAPI.connections.getActiveConnection();
                    setConnectionUrl(activeConnection?.url || "");
                } catch (error) {
                    console.error("Failed to get connection:", error);
                    setError("Failed to get connection from PPTB");
                }

                setLoading(false);
            } else {
                setError("This tool only works in Power Platform ToolBox (PPTB)");
                setLoading(false);
            }
        };

        initializeEnvironment();
    }, []);

    const loadVariables = useCallback(async () => {
        setLoadingVariables(true);
        setError("");

        try {
            const vars = await DataverseClient.loadEnvironmentVariables();
            setVariables(vars);
            setFilteredVariables(vars);

            if (window.toolboxAPI) {
                await window.toolboxAPI.utils.showNotification(
                    `Loaded ${vars.length} environment variable${vars.length !== 1 ? "s" : ""}`,
                    "success"
                );
            }
        } catch (error) {
            console.error("Error loading variables:", error);
            setError("Failed to load environment variables");

            if (window.toolboxAPI) {
                await window.toolboxAPI.utils.showNotification(
                    "Failed to load environment variables",
                    "error"
                );
            }
        } finally {
            setLoadingVariables(false);
        }
    }, []);

    // Load environment variables when connection is available
    useEffect(() => {
        if (connectionUrl) {
            loadVariables();
        }
    }, [connectionUrl, loadVariables]);

    // Filter variables based on search query
    useEffect(() => {
        if (searchQuery.trim() === "") {
            setFilteredVariables(variables);
        } else {
            const query = searchQuery.toLowerCase();
            const filtered = variables.filter(
                (v) =>
                    v.definition.displayname?.toLowerCase().includes(query) ||
                    v.definition.schemaname?.toLowerCase().includes(query) ||
                    v.definition.description?.toLowerCase().includes(query) ||
                    v.currentValue?.toLowerCase().includes(query)
            );
            setFilteredVariables(filtered);
        }
    }, [searchQuery, variables]);

    const handleRefresh = useCallback(() => {
        loadVariables();
    }, [loadVariables]);

    const handleCreateNew = useCallback(() => {
        setSelectedVariable(null);
        setShowEditor(true);
    }, []);

    const handleSelectVariable = useCallback((variable: EnvironmentVariable) => {
        setSelectedVariable(variable);
        setShowEditor(true);
    }, []);

    const handleSave = useCallback(
        async (variable: EnvironmentVariable, newValue: string, isDefault: boolean) => {
            setSaving(true);
            try {
                if (isDefault) {
                    // Update default value
                    await DataverseClient.updateDefaultValue(
                        variable.definition.environmentvariabledefinitionid,
                        newValue
                    );
                } else {
                    // Update or create environment-specific value
                    await DataverseClient.setEnvironmentValue(
                        variable.definition.environmentvariabledefinitionid,
                        newValue,
                        variable.value?.environmentvariablevalueid
                    );
                }

                if (window.toolboxAPI) {
                    await window.toolboxAPI.utils.showNotification(
                        `Environment variable "${variable.definition.displayname}" updated successfully`,
                        "success"
                    );
                }

                // Reload variables
                await loadVariables();
                setShowEditor(false);
            } catch (error) {
                console.error("Error saving variable:", error);
                if (window.toolboxAPI) {
                    await window.toolboxAPI.utils.showNotification(
                        "Failed to save environment variable",
                        "error"
                    );
                }
                throw error;
            } finally {
                setSaving(false);
            }
        },
        [loadVariables]
    );

    const handleCreate = useCallback(
        async (
            schemaName: string,
            displayName: string,
            type: number,
            defaultValue: string,
            description: string
        ) => {
            setSaving(true);
            try {
                await DataverseClient.createEnvironmentVariable(
                    schemaName,
                    displayName,
                    type,
                    defaultValue,
                    description
                );

                if (window.toolboxAPI) {
                    await window.toolboxAPI.utils.showNotification(
                        `Environment variable "${displayName}" created successfully`,
                        "success"
                    );
                }

                // Reload variables
                await loadVariables();
                setShowEditor(false);
            } catch (error) {
                console.error("Error creating variable:", error);
                if (window.toolboxAPI) {
                    await window.toolboxAPI.utils.showNotification(
                        "Failed to create environment variable",
                        "error"
                    );
                }
                throw error;
            } finally {
                setSaving(false);
            }
        },
        [loadVariables]
    );

    const handleDelete = useCallback(
        async (variable: EnvironmentVariable) => {
            const confirmed = window.confirm(
                `Are you sure you want to delete the environment variable "${variable.definition.displayname}"?`
            );

            if (!confirmed) {
                return;
            }

            try {
                await DataverseClient.deleteEnvironmentVariable(
                    variable.definition.environmentvariabledefinitionid
                );

                if (window.toolboxAPI) {
                    await window.toolboxAPI.utils.showNotification(
                        `Environment variable "${variable.definition.displayname}" deleted successfully`,
                        "success"
                    );
                }

                // Reload variables
                await loadVariables();

                // Clear selection if deleted variable was selected
                if (
                    selectedVariable?.definition.environmentvariabledefinitionid ===
                    variable.definition.environmentvariabledefinitionid
                ) {
                    setSelectedVariable(null);
                    setShowEditor(false);
                }
            } catch (error) {
                console.error("Error deleting variable:", error);
                if (window.toolboxAPI) {
                    await window.toolboxAPI.utils.showNotification(
                        "Failed to delete environment variable",
                        "error"
                    );
                }
            }
        },
        [loadVariables, selectedVariable]
    );

    const handleCloseEditor = useCallback(() => {
        setShowEditor(false);
        setSelectedVariable(null);
    }, []);

    if (loading) {
        return (
            <div className="app-loading">
                <div className="spinner"></div>
                <p>Loading...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="app-error">
                <div className="error-icon">⚠️</div>
                <h2>Error</h2>
                <p>{error}</p>
            </div>
        );
    }

    if (!isPPTB) {
        return (
            <div className="app-error">
                <div className="error-icon">ℹ️</div>
                <h2>Unsupported Environment</h2>
                <p>This tool only works in Power Platform ToolBox (PPTB)</p>
            </div>
        );
    }

    return (
        <div className="app">
            <CommandBar
                onRefresh={handleRefresh}
                onCreateNew={handleCreateNew}
                loading={loadingVariables}
            />
            
            <div className="search-bar">
                <input
                    type="text"
                    placeholder="Search by name, schema, description, or value..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                />
            </div>

            <div className="content">
                <EnvironmentVariableList
                    variables={filteredVariables}
                    selectedVariable={selectedVariable}
                    onSelectVariable={handleSelectVariable}
                    onRefresh={handleRefresh}
                    onDelete={handleDelete}
                    loading={loadingVariables}
                />

                {showEditor && (
                    <EnvironmentVariableEditor
                        variable={selectedVariable}
                        onSave={handleSave}
                        onCreate={handleCreate}
                        onClose={handleCloseEditor}
                        saving={saving}
                    />
                )}
            </div>
        </div>
    );
}

export default App;
