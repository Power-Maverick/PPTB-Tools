import { useEffect, useState } from "react";
import type { ManagedIdentity } from "../models/interfaces";
import { SUBJECT_SCOPES } from "../models/interfaces";
import { DataverseClient } from "../utils/DataverseClient";
import { EditManagedIdentityDialog } from "./EditManagedIdentityDialog";

const client = new DataverseClient();

const DOCS_URL = "https://learn.microsoft.com/power-platform/admin/set-up-managed-identity";

/**
 * Tools run in a sandboxed iframe, so a plain link doesn't open the browser. Newer ToolBox versions
 * have utils.openInConnectionBrowser; on older ones, copy the link to the clipboard instead.
 */
async function openExternal(url: string): Promise<void> {
    const utils = window.toolboxAPI?.utils as (typeof window.toolboxAPI.utils & { openInConnectionBrowser?: (url: string) => Promise<void> }) | undefined;
    if (utils?.openInConnectionBrowser) {
        await utils.openInConnectionBrowser(url);
        return;
    }
    if (utils) {
        await utils.copyToClipboard(url);
        await utils.showNotification({ title: "Link copied", body: "Paste it into your browser to open it.", type: "info" });
    }
}

interface ManagedIdentityDialogProps {
    isOpen: boolean;
    /** Shown at the top, e.g. "Assembly: Contoso.Plugins". */
    targetLabel: string;
    /** Extra line under the target, e.g. why a package is targeted instead of the selected assembly. */
    targetNote?: string;
    /** Suggested name for a new identity. */
    defaultIdentityName: string;
    /** The identity linked today, if any. */
    currentIdentityId?: string;
    /**
     * Saves the link; null unlinks. identitiesChanged is true when identities were created, edited or
     * deleted in the dialog. The dialog stays open if this throws.
     */
    onSave: (identityId: string | null, identitiesChanged: boolean) => Promise<void>;
    /** Called when the dialog closes after identities were created, edited or deleted. */
    onIdentitiesChanged: () => void;
    onClose: () => void;
}

/**
 * Picks the managed identity of a plug-in assembly or package, and creates, edits or deletes identities.
 * The link itself is saved by the caller through onSave.
 */
export function ManagedIdentityDialog({
    isOpen,
    targetLabel,
    targetNote,
    defaultIdentityName,
    currentIdentityId,
    onSave,
    onIdentitiesChanged,
    onClose,
}: ManagedIdentityDialogProps) {
    const [identities, setIdentities] = useState<ManagedIdentity[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [changed, setChanged] = useState(false);
    const [editor, setEditor] = useState<{ existing?: ManagedIdentity } | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setIdentities([]);
        setSelectedId(currentIdentityId ?? "");
        setLoading(true);
        setLoadFailed(false);
        setSaving(false);
        setError("");
        setChanged(false);
        setEditor(null);

        const load = async () => {
            const list = await client.fetchManagedIdentities();
            // The list only has identities with credential source "managed". Keep a linked identity
            // of another kind in the list, so saving without changes doesn't unlink it.
            if (currentIdentityId && !list.some((i) => i.managedidentityid === currentIdentityId)) {
                const current = await client.fetchManagedIdentity(currentIdentityId);
                if (current) list.unshift(current);
            }
            return list;
        };
        load()
            .then((list) => {
                if (!cancelled) setIdentities(list);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setLoadFailed(true);
                setError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, currentIdentityId]);

    if (!isOpen) return null;

    const selected = identities.find((i) => i.managedidentityid === selectedId);

    const close = () => {
        if (changed) onIdentitiesChanged();
        onClose();
    };

    const handleSaved = (identity: ManagedIdentity) => {
        setIdentities((prev) => {
            const others = prev.filter((i) => i.managedidentityid !== identity.managedidentityid);
            return [...others, identity].sort((a, b) => a.name.localeCompare(b.name));
        });
        setSelectedId(identity.managedidentityid);
        setChanged(true);
        setEditor(null);
    };

    const handleDelete = async () => {
        if (!selected) return;
        if (!window.confirm(`Delete the managed identity "${selected.name}"?\n\nPlug-ins that use it will no longer be able to get tokens.`)) return;
        setError("");
        try {
            await client.deleteManagedIdentity(selected.managedidentityid);
            setIdentities((prev) => prev.filter((i) => i.managedidentityid !== selected.managedidentityid));
            setSelectedId("");
            setChanged(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError("");
        try {
            await onSave(selectedId || null, changed);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="dialog-overlay">
                <div className="dialog">
                    <div className="dialog-header">
                        <span className="dialog-title">Managed Identity</span>
                        <button className="dialog-close" onClick={close} aria-label="Close dialog" title="Close dialog">✕</button>
                    </div>
                    <div className="dialog-body">
                        <div className="form-row">
                            <strong>{targetLabel}</strong>
                            {targetNote && <div className="form-hint">{targetNote}</div>}
                        </div>
                        <div className="form-row">
                            <label className="form-label">Managed identity</label>
                            <select className="form-select" value={selectedId} disabled={loading || loadFailed} onChange={(e) => setSelectedId(e.target.value)}>
                                <option value="">{loading ? "Loading…" : "(None)"}</option>
                                {identities.map((i) => (
                                    <option key={i.managedidentityid} value={i.managedidentityid}>
                                        {i.name || i.applicationid}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-row" style={{ display: "flex", gap: 8 }}>
                            <button className="btn-secondary" disabled={loading || loadFailed} onClick={() => setEditor({})}>New…</button>
                            <button className="btn-secondary" disabled={!selected} onClick={() => setEditor({ existing: selected })}>Edit…</button>
                            <button className="btn-danger" disabled={!selected} onClick={() => void handleDelete()}>Delete</button>
                        </div>
                        <div className="form-row">
                            <label className="form-label">Details</label>
                            <div className="form-read-only" style={{ whiteSpace: "pre-line", minHeight: 64 }}>
                                {selected
                                    ? [
                                          `Application (client) ID: ${selected.applicationid}`,
                                          `Tenant ID: ${selected.tenantid}`,
                                          `Subject scope: ${SUBJECT_SCOPES[selected.subjectscope] ?? selected.subjectscope}`,
                                          `Version: ${selected.version ?? "(not set)"}`,
                                      ].join("\n")
                                    : "No managed identity. Save to unlink the current one, if any."}
                            </div>
                        </div>
                        <div className="form-hint">
                            The assembly or package must be signed with a certificate, and the app registration or managed identity in
                            Entra ID needs a matching federated credential.{" "}
                            <a
                                href={DOCS_URL}
                                onClick={(e) => {
                                    e.preventDefault();
                                    openExternal(DOCS_URL).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
                                }}
                            >
                                How to set up managed identity (Microsoft Learn)
                            </a>
                        </div>
                        {error && <div className="form-submit-error">{error}</div>}
                    </div>
                    <div className="dialog-footer">
                        <button className="btn-secondary" onClick={close} disabled={saving}>Cancel</button>
                        <button className="btn-primary" onClick={() => void handleSave()} disabled={saving || loading || loadFailed}>
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>
            </div>
            <EditManagedIdentityDialog
                isOpen={editor !== null}
                existing={editor?.existing}
                defaultName={defaultIdentityName}
                onSaved={handleSaved}
                onClose={() => setEditor(null)}
            />
        </>
    );
}
