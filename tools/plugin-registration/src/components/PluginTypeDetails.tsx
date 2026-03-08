import type { PluginType } from "../models/interfaces";
import { PropertySection } from "./PropertySection";

interface PluginTypeDetailsProps {
    pluginType: PluginType;
    onRegisterStep: () => void;
}

export function PluginTypeDetails({ pluginType, onRegisterStep }: PluginTypeDetailsProps) {
    return (
        <div className="details-pane">
            <PropertySection title="Information" defaultExpanded={true}>
                <div className="prop-row">
                    <span className="prop-label">PluginTypeId</span>
                    <span className="prop-value">{pluginType.plugintypeid}</span>
                </div>
                {pluginType.createdon && (
                    <div className="prop-row">
                        <span className="prop-label">CreatedOn</span>
                        <span className="prop-value">{pluginType.createdon}</span>
                    </div>
                )}
                <div className="prop-row">
                    <span className="prop-label">FriendlyName</span>
                    <span className="prop-value">{pluginType.friendlyname || <em>—</em>}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label">IsWorkflowActivity</span>
                    <span className="prop-value">{pluginType.isworkflowactivity ? "True" : "False"}</span>
                </div>
                {pluginType.modifiedon && (
                    <div className="prop-row">
                        <span className="prop-label">ModifiedOn</span>
                        <span className="prop-value">{pluginType.modifiedon}</span>
                    </div>
                )}
                <div className="prop-row">
                    <span className="prop-label">Name</span>
                    <span className="prop-value">{pluginType.name}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label">TypeName</span>
                    <span className="prop-value">{pluginType.typename}</span>
                </div>
                {pluginType.isworkflowactivity && (
                    <div className="prop-row">
                        <span className="prop-label">WorkflowActivityGroupName</span>
                        <span className="prop-value">{pluginType.workflowactivitygroupname || <em>—</em>}</span>
                    </div>
                )}
            </PropertySection>
            <PropertySection title="Misc" defaultExpanded={false}>
                <div className="prop-row">
                    <span className="prop-label">Description</span>
                    <span className="prop-value">{pluginType.description || <em>—</em>}</span>
                </div>
            </PropertySection>
            {!pluginType.isworkflowactivity && (
                <div className="details-footer">
                    <div className="field-hint">
                        <div className="field-hint-label">TypeName</div>
                        <div className="field-hint-desc">Fully qualified type name of the plug-in class</div>
                    </div>
                    <div className="details-footer-actions">
                        <button className="btn-primary" onClick={onRegisterStep}>Register Step</button>
                    </div>
                </div>
            )}
        </div>
    );
}

