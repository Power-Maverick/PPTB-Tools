import { PluginTraceLog } from "../models/interfaces";
import { LogItem } from "./LogItem";

interface LogListProps {
    logs: PluginTraceLog[];
    selectedLogId: string | null;
    highlightedLogIds: Set<string>;
    onSelectLog: (log: PluginTraceLog) => void;
    isLoading: boolean;
}

export function LogList({ logs, selectedLogId, highlightedLogIds, onSelectLog, isLoading }: LogListProps) {
    return (
        <div className="logs-panel">
            <div className="logs-list">
                {logs.length === 0 && !isLoading && (
                    <div className="empty-state">No trace logs found</div>
                )}
                {logs.map((log) => (
                    <LogItem
                        key={log.plugintracelogid}
                        log={log}
                        isSelected={selectedLogId === log.plugintracelogid}
                        isHighlighted={highlightedLogIds.has(log.plugintracelogid)}
                        onSelect={onSelectLog}
                    />
                ))}
            </div>
        </div>
    );
}
