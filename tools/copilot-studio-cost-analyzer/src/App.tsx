import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FluentProvider, Spinner, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { loadReport, REPORT_TIMEOUT_MS, type BillingRow, type FeatureRow, type ReportKind, type ReportProgress } from "./api/reports";
import {
    aggregateAgents,
    aggregateBilling,
    comparePeriods,
    dailySeries,
    detectUsageSpikes,
    forecastMonthEnd,
    type AgentTotal,
    type DayTotal,
} from "./data/analysis";
import { downloadCsv } from "./data/export";
import type { PowerPlatformConnectionStatus, PowerPlatformReportOutcome } from "./data/prerequisites";
import { AzureCostView } from "./components/AzureCostView";
import { PrerequisitesHelp } from "./components/PrerequisitesHelp";
import { useAzureCosts } from "./hooks/useAzureCosts";
import "./index.css";

type ReportData = { kind: "agents"; rows: FeatureRow[] } | { kind: "billing"; rows: BillingRow[] };
type DateRange = { startDate: string; endDate: string };

function utcDate(daysAgo: number): string {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return date.toISOString().slice(0, 10);
}

function initialRange(): DateRange {
    return { startDate: utcDate(30), endDate: utcDate(1) };
}

function formatNumber(value: number): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string): string {
    return value ? new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC" }) : "—";
}

function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

function formatElapsed(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes > 0 ? `${minutes}m ${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
}

function progressDetail(message: string): string {
    const separator = message.indexOf(" · ");
    return separator >= 0 ? message.slice(separator + 3) : message;
}

function uniqueValues(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function dateSpanLabel(start: string, end: string): string {
    if (!start || !end) return "Unavailable";
    return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

function changePercent(earlier: number, later: number): string {
    if (earlier === 0) return later === 0 ? "0%" : "New";
    const change = ((later - earlier) / earlier) * 100;
    return `${change > 0 ? "+" : ""}${formatNumber(change)}%`;
}

function getErrorMessage(reason: unknown): string {
    if (reason && typeof reason === "object" && "status" in reason) {
        const failure = reason as { status?: unknown; code?: unknown; message?: unknown };
        if (failure.status === 401) return "Authentication failed. Reconnect your delegated Power Platform account and try again.";
        if (failure.status === 403) return "Access denied. Confirm your account has an eligible tenant administrator role.";
        if (failure.status === 404) return "The report API or selected report is not enabled for this tenant yet.";
        if (failure.status === 429) return "The report API is throttling requests. Wait a little and try again.";
        if (failure.code === "InvalidRequestContent") return "The report request was rejected. Check the date range and confirm JSON report downloads are enabled for this tenant.";
        if (typeof failure.message === "string" && failure.message) return failure.message;
    }
    if (reason instanceof Error) return reason.message;
    return "The report request failed unexpectedly. Check the console for diagnostic details.";
}

function reportOutcomeFor(reason: unknown): PowerPlatformReportOutcome | undefined {
    const status = reason && typeof reason === "object" && "status" in reason ? (reason as { status?: unknown }).status : undefined;
    if (status === 401) return "authFailed";
    if (status === 403) return "accessDenied";
    if (status === 404) return "notAvailable";
    return undefined;
}

function logReportFailure(reason: unknown): void {
    if (reason && typeof reason === "object") {
        const failure = reason as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
        console.error("Copilot Studio report request failed.", {
            name: typeof failure.name === "string" ? failure.name : "UnknownError",
            status: typeof failure.status === "number" ? failure.status : undefined,
            code: typeof failure.code === "string" ? failure.code : undefined,
            message: typeof failure.message === "string" ? failure.message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]") : "No error message provided.",
        });
        return;
    }
    const message = String(reason ?? "No error message provided.").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
    console.error("Copilot Studio report request failed.", { name: "UnknownError", message });
}

function App() {
    const requestId = useRef(0);
    const requestController = useRef<AbortController | undefined>(undefined);
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const [connectionName, setConnectionName] = useState("Checking Power Platform connection…");
    const [connectionReady, setConnectionReady] = useState(false);
    const [kind, setKind] = useState<ReportKind>("FeatureDetailsPerResource");
    const [range, setRange] = useState<DateRange>(initialRange);
    const [granularity, setGranularity] = useState<"Daily" | "Summary">("Daily");
    const [data, setData] = useState<ReportData>();
    const [progress, setProgress] = useState<ReportProgress>();
    const [error, setError] = useState<string>();
    const [running, setRunning] = useState(false);
    const [search, setSearch] = useState("");
    const [environmentFilter, setEnvironmentFilter] = useState("");
    const [featureFilter, setFeatureFilter] = useState("");
    const [modelFilter, setModelFilter] = useState("");
    const [channelFilter, setChannelFilter] = useState("");
    const [billingEnvironmentFilter, setBillingEnvironmentFilter] = useState("");
    const [visibleDetailCount, setVisibleDetailCount] = useState(250);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [stopped, setStopped] = useState(false);
    const [reportRetrievedAt, setReportRetrievedAt] = useState<Date>();
    const [reportDeferred, setReportDeferred] = useState(false);
    const [ppConnection, setPpConnection] = useState<PowerPlatformConnectionStatus>("error");
    const [reportOutcome, setReportOutcome] = useState<PowerPlatformReportOutcome>();
    const [view, setView] = useState<"credits" | "azure">("credits");
    const [helpOpen, setHelpOpen] = useState(false);
    const azure = useAzureCosts();

    useEffect(() => {
        let mounted = true;
        if (typeof window === "undefined" || !window.toolboxAPI) {
            setConnectionName("Open this tool inside Power Platform ToolBox");
            setConnectionReady(false);
            setPpConnection("outside");
            return;
        }
        const updateConnection = async () => {
            try {
                const connection = await window.toolboxAPI.connections.getActiveConnection();
                if (!mounted) return;
                setConnectionReady(Boolean(connection?.enabledForPowerPlatformAPI));
                setPpConnection(!connection ? "none" : connection.enabledForPowerPlatformAPI ? "ready" : "disabled");
                setConnectionName(
                    !connection
                        ? "No active connection"
                        : connection.enabledForPowerPlatformAPI
                          ? `${connection.name} · Power Platform API enabled`
                          : `${connection.name} · Power Platform API not enabled`,
                );
            } catch (reason) {
                console.error("Could not read the active PPTB connection.", reason);
                if (mounted) {
                    setConnectionName("Unable to read the active connection");
                    setConnectionReady(false);
                    setPpConnection("error");
                }
            }
        };

        void updateConnection();
        void window.toolboxAPI.utils.getCurrentTheme().then((current) => {
            if (mounted) setTheme(current === "dark" ? "dark" : "light");
        }).catch((reason: unknown) => console.error("Could not read PPTB theme.", reason));

        const handleEvent = (_: unknown, payload: ToolBoxAPI.ToolBoxEventPayload) => {
            if (["connection:created", "connection:updated", "connection:deleted"].includes(payload.event)) {
                void updateConnection();
            }
        };
        window.toolboxAPI.events.on(handleEvent);

        return () => {
            mounted = false;
            window.toolboxAPI.events.off(handleEvent);
        };
    }, []);

    const featureRows = data?.kind === "agents" ? data.rows : undefined;
    const billingRows = data?.kind === "billing" ? data.rows : undefined;
    const filteredFeatureRows = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        if (!featureRows) return [];
        return featureRows.filter((row) => {
            const searchMatch = !query || `${row.agentName} ${row.agentId} ${row.environmentName} ${row.environmentId}`.toLocaleLowerCase().includes(query);
            return searchMatch
                && (!environmentFilter || row.environmentName === environmentFilter || row.environmentId === environmentFilter)
                && (!featureFilter || row.feature === featureFilter || row.product === featureFilter)
                && (!modelFilter || row.model === modelFilter)
                && (!channelFilter || row.channel === channelFilter);
        });
    }, [featureRows, search, environmentFilter, featureFilter, modelFilter, channelFilter]);
    const filteredBillingRows = useMemo(() => (billingRows ?? []).filter((row) =>
        !billingEnvironmentFilter || row.environmentName === billingEnvironmentFilter || row.environmentId === billingEnvironmentFilter,
    ), [billingRows, billingEnvironmentFilter]);
    const agentTotals = useMemo(() => (featureRows ? aggregateAgents(filteredFeatureRows) : []), [featureRows, filteredFeatureRows]);
    const filteredAgents = agentTotals;
    const dayTotals = useMemo(() => (
        featureRows && granularity === "Daily" ? dailySeries(filteredFeatureRows, range.startDate, range.endDate) : []
    ), [featureRows, filteredFeatureRows, granularity, range.startDate, range.endDate]);
    const billingTotals = useMemo(() => (billingRows ? aggregateBilling(filteredBillingRows) : []), [billingRows, filteredBillingRows]);
    const environmentOptions = useMemo(() => uniqueValues((featureRows ?? []).map((row) => row.environmentName || row.environmentId)), [featureRows]);
    const featureOptions = useMemo(() => uniqueValues((featureRows ?? []).map((row) => row.feature || row.product)), [featureRows]);
    const modelOptions = useMemo(() => uniqueValues((featureRows ?? []).map((row) => row.model)), [featureRows]);
    const channelOptions = useMemo(() => uniqueValues((featureRows ?? []).map((row) => row.channel)), [featureRows]);
    const billingEnvironmentOptions = useMemo(() => uniqueValues((billingRows ?? []).map((row) => row.environmentName || row.environmentId)), [billingRows]);
    const periodComparison = useMemo(() => (
        featureRows && granularity === "Daily" ? comparePeriods(filteredFeatureRows, range.startDate, range.endDate) : undefined
    ), [featureRows, filteredFeatureRows, granularity, range.startDate, range.endDate]);
    const spikes = useMemo(() => detectUsageSpikes(dayTotals), [dayTotals]);
    const endDate = new Date(`${range.endDate}T00:00:00Z`);
    const forecast = featureRows && granularity === "Daily"
        && featureRows.some((row) => row.consumptionDate)
        ? forecastMonthEnd(dayTotals, endDate.getUTCFullYear(), endDate.getUTCMonth())
        : undefined;
    const returnedDates = (featureRows ?? [])
        .map((row) => row.consumptionDate.slice(0, 10))
        .filter(Boolean)
        .sort();
    const returnedDateRange = returnedDates.length
        ? dateSpanLabel(returnedDates[0], returnedDates[returnedDates.length - 1])
        : granularity === "Summary" ? "Not included in Summary data" : "No dated rows returned";

    const runReport = useCallback(async () => {
        const id = ++requestId.current;
        const controller = new AbortController();
        requestController.current = controller;
        setError(undefined);
        setStopped(false);
        setData(undefined);
        setReportDeferred(false);
        setReportRetrievedAt(undefined);
        setRunning(true);
        setElapsedSeconds(0);
        setSearch("");
        setEnvironmentFilter("");
        setFeatureFilter("");
        setModelFilter("");
        setChannelFilter("");
        setBillingEnvironmentFilter("");
        setVisibleDetailCount(250);
        setProgress({ message: "Submitting report request…", elapsedMs: 0 });
        try {
            if (kind === "FeatureDetailsPerResource") {
                const rows = await loadReport(kind, range, granularity, setProgress, controller.signal);
                if (id === requestId.current) {
                    setData({ kind: "agents", rows });
                    setReportRetrievedAt(new Date());
                    setReportOutcome("succeeded");
                }
            } else {
                const rows = await loadReport(kind, range, granularity, setProgress, controller.signal);
                if (id === requestId.current) {
                    setData({ kind: "billing", rows });
                    setReportRetrievedAt(new Date());
                    setReportOutcome("succeeded");
                }
            }
        } catch (reason) {
            if (id !== requestId.current) return;
            if (reason instanceof Error && reason.name === "AbortError") {
                setStopped(true);
                return;
            }
            logReportFailure(reason);
            const outcome = reportOutcomeFor(reason);
            if (outcome) setReportOutcome(outcome);
            const message = getErrorMessage(reason);
            setError(message);
        } finally {
            if (id === requestId.current) {
                requestController.current = undefined;
                setRunning(false);
                setProgress(undefined);
            }
        }
    }, [kind, range, granularity]);

    const stopReport = useCallback(() => {
        if (!running) return;
        requestId.current++;
        requestController.current?.abort();
        requestController.current = undefined;
        setRunning(false);
        setProgress(undefined);
        setStopped(true);
    }, [running]);

    useEffect(() => {
        if (!running) return;
        const timer = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
        return () => clearInterval(timer);
    }, [running]);

    useEffect(() => () => {
        requestId.current++;
        requestController.current?.abort();
    }, []);

    const dateError = !range.startDate || !range.endDate || range.startDate > range.endDate
        ? "Choose a valid date range."
        : range.endDate > utcDate(1)
          ? "The end date must be a completed UTC day (yesterday or earlier)."
          : kind === "FeatureDetailsPerResource" && range.startDate < utcDate(30)
            ? "Agent feature reports are rebuilt for the previous 30 complete UTC days. Choose a more recent start date."
            : undefined;

    const exportReport = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
        try {
            downloadCsv(filename, headers, rows);
        } catch (reason) {
            console.error("Could not export the Copilot Studio report.", reason);
            setError("The CSV export could not be created. Check available disk space and try again.");
        }
    };

    return (
        <FluentProvider theme={theme === "dark" ? webDarkTheme : webLightTheme} className="provider">
            <main className="app">
                <header className="header">
                    <nav className="view-tabs" role="tablist" aria-label="Choose a data source">
                        <button role="tab" aria-selected={view === "credits"} className={view === "credits" ? "selected" : ""} onClick={() => setView("credits")}>
                            Copilot Credits{running && <Spinner size="extra-tiny" />}
                        </button>
                        <button role="tab" aria-selected={view === "azure"} className={view === "azure" ? "selected" : ""} onClick={() => setView("azure")}>
                            Azure costs{azure.busy && <Spinner size="extra-tiny" />}
                        </button>
                    </nav>
                    <button className="link-button help-button" onClick={() => setHelpOpen(true)}>
                        <span aria-hidden="true">?</span> Prerequisites &amp; permissions
                    </button>
                </header>

                <div className="view-panel" role="tabpanel" hidden={view !== "credits"}>

                <section className="report-choices" aria-label="Choose a report">
                    <ReportChoice
                        selected={kind === "FeatureDetailsPerResource"}
                        disabled={running}
                        title="Agent usage"
                        subtitle="Which agents and features consume credits?"
                        description="Break down billed and non-billed credits by agent and available feature dimensions."
                        sample={[["Agent", "Feature", "Credits"], ["Service helper", "Generative answers", "1,240"], ["Order agent", "Tool actions", "386"]]}
                        onClick={() => { setKind("FeatureDetailsPerResource"); setData(undefined); setReportRetrievedAt(undefined); setError(undefined); setStopped(false); setSearch(""); setEnvironmentFilter(""); setFeatureFilter(""); setModelFilter(""); setChannelFilter(""); setBillingEnvironmentFilter(""); setVisibleDetailCount(250); }}
                    />
                    <ReportChoice
                        selected={kind === "BillingDetailsPerEnvironment"}
                        disabled={running}
                        title="Environment capacity"
                        subtitle="Where are credits consumed and how are they covered?"
                        description="Compare prepaid and pay-as-you-go credit quantities by environment."
                        sample={[["Environment", "Prepaid", "Pay-as-you-go"], ["Production", "12,400", "0"], ["Development", "0", "180"]]}
                        onClick={() => { setKind("BillingDetailsPerEnvironment"); setData(undefined); setReportRetrievedAt(undefined); setError(undefined); setStopped(false); setSearch(""); setEnvironmentFilter(""); setFeatureFilter(""); setModelFilter(""); setChannelFilter(""); setBillingEnvironmentFilter(""); setVisibleDetailCount(250); }}
                    />
                </section>

                <section className="controls" aria-label="Report settings">
                    <label>
                        Start date (UTC)
                        <input type="date" value={range.startDate} max={utcDate(1)} disabled={running} onChange={(event) => { setRange((current) => ({ ...current, startDate: event.target.value })); setData(undefined); setReportRetrievedAt(undefined); setError(undefined); }} />
                    </label>
                    <label>
                        End date (UTC)
                        <input type="date" value={range.endDate} max={utcDate(1)} disabled={running} onChange={(event) => { setRange((current) => ({ ...current, endDate: event.target.value })); setData(undefined); setReportRetrievedAt(undefined); setError(undefined); }} />
                    </label>
                    <label>
                        Detail
                        <select value={granularity} disabled={running} onChange={(event) => { setGranularity(event.target.value as "Daily" | "Summary"); setData(undefined); setReportRetrievedAt(undefined); setError(undefined); }}>
                            <option value="Daily">Daily</option>
                            <option value="Summary">Summary</option>
                        </select>
                    </label>
                    {running || reportDeferred ? (
                        <div className="running-indicator">{running ? <><Spinner size="tiny" />Generating…</> : "Report ready"}</div>
                    ) : (
                        <button className="primary-button" disabled={!connectionReady || Boolean(dateError)} onClick={() => void runReport()}>
                            {error ? "Try again" : "Run report"}
                        </button>
                    )}
                </section>

                <div className="report-help">
                    {kind === "FeatureDetailsPerResource"
                        ? "Agent usage covers the previous 30 complete UTC days; later processing may revise daily values."
                        : "Environment capacity includes daily entitlement and prepaid/pay-as-you-go credit quantities."}
                    {" "}The first status check is after one minute; later checks follow the service's Retry-After interval.
                </div>
                {dateError && <p className="inline-warning" role="alert">{dateError}</p>}
                {!connectionReady && (
                    <div className="notice" role="status">
                        {connectionName}. Enable the Power Platform API on the active PPTB connection. Sign in with a delegated user account that has an eligible tenant administrator role; app-only authentication is not supported.
                    </div>
                )}
                {(progress || (data && reportDeferred)) && (
                    <>
                        <div className="progress-card">
                            {progress ? <Spinner size="small" /> : <span aria-hidden="true">✓</span>}
                            <strong className="progress-quip">{progress ? <RotatingQuip /> : "Your report is ready."}</strong>
                            <span className="progress-details" role="status">
                                {progress
                                    ? <>Elapsed {formatElapsed(elapsedSeconds)} · {progressDetail(progress.message)} · timeout after {formatElapsed(REPORT_TIMEOUT_MS / 1000)}</>
                                    : "Keep playing. Your results will wait until you choose to view them."}
                            </span>
                            {progress && <button className="stop-button compact-stop" onClick={stopReport}>Stop</button>}
                        </div>
                    </>
                )}
                <WaitingBreak
                    waiting={running}
                    reportReady={Boolean(data)}
                    onStart={() => setReportDeferred(true)}
                    onViewReport={() => setReportDeferred(false)}
                />
                {stopped && <div className="stopped" role="status">Report stopped. No further status checks will be made. A request already in progress may still finish in the background.</div>}
                {error && <div className="error" role="alert"><strong>Couldn’t load the report.</strong><span>{error}</span></div>}

                {featureRows && !reportDeferred && (
                    <section className="results">
                        <div className="notice">
                            Credits are usage units, not invoice amounts. Billed credit classifications don’t confirm Azure charges. Use the environment report to distinguish prepaid and pay-as-you-go consumption.
                        </div>
                        <CoverageSummary
                            requested={dateSpanLabel(range.startDate, range.endDate)}
                            returned={returnedDateRange}
                            retrieved={reportRetrievedAt?.toLocaleString(undefined, { timeZone: "UTC", timeZoneName: "short" }) ?? "Unavailable"}
                            rowCount={featureRows.length}
                        />
                        <section className="filter-panel" aria-label="Filter agent report">
                            <label>Environment
                                <select value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value)}>
                                    <option value="">All environments</option>
                                    {environmentOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                                </select>
                            </label>
                            <label>Feature
                                <select value={featureFilter} onChange={(event) => setFeatureFilter(event.target.value)}>
                                    <option value="">All features</option>
                                    {featureOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                                </select>
                            </label>
                            <label>Model
                                <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
                                    <option value="">All models</option>
                                    {modelOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                                </select>
                            </label>
                            <label>Channel
                                <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                                    <option value="">All channels</option>
                                    {channelOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                                </select>
                            </label>
                            <label>Agent or environment
                                <input className="filter-search" aria-label="Filter by agent or environment" placeholder="Name or ID" value={search} onChange={(event) => setSearch(event.target.value)} />
                            </label>
                        </section>
                        <div className="stats">
                            <Stat label="Billed credits" value={formatNumber(sum(filteredFeatureRows.map((row) => row.billedCredit)))} />
                            <Stat label="Non-billed credits" value={formatNumber(sum(filteredFeatureRows.map((row) => row.nonBilledCredit)))} />
                            <Stat label="Agents" value={formatNumber(agentTotals.length)} />
                            <Stat label="Matching rows" value={formatNumber(filteredFeatureRows.length)} />
                        </div>
                        {featureRows.length > 0 && dayTotals.length > 0 && <DailyChart data={dayTotals} />}
                        {granularity === "Daily" && featureRows.length > 0 && (
                            <UsageInsights
                                spikes={spikes}
                                forecast={forecast}
                                selectedDays={dayTotals.length}
                                monthLabel={endDate.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" })}
                            />
                        )}
                        {periodComparison && (
                            <PeriodComparisonPanel comparison={periodComparison} />
                        )}
                        <section className="panel">
                            <div className="panel-heading">
                                <div><h2>Agent usage</h2><p>Ranked by billed Copilot Credits after filters</p></div>
                            </div>
                            <div className="table-scroll">
                                <table>
                                    <thead><tr><th>Agent</th><th>Environment</th><th>Rows</th><th>Billed</th><th>Non-billed</th></tr></thead>
                                    <tbody>
                                        {filteredAgents.map((agent) => <AgentRow key={`${agent.agentId}-${agent.environmentId}`} agent={agent} />)}
                                        {filteredAgents.length === 0 && <tr><td colSpan={5} className="empty">No agent rows match this filter.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                        <section className="panel">
                            <div className="panel-heading">
                                <div><h2>Consumption details</h2><p>Showing {formatNumber(filteredFeatureRows.length)} matching rows · feature, model, channel, and tool fields depend on availability.</p></div>
                                <button className="secondary-button" disabled={filteredFeatureRows.length === 0} onClick={() => exportReport(
                                    "copilot-studio-agent-usage.csv",
                                    ["Consumption date", "Agent name", "Agent ID", "Product", "Feature", "Environment name", "Environment ID", "Model", "Channel", "Tool", "Knowledge sources", "Scenario", "Billed credits", "Non-billed credits"],
                                    filteredFeatureRows.map((row) => [row.consumptionDate, row.agentName, row.agentId, row.product, row.feature, row.environmentName, row.environmentId, row.model, row.channel, row.toolUsed, row.knowledgeSources, row.scenarioName, row.billedCredit, row.nonBilledCredit]),
                                )}>Export filtered CSV</button>
                            </div>
                            <div className="table-scroll">
                                <table>
                                    <thead><tr><th>Date</th><th>Agent</th><th>Product / feature</th><th>Environment</th><th>Model</th><th>Channel</th><th>Tool</th><th>Knowledge source</th><th>Scenario</th><th>Billed</th><th>Non-billed</th></tr></thead>
                                    <tbody>
                                        {filteredFeatureRows.slice(0, visibleDetailCount).map((row, index) => (
                                            <tr key={`${row.agentId}-${row.consumptionDate}-${row.feature}-${index}`}>
                                                <td>{granularity === "Daily" ? formatDate(row.consumptionDate) : "Summary"}</td>
                                                <td>{row.agentName || row.agentId || "—"}</td>
                                                <td>{row.feature || row.product || "—"}</td>
                                                <td>{row.environmentName || row.environmentId || "—"}</td>
                                                <td>{row.model || "—"}</td>
                                                <td>{row.channel || "—"}</td>
                                                <td>{row.toolUsed || "—"}</td>
                                                <td>{row.knowledgeSources || "—"}</td>
                                                <td>{row.scenarioName || "—"}</td>
                                                <td>{formatNumber(row.billedCredit)}</td>
                                                <td>{formatNumber(row.nonBilledCredit)}</td>
                                            </tr>
                                        ))}
                                        {filteredFeatureRows.length === 0 && <tr><td colSpan={11} className="empty">No consumption rows match this filter.</td></tr>}
                                    </tbody>
                                </table>
                                {filteredFeatureRows.length > visibleDetailCount && (
                                    <button className="load-more" onClick={() => setVisibleDetailCount((count) => count + 250)}>
                                        Show more rows ({formatNumber(filteredFeatureRows.length - visibleDetailCount)} remaining)
                                    </button>
                                )}
                            </div>
                        </section>
                    </section>
                )}

                {billingRows && !reportDeferred && (
                    <section className="results">
                        <div className="notice">
                            This report shows credit quantities by environment, not dollar charges. Pay-as-you-go quantities are not an invoice amount; Azure Cost Management is the source for billed monetary cost.
                        </div>
                        <CoverageSummary
                            requested={dateSpanLabel(range.startDate, range.endDate)}
                            returned={(() => {
                                const dates = billingRows.map((row) => row.billedDate.slice(0, 10)).filter(Boolean).sort();
                                return dates.length ? dateSpanLabel(dates[0], dates[dates.length - 1]) : granularity === "Summary" ? "Not included in Summary data" : "No dated rows returned";
                            })()}
                            retrieved={reportRetrievedAt?.toLocaleString(undefined, { timeZone: "UTC", timeZoneName: "short" }) ?? "Unavailable"}
                            rowCount={billingRows.length}
                        />
                        <section className="filter-panel billing-filter" aria-label="Filter environment report">
                            <label>Environment
                                <select value={billingEnvironmentFilter} onChange={(event) => setBillingEnvironmentFilter(event.target.value)}>
                                    <option value="">All environments</option>
                                    {billingEnvironmentOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                                </select>
                            </label>
                            <button className="secondary-button" disabled={filteredBillingRows.length === 0} onClick={() => exportReport(
                                "copilot-studio-environment-capacity.csv",
                                ["Billed date", "Tenant ID", "Environment name", "Environment ID", "Entitlement ID", "Entitled quantity", "Billing policy ID", "Prepaid consumed", "Pay-as-you-go consumed"],
                                filteredBillingRows.map((row) => [row.billedDate, row.tenantId, row.environmentName, row.environmentId, row.entitlementId, row.entitledQuantity, row.billingPolicyId, row.prepaidConsumed, row.payGoConsumed]),
                            )}>Export filtered CSV</button>
                        </section>
                        <div className="stats">
                            <Stat label="Prepaid credits consumed" value={formatNumber(sum(filteredBillingRows.map((row) => row.prepaidConsumed)))} />
                            <Stat label="Pay-as-you-go credits" value={formatNumber(sum(filteredBillingRows.map((row) => row.payGoConsumed)))} />
                            <Stat label="Environments" value={formatNumber(billingTotals.length)} />
                            <Stat label="Matching rows" value={formatNumber(filteredBillingRows.length)} />
                        </div>
                        <section className="panel">
                            <div className="panel-heading"><div><h2>Environment capacity &amp; billing</h2><p>Prepaid and pay-as-you-go credit quantities</p></div></div>
                            <div className="table-scroll">
                                <table>
                                    <thead><tr><th>Date</th><th>Environment</th><th>Entitlement ID</th><th>Entitled quantity</th><th>Billing policy</th><th>Prepaid consumed</th><th>Pay-as-you-go consumed</th></tr></thead>
                                    <tbody>
                                        {filteredBillingRows.map((row, index) => (
                                            <tr key={`${row.environmentId}-${row.billedDate}-${row.entitlementId}-${index}`}>
                                                <td>{granularity === "Daily" ? formatDate(row.billedDate) : "Summary"}</td>
                                                <td>{row.environmentName || row.environmentId || "—"}</td>
                                                <td>{row.entitlementId || "—"}</td>
                                                <td>{granularity === "Daily" ? formatNumber(row.entitledQuantity) : "—"}</td>
                                                <td>{row.billingPolicyId || "—"}</td>
                                                <td>{formatNumber(row.prepaidConsumed)}</td>
                                                <td>{formatNumber(row.payGoConsumed)}</td>
                                            </tr>
                                        ))}
                                        {filteredBillingRows.length === 0 && <tr><td colSpan={7} className="empty">No environment billing rows match this filter.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </section>
                )}

                {!data && !running && !error && (
                    <section className="empty-state">
                        <div className="empty-icon">↗</div>
                        <h2>Analyze Copilot Studio consumption</h2>
                        <p>Request a report directly from the Power Platform API. No report downloads or manual imports required.</p>
                    </section>
                )}
                </div>
                <div className="view-panel" role="tabpanel" hidden={view !== "azure"}>
                    <AzureCostView azure={azure} onOpenHelp={() => setHelpOpen(true)} />
                </div>
                <PrerequisitesHelp
                    open={helpOpen}
                    onClose={() => setHelpOpen(false)}
                    powerPlatform={{ connection: ppConnection, reportOutcome }}
                    azure={azure}
                />
                <footer>{view === "credits"
                    ? "Report data may be delayed or restated. Agent feature reports cover the previous 30 complete UTC days and can include multiple rows per agent and day."
                    : "Azure cost data can be delayed and revised until the billing period closes. Amounts are pre-tax and aren't invoices."}</footer>
            </main>
        </FluentProvider>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function CoverageSummary({ requested, returned, retrieved, rowCount }: {
    requested: string;
    returned: string;
    retrieved: string;
    rowCount: number;
}) {
    return (
        <section className="coverage-panel" aria-label="Report freshness and coverage">
            <div><span>Requested period (UTC)</span><strong>{requested}</strong></div>
            <div><span>Returned date coverage</span><strong>{returned}</strong></div>
            <div><span>Rows returned</span><strong>{formatNumber(rowCount)}</strong></div>
            <div><span>Retrieved (UTC)</span><strong>{retrieved}</strong></div>
            <p>Coverage reflects dates present in returned rows, not a guarantee of complete source data. Microsoft may delay or restate daily values.</p>
        </section>
    );
}

const WAITING_QUIPS = [
    "Giving the report a moment to wake up…",
    "The bean counters are counting beans…",
    "Brewing a fresh batch of usage insights…",
    "Checking whether the numbers are done stretching…",
    "Coffee break: the report is still processing…",
    "Polishing the numbers before they land…",
];

function RotatingQuip() {
    const [quipIndex, setQuipIndex] = useState(0);

    useEffect(() => {
        const timer = window.setInterval(() => setQuipIndex((index) => (index + 1) % WAITING_QUIPS.length), 7000);
        return () => window.clearInterval(timer);
    }, []);

    return <span aria-live="polite">{WAITING_QUIPS[quipIndex]}</span>;
}

function WaitingBreak({ waiting, reportReady, onStart, onViewReport }: {
    waiting: boolean;
    reportReady: boolean;
    onStart: () => void;
    onViewReport: () => void;
}) {
    const [secondsLeft, setSecondsLeft] = useState<number>();
    const [caught, setCaught] = useState(0);
    const [lost, setLost] = useState(0);
    const [played, setPlayed] = useState(false);
    const [beanPosition, setBeanPosition] = useState({ left: 48, top: 8 });
    const [beanKey, setBeanKey] = useState(0);
    const gameDeadline = useRef(0);
    const active = secondsLeft !== undefined;

    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => {
            const remaining = Math.ceil((gameDeadline.current - Date.now()) / 1000);
            setSecondsLeft(remaining > 0 ? remaining : undefined);
        }, 250);
        return () => window.clearInterval(timer);
    }, [active]);

    const moveBean = useCallback(() => {
        setBeanPosition({ left: 8 + Math.random() * 78, top: 5 + Math.random() * 25 });
        setBeanKey((key) => key + 1);
    }, []);

    useEffect(() => {
        if (!active) return;
        const timer = window.setTimeout(() => {
            if (Date.now() >= gameDeadline.current) return;
            setLost((score) => score + 1);
            moveBean();
        }, 1450);
        return () => window.clearTimeout(timer);
    }, [active, beanKey, moveBean]);

    const startGame = () => {
        onStart();
        setCaught(0);
        setLost(0);
        setPlayed(true);
        gameDeadline.current = Date.now() + 60_000;
        setSecondsLeft(60);
        moveBean();
    };

    if (!waiting && !active && !played) return null;

    return (
        <div className="waiting-break">
            <div className="game-intro">
                <div>
                    <strong>Coffee bean break</strong>
                    <span>Play Catch Coffee Bean while you wait for the report to render. Catch as many as you can in 60 seconds.</span>
                </div>
                {secondsLeft === undefined
                    ? (waiting || reportReady) && <button type="button" className="game-action" onClick={startGame}>{played ? "Play again" : "Start game"}</button>
                    : <div className="game-score"><span>Caught: {caught}</span><span>Lost: {lost}</span><span>{secondsLeft}s</span></div>}
            </div>
                <div className="game-ready" style={{ visibility: reportReady ? "visible" : "hidden" }} aria-hidden={!reportReady}>
                    <span role="status">{reportReady ? "Your report is ready. Feel free to finish your game." : ""}</span>
                    <button type="button" className="game-action" onClick={() => {
                        setSecondsLeft(undefined);
                        onViewReport();
                    }}>View report</button>
                </div>
            {secondsLeft !== undefined && (
                <div className="bean-field" aria-label="Coffee bean game area">
                    <button
                        key={beanKey}
                        type="button"
                        className="coffee-bean"
                        style={{ left: `${beanPosition.left}%`, top: `${beanPosition.top}%` }}
                        aria-label="Catch the coffee bean"
                        onClick={() => {
                            if (Date.now() >= gameDeadline.current) return;
                            setCaught((score) => score + 1);
                            moveBean();
                        }}
                    >
                        <img src="./icons/coffee-bean.svg" alt="" draggable={false} />
                    </button>
                </div>
            )}
            {secondsLeft === undefined && played && <span className="game-final-score" role="status">Game finished · Caught: {caught} · Lost: {lost}</span>}
        </div>
    );
}

function UsageInsights({ spikes, forecast, selectedDays, monthLabel }: {
    spikes: ReturnType<typeof detectUsageSpikes>;
    forecast: number | undefined;
    selectedDays: number;
    monthLabel: string;
}) {
    return (
        <section className="panel insights-panel">
            <div className="panel-heading">
                <div><h2>Trend alerts &amp; month-end estimate</h2><p>Alerts identify possible daily spikes; estimates are indicative only.</p></div>
            </div>
            <div className="insights-content">
                <div className="forecast-card">
                    <span>Estimated {monthLabel} billed credits</span>
                    <strong>{forecast === undefined ? "Not available" : formatNumber(forecast)}</strong>
                    <p>
                        {forecast === undefined
                            ? `Select a full 30-day daily report to enable the estimate (currently ${selectedDays} calendar days).`
                            : "Assumes average billed usage across the last 30 complete UTC days continues through month-end. This is an estimate, not a billing forecast."}
                    </p>
                </div>
                <div className="spike-list">
                    <strong>Potential spikes</strong>
                    <p>Daily billed credits more than 2× the preceding 7-day average. Missing report dates are treated as zero.</p>
                    {selectedDays < 8 ? (
                        <span className="insight-empty">At least 8 daily dates are needed to identify a spike.</span>
                    ) : spikes.length === 0 ? (
                        <span className="insight-empty">No potential spikes found in this report.</span>
                    ) : (
                        <ul>
                            {spikes.slice(-5).reverse().map((spike) => (
                                <li key={spike.date}>
                                    <span>{formatDate(spike.date)}</span>
                                    <strong>{formatNumber(spike.billedCredit)}</strong>
                                    <span>vs {formatNumber(spike.baselineAverage)} average</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            <p className="insight-disclaimer">Forecasts and spike flags are calculated from the selected, filtered report data; they are not predictions or billing advice.</p>
        </section>
    );
}

function PeriodComparisonPanel({ comparison }: { comparison: NonNullable<ReturnType<typeof comparePeriods>> }) {
    return (
        <section className="panel">
            <div className="panel-heading">
                <div>
                    <h2>Compare periods by agent</h2>
                    <p>Compares the earlier and later halves of the selected date range.</p>
                </div>
            </div>
            <div className="comparison-periods">
                <span>Earlier: {dateSpanLabel(comparison.earlierStart, comparison.earlierEnd)} · {formatNumber(comparison.earlierBilled)} billed credits</span>
                <span>Later: {dateSpanLabel(comparison.laterStart, comparison.laterEnd)} · {formatNumber(comparison.laterBilled)} billed credits</span>
            </div>
            <div className="table-scroll">
                <table>
                    <thead><tr><th>Agent</th><th>Earlier period</th><th>Later period</th><th>Change</th></tr></thead>
                    <tbody>
                        {comparison.agents.map((agent) => (
                            <tr key={agent.agentId}>
                                <td>{agent.agentName}</td>
                                <td>{formatNumber(agent.earlierBilled)}</td>
                                <td>{formatNumber(agent.laterBilled)}</td>
                                <td>{changePercent(agent.earlierBilled, agent.laterBilled)}</td>
                            </tr>
                        ))}
                        {comparison.agents.length === 0 && <tr><td colSpan={4} className="empty">No agent rows are available for this comparison.</td></tr>}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function ReportChoice({
    selected,
    disabled,
    title,
    subtitle,
    description,
    sample,
    onClick,
}: {
    selected: boolean;
    disabled: boolean;
    title: string;
    subtitle: string;
    description: string;
    sample: string[][];
    onClick: () => void;
}) {
    return (
        <article className={`report-choice${selected ? " selected" : ""}`}>
            <button type="button" className="report-choice-button" aria-pressed={selected} disabled={disabled} onClick={onClick}>
                <span className="choice-heading">
                    <strong>{title}</strong>
                    <span className="choice-indicator">{selected ? "Selected" : "Choose"}</span>
                </span>
                <span className="choice-question">{subtitle}</span>
                <span className="choice-description">{description}</span>
            </button>
            <div className="mock-preview">
                <span className="mock-label">Illustrative preview · not live tenant data</span>
                <div className="mock-table-scroll">
                    <table>
                        <thead><tr>{sample[0].map((cell) => <th key={cell}>{cell}</th>)}</tr></thead>
                        <tbody>{sample.slice(1).map((row, index) => (
                            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                        ))}</tbody>
                    </table>
                </div>
            </div>
        </article>
    );
}

function AgentRow({ agent }: { agent: AgentTotal }) {
    return <tr><td>{agent.agentName || agent.agentId || "—"}</td><td>{agent.environmentName || agent.environmentId || "—"}</td><td>{formatNumber(agent.rows)}</td><td>{formatNumber(agent.billedCredit)}</td><td>{formatNumber(agent.nonBilledCredit)}</td></tr>;
}

function DailyChart({ data }: { data: DayTotal[] }) {
    const max = Math.max(...data.map((day) => day.billedCredit), 1);
    return (
        <section className="panel chart-panel">
            <div className="panel-heading"><div><h2>Daily billed credits</h2><p>Consumption Date is the report processing date, not necessarily event date.</p></div></div>
            <div className="chart" role="img" aria-label="Daily billed Copilot Credit usage bar chart">
                {data.map((day) => (
                    <div className="chart-column" key={day.date} title={`${formatDate(day.date)}: ${formatNumber(day.billedCredit)} billed credits`}>
                        <span className="bar-value">{formatNumber(day.billedCredit)}</span>
                        <div className="bar-track"><div className="bar" style={{ height: `${Math.max((day.billedCredit / max) * 100, day.billedCredit > 0 ? 2 : 0)}%` }} /></div>
                        <span className="bar-label">{day.date.slice(5)}</span>
                    </div>
                ))}
                {data.length === 0 && <p className="empty">No daily values to chart.</p>}
            </div>
        </section>
    );
}

export default App;
