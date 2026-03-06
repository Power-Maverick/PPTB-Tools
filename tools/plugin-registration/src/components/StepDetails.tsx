import type { ProcessingStep } from "../models/interfaces";

interface StepDetailsProps {
    step: ProcessingStep;
    onRegisterImage: () => void;
    onEnable: () => void;
    onDisable: () => void;
    onUnregister: () => void;
    onUpdate: () => void;
}

const STAGES: Record<number, string> = { 10: "Pre-Validation", 20: "Pre-Operation", 40: "Post-Operation" };
const MODES: Record<number, string> = { 0: "Synchronous", 1: "Asynchronous" };

export function StepDetails({ step, onRegisterImage, onEnable, onDisable, onUnregister, onUpdate }: StepDetailsProps) {
    const isEnabled = step.statecode === 0;
    return (
        <div className="details-section">
            <div className="details-section-title">📋 Step: {step.name}</div>
            <div className="details-grid">
                <span className="detail-label">Message</span>
                <span className="detail-value">{step.messageName}</span>
                <span className="detail-label">Primary Entity</span>
                <span className="detail-value">{step.primaryEntityName || "none"}</span>
                <span className="detail-label">Stage</span>
                <span className="detail-value">{STAGES[step.stage] ?? step.stage}</span>
                <span className="detail-label">Execution Mode</span>
                <span className="detail-value">{MODES[step.mode] ?? step.mode}</span>
                <span className="detail-label">Rank</span>
                <span className="detail-value">{step.rank}</span>
                <span className="detail-label">Status</span>
                <span className="detail-value">
                    <span className={`badge ${isEnabled ? "badge-success" : "badge-danger"}`}>
                        {isEnabled ? "Enabled" : "Disabled"}
                    </span>
                </span>
                {step.filteringattributes && (
                    <>
                        <span className="detail-label">Filtering Attributes</span>
                        <span className="detail-value">{step.filteringattributes}</span>
                    </>
                )}
                {step.mode === 1 && (
                    <>
                        <span className="detail-label">Async Auto Delete</span>
                        <span className="detail-value">{step.asyncautodelete ? "Yes" : "No"}</span>
                    </>
                )}
                <span className="detail-label">Description</span>
                <span className="detail-value">{step.description || <em>—</em>}</span>
            </div>
            <div className="action-buttons">
                <button className="btn-primary" onClick={onRegisterImage}>Register Image</button>
                <button className="btn-secondary" onClick={onUpdate}>Update Step</button>
                {isEnabled
                    ? <button className="btn-secondary" onClick={onDisable}>Disable</button>
                    : <button className="btn-secondary" onClick={onEnable}>Enable</button>
                }
                <button className="btn-danger" onClick={onUnregister}>Unregister</button>
            </div>
        </div>
    );
}
