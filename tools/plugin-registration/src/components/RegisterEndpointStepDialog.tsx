import { useState, useEffect, useRef } from "react";
import type { ServiceEndpoint, ProcessingStep, SdkMessage, SdkMessageFilter } from "../models/interfaces";
import { DataverseClient } from "../utils/DataverseClient";
import { AttributePickerDialog } from "./AttributePickerDialog";

interface RegisterEndpointStepDialogProps {
    isOpen: boolean;
    isUpdate: boolean;
    endpoint: ServiceEndpoint;
    existingStep?: ProcessingStep;
    onRegister: (stepData: {
        name: string;
        description?: string;
        rank?: number;
        mode?: number;
        stage?: number;
        filteringattributes?: string;
        asyncautodelete?: boolean;
        messageId: string;
        filterId?: string;
        endpointId: string;
        configuration?: string;
        supporteddeployment?: number;
    }) => Promise<void>;
    onClose: () => void;
}

/** Async mode is only allowed on Post-Operation (stage 40) */
function asyncAllowed(stage: number): boolean {
    return stage === 40;
}

const client = new DataverseClient();

export function RegisterEndpointStepDialog({
    isOpen,
    isUpdate,
    endpoint,
    existingStep,
    onRegister,
    onClose,
}: RegisterEndpointStepDialogProps) {
    const [messages, setMessages] = useState<SdkMessage[]>([]);
    const [filters, setFilters] = useState<SdkMessageFilter[]>([]);
    const [selectedMessageId, setSelectedMessageId] = useState(existingStep?.sdkmessageid ?? "");
    const [selectedFilterId, setSelectedFilterId] = useState(existingStep?.sdkmessagefilterid ?? "");
    const [name, setName] = useState(existingStep?.name ?? "");
    const [stage, setStage] = useState(existingStep?.stage ?? 40);
    const [mode, setMode] = useState(existingStep?.mode ?? 0);
    const [rank, setRank] = useState(existingStep?.rank ?? 1);
    const [description, setDescription] = useState(existingStep?.description ?? "");
    const [filteringAttributes, setFilteringAttributes] = useState(existingStep?.filteringattributes ?? "");
    const [asyncAutoDelete, setAsyncAutoDelete] = useState(existingStep?.asyncautodelete ?? false);
    const [configuration, setUnsecureconfig] = useState(existingStep?.configuration ?? "");
    const [supporteddeployment, setSupporteddeployment] = useState(existingStep?.supporteddeployment ?? 0);
    const [submitError, setSubmitError] = useState("");
    const [showAttrPicker, setShowAttrPicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [loadingFilters, setLoadingFilters] = useState(false);

    const pendingFilterIdRef = useRef("");
    const [filterLoadKey, setFilterLoadKey] = useState(0);

    // Reset form when dialog opens or existingStep changes
    useEffect(() => {
        if (!isOpen) return;
        pendingFilterIdRef.current = existingStep?.sdkmessagefilterid ?? "";
        setSelectedMessageId(existingStep?.sdkmessageid ?? "");
        setName(existingStep?.name ?? "");
        setStage(existingStep?.stage ?? 40);
        setMode(existingStep?.mode ?? 0);
        setRank(existingStep?.rank ?? 1);
        setDescription(existingStep?.description ?? "");
        setFilteringAttributes(existingStep?.filteringattributes ?? "");
        setAsyncAutoDelete(existingStep?.asyncautodelete ?? false);
        setUnsecureconfig(existingStep?.configuration ?? "");
        setSupporteddeployment(existingStep?.supporteddeployment ?? 0);
        setSubmitError("");
        setFilterLoadKey((k) => k + 1);
    }, [isOpen, existingStep]);

    // Load messages on open
    useEffect(() => {
        if (!isOpen) return;
        setLoadingMessages(true);
        client.fetchMessages()
            .then(setMessages)
            .catch(console.error)
            .finally(() => setLoadingMessages(false));
    }, [isOpen]);

    // Load filters when message changes
    useEffect(() => {
        if (!selectedMessageId) { setFilters([]); setSelectedFilterId(""); return; }
        setLoadingFilters(true);
        const filterToRestore = pendingFilterIdRef.current;
        pendingFilterIdRef.current = "";
        client.fetchMessageFilters(selectedMessageId)
            .then((loadedFilters) => {
                setFilters(loadedFilters);
                setSelectedFilterId(filterToRestore);
            })
            .catch(console.error)
            .finally(() => setLoadingFilters(false));
    }, [selectedMessageId, filterLoadKey]);

    // Auto-generate step name (new steps only)
    useEffect(() => {
        if (isUpdate) return;
        const msg = messages.find((m) => m.sdkmessageid === selectedMessageId);
        const filter = filters.find((f) => f.sdkmessagefilterid === selectedFilterId);
        const entity = filter?.primaryobjecttypecode ?? "any";
        if (msg) {
            setName(`${endpoint.name}: ${msg.name} of ${entity}`);
        }
    }, [selectedMessageId, selectedFilterId, messages, filters, endpoint.name, isUpdate]);

    if (!isOpen) return null;

    const selectedMessage = messages.find((m) => m.sdkmessageid === selectedMessageId);
    const selectedFilter = filters.find((f) => f.sdkmessagefilterid === selectedFilterId);
    const isUpdateMessage = selectedMessage?.name === "Update";
    const entityName = selectedFilter?.primaryobjecttypecode ?? "";
    const canBrowseAttrs = isUpdateMessage && !!entityName && entityName !== "none" && entityName !== "any";
    const asyncEnabled = asyncAllowed(stage);

    const handleStageChange = (newStage: number) => {
        setStage(newStage);
        if (!asyncAllowed(newStage) && mode === 1) {
            setMode(0);
            setAsyncAutoDelete(false);
        }
    };

    const handleSubmit = async () => {
        if (!selectedMessageId) return;
        setSaving(true);
        setSubmitError("");
        try {
            await onRegister({
                name,
                description,
                rank,
                mode,
                stage,
                filteringattributes: filteringAttributes,
                asyncautodelete: asyncAutoDelete,
                messageId: selectedMessageId,
                filterId: selectedFilterId || undefined,
                endpointId: endpoint.serviceendpointid,
                configuration: configuration || undefined,
                supporteddeployment,
            });
        } catch (err: unknown) {
            setSubmitError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    const handleAttrPickerConfirm = (attrs: string[]) => {
        setFilteringAttributes(attrs.join(","));
        setShowAttrPicker(false);
    };

    const title = isUpdate ? `Update Step: ${existingStep?.name ?? ""}` : "Register New Step";

    return (
        <>
            <div className="dialog-overlay">
                <div className="dialog">
                    <div className="dialog-header">
                        <span className="dialog-title">{title}</span>
                        <button className="dialog-close" onClick={onClose}>✕</button>
                    </div>
                    <div className="dialog-body">
                        <div className="form-row">
                            <label className="form-label">Service Endpoint</label>
                            <div className="form-read-only">{endpoint.name}</div>
                        </div>
                        <div className="form-row">
                            <label className="form-label">Message *</label>
                            {loadingMessages ? (
                                <div className="form-read-only">Loading messages…</div>
                            ) : (
                                <select
                                    className="form-select"
                                    value={selectedMessageId}
                                    onChange={(e) => setSelectedMessageId(e.target.value)}
                                >
                                    <option value="">— Select Message —</option>
                                    {messages.map((m) => (
                                        <option key={m.sdkmessageid} value={m.sdkmessageid}>{m.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div className="form-row">
                            <label className="form-label">Primary Entity</label>
                            {loadingFilters ? (
                                <div className="form-read-only">Loading entities…</div>
                            ) : (
                                <select
                                    className="form-select"
                                    value={selectedFilterId}
                                    onChange={(e) => setSelectedFilterId(e.target.value)}
                                    disabled={!selectedMessageId}
                                >
                                    <option value="">None (Global)</option>
                                    {filters.map((f) => (
                                        <option key={f.sdkmessagefilterid} value={f.sdkmessagefilterid}>
                                            {f.primaryobjecttypecode}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div className="form-row">
                            <label className="form-label">Name *</label>
                            <input
                                className="form-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="form-row">
                            <label className="form-label">Stage</label>
                            <select className="form-select" value={stage} onChange={(e) => handleStageChange(Number(e.target.value))}>
                                <option value={10}>Pre-Validation</option>
                                <option value={20}>Pre-Operation</option>
                                <option value={40}>Post-Operation</option>
                            </select>
                        </div>
                        <div className="form-row">
                            <label className="form-label">Execution Mode</label>
                            <select className="form-select" value={mode} onChange={(e) => setMode(Number(e.target.value))}>
                                <option value={0}>Synchronous</option>
                                <option value={1} disabled={!asyncEnabled}>
                                    Asynchronous{!asyncEnabled ? " (Post-Operation only)" : ""}
                                </option>
                            </select>
                            {!asyncEnabled && (
                                <div className="form-hint">Asynchronous execution is only available for Post-Operation steps.</div>
                            )}
                        </div>
                        <div className="form-row">
                            <label className="form-label">Rank</label>
                            <input
                                type="number"
                                className="form-input"
                                value={rank}
                                min={1}
                                onChange={(e) => setRank(Number(e.target.value))}
                            />
                        </div>
                        <div className="form-row">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-textarea"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                        <div className="form-row">
                            <label className="form-label">Unsecure Configuration</label>
                            <textarea
                                className="form-textarea"
                                value={configuration}
                                onChange={(e) => setUnsecureconfig(e.target.value)}
                                placeholder="Optional unsecure configuration..."
                            />
                        </div>
                        <div className="form-row">
                            <label className="form-label">Supported Deployment</label>
                            <select className="form-select" value={supporteddeployment} onChange={(e) => setSupporteddeployment(Number(e.target.value))}>
                                <option value={0}>Server Only</option>
                                <option value={1}>Outlook Only</option>
                                <option value={2}>Both</option>
                            </select>
                        </div>
                        {(isUpdateMessage || isUpdate) && (
                            <div className="form-row">
                                <label className="form-label">Filtering Attributes</label>
                                <div className="form-row-with-browse">
                                    <input
                                        className="form-input"
                                        value={filteringAttributes}
                                        onChange={(e) => setFilteringAttributes(e.target.value)}
                                        placeholder="e.g. name,description (comma-separated)"
                                    />
                                    <button
                                        type="button"
                                        className="btn-browse"
                                        onClick={() => setShowAttrPicker(true)}
                                        disabled={!canBrowseAttrs}
                                        title={canBrowseAttrs ? "Browse attributes" : "Select a Primary Entity to browse attributes"}
                                    >
                                        Browse…
                                    </button>
                                </div>
                                {!canBrowseAttrs && selectedMessageId && (
                                    <div className="form-hint">Select a Primary Entity to browse and pick attributes.</div>
                                )}
                            </div>
                        )}
                        {mode === 1 && (
                            <div className="form-checkbox-row">
                                <input
                                    type="checkbox"
                                    id="epAsyncAutoDelete"
                                    checked={asyncAutoDelete}
                                    onChange={(e) => setAsyncAutoDelete(e.target.checked)}
                                />
                                <label htmlFor="epAsyncAutoDelete" className="form-label" style={{ marginBottom: 0 }}>
                                    Async Auto Delete
                                </label>
                            </div>
                        )}
                        {submitError && (
                            <div className="form-submit-error">{submitError}</div>
                        )}
                    </div>
                    <div className="dialog-footer">
                        <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                        <button
                            className="btn-primary"
                            onClick={() => void handleSubmit()}
                            disabled={saving || !selectedMessageId || !name}
                        >
                            {saving ? "Saving…" : isUpdate ? "Update" : "Register"}
                        </button>
                    </div>
                </div>
            </div>
            <AttributePickerDialog
                isOpen={showAttrPicker}
                entityName={entityName}
                selectedAttributes={filteringAttributes ? filteringAttributes.split(",").map((s) => s.trim()).filter(Boolean) : []}
                onConfirm={handleAttrPickerConfirm}
                onClose={() => setShowAttrPicker(false)}
            />
        </>
    );
}
