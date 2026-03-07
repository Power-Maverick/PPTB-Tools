import { useState } from "react";
import type { ProcessingStep, StepImage } from "../models/interfaces";
import { AttributePickerDialog } from "./AttributePickerDialog";

interface RegisterImageDialogProps {
    isOpen: boolean;
    isUpdate: boolean;
    step: ProcessingStep;
    existingImage?: StepImage;
    onRegister: (imageData: Partial<StepImage> & { stepId: string }) => Promise<void>;
    onClose: () => void;
}

/** Pre Image requires: message is not "Create" */
function preImageSupported(step: ProcessingStep): boolean {
    return step.messageName !== "Create";
}

/** Post Image requires: stage is Post-Operation AND message is not "Delete" */
function postImageSupported(step: ProcessingStep): boolean {
    return step.stage === 40 && step.messageName !== "Delete";
}

function getDefaultImageType(step: ProcessingStep, existing?: number): number {
    const init = existing ?? 0;
    const preOk = preImageSupported(step);
    const postOk = postImageSupported(step);
    if (init === 0 && !preOk) {
        return postOk ? 1 : 0;
    }
    if (init === 1 && !postOk) {
        return preOk ? 0 : 1;
    }
    if (init === 2 && (!preOk || !postOk)) {
        if (preOk) return 0;
        if (postOk) return 1;
        return 0;
    }
    return init;
}

/**
 * Returns the correct messagepropertyname for a given SDK message.
 * Create uses "Id" (the newly created record's ID); all others use "Target".
 */
function getMessagePropertyName(messageName: string): string {
    return messageName === "Create" ? "Id" : "Target";
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
    const [imageType, setImageType] = useState(() => getDefaultImageType(step, existingImage?.imagetype));
    const [attributes, setAttributes] = useState(existingImage?.attributes ?? "");
    const [description, setDescription] = useState(existingImage?.description ?? "");
    const [showAttrPicker, setShowAttrPicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState("");

    if (!isOpen) return null;

    const preOk = preImageSupported(step);
    const postOk = postImageSupported(step);
    const bothOk = preOk && postOk;

    const entityName = step.primaryEntityName;
    const canBrowseAttrs = !!entityName && entityName !== "none" && entityName !== "any";

    const handleSubmit = async () => {
        if (!name || !entityAlias) return;
        setSaving(true);
        setSubmitError("");
        try {
            await onRegister({
                name,
                entityalias: entityAlias,
                imagetype: imageType,
                messagepropertyname: getMessagePropertyName(step.messageName),
                attributes,
                description,
                stepId: step.sdkmessageprocessingstepid,
            });
        } catch (err: unknown) {
            setSubmitError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    const handleAttrPickerConfirm = (attrs: string[]) => {
        setAttributes(attrs.join(","));
        setShowAttrPicker(false);
    };

    const title = isUpdate ? `Update Image: ${existingImage?.name ?? ""}` : "Register New Image";

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
                            {isUpdate ? (
                                <>
                                    <div className="form-read-only">
                                        {imageType === 0 ? "Pre Image" : imageType === 1 ? "Post Image" : "Both"}
                                    </div>
                                    <div className="form-hint">Image type cannot be changed after registration.</div>
                                </>
                            ) : (
                                <>
                                    <select
                                        className="form-select"
                                        value={imageType}
                                        onChange={(e) => setImageType(Number(e.target.value))}
                                    >
                                        <option value={0} disabled={!preOk}>
                                            Pre Image{!preOk ? " (not available)" : ""}
                                        </option>
                                        <option value={1} disabled={!postOk}>
                                            Post Image{!postOk ? " (not available)" : ""}
                                        </option>
                                        <option value={2} disabled={!bothOk}>
                                            Both{!bothOk ? " (not available)" : ""}
                                        </option>
                                    </select>
                                    {(!preOk || !postOk) && (
                                        <div className="form-hint">
                                            {!preOk && "Pre Image is not available for Create steps. "}
                                            {!postOk && step.messageName === "Delete" && "Post Image is not available for Delete steps. "}
                                            {!postOk && step.messageName !== "Delete" && "Post Image requires Post-Operation stage. "}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="form-row">
                            <label className="form-label">Attributes (blank = all)</label>
                            <div className="form-row-with-browse">
                                <input
                                    className="form-input"
                                    value={attributes}
                                    onChange={(e) => setAttributes(e.target.value)}
                                    placeholder="e.g. name,description (comma-separated)"
                                />
                                <button
                                    type="button"
                                    className="btn-browse"
                                    onClick={() => setShowAttrPicker(true)}
                                    disabled={!canBrowseAttrs}
                                    title={canBrowseAttrs ? "Browse attributes" : "No entity associated with this step"}
                                >
                                    Browse…
                                </button>
                            </div>
                        </div>
                        <div className="form-row">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-textarea"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                        {submitError && (
                            <div className="form-submit-error">{submitError}</div>
                        )}
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
            <AttributePickerDialog
                isOpen={showAttrPicker}
                entityName={entityName}
                selectedAttributes={attributes ? attributes.split(",").map((s) => s.trim()).filter(Boolean) : []}
                onConfirm={handleAttrPickerConfirm}
                onClose={() => setShowAttrPicker(false)}
            />
        </>
    );
}

