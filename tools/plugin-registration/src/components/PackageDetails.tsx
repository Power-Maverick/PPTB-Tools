import type { PluginPackage } from "../models/interfaces";
import { PropertySection } from "./PropertySection"; interface PackageDetailsProps {
    pkg: PluginPackage;
    onUpdate: () => void;
    onDelete: () => void;
}

const FIELD_HINTS: Record<string, string> = {
    PackageId: "Unique identifier of the Plugin Package record",
    Name: "Display name of the package",
    UniqueName: "Publisher-prefixed unique name used in solution components",
    Version: "Version of the NuGet package",
    IsManaged: "Whether this package was imported as part of a managed solution",
};

export function PackageDetails({ pkg, onUpdate, onDelete }: PackageDetailsProps) {
    return (
        <div className="details-pane">
            {pkg.ismanaged && (
                <div className="error-banner" style={{ marginBottom: 8, fontSize: 11 }}>
                    🔒 This package is part of a managed solution. Update and Delete are disabled.
                </div>
            )}
            <PropertySection title="Information" defaultExpanded={true}>
                <div className="prop-row">
                    <span className="prop-label">Name</span>
                    <span className="prop-value">{pkg.name}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label">UniqueName</span>
                    <span className="prop-value">{pkg.uniquename}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label">Version</span>
                    <span className="prop-value">{pkg.version}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label">IsManaged</span>
                    <span className="prop-value">{pkg.ismanaged ? "Yes" : "No"}</span>
                </div>
                <div className="prop-row">
                    <span className="prop-label">PackageId</span>
                    <span className="prop-value">{pkg.pluginpackageid}</span>
                </div>
                {pkg.createdon && (
                    <div className="prop-row">
                        <span className="prop-label">CreatedOn</span>
                        <span className="prop-value">{pkg.createdon}</span>
                    </div>
                )}
                {pkg.modifiedon && (
                    <div className="prop-row">
                        <span className="prop-label">ModifiedOn</span>
                        <span className="prop-value">{pkg.modifiedon}</span>
                    </div>
                )}
            </PropertySection>
            <div className="details-footer">
                <div className="field-hint">
                    <div className="field-hint-label">Package</div>
                    <div className="field-hint-desc">{FIELD_HINTS["Name"]}</div>
                </div>
                <div className="details-footer-actions">
                    <button
                        className="btn-secondary"
                        onClick={onUpdate}
                        disabled={pkg.ismanaged}
                        title={pkg.ismanaged ? "Managed solution records cannot be updated" : undefined}
                    >
                        Update Package
                    </button>
                    <button
                        className="btn-danger"
                        onClick={onDelete}
                        disabled={pkg.ismanaged}
                        title={pkg.ismanaged ? "Managed solution records cannot be deleted" : undefined}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
