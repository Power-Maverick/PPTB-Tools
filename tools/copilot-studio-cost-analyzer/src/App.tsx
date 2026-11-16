import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FluentProvider, Spinner, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { REPORT_TIMEOUT_MS, type BillingRow, type FeatureRow, type ReportKind } from "./api/reports";
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
import { useAzureCosts, type InitialAzureSession } from "./hooks/useAzureCosts";
import { useCreditReports, type CreditReportSession } from "./hooks/useCreditReports";
import { SummaryDashboard } from "./components/SummaryDashboard";
import { isLatestThirtyDays, reportReadinessMessage } from "./data/dashboard";
import "./index.css";
import copilotStudioIcon from "../public/icons/copilotstudio.svg?inline";

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

function reportOutcomeFor(reason: unknown): PowerPlatformReportOutcome | undefined {
    const status = reason && typeof reason === "object" && "status" in reason ? (reason as { status?: unknown }).status : undefined;
    if (status === 401) return "authFailed";
    if (status === 403) return "accessDenied";
    if (status === 404) return "notAvailable";
    return undefined;
}

export interface InitialReportSession {
    credits: CreditReportSession;
    azure: InitialAzureSession;
}

function App({ initialSession }: { initialSession?: InitialReportSession }) {
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const [connectionName, setConnectionName] = useState("Checking Power Platform connection…");
    const [connectionReady, setConnectionReady] = useState(false);
    const [kind, setKind] = useState<ReportKind>("FeatureDetailsPerResource");
    const [range, setRange] = useState<DateRange>(initialRange);
    const [granularity, setGranularity] = useState<"Daily" | "Summary">("Daily");
    const [exportError, setError] = useState<string>();
    const [search, setSearch] = useState("");
    const [agentSelection, setAgentSelection] = useState<{ agentId: string; environmentId: string }>();
    const [environmentFilter, setEnvironmentFilter] = useState("");
    const [featureFilter, setFeatureFilter] = useState("");
    const [modelFilter, setModelFilter] = useState("");
    const [channelFilter, setChannelFilter] = useState("");
    const [billingEnvironmentFilter, setBillingEnvironmentFilter] = useState("");
    const [visibleDetailCount, setVisibleDetailCount] = useState(250);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [reportDeferred, setReportDeferred] = useState(false);
    const [ppConnection, setPpConnection] = useState<PowerPlatformConnectionStatus>("error");
    const [reportOutcome, setReportOutcome] = useState<PowerPlatformReportOutcome>();
    const [view, setView] = useState<"summary" | "credits" | "azure">("summary");
    const [helpOpen, setHelpOpen] = useState(false);
    const azure = useAzureCosts(initialSession?.azure);
    const credits = useCreditReports(initialSession?.credits);
    const currentTask = kind === "FeatureDetailsPerResource" ? credits.agents : credits.billing;
    const currentReport = kind === "FeatureDetailsPerResource" ? credits.agentState : credits.billingState;
    const running = currentReport.status === "loading";
    const creditsRunning = credits.agentState.status === "loading" || credits.billingState.status === "loading";
    const anyRunning = creditsRunning || Boolean(azure.busy);
    const readinessMessage = reportReadinessMessage(
        credits.agentState.status === "ready",
        credits.billingState.status === "ready",
        Boolean(azure.result),
    );
    const data: ReportData | undefined = currentReport.status === "ready"
        ? kind === "FeatureDetailsPerResource"
            ? { kind: "agents", rows: credits.agentState.rows ?? [] }
            : { kind: "billing", rows: credits.billingState.rows ?? [] }
        : undefined;
    const progress = currentReport.progress;
    const error = exportError ?? currentReport.error;
    const stopped = currentReport.status === "stopped";
    const reportRetrievedAt = currentReport.retrievedAt;

    const clearCredits = () => {
        credits.agents.clear();
        credits.billing.clear();
        setError(undefined);
    };

    useEffect(() => {
        const states = [credits.agentState, credits.billingState];
        const failed = states.find((state) => state.status === "error");
        if (failed) setReportOutcome(reportOutcomeFor(failed.failure));
        else if (states.some((state) => state.status === "ready")) setReportOutcome("succeeded");
        else setReportOutcome(undefined);
    }, [credits.agentState, credits.billingState]);

    useEffect(() => {
        let mounted = true;
        let lastConnectionId: string | undefined;
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
                if (lastConnectionId !== undefined && lastConnectionId !== connection?.id) {
                    credits.agents.clear();
                    credits.billing.clear();
                    setAgentSelection(undefined);
                    setReportOutcome(undefined);
                }
                lastConnectionId = connection?.id;
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
        const unsubscribeAzure = window.azureAPI?.onConnectionChanged((event) => {
            if (event.reason !== "connectionChanged") return;
            credits.agents.clear();
            credits.billing.clear();
            setAgentSelection(undefined);
            setReportOutcome(undefined);
            void updateConnection();
        });

        return () => {
            mounted = false;
            window.toolboxAPI.events.off(handleEvent);
            unsubscribeAzure?.();
        };
    }, [credits.agents, credits.billing]);

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
                && (!channelFilter || row.channel === channelFilter)
                && (!agentSelection || row.agentId === agentSelection.agentId && row.environmentId === agentSelection.environmentId);
        });
    }, [featureRows, search, environmentFilter, featureFilter, modelFilter, channelFilter, agentSelection]);
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
    const forecast = featureRows && granularity === "Daily" && isLatestThirtyDays(range)
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

    const resetFilters = () => {
        setSearch("");
        setAgentSelection(undefined);
        setEnvironmentFilter("");
        setFeatureFilter("");
        setModelFilter("");
        setChannelFilter("");
        setBillingEnvironmentFilter("");
        setVisibleDetailCount(250);
        setError(undefined);
    };

    const runReport = () => {
        resetFilters();
        return currentTask.run(range, granularity);
    };

    const stopReport = () => currentTask.stop();

    const stopAll = () => {
        credits.agents.stop();
        credits.billing.stop();
        azure.stop();
    };

    useEffect(() => {
        if (!anyRunning) return;
        setElapsedSeconds(0);
        const timer = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
        return () => clearInterval(timer);
    }, [anyRunning]);

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
                        <button role="tab" aria-selected={view === "summary"} className={view === "summary" ? "selected" : ""} onClick={() => setView("summary")}>
                            Summary{anyRunning && <Spinner size="extra-tiny" />}
                        </button>
                        <button role="tab" aria-selected={view === "credits" && kind === "FeatureDetailsPerResource"} className={view === "credits" && kind === "FeatureDetailsPerResource" ? "selected" : ""} onClick={() => { resetFilters(); setKind("FeatureDetailsPerResource"); setView("credits"); }}>
                            Agent usage{credits.agentState.status === "loading" && <Spinner size="extra-tiny" />}
                        </button>
                        <button role="tab" aria-selected={view === "credits" && kind === "BillingDetailsPerEnvironment"} className={view === "credits" && kind === "BillingDetailsPerEnvironment" ? "selected" : ""} onClick={() => { resetFilters(); setKind("BillingDetailsPerEnvironment"); setView("credits"); }}>
                            Environment capacity{credits.billingState.status === "loading" && <Spinner size="extra-tiny" />}
                        </button>
                        <button role="tab" aria-selected={view === "azure"} className={view === "azure" ? "selected" : ""} onClick={() => setView("azure")}>
                            Azure costs{azure.busy && <Spinner size="extra-tiny" />}
                        </button>
                    </nav>
                    <button className="link-button help-button" onClick={() => setHelpOpen(true)}>
                        <span aria-hidden="true">?</span> Prerequisites &amp; permissions
                    </button>
                </header>

                {(anyRunning || reportDeferred) && (
                    <div className="progress-card">
                        {anyRunning ? <Spinner size="small" /> : <span aria-hidden="true">✓</span>}
                        <strong className="progress-quip">{anyRunning ? <RotatingQuip /> : "Requests finished. Available results are ready."}</strong>
                        <span className="progress-details" role="status">
                            Elapsed {formatElapsed(elapsedSeconds)} · Credit report timeout {formatElapsed(REPORT_TIMEOUT_MS / 1000)} per report · Azure requests time out after 60s
                        </span>
                        {anyRunning && <button className="stop-button compact-stop" onClick={stopAll}>Stop all</button>}
                    </div>
                )}
                <WaitingBreak
                    waiting={anyRunning}
                    readinessMessage={readinessMessage}
                    onStart={() => setReportDeferred(true)}
                    onViewReport={() => setReportDeferred(false)}
                />

                <div className="view-panel" role="tabpanel" hidden={view !== "summary"}>
                    <SummaryDashboard
                        azure={azure}
                        credits={credits}
                        range={range}
                        onRangeChange={(next) => { setRange(next); setGranularity("Daily"); clearCredits(); azure.clearResult(); }}
                        connectionReady={connectionReady}
                        connectionName={connectionName}
                        onRefreshCredits={() => { setGranularity("Daily"); resetFilters(); }}
                        onNavigate={(target) => {
                            resetFilters();
                            if (target === "azure") setView("azure");
                            else { setKind(target === "agents" ? "FeatureDetailsPerResource" : "BillingDetailsPerEnvironment"); setView("credits"); }
                        }}
                        onAgent={(agent) => {
                            resetFilters();
                            setAgentSelection({ agentId: agent.agentId, environmentId: agent.environmentId });
                            setKind("FeatureDetailsPerResource");
                            setView("credits");
                        }}
                        elapsedSeconds={elapsedSeconds}
                        deferred={reportDeferred}
                    />
                </div>

                <div className="view-panel" role="tabpanel" hidden={view !== "credits"}>

                <section className="controls" aria-label="Report settings">
                    <label>
                        Start date (UTC)
                        <input type="date" value={range.startDate} max={utcDate(1)} disabled={anyRunning} onChange={(event) => { setRange((current) => ({ ...current, startDate: event.target.value })); clearCredits(); azure.clearResult(); }} />
                    </label>
                    <label>
                        End date (UTC)
                        <input type="date" value={range.endDate} max={utcDate(1)} disabled={anyRunning} onChange={(event) => { setRange((current) => ({ ...current, endDate: event.target.value })); clearCredits(); azure.clearResult(); }} />
                    </label>
                    <label>
                        Detail
                        <select value={granularity} disabled={anyRunning} onChange={(event) => { setGranularity(event.target.value as "Daily" | "Summary"); clearCredits(); }}>
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
                {progress && <div className="report-help" role="status">{progressDetail(progress.message)} <button className="link-button" onClick={stopReport}>Stop this report</button></div>}
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
                        {agentSelection && <div className="notice">
                            Showing the selected agent/environment: {featureRows?.find((row) => row.agentId === agentSelection.agentId && row.environmentId === agentSelection.environmentId)?.agentName || agentSelection.agentId || "Unknown agent"}.
                            {" "}<button className="link-button" onClick={() => setAgentSelection(undefined)}>Show all agents</button>
                        </div>}
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
                    <AzureCostView azure={azure} onOpenHelp={() => setHelpOpen(true)} deferred={reportDeferred} />
                </div>
                <PrerequisitesHelp
                    open={helpOpen}
                    onClose={() => setHelpOpen(false)}
                    powerPlatform={{ connection: ppConnection, reportOutcome }}
                    azure={azure}
                />
                <footer>{view !== "azure"
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
    "Your agents have been busy. Let’s see the numbers…",
    "Turning Copilot Studio activity into insights…",
    "Every agent has a story. This one comes with credits…",
    "While the reports load, your next insight is on standby…",
    "Following the trail of Copilot Credits…",
    "Agent usage, meet the bigger picture…",
];

function RotatingQuip() {
    const [quipIndex, setQuipIndex] = useState(0);

    useEffect(() => {
        const timer = window.setInterval(() => setQuipIndex((index) => (index + 1) % WAITING_QUIPS.length), 7000);
        return () => window.clearInterval(timer);
    }, []);

    return <span aria-live="polite">{WAITING_QUIPS[quipIndex]}</span>;
}

function WaitingBreak({ waiting, readinessMessage, onStart, onViewReport }: {
    waiting: boolean;
    readinessMessage?: string;
    onStart: () => void;
    onViewReport: () => void;
}) {
    const [secondsLeft, setSecondsLeft] = useState<number>();
    const [caught, setCaught] = useState(0);
    const [lost, setLost] = useState(0);
    const [played, setPlayed] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [iconPosition, setIconPosition] = useState({ left: 48, top: 8 });
    const [iconKey, setIconKey] = useState(0);
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

    const moveIcon = useCallback(() => {
        setIconPosition({ left: 8 + Math.random() * 78, top: 5 + Math.random() * 25 });
        setIconKey((key) => key + 1);
    }, []);

    useEffect(() => {
        if (!active) return;
        const timer = window.setTimeout(() => {
            if (Date.now() >= gameDeadline.current) return;
            setLost((score) => score + 1);
            moveIcon();
        }, 1450);
        return () => window.clearTimeout(timer);
    }, [active, iconKey, moveIcon]);

    const startGame = () => {
        onStart();
        setCaught(0);
        setLost(0);
        setPlayed(true);
        setDismissed(false);
        gameDeadline.current = Date.now() + 60_000;
        setSecondsLeft(60);
        moveIcon();
    };

    if (!waiting && !active && !played) return null;
    if (!waiting && !active && dismissed) return null;

    return (
        <div className="waiting-break">
            <div className="game-intro">
                <div>
                    <strong>Copilot Studio break</strong>
                    <span>Play Catch Copilot Studio while your reports load. Catch as many icons as you can in 60 seconds.</span>
                </div>
                {secondsLeft === undefined
                    ? (waiting || readinessMessage) && <button type="button" className="game-action" onClick={startGame}>{played ? "Play again" : "Start game"}</button>
                    : <div className="game-score"><span>Caught: {caught}</span><span>Lost: {lost}</span><span>{secondsLeft}s</span></div>}
            </div>
                <div className="game-ready" style={{ visibility: readinessMessage ? "visible" : "hidden" }} aria-hidden={!readinessMessage}>
                    <span role="status">{readinessMessage}{readinessMessage && active ? " Feel free to finish your game." : ""}</span>
                    <button type="button" className="game-action" onClick={() => {
                        setSecondsLeft(undefined);
                        setDismissed(true);
                        onViewReport();
                    }}>View report</button>
                </div>
            {secondsLeft !== undefined && (
                <div className="copilot-field" aria-label="Copilot Studio game area">
                    <button
                        key={iconKey}
                        type="button"
                        className="copilot-target"
                        style={{ left: `${iconPosition.left}%`, top: `${iconPosition.top}%` }}
                        aria-label="Catch the Copilot Studio icon"
                        onClick={() => {
                            if (Date.now() >= gameDeadline.current) return;
                            setCaught((score) => score + 1);
                            moveIcon();
                        }}
                    >
                        <img src={copilotStudioIcon} alt="" draggable={false} />
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
                            ? `Select the last 30 complete UTC days in Daily mode to enable the estimate (currently ${selectedDays} calendar days).`
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
