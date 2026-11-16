import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@fluentui/react-components";
import { isSubscriptionId, type AzureCostRequest, type AzureCostType, type AzureScopeFilter } from "../api/azureCosts";
import type { ReportRange } from "../api/reports";
import { aggregateAgents, type AgentTotal } from "../data/analysis";
import { totalsByCurrency } from "../data/azureCostAnalysis";
import { dateCoverage, dashboardRangeError } from "../data/dashboard";
import { dashboardTrend } from "../data/dashboardVisuals";
import type { ReportSnapshot } from "../data/reportTask";
import type { AzureCostActions, AzureCostState } from "../hooks/useAzureCosts";
import type { useCreditReports } from "../hooks/useCreditReports";
import { AzureSubscriptionField } from "./AzureSubscriptionField";
import { formatMoney } from "./AzureCostView";
import { ConsumptionSplit, DashboardVisuals, Sparkline } from "./DashboardVisuals";

type Destination = "agents" | "billing" | "azure";
const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
const periodLabel = (range: ReportRange) => `${range.startDate} – ${range.endDate} (UTC)`;

export function SummaryDashboard({ azure, credits, range, onRangeChange, connectionReady, connectionName,
    onRefreshCredits, onNavigate, onAgent, elapsedSeconds, deferred }: {
    azure: AzureCostState & AzureCostActions;
    credits: ReturnType<typeof useCreditReports>;
    range: ReportRange;
    onRangeChange: (range: ReportRange) => void;
    connectionReady: boolean;
    connectionName: string;
    onRefreshCredits: () => void;
    onNavigate: (target: Destination) => void;
    onAgent: (agent: AgentTotal) => void;
    elapsedSeconds: number;
    deferred: boolean;
}) {
    const [costType, setCostType] = useState<AzureCostType>("ActualCost");
    const [scopeFilter, setScopeFilter] = useState<AzureScopeFilter>("powerPlatform");
    const { agentState, billingState } = credits;
    const busy = agentState.status === "loading" || billingState.status === "loading" || Boolean(azure.busy);
    const azureReady = Boolean(azure.available && azure.approved && azure.connection?.configured && azure.connection.signedIn
        && azure.connection.status !== "interactionRequired" && isSubscriptionId(azure.subscriptionId));
    const rangeError = dashboardRangeError(range);
    const readyCount = Number(agentState.status === "ready") + Number(billingState.status === "ready") + Number(Boolean(azure.result));
    const agents = agentState.rows ?? [];
    const billing = billingState.rows ?? [];
    const costs = azure.result?.rows ?? [];
    const rankedAgents = useMemo(() => aggregateAgents(agents), [agents]);
    const currencyTotals = useMemo(() => totalsByCurrency(costs), [costs]);
    const billed = total(agents.map((row) => row.billedCredit));
    const prepaid = total(billing.map((row) => row.prepaidConsumed));
    const payg = total(billing.map((row) => row.payGoConsumed));
    const agentTrend = agentState.range && agentState.granularity === "Daily"
        ? dashboardTrend("credits", agentState.range, agents, [], [], "") : [];
    const agentCoverage = dateCoverage(agents.map((row) => row.consumptionDate));
    const billingCoverage = dateCoverage(billing.map((row) => row.billedDate));
    const azureCoverage = dateCoverage(costs.map((row) => row.date));
    const samePeriod = !azure.result || (azure.result.timePeriod.from === range.startDate && azure.result.timePeriod.to === range.endDate);
    const azureStatus = azure.busy === "costs" ? "loading" : azure.result ? "ready" : azure.error ? "error" : azure.stopped ? "stopped" : azure.busy ? "loading" : "idle";

    useEffect(() => {
        if (!azure.result) return;
        setCostType(azure.result.request.costType);
        setScopeFilter(azure.result.request.scopeFilter);
    }, [azure.result]);

    const refresh = () => {
        onRefreshCredits();
        if (connectionReady) {
            void credits.agents.run(range, "Daily");
            void credits.billing.run(range, "Daily");
        }
        azure.clearResult();
        if (azureReady) {
            const request: Omit<AzureCostRequest, "subscriptionId"> = {
                period: "Last30Days", timePeriod: { from: range.startDate, to: range.endDate },
                costType, scopeFilter, grouping: "Meter",
            };
            void azure.loadCosts(request);
        }
    };

    const retryCredit = (source: "agents" | "billing") => {
        const state = source === "agents" ? agentState : billingState;
        void credits[source].run(state.range ?? range, state.granularity ?? "Daily");
    };

    return (
        <section className="summary-dashboard" aria-label="Summary dashboard">
            <section className="controls dashboard-controls" aria-label="Dashboard settings">
                <div className="dashboard-setup">
                    <span role="status">{azureReady
                        ? "Azure is connected and a subscription is selected."
                        : azure.approved
                          ? "Select an Azure subscription to include costs."
                          : "Connect Azure and select a subscription to load all three reports."}</span>
                    {azure.available && <button className="secondary-button" disabled={busy || !azure.connection?.configured || !azure.connection.signedIn}
                        onClick={() => void azure.connect()}>{azure.busy === "authenticating" ? <><Spinner size="extra-tiny" />Connecting…</> : azure.approved ? "Reconnect Azure" : "Connect Azure"}</button>}
                </div>
                <label>Start date (UTC)
                    <input type="date" value={range.startDate} disabled={busy}
                        onChange={(event) => onRangeChange({ ...range, startDate: event.target.value })} />
                </label>
                <label>End date (UTC)
                    <input type="date" value={range.endDate} disabled={busy}
                        onChange={(event) => onRangeChange({ ...range, endDate: event.target.value })} />
                </label>
                <AzureSubscriptionField azure={azure} disabled={busy} />
                <button className="primary-button" disabled={busy || Boolean(rangeError) || (!connectionReady && !azureReady)} onClick={refresh}>
                    Refresh dashboard
                </button>
            </section>
            <details className="dashboard-advanced">
                <summary>Azure settings</summary>
                <div className="dashboard-options">
                    <label>Cost type <select value={costType} disabled={busy} onChange={(event) => setCostType(event.target.value as AzureCostType)}>
                        <option value="ActualCost">Actual</option><option value="AmortizedCost">Amortized</option>
                    </select></label>
                    <label>Costs <select value={scopeFilter} disabled={busy} onChange={(event) => setScopeFilter(event.target.value as AzureScopeFilter)}>
                        <option value="powerPlatform">Power Platform only</option><option value="all">All subscription costs</option>
                    </select></label>
                </div>
                <p>Applies on the next dashboard refresh. Azure groups by meter; more groupings are available in Azure costs.</p>
            </details>
            {rangeError && <p className="inline-warning" role="alert">{rangeError}</p>}
            {!connectionReady && <div className="notice">{connectionName}. Credit reports need a delegated Power Platform connection with an eligible tenant administrator role. Azure can load independently.</div>}
            {!azureReady && <div className="notice">Azure costs will be skipped until Azure is connected and a valid subscription is selected. Credit reports can still run.</div>}
            <div className="summary-overview-heading">
                <div><h1>Your consumption, at a glance</h1><p>Understand the trend. Find the drivers. Explore the detail.</p></div>
                <span className={`summary-readiness${readyCount === 3 ? " ready" : ""}`} role="status">
                    {busy && <Spinner size="extra-tiny" />}{readyCount} of 3 reports ready{busy && ` · ${elapsedSeconds}s`}
                </span>
            </div>
            <div className="dashboard-sources">
                <SourceCard title="Agent usage" status={agentState.status} progress={agentState.progress?.message}
                    error={agentState.error} onRetry={() => retryCredit("agents")} canRetry={connectionReady && !rangeError && agentState.status !== "loading"}
                    onOpen={() => onNavigate("agents")} coverage={agentCoverage} range={agentState.range} retrievedAt={agentState.retrievedAt}>
                    {agentState.status === "ready" && !deferred && <>
                        <Metric label="Billed credits" value={number(billed)} />
                        <Sparkline points={agentTrend} />
                        <div className="summary-kpi-footer"><span>{rankedAgents.length} agent/environment entries · tenant-wide</span><span>{number(total(agents.map((row) => row.nonBilledCredit)))} non-billed credits</span></div>
                        {!agents.length && <p>No rows returned; this does not prove zero usage.</p>}
                    </>}
                    {agentState.status === "ready" && deferred && <p>Ready. Finish your game or select View report.</p>}
                </SourceCard>
                <SourceCard title="Environment capacity" status={billingState.status} progress={billingState.progress?.message}
                    error={billingState.error} onRetry={() => retryCredit("billing")} canRetry={connectionReady && !rangeError && billingState.status !== "loading"}
                    onOpen={() => onNavigate("billing")} coverage={billingCoverage} range={billingState.range} retrievedAt={billingState.retrievedAt}>
                    {billingState.status === "ready" && !deferred && <>
                        <Metric label="Consumed credits · tenant-wide" value={number(prepaid + payg)} />
                        <ConsumptionSplit prepaid={prepaid} payg={payg} />
                        <div className="summary-kpi-footer"><span><i className="summary-key" />Prepaid {number(prepaid)}</span><span><i className="summary-key teal" />PAYG {number(payg)}</span></div>
                        {!billing.length && <p>No rows returned; this does not prove zero usage.</p>}
                    </>}
                    {billingState.status === "ready" && deferred && <p>Ready. Finish your game or select View report.</p>}
                </SourceCard>
                <SourceCard title="Azure charges" status={azureStatus} progress={azure.busy === "costs" ? `Loading costs · page ${azure.page || 1}` : azure.busy}
                    error={azure.error} onRetry={() => {
                        const request = azure.result?.request ?? azure.lastRequest;
                        if (request) void azure.loadCosts(request);
                        else onNavigate("azure");
                    }} canRetry={azureReady && !azure.busy} onOpen={() => onNavigate("azure")}
                    coverage={azureCoverage} range={azure.result ? { startDate: azure.result.timePeriod.from, endDate: azure.result.timePeriod.to } : undefined}
                    retrievedAt={azure.result?.retrievedAt}>
                    {azure.result && !deferred && <>
                        <div className="summary-currency-totals">
                            {currencyTotals.map((item) => <Metric key={item.currency} label={`Pre-tax cost (${item.currency})`} value={formatMoney(item.total, item.currency)} />)}
                        </div>
                        {currencyTotals.length === 1 && azure.result && <Sparkline teal points={dashboardTrend("azure", {
                            startDate: azure.result.timePeriod.from, endDate: azure.result.timePeriod.to,
                        }, [], [], costs, currencyTotals[0].currency)} />}
                        {currencyTotals.length > 1 && <small>Multiple currencies; totals are never combined. Choose a currency in the trend explorer.</small>}
                        {costs.length === 0 && <p>No cost rows returned. This does not prove zero spend.</p>}
                        <small>{azure.result.request.costType === "ActualCost" ? "Actual" : "Amortized"} · {azure.result.request.scopeFilter === "powerPlatform" ? "Power Platform only" : "All subscription costs"}</small>
                        <small>Subscription-level · not agent-attributed</small>
                    </>}
                    {azure.result && deferred && <p>Ready. Finish your game or select View report.</p>}
                    {!azure.result && !azure.busy && !azure.error && <p>{azureReady ? "Not loaded yet." : "Connect Azure and select a subscription, then refresh."}</p>}
                </SourceCard>
            </div>
            <p className="summary-scope-note">Credit reports are alternative tenant-wide views, not additive. Azure charges are subscription-level, not agent-attributed. Returned dates do not guarantee completeness; values may be delayed or revised.</p>
            {!samePeriod && <div className="inline-warning">Azure detail was loaded for a different period. Refresh the dashboard to align the requested dates; source coverage may still differ.</div>}
            {!deferred && <DashboardVisuals agents={agents} billing={billing} costs={costs}
                agentsReady={agentState.status === "ready"} billingReady={billingState.status === "ready"} azureReady={Boolean(azure.result)}
                agentDaily={agentState.granularity === "Daily"} billingDaily={billingState.granularity === "Daily"}
                agentRange={agentState.range} billingRange={billingState.range}
                azureRange={azure.result ? { startDate: azure.result.timePeriod.from, endDate: azure.result.timePeriod.to } : undefined}
                onAgent={onAgent} onNavigate={onNavigate} />}
        </section>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return <div className="dashboard-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function SourceCard({ title, status, progress, error, onRetry, canRetry, onOpen, children, coverage, range, retrievedAt }: {
    title: string; status: ReportSnapshot<unknown>["status"]; progress?: string; error?: string;
    onRetry: () => void; canRetry: boolean; onOpen: () => void; children: React.ReactNode;
    coverage: string; range?: ReportRange; retrievedAt?: Date;
}) {
    return <section className="dashboard-source panel" aria-label={`${title} source`}>
        <div className="panel-heading"><h2>{title}</h2><span className={`source-status ${status}`} role="status">{status === "loading" && <Spinner size="extra-tiny" />}{status === "idle" ? "Not loaded" : status === "error" ? "Failed" : status}</span></div>
        <div className="dashboard-source-body">
            {progress && <p role="status">{progress}</p>}
            {error && <p className="source-error" role="alert">{error}</p>}
            {status === "stopped" && <p>Stopped. Completed sources are retained.</p>}
            {children}
            {status === "ready" && <>
                <div className="summary-source-links">
                    <details><summary>Data coverage &amp; context</summary>
                        <small>Requested: {range ? periodLabel(range) : "Unavailable"}</small>
                        <small>Returned: {coverage}</small>
                        <small>Retrieved: {retrievedAt?.toLocaleString(undefined, { timeZone: "UTC", timeZoneName: "short" }) ?? "Unavailable"}</small>
                    </details>
                    <button className="link-button" onClick={onOpen}>View details</button>
                </div>
            </>}
            {(status === "error" || status === "stopped") && <button className="secondary-button" disabled={!canRetry} onClick={onRetry}>Retry {title.toLowerCase()}</button>}
        </div>
    </section>;
}
