import { useState, useRef, useEffect } from "react";
import type { PluginPackage } from "../models/interfaces";

interface RegisterPackageDialogProps {
    isOpen: boolean;
    isUpdate: boolean;
    existingPackage?: PluginPackage;
    onRegister: (name: string, uniquename: string, version: string, content: string) => Promise<void>;
    onClose: () => void;
}

/** Derive a Dataverse-safe unique name from a display name (lowercase, replace spaces/hyphens with underscores). */
function deriveUniqueName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

export function RegisterPackageDialog({
    isOpen,
    isUpdate,
    existingPackage,
    onRegister,
    onClose,
}: RegisterPackageDialogProps) {
    const [name, setName] = useState(existingPackage?.name ?? "");
    const [uniquename, setUniquename] = useState(existingPackage?.uniquename ?? "");
    const [version, setVersion] = useState(existingPackage?.version ?? "1.0.0.0");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [fileError, setFileError] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        setName(existingPackage?.name ?? "");
        setUniquename(existingPackage?.uniquename ?? "");
        setVersion(existingPackage?.version ?? "1.0.0.0");
        setContent("");
        setSaving(false);
        setFileError("");
        if (fileRef.current) fileRef.current.value = "";
    }, [isOpen, existingPackage]);

    if (!isOpen) return null;

    const handleNameChange = (value: string) => {
        setName(value);
        // Auto-derive unique name only when creating and user hasn't manually edited it
        if (!isUpdate && uniquename === deriveUniqueName(name)) {
            setUniquename(deriveUniqueName(value));
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFileError("");
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith(".nupkg")) {
            setFileError("Please select a .nupkg file.");
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = ev.target?.result as string;
            // result is "data:application/zip;base64,XXXX" — strip the prefix
            const base64 = result.split(",")[1] ?? "";
            setContent(base64);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        if (!content) { setFileError("Please select a .nupkg file."); return; }
        if (!name.trim()) { setFileError("Name is required."); return; }
        if (!version.trim()) { setFileError("Version is required."); return; }
        setSaving(true);
        try {
            await onRegister(name.trim(), uniquename.trim() || deriveUniqueName(name.trim()), version.trim(), content);
        } finally {
            setSaving(false);
        }
    };

    const title = isUpdate
        ? `Update Package: ${existingPackage?.name ?? ""}`
        : "Register New Package";

    return (
        <div className="dialog-overlay">
            <div className="dialog">
                <div className="dialog-header">
                    <span className="dialog-title">{title}</span>
                    <button className="dialog-close" onClick={onClose}>✕</button>
                </div>
                <div className="dialog-body">
                    {!isUpdate && (
                        <div className="form-row">
                            <label className="form-label">Display Name *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={name}
                                onChange={(e) => handleNameChange(e.target.value)}
                                placeholder="e.g. Contoso Plugins Package"
                            />
                        </div>
                    )}
                    {isUpdate && (
                        <div className="form-row">
                            <label className="form-label">Display Name</label>
                            <span className="prop-value">{existingPackage?.name}</span>
                        </div>
                    )}
                    <div className="form-row">
                        <label className="form-label">Unique Name {isUpdate ? "" : "*"}</label>
                        {isUpdate ? (
                            <span className="prop-value" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                {existingPackage?.uniquename} <em>(read-only)</em>
                            </span>
                        ) : (
                            <input
                                type="text"
                                className="form-input"
                                value={uniquename}
                                onChange={(e) => setUniquename(e.target.value)}
                                placeholder="e.g. contoso_ContosoPluginsPackage"
                            />
                        )}
                    </div>
                    <div className="form-row">
                        <label className="form-label">Version *</label>
                        <input
                            type="text"
                            className="form-input"
                            value={version}
                            onChange={(e) => setVersion(e.target.value)}
                            placeholder="e.g. 1.0.0.0"
                        />
                    </div>
                    <div className="form-row">
                        <label className="form-label">Package File (.nupkg) *</label>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".nupkg"
                            className="form-input"
                            onChange={handleFileChange}
                        />
                        {fileError && <span style={{ color: "var(--button-danger-bg)", fontSize: 12 }}>{fileError}</span>}
                    </div>
                </div>
                <div className="dialog-footer">
                    <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={() => void handleSubmit()}
                        disabled={saving || !content}
                    >
                        {saving ? "Saving…" : isUpdate ? "Update" : "Register"}
                    </button>
                </div>
            </div>
        </div>
    );
}
