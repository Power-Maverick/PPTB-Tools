import { useEffect, useState } from "react";
import type { ServiceEndpoint } from "../models/interfaces";

interface RegisterServiceEndpointDialogProps {
    isOpen: boolean;
    isUpdate: boolean;
    isWebhook: boolean;
    existingEndpoint?: ServiceEndpoint;
    onSave: (data: Partial<ServiceEndpoint>) => Promise<void>;
    onClose: () => void;
}

const CONTRACT_OPTIONS: { value: number; label: string }[] = [
    { value: 1, label: "One Way" },
    { value: 2, label: "Queue" },
    { value: 3, label: "REST" },
    { value: 4, label: "Two Way" },
    { value: 5, label: "Topic" },
    { value: 6, label: "Persistent Queue" },
    { value: 7, label: "Event Hub" },
    { value: 8, label: "Webhook" },
    { value: 9, label: "Event Grid" },
];

const URL_CONTRACTS = [3, 8, 9];
const SERVICE_BUS_CONTRACTS = [1, 2, 4, 5, 6, 7];

function getPathLabel(contract: number): string {
    if (contract === 2 || contract === 6) return "Queue Name";
    if (contract === 5) return "Topic Name";
    if (contract === 7) return "Event Hub Name";
    return "Path";
}

function getAuthValueLabel(contract: number, authtype: number): string {
    if (contract === 8) {
        if (authtype === 1) return "Header Name & Value";
        if (authtype === 2) return "Key";
        if (authtype === 3) return "Query String";
    }
    if (authtype === 1) return "Header Name & Value";
    if (authtype === 2) return "Key";
    if (authtype === 3) return "Query String";
    return "Value";
}

export function RegisterServiceEndpointDialog({
    isOpen,
    isUpdate,
    isWebhook,
    existingEndpoint,
    onSave,
    onClose,
}: RegisterServiceEndpointDialogProps) {
    const [name, setName] = useState("");
    const [contract, setContract] = useState<number>(isWebhook ? 8 : 1);
    const [url, setUrl] = useState("");
    const [authtype, setAuthtype] = useState<number | "">("");
    const [authvalue, setAuthvalue] = useState("");
    const [messageformat, setMessageformat] = useState<number>(2);
    const [userclaim, setUserclaim] = useState<number>(isWebhook ? 1 : 0);
    const [description, setDescription] = useState("");
    const [namespaceaddress, setNamespaceaddress] = useState("");
    const [path, setPath] = useState("");
    const [saskeyname, setSaskeyname] = useState("");
    const [saskey, setSaskey] = useState("");
    const [sastoken, setSastoken] = useState("");
    const [submitError, setSubmitError] = useState("");
    const [saving, setSaving] = useState(false);

    // Reset form when dialog opens or existingEndpoint changes
    useEffect(() => {
        if (!isOpen) return;
        setSubmitError("");
        if (existingEndpoint) {
            setName(existingEndpoint.name ?? "");
            setContract(existingEndpoint.contract ?? (isWebhook ? 8 : 1));
            setUrl(existingEndpoint.url ?? "");
            setAuthtype(existingEndpoint.authtype ?? "");
            setAuthvalue(existingEndpoint.authvalue ?? "");
            setMessageformat(existingEndpoint.messageformat ?? 2);
            setUserclaim(existingEndpoint.userclaim ?? 0);
            setDescription(existingEndpoint.description ?? "");
            setNamespaceaddress(existingEndpoint.namespaceaddress ?? "");
            setPath(existingEndpoint.path ?? "");
            setSaskeyname(existingEndpoint.saskeyname ?? "");
            setSaskey(existingEndpoint.saskey ?? "");
            setSastoken(existingEndpoint.sastoken ?? "");
        } else {
            setName("");
            setContract(isWebhook ? 8 : 1);
            setUrl("");
            setAuthtype("");
            setAuthvalue("");
            setMessageformat(2);
            setUserclaim(isWebhook ? 1 : 0);
            setDescription("");
            setNamespaceaddress("");
            setPath("");
            setSaskeyname("");
            setSaskey("");
            setSastoken("");
        }
    }, [isOpen, existingEndpoint, isWebhook]);

    if (!isOpen) return null;

    const showUrlFields = URL_CONTRACTS.includes(contract);
    const showServiceBusFields = SERVICE_BUS_CONTRACTS.includes(contract);
    const authtypeNum = authtype !== "" ? Number(authtype) : null;
    const showSasKeyFields = showServiceBusFields && authtypeNum === 2;
    const showSasTokenField = showServiceBusFields && authtypeNum === 3;
    const pathLabel = getPathLabel(contract);

    const requiredFieldsMissing = !name.trim() || (showUrlFields && !url.trim());

    const handleContractChange = (val: number) => {
        setContract(val);
        setAuthtype("");
        setAuthvalue("");
        setSaskeyname("");
        setSaskey("");
        setSastoken("");
    };

    const handleAuthtypeChange = (val: number | "") => {
        setAuthtype(val);
        setAuthvalue("");
        if (showServiceBusFields) {
            setSaskeyname("");
            setSaskey("");
            setSastoken("");
        }
    };

    const handleSubmit = async () => {
        if (requiredFieldsMissing) return;
        setSaving(true);
        setSubmitError("");
        try {
            const data: Partial<ServiceEndpoint> = {
                name: name.trim(),
                contract,
                messageformat,
                userclaim,
                description: description.trim(),
            };
            if (showUrlFields) {
                if (url.trim()) data.url = url.trim();
                if (authtype !== "") data.authtype = Number(authtype);
                if (authvalue.trim()) data.authvalue = authvalue.trim();
            }
            if (showServiceBusFields) {
                if (namespaceaddress.trim()) data.namespaceaddress = namespaceaddress.trim();
                if (path.trim()) data.path = path.trim();
                if (authtype !== "") data.authtype = Number(authtype);
                if (showSasKeyFields) {
                    if (saskeyname.trim()) data.saskeyname = saskeyname.trim();
                    if (saskey.trim()) data.saskey = saskey.trim();
                }
                if (showSasTokenField) {
                    if (sastoken.trim()) data.sastoken = sastoken.trim();
                }
            }
            await onSave(data);
        } catch (err: unknown) {
            setSubmitError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    const title = isUpdate
        ? `Update ${isWebhook ? "Webhook" : "Service Endpoint"}: ${existingEndpoint?.name ?? ""}`
        : `Register New ${isWebhook ? "Webhook" : "Service Endpoint"}`;

    return (
        <div className="dialog-overlay">
            <div className="dialog">
                <div className="dialog-header">
                    <span className="dialog-title">{title}</span>
                    <button className="dialog-close" onClick={onClose}>✕</button>
                </div>
                <div className="dialog-body">
                    <div className="form-row">
                        <label className="form-label">Name *</label>
                        <input
                            className="form-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={isWebhook ? "e.g. My Webhook" : "e.g. My Service Bus"}
                        />
                    </div>
                    <div className="form-row">
                        <label className="form-label">Contract Type</label>
                        <select
                            className="form-select"
                            value={contract}
                            onChange={(e) => handleContractChange(Number(e.target.value))}
                            disabled={isWebhook}
                        >
                            {CONTRACT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* URL-based fields (Webhook, REST, Event Grid) */}
                    {showUrlFields && (
                        <>
                            <div className="form-row">
                                <label className="form-label">Endpoint URL *</label>
                                <input
                                    className="form-input"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://example.com/api/webhook"
                                />
                            </div>
                            <div className="form-row">
                                <label className="form-label">Authentication Type</label>
                                <select
                                    className="form-select"
                                    value={authtype}
                                    onChange={(e) => handleAuthtypeChange(e.target.value === "" ? "" : Number(e.target.value))}
                                >
                                    <option value="">None</option>
                                    {contract === 8 ? (
                                        <>
                                            <option value={1}>Http Header</option>
                                            <option value={2}>Webhook Key</option>
                                            <option value={3}>Http Query String</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value={1}>Http Header</option>
                                            <option value={2}>SAS Key</option>
                                            <option value={3}>Http Query String</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            {authtype !== "" && (
                                <div className="form-row">
                                    <label className="form-label">{getAuthValueLabel(contract, Number(authtype))}</label>
                                    <input
                                        className="form-input"
                                        value={authvalue}
                                        onChange={(e) => setAuthvalue(e.target.value)}
                                        placeholder="Enter value..."
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {/* Service Bus fields */}
                    {showServiceBusFields && (
                        <>
                            <div className="form-row">
                                <label className="form-label">Namespace Address</label>
                                <input
                                    className="form-input"
                                    value={namespaceaddress}
                                    onChange={(e) => setNamespaceaddress(e.target.value)}
                                    placeholder="sb://mynamespace.servicebus.windows.net/"
                                />
                            </div>
                            <div className="form-row">
                                <label className="form-label">{pathLabel}</label>
                                <input
                                    className="form-input"
                                    value={path}
                                    onChange={(e) => setPath(e.target.value)}
                                    placeholder={`e.g. my-${pathLabel.toLowerCase().replace(" name", "")}`}
                                />
                            </div>
                            <div className="form-row">
                                <label className="form-label">Authorization Type</label>
                                <select
                                    className="form-select"
                                    value={authtype}
                                    onChange={(e) => handleAuthtypeChange(e.target.value === "" ? "" : Number(e.target.value))}
                                >
                                    <option value="">None</option>
                                    <option value={2}>SAS Key</option>
                                    <option value={3}>SAS Token</option>
                                </select>
                            </div>
                            {showSasKeyFields && (
                                <>
                                    <div className="form-row">
                                        <label className="form-label">SAS Key Name</label>
                                        <input
                                            className="form-input"
                                            value={saskeyname}
                                            onChange={(e) => setSaskeyname(e.target.value)}
                                            placeholder="e.g. RootManageSharedAccessKey"
                                        />
                                    </div>
                                    <div className="form-row">
                                        <label className="form-label">SAS Key</label>
                                        <input
                                            className="form-input"
                                            type="password"
                                            value={saskey}
                                            onChange={(e) => setSaskey(e.target.value)}
                                            placeholder="Enter SAS key..."
                                        />
                                    </div>
                                </>
                            )}
                            {showSasTokenField && (
                                <div className="form-row">
                                    <label className="form-label">SAS Token</label>
                                    <textarea
                                        className="form-textarea"
                                        value={sastoken}
                                        onChange={(e) => setSastoken(e.target.value)}
                                        placeholder="SharedAccessSignature sr=..."
                                        rows={3}
                                    />
                                </div>
                            )}
                        </>
                    )}

                    <div className="form-row">
                        <label className="form-label">Message Format</label>
                        <select
                            className="form-select"
                            value={messageformat}
                            onChange={(e) => setMessageformat(Number(e.target.value))}
                        >
                            <option value={2}>JSON</option>
                            <option value={3}>XML</option>
                        </select>
                    </div>
                    <div className="form-row">
                        <label className="form-label">User Information Sent</label>
                        <select
                            className="form-select"
                            value={userclaim}
                            onChange={(e) => setUserclaim(Number(e.target.value))}
                        >
                            <option value={0}>None</option>
                            <option value={1}>User Id</option>
                            <option value={2}>Contact Id</option>
                        </select>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Description</label>
                        <textarea
                            className="form-textarea"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional description..."
                            rows={2}
                        />
                    </div>
                    {submitError && (
                        <div className="form-submit-error">{submitError}</div>
                    )}
                </div>
                <div className="dialog-footer">
                    <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={() => void handleSubmit()}
                        disabled={saving || requiredFieldsMissing}
                    >
                        {saving ? "Saving…" : isUpdate ? "Update" : "Register"}
                    </button>
                </div>
            </div>
        </div>
    );
}
