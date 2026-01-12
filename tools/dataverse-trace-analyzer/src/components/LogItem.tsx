import { PluginTraceLog } from "../models/interfaces";
import { formatDateTime, formatDuration, getOperationTypeLabel } from "../utils/DataParser";
import { parsePluginTypeName } from "../utils/PluginParser";

interface LogItemProps {
    log: PluginTraceLog;
    isSelected: boolean;
    onSelect: (log: PluginTraceLog) => void;
}

export function LogItem({ log, isSelected, onSelect }: LogItemProps) {
    const pluginInfo = parsePluginTypeName(log.typename);

    return (
        <div className={`log-item ${isSelected ? "selected" : ""} ${log.exceptiondetails ? "error" : ""}`} onClick={() => onSelect(log)}>
            <div className="log-header">
                <span className="log-step" title={pluginInfo.step}>
                    {pluginInfo.step}
                </span>
                {log.exceptiondetails && <span className="error-badge">ERROR</span>}
            </div>
            <div className="log-info">
                <span className="log-assembly" title={`${pluginInfo.assembly} (v${pluginInfo.version}) | ${getOperationTypeLabel(log.operationtype)}`}>
                    {pluginInfo.assembly} (v{pluginInfo.version}) | {getOperationTypeLabel(log.operationtype)}
                </span>
            </div>
            <div className="log-info">
                <span className="log-message">Message: {log.messagename}</span>
                <span> | </span>
                <span className="log-entity">Entity: {log.primaryentity || "-"}</span>
            </div>
            <div className="log-info">
                <span className="duration">{formatDuration(log.performanceexecutionduration)}</span>
            </div>
            <div className="log-meta">
                <span>{formatDateTime(log.createdon)}</span>
            </div>
        </div>
    );
}
