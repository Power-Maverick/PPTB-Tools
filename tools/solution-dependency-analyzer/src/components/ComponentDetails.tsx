import { Asset } from "../models/interfaces";

interface AssetDetailsProps {
    selectedAsset: Asset | null;
    allAssets: Asset[];
    onAssetClick?: (asset: Asset) => void;
}

const ASSET_ICONS: Record<string, string> = {
    entity: "📦",
    attribute: "🔤",
    relationship: "🔗",
    form: "📝",
    view: "👁️",
    workflow: "⚙️",
    plugin: "🔌",
    webresource: "🌐",
    app: "📱",
    canvasapp: "🎨",
    report: "📊",
    emailtemplate: "✉️",
    optionset: "📋",
    connector: "🔌",
    sitemap: "🗺️",
    role: "🔐",
    other: "❓",
};

export function AssetDetails({ selectedAsset, allAssets, onAssetClick }: AssetDetailsProps) {
    if (!selectedAsset) {
        return (
            <div className="details-panel">
                <div className="no-selection">
                    <p>Select a component to view details</p>
                </div>
            </div>
        );
    }

    const dependenciesAssets = selectedAsset.linksTo.map((id) => allAssets.find((a) => a.assetId === id)).filter((a): a is Asset => a !== undefined);

    const dependentsAssets = (selectedAsset.linkedBy || []).map((id) => allAssets.find((a) => a.assetId === id)).filter((a): a is Asset => a !== undefined);

    // For specific component types, show fullName or logicalName as the asset ID
    const shouldUseDisplayId = ["attribute", "webresource", "app", "report", "sitemap"].includes(selectedAsset.kind);
    const displayedAssetId = shouldUseDisplayId ? selectedAsset.fullName : selectedAsset.assetId;

    const handleDependencyClick = (asset: Asset) => {
        if (onAssetClick) {
            onAssetClick(asset);
        }
    };

    const getAssetIcon = (kind: string): string => {
        return ASSET_ICONS[kind] || "❓";
    };

    return (
        <div className="details-panel">
            <div className="details-header">
                <h3>{selectedAsset.label}</h3>
                <span className="asset-kind-tag">{selectedAsset.kind}</span>
            </div>

            <div className="details-section">
                <h4>Asset Information</h4>
                <dl className="info-list">
                    <dt>Full Name:</dt>
                    <dd>{selectedAsset.fullName}</dd>

                    <dt>Logical Name:</dt>
                    <dd>{selectedAsset.logicalName}</dd>

                    <dt>Asset ID:</dt>
                    <dd className="mono-text">{displayedAssetId}</dd>

                    {selectedAsset.typeCode && (
                        <>
                            <dt>Type Code:</dt>
                            <dd>{selectedAsset.typeCode}</dd>
                        </>
                    )}

                    <dt>Status:</dt>
                    <dd>
                        {selectedAsset.notFound && <span className="status-warning">⚠️ Not Found in Solution</span>}
                        {selectedAsset.hasLoop && <span className="status-error">🔄 Part of Circular Dependency</span>}
                        {selectedAsset.hasWarning && <span className="status-warning">⚠️ {selectedAsset.warningMessage}</span>}
                        {!selectedAsset.notFound && !selectedAsset.hasLoop && !selectedAsset.hasWarning && <span className="status-ok">✓ OK</span>}
                    </dd>
                </dl>
            </div>

            {selectedAsset.hasLoop && selectedAsset.loopChain && (
                <div className="details-section loop-section">
                    <h4>Circular Dependency Path</h4>
                    <div className="loop-chain">
                        {selectedAsset.loopChain.map((assetId, idx) => {
                            const asset = allAssets.find((a) => a.assetId === assetId);
                            return (
                                <div key={idx} className="loop-step">
                                    {asset && onAssetClick ? (
                                        <button className="loop-link" onClick={() => handleDependencyClick(asset)}>
                                            {asset.label}
                                        </button>
                                    ) : (
                                        <span>{asset?.label || assetId}</span>
                                    )}
                                    {idx < selectedAsset.loopChain!.length - 1 && <span className="arrow">→</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="details-section">
                <h4>Dependencies ({dependenciesAssets.length})</h4>
                {dependenciesAssets.length === 0 ? (
                    <p className="empty-message">No dependencies</p>
                ) : (
                    <ul className="dependency-list">
                        {dependenciesAssets.map((dep) => (
                            <li key={dep.assetId} className={dep.notFound ? "missing-ref" : ""}>
                                <span className="dep-icon">{getAssetIcon(dep.kind)}</span>
                                {onAssetClick ? (
                                    <button className="dep-link" onClick={() => handleDependencyClick(dep)}>
                                        {dep.label}
                                        {dep.notFound && " (Missing)"}
                                    </button>
                                ) : (
                                    <span>
                                        {dep.label}
                                        {dep.notFound && " (Missing)"}
                                    </span>
                                )}
                                <span className="dep-kind">({dep.kind})</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="details-section">
                <h4>Depended By ({dependentsAssets.length})</h4>
                {dependentsAssets.length === 0 ? (
                    <p className="empty-message">No dependents</p>
                ) : (
                    <ul className="dependency-list">
                        {dependentsAssets.map((dep) => (
                            <li key={dep.assetId} className={dep.notFound ? "missing-ref" : ""}>
                                <span className="dep-icon">{getAssetIcon(dep.kind)}</span>
                                {onAssetClick ? (
                                    <button className="dep-link" onClick={() => handleDependencyClick(dep)}>
                                        {dep.label}
                                        {dep.notFound && " (Missing)"}
                                    </button>
                                ) : (
                                    <span>
                                        {dep.label}
                                        {dep.notFound && " (Missing)"}
                                    </span>
                                )}
                                <span className="dep-kind">({dep.kind})</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
