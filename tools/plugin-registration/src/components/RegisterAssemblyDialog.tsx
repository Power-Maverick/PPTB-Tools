import { useState, useRef, useEffect } from "react";
import type { PluginAssembly, PluginPackage } from "../models/interfaces";

interface RegisterAssemblyDialogProps {
    isOpen: boolean;
    isUpdate: boolean;
    existingAssembly?: PluginAssembly;
    packages?: PluginPackage[];
    onCreatePackage?: () => void;
    onRegister: (content: string, name: string, isolationMode: number, description: string, packageId?: string) => Promise<void>;
    onClose: () => void;
}

const DEFAULT_ISOLATION_MODE = 2; // Sandbox

export function RegisterAssemblyDialog({
    isOpen,
    isUpdate,
    existingAssembly,
    packages = [],
    onCreatePackage,
    onRegister,
    onClose,
}: RegisterAssemblyDialogProps) {
    const [content, setContent] = useState("");
    const [assemblyName, setAssemblyName] = useState("");
    const [isolationMode, setIsolationMode] = useState(DEFAULT_ISOLATION_MODE);
    const [description, setDescription] = useState(existingAssembly?.description ?? "");
    const [packageId, setPackageId] = useState(existingAssembly?._packageid_value ?? "");
    const [saving, setSaving] = useState(false);
    const [fileError, setFileError] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    // Reset form state whenever the dialog opens or the target assembly changes
    useEffect(() => {
        if (!isOpen) return;
        setContent("");
        setAssemblyName("");
        setIsolationMode(DEFAULT_ISOLATION_MODE);
        setDescription(existingAssembly?.description ?? "");
        setPackageId(existingAssembly?._packageid_value ?? "");
        setSaving(false);
        setFileError("");
        if (fileRef.current) fileRef.current.value = "";
    }, [isOpen, existingAssembly]);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFileError("");
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.endsWith(".dll")) {
            setFileError("Please select a .dll file.");
            return;
        }
        const name = file.name.replace(/\.dll$/i, "");
        setAssemblyName(name);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = ev.target?.result as string;
            // result is like "data:application/octet-stream;base64,XXXX"
            const base64 = result.split(",")[1] ?? "";
            setContent(base64);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        if (!content) { setFileError("Please select a .dll file."); return; }
        setSaving(true);
        try {
            await onRegister(content, assemblyName, isolationMode, description, packageId || undefined);
        } finally {
            setSaving(false);
        }
    };

    const title = isUpdate ? `Update Assembly: ${existingAssembly?.name ?? ""}` : "Register New Assembly";

    return (
        <div className="dialog-overlay">
            <div className="dialog">
                <div className="dialog-header">
                    <span className="dialog-title">{title}</span>
                    <button className="dialog-close" onClick={onClose}>✕</button>
                </div>
                <div className="dialog-body">
                    <div className="form-row">
                        <label className="form-label">Assembly File (.dll) *</label>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".dll"
                            className="form-input"
                            onChange={handleFileChange}
                        />
                        {fileError && <span style={{ color: "var(--button-danger-bg)", fontSize: 12 }}>{fileError}</span>}
                    </div>
                    {!isUpdate && (
                        <div className="form-row">
                            <label className="form-label">Isolation Mode</label>
                            <select
                                className="form-select"
                                value={isolationMode}
                                onChange={(e) => setIsolationMode(Number(e.target.value))}
                            >
                                <option value={2}>Sandbox</option>
                                <option value={1}>None</option>
                            </select>
                        </div>
                    )}
                    <div className="form-row">
                        <label className="form-label">Description</label>
                        <textarea
                            className="form-textarea"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional description"
                        />
                    </div>
                    {packages.length > 0 && (
                        <div className="form-row">
                            <label className="form-label">Package Assignment</label>
                            <select
                                className="form-select"
                                value={packageId}
                                onChange={(e) => setPackageId(e.target.value)}
                            >
                                <option value="">Standalone (no package)</option>
                                {packages
                                    .filter((p) => !p.ismanaged)
                                    .map((p) => (
                                        <option key={p.pluginpackageid} value={p.pluginpackageid}>
                                            {p.name} ({p.version})
                                        </option>
                                    ))}
                            </select>
                            {onCreatePackage && (
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ marginTop: 4, fontSize: 11 }}
                                    onClick={onCreatePackage}
                                >
                                    + Create New Package…
                                </button>
                            )}
                            {isUpdate && existingAssembly?._packageid_value && (
                                <span style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                                    Currently in package: {packages.find((p) => p.pluginpackageid === existingAssembly._packageid_value)?.name ?? existingAssembly._packageid_value}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <div className="dialog-footer">
                    <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="btn-primary" onClick={() => void handleSubmit()} disabled={saving || !content}>
                        {saving ? "Saving…" : isUpdate ? "Update" : "Register"}
                    </button>
                </div>
            </div>
        </div>
    );
}
