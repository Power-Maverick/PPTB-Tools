import { useState } from "react";
import type { ProcessingStep, StepImage } from "../models/interfaces";

interface RegisterImageDialogProps {
    isOpen: boolean;
    isUpdate: boolean;
    step: ProcessingStep;
    existingImage?: StepImage;
    onRegister: (imageData: Partial<StepImage> & { stepId: string }) => Promise<void>;
    onClose: () => void;
}

export function RegisterImageDialog({
    isOpen,
    isUpdate,
    step,
    existingImage,
    onRegister,
    onClose,
}: RegisterImageDialogProps) {
    const [name, setName] = useState(existingImage?.name ?? "");
    const [entityAlias, setEntityAlias] = useState(existingImage?.entityalias ?? "");
    const [imageType, setImageType] = useState(existingImage?.imagetype ?? 0);
    const [attributes, setAttributes] = useState(existingImage?.attributes ?? "");
    const [description, setDescription] = useState(existingImage?.description ?? "");
    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!name || !entityAlias) return;
        setSaving(true);
        try {
            await onRegister({
                name,
                entityalias: entityAlias,
                imagetype: imageType,
                messagepropertyname: "Target",
                attributes,
                description,
                stepId: step.sdkmessageprocessingstepid,
            });
        } finally {
            setSaving(false);
        }
    };

    const title = isUpdate ? `Update Image: ${existingImage?.name ?? ""}` : "Register New Image";

    return (
        <div className="dialog-overlay">
            <div className="dialog">
                <div className="dialog-header">
                    <span className="dialog-title">{title}</span>
                    <button className="dialog-close" onClick={onClose}>✕</button>
                </div>
                <div className="dialog-body">
                    <div className="form-row">
                        <label className="form-label">Step</label>
                        <div className="form-read-only">{step.name}</div>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Name *</label>
                        <input
                            className="form-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. PreImage"
                        />
                    </div>
                    <div className="form-row">
                        <label className="form-label">Entity Alias *</label>
                        <input
                            className="form-input"
                            value={entityAlias}
                            onChange={(e) => setEntityAlias(e.target.value)}
                            placeholder="e.g. preImage"
                        />
                    </div>
                    <div className="form-row">
                        <label className="form-label">Image Type</label>
                        <select className="form-select" value={imageType} onChange={(e) => setImageType(Number(e.target.value))}>
                            <option value={0}>Pre Image</option>
                            <option value={1}>Post Image</option>
                            <option value={2}>Both</option>
                        </select>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Attributes (comma-separated, leave blank for all)</label>
                        <input
                            className="form-input"
                            value={attributes}
                            onChange={(e) => setAttributes(e.target.value)}
                            placeholder="e.g. name,description"
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
                </div>
                <div className="dialog-footer">
                    <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={() => void handleSubmit()}
                        disabled={saving || !name || !entityAlias}
                    >
                        {saving ? "Saving…" : isUpdate ? "Update" : "Register"}
                    </button>
                </div>
            </div>
        </div>
    );
}
