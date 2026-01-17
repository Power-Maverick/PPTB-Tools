import { PluginTraceLog } from "../models/interfaces";
import { formatDateTime, formatDuration, getModeLabel, getOperationTypeLabel } from "../utils/DataParser";
import { parsePluginTypeName } from "../utils/PluginParser";

interface LogDetailProps {
    log: PluginTraceLog;
    onDelete: (logId: string) => void;
}

export function LogDetail({ log, onDelete }: LogDetailProps) {
    const pluginInfo = parsePluginTypeName(log.typename);

    return (
        <>
            <div className="detail-header">
                <h3>Trace Details</h3>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(log.plugintracelogid)}>
                    🗑️ Delete
                </button>
            </div>
            <div className="detail-content">
                <div className="detail-section">
                    <div className="detail-row">
                        <label>Step:</label>
                        <span>{pluginInfo.step}</span>
                    </div>
                    <div className="detail-row">
                        <label>Assembly:</label>
                        <span>{pluginInfo.assembly}</span>
                    </div>
                    <div className="detail-row">
                        <label>Version:</label>
                        <span>{pluginInfo.version}</span>
                    </div>
                    <div className="detail-row">
                        <label>Message:</label>
                        <span>{log.messagename}</span>
                    </div>
                    <div className="detail-row">
                        <label>Entity:</label>
                        <span>{log.primaryentity || "N/A"}</span>
                    </div>
                    <div className="detail-row">
                        <label>Operation:</label>
                        <span>{getOperationTypeLabel(log.operationtype)}</span>
                    </div>
                    <div className="detail-row">
                        <label>Mode:</label>
                        <span>{getModeLabel(log.mode)}</span>
                    </div>
                    <div className="detail-row">
                        <label>Depth:</label>
                        <span>{log.depth}</span>
                    </div>
                    <div className="detail-row">
                        <label>Duration:</label>
                        <span>{formatDuration(log.performanceexecutionduration)}</span>
                    </div>
                    <div className="detail-row">
                        <label>Created:</label>
                        <span>{formatDateTime(log.createdon)}</span>
                    </div>
                    <div className="detail-row">
                        <label>Correlation ID:</label>
                        <span className="correlation-id">{log.correlationid}</span>
                    </div>
                </div>

                {log.messageblock && (
                    <div className="detail-section">
                        <label className="section-label">Message Block:</label>
                        <pre className="code-block">{log.messageblock}</pre>
                    </div>
                )}

                {log.exceptiondetails && (
                    <div className="detail-section error-section">
                        <label className="section-label">Exception Details:</label>
                        <pre className="code-block error-block">{log.exceptiondetails}</pre>
                    </div>
                )}

                {log.profile && (
                    <div className="detail-section">
                        <label className="section-label">Profile:</label>
                        <pre className="code-block">{log.profile}</pre>
                    </div>
                )}
            </div>
        </>
    );
}
