import { useCallback, useEffect, useState } from "react";
import { FilterOption, PluginTraceLog, TraceLogFilter } from "./models/interfaces";
import { DataverseClient } from "./utils/DataverseClient";
import { CommandBar } from "./components/CommandBar";
import { FilterModal } from "./components/FilterModal";
import { LogList } from "./components/LogList";
import { LogDetail } from "./components/LogDetail";

function App() {
    const [isPPTB, setIsPPTB] = useState<boolean>(false);
    const [connectionUrl, setConnectionUrl] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");

    const [traceLogs, setTraceLogs] = useState<PluginTraceLog[]>([]);
    const [selectedLog, setSelectedLog] = useState<PluginTraceLog | null>(null);
    const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

    // Filter modal state
    const [showFilterModal, setShowFilterModal] = useState<boolean>(false);

    // Enhanced Filters
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
    const [selectedMessage, setSelectedMessage] = useState<string>("");
    const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
    const [selectedModes, setSelectedModes] = useState<number[]>([]);
    const [correlationFilter, setCorrelationFilter] = useState<string>("");
    const [exceptionOnly, setExceptionOnly] = useState<boolean>(false);

    // Temporary filter states (for modal before applying)
    const [tempDateFrom, setTempDateFrom] = useState<string>("");
    const [tempDateTo, setTempDateTo] = useState<string>("");
    const [tempSelectedPlugins, setTempSelectedPlugins] = useState<string[]>([]);
    const [tempSelectedMessage, setTempSelectedMessage] = useState<string>("");
    const [tempSelectedEntities, setTempSelectedEntities] = useState<string[]>([]);
    const [tempSelectedModes, setTempSelectedModes] = useState<number[]>([]);
    const [tempCorrelationFilter, setTempCorrelationFilter] = useState<string>("");
    const [tempExceptionOnly, setTempExceptionOnly] = useState<boolean>(false);

    // Filter options (populated from trace logs)
    const [pluginOptions, setPluginOptions] = useState<FilterOption[]>([]);
    const [messageOptions, setMessageOptions] = useState<FilterOption[]>([]);
    const [entityOptions, setEntityOptions] = useState<FilterOption[]>([]);

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
                hasException: exceptionOnly || undefined,
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

    const openFilterModal = () => {
        setTempDateFrom(dateFrom);
        setTempDateTo(dateTo);
        setTempSelectedPlugins([...selectedPlugins]);
        setTempSelectedMessage(selectedMessage);
        setTempSelectedEntities([...selectedEntities]);
        setTempSelectedModes([...selectedModes]);
        setTempCorrelationFilter(correlationFilter);
        setTempExceptionOnly(exceptionOnly);
        setShowFilterModal(true);
    };

    const closeFilterModal = () => {
        setShowFilterModal(false);
    };

    const applyFilters = () => {
        setDateFrom(tempDateFrom);
        setDateTo(tempDateTo);
        setSelectedPlugins([...tempSelectedPlugins]);
        setSelectedMessage(tempSelectedMessage);
        setSelectedEntities([...tempSelectedEntities]);
        setSelectedModes([...tempSelectedModes]);
        setCorrelationFilter(tempCorrelationFilter);
        setExceptionOnly(tempExceptionOnly);
        setShowFilterModal(false);
    };

    const clearFilters = () => {
        setTempDateFrom("");
        setTempDateTo("");
        setTempSelectedPlugins([]);
        setTempSelectedMessage("");
        setTempSelectedEntities([]);
        setTempSelectedModes([]);
        setTempCorrelationFilter("");
        setTempExceptionOnly(false);
    };

    const getActiveFilterCount = () => {
        let count = 0;
        if (dateFrom) count++;
        if (dateTo) count++;
        if (selectedPlugins.length > 0) count++;
        if (selectedMessage) count++;
        if (selectedEntities.length > 0) count++;
        if (selectedModes.length > 0) count++;
        if (correlationFilter) count++;
        if (exceptionOnly) count++;
        return count;
    };

    const toggleTempPlugin = (plugin: string) => {
        setTempSelectedPlugins(prev =>
            prev.includes(plugin) ? prev.filter(p => p !== plugin) : [...prev, plugin]
        );
    };

    const toggleTempEntity = (entity: string) => {
        setTempSelectedEntities(prev =>
            prev.includes(entity) ? prev.filter(e => e !== entity) : [...prev, entity]
        );
    };

    const toggleTempMode = (mode: number) => {
        setTempSelectedModes(prev =>
            prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
        );
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

            <CommandBar
                onRetrieve={handleRetrieve}
                onOpenFilters={openFilterModal}
                isLoading={loadingLogs}
                logCount={traceLogs.length}
                activeFilterCount={getActiveFilterCount()}
            />

            <FilterModal
                isOpen={showFilterModal}
                onClose={closeFilterModal}
                onApply={applyFilters}
                onClearAll={clearFilters}
                dateFrom={tempDateFrom}
                dateTo={tempDateTo}
                selectedPlugins={tempSelectedPlugins}
                selectedMessage={tempSelectedMessage}
                selectedEntities={tempSelectedEntities}
                selectedModes={tempSelectedModes}
                correlationFilter={tempCorrelationFilter}
                exceptionOnly={tempExceptionOnly}
                onDateFromChange={setTempDateFrom}
                onDateToChange={setTempDateTo}
                onTogglePlugin={toggleTempPlugin}
                onMessageChange={setTempSelectedMessage}
                onToggleEntity={toggleTempEntity}
                onToggleMode={toggleTempMode}
                onCorrelationChange={setTempCorrelationFilter}
                onExceptionOnlyChange={setTempExceptionOnly}
                pluginOptions={pluginOptions}
                messageOptions={messageOptions}
                entityOptions={entityOptions}
            />

            <div className="main-content">
                <LogList
                    logs={traceLogs}
                    selectedLogId={selectedLog?.plugintracelogid || null}
                    onSelectLog={handleLogSelect}
                    isLoading={loadingLogs}
                />

                {selectedLog && (
                    <LogDetail
                        log={selectedLog}
                        onDelete={handleDeleteLog}
                    />
                )}
            </div>
        </div>
    );
}

export default App;
