import { useEffect, useState } from "react";
import type { ManagedIdentity, ManagedIdentityInput, SolutionOption } from "../models/interfaces";
import { RECOMMENDED_MI_VERSION, SUBJECT_SCOPES } from "../models/interfaces";
import { DataverseClient } from "../utils/DataverseClient";

const client = new DataverseClient();

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

interface EditManagedIdentityDialogProps {
    isOpen: boolean;
    /** The identity to edit, or undefined to create one. */
    existing?: ManagedIdentity;
    /** Suggested name for a new identity. */
    defaultName: string;
    /** Called with the saved identity, including its id. */
    onSaved: (identity: ManagedIdentity) => void;
    onClose: () => void;
}

/**
 * Creates a managed identity, or edits an existing one, and saves it to Dataverse.
 * New identities use version 2; editing only allows upgrading the version.
 */
export function EditManagedIdentityDialog({ isOpen, existing, defaultName, onSaved, onClose }: EditManagedIdentityDialogProps) {
    const isEdit = !!existing;
    // An empty version is the original, deprecated format. Keep it until the user upgrades on purpose.
    const currentVersion = Math.min(RECOMMENDED_MI_VERSION, Math.max(0, existing?.version ?? 0));

    const [name, setName] = useState("");
    const [applicationId, setApplicationId] = useState("");
    const [tenantId, setTenantId] = useState("");
    const [subjectScope, setSubjectScope] = useState(1);
    const [version, setVersion] = useState(RECOMMENDED_MI_VERSION);
    const [solutions, setSolutions] = useState<SolutionOption[]>([]);
    const [solutionUniqueName, setSolutionUniqueName] = useState("");
    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState("");

    useEffect(() => {
        if (!isOpen) return;
        // Identities created outside the tool may have no name; suggest one so saving an edit names it.
        setName(existing?.name?.trim() || defaultName);
        setApplicationId(existing?.applicationid ?? "");
        setTenantId(existing?.tenantid ?? "");
        setSubjectScope(existing?.subjectscope ?? 1);
        setVersion(existing ? currentVersion : RECOMMENDED_MI_VERSION);
        setSolutionUniqueName("");
        setSaving(false);
        setSubmitError("");
        if (!existing) {
            client
                .fetchUnmanagedSolutions()
                .then(setSolutions)
                .catch((err: unknown) => setSubmitError(err instanceof Error ? err.message : String(err)));
        }
    }, [isOpen, existing, defaultName, currentVersion]);

    if (!isOpen) return null;

    const validate = (): string | null => {
        if (!name.trim()) return "Enter a name.";
        if (!GUID_REGEX.test(applicationId.trim()) || applicationId.trim() === EMPTY_GUID) return "The application (client) ID must be a GUID.";
        if (!GUID_REGEX.test(tenantId.trim()) || tenantId.trim() === EMPTY_GUID) return "The tenant ID must be a GUID.";
        return null;
    };

    const handleSubmit = async () => {
        const error = validate();
        if (error) {
            setSubmitError(error);
            return;
        }
        const input: ManagedIdentityInput = {
            name: name.trim(),
            applicationid: applicationId.trim(),
            tenantid: tenantId.trim(),
            subjectscope: subjectScope,
            // Leave an empty version empty when the user didn't change it.
            version: existing && existing.version == null && version === 0 ? null : version,
        };
        setSaving(true);
        setSubmitError("");
        try {
            if (existing) {
                await client.updateManagedIdentity(existing.managedidentityid, input);
                onSaved({ ...existing, ...input });
            } else {
                const id = await client.createManagedIdentity(input, solutionUniqueName || undefined);
                onSaved({ managedidentityid: id, ...input });
            }
        } catch (err: unknown) {
            setSubmitError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    const versionLocked = !isEdit || currentVersion >= RECOMMENDED_MI_VERSION;

    return (
        <div className="dialog-overlay">
            <div className="dialog">
                <div className="dialog-header">
                    <span className="dialog-title">{isEdit ? "Edit Managed Identity" : "New Managed Identity"}</span>
                    <button className="dialog-close" onClick={onClose} aria-label="Close dialog" title="Close dialog">✕</button>
                </div>
                <div className="dialog-body">
                    <div className="form-row">
                        <label className="form-label">Name *</label>
                        <input type="text" className="form-input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="form-row">
                        <label className="form-label">Application (client) ID *</label>
                        <input
                            type="text"
                            className="form-input"
                            value={applicationId}
                            onChange={(e) => setApplicationId(e.target.value)}
                            placeholder="00000000-0000-0000-0000-000000000000"
                        />
                        <div className="form-hint">The app registration or user-assigned managed identity in Entra ID.</div>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Tenant ID *</label>
                        <input
                            type="text"
                            className="form-input"
                            value={tenantId}
                            onChange={(e) => setTenantId(e.target.value)}
                            placeholder="00000000-0000-0000-0000-000000000000"
                        />
                    </div>
                    <div className="form-row">
                        <label className="form-label">Subject Scope</label>
                        <select className="form-select" value={subjectScope} onChange={(e) => setSubjectScope(Number(e.target.value))}>
                            {Object.entries(SUBJECT_SCOPES).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Version</label>
                        <input
                            type="number"
                            className="form-input"
                            value={version}
                            min={isEdit ? currentVersion : RECOMMENDED_MI_VERSION}
                            max={RECOMMENDED_MI_VERSION}
                            disabled={versionLocked}
                            onChange={(e) => {
                                const next = Number(e.target.value);
                                if (Number.isInteger(next)) setVersion(Math.min(RECOMMENDED_MI_VERSION, Math.max(currentVersion, next)));
                            }}
                        />
                        <div className="form-hint">
                            Microsoft recommends version 2 (federated credential built from the certificate DN).
                            {isEdit && !versionLocked && " You can upgrade an identity, but not downgrade it."}
                        </div>
                    </div>
                    {!isEdit && (
                        <div className="form-row">
                            <label className="form-label">Solution</label>
                            <select className="form-select" value={solutionUniqueName} onChange={(e) => setSolutionUniqueName(e.target.value)}>
                                <option value="">(None)</option>
                                {solutions.map((s) => (
                                    <option key={s.uniquename} value={s.uniquename}>
                                        {s.friendlyname}
                                    </option>
                                ))}
                            </select>
                            <div className="form-hint">Optional. Adds the new identity to this unmanaged solution.</div>
                        </div>
                    )}
                    {submitError && <div className="form-submit-error">{submitError}</div>}
                </div>
                <div className="dialog-footer">
                    <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="btn-primary" onClick={() => void handleSubmit()} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
