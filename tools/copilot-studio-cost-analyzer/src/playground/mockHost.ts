import { describePeriod } from "../api/azureCosts";
import type { Granularity, ReportKind, ReportRange } from "../api/reports";
import type { AzureAPI } from "../types/azureAPI";

export const SAMPLE_SUBSCRIPTION = "11111111-2222-4333-8444-555555555555";
const OTHER_SUBSCRIPTION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const weights = [26, 32, 29, 35, 31, 38, 42, 36, 34, 39, 46, 41, 37, 43, 48, 44, 39, 47, 51, 45, 49, 54, 87, 51, 46, 50, 56, 49, 53, 61];
const agentWeights = weights.map((weight, index) => index === 22 ? 150 : weight);
const agents = [
    { name: "Customer Support", id: "support", environment: "Production", total: 47447 },
    { name: "IT Helpdesk", id: "helpdesk", environment: "Production", total: 29966 },
    { name: "HR Assistant", id: "hr", environment: "Production", total: 19978 },
    { name: "Sales Copilot", id: "sales", environment: "Production", total: 14983 },
    { name: "Knowledge Assistant", id: "knowledge", environment: "Sandbox", total: 4994 },
    { name: "Onboarding Guide", id: "onboarding", environment: "Sandbox", total: 3746 },
    { name: "Operations Helper", id: "operations", environment: "Development", total: 2497 },
    { name: "Travel Assistant", id: "travel", environment: "Development", total: 1249 },
];

function allocate(total: number, parts: number[]): number[] {
    const sum = parts.reduce((value, part) => value + part, 0);
    const values = parts.map((part) => Math.floor(total * part / sum));
    values[values.length - 1] += total - values.reduce((value, part) => value + part, 0);
    return values;
}

export function sampleDates(now = new Date()): string[] {
    return weights.map((_, index) => {
        const date = new Date(now);
        date.setUTCDate(date.getUTCDate() - 30 + index);
        return date.toISOString().slice(0, 10);
    });
}

export function sampleCreditRows(kind: ReportKind, range: ReportRange, granularity: Granularity, now = new Date()): Record<string, string | number>[] {
    const dates = sampleDates(now);
    const within = (date: string) => date >= range.startDate && date <= range.endDate;
    if (kind === "FeatureDetailsPerResource") {
        const nonBilled = allocate(6240, agents.map((agent) => agent.total));
        return agents.flatMap((agent, index) => {
            const billedDays = allocate(agent.total, agentWeights);
            const nonBilledDays = allocate(nonBilled[index], weights);
            const indices = dates.map((date, day) => ({ date, day })).filter(({ date }) => within(date));
            const template = {
                "Agent Name": agent.name, "Agent Id": agent.id,
                "Environment Name": agent.environment, "Environment Id": agent.environment.toLowerCase(),
                Product: "Copilot Studio", "AI Feature/Billable Feature": index % 2 ? "Agent actions" : "Generative answers",
                Channel: index % 2 ? "Microsoft Teams" : "Web",
                "LLM Model": index % 2 ? "Sample model B" : "Sample model A",
                "Knowledge Sources": "Sample knowledge", "Tool Used": "Sample action", "Scenario Name": "Playground",
            };
            if (granularity === "Summary") return indices.length ? [{
                ...template, "Billed credit": indices.reduce((sum, { day }) => sum + billedDays[day], 0),
                "Non-billed credit": indices.reduce((sum, { day }) => sum + nonBilledDays[day], 0),
            }] : [];
            return indices.map(({ date, day }) => ({
                ...template, "Consumption Date": date, "Billed credit": billedDays[day], "Non-billed credit": nonBilledDays[day],
            }));
        });
    }
    return [
        { name: "Production", prepaid: 60000, payg: 15000 },
        { name: "Sandbox", prepaid: 20000, payg: 10000 },
        { name: "Development", prepaid: 15000, payg: 5000 },
    ].flatMap((environment) => {
        const prepaid = allocate(environment.prepaid, weights), payg = allocate(environment.payg, weights);
        const indices = dates.map((date, day) => ({ date, day })).filter(({ date }) => within(date));
        const template = {
            TenantId: "playground-tenant", EnvironmentId: environment.name.toLowerCase(), EnvironmentName: environment.name,
            EntitlementId: "sample-entitlement", BillingPolicyId: "sample-policy", EntitledQuantity: 50000,
        };
        if (granularity === "Summary") return indices.length ? [{
            ...template, PrepaidConsumedQuantity: indices.reduce((sum, { day }) => sum + prepaid[day], 0),
            PayGoConsumedQuantity: indices.reduce((sum, { day }) => sum + payg[day], 0),
        }] : [];
        return indices.map(({ date, day }) => ({ ...template, BilledDate: date, PrepaidConsumedQuantity: prepaid[day], PayGoConsumedQuantity: payg[day] }));
    });
}

export function sampleCosts(query: AzureAPI.CostQuery, scope: string, now = new Date()): AzureAPI.CostQueryResult {
    const period = query.timePeriod
        ? { from: query.timePeriod.from.slice(0, 10), to: query.timePeriod.to.slice(0, 10) }
        : describePeriod(query.timeframe === "TheLastMonth" ? "TheLastMonth" : "MonthToDate", now);
    const dates: string[] = [];
    for (let date = new Date(`${period.from}T00:00:00Z`); date.toISOString().slice(0, 10) <= period.to; date.setUTCDate(date.getUTCDate() + 1)) {
        dates.push(date.toISOString().slice(0, 10));
        if (dates.length > 366) throw new Error("Playground cost queries support at most 366 days.");
    }
    const dayWeights = dates.map((_, index) => query.type === "AmortizedCost" ? 40 : weights[index % weights.length]);
    const grouping = query.dataset.grouping?.[0]?.name;
    const meters = [
        { name: "Illustrative meter A", cents: 36144, group: "pp-production" },
        { name: "Illustrative meter B", cents: 15060, group: "pp-production" },
        { name: "Illustrative meter C", cents: 6024, group: "pp-sandbox" },
        { name: "Other meters", cents: 3012, group: "pp-development" },
        ...(!query.dataset.filter ? [{ name: "Illustrative compute", cents: 22000, group: "other-services" }] : []),
    ];
    const rows = dates.length ? meters.flatMap((meter) => {
        const amounts = allocate(Math.round(meter.cents * dates.length / 30 * (scope.endsWith(OTHER_SUBSCRIPTION) ? .5 : 1)), dayWeights);
        const group = grouping === "ResourceGroupName" ? meter.group
            : grouping === "ResourceId" ? `${scope}/resourceGroups/${meter.group}/providers/Microsoft.PowerPlatform/accounts/sample-plan`
            : grouping === "ServiceName" ? (meter.group === "other-services" ? "Sample compute" : "Sample Power Platform")
            : grouping === "MeterCategory" ? "Sample meter category" : meter.name;
        return dates.map((date, index) => [
            amounts[index] / 100, Number(date.replaceAll("-", "")), ...(grouping ? [group] : []), "USD",
        ]);
    }) : [];
    return {
        properties: {
            columns: [{ name: "PreTaxCost", type: "Number" }, { name: "UsageDate", type: "Number" },
                ...(grouping ? [{ name: grouping, type: "String" }] : []), { name: "Currency", type: "String" }],
            rows,
        },
    };
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): PowerPlatformAPI.RawResponse {
    return { status, headers, body: new TextEncoder().encode(JSON.stringify(data)) };
}

function isReportRequest(value: unknown): value is ReportRange & { granularity: Granularity } {
    return Boolean(value && typeof value === "object" && "startDate" in value && typeof value.startDate === "string"
        && "endDate" in value && typeof value.endDate === "string"
        && "granularity" in value && (value.granularity === "Daily" || value.granularity === "Summary"));
}

export function createPlaygroundHost(theme: "light" | "dark", notify: (message: string) => void, now = () => new Date()) {
    const jobs = new Map<string, Record<string, string | number>[]>();
    let jobId = 0;
    const raw: Pick<PowerPlatformAPI.RawCategoryClient, "Get" | "Post"> = {
        Post: async (path, body) => {
            const kind = path?.includes("FeatureDetailsPerResource") ? "FeatureDetailsPerResource"
                : path?.includes("BillingDetailsPerEnvironment") ? "BillingDetailsPerEnvironment" : undefined;
            if (!kind || !isReportRequest(body)) throw new Error("Unsupported playground report request.");
            const id = String(++jobId);
            jobs.set(id, sampleCreditRows(kind, body, body.granularity, now()));
            return jsonResponse({}, 202, { location: `playground/operations/${id}` });
        },
        Get: async (path) => {
            const match = /^playground\/(operations|downloads)\/(\d+)$/.exec(path ?? "");
            const rows = match && jobs.get(match[2]);
            if (!match || !rows) throw new Error("Unknown playground report operation.");
            if (match[1] === "operations") return jsonResponse({ status: "Succeeded" }, 200, { location: `playground/downloads/${match[2]}` });
            const gzip = new Blob([JSON.stringify(rows)]).stream().pipeThrough(new CompressionStream("gzip"));
            const body = new Uint8Array(await new Response(gzip).arrayBuffer());
            jobs.delete(match[2]);
            return { status: 200, headers: {}, body };
        },
    };
    const state: AzureAPI.ConnectionState = {
        configured: true, signedIn: true, status: "ready", connectionId: "playground",
        connectionName: "Sample tenant (playground)", authentication: "delegated", access: "unverified",
        tenantId: "00000000-0000-4000-8000-000000000000",
    };
    const unsupported = async (): Promise<never> => { throw new Error("This operation is not implemented by the offline playground."); };
    const azure: AzureAPI.API = {
        onConnectionChanged: () => () => undefined,
        cancelRequest: async () => undefined,
        arm: {
            getConnectionState: async () => state,
            authenticate: async () => state,
            listSubscriptions: async () => ({
                status: 200, headers: {}, data: { value: [
                    { subscriptionId: SAMPLE_SUBSCRIPTION, displayName: "Contoso production (sample)", state: "Enabled" },
                    { subscriptionId: OTHER_SUBSCRIPTION, displayName: "Contoso sandbox (sample)", state: "Enabled" },
                ] },
            }),
            queryCosts: async (scope, query) => ({ status: 200, headers: {}, data: sampleCosts(query, scope, now()) }),
            checkCostAccess: async () => ({ configured: true, signedIn: true, scopeSelected: true, costData: "accessible", checkedAt: now().toISOString() }),
            Get: unsupported,
            nextPage: unsupported,
        },
    };
    const connection: ToolBoxAPI.Connection = {
        id: "playground", name: "Sample tenant (playground)", url: "https://sample.invalid",
        environment: "Production", enabledForPowerPlatformAPI: true,
    };
    const toolbox = {
        connections: { getActiveConnection: async () => connection } satisfies Pick<ToolBoxAPI.ConnectionsAPI, "getActiveConnection">,
        utils: {
            getCurrentTheme: async () => theme,
            showNotification: async (options: ToolBoxAPI.NotificationOptions) => notify(`${options.title}: ${options.body}`),
            copyToClipboard: async (text: string) => {
                try { await navigator.clipboard.writeText(text); }
                catch (error) {
                    notify("Could not copy sample details. Clipboard access requires browser permission and a secure context.");
                    throw error;
                }
            },
        } satisfies Pick<ToolBoxAPI.UtilsAPI, "getCurrentTheme" | "showNotification" | "copyToClipboard">,
        events: { on: () => undefined, off: () => undefined } satisfies Pick<ToolBoxAPI.EventsAPI, "on" | "off">,
    };
    return { raw, azure, toolbox };
}
