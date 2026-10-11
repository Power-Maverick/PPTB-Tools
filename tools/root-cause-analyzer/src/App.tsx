import { Badge, Button, CounterBadge, MessageBar, MessageBarBody, Spinner, Tab, TabList, Text, Tooltip } from "@fluentui/react-components";
import { Dismiss16Regular } from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadColumns, loadTables, type ColumnInfo, type TableInfo } from "./data/catalog";
import { evaluatePreflight, gatherPreflightFacts, type ConnectionFacts } from "./data/preflight";
import { evaluateTargetAudit, gatherTargetAudit } from "./data/targetAudit";
import { runAnalysis, type AnalysisResult } from "./engine/analyze";
import { errorMessage } from "./host/errors";
import { getDataverse } from "./host/readOnlyDataverse";
import { getPowerAutomate } from "./host/readOnlyPowerPlatform";
import { buildSummary } from "./engine/summary";
import { copyText, getConnectionFacts, getPrefill, hasToolbox, loadToolSettings, onConnectionChange, saveToolSettings, type Prefill } from "./host/toolbox";
import { DEFAULT_SETTINGS, recordKey, tableNode, type AnalysisInput, type AnalysisSettings, type Evidence, type PreflightCheck, type PreflightReport } from "./model/types";
import { Findings } from "./ui/Findings";
import { confidenceColor } from "./ui/format";
import { ImpactMap } from "./ui/ImpactMap";
import { InputBar } from "./ui/InputBar";
import { PreflightPanel } from "./ui/PreflightPanel";
import { SettingsDialog } from "./ui/SettingsDialog";
import { Timeline } from "./ui/Timeline";

type View = "timeline" | "impact" | "findings";

export default function App() {
    const [connection, setConnection] = useState<ConnectionFacts | null>(null);
    const [report, setReport] = useState<PreflightReport>();
    const [preflightLoading, setPreflightLoading] = useState(true);
    const [preflightError, setPreflightError] = useState<string>();
    const [targetChecks, setTargetChecks] = useState<PreflightCheck[]>([]);
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [prefill, setPrefill] = useState<Prefill>();
    const [settings, setSettings] = useState<AnalysisSettings>(DEFAULT_SETTINGS);
    const [result, setResult] = useState<AnalysisResult>();
    const [running, setRunning] = useState(false);
    const [view, setView] = useState<View>("findings");
    const [timelineFocus, setTimelineFocus] = useState<string>();
    const [mapFocus, setMapFocus] = useState<string>();
    const columnCache = useRef(new Map<string, Promise<ColumnInfo[]>>());
    const runId = useRef(0);
    const abort = useRef<AbortController>();

    const runPreflight = useCallback(async () => {
        const id = ++runId.current;
        abort.current?.abort();
        setPreflightLoading(true);
        setPreflightError(undefined);
        setTargetChecks([]);
        setResult(undefined);
        columnCache.current.clear();
        try {
            const conn = await getConnectionFacts();
            if (id !== runId.current) return;
            setConnection(conn);
            if (!conn) {
                setReport(evaluatePreflight({ connection: null, schema: {}, org: { values: {} }, access: {} }));
                setTables([]);
                return;
            }
            const dv = getDataverse();
            const [facts, tableList] = await Promise.all([gatherPreflightFacts(dv, conn), loadTables(dv).catch(() => [] as TableInfo[])]);
            if (id !== runId.current) return;
            setReport(evaluatePreflight(facts));
            setTables(tableList);
        } catch (error) {
            if (id === runId.current) setPreflightError(errorMessage(error));
        } finally {
            if (id === runId.current) setPreflightLoading(false);
        }
    }, []);

    useEffect(() => {
        getPrefill().then(setPrefill);
        loadToolSettings(DEFAULT_SETTINGS).then(setSettings);
        runPreflight();
        const off = onConnectionChange(runPreflight);
        return () => {
            off();
            abort.current?.abort();
        };
    }, [runPreflight]);

    const columnsFor = useCallback((table: string) => {
        let pending = columnCache.current.get(table);
        if (!pending) {
            pending = loadColumns(getDataverse(), table);
            pending.catch(() => columnCache.current.delete(table));
            columnCache.current.set(table, pending);
        }
        return pending;
    }, []);

    const analyze = useCallback(
        async (input: AnalysisInput) => {
            if (!report) return;
            abort.current?.abort();
            const controller = new AbortController();
            abort.current = controller;
            setRunning(true);
            setResult(undefined);
            setView("timeline");
            const dv = getDataverse();
            gatherTargetAudit(dv, input.table, input.column).then((facts) => {
                const orgAudit = report.checks.find((c) => c.id === "audit-org");
                const orgAuditEnabled = orgAudit?.status === "ok" ? true : orgAudit?.status === "error" ? false : undefined;
                setTargetChecks(evaluateTargetAudit(facts, orgAuditEnabled));
            });
            try {
                const final = await runAnalysis({ dv, pa: getPowerAutomate(), tables }, input, report, settings, (r) => !controller.signal.aborted && setResult(r), controller.signal);
                if (!controller.signal.aborted) {
                    setResult(final);
                    if (final.findings.some((f) => f.kind === "finding")) setView("findings");
                }
            } catch (error) {
                setResult((r) => (r ? { ...r, done: true, error: errorMessage(error) } : r));
            } finally {
                if (abort.current === controller) setRunning(false);
            }
        },
        [report, settings, tables],
    );

    const cancel = () => {
        abort.current?.abort();
        setRunning(false);
        setResult((r) => (r ? { ...r, done: true, cancelled: true } : r));
    };

    const saveSettings = (next: AnalysisSettings) => {
        setSettings(next);
        saveToolSettings(next);
    };

    const navigate = useCallback(
        (evidence: Evidence) => {
            if (evidence.kind === "event") {
                setView("timeline");
                setTimelineFocus(evidence.id);
            } else if (evidence.kind === "handler") {
                setView("impact");
                setMapFocus(evidence.id);
            } else {
                const [table, id] = evidence.id.split(":");
                const first = result?.timeline.events.find((e) => e.record?.id === id);
                if (first) {
                    setView("timeline");
                    setTimelineFocus(first.id);
                } else {
                    setView("impact");
                    setMapFocus(tableNode(table));
                }
            }
        },
        [result],
    );
    const clearTimelineFocus = useCallback(() => setTimelineFocus(undefined), []);
    const clearMapFocus = useCallback(() => setMapFocus(undefined), []);
    const openHandler = useCallback((id: string) => {
        setView("impact");
        setMapFocus(id);
    }, []);

    const checks = useMemo(() => [...(report?.checks ?? []), ...targetChecks], [report, targetChecks]);
    const findingCount = result?.findings.filter((f) => f.kind === "finding").length ?? 0;
    const currentValue = result?.input.column && result.snapshot ? displaySnapshot(result.snapshot, result.input.column) : undefined;

    if (!hasToolbox()) {
        return (
            <main className="app">
                <MessageBar intent="error">
                    <MessageBarBody>Open Root Cause Analyzer inside Power Platform ToolBox.</MessageBarBody>
                </MessageBar>
            </main>
        );
    }

    return (
        <main className="app">
            <PreflightPanel checks={checks} loading={preflightLoading} error={preflightError} onRefresh={runPreflight} />

            {prefill !== undefined && (
                <InputBar
                    key={connection?.url ?? "none"}
                    tables={tables}
                    loadColumns={columnsFor}
                    connectionUrl={connection?.url}
                    disabled={!connection || preflightLoading || !report}
                    initial={prefill}
                    onAnalyze={analyze}
                    actions={<SettingsDialog settings={settings} onChange={saveSettings} />}
                />
            )}

            <section className="panel results">
                {result && (
                    <div className="run-status">
                        {running ? <Spinner size="tiny" label={result.steps[result.steps.length - 1] ?? "Analyzing…"} /> : <Text weight="semibold">{result.cancelled ? "Cancelled — showing what was read so far" : result.error ? "Stopped with an error" : "Analysis complete"}</Text>}
                        {running && (
                            <Button size="small" icon={<Dismiss16Regular />} onClick={cancel}>
                                Cancel
                            </Button>
                        )}
                        <span className="spacer" />
                        {currentValue !== undefined && (
                            <Text size={200}>
                                Current {result.input.column}: <strong>{currentValue || "(empty)"}</strong>
                            </Text>
                        )}
                    </div>
                )}
                {result?.error && (
                    <MessageBar intent="error">
                        <MessageBarBody>{result.error}</MessageBarBody>
                    </MessageBar>
                )}
                {result && result.timeline.records.length > 1 && (
                    <div className="scope">
                        <Text size={200} className="muted">
                            Records in this analysis:
                        </Text>
                        {result.timeline.records.map((r) => (
                            <Tooltip key={recordKey(r.ref)} relationship="description" content={`${r.hop === 0 ? "The record you picked" : `Hop ${r.hop}: ${r.via}`}${r.viaConfidence ? ` (${r.viaConfidence} confidence)` : ""}`}>
                                <Badge appearance={r.hop === 0 ? "filled" : "outline"} color={r.hop === 0 ? "brand" : r.viaConfidence ? confidenceColor(r.viaConfidence) : "informative"}>
                                    {r.ref.table}
                                    {r.name ? ` · ${r.name}` : ""}
                                    {r.hop > 0 ? ` · hop ${r.hop}` : ""}
                                </Badge>
                            </Tooltip>
                        ))}
                    </div>
                )}
                <TabList selectedValue={view} onTabSelect={(_, d) => setView(d.value as View)}>
                    <Tab value="findings">
                        Findings {result?.done && findingCount > 0 && <CounterBadge count={findingCount} size="small" color="danger" />}
                    </Tab>
                    <Tab value="timeline">Timeline</Tab>
                    <Tab value="impact">Impact Map</Tab>
                </TabList>
                <div className="results-body">
                    {!result ? (
                        <Text className="muted">Pick a record and time window, then select Analyze.</Text>
                    ) : view === "timeline" ? (
                        <Timeline timeline={result.timeline} input={result.input} focusId={timelineFocus} onFocusHandled={clearTimelineFocus} onOpenHandler={openHandler} />
                    ) : view === "impact" ? (
                        <ImpactMap graph={result.wiring} timeline={result.timeline} input={result.input} focusId={mapFocus} onFocusHandled={clearMapFocus} />
                    ) : (
                        <Findings findings={result.findings} done={result.done} onNavigate={navigate} onCopySummary={() => copyText(buildSummary(result, { environment: connection ? `${connection.name} (${connection.url})` : undefined }))} />
                    )}
                </div>
            </section>
        </main>
    );
}

function displaySnapshot(row: Record<string, unknown>, column: string): string {
    const formattedValue = row[`${column}@OData.Community.Display.V1.FormattedValue`] ?? row[`_${column}_value@OData.Community.Display.V1.FormattedValue`];
    const raw = formattedValue ?? row[column] ?? row[`_${column}_value`];
    return raw === null || raw === undefined ? "" : String(raw);
}
