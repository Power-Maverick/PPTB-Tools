import { useState, useRef } from "react";
import type { PluginAssembly } from "../models/interfaces";

interface RegisterAssemblyDialogProps {
    isOpen: boolean;
    isUpdate: boolean;
    existingAssembly?: PluginAssembly;
    onRegister: (content: string, name: string, isolationMode: number, description: string) => Promise<void>;
    onClose: () => void;
}

export function RegisterAssemblyDialog({
    isOpen,
    isUpdate,
    existingAssembly,
    onRegister,
    onClose,
}: RegisterAssemblyDialogProps) {
    const [content, setContent] = useState("");
    const [assemblyName, setAssemblyName] = useState("");
    const [isolationMode, setIsolationMode] = useState(2);
    const [description, setDescription] = useState(existingAssembly?.description ?? "");
    const [saving, setSaving] = useState(false);
    const [fileError, setFileError] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

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
            await onRegister(content, assemblyName, isolationMode, description);
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
