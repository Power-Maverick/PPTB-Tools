import { PropertySection } from "./PropertySection";

/**
 * @typedef {object} PackageHints
 * @property {string} PackageId - Unique identifier of the Plugin Package record
 * @property {string} Name - Display name of the package
 * @property {string} UniqueName - Publisher-prefixed unique name used in solution components
 * @property {string} Version - Version of the NuGet package
 * @property {boolean} IsManaged - Whether this package was imported as part of a managed solution
 */

/** @type {PackageHints} */
const FIELD_HINTS = {
    PackageId: "Unique identifier of the Plugin Package record",
    Name: "Display name of the package",
    UniqueName: "Publisher-prefixed unique name used in solution components",
    Version: "Version of the NuGet package",
    IsManaged: "Whether this package was imported as part of a managed solution",
};

interface PackageDetailsProps {
    pkg: {
        pluginpackageid: string;
        name: string;
        uniquename: string;
        version: string;
        ismanaged?: boolean;
        createdon?: string;
        modifiedon?: string;
    };
    onUpdate?: () => void;
    onDelete?: () => void;
}

export function PackageDetails({ pkg, onUpdate, onDelete }: PackageDetailsProps) {
    const isManaged = !!pkg.ismanaged;

    return (
        <div className="details-pane">
            {isManaged && (
                <div className="error-banner" style={{ marginBottom: 8, fontSize: 11 }}>
                    🔒 This package is part of a managed solution. Update and Delete are disabled.
                </div>
            )}
            <PropertySection title="Information" defaultExpanded={true}>
                <div className="prop-row">
                    <span className="prop-label">Name</span>
                    <span className="prop-value">{pkg.name}</span
                    ></div>
                <div className="prop-row">
                    <span className="prop-label">UniqueName</span >
                    <span className="prop-value">{pkg.uniquename}</span >
                </div>
                <div className="prop-row">
                    <span className="prop-label">Version</span >
                    <span className="prop-value">{pkg.version}</span >
                </div>
                <div className="prop-row">
                    <span className="prop-label">IsManaged</span >
                    <span className="prop-value">{isManaged ? "Yes" : "No"}</span >
                </div>
                <div className="prop-row">
                    <span className="prop-label">PackageId</span >
                    <span className="prop-value">{pkg.pluginpackageid}</span >
                </div>
                {pkg.createdon && (
                    <div className="prop-row">
                        <span className="prop-label">CreatedOn</span >
                        <span className="prop-value">{pkg.createdon}</span >
                    </div >
                )}
                {pkg.modifiedon && (
                    <div className="prop-row">
                        <span className="prop-label">ModifiedOn</span >
                        <span className="prop-value">{pkg.modifiedon}</span >
                    </div >
                )}
            </PropertySection>
            {/* Removed the assembly section to only show package-specific details when in "Packages View". */}
            {/* If you need assemblies to be viewable optionally, restore the following block: */}
            {/*
            {assemblies.length > 0 && (
                <PropertySection title="Assemblies" defaultExpanded={true}>
                    {assemblies.map((asm) => (
                        <div className="prop-row" key={asm.pluginassemblyid}>
                            <span className="prop-label">{asm.name}</span>
                            <span className="prop-value">{asm.version}</span >
                        </div >
                    ))}
                </PropertySection>
            )}
            */}

            <div className="details-footer">
                <div className="field-hint">
                    <div className="field-hint-label">Package</div >
                    <div className="field-hint-desc">{FIELD_HINTS["Name"]}</div>
                </div>
                <div className="details-footer-actions">
                    <button
                        className="btn-secondary"
                        onClick={onUpdate}
                        disabled={isManaged}
                        title={isManaged ? "Managed solution records cannot be updated" : undefined}
                    >
                        Update Package
                    </button>
                    <button
                        className="btn-danger"
                        onClick={onDelete}
                        disabled={isManaged}
                        title={isManaged ? "Managed solution records cannot be deleted" : undefined}
                    >
                        Delete
                    </button>
                </div >
            </div>
        </div>
    );
}
