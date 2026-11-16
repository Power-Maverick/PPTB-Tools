import { useEffect, useState, useSyncExternalStore } from "react";
import { loadReport, type FeatureRow, type BillingRow } from "../api/reports";
import { ReportTask, type ReportLoader, type ReportSnapshot } from "../data/reportTask";

export interface CreditReportSession {
    agents: { loader: ReportLoader<FeatureRow>; initial: ReportSnapshot<FeatureRow> };
    billing: { loader: ReportLoader<BillingRow>; initial: ReportSnapshot<BillingRow> };
}

export function useCreditReports(session?: CreditReportSession) {
    const [agents] = useState(() => new ReportTask(session?.agents.loader ?? ((...args) => loadReport("FeatureDetailsPerResource", ...args)), session?.agents.initial));
    const [billing] = useState(() => new ReportTask(session?.billing.loader ?? ((...args) => loadReport("BillingDetailsPerEnvironment", ...args)), session?.billing.initial));
    const agentState = useSyncExternalStore(agents.subscribe, agents.getSnapshot);
    const billingState = useSyncExternalStore(billing.subscribe, billing.getSnapshot);

    useEffect(() => () => {
        agents.stop();
        billing.stop();
    }, [agents, billing]);

    return { agents, billing, agentState, billingState };
}
