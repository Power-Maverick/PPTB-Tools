import { useEffect, useState } from "react";
import { PCFControlConfig, PCFSolutionConfig, CommandResult } from "./models/interfaces";

// Import PPTB types
/// <reference types="@pptb/types" />

type ViewMode = 'home' | 'new-control' | 'edit-control' | 'solution' | 'settings';

function App() {
    const [viewMode, setViewMode] = useState<ViewMode>('home');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");
    const [isPPTB, setIsPPTB] = useState<boolean>(false);
    const [connectionUrl, setConnectionUrl] = useState<string>("");
    const [projectPath, setProjectPath] = useState<string>("");
    const [terminalId, setTerminalId] = useState<string | null>(null);
    
    // Control configuration state
    const [controlConfig, setControlConfig] = useState<PCFControlConfig>({
        namespace: '',
        name: '',
        displayName: '',
        description: '',
        controlType: 'standard',
        template: 'field',
        version: '1.0.0',
        additionalPackages: []
    });
    
    // Solution configuration state
    const [solutionConfig, setSolutionConfig] = useState<PCFSolutionConfig>({
        solutionName: '',
        publisherName: '',
        publisherPrefix: '',
        publisherFriendlyName: '',
        version: '1.0.0'
    });
    
    // Output state
    const [commandOutput, setCommandOutput] = useState<string>("");

    // Initialize PPTB environment
    useEffect(() => {
        const initializeEnvironment = async () => {
            if (window.toolboxAPI) {
                setIsPPTB(true);
                
                try {
                    // Create a terminal for executing commands
                    const terminal = await window.toolboxAPI.terminal.create({
                        name: 'PCF Builder Terminal',
                        visible: false
                    });
                    setTerminalId(terminal.id);
                    
                    const activeConnection = await window.toolboxAPI.connections.getActiveConnection();
                    setConnectionUrl(activeConnection?.url || "");
                    
                    await window.toolboxAPI.utils.showNotification({
                        title: "PCF Builder",
                        body: "PCF Builder loaded successfully",
                        type: "success"
                    });
                } catch (error) {
                    console.error('Failed to initialize:', error);
                    setError('Failed to initialize PCF Builder');
                }
                
                setLoading(false);
            } else {
                setError('Not running in PPTB environment. This tool only works with Power Platform ToolBox.');
                setLoading(false);
            }
        };

        initializeEnvironment();
        
        // Cleanup terminal on unmount
        return () => {
            if (terminalId && window.toolboxAPI) {
                window.toolboxAPI.terminal.close(terminalId).catch(console.error);
            }
        };
    }, []);

    // Handler for creating new control
    const handleCreateControl = async () => {
        if (!window.toolboxAPI || !terminalId) return;
        
        if (!projectPath) {
            await window.toolboxAPI.utils.showNotification({
                title: "Error",
                body: "Please enter a project path first",
                type: "error"
            });
            return;
        }
        
        setLoading(true);
        setCommandOutput("");
        
        try {
            await window.toolboxAPI.utils.showLoading("Creating PCF control...");
            
            // Build pac pcf init command
            const additionalPackages = controlConfig.additionalPackages?.join(' ') || '';
            const command = `cd "${projectPath}" && pac pcf init --namespace ${controlConfig.namespace} --name ${controlConfig.name} --template ${controlConfig.template}${additionalPackages ? ' --npm-packages ' + additionalPackages : ''}`;
            
            const result = await window.toolboxAPI.terminal.execute(terminalId, command);
            
            await window.toolboxAPI.utils.hideLoading();
            
            if (result.exitCode === 0) {
                setCommandOutput(result.output || '');
                await window.toolboxAPI.utils.showNotification({
                    title: "Success",
                    body: "PCF control created successfully",
                    type: "success"
                });
            } else {
                setCommandOutput(result.error || result.output || 'Command failed');
                await window.toolboxAPI.utils.showNotification({
                    title: "Error",
                    body: "Failed to create PCF control",
                    type: "error"
                });
            }
        } catch (error) {
            await window.toolboxAPI.utils.hideLoading();
            const errorMsg = error instanceof Error ? error.message : String(error);
            setError(errorMsg);
            await window.toolboxAPI.utils.showNotification({
                title: "Error",
                body: errorMsg,
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    };

    // Handler for building project
    const handleBuildProject = async () => {
        if (!window.toolboxAPI || !terminalId || !projectPath) {
            await window.toolboxAPI?.utils.showNotification({
                title: "Error",
                body: "Please enter a project path first",
                type: "error"
            });
            return;
        }
        
        setLoading(true);
        setCommandOutput("");
        
        try {
            await window.toolboxAPI.utils.showLoading("Building project...");
            const command = `cd "${projectPath}" && npm run build`;
            const result = await window.toolboxAPI.terminal.execute(terminalId, command);
            
            await window.toolboxAPI.utils.hideLoading();
            
            if (result.exitCode === 0) {
                setCommandOutput(result.output || '');
                await window.toolboxAPI.utils.showNotification({
                    title: "Success",
                    body: "Project built successfully",
                    type: "success"
                });
            } else {
                setCommandOutput(result.error || result.output || 'Build failed');
                await window.toolboxAPI.utils.showNotification({
                    title: "Error",
                    body: "Build failed",
                    type: "error"
                });
            }
        } catch (error) {
            await window.toolboxAPI.utils.hideLoading();
            const errorMsg = error instanceof Error ? error.message : String(error);
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    // Handler for testing project
    const handleTestProject = async () => {
        if (!window.toolboxAPI || !terminalId || !projectPath) {
            await window.toolboxAPI?.utils.showNotification({
                title: "Error",
                body: "Please enter a project path first",
                type: "error"
            });
            return;
        }
        
        setLoading(true);
        setCommandOutput("");
        
        try {
            const command = `cd "${projectPath}" && npm start`;
            const result = await window.toolboxAPI.terminal.execute(terminalId, command);
            
            setCommandOutput(result.output || '');
            await window.toolboxAPI.utils.showNotification({
                title: "Info",
                body: "Test harness launched. Check the terminal output.",
                type: "info"
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    // Handler for creating solution
    const handleCreateSolution = async () => {
        if (!window.toolboxAPI || !terminalId || !projectPath) {
            await window.toolboxAPI?.utils.showNotification({
                title: "Error",
                body: "Please enter a project path first",
                type: "error"
            });
            return;
        }
        
        setLoading(true);
        setCommandOutput("");
        
        try {
            await window.toolboxAPI.utils.showLoading("Creating solution...");
            const command = `cd "${projectPath}" && pac solution init --publisher-name ${solutionConfig.publisherName} --publisher-prefix ${solutionConfig.publisherPrefix}`;
            const result = await window.toolboxAPI.terminal.execute(terminalId, command);
            
            if (result.exitCode === 0) {
                setCommandOutput(result.output || '');
                
                // Add PCF reference to solution
                const addCommand = `cd "${projectPath}" && pac solution add-reference --path .`;
                const addResult = await window.toolboxAPI.terminal.execute(terminalId, addCommand);
                
                setCommandOutput(prev => prev + '\n\n' + (addResult.output || ''));
                
                await window.toolboxAPI.utils.hideLoading();
                await window.toolboxAPI.utils.showNotification({
                    title: "Success",
                    body: "Solution created successfully",
                    type: "success"
                });
            } else {
                await window.toolboxAPI.utils.hideLoading();
                setCommandOutput(result.error || result.output || 'Solution creation failed');
                await window.toolboxAPI.utils.showNotification({
                    title: "Error",
                    body: "Failed to create solution",
                    type: "error"
                });
            }
        } catch (error) {
            await window.toolboxAPI.utils.hideLoading();
            const errorMsg = error instanceof Error ? error.message : String(error);
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    // Handler for setting project path
    const handleSetProjectPath = (path: string) => {
        setProjectPath(path);
        if (path) {
            window.toolboxAPI?.utils.showNotification({
                title: "Info",
                body: `Project path set to: ${path}`,
                type: "info"
            });
        }
    };

    // Handler for selecting folder using selectPath API
    const handleSelectFolder = async () => {
        if (!window.toolboxAPI) return;
        
        try {
            const selectedPath = await window.toolboxAPI.utils.selectPath({
                type: 'folder',
                title: 'Select PCF Project Folder',
                message: 'Choose a folder for your PCF project',
                buttonLabel: 'Select Folder'
            });
            
            if (selectedPath) {
                setProjectPath(selectedPath);
                await window.toolboxAPI.utils.showNotification({
                    title: "Success",
                    body: `Project path set to: ${selectedPath}`,
                    type: "success"
                });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('Failed to select folder:', error);
            await window.toolboxAPI.utils.showNotification({
                title: "Error",
                body: `Failed to select folder: ${errorMsg}`,
                type: "error"
            });
        }
    };

    if (loading && !isPPTB) {
        return (
            <div className="container">
                <div className="content">
                    <div className="loading">Loading...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container">
                <div className="content">
                    <div className="error">{error}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="container">
            {/* Navigation Tabs */}
            <div className="tabs">
                <button 
                    className={`tab ${viewMode === 'home' ? 'active' : ''}`}
                    onClick={() => setViewMode('home')}
                >
                    Home
                </button>
                <button 
                    className={`tab ${viewMode === 'new-control' ? 'active' : ''}`}
                    onClick={() => setViewMode('new-control')}
                >
                    New Control
                </button>
                <button 
                    className={`tab ${viewMode === 'edit-control' ? 'active' : ''}`}
                    onClick={() => setViewMode('edit-control')}
                >
                    Edit Control
                </button>
                <button 
                    className={`tab ${viewMode === 'solution' ? 'active' : ''}`}
                    onClick={() => setViewMode('solution')}
                >
                    Solution
                </button>
            </div>

            <div className="content">

                {/* Home View */}
                {viewMode === 'home' && (
                    <div className="form-section">
                        <h2>PCF Builder</h2>
                        <p style={{ marginBottom: '16px', color: '#605e5c', fontSize: '0.875rem' }}>
                            Build and manage Power Apps Component Framework (PCF) custom controls.
                        </p>

                        <div className="form-group">
                            <label htmlFor="projectPath">Project Path</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    id="projectPath"
                                    value={projectPath}
                                    onChange={(e) => handleSetProjectPath(e.target.value)}
                                    placeholder="e.g., C:\Projects\MyPCFControl"
                                    style={{ flex: 1 }}
                                />
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={handleSelectFolder}
                                    style={{ minWidth: '80px' }}
                                >
                                    Browse...
                                </button>
                            </div>
                            <small style={{ color: '#605e5c', marginTop: '4px', display: 'block', fontSize: '0.75rem' }}>
                                Full path to create or manage your PCF project
                            </small>
                        </div>

                        <div className="button-group">
                            <button className="btn btn-primary" onClick={() => setViewMode('new-control')}>
                                Create New Control
                            </button>
                            <button className="btn btn-secondary" onClick={() => setViewMode('edit-control')}>
                                Edit Control
                            </button>
                            <button className="btn btn-secondary" onClick={() => setViewMode('solution')}>
                                Create Solution
                            </button>
                        </div>
                        
                        {projectPath && (
                            <div className="success-message">
                                <strong>Current Project Path:</strong> {projectPath}
                            </div>
                        )}
                    </div>
                )}

                {/* New Control View */}
                {viewMode === 'new-control' && (
                    <div className="form-section">
                        <h2>Create New PCF Control</h2>
                        
                        <div className="form-group">
                            <label htmlFor="newProjectPath">Project Path *</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    id="newProjectPath"
                                    value={projectPath}
                                    onChange={(e) => handleSetProjectPath(e.target.value)}
                                    placeholder="e.g., C:\Projects\MyPCFControl"
                                    style={{ flex: 1 }}
                                />
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={handleSelectFolder}
                                    style={{ minWidth: '80px' }}
                                >
                                    Browse...
                                </button>
                            </div>
                            <small style={{ color: '#605e5c', marginTop: '4px', display: 'block', fontSize: '0.75rem' }}>
                                Full path to create the PCF project
                            </small>
                        </div>
                        
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="namespace">Namespace *</label>
                                <input
                                    type="text"
                                    id="namespace"
                                    value={controlConfig.namespace}
                                    onChange={(e) => setControlConfig({ ...controlConfig, namespace: e.target.value })}
                                    placeholder="e.g., Contoso"
                                />
                            </div>
                            
                            <div className="form-group">
                                <label htmlFor="name">Control Name *</label>
                                <input
                                    type="text"
                                    id="name"
                                    value={controlConfig.name}
                                    onChange={(e) => setControlConfig({ ...controlConfig, name: e.target.value })}
                                    placeholder="e.g., MyCustomControl"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="displayName">Display Name</label>
                            <input
                                type="text"
                                id="displayName"
                                value={controlConfig.displayName}
                                onChange={(e) => setControlConfig({ ...controlConfig, displayName: e.target.value })}
                                placeholder="User-friendly name"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="description">Description</label>
                            <textarea
                                id="description"
                                value={controlConfig.description}
                                onChange={(e) => setControlConfig({ ...controlConfig, description: e.target.value })}
                                placeholder="Brief description of the control"
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="controlType">Control Type</label>
                                <select
                                    id="controlType"
                                    value={controlConfig.controlType}
                                    onChange={(e) => setControlConfig({ ...controlConfig, controlType: e.target.value as 'standard' | 'virtual' })}
                                >
                                    <option value="standard">Standard</option>
                                    <option value="virtual">Virtual</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label htmlFor="template">Template</label>
                                <select
                                    id="template"
                                    value={controlConfig.template}
                                    onChange={(e) => setControlConfig({ ...controlConfig, template: e.target.value as 'field' | 'dataset' })}
                                >
                                    <option value="field">Field (Single field control)</option>
                                    <option value="dataset">Dataset (Grid control)</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="additionalPackages">Additional Packages (comma-separated)</label>
                            <input
                                type="text"
                                id="additionalPackages"
                                placeholder="e.g., @fluentui/react, react, react-dom"
                                onChange={(e) => {
                                    const packages = e.target.value.split(',').map(p => p.trim()).filter(p => p);
                                    setControlConfig({ ...controlConfig, additionalPackages: packages });
                                }}
                            />
                        </div>

                        <div className="button-group">
                            <button 
                                className="btn btn-primary" 
                                onClick={handleCreateControl}
                                disabled={!controlConfig.namespace || !controlConfig.name || !projectPath || loading}
                            >
                                {loading ? 'Creating...' : 'Create Control'}
                            </button>
                        </div>

                        {commandOutput && (
                            <div className="output-section">
                                <h3>Command Output</h3>
                                <pre>{commandOutput}</pre>
                            </div>
                        )}
                    </div>
                )}

                {/* Edit Control View */}
                {viewMode === 'edit-control' && (
                    <div className="form-section">
                        <h2>Edit PCF Control</h2>
                        
                        <div className="form-group">
                            <label htmlFor="editProjectPath">Project Path *</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    id="editProjectPath"
                                    value={projectPath}
                                    onChange={(e) => handleSetProjectPath(e.target.value)}
                                    placeholder="e.g., C:\Projects\MyPCFControl"
                                    style={{ flex: 1 }}
                                />
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={handleSelectFolder}
                                    style={{ minWidth: '80px' }}
                                >
                                    Browse...
                                </button>
                            </div>
                            <small style={{ color: '#605e5c', marginTop: '4px', display: 'block', fontSize: '0.75rem' }}>
                                Full path to your existing PCF project
                            </small>
                        </div>
                        
                        {projectPath ? (
                            <>
                                <div className="info-box">
                                    <strong>Project Location:</strong> {projectPath}
                                </div>

                                <div className="button-group">
                                    <button className="btn btn-primary" onClick={handleBuildProject} disabled={loading}>
                                        {loading ? 'Building...' : 'Build Project'}
                                    </button>
                                    <button className="btn btn-success" onClick={handleTestProject} disabled={loading}>
                                        {loading ? 'Starting...' : 'Test Project'}
                                    </button>
                                </div>

                                {commandOutput && (
                                    <div className="output-section">
                                        <h3>Command Output</h3>
                                        <pre>{commandOutput}</pre>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="info-box">
                                <p>Please enter the path to your existing PCF control project folder.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Solution View */}
                {viewMode === 'solution' && (
                    <div className="form-section">
                        <h2>Create Solution Package</h2>
                        
                        <div className="form-group">
                            <label htmlFor="solutionProjectPath">Project Path *</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    id="solutionProjectPath"
                                    value={projectPath}
                                    onChange={(e) => handleSetProjectPath(e.target.value)}
                                    placeholder="e.g., C:\Projects\MyPCFControl"
                                    style={{ flex: 1 }}
                                />
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={handleSelectFolder}
                                    style={{ minWidth: '80px' }}
                                >
                                    Browse...
                                </button>
                            </div>
                            <small style={{ color: '#605e5c', marginTop: '4px', display: 'block', fontSize: '0.75rem' }}>
                                Full path to your PCF project
                            </small>
                        </div>
                        
                        {!projectPath ? (
                            <div className="info-box">
                                <p>Please enter the path to your PCF control project first.</p>
                            </div>
                        ) : (
                            <>
                                <div className="info-box">
                                    <strong>Project Location:</strong> {projectPath}
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="publisherName">Publisher Name *</label>
                                        <input
                                            type="text"
                                            id="publisherName"
                                            value={solutionConfig.publisherName}
                                            onChange={(e) => setSolutionConfig({ ...solutionConfig, publisherName: e.target.value })}
                                            placeholder="e.g., Contoso"
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label htmlFor="publisherPrefix">Publisher Prefix *</label>
                                        <input
                                            type="text"
                                            id="publisherPrefix"
                                            value={solutionConfig.publisherPrefix}
                                            onChange={(e) => setSolutionConfig({ ...solutionConfig, publisherPrefix: e.target.value })}
                                            placeholder="e.g., con"
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="publisherFriendlyName">Publisher Friendly Name</label>
                                    <input
                                        type="text"
                                        id="publisherFriendlyName"
                                        value={solutionConfig.publisherFriendlyName}
                                        onChange={(e) => setSolutionConfig({ ...solutionConfig, publisherFriendlyName: e.target.value })}
                                        placeholder="e.g., Contoso Corporation"
                                    />
                                </div>

                                <div className="button-group">
                                    <button 
                                        className="btn btn-primary" 
                                        onClick={handleCreateSolution}
                                        disabled={!solutionConfig.publisherName || !solutionConfig.publisherPrefix || loading}
                                    >
                                        {loading ? 'Creating...' : 'Create Solution'}
                                    </button>
                                </div>

                                {commandOutput && (
                                    <div className="output-section">
                                        <h3>Command Output</h3>
                                        <pre>{commandOutput}</pre>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
