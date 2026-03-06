import { useState, useEffect } from "react";
import type { PluginType, ProcessingStep, SdkMessage, SdkMessageFilter } from "../models/interfaces";
import { DataverseClient } from "../utils/DataverseClient";

interface RegisterStepDialogProps {
    isOpen: boolean;
    isUpdate: boolean;
    pluginType: PluginType;
    existingStep?: ProcessingStep;
    onRegister: (stepData: Partial<ProcessingStep> & { messageId: string; filterId?: string; pluginTypeId: string }) => Promise<void>;
    onClose: () => void;
}

const client = new DataverseClient();

export function RegisterStepDialog({
    isOpen,
    isUpdate,
    pluginType,
    existingStep,
    onRegister,
    onClose,
}: RegisterStepDialogProps) {
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
    const [saving, setSaving] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [loadingFilters, setLoadingFilters] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setLoadingMessages(true);
        client.fetchMessages()
            .then(setMessages)
            .catch(console.error)
            .finally(() => setLoadingMessages(false));
    }, [isOpen]);

    useEffect(() => {
        if (!selectedMessageId) { setFilters([]); return; }
        setLoadingFilters(true);
        setSelectedFilterId("");
        client.fetchMessageFilters(selectedMessageId)
            .then(setFilters)
            .catch(console.error)
            .finally(() => setLoadingFilters(false));
    }, [selectedMessageId]);

    // Auto-generate name
    useEffect(() => {
        if (isUpdate) return;
        const msg = messages.find((m) => m.sdkmessageid === selectedMessageId);
        const filter = filters.find((f) => f.sdkmessagefilterid === selectedFilterId);
        const entity = filter?.primaryobjecttypecode ?? "any";
        if (msg) {
            setName(`${pluginType.typename}: ${msg.name} of ${entity}`);
        }
    }, [selectedMessageId, selectedFilterId, messages, filters, pluginType.typename, isUpdate]);

    if (!isOpen) return null;

    const selectedMessage = messages.find((m) => m.sdkmessageid === selectedMessageId);

    const handleSubmit = async () => {
        if (!selectedMessageId) return;
        setSaving(true);
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
                pluginTypeId: pluginType.plugintypeid,
            });
        } finally {
            setSaving(false);
        }
    };

    const title = isUpdate ? `Update Step: ${existingStep?.name ?? ""}` : "Register New Step";

    return (
        <div className="dialog-overlay">
            <div className="dialog">
                <div className="dialog-header">
                    <span className="dialog-title">{title}</span>
                    <button className="dialog-close" onClick={onClose}>✕</button>
                </div>
                <div className="dialog-body">
                    <div className="form-row">
                        <label className="form-label">Plugin Type</label>
                        <div className="form-read-only">{pluginType.typename}</div>
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
                        <select className="form-select" value={stage} onChange={(e) => setStage(Number(e.target.value))}>
                            <option value={10}>Pre-Validation</option>
                            <option value={20}>Pre-Operation</option>
                            <option value={40}>Post-Operation</option>
                        </select>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Execution Mode</label>
                        <select className="form-select" value={mode} onChange={(e) => setMode(Number(e.target.value))}>
                            <option value={0}>Synchronous</option>
                            <option value={1}>Asynchronous</option>
                        </select>
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
                    {selectedMessage?.name === "Update" && (
                        <div className="form-row">
                            <label className="form-label">Filtering Attributes (comma-separated)</label>
                            <input
                                className="form-input"
                                value={filteringAttributes}
                                onChange={(e) => setFilteringAttributes(e.target.value)}
                                placeholder="e.g. name,description"
                            />
                        </div>
                    )}
                    {mode === 1 && (
                        <div className="form-checkbox-row">
                            <input
                                type="checkbox"
                                id="asyncAutoDelete"
                                checked={asyncAutoDelete}
                                onChange={(e) => setAsyncAutoDelete(e.target.checked)}
                            />
                            <label htmlFor="asyncAutoDelete" className="form-label" style={{ marginBottom: 0 }}>
                                Async Auto Delete
                            </label>
                        </div>
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
    );
}
