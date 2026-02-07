import { useEffect, useRef, useState } from 'react';
import { Asset, Link } from '../models/interfaces';

interface DependencyGraphProps {
  assets: Asset[];
  links: Link[];
  onAssetClick: (assetId: string) => void;
  selectedAssetId: string | null;
}

interface LayerNodeCoords {
  xCoord: number;
  yCoord: number;
  radiusVal: number;
  depthLevel: number;
}

export function DependencyGraph({ assets, links, onAssetClick, selectedAssetId }: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodeCoordinates, setNodeCoordinates] = useState<Map<string, LayerNodeCoords>>(new Map());
  const [viewportTransform, setViewportTransform] = useState({ translateX: 0, translateY: 0, scaleLevel: 1 });
  const [dragState, setDragState] = useState<{ active: boolean; startX: number; startY: number } | null>(null);

  // Hierarchical radial positioning algorithm
  useEffect(() => {
    if (assets.length === 0) return;

    const coordMap = new Map<string, LayerNodeCoords>();
    const processedSet = new Set<string>();
    const dependencyGraph = new Map<string, string[]>();
    
    links.forEach(link => {
      if (!dependencyGraph.has(link.sourceId)) {
        dependencyGraph.set(link.sourceId, []);
      }
      dependencyGraph.get(link.sourceId)!.push(link.targetId);
    });

    // Find root nodes with no incoming dependencies
    const incomingCounts = new Map<string, number>();
    assets.forEach(a => incomingCounts.set(a.assetId, 0));
    links.forEach(l => incomingCounts.set(l.targetId, (incomingCounts.get(l.targetId) || 0) + 1));
    
    const rootNodes = assets.filter(a => (incomingCounts.get(a.assetId) || 0) === 0);
    
    // BFS layering
    const depthLayers: string[][] = [];
    const nodeDepth = new Map<string, number>();
    const queue: { id: string; depth: number }[] = [];
    
    if (rootNodes.length > 0) {
      rootNodes.forEach(root => {
        queue.push({ id: root.assetId, depth: 0 });
        nodeDepth.set(root.assetId, 0);
      });
    } else {
      // No roots found, use first node
      queue.push({ id: assets[0].assetId, depth: 0 });
      nodeDepth.set(assets[0].assetId, 0);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (processedSet.has(current.id)) continue;
      processedSet.add(current.id);

      if (!depthLayers[current.depth]) {
        depthLayers[current.depth] = [];
      }
      depthLayers[current.depth].push(current.id);

      const children = dependencyGraph.get(current.id) || [];
      children.forEach(childId => {
        if (!processedSet.has(childId) && !nodeDepth.has(childId)) {
          nodeDepth.set(childId, current.depth + 1);
          queue.push({ id: childId, depth: current.depth + 1 });
        }
      });
    }

    // Add orphaned nodes
    assets.forEach(a => {
      if (!processedSet.has(a.assetId)) {
        if (!depthLayers[0]) depthLayers[0] = [];
        depthLayers[0].push(a.assetId);
        processedSet.add(a.assetId);
      }
    });

    // Radial sunburst layout
    const centerX = 500;
    const centerY = 400;
    const baseRadiusIncrement = 120;

    depthLayers.forEach((layer, depth) => {
      const radiusForLayer = depth === 0 ? 0 : baseRadiusIncrement * depth;
      const itemsInLayer = layer.length;
      const angleSegment = (2 * Math.PI) / Math.max(itemsInLayer, 1);

      layer.forEach((nodeId, idx) => {
        let posX, posY;
        
        if (depth === 0) {
          posX = centerX;
          posY = centerY;
        } else {
          const anglePos = idx * angleSegment;
          posX = centerX + radiusForLayer * Math.cos(anglePos);
          posY = centerY + radiusForLayer * Math.sin(anglePos);
        }

        coordMap.set(nodeId, {
          xCoord: posX,
          yCoord: posY,
          radiusVal: 8,
          depthLevel: depth
        });
      });
    });

    setNodeCoordinates(coordMap);
  }, [assets, links]);

  const handleNodeSelection = (assetId: string) => {
    onAssetClick(assetId);
  };

  const beginDrag = (evt: React.MouseEvent) => {
    setDragState({
      active: true,
      startX: evt.clientX - viewportTransform.translateX,
      startY: evt.clientY - viewportTransform.translateY
    });
  };

  const processDrag = (evt: React.MouseEvent) => {
    if (!dragState?.active) return;
    
    setViewportTransform({
      ...viewportTransform,
      translateX: evt.clientX - dragState.startX,
      translateY: evt.clientY - dragState.startY
    });
  };

  const finishDrag = () => {
    setDragState(null);
  };

  const adjustZoom = (delta: number) => {
    setViewportTransform(prev => ({
      ...prev,
      scaleLevel: Math.max(0.2, Math.min(3, prev.scaleLevel + delta))
    }));
  };

  const resetViewport = () => {
    setViewportTransform({ translateX: 0, translateY: 0, scaleLevel: 1 });
  };

  const getNodeColorScheme = (asset: Asset): string => {
    if (asset.hasLoop) return '#ff4757';
    if (asset.notFound) return '#ffa502';
    
    const typeColors: Record<string, string> = {
      entity: '#5f27cd',
      attribute: '#ff6b81',
      relationship: '#48dbfb',
      form: '#00d2d3',
      view: '#1e90ff',
      plugin: '#ff6348',
      webresource: '#48dbfb',
      workflow: '#ff9ff3',
      app: '#54a0ff',
      canvasapp: '#f368e0',
      report: '#ff9f43',
      emailtemplate: '#feca57',
      optionset: '#ee5a6f',
      connector: '#0abde3',
      sitemap: '#10ac84',
      role: '#576574',
      other: '#a4b0be'
    };
    
    return typeColors[asset.kind] || '#a4b0be';
  };

  return (
    <div className="dependency-graph-container">
      <div className="graph-toolbar">
        <button onClick={() => adjustZoom(0.15)} className="tool-btn">➕ Zoom</button>
        <button onClick={() => adjustZoom(-0.15)} className="tool-btn">➖ Zoom</button>
        <button onClick={resetViewport} className="tool-btn">🔄 Reset</button>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height="700"
        onMouseDown={beginDrag}
        onMouseMove={processDrag}
        onMouseUp={finishDrag}
        onMouseLeave={finishDrag}
        style={{ cursor: dragState?.active ? 'grabbing' : 'grab', border: '1px solid #ddd' }}
      >
        <g transform={`translate(${viewportTransform.translateX}, ${viewportTransform.translateY}) scale(${viewportTransform.scaleLevel})`}>
          {/* Render links with curved paths */}
          {links.map((link, idx) => {
            const sourceCoord = nodeCoordinates.get(link.sourceId);
            const targetCoord = nodeCoordinates.get(link.targetId);
            if (!sourceCoord || !targetCoord) return null;

            const midX = (sourceCoord.xCoord + targetCoord.xCoord) / 2;
            const midY = (sourceCoord.yCoord + targetCoord.yCoord) / 2;
            
            // Create a slight curve
            const controlOffsetX = (targetCoord.yCoord - sourceCoord.yCoord) * 0.1;
            const controlOffsetY = (sourceCoord.xCoord - targetCoord.xCoord) * 0.1;

            // Calculate arrow position at edge of target node
            const dx = targetCoord.xCoord - sourceCoord.xCoord;
            const dy = targetCoord.yCoord - sourceCoord.yCoord;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const nodeRadius = 8;
            
            // Position arrow at edge of target node
            const arrowX = targetCoord.xCoord - (dx / distance) * (nodeRadius + 2);
            const arrowY = targetCoord.yCoord - (dy / distance) * (nodeRadius + 2);
            
            // Calculate arrow angle based on direction
            const angle = Math.atan2(dy, dx);
            const arrowSize = 6;

            return (
              <g key={`link-${idx}`}>
                <path
                  d={`M ${sourceCoord.xCoord} ${sourceCoord.yCoord} Q ${midX + controlOffsetX} ${midY + controlOffsetY} ${targetCoord.xCoord} ${targetCoord.yCoord}`}
                  stroke="#b0b0b0"
                  strokeWidth="1.5"
                  fill="none"
                  opacity="0.6"
                />
                {/* Arrow marker with proper orientation */}
                <polygon
                  points={`0,-${arrowSize/2} ${arrowSize},0 0,${arrowSize/2}`}
                  fill="#888"
                  opacity="0.6"
                  transform={`translate(${arrowX}, ${arrowY}) rotate(${angle * 180 / Math.PI})`}
                />
              </g>
            );
          })}

          {/* Render nodes */}
          {assets.map(asset => {
            const coord = nodeCoordinates.get(asset.assetId);
            if (!coord) return null;

            const isActive = selectedAssetId === asset.assetId;
            const nodeColor = getNodeColorScheme(asset);

            return (
              <g 
                key={asset.assetId}
                onClick={() => handleNodeSelection(asset.assetId)}
                style={{ cursor: 'pointer' }}
              >
                {isActive && (
                  <circle
                    cx={coord.xCoord}
                    cy={coord.yCoord}
                    r={coord.radiusVal + 4}
                    fill="none"
                    stroke="#000"
                    strokeWidth="2"
                  />
                )}
                <circle
                  cx={coord.xCoord}
                  cy={coord.yCoord}
                  r={coord.radiusVal}
                  fill={nodeColor}
                  stroke={isActive ? '#000' : '#fff'}
                  strokeWidth={isActive ? 2 : 1}
                />
                {asset.hasLoop && (
                  <text
                    x={coord.xCoord}
                    y={coord.yCoord}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="10"
                  >
                    🔄
                  </text>
                )}
                <text
                  x={coord.xCoord + coord.radiusVal + 5}
                  y={coord.yCoord + 3}
                  fontSize="11"
                  fill="#333"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {asset.label.length > 20 ? asset.label.substring(0, 20) + '...' : asset.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
