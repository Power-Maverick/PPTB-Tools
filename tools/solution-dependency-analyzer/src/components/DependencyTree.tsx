import { useState } from "react";
import { LEAF_ONLY_ASSET_KINDS } from "../models/componentTypes";
import { Asset, AssetKind } from "../models/interfaces";

interface TreeViewProps {
    assets: Asset[];
    onAssetClick: (asset: Asset) => void;
    selectedAssetId: string | null;
    searchTerm: string;
    kindFilter: AssetKind | "all";
    showOnlyLoops: boolean;
    showOnlyMissing: boolean;
}

const ASSET_ICONS: Record<AssetKind, string> = {
    entity: "📦",
    attribute: "🔤",
    relationship: "🔗",
    form: "📝",
    view: "👁️",
    workflow: "⚙️",
    plugin: "🔌",
    webresource: "📄",
    app: "📱",
    canvasapp: "🎨",
    report: "📊",
    emailtemplate: "✉️",
    optionset: "🎛️",
    connector: "🔄",
    sitemap: "🗺️",
    role: "🔐",
    other: "❓",
};

export function TreeView({ assets, onAssetClick, selectedAssetId, searchTerm, kindFilter, showOnlyLoops, showOnlyMissing }: TreeViewProps) {
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    const hasMissingDependencies = (asset: Asset): boolean => {
        if (asset.notFound || asset.hasWarning) return true;

        return asset.linksTo.some((depId) => {
            const dependency = assets.find((a) => a.assetId === depId);
            return !!dependency && (dependency.notFound || dependency.hasWarning);
        });
    };

    const toggleNodeExpansion = (assetId: string) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(assetId)) {
            newExpanded.delete(assetId);
        } else {
            newExpanded.add(assetId);
        }
        setExpandedNodes(newExpanded);
    };

    const filterAssets = (assetList: Asset[]): Asset[] => {
        return assetList.filter((asset) => {
            // Filter out attributes that have a parent entity - they'll be shown nested
            if (asset.kind === "attribute" && asset.parentEntityId) return false;
            if (showOnlyLoops && !asset.hasLoop) return false;
            if (showOnlyMissing && !hasMissingDependencies(asset)) return false;
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (searchTerm && !asset.label.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        });
    };

    const groupByKind = (assetList: Asset[]): Record<AssetKind, Asset[]> => {
        const grouped: Record<AssetKind, Asset[]> = {
            entity: [],
            attribute: [],
            relationship: [],
            form: [],
            view: [],
            workflow: [],
            plugin: [],
            webresource: [],
            app: [],
            canvasapp: [],
            report: [],
            emailtemplate: [],
            optionset: [],
            connector: [],
            sitemap: [],
            role: [],
            other: [],
        };

        assetList.forEach((asset) => {
            grouped[asset.kind].push(asset);
        });

        return grouped;
    };

    const filtered = filterAssets(assets);
    const grouped = groupByKind(filtered);

    const renderAssetNode = (asset: Asset, depth: number = 0): JSX.Element => {
        const supportsChildren = !LEAF_ONLY_ASSET_KINDS.has(asset.kind);
        const hasChildren = supportsChildren && ((asset.children && asset.children.length > 0) || (asset.linksTo && asset.linksTo.length > 0));
        const isExpanded = expandedNodes.has(asset.assetId);
        const isSelected = selectedAssetId === asset.assetId;

        return (
            <div key={asset.assetId}>
                <div
                    className={`tree-node ${isSelected ? "selected" : ""} ${asset.hasLoop ? "has-loop" : ""} ${asset.notFound ? "missing" : ""}`}
                    style={{ paddingLeft: `${depth * 20 + 10}px` }}
                    onClick={() => onAssetClick(asset)}
                >
                    {hasChildren && (
                        <span
                            className="expand-icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleNodeExpansion(asset.assetId);
                            }}
                        >
                            {isExpanded ? "▼" : "▶"}
                        </span>
                    )}
                    {!hasChildren && <span className="expand-icon-placeholder"></span>}
                    <span className="asset-icon">{ASSET_ICONS[asset.kind]}</span>
                    <span className="asset-label">{asset.label}</span>
                    {asset.hasLoop && <span className="loop-badge">🔄</span>}
                    {asset.notFound && <span className="missing-badge">⚠️</span>}
                    {asset.hasWarning && (
                        <span className="warning-badge" title={asset.warningMessage || "Warning"}>
                            ⚠️
                        </span>
                    )}
                </div>
                {isExpanded && asset.children && asset.children.length > 0 && <div className="tree-children">{asset.children.map((child) => renderAssetNode(child, depth + 1))}</div>}
                {isExpanded && asset.linksTo && asset.linksTo.length > 0 && !asset.children?.length && (
                    <div className="tree-dependencies">
                        {asset.linksTo.map((depId) => {
                            const depAsset = assets.find((a) => a.assetId === depId);
                            if (depAsset && !depAsset.parentEntityId) {
                                return renderAssetNode(depAsset, depth + 1);
                            }
                            return null;
                        })}
                    </div>
                )}
            </div>
        );
    };

    const getPluralLabel = (kind: string): string => {
        const pluralMap: Record<string, string> = {
            entity: "Entities",
            attribute: "Attributes",
            relationship: "Relationships",
            form: "Forms",
            view: "Views",
            workflow: "Workflows",
            plugin: "Plugins",
            webresource: "Web Resources",
            app: "Model-driven Apps",
            canvasapp: "Canvas Apps",
            report: "Reports",
            emailtemplate: "Email Templates",
            optionset: "Option Sets",
            connector: "Connectors",
            sitemap: "Site Maps",
            role: "Security Roles",
            other: "Other",
        };
        return pluralMap[kind] || kind.charAt(0).toUpperCase() + kind.slice(1) + "s";
    };

    return (
        <div className="tree-view">
            {Object.entries(grouped).map(([kind, kindAssets]) => {
                if (kindAssets.length === 0) return null;
                const kindAsType = kind as AssetKind;

                // For "other" (unknown) components, show a message instead of listing them
                if (kind === "other") {
                    const unknownTypeCodes = Array.from(new Set(kindAssets.map((asset) => asset.typeCode).filter((code): code is number => typeof code === "number"))).sort((a, b) => a - b);

                    return (
                        <div key={kind} className="kind-group">
                            <div className="kind-header">
                                <span>{ASSET_ICONS[kindAsType]}</span>
                                <span>{getPluralLabel(kind)}</span>
                                <span className="count-badge">({kindAssets.length})</span>
                            </div>
                            <div className="unknown-components-message">
                                {unknownTypeCodes.length > 0 ? (
                                    <p>Unknown component type codes: {unknownTypeCodes.join(", ")}</p>
                                ) : (
                                    <p>Unknown component type codes are unavailable for this analysis run.</p>
                                )}
                            </div>
                        </div>
                    );
                }

                return (
                    <div key={kind} className="kind-group">
                        <div className="kind-header">
                            <span>{ASSET_ICONS[kindAsType]}</span>
                            <span>{getPluralLabel(kind)}</span>
                            <span className="count-badge">({kindAssets.length})</span>
                        </div>
                        <div className="kind-assets">{kindAssets.map((asset) => renderAssetNode(asset, 0))}</div>
                    </div>
                );
            })}
            {filtered.length === 0 && <div className="tree-empty-state">No assets match the current filters</div>}
        </div>
    );
}
