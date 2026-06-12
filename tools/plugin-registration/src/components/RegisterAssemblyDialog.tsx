import { useState, useRef, useEffect } from "react";
import type { PluginAssembly } from "../models/interfaces";

interface RegisterAssemblyDialogProps {
    isOpen: boolean;
    isUpdate: boolean;
    existingAssembly?: PluginAssembly;
    onRegister: (content: string, name: string, isolationMode: number, description: string) => Promise<void>;
    onClose: () => void;
}

const DEFAULT_ISOLATION_MODE = 2; // Sandbox

export function RegisterAssemblyDialog({
    isOpen,
    isUpdate,
    existingAssembly,
    onRegister,
    onClose,
}: RegisterAssemblyDialogProps) {
    const [content, setContent] = useState("");
    const [assemblyName, setAssemblyName] = useState("");
    const [isolationMode, setIsolationMode] = useState(DEFAULT_ISOLATION_MODE);
    const [description, setDescription] = useState(existingAssembly?.description ?? "");
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
        setSaving(false);
        setFileError("");
        if (fileRef.current) fileRef.current.value = "";
    }, [isOpen, existingAssembly]);

    if (!isOpen) return null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setFileError("");
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.endsWith(".dll")) {
            setFileError("Please select a .dll file.");
            return;
        }
        const name = file.name.replace(/\.dll$/i, "");
        setAssemblyName(name);
        try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]!);
            }
            setContent(btoa(binary));
        } catch {
            setFileError("Failed to read the file.");
        }
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
