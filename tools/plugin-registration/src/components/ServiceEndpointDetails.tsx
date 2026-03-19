import { useEffect, useState } from "react";
import type { ServiceEndpoint } from "../models/interfaces";
import { PropertySection } from "./PropertySection";

interface ServiceEndpointDetailsProps {
    endpoint: ServiceEndpoint;
    onUpdate: () => void;
    onUnregister: () => void;
    onRegisterStep: () => void;
    onSave: (description: string) => Promise<void>;
}

const CONTRACT_LABELS: Record<number, string> = {
    1: "One Way",
    2: "Queue",
    3: "REST",
    4: "Two Way",
    5: "Topic",
    6: "Persistent Queue",
    7: "Event Hub",
    8: "Webhook",
    9: "Event Grid",
};

const AUTH_LABELS: Record<number, string> = {
    0: "Not Specified",
    1: "ACS",
    2: "SAS Key",
    3: "SAS Token",
    4: "Webhook Key",
    5: "Http Header",
    6: "Http Query String",
    7: "Connection String",
    8: "Access Key",
    9: "Managed Identity",
};

const FORMAT_LABELS: Record<number, string> = {
    2: "JSON",
    3: "XML",
};

const USER_CLAIM_LABELS: Record<number, string> = {
    0: "None",
    1: "User Id",
    2: "Contact Id",
};

const FIELD_HINTS: Record<string, string> = {
    Description: "Description of the Service Endpoint",
    EndpointId: "Unique identifier of the Service Endpoint record",
    Name: "Name of the Service Endpoint",
    Contract: "Designation type / contract type of the endpoint",
    URL: "Endpoint URL",
    NamespaceAddress: "Azure Service Bus namespace address",
    Path: "Path, queue name, topic name, or event hub name",
    AuthType: "Authentication type used by the endpoint",
    MessageFormat: "Format of the message payload",
    UserClaim: "User information sent with the message",
    Managed: "Whether this endpoint is managed by a solution",
    CreatedOn: "Date the endpoint was created",
    ModifiedOn: "Date the endpoint was last modified",
};

const URL_CONTRACTS = [3, 8, 9];
const SERVICE_BUS_CONTRACTS = [1, 2, 4, 5, 6, 7];

export function ServiceEndpointDetails({ endpoint, onUpdate, onUnregister, onRegisterStep, onSave }: ServiceEndpointDetailsProps) {
    const [description, setDescription] = useState(endpoint.description);
    const [saving, setSaving] = useState(false);
    const [focusedField, setFocusedField] = useState<string>("Name");

    useEffect(() => {
        setDescription(endpoint.description);
    }, [endpoint.serviceendpointid, endpoint.description]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(description);
        } finally {
            setSaving(false);
        }
    };

    const showUrlFields = URL_CONTRACTS.includes(endpoint.contract);
    const showServiceBusFields = SERVICE_BUS_CONTRACTS.includes(endpoint.contract);

    return (
        <div className="details-pane">
            <PropertySection title="Editable" defaultExpanded={true}>
                <div className="prop-row">
                    <span className="prop-label">Description</span>
                    <textarea
                        className="prop-edit-textarea"
                        value={description}
                        rows={3}
                        onChange={(e) => setDescription(e.target.value)}
                        onFocus={() => setFocusedField("Description")}
                    />
                </div>
            </PropertySection>
            <PropertySection title="Information" defaultExpanded={true}>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("EndpointId")}>EndpointId</span>
                    <span className="prop-value" onClick={() => setFocusedField("EndpointId")}>{endpoint.serviceendpointid}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("Name")}>Name</span>
                    <span className="prop-value" onClick={() => setFocusedField("Name")}>{endpoint.name}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("Contract")}>Contract</span>
                    <span className="prop-value" onClick={() => setFocusedField("Contract")}>{CONTRACT_LABELS[endpoint.contract] ?? endpoint.contract}</span>
                </div>
                {showUrlFields && endpoint.url && (
                    <div className="prop-row">
                        <span className="prop-label" onClick={() => setFocusedField("URL")}>URL</span>
                        <span className="prop-value" onClick={() => setFocusedField("URL")}>{endpoint.url}</span>
                    </div>
                )}
                {showServiceBusFields && endpoint.namespaceaddress && (
                    <div className="prop-row">
                        <span className="prop-label" onClick={() => setFocusedField("NamespaceAddress")}>NamespaceAddress</span>
                        <span className="prop-value" onClick={() => setFocusedField("NamespaceAddress")}>{endpoint.namespaceaddress}</span>
                    </div>
                )}
                {showServiceBusFields && endpoint.path && (
                    <div className="prop-row">
                        <span className="prop-label" onClick={() => setFocusedField("Path")}>Path</span>
                        <span className="prop-value" onClick={() => setFocusedField("Path")}>{endpoint.path}</span>
                    </div>
                )}
                {endpoint.authtype != null && (
                    <div className="prop-row">
                        <span className="prop-label" onClick={() => setFocusedField("AuthType")}>AuthType</span>
                        <span className="prop-value" onClick={() => setFocusedField("AuthType")}>{AUTH_LABELS[endpoint.authtype] ?? endpoint.authtype}</span>
                    </div>
                )}
                {endpoint.messageformat != null && (
                    <div className="prop-row">
                        <span className="prop-label" onClick={() => setFocusedField("MessageFormat")}>MessageFormat</span>
                        <span className="prop-value" onClick={() => setFocusedField("MessageFormat")}>{FORMAT_LABELS[endpoint.messageformat] ?? endpoint.messageformat}</span>
                    </div>
                )}
                {endpoint.userclaim != null && (
                    <div className="prop-row">
                        <span className="prop-label" onClick={() => setFocusedField("UserClaim")}>UserClaim</span>
                        <span className="prop-value" onClick={() => setFocusedField("UserClaim")}>{USER_CLAIM_LABELS[endpoint.userclaim] ?? endpoint.userclaim}</span>
                    </div>
                )}
                {endpoint.ismanaged != null && (
                    <div className="prop-row">
                        <span className="prop-label" onClick={() => setFocusedField("Managed")}>Managed</span>
                        <span className="prop-value" onClick={() => setFocusedField("Managed")}>{endpoint.ismanaged ? "Yes" : "No"}</span>
                    </div>
                )}
                {endpoint.createdon && (
                    <div className="prop-row">
                        <span className="prop-label" onClick={() => setFocusedField("CreatedOn")}>CreatedOn</span>
                        <span className="prop-value" onClick={() => setFocusedField("CreatedOn")}>{endpoint.createdon}</span>
                    </div>
                )}
                {endpoint.modifiedon && (
                    <div className="prop-row">
                        <span className="prop-label" onClick={() => setFocusedField("ModifiedOn")}>ModifiedOn</span>
                        <span className="prop-value" onClick={() => setFocusedField("ModifiedOn")}>{endpoint.modifiedon}</span>
                    </div>
                )}
            </PropertySection>
            <div className="details-footer">
                <div className="field-hint">
                    <div className="field-hint-label">{focusedField}</div>
                    <div className="field-hint-desc">{FIELD_HINTS[focusedField] ?? ""}</div>
                </div>
                <div className="details-footer-actions">
                    <button className="btn-secondary" onClick={onRegisterStep}>Register Step</button>
                    <button className="btn-secondary" onClick={onUpdate}>Update</button>
                    <button className="btn-danger" onClick={onUnregister}>Unregister</button>
                    <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
