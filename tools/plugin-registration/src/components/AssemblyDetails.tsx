import { useEffect, useState } from "react";
import type { PluginAssembly } from "../models/interfaces";
import { PropertySection } from "./PropertySection";

interface AssemblyDetailsProps {
    assembly: PluginAssembly;
    onSave: (description: string) => Promise<void>;
    onUpdate: () => void;
    onUnregister: () => void;
}

const ISOLATION_MODES: Record<number, string> = { 1: "None", 2: "Sandbox" };
const SOURCE_TYPES: Record<number, string> = { 0: "Database", 1: "Disk", 2: "Normal", 3: "Azure WebApp" };

const FIELD_HINTS: Record<string, string> = {
    Description: "Description of the Assembly",
    AssemblyId: "Unique identifier of the Plugin Assembly record",
    Culture: "Culture of the assembly",
    IsolationMode: "Indicates the level of isolation for the plug-in assembly",
    Name: "Name of the Assembly",
    PublicKeyToken: "Public key token of the assembly",
    SourceType: "Location and method to load the assembly",
    Version: "Version number of the assembly",
};

export function AssemblyDetails({ assembly, onSave, onUpdate, onUnregister }: AssemblyDetailsProps) {
    const [description, setDescription] = useState(assembly.description);
    const [saving, setSaving] = useState(false);
    const [focusedField, setFocusedField] = useState<string>("Name");

    useEffect(() => {
        setDescription(assembly.description);
    }, [assembly.pluginassemblyid, assembly.description]);

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
                    <span className="prop-label">AssemblyId</span>
                    <span className="prop-value" onClick={() => setFocusedField("AssemblyId")}>{assembly.pluginassemblyid}</span>
                </div>
                {assembly.createdon && (
                    <div className="prop-row">
                        <span className="prop-label">CreatedOn</span>
                        <span className="prop-value">{assembly.createdon}</span>
                    </div>
                )}
                <div className="prop-row">
                    <span className="prop-label">Culture</span>
                    <span className="prop-value" onClick={() => setFocusedField("Culture")}>{assembly.culture || "neutral"}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label">IsolationMode</span>
                    <span className="prop-value" onClick={() => setFocusedField("IsolationMode")}>{ISOLATION_MODES[assembly.isolationmode] ?? assembly.isolationmode}</span>
                </div>
                {assembly.modifiedon && (
                    <div className="prop-row">
                        <span className="prop-label">ModifiedOn</span>
                        <span className="prop-value">{assembly.modifiedon}</span>
                    </div>
                )}
                <div className="prop-row">
                    <span className="prop-label">Name</span>
                    <span className="prop-value" onClick={() => setFocusedField("Name")}>{assembly.name}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label">PublicKeyToken</span>
                    <span className="prop-value" onClick={() => setFocusedField("PublicKeyToken")}>{assembly.publickeytoken || "null"}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label">SourceType</span>
                    <span className="prop-value" onClick={() => setFocusedField("SourceType")}>{SOURCE_TYPES[assembly.sourcetype] ?? assembly.sourcetype}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label">Version</span>
                    <span className="prop-value" onClick={() => setFocusedField("Version")}>{assembly.version}</span>
                </div>
            </PropertySection>
            <div className="details-footer">
                <div className="field-hint">
                    <div className="field-hint-label">{focusedField}</div>
                    <div className="field-hint-desc">{FIELD_HINTS[focusedField] ?? ""}</div>
                </div>
                <div className="details-footer-actions">
                    <button className="btn-secondary" onClick={onUpdate}>Update Assembly</button>
                    <button className="btn-danger" onClick={onUnregister}>Unregister</button>
                    <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}

