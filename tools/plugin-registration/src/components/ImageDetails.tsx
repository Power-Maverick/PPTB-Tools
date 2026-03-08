import { useEffect, useState } from "react";
import type { StepImage } from "../models/interfaces";
import { PropertySection } from "./PropertySection";

interface ImageDetailsProps {
    image: StepImage;
    onSave: (description: string) => Promise<void>;
    onUpdate: () => void;
    onUnregister: () => void;
}

const IMAGE_TYPES: Record<number, string> = { 0: "Pre Image", 1: "Post Image", 2: "Both" };

const FIELD_HINTS: Record<string, string> = {
    Description: "Description of the step image",
    Name: "Name of the step image",
    EntityAlias: "Alias of the entity",
    ImageType: "Type of image (Pre/Post/Both)",
    MessagePropertyName: "Name of the property on the Request message",
    Attributes: "Comma-separated list of attributes to include",
};

export function ImageDetails({ image, onSave, onUpdate, onUnregister }: ImageDetailsProps) {
    const [description, setDescription] = useState(image.description);
    const [saving, setSaving] = useState(false);
    const [focusedField, setFocusedField] = useState<string>("Name");

    useEffect(() => {
        setDescription(image.description);
    }, [image.sdkmessageprocessingstepimageid, image.description]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(description);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="details-pane">
            <PropertySection title="Editable" defaultExpanded={true}>
                <div className="prop-row">
                    <span className="prop-label">Description</span>
                    <textarea
                        className="prop-edit-textarea"
                        value={description}
                        rows={3}
                        onChange={(e) => setDescription(e.target.value)}
                        onFocus={() => setFocusedField("Description")}
                    />
                </div>
            </PropertySection>
            <PropertySection title="Information" defaultExpanded={true}>
                <div className="prop-row">
                    <span className="prop-label">ImageId</span>
                    <span className="prop-value">{image.sdkmessageprocessingstepimageid}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("Name")}>Name</span>
                    <span className="prop-value" onClick={() => setFocusedField("Name")}>{image.name}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("EntityAlias")}>EntityAlias</span>
                    <span className="prop-value" onClick={() => setFocusedField("EntityAlias")}>{image.entityalias}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("ImageType")}>ImageType</span>
                    <span className="prop-value" onClick={() => setFocusedField("ImageType")}>{IMAGE_TYPES[image.imagetype] ?? image.imagetype}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("MessagePropertyName")}>MessagePropertyName</span>
                    <span className="prop-value" onClick={() => setFocusedField("MessagePropertyName")}>{image.messagepropertyname}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("Attributes")}>Attributes</span>
                    <span className="prop-value" onClick={() => setFocusedField("Attributes")}>{image.attributes || <em>All</em>}</span>
                </div>
            </PropertySection>
            <div className="details-footer">
                <div className="field-hint">
                    <div className="field-hint-label">{focusedField}</div>
                    <div className="field-hint-desc">{FIELD_HINTS[focusedField] ?? ""}</div>
                </div>
                <div className="details-footer-actions">
                    <button className="btn-secondary" onClick={onUpdate}>Update Image</button>
                    <button className="btn-danger" onClick={onUnregister}>Unregister</button>
                    <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}

