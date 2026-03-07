import { useState, useEffect, useRef } from "react";
import type { PluginType, ProcessingStep, SdkMessage, SdkMessageFilter, SystemUser } from "../models/interfaces";
import { DataverseClient } from "../utils/DataverseClient";
import { AttributePickerDialog } from "./AttributePickerDialog";
import { UserPickerDialog } from "./UserPickerDialog";

interface RegisterStepDialogProps {
    isOpen: boolean;
    isUpdate: boolean;
    pluginType: PluginType;
    existingStep?: ProcessingStep;
    onRegister: (stepData: Partial<ProcessingStep> & { messageId: string; filterId?: string; pluginTypeId: string }) => Promise<void>;
    onClose: () => void;
}

type ImpersonationMode = "calling" | "system" | "user";

/** Async mode is only allowed on Post-Operation (stage 40) */
function asyncAllowed(stage: number): boolean {
    return stage === 40;
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
    const [submitError, setSubmitError] = useState("");

    // ── Run in User's Context ──
    const [impersonationMode, setImpersonationMode] = useState<ImpersonationMode>("calling");
    const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
    const [systemUserId, setSystemUserId] = useState("");
    const [systemUserLoading, setSystemUserLoading] = useState(false);
    const [systemUserError, setSystemUserError] = useState("");
    const [showUserPicker, setShowUserPicker] = useState(false);

    const [showAttrPicker, setShowAttrPicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [loadingFilters, setLoadingFilters] = useState(false);

    // Holds the filter ID to restore after the filter list loads (used on open in update mode).
    // Initialized to "" — only set inside the isOpen effect, which always runs before the filter effect.
    const pendingFilterIdRef = useRef("");

    // Incrementing this key forces the filter-loading effect to re-run even when selectedMessageId
    // does not change (e.g. re-opening the update dialog for the same step).
    const [filterLoadKey, setFilterLoadKey] = useState(0);

    // ── Reset all form fields when the dialog opens (or existingStep changes) ──
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
        setSubmitError("");
        // Force the filter-loading effect to re-run regardless of whether selectedMessageId changed,
        // so the filter dropdown is always restored when re-opening the dialog for the same step.
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

    // Load entity filters when message changes OR when filterLoadKey increments (dialog re-opened).
    // pendingFilterIdRef carries the filter to restore; it is consumed (set to "") after use so
    // subsequent user-driven message changes start with an empty selection.
    useEffect(() => {
        if (!selectedMessageId) { setFilters([]); setSelectedFilterId(""); return; }
        setLoadingFilters(true);
        const filterToRestore = pendingFilterIdRef.current;
        pendingFilterIdRef.current = ""; // consume
        client.fetchMessageFilters(selectedMessageId)
            .then((loadedFilters) => {
                setFilters(loadedFilters);
                setSelectedFilterId(filterToRestore);
            })
            .catch(console.error)
            .finally(() => setLoadingFilters(false));
    }, [selectedMessageId, filterLoadKey]);

    // Auto-generate name (new steps only)
    useEffect(() => {
        if (isUpdate) return;
        const msg = messages.find((m) => m.sdkmessageid === selectedMessageId);
        const filter = filters.find((f) => f.sdkmessagefilterid === selectedFilterId);
        const entity = filter?.primaryobjecttypecode ?? "any";
        if (msg) {
            setName(`${pluginType.typename}: ${msg.name} of ${entity}`);
        }
    }, [selectedMessageId, selectedFilterId, messages, filters, pluginType.typename, isUpdate]);

    // Initialise Run in User's Context when dialog opens
    useEffect(() => {
        if (!isOpen) return;
        const existingId = existingStep?.impersonatinguserid;
        if (!existingId) {
            setImpersonationMode("calling");
            setSelectedUser(null);
            setSystemUserId("");
            setSystemUserError("");
            return;
        }
        setImpersonationMode("user");
        setSelectedUser({ systemuserid: existingId, fullname: "Loading…", domainname: "" });
        client.fetchSystemUserById(existingId)
            .then((user) => {
                if (!user) {
                    setSelectedUser({ systemuserid: existingId, fullname: existingId, domainname: "" });
                    return;
                }
                if (user.fullname === "SYSTEM") {
                    setImpersonationMode("system");
                    setSystemUserId(user.systemuserid);
                    setSelectedUser(null);
                } else {
                    setImpersonationMode("user");
                    setSelectedUser(user);
                }
            })
            .catch(() => {
                setSelectedUser({ systemuserid: existingId, fullname: existingId, domainname: "" });
            });
    }, [isOpen, existingStep]);

    // Fetch SYSTEM user GUID when "system" mode is selected and we don't have it yet
    useEffect(() => {
        if (impersonationMode !== "system" || systemUserId) return;
        setSystemUserLoading(true);
        setSystemUserError("");
        client.fetchSystemUserByFullName("SYSTEM")
            .then((user) => {
                if (user) {
                    setSystemUserId(user.systemuserid);
                } else {
                    setSystemUserError("SYSTEM user was not found in this environment.");
                }
            })
            .catch((err: unknown) => {
                setSystemUserError(err instanceof Error ? err.message : "Failed to load SYSTEM user.");
            })
            .finally(() => setSystemUserLoading(false));
    }, [impersonationMode, systemUserId]);

    if (!isOpen) return null;

    const selectedMessage = messages.find((m) => m.sdkmessageid === selectedMessageId);
    const selectedFilter = filters.find((f) => f.sdkmessagefilterid === selectedFilterId);
    const isUpdateMessage = selectedMessage?.name === "Update";
    const entityName = selectedFilter?.primaryobjecttypecode ?? "";
    const canBrowseAttrs = isUpdateMessage && !!entityName && entityName !== "none" && entityName !== "any";
    const asyncEnabled = asyncAllowed(stage);

    const getImpersonatingUserId = (): string | undefined => {
        if (impersonationMode === "calling") return undefined;
        if (impersonationMode === "system") return systemUserId || undefined;
        return selectedUser?.systemuserid || undefined;
    };

    const handleStageChange = (newStage: number) => {
        setStage(newStage);
        // Async mode is only valid for Post-Operation
        if (!asyncAllowed(newStage) && mode === 1) {
            setMode(0);
            setAsyncAutoDelete(false);
        }
    };

    const handleModeChange = (newMode: ImpersonationMode) => {
        setImpersonationMode(newMode);
        if (newMode === "user" && !selectedUser) {
            setShowUserPicker(true);
        }
    };

    const handleUserSelected = (user: SystemUser) => {
        setSelectedUser(user);
        setShowUserPicker(false);
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
                impersonatinguserid: getImpersonatingUserId(),
                messageId: selectedMessageId,
                filterId: selectedFilterId || undefined,
                pluginTypeId: pluginType.plugintypeid,
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

                        {/* ── Run in User's Context ── */}
                        <div className="form-row">
                            <label className="form-label">Run in User's Context</label>
                            <select
                                className="form-select"
                                value={impersonationMode}
                                onChange={(e) => handleModeChange(e.target.value as ImpersonationMode)}
                            >
                                <option value="calling">Calling User</option>
                                <option value="system">SYSTEM</option>
                                <option value="user">Select from System User…</option>
                            </select>
                        </div>
                        {impersonationMode === "system" && (
                            <div className="form-row">
                                {systemUserLoading && (
                                    <div className="form-hint">Loading SYSTEM user…</div>
                                )}
                                {systemUserError && (
                                    <div className="form-hint form-hint-error">{systemUserError}</div>
                                )}
                                {!systemUserLoading && !systemUserError && systemUserId && (
                                    <div className="user-context-display">
                                        <div className="user-context-info">
                                            <span className="user-context-name">SYSTEM</span>
                                            <span className="user-context-id">{systemUserId}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {impersonationMode === "user" && (
                            <div className="form-row">
                                {selectedUser ? (
                                    <div className="user-context-display">
                                        <div className="user-context-info">
                                            <span className="user-context-name">{selectedUser.fullname}</span>
                                            {selectedUser.domainname && (
                                                <span className="user-context-id">{selectedUser.domainname}</span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-browse"
                                            onClick={() => setShowUserPicker(true)}
                                        >
                                            Change…
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn-browse"
                                        onClick={() => setShowUserPicker(true)}
                                    >
                                        Browse…
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="form-row">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-textarea"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                        {isUpdateMessage && (
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
                                    id="asyncAutoDelete"
                                    checked={asyncAutoDelete}
                                    onChange={(e) => setAsyncAutoDelete(e.target.checked)}
                                />
                                <label htmlFor="asyncAutoDelete" className="form-label" style={{ marginBottom: 0 }}>
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
            <UserPickerDialog
                isOpen={showUserPicker}
                onSelect={handleUserSelected}
                onClose={() => {
                    setShowUserPicker(false);
                    if (!selectedUser) {
                        setImpersonationMode("calling");
                    }
                }}
            />
        </>
    );
}
