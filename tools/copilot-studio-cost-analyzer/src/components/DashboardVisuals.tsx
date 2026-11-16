import { useId, useState } from "react";
import type { BillingRow, FeatureRow, ReportRange } from "../api/reports";
import { aggregateAgents, dailySeries, detectUsageSpikes, forecastMonthEnd, type AgentTotal } from "../data/analysis";
import { displayGroup, groupTotals, totalsByCurrency, type AzureCostRow } from "../data/azureCostAnalysis";
import { isLatestThirtyDays } from "../data/dashboard";
import { consumptionShare, dashboardTrend, trendDomain, trendSegments, type TrendPoint } from "../data/dashboardVisuals";
import { formatMoney } from "./AzureCostView";

const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
type Metric = "credits" | "capacity" | "azure";
const labels: Record<Metric, string[]> = { credits: ["Billed credits"], capacity: ["Prepaid credits", "PAYG credits"], azure: ["Pre-tax cost"] };

export function Sparkline({ points, teal = false }: { points: TrendPoint[]; teal?: boolean }) {
    if (!points.some((point) => point.values)) return null;
    const { min, max } = trendDomain(points);
    const x = (index: number) => 3 + index / Math.max(1, points.length - 1) * 94;
    const y = (value: number) => 35 - (value - min) / (max - min) * 30;
    return <svg className={`summary-sparkline${teal ? " teal" : ""}`} viewBox="0 0 100 40" aria-hidden="true">
        {trendSegments(points).map((segment) => <g key={segment[0].index}>
            <polyline points={segment.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} />
            {segment.length === 1 && <circle cx={x(segment[0].index)} cy={y(segment[0].value)} r="2" />}
        </g>)}
    </svg>;
}

export function ConsumptionSplit({ prepaid, payg }: { prepaid: number; payg: number }) {
    const share = consumptionShare(prepaid, prepaid + payg);
    if (share === undefined) return null;
    return <div className="consumption-split" role="img" aria-label={`${number(share)}% prepaid; ${number(100 - share)}% PAYG consumed credits`}>
        <span style={{ width: `${share}%` }} /><span style={{ width: `${100 - share}%` }} />
    </div>;
}

export function DashboardVisuals({ agents, billing, costs, agentRange, billingRange, azureRange, agentsReady, billingReady,
    azureReady, agentDaily, billingDaily, onAgent, onNavigate }: {
    agents: FeatureRow[]; billing: BillingRow[]; costs: AzureCostRow[];
    agentRange?: ReportRange; billingRange?: ReportRange; azureRange?: ReportRange;
    agentsReady: boolean; billingReady: boolean; azureReady: boolean; agentDaily: boolean; billingDaily: boolean;
    onAgent: (agent: AgentTotal) => void; onNavigate: (target: "agents" | "billing" | "azure") => void;
}) {
    const [selectedMetric, setMetric] = useState<Metric>("credits");
    const [selectedCurrency, setCurrency] = useState("");
    const currencies = totalsByCurrency(costs);
    const currency = currencies.some((item) => item.currency === selectedCurrency) ? selectedCurrency : currencies[0]?.currency ?? "";
    const available: Record<Metric, boolean> = { credits: agentsReady && agentDaily, capacity: billingReady && billingDaily, azure: azureReady };
    const metric = available[selectedMetric] ? selectedMetric : (["credits", "capacity", "azure"] as const).find((key) => available[key]);
    const range = metric === "azure" ? azureRange : metric === "capacity" ? billingRange : agentRange;
    const points = metric && range ? dashboardTrend(metric, range, agents, billing, costs, currency) : [];
    const format = (value: number) => metric === "azure" ? `${formatMoney(value, currency)} (${currency})` : number(value);
    const ranked = aggregateAgents(agents);
    const billed = agents.reduce((sum, row) => sum + row.billedCredit, 0);
    const prepaid = billing.reduce((sum, row) => sum + row.prepaidConsumed, 0);
    const payg = billing.reduce((sum, row) => sum + row.payGoConsumed, 0);
    const days = agentsReady && agentDaily && agentRange ? dailySeries(agents, agentRange.startDate, agentRange.endDate) : [];
    const spikes = detectUsageSpikes(days);
    const hasDatedAgents = agents.some((row) => row.consumptionDate);
    const forecastDate = agentRange ? new Date(`${agentRange.endDate}T00:00:00Z`) : undefined;
    const forecast = agentRange && isLatestThirtyDays(agentRange) && hasDatedAgents && forecastDate
        ? forecastMonthEnd(days, forecastDate.getUTCFullYear(), forecastDate.getUTCMonth()) : undefined;
    const concentration = consumptionShare(ranked.slice(0, 3).reduce((sum, agent) => sum + agent.billedCredit, 0), billed);
    const paygShare = consumptionShare(payg, prepaid + payg);
    const groups = groupTotals(costs).filter((group) => group.currency === currency);

    return <>
        <section className="panel summary-hero" aria-label="Consumption trend explorer">
            <div className="summary-section-heading">
                <div><h2>Consumption over time</h2><p>{metric === "azure" ? "Daily pre-tax charges in the loaded subscription" : metric === "capacity" ? "Daily consumed credits by billing model" : "Daily billed credits across your tenant"}</p></div>
                <div className="summary-chart-actions">
                    {currencies.length > 1 && <label className="summary-currency">Azure currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}>{currencies.map((item) => <option key={item.currency} value={item.currency}>{item.currency}</option>)}</select></label>}
                    <div className="summary-metric-switch" role="group" aria-label="Trend metric">
                        {(["credits", "capacity", "azure"] as const).map((key) => <button key={key} aria-pressed={metric === key} disabled={!available[key]}
                            onClick={() => setMetric(key)}>{key === "credits" ? "Billed credits" : key === "capacity" ? "Prepaid / PAYG" : "Azure cost"}</button>)}
                    </div>
                </div>
            </div>
            {metric && range ? <>
                <div className="summary-chart-legend">
                    {labels[metric].map((label, index) => <span key={label}><i className={`summary-key ${metric === "azure" || index === 1 ? "teal" : ""}`} />{label}</span>)}
                    <span>{metric === "azure" ? `${currency || "Currency unavailable"} · subscription` : "Credits · tenant-wide"}</span>
                </div>
                <TrendChart points={points} labels={labels[metric]} format={format} teal={metric === "azure"}
                    spikes={metric === "credits" ? spikes.map((spike) => spike.date) : []} />
                <div className="summary-chart-caption"><span>{range.startDate} – {range.endDate} (UTC)</span><span>Gaps mean no returned rows, not verified zero.</span></div>
                <details className="summary-values"><summary>Accessible daily values</summary>
                    <div className="table-scroll"><table><thead><tr><th>Date (UTC)</th>{labels[metric].map((label) => <th key={label}>{label}</th>)}</tr></thead>
                        <tbody>{points.map((point) => <tr key={point.date}><td>{point.date}</td>{labels[metric].map((label, index) => <td key={label}>{point.values ? format(point.values[index]) : "No rows returned"}</td>)}</tr>)}</tbody></table></div>
                </details>
            </> : <p className="summary-empty">Load a Daily report to explore trends. Summary reports remain available in the detailed views.</p>}
        </section>
        <div className="dashboard-rankings">
            <section className="panel summary-ranking">
                <div className="summary-section-heading"><div><h2>Which agents drive usage?</h2><p>Top agents by billed credits · tenant-wide</p></div></div>
                {!agentsReady ? <p className="summary-empty">Waiting for the agent usage report.</p> : !ranked.length ? <p>No agent rows returned; this does not prove zero usage.</p> :
                    ranked.slice(0, 5).map((agent, index) => <RankBar key={`${agent.agentId}|${agent.environmentId}`} index={index} label={agent.agentName || agent.agentId || "Unknown agent"}
                        context={agent.environmentName || agent.environmentId} value={agent.billedCredit} max={Math.max(1, ...ranked.map((item) => Math.abs(item.billedCredit)))}
                        formatted={number(agent.billedCredit)} share={consumptionShare(agent.billedCredit, billed)} onClick={() => onAgent(agent)} />)}
                {agentsReady && <button className="link-button" onClick={() => onNavigate("agents")}>Explore all agents and period comparison</button>}
            </section>
            <section className="panel summary-ranking azure-ranking">
                <div className="summary-section-heading"><div><h2>What contributes to Azure cost?</h2><p>Top groups · {currency || "no currency loaded"} · loaded report grouping</p></div>
                    <button className="link-button" onClick={() => onNavigate("azure")}>View details</button></div>
                {!azureReady ? <p className="summary-empty">Waiting for the Azure cost report.</p> : !groups.length ? <p>No cost groups returned; this does not prove zero spend.</p> :
                    groups.slice(0, 5).map((group, index) => <RankBar key={group.group} index={index} label={displayGroup(group.group)} context={group.group}
                        value={group.total} max={Math.max(1, ...groups.map((item) => Math.abs(item.total)))} formatted={formatMoney(group.total, currency)}
                        share={consumptionShare(group.total, currencies.find((item) => item.currency === currency)?.total ?? 0)} />)}
                <p className="summary-footnote">Azure charges cannot be mapped to individual agents. Negative amounts are credits or adjustments.</p>
            </section>
        </div>
        <section className="summary-insights" aria-label="Consumption insights">
            {agentsReady && concentration !== undefined && <Insight title={`${number(concentration)}% from the top ${Math.min(3, ranked.length)} agent ${ranked.length === 1 ? "entry" : "entries"}`} text="Share of this report's billed credits, ranked per agent and environment." />}
            {billingReady && paygShare !== undefined && <Insight title={`${number(paygShare)}% of consumed credits are PAYG`} text="A consumption split, not remaining capacity." />}
            {agentsReady && agentDaily && hasDatedAgents && <Insight title={days.length < 8 ? "Spike detection unavailable" : `${spikes.length} potential daily usage ${spikes.length === 1 ? "spike" : "spikes"}`}
                text={days.length < 8 ? "At least eight daily dates are needed for spike detection." : "Above twice the prior seven-day average. Missing dates count as zero in this indicator."} />}
            {agentsReady && <Insight title={forecast === undefined ? "Monthly estimate unavailable" : `${number(forecast)} estimated monthly billed credits`}
                text={forecast === undefined ? "Requires Daily usage for the latest 30 complete UTC days." : "Last 30-day daily average × days in the end-date month. Missing days count as zero; not an actual MTD forecast."} />}
        </section>
    </>;
}

function Insight({ title, text }: { title: string; text: string }) {
    return <article className="summary-insight"><strong>{title}</strong><p>{text}</p></article>;
}

function RankBar({ index, label, context, value, max, formatted, share, onClick }: {
    index: number; label: string; context: string; value: number; max: number; formatted: string; share?: number; onClick?: () => void;
}) {
    return <div className="summary-rank-row">
        <span className="summary-rank-index">{String(index + 1).padStart(2, "0")}</span>
        <div className="summary-rank-main">
            <div className="summary-rank-label"><div title={`${label} · ${context}`}>{onClick
                ? <button className="link-button" onClick={onClick}>{label}</button> : <span>{label}</span>}</div><span>{share === undefined ? "—" : `${number(share)}%`}</span></div>
            {onClick && <small className="summary-rank-context">{context || "Unknown environment"}</small>}
            <div className="summary-rank-track" aria-hidden="true"><div className={value < 0 ? "negative" : ""} style={{ width: `${Math.min(100, Math.abs(value) / max * 100)}%` }} /></div>
        </div><strong>{formatted}</strong>
    </div>;
}

export function TrendChart({ points, labels: seriesLabels, format, teal = false, spikes = [] }: {
    points: TrendPoint[]; labels: string[]; format: (value: number) => string; teal?: boolean; spikes?: string[];
}) {
    const id = useId();
    const [activeDate, setActiveDate] = useState<string>();
    const active = points.find((point) => point.date === activeDate);
    const { min, max } = trendDomain(points);
    const x = (index: number) => points.length === 1 ? 582 : 92 + index / Math.max(1, points.length - 1) * 980;
    const y = (value: number) => 182 - (value - min) / (max - min) * 146;
    const stacked = seriesLabels.length === 2;
    const detail = (point: TrendPoint) => `${point.date}: ${point.values ? point.values.map((value, index) => `${seriesLabels[index]} ${format(value)}`).join("; ") : "No rows returned"}${spikes.includes(point.date) ? " · Potential spike" : ""}`;
    return <div className={`summary-trend-chart${teal ? " teal" : ""}`}>
        <svg viewBox="0 0 1120 218" role="group" aria-label="Daily trend. Focus a day for exact values; a table follows.">
            <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop stopColor="currentColor" stopOpacity=".17" /><stop offset="1" stopColor="currentColor" stopOpacity=".01" /></linearGradient></defs>
            {[0, 1, 2, 3, 4].map((tick) => {
                const value = min + (max - min) * tick / 4;
                return <g key={tick}><line x1="80" x2="1095" y1={y(value)} y2={y(value)} className="summary-gridline" />
                    <text x="72" y={y(value) + 3} textAnchor="end" className="summary-axis">{new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text></g>;
            })}
            <line x1="80" x2="1095" y1={y(0)} y2={y(0)} className="summary-baseline" />
            {!stacked && trendSegments(points).map((segment) => <g key={segment[0].index}>
                <polygon points={`${x(segment[0].index)},${y(0)} ${segment.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} ${x(segment.at(-1)!.index)},${y(0)}`} fill={`url(#${id})`} />
                <polyline points={segment.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} className="summary-line" />
                {segment.map((point) => <circle key={point.index} cx={x(point.index)} cy={y(point.value)} r={spikes.includes(points[point.index].date) ? 4 : 2}
                    className={spikes.includes(points[point.index].date) ? "summary-spike" : "summary-point"} />)}
            </g>)}
            {stacked && points.map((point, index) => {
                let positive = 0, negative = 0;
                return point.values?.map((value, part) => {
                    const start = value >= 0 ? positive : negative;
                    if (value >= 0) positive += value; else negative += value;
                    return <rect key={`${point.date}-${part}`} x={x(index) - Math.min(11, 350 / points.length)} y={Math.min(y(start), y(start + value))}
                        width={Math.min(22, 700 / points.length)} height={Math.abs(y(start + value) - y(start))} className={part === 1 ? "summary-stack-payg" : "summary-stack-prepaid"} />;
                });
            })}
            {points.map((point, index) => <g key={point.date}>
                {(index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 6)) === 0) && <text x={x(index)} y="207" textAnchor="middle" className="summary-axis">
                    {new Date(`${point.date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</text>}
                <rect x={Math.max(80, x(index) - 490 / Math.max(1, points.length - 1))} y="16"
                    width={Math.min(1095, x(index) + 490 / Math.max(1, points.length - 1)) - Math.max(80, x(index) - 490 / Math.max(1, points.length - 1))} height="170"
                    className="summary-chart-hit" tabIndex={0} role="img" aria-label={detail(point)}
                    onFocus={() => setActiveDate(point.date)} onBlur={() => setActiveDate(undefined)}
                    onMouseEnter={() => setActiveDate(point.date)} onMouseLeave={() => setActiveDate(undefined)}>
                    <title>{detail(point)}</title>
                </rect>
            </g>)}
        </svg>
        <div className="summary-trend-detail" aria-live="polite">{active ? detail(active) : "Hover or focus a day for exact values. Outlined points mark potential usage spikes."}</div>
    </div>;
}
