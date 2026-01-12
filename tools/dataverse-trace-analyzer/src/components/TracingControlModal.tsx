import React, { useEffect, useState } from "react";

interface TracingControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (enabled: boolean, mode: "Exception" | "All") => void;
}

export const TracingControlModal: React.FC<TracingControlModalProps> = ({ isOpen, onClose, onSave }) => {
    const [tracingEnabled, setTracingEnabled] = useState(false);
    const [tracingMode, setTracingMode] = useState<"Exception" | "All">("Exception");
    const [currentStatus, setCurrentStatus] = useState<{
        enabled: boolean;
        mode: string;
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadCurrentStatus();
        }
    }, [isOpen]);

    const loadCurrentStatus = async () => {
        setLoading(true);
        setError(null);
        try {
            // Query the plugintracelogsetting table to get current tracing configuration
            const fetchXml = '<fetch top="1"><entity name="organization"><attribute name="plugintracelogsetting"/></entity></fetch>';
            const result = await window.dataverseAPI.fetchXmlQuery(fetchXml);
            debugger;
            console.log(result);

            if (result.value && result.value.length > 0) {
                const setting = result.value[0];
                const enabled = setting.plugintracelogsetting === 0 ? false : true; // 0 = off, 1 = exception only, 2 = all
                const mode = setting.plugintracelogsetting === 2 ? "All" : "Exception";

                setCurrentStatus({ enabled, mode });
                setTracingEnabled(enabled);
                setTracingMode(mode);
            } else {
                // No settings found, assume disabled
                setCurrentStatus({ enabled: false, mode: "Exception" });
                setTracingEnabled(false);
                setTracingMode("Exception");
            }
        } catch (err: any) {
            console.error("Error loading tracing status:", err);
            setError("Failed to load current tracing status. Using default values.");
            setCurrentStatus({ enabled: false, mode: "Exception" });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        setError(null);
        try {
            // Update or create plugintracelogsetting record
            // tracelogstatus: 0 = Off, 1 = Exception, 2 = All
            const tracelogstatus = tracingMode === "Exception" ? 1 : tracingMode === "All" ? 2 : 0;

            const fetchXml = '<fetch top="1"><entity name="organization"><attribute name="plugintracelogsetting"/></entity></fetch>';
            const result = await window.dataverseAPI.fetchXmlQuery(fetchXml);

            if (result.value && result.value.length > 0) {
                // Update existing record
                const settingId = result.value[0].organizationid as string;
                await window.dataverseAPI.update("organization", settingId, {
                    plugintracelogsetting: tracelogstatus,
                });
            }

            onSave(tracingEnabled, tracingMode);

            // Show success notification
            window.toolboxAPI.utils.showNotification({
                title: "Tracing Settings Updated",
                type: "success",
                body: `Tracing ${tracingEnabled ? "enabled" : "disabled"} successfully${tracingEnabled ? ` (Mode: ${tracingMode})` : ""}`,
            });

            onClose();
        } catch (err: any) {
            console.error("Error saving tracing settings:", err);
            setError(`Failed to save tracing settings: ${err.message || "Unknown error"}`);
            window.toolboxAPI.utils.showNotification({
                title: "Error Updating Tracing Settings",
                type: "error",
                body: "Failed to update tracing settings",
            });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content tracing-control-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Tracing Control</h2>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>

                <div className="modal-body">
                    {loading && !currentStatus ? (
                        <div className="loading-state">Loading current settings...</div>
                    ) : (
                        <>
                            {currentStatus && (
                                <div className="current-status">
                                    <strong>Current Status:</strong>
                                    {currentStatus.enabled ? <span className="status-enabled"> Enabled ({currentStatus.mode})</span> : <span className="status-disabled"> Disabled</span>}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={tracingEnabled} onChange={(e) => setTracingEnabled(e.target.checked)} disabled={loading} />
                                    <span>Enable Plugin Trace Logging</span>
                                </label>
                                <p className="field-description">When enabled, Dataverse will record plugin execution traces</p>
                            </div>

                            {tracingEnabled && (
                                <div className="form-group">
                                    <label className="form-label">Tracing Mode:</label>
                                    <div className="radio-group">
                                        <label className="radio-option">
                                            <input
                                                type="radio"
                                                name="tracingMode"
                                                value="Exception"
                                                checked={tracingMode === "Exception"}
                                                onChange={(e) => setTracingMode("Exception")}
                                                disabled={loading}
                                            />
                                            <span>Exception Only</span>
                                            <small>Only log when plugin throws an exception</small>
                                        </label>
                                        <label className="radio-option">
                                            <input type="radio" name="tracingMode" value="All" checked={tracingMode === "All"} onChange={(e) => setTracingMode("All")} disabled={loading} />
                                            <span>All</span>
                                            <small>Log all plugin executions (generates more data)</small>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {error && <div className="error-message">{error}</div>}
                        </>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                        {loading ? "Saving..." : "Apply Changes"}
                    </button>
                </div>
            </div>
        </div>
    );
};
