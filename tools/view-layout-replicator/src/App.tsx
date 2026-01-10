import { useEffect, useState } from "react";
import { Entity, View } from "./models/interfaces";
import { DataverseClient } from "./utils/DataverseClient";

interface UpdateProgress {
    viewId: string;
    viewName: string;
    status: "pending" | "success" | "error";
    message?: string;
}

function App() {
    const [isPPTB, setIsPPTB] = useState<boolean>(false);
    const [connectionUrl, setConnectionUrl] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");

    // Step 1: Entity Selection
    const [entities, setEntities] = useState<Entity[]>([]);
    const [selectedEntity, setSelectedEntity] = useState<string>("");

    // Step 2: View Selection
    const [views, setViews] = useState<View[]>([]);
    const [sourceView, setSourceView] = useState<string>("");
    const [sourceViewLayout, setSourceViewLayout] = useState<string>("");
    const [targetViews, setTargetViews] = useState<string[]>([]);

    // Step 3: Copy Progress
    const [isCopying, setIsCopying] = useState<boolean>(false);
    const [updateProgress, setUpdateProgress] = useState<UpdateProgress[]>([]);

    // Detect environment and initialize
    useEffect(() => {
        const initializeEnvironment = async () => {
            // Check if we're in PPTB
            if (window.toolboxAPI) {
                setIsPPTB(true);

                try {
                    const activeConnection = await window.toolboxAPI.connections.getActiveConnection();
                    setConnectionUrl(activeConnection?.url || "");
                } catch (error) {
                    console.error("Failed to get connection:", error);
                }

                setLoading(false);
            } else {
                setError("Not running in Power Platform ToolBox (PPTB). This tool requires PPTB.");
                setLoading(false);
            }
        };

        initializeEnvironment();
    }, []);

    // Load entities when connection is available
    useEffect(() => {
        if (connectionUrl) {
            loadEntities();
        }
    }, [connectionUrl]);

    // Load views when entity is selected
    useEffect(() => {
        if (selectedEntity) {
            loadViews();
        } else {
            setViews([]);
            setSourceView("");
            setTargetViews([]);
        }
    }, [selectedEntity]);

    // Load source view layout when source view is selected
    useEffect(() => {
        if (sourceView) {
            loadSourceViewLayout();
        } else {
            setSourceViewLayout("");
        }
    }, [sourceView]);

    const loadEntities = async () => {
        try {
            setLoading(true);
            const client = new DataverseClient();

            const entityList = await client.listEntities();
            setEntities(entityList);
        } catch (error: any) {
            showError(`Failed to load entities: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const loadViews = async () => {
        try {
            setLoading(true);
            const client = new DataverseClient();

            const viewList = await client.listViews(selectedEntity);
            setViews(viewList);
        } catch (error: any) {
            showError(`Failed to load views: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const loadSourceViewLayout = async () => {
        try {
            const client = new DataverseClient();

            const view = await client.getView(sourceView);
            setSourceViewLayout(view.layoutxml);
        } catch (error: any) {
            showError(`Failed to load source view layout: ${error.message}`);
        }
    };

    const showError = (message: string) => {
        setError(message);
        setTimeout(() => setError(""), 5000);
    };

    const showNotification = async (title: string, body: string, type: "success" | "error" | "info" = "success") => {
        if (isPPTB && window.toolboxAPI) {
            await window.toolboxAPI.utils.showNotification({
                title,
                body,
                type,
            });
        }
    };

    const handleSourceViewChange = (viewId: string) => {
        setSourceView(viewId);
        // Remove from target views if it was there
        setTargetViews(targetViews.filter((id) => id !== viewId));
    };

    const handleTargetViewToggle = (viewId: string) => {
        if (viewId === sourceView) return; // Can't select source as target

        if (targetViews.includes(viewId)) {
            setTargetViews(targetViews.filter((id) => id !== viewId));
        } else {
            setTargetViews([...targetViews, viewId]);
        }
    };

    const handleReplicateLayout = async () => {
        if (!sourceView || targetViews.length === 0) {
            showError("Please select a source view and at least one target view");
            return;
        }

        if (!sourceViewLayout) {
            showError("Source view layout is not available");
            return;
        }

        setIsCopying(true);
        const progress: UpdateProgress[] = targetViews.map((viewId) => ({
            viewId,
            viewName: views.find((v) => v.savedqueryid === viewId)?.name || viewId,
            status: "pending",
        }));
        setUpdateProgress(progress);

        const client = new DataverseClient();

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < targetViews.length; i++) {
            const viewId = targetViews[i];
            const viewName = views.find((v) => v.savedqueryid === viewId)?.name || viewId;

            try {
                await client.updateViewLayout(selectedEntity, viewId, sourceViewLayout);
                progress[i] = {
                    viewId,
                    viewName,
                    status: "success",
                    message: "Layout updated successfully",
                };
                successCount++;
            } catch (error: any) {
                progress[i] = {
                    viewId,
                    viewName,
                    status: "error",
                    message: error.message,
                };
                errorCount++;
            }

            setUpdateProgress([...progress]);
        }

        setIsCopying(false);

        if (errorCount === 0) {
            await showNotification("Success", `Layout copied to ${successCount} view(s) successfully`, "success");
        } else {
            await showNotification("Completed with errors", `Success: ${successCount}, Failed: ${errorCount}`, "error");
        }
    };

    const handleReset = () => {
        setSelectedEntity("");
        setSourceView("");
        setTargetViews([]);
        setUpdateProgress([]);
    };

    if (loading && !connectionUrl) {
        return (
            <div className="container">
                <div className="loading">Loading...</div>
            </div>
        );
    }

    if (error && !isPPTB) {
        return (
            <div className="container">
                <div className="error">{error}</div>
            </div>
        );
    }

    return (
        <div className="container">
            {error && <div className="error">{error}</div>}

            <div className="content-wrapper">
                {/* Entity Selection */}
                <div className="section">
                    <div className="section-title">Select Entity</div>
                    <div className="form-group">
                        <select id="entitySelect" value={selectedEntity} onChange={(e) => setSelectedEntity(e.target.value)} disabled={entities.length === 0 || loading}>
                            <option value="">-- Select an Entity --</option>
                            {entities.map((entity) => (
                                <option key={entity.logicalName} value={entity.logicalName}>
                                    {entity.displayName} ({entity.logicalName})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* View Selection */}
                {selectedEntity && views.length > 0 && (
                    <div className="main-section">
                        <div className="section">
                            <div className="section-title">Select Views</div>

                            <div className="views-container">
                                {/* Source View Panel */}
                                <div className="views-panel">
                                    <div className="panel-header">
                                        <div className="panel-title">Source View</div>
                                        <div className="panel-subtitle">Select the view to copy layout from</div>
                                    </div>

                                    <div className="view-list">
                                        {views.map((view) => (
                                            <div
                                                key={view.savedqueryid}
                                                className={`view-item ${sourceView === view.savedqueryid ? "source" : ""}`}
                                                onClick={() => handleSourceViewChange(view.savedqueryid)}
                                            >
                                                <input
                                                    type="radio"
                                                    name="sourceView"
                                                    checked={sourceView === view.savedqueryid}
                                                    onChange={() => handleSourceViewChange(view.savedqueryid)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <span>{view.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Target Views Panel */}
                                {sourceView && (
                                    <div className="views-panel">
                                        <div className="panel-header">
                                            <div className="panel-title">Target Views</div>
                                            <div className="panel-subtitle">Select views to apply the layout to</div>
                                        </div>

                                        <div className="view-list">
                                            {views
                                                .filter((view) => view.savedqueryid !== sourceView)
                                                .map((view) => (
                                                    <div
                                                        key={view.savedqueryid}
                                                        className={`view-item ${targetViews.includes(view.savedqueryid) ? "selected" : ""}`}
                                                        onClick={() => handleTargetViewToggle(view.savedqueryid)}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={targetViews.includes(view.savedqueryid)}
                                                            onChange={() => handleTargetViewToggle(view.savedqueryid)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <span>{view.name}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Action Bar */}
                {sourceView && targetViews.length > 0 && (
                    <div className="action-bar">
                        <div className="selection-info">
                            <strong>{targetViews.length}</strong> view(s) selected for copying
                        </div>
                        <div className="button-group">
                            <button className="btn btn-success" onClick={handleCopyLayout} disabled={isCopying}>
                                {isCopying ? "Copying..." : "✓ Copy Layout"}
                            </button>
                            <button className="btn btn-secondary" onClick={handleReset} disabled={isCopying}>
                                Reset
                            </button>
                        </div>
                    </div>
                )}

                {/* Progress */}
                {updateProgress.length > 0 && (
                    <div className="section">
                        <div className="section-title">Progress</div>
                        <div className="progress-list">
                            {updateProgress.map((item) => (
                                <div key={item.viewId} className={`progress-item ${item.status}`}>
                                    <span className="status-icon">
                                        {item.status === "success" && "✓"}
                                        {item.status === "error" && "✗"}
                                        {item.status === "pending" && "⋯"}
                                    </span>
                                    <div>
                                        <strong>{item.viewName}</strong>
                                        {item.message && <span> - {item.message}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
