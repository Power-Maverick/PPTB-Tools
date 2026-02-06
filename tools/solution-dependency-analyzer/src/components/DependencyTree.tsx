import { useState } from 'react';
import { Asset, AssetKind } from '../models/interfaces';

interface TreeViewProps {
  assets: Asset[];
  onAssetClick: (asset: Asset) => void;
  selectedAssetId: string | null;
  searchTerm: string;
  kindFilter: AssetKind | 'all';
  showOnlyLoops: boolean;
}

const ASSET_ICONS: Record<AssetKind, string> = {
  entity: '📦',
  attribute: '🔤',
  relationship: '🔗',
  form: '📝',
  view: '👁️',
  workflow: '⚙️',
  plugin: '🔌',
  webresource: '📄',
  app: '📱',
  canvasapp: '🎨',
  report: '📊',
  emailtemplate: '✉️',
  optionset: '🎛️',
  connector: '🔄',
  sitemap: '🗺️',
  role: '🔐',
  other: '❓'
};

export function TreeView({
  assets,
  onAssetClick,
  selectedAssetId,
  searchTerm,
  kindFilter,
  showOnlyLoops
}: TreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

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
    return assetList.filter(asset => {
      if (showOnlyLoops && !asset.hasLoop) return false;
      if (kindFilter !== 'all' && asset.kind !== kindFilter) return false;
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
      other: []
    };

    assetList.forEach(asset => {
      grouped[asset.kind].push(asset);
    });

    return grouped;
  };

  const filtered = filterAssets(assets);
  const grouped = groupByKind(filtered);

  const renderAssetNode = (asset: Asset, depth: number = 0) => {
    const hasChildren = asset.linksTo && asset.linksTo.length > 0;
    const isExpanded = expandedNodes.has(asset.assetId);
    const isSelected = selectedAssetId === asset.assetId;

    return (
      <div key={asset.assetId}>
        <div
          className={`tree-node ${isSelected ? 'selected' : ''} ${asset.hasLoop ? 'has-loop' : ''} ${asset.notFound ? 'missing' : ''}`}
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
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          {!hasChildren && <span className="expand-icon-placeholder"></span>}
          <span className="asset-icon">{ASSET_ICONS[asset.kind]}</span>
          <span className="asset-label">{asset.label}</span>
          {asset.hasLoop && <span className="loop-badge">🔄</span>}
          {asset.notFound && <span className="missing-badge">⚠️</span>}
        </div>
        {isExpanded && hasChildren && (
          <div className="tree-children">
            {asset.linksTo.map(childId => {
              const childAsset = assets.find(a => a.assetId === childId);
              if (!childAsset) return null;
              return renderAssetNode(childAsset, depth + 1);
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tree-view">
      {Object.entries(grouped).map(([kind, kindAssets]) => {
        if (kindAssets.length === 0) return null;
        const kindAsType = kind as AssetKind;
        return (
          <div key={kind} className="kind-group">
            <div className="kind-header">
              <span>{ASSET_ICONS[kindAsType]}</span>
              <span>{kind.charAt(0).toUpperCase() + kind.slice(1)}s</span>
              <span className="count-badge">({kindAssets.length})</span>
            </div>
            <div className="kind-assets">
              {kindAssets.map(asset => renderAssetNode(asset, 0))}
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && (
        <div className="tree-empty-state">
          No assets match the current filters
        </div>
      )}
    </div>
  );
}
