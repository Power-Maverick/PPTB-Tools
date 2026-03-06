import type { PluginType } from "../models/interfaces";

interface PluginTypeDetailsProps {
    pluginType: PluginType;
    onRegisterStep: () => void;
}

export function PluginTypeDetails({ pluginType, onRegisterStep }: PluginTypeDetailsProps) {
    return (
        <div className="details-section">
            <div className="details-section-title">⚙️ Plugin Type: {pluginType.typename}</div>
            <div className="details-grid">
                <span className="detail-label">Type Name</span>
                <span className="detail-value">{pluginType.typename}</span>
                <span className="detail-label">Friendly Name</span>
                <span className="detail-value">{pluginType.friendlyname || <em>—</em>}</span>
                <span className="detail-label">Workflow Activity</span>
                <span className="detail-value">{pluginType.isworkflowactivity ? "Yes" : "No"}</span>
                {pluginType.isworkflowactivity && (
                    <>
                        <span className="detail-label">Activity Group</span>
                        <span className="detail-value">{pluginType.workflowactivitygroupname || <em>—</em>}</span>
                    </>
                )}
                <span className="detail-label">Description</span>
                <span className="detail-value">{pluginType.description || <em>—</em>}</span>
            </div>
            {!pluginType.isworkflowactivity && (
                <div className="action-buttons">
                    <button className="btn-primary" onClick={onRegisterStep}>Register Step</button>
                </div>
            )}
        </div>
    );
}
