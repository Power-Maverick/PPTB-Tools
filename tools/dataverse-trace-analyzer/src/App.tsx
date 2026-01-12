import { useCallback, useEffect, useState } from "react";
import { FilterOption, PluginTraceLog, TraceLogFilter } from "./models/interfaces";
import { DataverseClient } from "./utils/DataverseClient";

function App() {
    const [isPPTB, setIsPPTB] = useState<boolean>(false);
    const [connectionUrl, setConnectionUrl] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");

    const [traceLogs, setTraceLogs] = useState<PluginTraceLog[]>([]);
    const [selectedLog, setSelectedLog] = useState<PluginTraceLog | null>(null);
    const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

    // Collapsible filter state
    const [filtersExpanded, setFiltersExpanded] = useState<boolean>(false);

    // Modal states
    const [showPluginModal, setShowPluginModal] = useState<boolean>(false);
    const [showEntityModal, setShowEntityModal] = useState<boolean>(false);

    // Enhanced Filters
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
    const [selectedMessage, setSelectedMessage] = useState<string>("");
    const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
    const [selectedModes, setSelectedModes] = useState<number[]>([]);
    const [correlationFilter, setCorrelationFilter] = useState<string>("");
    const [exceptionOnly, setExceptionOnly] = useState<boolean>(false);

    // Filter options (populated from trace logs)
    const [pluginOptions, setPluginOptions] = useState<FilterOption[]>([]);
    const [messageOptions, setMessageOptions] = useState<FilterOption[]>([]);
    const [entityOptions, setEntityOptions] = useState<FilterOption[]>([]);

    // Temporary selections for modals (before applying)
    const [tempSelectedPlugins, setTempSelectedPlugins] = useState<string[]>([]);
    const [tempSelectedEntities, setTempSelectedEntities] = useState<string[]>([]);

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
                }

                setLoading(false);
            } else {
                setError("Not running in Power Platform ToolBox (PPTB). This tool requires PPTB.");
                setLoading(false);
            }
        };

        initializeEnvironment();
    }, []);

    // Extract unique filter options from trace logs
    useEffect(() => {
        if (traceLogs.length > 0) {
            // Extract unique plugins
            const plugins = new Map<string, number>();
            const messages = new Map<string, number>();
            const entities = new Map<string, number>();

            traceLogs.forEach(log => {
                if (log.typename) {
                    plugins.set(log.typename, (plugins.get(log.typename) || 0) + 1);
                }
                if (log.messagename) {
                    messages.set(log.messagename, (messages.get(log.messagename) || 0) + 1);
                }
                if (log.primaryentity) {
                    entities.set(log.primaryentity, (entities.get(log.primaryentity) || 0) + 1);
                }
            });

            setPluginOptions(Array.from(plugins.entries()).map(([value, count]) => ({ value, label: value, count })).sort((a, b) => a.label.localeCompare(b.label)));
            setMessageOptions(Array.from(messages.entries()).map(([value, count]) => ({ value, label: value, count })).sort((a, b) => a.label.localeCompare(b.label)));
            setEntityOptions(Array.from(entities.entries()).map(([value, count]) => ({ value, label: value, count })).sort((a, b) => a.label.localeCompare(b.label)));
        }
    }, [traceLogs]);

    const loadTraceLogs = useCallback(async () => {
        try {
            setLoadingLogs(true);
            const client = new DataverseClient();

            const filter: TraceLogFilter = {
                startDate: dateFrom || undefined,
                endDate: dateTo || undefined,
                pluginNames: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                messageName: selectedMessage || undefined,
                entityNames: selectedEntities.length > 0 ? selectedEntities : undefined,
                modes: selectedModes.length > 0 ? selectedModes : undefined,
                correlationId: correlationFilter || undefined,
                hasException: exceptionOnly ? true : undefined,
            };

            const logs = await client.fetchPluginTraceLogs(filter);
            setTraceLogs(logs);
            setSelectedLog(null);
        } catch (error: any) {
            showError(`Failed to load trace logs: ${error.message}`);
        } finally {
            setLoadingLogs(false);
        }
    }, [dateFrom, dateTo, selectedPlugins, selectedMessage, selectedEntities, selectedModes, correlationFilter, exceptionOnly]);

    // Load trace logs when connection is available
    useEffect(() => {
        if (connectionUrl) {
            loadTraceLogs();
        }
    }, [connectionUrl, loadTraceLogs]);

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

    const handleRetrieve = () => {
        loadTraceLogs();
    };

    const handleLogSelect = async (log: PluginTraceLog) => {
        if (selectedLog?.plugintracelogid === log.plugintracelogid) {
            setSelectedLog(null);
            return;
        }

        try {
            const client = new DataverseClient();
            const detailedLog = await client.getTraceLogDetails(log.plugintracelogid);
            setSelectedLog(detailedLog);
        } catch (error: any) {
            showError(`Failed to load trace log details: ${error.message}`);
        }
    };

    const handleDeleteLog = async (logId: string) => {
        // TODO: Replace with custom confirmation dialog for better UX
        if (!confirm("Are you sure you want to delete this trace log?")) {
            return;
        }

        try {
            const client = new DataverseClient();
            await client.deleteTraceLog(logId);
            await showNotification("Success", "Trace log deleted successfully", "success");
            setTraceLogs(traceLogs.filter((log) => log.plugintracelogid !== logId));
            if (selectedLog?.plugintracelogid === logId) {
                setSelectedLog(null);
            }
        } catch (error: any) {
            showError(`Failed to delete trace log: ${error.message}`);
        }
    };

    const formatDateTime = (dateString: string) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const formatDuration = (duration: number) => {
        if (duration < 1000) return `${duration}ms`;
        return `${(duration / 1000).toFixed(2)}s`;
    };

    const getOperationTypeLabel = (type: number) => {
        const types: { [key: number]: string } = {
            1: "Plugin",
            2: "Workflow Activity",
        };
        return types[type] || `Type ${type}`;
    };

    const getModeLabel = (mode: number | undefined) => {
        if (mode === undefined || mode === null) return "N/A";
        return mode === 0 ? "Synchronous" : "Asynchronous";
    };

    const toggleMode = (mode: number) => {
        setSelectedModes(prev =>
            prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
        );
    };

    const clearFilters = () => {
        setDateFrom("");
        setDateTo("");
        setSelectedPlugins([]);
        setSelectedMessage("");
        setSelectedEntities([]);
        setSelectedModes([]);
        setCorrelationFilter("");
        setExceptionOnly(false);
    };

    // Plugin Modal Functions
    const openPluginModal = () => {
        setTempSelectedPlugins([...selectedPlugins]);
        setShowPluginModal(true);
    };

    const closePluginModal = () => {
        setShowPluginModal(false);
    };

    const applyPluginSelection = () => {
        setSelectedPlugins([...tempSelectedPlugins]);
        setShowPluginModal(false);
    };

    const toggleTempPlugin = (plugin: string) => {
        setTempSelectedPlugins(prev =>
            prev.includes(plugin) ? prev.filter(p => p !== plugin) : [...prev, plugin]
        );
    };

    const selectAllPlugins = () => {
        setTempSelectedPlugins(pluginOptions.map(opt => opt.value));
    };

    const clearAllPlugins = () => {
        setTempSelectedPlugins([]);
    };

    // Entity Modal Functions
    const openEntityModal = () => {
        setTempSelectedEntities([...selectedEntities]);
        setShowEntityModal(true);
    };

    const closeEntityModal = () => {
        setShowEntityModal(false);
    };

    const applyEntitySelection = () => {
        setSelectedEntities([...tempSelectedEntities]);
        setShowEntityModal(false);
    };

    const toggleTempEntity = (entity: string) => {
        setTempSelectedEntities(prev =>
            prev.includes(entity) ? prev.filter(e => e !== entity) : [...prev, entity]
        );
    };

    const selectAllEntities = () => {
        setTempSelectedEntities(entityOptions.map(opt => opt.value));
    };

    const clearAllEntities = () => {
        setTempSelectedEntities([]);
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
            {error && <div className="error-banner">{error}</div>}

            {/* Command Bar */}
            <div className="command-bar">
                <button className="btn btn-primary" onClick={handleRetrieve} disabled={loadingLogs}>
                    {loadingLogs ? "Loading..." : "📥 Retrieve"}
                </button>
                <button className="btn btn-secondary" onClick={() => setFiltersExpanded(!filtersExpanded)}>
                    {filtersExpanded ? "▲ Hide Filters" : "▼ Show Filters"}
                </button>
                <div className="command-spacer"></div>
                <span className="log-count">{traceLogs.length} logs</span>
            </div>

            {/* Collapsible Filter Panel */}
            {filtersExpanded && (
                <div className="filter-panel">
                    <div className="filter-panel-content">
                        {/* Date Filters */}
                        <div className="filter-section">
                            <div className="filter-group-horizontal">
                                <div className="filter-field">
                                    <label>Date From</label>
                                    <input
                                        type="datetime-local"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="filter-input-date"
                                    />
                                </div>
                                <div className="filter-field">
                                    <label>Date To</label>
                                    <input
                                        type="datetime-local"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="filter-input-date"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Plugin Multi-Select with Modal */}
                        <div className="filter-section">
                            <label>Plugin/Step (multi-select)</label>
                            <div className="filter-input-group">
                                <div className="selected-display">
                                    {selectedPlugins.length === 0 ? (
                                        <span className="placeholder">No plugins selected</span>
                                    ) : (
                                        <span>{selectedPlugins.length} plugin(s) selected</span>
                                    )}
                                </div>
                                <button className="btn btn-select" onClick={openPluginModal}>
                                    Select...
                                </button>
                            </div>
                        </div>

                        {/* Message Single-Select */}
                        <div className="filter-section">
                            <label>Message</label>
                            <select
                                className="filter-select"
                                value={selectedMessage}
                                onChange={(e) => setSelectedMessage(e.target.value)}
                            >
                                <option value="">All messages</option>
                                {messageOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label} ({opt.count})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Entity Multi-Select with Modal */}
                        <div className="filter-section">
                            <label>Entity (multi-select)</label>
                            <div className="filter-input-group">
                                <div className="selected-display">
                                    {selectedEntities.length === 0 ? (
                                        <span className="placeholder">No entities selected</span>
                                    ) : (
                                        <span>{selectedEntities.length} entit{selectedEntities.length === 1 ? 'y' : 'ies'} selected</span>
                                    )}
                                </div>
                                <button className="btn btn-select" onClick={openEntityModal}>
                                    Select...
                                </button>
                            </div>
                        </div>

                        {/* Mode Multi-Select */}
                        <div className="filter-section">
                            <label>Mode</label>
                            <div className="checkbox-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={selectedModes.includes(0)}
                                        onChange={() => toggleMode(0)}
                                    />
                                    <span>Synchronous</span>
                                </label>
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={selectedModes.includes(1)}
                                        onChange={() => toggleMode(1)}
                                    />
                                    <span>Asynchronous</span>
                                </label>
                            </div>
                        </div>

                        {/* Correlation ID and Exception Only */}
                        <div className="filter-section">
                            <div className="filter-group-horizontal">
                                <div className="filter-field">
                                    <label>Correlation ID</label>
                                    <input
                                        type="text"
                                        placeholder="Enter correlation ID..."
                                        value={correlationFilter}
                                        onChange={(e) => setCorrelationFilter(e.target.value)}
                                        className="filter-input"
                                    />
                                </div>
                                <div className="filter-field">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={exceptionOnly}
                                            onChange={(e) => setExceptionOnly(e.target.checked)}
                                        />
                                        <span>Exceptions Only</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Filter Actions */}
                        <div className="filter-actions">
                            <button className="btn btn-secondary" onClick={clearFilters}>Clear All Filters</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Plugin Selection Modal */}
            {showPluginModal && (
                <div className="modal-overlay" onClick={closePluginModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Select Plugins/Steps</h3>
                            <button className="modal-close" onClick={closePluginModal}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="modal-actions">
                                <button className="btn btn-link" onClick={selectAllPlugins}>Select All</button>
                                <button className="btn btn-link" onClick={clearAllPlugins}>Clear All</button>
                            </div>
                            <div className="modal-list">
                                {pluginOptions.map(opt => (
                                    <label key={opt.value} className="modal-item">
                                        <input
                                            type="checkbox"
                                            checked={tempSelectedPlugins.includes(opt.value)}
                                            onChange={() => toggleTempPlugin(opt.value)}
                                        />
                                        <span className="modal-item-label">
                                            {opt.label}
                                            <span className="modal-item-count">({opt.count})</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closePluginModal}>Cancel</button>
                            <button className="btn btn-primary" onClick={applyPluginSelection}>Apply</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Entity Selection Modal */}
            {showEntityModal && (
                <div className="modal-overlay" onClick={closeEntityModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Select Entities</h3>
                            <button className="modal-close" onClick={closeEntityModal}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="modal-actions">
                                <button className="btn btn-link" onClick={selectAllEntities}>Select All</button>
                                <button className="btn btn-link" onClick={clearAllEntities}>Clear All</button>
                            </div>
                            <div className="modal-list">
                                {entityOptions.map(opt => (
                                    <label key={opt.value} className="modal-item">
                                        <input
                                            type="checkbox"
                                            checked={tempSelectedEntities.includes(opt.value)}
                                            onChange={() => toggleTempEntity(opt.value)}
                                        />
                                        <span className="modal-item-label">
                                            {opt.label}
                                            <span className="modal-item-count">({opt.count})</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeEntityModal}>Cancel</button>
                            <button className="btn btn-primary" onClick={applyEntitySelection}>Apply</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="main-content">
                {/* Trace Logs List */}
                <div className="logs-panel">
                    <div className="logs-list">
                        {traceLogs.length === 0 && !loadingLogs && <div className="empty-state">No trace logs found</div>}
                        {traceLogs.map((log) => (
                            <div
                                key={log.plugintracelogid}
                                className={`log-item ${selectedLog?.plugintracelogid === log.plugintracelogid ? "selected" : ""} ${log.exceptiondetails ? "error" : ""}`}
                                onClick={() => handleLogSelect(log)}
                            >
                                <div className="log-header">
                                    <span className="log-type">{log.typename || "Unknown"}</span>
                                    {log.exceptiondetails && <span className="error-badge">ERROR</span>}
                                </div>
                                <div className="log-info">
                                    <span className="log-message">{log.messagename}</span>
                                    <span className="log-entity">{log.primaryentity || "-"}</span>
                                </div>
                                <div className="log-meta">
                                    <span>{formatDateTime(log.createdon)}</span>
                                    <span className="duration">{formatDuration(log.performanceexecutionduration)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Detail Panel */}
                {selectedLog && (
                    <div className="detail-panel">
                        <div className="detail-header">
                            <h3>Trace Details</h3>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteLog(selectedLog.plugintracelogid)}>
                                🗑️ Delete
                            </button>
                        </div>
                        <div className="detail-content">
                            <div className="detail-section">
                                <div className="detail-row">
                                    <label>Plugin/Step:</label>
                                    <span>{selectedLog.typename}</span>
                                </div>
                                <div className="detail-row">
                                    <label>Message:</label>
                                    <span>{selectedLog.messagename}</span>
                                </div>
                                <div className="detail-row">
                                    <label>Entity:</label>
                                    <span>{selectedLog.primaryentity || "N/A"}</span>
                                </div>
                                <div className="detail-row">
                                    <label>Operation:</label>
                                    <span>{getOperationTypeLabel(selectedLog.operationtype)}</span>
                                </div>
                                <div className="detail-row">
                                    <label>Mode:</label>
                                    <span>{getModeLabel(selectedLog.mode)}</span>
                                </div>
                                <div className="detail-row">
                                    <label>Depth:</label>
                                    <span>{selectedLog.depth}</span>
                                </div>
                                <div className="detail-row">
                                    <label>Duration:</label>
                                    <span>{formatDuration(selectedLog.performanceexecutionduration)}</span>
                                </div>
                                <div className="detail-row">
                                    <label>Created:</label>
                                    <span>{formatDateTime(selectedLog.createdon)}</span>
                                </div>
                                <div className="detail-row">
                                    <label>Correlation ID:</label>
                                    <span className="correlation-id">{selectedLog.correlationid}</span>
                                </div>
                            </div>

                            {selectedLog.messageblock && (
                                <div className="detail-section">
                                    <label className="section-label">Message Block:</label>
                                    <pre className="code-block">{selectedLog.messageblock}</pre>
                                </div>
                            )}

                            {selectedLog.exceptiondetails && (
                                <div className="detail-section error-section">
                                    <label className="section-label">Exception Details:</label>
                                    <pre className="code-block error-block">{selectedLog.exceptiondetails}</pre>
                                </div>
                            )}

                            {selectedLog.profile && (
                                <div className="detail-section">
                                    <label className="section-label">Profile:</label>
                                    <pre className="code-block">{selectedLog.profile}</pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
