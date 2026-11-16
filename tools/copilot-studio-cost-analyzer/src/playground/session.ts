import type { InitialReportSession } from "../App";
import { buildCostQuery, type AzureCostRequest } from "../api/azureCosts";
import { parseBillingRows, parseFeatureRows, type Granularity, type ReportRange } from "../api/reports";
import { parseCostResult } from "../data/azureCostAnalysis";
import { createPlaygroundHost, sampleCosts, sampleCreditRows, sampleDates, SAMPLE_SUBSCRIPTION } from "./mockHost";

export async function createPlaygroundSession(host: ReturnType<typeof createPlaygroundHost>, now = new Date()): Promise<InitialReportSession> {
    const dates = sampleDates(now);
    const range = { startDate: dates[0], endDate: dates[dates.length - 1] };
    const agentRows = (selected: ReportRange, detail: Granularity) =>
        parseFeatureRows(sampleCreditRows("FeatureDetailsPerResource", selected, detail, now));
    const billingRows = (selected: ReportRange, detail: Granularity) =>
        parseBillingRows(sampleCreditRows("BillingDetailsPerEnvironment", selected, detail, now));
    const request: AzureCostRequest = {
        subscriptionId: SAMPLE_SUBSCRIPTION, costType: "ActualCost", period: "Last30Days",
        grouping: "Meter", scopeFilter: "powerPlatform", timePeriod: { from: range.startDate, to: range.endDate },
    };
    const rows = parseCostResult(sampleCosts(buildCostQuery(request, now), `/subscriptions/${SAMPLE_SUBSCRIPTION}`, now), "Meter");
    const connection = await host.azure.arm.authenticate();
    const subscriptions = await host.azure.arm.listSubscriptions();
    return {
        credits: {
            agents: {
                loader: async (selected, detail) => agentRows(selected, detail),
                initial: { status: "ready", rows: agentRows(range, "Daily"), range, granularity: "Daily", retrievedAt: now },
            },
            billing: {
                loader: async (selected, detail) => billingRows(selected, detail),
                initial: { status: "ready", rows: billingRows(range, "Daily"), range, granularity: "Daily", retrievedAt: now },
            },
        },
        azure: {
            connection, approved: true, subscriptions: subscriptions.data?.value ?? [], subscriptionsLoaded: true,
            subscriptionId: SAMPLE_SUBSCRIPTION, lastRequest: request,
            result: { rows, pages: 1, timePeriod: { from: range.startDate, to: range.endDate }, request, retrievedAt: now },
        },
    };
}
