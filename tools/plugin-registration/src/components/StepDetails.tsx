import { useEffect, useState } from "react";
import type { ProcessingStep } from "../models/interfaces";
import { PropertySection } from "./PropertySection";

interface StepDetailsProps {
    step: ProcessingStep;
    onSave: (description: string) => Promise<void>;
    onRegisterImage: () => void;
    onEnable: () => void;
    onDisable: () => void;
    onUnregister: () => void;
    onUpdate: () => void;
}

const STAGES: Record<number, string> = { 10: "Pre-Validation", 20: "Pre-Operation", 40: "Post-Operation" };
const MODES: Record<number, string> = { 0: "Synchronous", 1: "Asynchronous" };

const FIELD_HINTS: Record<string, string> = {
    Description: "Description of the processing step",
    Name: "Name of the SDK Message Processing Step",
    Message: "SDK message that triggers this step",
    PrimaryEntity: "Primary entity for this step",
    Stage: "Stage in the execution pipeline",
    Mode: "Execution mode of the step",
    Rank: "Order of execution relative to other steps",
    FilteringAttributes: "Comma-separated attributes that trigger the step",
    Status: "Whether this step is enabled or disabled",
};

export function StepDetails({ step, onSave, onRegisterImage, onEnable, onDisable, onUnregister, onUpdate }: StepDetailsProps) {
    const [description, setDescription] = useState(step.description);
    const [saving, setSaving] = useState(false);
    const [focusedField, setFocusedField] = useState<string>("Name");
    const isEnabled = step.statecode === 0;

    useEffect(() => {
        setDescription(step.description);
    }, [step.sdkmessageprocessingstepid, step.description]);

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
                    <span className="prop-label" onClick={() => setFocusedField("Name")}>StepId</span>
                    <span className="prop-value" onClick={() => setFocusedField("Name")}>{step.sdkmessageprocessingstepid}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("Name")}>Name</span>
                    <span className="prop-value" onClick={() => setFocusedField("Name")}>{step.name}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("Message")}>Message</span>
                    <span className="prop-value" onClick={() => setFocusedField("Message")}>{step.messageName}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("PrimaryEntity")}>PrimaryEntity</span>
                    <span className="prop-value" onClick={() => setFocusedField("PrimaryEntity")}>{step.primaryEntityName || "none"}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("Stage")}>Stage</span>
                    <span className="prop-value" onClick={() => setFocusedField("Stage")}>{STAGES[step.stage] ?? step.stage}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("Mode")}>Mode</span>
                    <span className="prop-value" onClick={() => setFocusedField("Mode")}>{MODES[step.mode] ?? step.mode}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("Rank")}>Rank</span>
                    <span className="prop-value" onClick={() => setFocusedField("Rank")}>{step.rank}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label" onClick={() => setFocusedField("Status")}>Status</span>
                    <span className="prop-value" onClick={() => setFocusedField("Status")}>
                        <span className={`badge ${isEnabled ? "badge-success" : "badge-danger"}`}>
                            {isEnabled ? "Enabled" : "Disabled"}
                        </span>
                    </span>
                </div>
                {step.filteringattributes && (
                    <div className="prop-row">
                        <span className="prop-label" onClick={() => setFocusedField("FilteringAttributes")}>FilteringAttributes</span>
                        <span className="prop-value" onClick={() => setFocusedField("FilteringAttributes")}>{step.filteringattributes}</span>
                    </div>
                )}
                {step.mode === 1 && (
                    <div className="prop-row">
                        <span className="prop-label">AsyncAutoDelete</span>
                        <span className="prop-value">{step.asyncautodelete ? "Yes" : "No"}</span>
                    </div>
                )}
            </PropertySection>
            <div className="details-footer">
                <div className="field-hint">
                    <div className="field-hint-label">{focusedField}</div>
                    <div className="field-hint-desc">{FIELD_HINTS[focusedField] ?? ""}</div>
                </div>
                <div className="details-footer-actions">
                    <button className="btn-secondary" onClick={onRegisterImage}>Register Image</button>
                    <button className="btn-secondary" onClick={onUpdate}>Update Step</button>
                    {isEnabled
                        ? <button className="btn-secondary" onClick={onDisable}>Disable</button>
                        : <button className="btn-secondary" onClick={onEnable}>Enable</button>
                    }
                    <button className="btn-danger" onClick={onUnregister}>Unregister</button>
                    <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}

