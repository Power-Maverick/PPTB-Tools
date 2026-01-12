import { useCallback, useEffect, useState } from "react";
import { PluginTraceLog, TraceLogFilter } from "./models/interfaces";
import { DataverseClient } from "./utils/DataverseClient";

function App() {
    const [isPPTB, setIsPPTB] = useState<boolean>(false);
    const [connectionUrl, setConnectionUrl] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");

    const [traceLogs, setTraceLogs] = useState<PluginTraceLog[]>([]);
    const [selectedLog, setSelectedLog] = useState<PluginTraceLog | null>(null);
    const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

    // Filters
    const [messageFilter, setMessageFilter] = useState<string>("");
    const [entityFilter, setEntityFilter] = useState<string>("");
    const [correlationFilter, setCorrelationFilter] = useState<string>("");
    const [exceptionOnly, setExceptionOnly] = useState<boolean>(false);

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

    const loadTraceLogs = useCallback(async () => {
        try {
            setLoadingLogs(true);
            const client = new DataverseClient();

            const filter: TraceLogFilter = {
                messageName: messageFilter || undefined,
                entityName: entityFilter || undefined,
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
    }, [messageFilter, entityFilter, correlationFilter, exceptionOnly]);

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

    const handleRefresh = () => {
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
            1: "Create",
            2: "Update",
            3: "Delete",
            4: "Retrieve",
            5: "RetrieveMultiple",
            6: "Associate",
            7: "Disassociate",
        };
        return types[type] || `Operation ${type}`;
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

            {/* Compact Filter Bar */}
            <div className="filter-bar">
                <div className="filter-group">
                    <input
                        type="text"
                        placeholder="Message Name..."
                        value={messageFilter}
                        onChange={(e) => setMessageFilter(e.target.value)}
                        className="filter-input"
                    />
                    <input
                        type="text"
                        placeholder="Entity..."
                        value={entityFilter}
                        onChange={(e) => setEntityFilter(e.target.value)}
                        className="filter-input"
                    />
                    <input
                        type="text"
                        placeholder="Correlation ID..."
                        value={correlationFilter}
                        onChange={(e) => setCorrelationFilter(e.target.value)}
                        className="filter-input"
                    />
                    <label className="checkbox-label">
                        <input type="checkbox" checked={exceptionOnly} onChange={(e) => setExceptionOnly(e.target.checked)} />
                        <span>Exceptions Only</span>
                    </label>
                </div>
                <button className="btn btn-primary" onClick={handleRefresh} disabled={loadingLogs}>
                    {loadingLogs ? "Loading..." : "🔄 Refresh"}
                </button>
            </div>

            {/* Main Content Area */}
            <div className="main-content">
                {/* Trace Logs List */}
                <div className="logs-panel">
                    <div className="panel-header">
                        <span className="count">{traceLogs.length} logs</span>
                    </div>
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
                                    <label>Operation Type:</label>
                                    <span>{getOperationTypeLabel(selectedLog.operationtype)}</span>
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
