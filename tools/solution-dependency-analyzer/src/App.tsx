import { useState, useEffect } from 'react';
import { SolutionRecord, Asset, AnalysisOutput, AssetKind } from './models/interfaces';
import { DataverseConnector } from './utils/dataverseClient';
import { DependencyScanner } from './utils/dependencyAnalyzer';
import { SolutionPicker } from './components/SolutionSelector';
import { SearchFilter } from './components/SearchFilter';
import { TreeView } from './components/DependencyTree';
import { DependencyGraph } from './components/DependencyGraph';
import { SummaryReport } from './components/SummaryReport';
import { AssetDetails } from './components/ComponentDetails';
import './models/windowTypes';

type ViewMode = 'tree' | 'graph' | 'summary';

/**
 * Comprehensive component type mapping based on Microsoft Learn documentation
 * Maps component type codes to their asset kind and display label
 * See ComponentTypeCode constants below for named references to these type codes
 */
const COMPONENT_TYPE_MAP: Record<number, { kind: AssetKind; label: string }> = {
  1: { kind: 'entity', label: 'Entity' },
  2: { kind: 'attribute', label: 'Attribute' },
  3: { kind: 'relationship', label: 'Relationship' },
  9: { kind: 'optionset', label: 'Option Set' },
  20: { kind: 'role', label: 'Security Role' },
  24: { kind: 'form', label: 'Form' },
  26: { kind: 'view', label: 'Saved Query/View' },
  27: { kind: 'workflow', label: 'Workflow' },
  29: { kind: 'report', label: 'Report' },
  35: { kind: 'emailtemplate', label: 'Email Template' },
  60: { kind: 'webresource', label: 'Web Resource' },
  61: { kind: 'sitemap', label: 'Site Map' },
  71: { kind: 'plugin', label: 'Plugin Type' },
  80: { kind: 'app', label: 'Model-driven App' },
  82: { kind: 'connector', label: 'Connector' },
  95: { kind: 'canvasapp', label: 'Canvas App' }
};

/**
 * Component type code constants for Microsoft Dataverse components
 * Based on Microsoft Learn documentation: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/solutioncomponent
 * These codes identify different types of components that can be included in a Power Platform solution
 */
const ComponentTypeCode = {
  ENTITY: 1,
  ATTRIBUTE: 2,
  RELATIONSHIP: 3,
  OPTION_SET: 9,
  SECURITY_ROLE: 20,
  FORM: 24,
  VIEW: 26,
  WORKFLOW: 27,
  REPORT: 29,
  EMAIL_TEMPLATE: 35,
  WEB_RESOURCE: 60,
  SITE_MAP: 61,
  PLUGIN_TYPE: 71,
  MODEL_DRIVEN_APP: 80,
  CONNECTOR: 82,
  CANVAS_APP: 95
} as const;

function getComponentTypeInfo(typeCode: number): { kind: AssetKind; label: string } {
  return COMPONENT_TYPE_MAP[typeCode] || { kind: 'other', label: 'Unknown' };
}

export default function App() {
  const [solutions, setSolutions] = useState<SolutionRecord[]>([]);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisOutput | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState<AssetKind | 'all'>('all');
  const [showLoopsOnly, setShowLoopsOnly] = useState(false);

  // Load solutions on mount
  useEffect(() => {
    loadSolutions();
  }, []);

  const loadSolutions = async () => {
    try {
      if (!window.dataverseAPI) {
        throw new Error('Dataverse API not available');
      }

      const envUrl = await window.dataverseAPI.getEnvironmentUrl();
      const connector = new DataverseConnector(envUrl);
      const solutionList = await connector.fetchSolutions();
      setSolutions(solutionList);
    } catch (error: any) {
      await DataverseConnector.showMessage(
        'Error',
        error.message || 'Failed to load solutions',
        'error'
      );
    }
  };

  const analyzeSolution = async () => {
    if (!selectedSolutionId) return;

    setIsScanning(true);
    setAnalysisResult(null);
    setSelectedAsset(null);

    try {
      if (!window.dataverseAPI) {
        throw new Error('Dataverse API not available');
      }

      const envUrl = await window.dataverseAPI.getEnvironmentUrl();
      const connector = new DataverseConnector(envUrl);
      
      // Fetch solution components
      const components = await connector.fetchSolutionAssets(selectedSolutionId);
      
      const scanner = new DependencyScanner();

      // Process each component based on type
      for (const component of components) {
        const componentId = component.objectid;
        const typeCode = component.componenttype;
        const typeInfo = getComponentTypeInfo(typeCode);

        let metadata: any = null;
        let assetName = 'Unknown';
        let fullName = componentId;
        let logicalName = componentId;
        let dependencies: string[] = [];

        try {
          // Fetch metadata based on component type
          switch (typeCode) {
            case ComponentTypeCode.ENTITY:
              metadata = await connector.fetchEntityMetadata(componentId);
              if (metadata) {
                assetName = metadata.DisplayName?.UserLocalizedLabel?.Label || metadata.LogicalName;
                fullName = metadata.SchemaName || metadata.LogicalName;
                logicalName = metadata.LogicalName;
              }
              break;

            case ComponentTypeCode.FORM:
              metadata = await connector.fetchFormMetadata(componentId);
              if (metadata) {
                assetName = metadata.name;
                fullName = metadata.name;
                logicalName = metadata.objecttypecode || '';
                // Parse form XML to extract dependencies
                if (metadata.formxml) {
                  dependencies = parseFormDependencies(metadata.formxml);
                }
              }
              break;

            case ComponentTypeCode.VIEW:
              metadata = await connector.fetchViewMetadata(componentId);
              if (metadata) {
                assetName = metadata.name;
                fullName = metadata.name;
                logicalName = metadata.returnedtypecode || '';
                // Parse FetchXML to extract dependencies
                if (metadata.fetchxml) {
                  dependencies = parseFetchXmlDependencies(metadata.fetchxml);
                }
              }
              break;

            case ComponentTypeCode.PLUGIN_TYPE:
              metadata = await connector.fetchPluginMetadata(componentId);
              if (metadata) {
                assetName = metadata.friendlyname || metadata.typename;
                fullName = metadata.typename;
                logicalName = metadata.typename;
              }
              break;

            case ComponentTypeCode.WEB_RESOURCE:
              metadata = await connector.fetchWebResourceMetadata(componentId);
              if (metadata) {
                assetName = metadata.displayname || metadata.name;
                fullName = metadata.name;
                logicalName = metadata.name;
              }
              break;

            case ComponentTypeCode.WORKFLOW:
              metadata = await connector.fetchWorkflowMetadata(componentId);
              if (metadata) {
                assetName = metadata.name;
                fullName = metadata.name;
                logicalName = metadata.name;
              }
              break;

            default:
              assetName = `${typeInfo.label} (${componentId.substring(0, 8)})`;
              fullName = componentId;
              logicalName = componentId;
              break;
          }
        } catch (err) {
          console.warn(`Failed to fetch metadata for component ${componentId}:`, err);
        }

        scanner.registerAsset(
          componentId,
          assetName,
          fullName,
          typeInfo.kind,
          logicalName,
          dependencies
        );
      }

      const analysis = scanner.performAnalysis();
      setAnalysisResult(analysis);

      await DataverseConnector.showMessage(
        'Analysis Complete',
        `Analyzed ${analysis.stats.assetCount} components with ${analysis.stats.linkCount} dependencies`,
        'success'
      );
    } catch (error: any) {
      await DataverseConnector.showMessage(
        'Analysis Failed',
        error.message || 'An error occurred during analysis',
        'error'
      );
    } finally {
      setIsScanning(false);
    }
  };

  const parseFormDependencies = (formXml: string): string[] => {
    const dependencies: string[] = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(formXml, 'text/xml');
      
      // Extract field references
      const fields = doc.querySelectorAll('control[datafieldname]');
      fields.forEach(field => {
        const fieldName = field.getAttribute('datafieldname');
        if (fieldName) {
          dependencies.push(fieldName);
        }
      });

      // Extract web resource references
      const webResources = doc.querySelectorAll('control[classid]');
      webResources.forEach(wr => {
        const wrName = wr.getAttribute('name');
        if (wrName) {
          dependencies.push(wrName);
        }
      });
    } catch (err) {
      console.warn('Failed to parse form XML:', err);
    }
    return dependencies;
  };

  const parseFetchXmlDependencies = (fetchXml: string): string[] => {
    const dependencies: string[] = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(fetchXml, 'text/xml');
      
      // Extract entity references
      const entities = doc.querySelectorAll('entity');
      entities.forEach(entity => {
        const entityName = entity.getAttribute('name');
        if (entityName) {
          dependencies.push(entityName);
        }
      });

      // Extract attribute references
      const attributes = doc.querySelectorAll('attribute');
      attributes.forEach(attr => {
        const attrName = attr.getAttribute('name');
        if (attrName) {
          dependencies.push(attrName);
        }
      });

      // Extract link-entity references
      const linkEntities = doc.querySelectorAll('link-entity');
      linkEntities.forEach(linkEntity => {
        const linkName = linkEntity.getAttribute('name');
        if (linkName) {
          dependencies.push(linkName);
        }
      });
    } catch (err) {
      console.warn('Failed to parse FetchXML:', err);
    }
    return dependencies;
  };

  const handleAssetClick = (asset: Asset) => {
    setSelectedAsset(asset);
  };

  const handleGraphAssetClick = (assetId: string) => {
    const asset = analysisResult?.assets.find(a => a.assetId === assetId);
    if (asset) {
      setSelectedAsset(asset);
    }
  };

  const getSelectedSolutionName = (): string => {
    const solution = solutions.find(s => s.solutionid === selectedSolutionId);
    return solution?.friendlyname || 'Unknown Solution';
  };

  return (
    <div className="app-wrapper">
      <div className="columns-layout">
        {/* Left Column - Controls */}
        <div className="column-left">
          <SolutionPicker
            solutionOptions={solutions}
            selectedValue={selectedSolutionId}
            onSelectionChange={setSelectedSolutionId}
            onTriggerScan={analyzeSolution}
            scanningInProgress={isScanning}
          />

          {analysisResult && (
            <>
              <div className="quick-stats-card">
                <h3>Quick Stats</h3>
                <div className="quick-stats-grid">
                  <div className="quick-stat">
                    <div className="quick-stat-value">{analysisResult.stats.assetCount}</div>
                    <div className="quick-stat-label">Components</div>
                  </div>
                  <div className="quick-stat">
                    <div className="quick-stat-value">{analysisResult.stats.linkCount}</div>
                    <div className="quick-stat-label">Dependencies</div>
                  </div>
                  <div className="quick-stat">
                    <div className="quick-stat-value">{analysisResult.stats.loopCount}</div>
                    <div className="quick-stat-label">Circular</div>
                  </div>
                  <div className="quick-stat">
                    <div className="quick-stat-value">{analysisResult.notFoundAssets.length}</div>
                    <div className="quick-stat-label">Missing</div>
                  </div>
                </div>
              </div>

              <SearchFilter
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                kindFilterValue={kindFilter}
                onKindFilterChange={setKindFilter}
              />

              <div className="loop-filter-checkbox">
                <input
                  type="checkbox"
                  id="loop-filter"
                  checked={showLoopsOnly}
                  onChange={(e) => setShowLoopsOnly(e.target.checked)}
                />
                <label htmlFor="loop-filter">🔄 Show Only Circular Dependencies</label>
              </div>
            </>
          )}
        </div>

        {/* Center Column - Main View */}
        <div className="column-center">
          {isScanning ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <div className="loading-text">Analyzing solution dependencies...</div>
            </div>
          ) : analysisResult ? (
            <>
              <div className="view-tabs">
                <button
                  className={`view-tab ${viewMode === 'tree' ? 'active' : ''}`}
                  onClick={() => setViewMode('tree')}
                >
                  🌳 Tree View
                </button>
                <button
                  className={`view-tab ${viewMode === 'graph' ? 'active' : ''}`}
                  onClick={() => setViewMode('graph')}
                >
                  📊 Graph View
                </button>
                <button
                  className={`view-tab ${viewMode === 'summary' ? 'active' : ''}`}
                  onClick={() => setViewMode('summary')}
                >
                  📋 Summary Report
                </button>
              </div>

              <div className="view-content">
                {viewMode === 'tree' && (
                  <TreeView
                    assets={analysisResult.assets}
                    onAssetClick={handleAssetClick}
                    selectedAssetId={selectedAsset?.assetId || null}
                    searchTerm={searchTerm}
                    kindFilter={kindFilter}
                    showOnlyLoops={showLoopsOnly}
                  />
                )}

                {viewMode === 'graph' && (
                  <DependencyGraph
                    assets={analysisResult.assets}
                    links={analysisResult.links}
                    onAssetClick={handleGraphAssetClick}
                    selectedAssetId={selectedAsset?.assetId || null}
                  />
                )}

                {viewMode === 'summary' && (
                  <SummaryReport
                    analysisData={analysisResult}
                    solutionName={getSelectedSolutionName()}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="empty-analysis-state">
              <div className="icon">📦</div>
              <h3>No Analysis Yet</h3>
              <p>Select a solution and click "Analyze Dependencies" to get started</p>
            </div>
          )}
        </div>

        {/* Right Column - Details */}
        <div className="column-right">
          {analysisResult && (
            <AssetDetails
              selectedAsset={selectedAsset}
              allAssets={analysisResult.assets}
            />
          )}
          {!analysisResult && (
            <div className="no-selection">
              <p>Component details will appear here after analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
