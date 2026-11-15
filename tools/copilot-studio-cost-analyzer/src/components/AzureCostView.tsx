import { useMemo, useState } from "react";
import { Spinner } from "@fluentui/react-components";
import { describePeriod, isSubscriptionId, type AzureCostType, type AzureGrouping, type AzurePeriod, type AzureScopeFilter } from "../api/azureCosts";
import { dailyCostSeries, displayGroup, groupTotals, totalsByCurrency, type CostDay } from "../data/azureCostAnalysis";
import { downloadCsv } from "../data/export";
import type { AzureCostActions, AzureCostState } from "../hooks/useAzureCosts";

const PERIOD_LABELS: Record<AzurePeriod, string> = {
    MonthToDate: "Month to date",
    TheLastMonth: "Last calendar month",
    Last30Days: "Last 30 complete UTC days",
};

const GROUPING_LABELS: Record<AzureGrouping, string> = {
    Meter: "Meter",
    MeterCategory: "Meter category",
    ServiceName: "Service",
    ResourceId: "Billing plan resource",
    ResourceGroupName: "Resource group",
    None: "No grouping",
};

export function formatMoney(value: number, currency: string): string {
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
    } catch {
        return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} ${currency}`;
    }
}

function formatDay(value: string): string {
    return value ? new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC" }) : "—";
}

export function AzureCostView({ azure, onOpenHelp }: { azure: AzureCostState & AzureCostActions; onOpenHelp: () => void }) {
    const [costType, setCostType] = useState<AzureCostType>("ActualCost");
    const [period, setPeriod] = useState<AzurePeriod>("MonthToDate");
    const [grouping, setGrouping] = useState<AzureGrouping>("Meter");
    const [scopeFilter, setScopeFilter] = useState<AzureScopeFilter>("powerPlatform");
    const [manualEntry, setManualEntry] = useState(false);
    const [chartCurrency, setChartCurrency] = useState("");

    const rows = useMemo(() => azure.result?.rows ?? [], [azure.result]);
    const currencies = useMemo(() => totalsByCurrency(rows), [rows]);
    const groups = useMemo(() => groupTotals(rows), [rows]);
    const selectedCurrency = currencies.some((total) => total.currency === chartCurrency) ? chartCurrency : currencies[0]?.currency ?? "";
    const days = useMemo(() => dailyCostSeries(rows, selectedCurrency), [rows, selectedCurrency]);
    const busy = Boolean(azure.busy);
    const connectionReady = azure.connection?.configured && azure.connection.signedIn && azure.connection.status !== "interactionRequired";
    const validSubscription = isSubscriptionId(azure.subscriptionId);
    const selectedSubscription = azure.subscriptions.find((subscription) => subscription.subscriptionId === azure.subscriptionId);
    const showManualEntry = manualEntry;
    const result = azure.result;
    const resultGroupLabel = result ? GROUPING_LABELS[result.request.grouping] : "";

    const exportRows = () => {
        if (!result) return;
        try {
            downloadCsv(
                `azure-costs-${result.request.subscriptionId}-${result.timePeriod.from}-to-${result.timePeriod.to}.csv`,
                ["Date (UTC)", resultGroupLabel, "Cost", "Currency", "Cost type"],
                rows.map((row) => [row.date, row.group, row.cost, row.currency, result.request.costType === "ActualCost" ? "Actual" : "Amortized"]),
            );
        } catch (reason) {
            console.error("Could not export Azure costs.", reason);
        }
    };

    if (!azure.available) {
        return (
            <section className="azure-view">
                <div className="notice" role="status">
                    This PPTB version doesn't provide Azure API support. Update Power Platform ToolBox to a build with Azure Resource Manager support to view Azure costs. Copilot Credit reports remain available.
                </div>
            </section>
        );
    }

    return (
        <section className="azure-view">
            <div className="notice">
                Azure costs are monetary charges billed to Azure, such as Power Platform pay-as-you-go billing plans. They're separate from Copilot Credits, may include other meters, and aren't attributed to individual agents.
            </div>

            <div className="azure-connection">
                <div>
                    <strong>{azure.connection ? azure.connection.connectionName : "Azure connection"}</strong>
                    <span>{connectionSummary(azure)}</span>
                </div>
                <div className="azure-connection-actions">
                    <button className={azure.approved ? "secondary-button" : "primary-button"} disabled={busy || !connectionReady} onClick={() => void azure.connect()}>
                        {azure.busy === "authenticating" ? <><Spinner size="tiny" />Connecting…</> : azure.approved ? "Reconnect Azure" : "Connect Azure"}
                    </button>
                </div>
            </div>

            <section className="controls azure-controls" aria-label="Azure cost settings">
                <div className="azure-subscription">
                    <span className="label-row">
                        <label htmlFor="azure-subscription">Subscription</label>
                        <button type="button" className="link-button" disabled={busy} onClick={() => setManualEntry((value) => !value)}>
                            {showManualEntry ? "Choose from list" : "Enter ID"}
                        </button>
                    </span>
                    {showManualEntry ? (
                        <input
                            id="azure-subscription"
                            value={azure.subscriptionId}
                            disabled={busy}
                            placeholder="00000000-0000-0000-0000-000000000000"
                            aria-invalid={Boolean(azure.subscriptionId) && !validSubscription}
                            onChange={(event) => azure.setSubscriptionId(event.target.value)}
                        />
                    ) : (
                        <select id="azure-subscription" value={azure.subscriptionId} disabled={busy || azure.subscriptions.length === 0} onChange={(event) => azure.setSubscriptionId(event.target.value)}>
                            <option value="">{azure.busy === "subscriptions" ? "Loading subscriptions…" : azure.subscriptionsLoaded ? azure.subscriptions.length > 0 ? "Select a subscription" : "No subscriptions found; enter an ID" : "Connect Azure to list subscriptions"}</option>
                            {azure.subscriptions.map((subscription) => (
                                <option key={subscription.subscriptionId} value={subscription.subscriptionId}>
                                    {subscription.displayName || subscription.subscriptionId}{subscription.state && subscription.state !== "Enabled" ? ` (${subscription.state})` : ""}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
                <label>
                    Costs
                    <select value={scopeFilter} disabled={busy} onChange={(event) => setScopeFilter(event.target.value as AzureScopeFilter)}>
                        <option value="powerPlatform">Power Platform only</option>
                        <option value="all">All costs</option>
                    </select>
                </label>
                <label>
                    Cost type
                    <select value={costType} disabled={busy} onChange={(event) => setCostType(event.target.value as AzureCostType)}>
                        <option value="ActualCost">Actual</option>
                        <option value="AmortizedCost">Amortized</option>
                    </select>
                </label>
                <label>
                    Period
                    <select value={period} disabled={busy} onChange={(event) => setPeriod(event.target.value as AzurePeriod)}>
                        {(Object.keys(PERIOD_LABELS) as AzurePeriod[]).map((value) => <option key={value} value={value}>{PERIOD_LABELS[value]}</option>)}
                    </select>
                </label>
                <label>
                    Group by
                    <select value={grouping} disabled={busy} onChange={(event) => setGrouping(event.target.value as AzureGrouping)}>
                        {(Object.keys(GROUPING_LABELS) as AzureGrouping[]).map((value) => <option key={value} value={value}>{GROUPING_LABELS[value]}</option>)}
                    </select>
                </label>
                {azure.busy === "costs" || azure.busy === "access" ? (
                    <button className="stop-button" onClick={azure.stop}>Stop</button>
                ) : (
                    <button
                        className="primary-button"
                        disabled={busy || !connectionReady || !validSubscription}
                        onClick={() => void azure.loadCosts({ costType, period, grouping, scopeFilter })}
                    >
                        {azure.error && !busy ? "Try again" : "Load costs"}
                    </button>
                )}
            </section>
            <div className="report-help">
                {PERIOD_LABELS[period]}: {formatDay(describePeriod(period).from)} – {formatDay(describePeriod(period).to)} (UTC).{" "}
                {scopeFilter === "powerPlatform"
                    ? "Filters to Microsoft.PowerPlatform/accounts resources created by pay-as-you-go billing plans linked to this subscription."
                    : "Includes every charge in the subscription, not only Power Platform."}
                {" "}Requires Cost Management Reader (or equivalent) on the subscription.
            </div>
            {azure.subscriptionId && !validSubscription && <p className="inline-warning" role="alert">Enter a valid subscription ID (GUID).</p>}

            {azure.busy && azure.busy !== "authenticating" && (
                <div className="azure-progress" role="status">
                    <Spinner size="tiny" />
                    {azure.busy === "costs" ? `Loading Azure costs${azure.page > 1 ? ` · page ${azure.page}` : ""}…`
                        : azure.busy === "access" ? "Checking cost access…" : "Loading subscriptions…"}
                </div>
            )}
            {azure.stopped && <div className="stopped" role="status">Azure request stopped. Partial results were discarded.</div>}
            {azure.error && (
                <div className="error" role="alert">
                    <strong>Azure request didn't complete.</strong>
                    <span>{azure.error}</span>
                    <button type="button" className="link-button error-link" onClick={onOpenHelp}>Review prerequisites and admin details</button>
                </div>
            )}

            {result && (
                <section className="results">
                    <section className="coverage-panel" aria-label="Azure cost coverage">
                        <div><span>Subscription</span><strong title={result.request.subscriptionId}>{selectedSubscription?.displayName || result.request.subscriptionId}</strong></div>
                        <div><span>Period (UTC)</span><strong>{formatDay(result.timePeriod.from)} – {formatDay(result.timePeriod.to)}</strong></div>
                        <div><span>Cost type · scope</span><strong>{result.request.costType === "ActualCost" ? "Actual" : "Amortized"} · {result.request.scopeFilter === "powerPlatform" ? "Power Platform" : "All costs"}</strong></div>
                        <div><span>Retrieved (UTC)</span><strong>{result.retrievedAt.toLocaleString(undefined, { timeZone: "UTC", timeZoneName: "short" })}</strong></div>
                        <p>Pre-tax costs from Azure Cost Management. Current-period values update as usage is processed and aren't final invoice amounts.</p>
                    </section>

                    {rows.length === 0 ? (
                        <div className="notice" role="status">
                            No cost rows were returned for this subscription, scope, and period. This doesn't confirm zero spend: billing plans may be linked to another subscription, or data may not be processed yet.
                            {result.request.scopeFilter === "powerPlatform" && " Try All costs to confirm the subscription has visible charges."}
                        </div>
                    ) : (
                        <>
                            {currencies.length > 1 && (
                                <div className="inline-warning azure-currency-warning" role="status">Multiple currencies were returned. Totals are shown separately and never combined.</div>
                            )}
                            <div className="stats">
                                {currencies.map((total) => (
                                    <div className="stat" key={total.currency}>
                                        <span>Total ({total.currency})</span>
                                        <strong>{formatMoney(total.total, total.currency)}</strong>
                                    </div>
                                ))}
                                <div className="stat"><span>{resultGroupLabel} items</span><strong>{new Set(groups.map((group) => group.group)).size}</strong></div>
                                <div className="stat"><span>Days with cost</span><strong>{new Set(rows.filter((row) => row.date).map((row) => row.date)).size}</strong></div>
                            </div>
                            <AzureDailyChart days={days} currency={selectedCurrency} currencies={currencies.map((total) => total.currency)} onCurrencyChange={setChartCurrency} />
                            <section className="panel">
                                <div className="panel-heading">
                                    <div><h2>Costs by {resultGroupLabel.toLowerCase()}</h2><p>Share is relative to the total in the same currency.</p></div>
                                    <button className="secondary-button" onClick={exportRows}>Export CSV</button>
                                </div>
                                <div className="table-scroll">
                                    <table>
                                        <thead><tr><th>{resultGroupLabel}</th><th>Currency</th><th>Share</th><th>Cost</th></tr></thead>
                                        <tbody>
                                            {groups.map((group) => (
                                                <tr key={`${group.currency}-${group.group}`}>
                                                    <td title={group.group}>{displayGroup(group.group)}</td>
                                                    <td>{group.currency}</td>
                                                    <td>{new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(group.share)}</td>
                                                    <td>{formatMoney(group.total, group.currency)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </>
                    )}
                </section>
            )}

            {!result && !busy && !azure.error && (
                <section className="empty-state">
                    <div className="empty-icon">$</div>
                    <h2>See what Azure billed</h2>
                    <p>Connect Azure, choose the subscription linked to your Power Platform billing plan, and load costs. Nothing to download or import.</p>
                </section>
            )}
        </section>
    );
}

function connectionSummary(azure: AzureCostState): string {
    if (azure.connectionError) return azure.connectionError;
    const connection = azure.connection;
    if (!connection) return "Checking Azure Resource Manager access…";
    if (!connection.configured) return "Azure Resource Manager API isn't enabled on this connection. Edit the connection in PPTB to enable it.";
    if (!connection.signedIn || connection.status === "notConnected") return "Connection isn't signed in. Reconnect it in PPTB.";
    if (connection.status === "interactionRequired") return "Sign-in required. Select Connect Azure.";
    const identity = connection.displayName || connection.accountId;
    const mode = connection.authentication === "application" ? "application identity" : "delegated user";
    return `${identity ? `${identity} · ` : ""}${mode} · ${azure.approved ? "approved for this session" : "approval needed"}`;
}

function AzureDailyChart({ days, currency, currencies, onCurrencyChange }: {
    days: CostDay[];
    currency: string;
    currencies: string[];
    onCurrencyChange: (currency: string) => void;
}) {
    const max = Math.max(...days.map((day) => day.total), 0.01);
    return (
        <section className="panel chart-panel">
            <div className="panel-heading">
                <div><h2>Daily cost</h2><p>Usage date in UTC, pre-tax.</p></div>
                {currencies.length > 1 && (
                    <select className="chart-currency" aria-label="Chart currency" value={currency} onChange={(event) => onCurrencyChange(event.target.value)}>
                        {currencies.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                )}
            </div>
            <div className="chart" role="img" aria-label={`Daily Azure cost in ${currency}`}>
                {days.map((day) => (
                    <div className="chart-column" key={day.date} title={`${formatDay(day.date)}: ${formatMoney(day.total, currency)}`}>
                        <span className="bar-value">{formatMoney(day.total, currency)}</span>
                        <div className="bar-track"><div className="bar" style={{ height: `${Math.max((day.total / max) * 100, day.total > 0 ? 2 : 0)}%` }} /></div>
                        <span className="bar-label">{day.date.slice(5)}</span>
                    </div>
                ))}
                {days.length === 0 && <p className="empty">No daily values to chart.</p>}
            </div>
        </section>
    );
}
