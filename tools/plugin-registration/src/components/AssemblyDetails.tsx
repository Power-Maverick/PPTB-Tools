import type { PluginAssembly } from "../models/interfaces";

interface AssemblyDetailsProps {
    assembly: PluginAssembly;
    onUpdate: () => void;
    onUnregister: () => void;
}

const ISOLATION_MODES: Record<number, string> = { 1: "None", 2: "Sandbox" };
const SOURCE_TYPES: Record<number, string> = { 0: "Database", 1: "Disk", 2: "Normal", 3: "Azure WebApp" };

export function AssemblyDetails({ assembly, onUpdate, onUnregister }: AssemblyDetailsProps) {
    return (
        <div className="details-section">
            <div className="details-section-title">🔧 Assembly: {assembly.name}</div>
            <div className="details-grid">
                <span className="detail-label">Version</span>
                <span className="detail-value">{assembly.version}</span>
                <span className="detail-label">Culture</span>
                <span className="detail-value">{assembly.culture || "neutral"}</span>
                <span className="detail-label">Public Key Token</span>
                <span className="detail-value">{assembly.publickeytoken || "null"}</span>
                <span className="detail-label">Isolation Mode</span>
                <span className="detail-value">{ISOLATION_MODES[assembly.isolationmode] ?? assembly.isolationmode}</span>
                <span className="detail-label">Source Type</span>
                <span className="detail-value">{SOURCE_TYPES[assembly.sourcetype] ?? assembly.sourcetype}</span>
                <span className="detail-label">Description</span>
                <span className="detail-value">{assembly.description || <em>—</em>}</span>
            </div>
            <div className="action-buttons">
                <button className="btn-primary" onClick={onUpdate}>Update Assembly</button>
                <button className="btn-danger" onClick={onUnregister}>Unregister Assembly</button>
            </div>
        </div>
    );
}
