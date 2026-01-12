import { PluginTraceLog } from "../models/interfaces";

interface LogItemProps {
    log: PluginTraceLog;
    isSelected: boolean;
    onSelect: (log: PluginTraceLog) => void;
}

export function LogItem({ log, isSelected, onSelect }: LogItemProps) {
    const formatDateTime = (dateString: string) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const formatDuration = (duration: number) => {
        if (duration < 1000) return `${duration}ms`;
        return `${(duration / 1000).toFixed(2)}s`;
    };

    return (
        <div
            className={`log-item ${isSelected ? "selected" : ""} ${log.exceptiondetails ? "error" : ""}`}
            onClick={() => onSelect(log)}
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
    );
}
