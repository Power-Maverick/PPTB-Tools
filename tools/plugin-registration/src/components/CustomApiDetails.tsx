import type { CustomApi, CustomApiField, CustomApiRequestParameter } from "../models/interfaces";
import { CUSTOM_API_BINDING_TYPES, CUSTOM_API_PARAMETER_TYPES, CUSTOM_API_STEP_TYPES } from "../models/interfaces";
import { isLocked } from "../utils/customApiRules";
import { PropertySection } from "./PropertySection";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="prop-row">
            <span className="prop-label">{label}</span>
            <span className="prop-value">{value}</span>
        </div>
    );
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");
const choice = (labels: Record<number, string>, value: number) => labels[value] ?? (value < 0 ? "(not set)" : String(value));

interface CustomApiDetailsProps {
    api: CustomApi;
    /** Set when a request parameter or response property is selected instead of the API. */
    field?: { kind: "request" | "response"; value: CustomApiField };
    /** Type name of the API's plug-in type, when known. */
    pluginTypeName?: string;
    onUpdate: () => void;
    onDelete: () => void;
}

/** Properties of a Custom API, or of one of its request parameters or response properties. */
export function CustomApiDetails({ api, field, pluginTypeName, onUpdate, onDelete }: CustomApiDetailsProps) {
    const record = field?.value ?? api;
    const managed = record.ismanaged;
    const locked = isLocked(api);

    if (field) {
        const f = field.value;
        const kindLabel = field.kind === "request" ? "Request Parameter" : "Response Property";
        return (
            <div className="details-pane">
                {managed && (
                    <div className="error-banner" style={{ marginBottom: 8, fontSize: 11 }}>
                        🔒 This {kindLabel.toLowerCase()} is part of a managed solution and can't be deleted here.
                    </div>
                )}
                <PropertySection title={kindLabel} defaultExpanded={true}>
                    <Row label="UniqueName" value={f.uniquename} />
                    <Row label="Name" value={f.name} />
                    <Row label="DisplayName" value={f.displayname} />
                    <Row label="Description" value={f.description} />
                    <Row label="Type" value={choice(CUSTOM_API_PARAMETER_TYPES, f.type)} />
                    {f.logicalentityname && <Row label="Table" value={f.logicalentityname} />}
                    {field.kind === "request" && <Row label="IsOptional" value={yesNo((f as CustomApiRequestParameter).isoptional)} />}
                    <Row label="IsManaged" value={yesNo(f.ismanaged)} />
                    <Row label="Id" value={f.id} />
                    <Row label="Custom API" value={api.uniquename} />
                </PropertySection>
                <div className="details-footer">
                    <div className="field-hint">
                        <div className="field-hint-label">{kindLabel}</div>
                        <div className="field-hint-desc">Edit it in its Custom API. Unique name, type, table and Is Optional can't change after creation.</div>
                    </div>
                    <div className="details-footer-actions">
                        <button className="btn-secondary" onClick={onUpdate}>Edit Custom API…</button>
                        <button className="btn-danger" onClick={onDelete} disabled={managed} title={managed ? "Managed records can't be deleted" : undefined}>
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="details-pane">
            {locked && (
                <div className="error-banner" style={{ marginBottom: 8, fontSize: 11 }}>
                    🔒 This Custom API is managed and doesn't allow customization. Its existing fields can't be changed, and new request parameters must be optional.
                </div>
            )}
            <PropertySection title="Custom API" defaultExpanded={true}>
                <Row label="UniqueName" value={api.uniquename} />
                <Row label="Name" value={api.name} />
                <Row label="DisplayName" value={api.displayname} />
                <Row label="Description" value={api.description} />
                <Row label="BindingType" value={choice(CUSTOM_API_BINDING_TYPES, api.bindingtype)} />
                {api.boundentitylogicalname && <Row label="BoundEntity" value={api.boundentitylogicalname} />}
                <Row label="IsFunction" value={yesNo(api.isfunction)} />
                <Row label="IsPrivate" value={yesNo(api.isprivate)} />
                <Row label="AllowedStepType" value={choice(CUSTOM_API_STEP_TYPES, api.allowedcustomprocessingsteptype)} />
                <Row label="EnabledForWorkflow" value={yesNo(api.workflowsdkstepenabled)} />
                {api.executeprivilegename && <Row label="ExecutePrivilege" value={api.executeprivilegename} />}
                <Row label="IsManaged" value={yesNo(api.ismanaged)} />
                <Row label="CustomApiId" value={api.customapiid} />
                {api.sdkmessageid && <Row label="SdkMessageId" value={api.sdkmessageid} />}
            </PropertySection>
            <PropertySection title="Plug-in Type" defaultExpanded={true}>
                <Row label="PluginType" value={api.plugintypeid ? pluginTypeName ?? api.plugintypeid : "(none)"} />
            </PropertySection>
            <PropertySection title="Contract" defaultExpanded={true}>
                <Row label="RequestParameters" value={api.requestParameters.map((p) => p.uniquename).join(", ") || "(none)"} />
                <Row label="ResponseProperties" value={api.responseProperties.map((p) => p.uniquename).join(", ") || "(none)"} />
            </PropertySection>
            <div className="details-footer">
                <div className="field-hint">
                    <div className="field-hint-label">Custom API</div>
                    <div className="field-hint-desc">
                        Steps on its message ({api.uniquename}) are listed under it. Register them from a plug-in type, like any other message.
                    </div>
                </div>
                <div className="details-footer-actions">
                    <button className="btn-secondary" onClick={onUpdate}>Update Custom API</button>
                    <button className="btn-danger" onClick={onDelete} disabled={managed} title={managed ? "Managed Custom APIs can't be deleted" : undefined}>
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
