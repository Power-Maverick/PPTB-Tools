import { useEffect, useState } from "react";
import { DataverseClient } from "./utils/DataverseClient";
import { Entity, View } from "./models/interfaces";

interface UpdateProgress {
    viewId: string;
    viewName: string;
    status: 'pending' | 'success' | 'error';
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
    
    // Step 3: Replication Progress
    const [isReplicating, setIsReplicating] = useState<boolean>(false);
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
                    console.error('Failed to get connection:', error);
                }
                
                setLoading(false);
            } else {
                setError('Not running in Power Platform ToolBox (PPTB). This tool requires PPTB.');
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

    const showNotification = async (title: string, body: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (isPPTB && window.toolboxAPI) {
            await window.toolboxAPI.utils.showNotification({
                title,
                body,
                type
            });
        }
    };

    const handleSourceViewChange = (viewId: string) => {
        setSourceView(viewId);
        // Remove from target views if it was there
        setTargetViews(targetViews.filter(id => id !== viewId));
    };

    const handleTargetViewToggle = (viewId: string) => {
        if (viewId === sourceView) return; // Can't select source as target
        
        if (targetViews.includes(viewId)) {
            setTargetViews(targetViews.filter(id => id !== viewId));
        } else {
            setTargetViews([...targetViews, viewId]);
        }
    };

    const handleReplicateLayout = async () => {
        if (!sourceView || targetViews.length === 0) {
            showError('Please select a source view and at least one target view');
            return;
        }

        if (!sourceViewLayout) {
            showError('Source view layout is not available');
            return;
        }

        setIsReplicating(true);
        const progress: UpdateProgress[] = targetViews.map(viewId => ({
            viewId,
            viewName: views.find(v => v.savedqueryid === viewId)?.name || viewId,
            status: 'pending'
        }));
        setUpdateProgress(progress);

        const client = new DataverseClient();

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < targetViews.length; i++) {
            const viewId = targetViews[i];
            const viewName = views.find(v => v.savedqueryid === viewId)?.name || viewId;

            try {
                await client.updateViewLayout(viewId, sourceViewLayout);
                progress[i] = {
                    viewId,
                    viewName,
                    status: 'success',
                    message: 'Layout updated successfully'
                };
                successCount++;
            } catch (error: any) {
                progress[i] = {
                    viewId,
                    viewName,
                    status: 'error',
                    message: error.message
                };
                errorCount++;
            }

            setUpdateProgress([...progress]);
        }

        setIsReplicating(false);
        
        if (errorCount === 0) {
            await showNotification(
                'Success',
                `Layout replicated to ${successCount} view(s) successfully`,
                'success'
            );
        } else {
            await showNotification(
                'Completed with errors',
                `Success: ${successCount}, Failed: ${errorCount}`,
                'error'
            );
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
            <header className="header">
                <h1>📋 View Layout Replicator</h1>
                <p>Apply the same layout to multiple views of the same entity</p>
            </header>

            {error && (
                <div className="error">
                    {error}
                </div>
            )}

            <div className="card">
                <div className="info-message">
                    <strong>✓ Connected to Dataverse</strong><br />
                    Environment: <span>{connectionUrl || "Not connected"}</span>
                </div>
            </div>

            {/* Step 1: Select Entity */}
            <div className="card step-section">
                <div className="step-header">
                    <div className="step-number">1</div>
                    <div className="step-title">Select Entity</div>
                </div>
                
                <div className="form-group">
                    <label htmlFor="entitySelect">Choose the entity whose views you want to work with</label>
                    <select 
                        id="entitySelect" 
                        value={selectedEntity}
                        onChange={(e) => setSelectedEntity(e.target.value)}
                        disabled={entities.length === 0 || loading}
                    >
                        <option value="">-- Select an Entity --</option>
                        {entities.map((entity) => (
                            <option key={entity.logicalName} value={entity.logicalName}>
                                {entity.displayName} ({entity.logicalName})
                            </option>
                        ))}
                    </select>
                    <div className="help-text">
                        Select the entity that contains the views you want to replicate
                    </div>
                </div>
            </div>

            {/* Step 2: Select Source and Target Views */}
            {selectedEntity && views.length > 0 && (
                <div className="card step-section">
                    <div className="step-header">
                        <div className="step-number">2</div>
                        <div className="step-title">Select Views</div>
                    </div>

                    <h3>Source View</h3>
                    <p className="help-text">Select the view whose layout you want to copy</p>
                    
                    <div className="view-list">
                        {views.map((view) => (
                            <div
                                key={view.savedqueryid}
                                className={`view-item ${sourceView === view.savedqueryid ? 'source' : ''}`}
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

                    {sourceView && sourceViewLayout && (
                        <>
                            <h3>Source Layout Preview</h3>
                            <div className="layout-preview">
                                <pre>{sourceViewLayout}</pre>
                            </div>
                        </>
                    )}

                    {sourceView && (
                        <>
                            <h3 style={{ marginTop: '30px' }}>Target Views</h3>
                            <p className="help-text">
                                Select one or more views to apply the source layout to
                            </p>
                            
                            <div className="view-list">
                                {views
                                    .filter(view => view.savedqueryid !== sourceView)
                                    .map((view) => (
                                        <div
                                            key={view.savedqueryid}
                                            className={`view-item ${targetViews.includes(view.savedqueryid) ? 'selected' : ''}`}
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

                            {targetViews.length > 0 && (
                                <div className="success-message" style={{ marginTop: '15px' }}>
                                    <strong>{targetViews.length}</strong> view(s) selected for layout replication
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Step 3: Replicate */}
            {sourceView && targetViews.length > 0 && (
                <div className="card step-section">
                    <div className="step-header">
                        <div className="step-number">3</div>
                        <div className="step-title">Replicate Layout</div>
                    </div>

                    <p className="help-text">
                        Click the button below to apply the source view layout to all selected target views
                    </p>

                    <div className="button-group">
                        <button 
                            className="btn btn-success" 
                            onClick={handleReplicateLayout}
                            disabled={isReplicating}
                        >
                            {isReplicating ? 'Replicating...' : '✓ Replicate Layout'}
                        </button>
                        <button 
                            className="btn btn-secondary" 
                            onClick={handleReset}
                            disabled={isReplicating}
                        >
                            Reset
                        </button>
                    </div>

                    {updateProgress.length > 0 && (
                        <div className="progress-section">
                            <h3>Progress</h3>
                            {updateProgress.map((item) => (
                                <div 
                                    key={item.viewId} 
                                    className={`progress-item ${item.status}`}
                                >
                                    <div>
                                        <span className="status-icon">
                                            {item.status === 'success' && '✓'}
                                            {item.status === 'error' && '✗'}
                                            {item.status === 'pending' && '⋯'}
                                        </span>
                                        <strong>{item.viewName}</strong>
                                        {item.message && <span> - {item.message}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
