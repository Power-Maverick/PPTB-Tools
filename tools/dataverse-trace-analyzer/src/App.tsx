import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AutoRefreshModal } from "./components/AutoRefreshModal";
import { CommandBar } from "./components/CommandBar";
import { FilterPanel } from "./components/FilterPanel";
import { LoadFilterModal } from "./components/LoadFilterModal";
import { LogDetail } from "./components/LogDetail";
import { LogList } from "./components/LogList";
import { SaveFilterModal } from "./components/SaveFilterModal";
import { TracingControlModal } from "./components/TracingControlModal";
import { FilterOption, PluginTraceLog, SavedFilter, TraceLogFilter } from "./models/interfaces";
import { DataverseClient } from "./utils/DataverseClient";
import { FilterStorage } from "./utils/filterStorage";

function App() {
    const [isPPTB, setIsPPTB] = useState<boolean>(false);
    const [connectionUrl, setConnectionUrl] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");

    const [traceLogs, setTraceLogs] = useState<PluginTraceLog[]>([]);
    const [selectedLog, setSelectedLog] = useState<PluginTraceLog | null>(null);
    const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

    // Filter panel state
    const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);
    const [logSearch, setLogSearch] = useState<string>("");
    const [showSaveFilterModal, setShowSaveFilterModal] = useState<boolean>(false);
    const [showLoadFilterModal, setShowLoadFilterModal] = useState<boolean>(false);
    const [showAutoRefreshModal, setShowAutoRefreshModal] = useState<boolean>(false);
    const [showTracingControlModal, setShowTracingControlModal] = useState<boolean>(false);

    // Saved filters
    const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

    // Auto-refresh state
    const [autoRefreshMode, setAutoRefreshMode] = useState<"off" | "auto" | "notify">("off");
    const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30);
    const [newLogsCount, setNewLogsCount] = useState<number>(0);
    const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Highlighting similar records
    const [highlightedLogIds, setHighlightedLogIds] = useState<Set<string>>(new Set());

    // Resizable panel state
    const [logsPanelWidth, setLogsPanelWidth] = useState<number>(400);
    const [isResizing, setIsResizing] = useState<boolean>(false);

    // Resizing logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizing) {
                const newWidth = Math.min(Math.max(e.clientX, 300), 800);
                setLogsPanelWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            if (isResizing) {
                setIsResizing(false);
            }
        };

        if (isResizing) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isResizing]);

    // Enhanced Filters
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
    const [selectedMessage, setSelectedMessage] = useState<string>("");
    const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
    const [selectedModes, setSelectedModes] = useState<number[]>([]);
    const [correlationFilter, setCorrelationFilter] = useState<string>("");
    const [exceptionOnly, setExceptionOnly] = useState<boolean>(false);

    // Temporary filter states (before applying)
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

            traceLogs.forEach((log) => {
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

            setPluginOptions(
                Array.from(plugins.entries())
                    .map(([value, count]) => ({ value, label: value, count }))
                    .sort((a, b) => a.label.localeCompare(b.label)),
            );
            setMessageOptions(
                Array.from(messages.entries())
                    .map(([value, count]) => ({ value, label: value, count }))
                    .sort((a, b) => a.label.localeCompare(b.label)),
            );
            setEntityOptions(
                Array.from(entities.entries())
                    .map(([value, count]) => ({ value, label: value, count }))
                    .sort((a, b) => a.label.localeCompare(b.label)),
            );
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
            setHighlightedLogIds(new Set());
            return;
        }

        // Immediately reflect the selection so the clicked item is highlighted
        // right away rather than waiting for the async API call to complete.
        setSelectedLog(log);

        // Highlight similar records (same correlation ID) immediately as well.
        const similarLogIds = new Set<string>();
        if (log.correlationid) {
            traceLogs.forEach((tl) => {
                if (tl.correlationid === log.correlationid && tl.plugintracelogid !== log.plugintracelogid) {
                    similarLogIds.add(tl.plugintracelogid);
                }
            });
        }
        setHighlightedLogIds(similarLogIds);

        try {
            const client = new DataverseClient();
            const detailedLog = await client.getTraceLogDetails(log.plugintracelogid);
            // Only apply the detailed data if the user hasn't clicked a different
            // item while the request was in flight.
            setSelectedLog((prev) => (prev?.plugintracelogid === log.plugintracelogid ? detailedLog : prev));
        } catch (error: any) {
            showError(`Failed to load trace log details: ${error.message}`);
        }
    };

    // Auto-refresh functionality
    const loadTraceLogsForAutoRefresh = useCallback(async () => {
        try {
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

            // Compare with existing logs to find new ones
            const existingIds = new Set(traceLogs.map((log) => log.plugintracelogid));
            const newLogs = logs.filter((log) => !existingIds.has(log.plugintracelogid));

            if (newLogs.length > 0) {
                setTraceLogs(logs);
                setNewLogsCount(newLogs.length);

                if (autoRefreshMode === "notify") {
                    await showNotification("New Trace Logs", `${newLogs.length} new trace log(s) found`, "info");
                }

                // Clear new logs count after 5 seconds
                setTimeout(() => setNewLogsCount(0), 5000);
            }
        } catch (error: any) {
            console.error("Auto-refresh failed:", error);
        }
    }, [dateFrom, dateTo, selectedPlugins, selectedMessage, selectedEntities, selectedModes, correlationFilter, exceptionOnly, traceLogs, autoRefreshMode]);

    // Setup auto-refresh timer
    useEffect(() => {
        if (autoRefreshTimerRef.current) {
            clearInterval(autoRefreshTimerRef.current);
            autoRefreshTimerRef.current = null;
        }

        if (autoRefreshMode !== "off" && connectionUrl) {
            autoRefreshTimerRef.current = setInterval(() => {
                loadTraceLogsForAutoRefresh();
            }, autoRefreshInterval * 1000);
        }

        return () => {
            if (autoRefreshTimerRef.current) {
                clearInterval(autoRefreshTimerRef.current);
            }
        };
    }, [autoRefreshMode, autoRefreshInterval, connectionUrl, loadTraceLogsForAutoRefresh]);

    const handleAutoRefreshSave = (mode: "off" | "auto" | "notify", intervalSeconds: number) => {
        setAutoRefreshMode(mode);
        setAutoRefreshInterval(intervalSeconds);
        setNewLogsCount(0);
    };

    const handleTracingSave = (enabled: boolean, mode: "Exception" | "All") => {
        // The TracingControlModal handles the actual API calls
        // This callback is just for confirmation
        console.log(`Tracing ${enabled ? "enabled" : "disabled"} with mode: ${mode}`);
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

    const toggleFilterPanel = () => {
        if (showFilterPanel) {
            setShowFilterPanel(false);
            return;
        }

        setTempDateFrom(dateFrom);
        setTempDateTo(dateTo);
        setTempSelectedPlugins([...selectedPlugins]);
        setTempSelectedMessage(selectedMessage);
        setTempSelectedEntities([...selectedEntities]);
        setTempSelectedModes([...selectedModes]);
        setTempCorrelationFilter(correlationFilter);
        setTempExceptionOnly(exceptionOnly);
        setShowFilterPanel(true);
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
        setShowFilterPanel(false);
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
        setTempSelectedPlugins((prev) => (prev.includes(plugin) ? prev.filter((p) => p !== plugin) : [...prev, plugin]));
    };

    const toggleTempEntity = (entity: string) => {
        setTempSelectedEntities((prev) => (prev.includes(entity) ? prev.filter((e) => e !== entity) : [...prev, entity]));
    };

    const toggleTempMode = (mode: number) => {
        setTempSelectedModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
    };

    // Load saved filters on initialization
    useEffect(() => {
        const loadSavedFilters = async () => {
            const filters = await FilterStorage.loadFilters();
            setSavedFilters(filters);
        };
        if (isPPTB) {
            loadSavedFilters();
        }
    }, [isPPTB]);

    const handleSaveFilter = async (name: string) => {
        try {
            const currentFilter: TraceLogFilter = {
                startDate: dateFrom || undefined,
                endDate: dateTo || undefined,
                pluginNames: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                messageName: selectedMessage || undefined,
                entityNames: selectedEntities.length > 0 ? selectedEntities : undefined,
                modes: selectedModes.length > 0 ? selectedModes : undefined,
                correlationId: correlationFilter || undefined,
                hasException: exceptionOnly || undefined,
            };

            await FilterStorage.saveFilter(name, currentFilter);
            await showNotification("Success", `Filter "${name}" saved successfully`, "success");

            // Reload saved filters
            const filters = await FilterStorage.loadFilters();
            setSavedFilters(filters);
        } catch (error: any) {
            showError(`Failed to save filter: ${error.message}`);
        }
    };

    const handleLoadFilter = (filter: SavedFilter) => {
        // Apply the loaded filter
        setDateFrom(filter.filter.startDate || "");
        setDateTo(filter.filter.endDate || "");
        setSelectedPlugins(filter.filter.pluginNames || []);
        setSelectedMessage(filter.filter.messageName || "");
        setSelectedEntities(filter.filter.entityNames || []);
        setSelectedModes(filter.filter.modes || []);
        setCorrelationFilter(filter.filter.correlationId || "");
        setExceptionOnly(filter.filter.hasException || false);

        showNotification("Success", `Filter "${filter.name}" loaded successfully`, "info");
    };

    const handleDeleteFilter = async (name: string) => {
        try {
            await FilterStorage.deleteFilter(name);
            await showNotification("Success", `Filter "${name}" deleted successfully`, "success");

            // Reload saved filters
            const filters = await FilterStorage.loadFilters();
            setSavedFilters(filters);
        } catch (error: any) {
            showError(`Failed to delete filter: ${error.message}`);
        }
    };

    const hasActiveFilters = () => {
        return getActiveFilterCount() > 0;
    };

    const appliedFilters = [
        { key: "from", active: !!dateFrom, label: `From: ${dateFrom ? new Date(dateFrom).toLocaleString() : ""}`, remove: () => setDateFrom("") },
        { key: "to", active: !!dateTo, label: `To: ${dateTo ? new Date(dateTo).toLocaleString() : ""}`, remove: () => setDateTo("") },
        { key: "plugins", active: selectedPlugins.length > 0, label: `Plugins: ${selectedPlugins.length}`, detail: selectedPlugins.join(", "), remove: () => setSelectedPlugins([]) },
        { key: "message", active: !!selectedMessage, label: `Message: ${selectedMessage}`, remove: () => setSelectedMessage("") },
        { key: "entities", active: selectedEntities.length > 0, label: `Entities: ${selectedEntities.length}`, detail: selectedEntities.join(", "), remove: () => setSelectedEntities([]) },
        { key: "mode", active: selectedModes.length > 0, label: `Mode: ${selectedModes.map((mode) => (mode === 0 ? "Sync" : "Async")).join(", ")}`, remove: () => setSelectedModes([]) },
        { key: "correlation", active: !!correlationFilter, label: `Correlation: ${correlationFilter}`, remove: () => setCorrelationFilter("") },
        { key: "exceptions", active: exceptionOnly, label: "Exceptions only", remove: () => setExceptionOnly(false) },
    ].filter((filter) => filter.active);

    const clearAppliedFilters = () => {
        appliedFilters.forEach((filter) => filter.remove());
    };

    const normalizedLogSearch = logSearch.trim().toLowerCase();
    const visibleTraceLogs = normalizedLogSearch
        ? traceLogs.filter((log) =>
              [log.typename, log.messagename, log.messageblock, log.exceptiondetails, log.correlationid, log.primaryentity, log.profile].some((value) =>
                  value?.toLowerCase().includes(normalizedLogSearch),
              ),
          )
        : traceLogs;

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
                onToggleFilters={toggleFilterPanel}
                onSaveFilter={() => setShowSaveFilterModal(true)}
                onLoadFilter={() => setShowLoadFilterModal(true)}
                onOpenAutoRefresh={() => setShowAutoRefreshModal(true)}
                onOpenTracingControl={() => setShowTracingControlModal(true)}
                isLoading={loadingLogs}
                logCount={traceLogs.length}
                activeFilterCount={getActiveFilterCount()}
                filtersExpanded={showFilterPanel}
                hasFiltersToSave={hasActiveFilters()}
                autoRefreshMode={autoRefreshMode}
                newLogsCount={newLogsCount}
            />

            {appliedFilters.length > 0 && (
                <div className="applied-filters" role="group" aria-label="Applied filters">
                    {appliedFilters.map((filter) => (
                        <span className="filter-chip" key={filter.key}>
                            <span className="filter-chip-label" title={filter.detail || filter.label}>
                                {filter.label}
                            </span>
                            <button onClick={filter.remove} aria-label={`Remove ${filter.label} filter`} title={`Remove ${filter.label} filter`}>
                                <X size={14} aria-hidden="true" />
                            </button>
                        </span>
                    ))}
                    <button className="filter-clear-all" onClick={clearAppliedFilters}>
                        Clear all
                    </button>
                </div>
            )}

            <FilterPanel
                isOpen={showFilterPanel}
                onClose={() => setShowFilterPanel(false)}
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

            <SaveFilterModal isOpen={showSaveFilterModal} onClose={() => setShowSaveFilterModal(false)} onSave={handleSaveFilter} existingNames={savedFilters.map((f) => f.name)} />

            <LoadFilterModal isOpen={showLoadFilterModal} onClose={() => setShowLoadFilterModal(false)} onLoad={handleLoadFilter} onDelete={handleDeleteFilter} savedFilters={savedFilters} />

            <AutoRefreshModal
                isOpen={showAutoRefreshModal}
                onClose={() => setShowAutoRefreshModal(false)}
                currentMode={autoRefreshMode}
                currentInterval={autoRefreshInterval}
                onSave={handleAutoRefreshSave}
            />

            <TracingControlModal isOpen={showTracingControlModal} onClose={() => setShowTracingControlModal(false)} onSave={handleTracingSave} />

            <div className="main-content">
                <div className="logs-panel" style={{ width: `${logsPanelWidth}px` }}>
                    <div className="log-search">
                        <input type="text" value={logSearch} onChange={(event) => setLogSearch(event.target.value)} placeholder="Filter logs by text..." aria-label="Filter logs by text" />
                        {logSearch && (
                            <button className="log-search-clear" onClick={() => setLogSearch("")} aria-label="Clear text filter" title="Clear text filter">
                                ×
                            </button>
                        )}
                        <span className="log-search-count">
                            {visibleTraceLogs.length} of {traceLogs.length}
                        </span>
                    </div>
                    <LogList
                        logs={visibleTraceLogs}
                        selectedLogId={selectedLog?.plugintracelogid || null}
                        highlightedLogIds={highlightedLogIds}
                        onSelectLog={handleLogSelect}
                        isLoading={loadingLogs}
                    />
                </div>

                <div className="resize-handle" onMouseDown={() => setIsResizing(true)} />

                {selectedLog && (
                    <div className="detail-panel">
                        <LogDetail log={selectedLog} onDelete={handleDeleteLog} />
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
