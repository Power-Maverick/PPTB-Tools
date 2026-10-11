import { classifyError } from "../host/errors";
import type { ReadOnlyDataverse } from "../host/readOnlyDataverse";
import type { ReadOnlyPowerAutomate } from "../host/readOnlyPowerPlatform";
import type { TimelineEvent, WiringHandler } from "../model/types";
import { str, truncate } from "../parse/values";
import { flowRunStatus } from "./history";

type Obj = Record<string, unknown>;

// Power Platform API (api.powerplatform.com/powerautomate). The run-history endpoint is in preview;
// responses are read defensively and any failure falls back to Dataverse flowrun + stitched links.
const API_VERSION = "2022-03-01-preview";

export async function getEnvironmentId(dv: ReadOnlyDataverse): Promise<string | undefined> {
    try {
        const result = await dv.callFunction({ name: "RetrieveCurrentOrganization", parameters: { AccessType: "Microsoft.Dynamics.CRM.EndpointAccessType'Default'" } });
        const detail = (result.Detail ?? result) as Obj;
        return str(detail.EnvironmentId);
    } catch {
        return undefined;
    }
}

export interface ApiRunsResult {
    events: TimelineEvent[];
    warning?: string;
}

export async function readFlowRunsFromApi(pa: ReadOnlyPowerAutomate, environmentId: string, flow: WiringHandler, from: Date, to: Date): Promise<ApiRunsResult> {
    try {
        const response = await pa.get(`environments/${environmentId}/flowRuns?workflowId=${flow.rawId}&api-version=${API_VERSION}`);
        const runs = Array.isArray(response.value) ? (response.value as Obj[]) : undefined;
        if (!runs) return { events: [], warning: `Power Automate API returned an unexpected response for flow '${flow.name}'.` };
        const events = runs.map((run) => mapApiRun(run, flow)).filter((e): e is TimelineEvent => !!e && new Date(e.time) >= from && new Date(e.time) <= to);
        return { events };
    } catch (error) {
        return { events: [], warning: `Couldn't read runs of '${flow.name}' from the Power Automate API: ${classifyError(error).message}` };
    }
}

/** Pure, defensive: runs may be flat or ARM-style ({ name, properties: {...} }). */
export function mapApiRun(run: Obj, flow: WiringHandler): TimelineEvent | undefined {
    const props = (run.properties && typeof run.properties === "object" ? run.properties : run) as Obj;
    const start = str(props.startTime) ?? str(props.starttime) ?? str(run.startTime) ?? str(props.createdTime);
    if (!start) return undefined;
    const runId = str(run.name) ?? str(run.id) ?? str(props.runId) ?? `${flow.rawId}-${start}`;
    const statusText = str(props.status) ?? str(run.status);
    const status = flowRunStatus(statusText);
    const errorObj = (props.error ?? props.code) as Obj | string | undefined;
    const error = typeof errorObj === "string" ? errorObj : str(errorObj?.message) ?? str(errorObj?.code);
    const trigger = (props.trigger ?? {}) as Obj;
    return {
        id: `flowrun:${runId.split("/").pop()!.toLowerCase()}`,
        source: "flowrun",
        time: start,
        endTime: str(props.endTime) ?? str(props.endtime),
        actor: { key: `flow:${flow.rawId}`, kind: "flow", name: flow.name },
        operation: `Flow run · ${flow.name}`,
        table: flow.table,
        status,
        error: status === "success" ? undefined : truncate(error, 800),
        handlerId: flow.id,
        handlerName: flow.name,
        searchText: JSON.stringify(run).toLowerCase(),
        details: [
            ["Status", statusText ?? "unknown"],
            ...(str(trigger.name) ? [["Trigger", String(trigger.name)] as [string, string]] : []),
            ["Run", runId],
            ["Source", "Power Automate API"],
        ],
        warnings: [],
    };
}
