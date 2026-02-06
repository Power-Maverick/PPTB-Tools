import { useEffect, useState } from 'react';
import { SolutionPicker } from './components/SolutionSelector';
import { AssetDetails } from './components/ComponentDetails';
import { DependencyGraph } from './components/DependencyGraph';
import { SummaryReport } from './components/SummaryReport';
import { SearchFilter } from './components/SearchFilter';
import { DataverseConnector } from './utils/dataverseClient';
import { DependencyScanner } from './utils/dependencyAnalyzer';
import { SolutionRecord, Asset, AnalysisOutput, AssetKind } from './models/interfaces';
import './models/windowTypes';

type ViewModeType = 'tree' | 'graph' | 'summary';

function App() {
  const [isPPTB, setIsPPTB] = useState<boolean>(false);
  const [connectionString, setConnectionString] = useState<string>('');
  const [solutionRecords, setSolutionRecords] = useState<SolutionRecord[]>([]);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [initializationInProgress, setInitializationInProgress] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisOutput | null>(null);
  const [currentView, setCurrentView] = useState<ViewModeType>('tree');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<AssetKind | 'all'>('all');

  useEffect(() => {
    const initializeApp = async () => {
      if (window.toolboxAPI) {
        setIsPPTB(true);
        try {
          const activeConn = await window.toolboxAPI.connections.getActiveConnection();
          setConnectionString(activeConn?.url || '');
        } catch (err) {
          displayError('Failed to retrieve connection details');
        }
        setInitializationInProgress(false);
      } else {
        displayError('Application must run within Power Platform Toolbox');
        setInitializationInProgress(false);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    if (connectionString) {
      retrieveSolutionList();
    }
  }, [connectionString]);

  const retrieveSolutionList = async () => {
    try {
      const connector = new DataverseConnector(connectionString);
      const solutions = await connector.fetchSolutions();
      setSolutionRecords(solutions);
    } catch (err: any) {
      displayError(`Solution retrieval failed: ${err.message}`);
    }
  };

  const displayError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 6000);
  };

  const handleAnalyze = async () => {
    if (!selectedSolutionId) {
      displayError('Please select a solution');
      return;
    }

    setIsProcessing(true);
    setAnalysisResult(null);

    try {
      const connector = new DataverseConnector(connectionString);
      const scanner = new DependencyScanner();
      
      const components = await connector.fetchSolutionAssets(selectedSolutionId);
      
      for (const component of components) {
        await processComponent(component, connector, scanner);
      }

      const result = scanner.performAnalysis();
      setAnalysisResult(result);
      
      if (isPPTB && window.toolboxAPI) {
        await window.toolboxAPI.utils.showNotification({
          title: 'Analysis Complete',
          body: `Found ${result.assets.length} components with ${result.loops.length} circular dependencies`,
          type: 'success'
        });
      }
    } catch (err: any) {
      displayError(`Analysis failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const processComponent = async (
    component: any,
    connector: DataverseConnector,
    scanner: DependencyScanner
  ) => {
    const compType = component.componenttype;
    const compId = component.objectid;
    
    const typeMapping: Record<number, { kind: AssetKind; fetcher: (id: string) => Promise<any> }> = {
      1: { kind: 'entity', fetcher: (id) => connector.fetchEntityMetadata(id) },
      60: { kind: 'form', fetcher: (id) => connector.fetchFormMetadata(id) },
      26: { kind: 'view', fetcher: (id) => connector.fetchViewMetadata(id) },
      90: { kind: 'plugin', fetcher: (id) => connector.fetchPluginMetadata(id) },
      61: { kind: 'webresource', fetcher: (id) => connector.fetchWebResourceMetadata(id) },
      29: { kind: 'workflow', fetcher: (id) => connector.fetchWorkflowMetadata(id) },
      80: { kind: 'app', fetcher: () => Promise.resolve({ name: 'App Component' }) }
    };

    const mapping = typeMapping[compType];
    if (!mapping) return;

    try {
      const metadata = await mapping.fetcher(compId);
      if (!metadata) return;

      const dependencies = extractDependencies(metadata, mapping.kind);
      const displayName = extractDisplayName(metadata, mapping.kind);
      const logicalIdentifier = extractLogicalName(metadata, mapping.kind);

      scanner.registerAsset(
        compId,
        displayName,
        `${mapping.kind}:${displayName}`,
        mapping.kind,
        logicalIdentifier,
        dependencies
      );
    } catch (err) {
      console.error(`Failed to process ${mapping.kind} ${compId}:`, err);
    }
  };

  const extractDependencies = (metadata: any, kind: AssetKind): string[] => {
    const deps: string[] = [];

    if (kind === 'form' && metadata.formxml) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(metadata.formxml, 'text/xml');
      const libs = xmlDoc.querySelectorAll('Library');
      libs.forEach(lib => {
        const libName = lib.getAttribute('name');
        if (libName) deps.push(libName);
      });
    } else if (kind === 'view' && metadata.fetchxml) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(metadata.fetchxml, 'text/xml');
      const entities = xmlDoc.querySelectorAll('entity');
      entities.forEach(ent => {
        const entName = ent.getAttribute('name');
        if (entName) deps.push(entName);
      });
    }

    return deps;
  };

  const extractDisplayName = (metadata: any, kind: AssetKind): string => {
    if (kind === 'entity') return metadata.DisplayName?.UserLocalizedLabel?.Label || metadata.LogicalName;
    if (kind === 'form') return metadata.name;
    if (kind === 'view') return metadata.name;
    if (kind === 'plugin') return metadata.friendlyname || metadata.typename;
    if (kind === 'webresource') return metadata.displayname || metadata.name;
    if (kind === 'workflow') return metadata.name;
    return metadata.name || 'Unknown';
  };

  const extractLogicalName = (metadata: any, kind: AssetKind): string => {
    if (kind === 'entity') return metadata.LogicalName;
    if (kind === 'form') return metadata.objecttypecode;
    if (kind === 'view') return metadata.returnedtypecode;
    return metadata.name || 'unknown';
  };

  const getFilteredAssets = (): Asset[] => {
    if (!analysisResult) return [];
    
    let filtered = analysisResult.assets;
    
    if (kindFilter !== 'all') {
      filtered = filtered.filter(a => a.kind === kindFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.label.toLowerCase().includes(query) ||
        a.logicalName.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  };

  const selectedAsset = analysisResult?.assets.find(a => a.assetId === selectedAssetId) || null;

  if (initializationInProgress) {
    return (
      <div className="app-container">
        <div className="loading-overlay">Initializing...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Solution Dependency Analyzer</h1>
        <p className="subtitle">Visualize and analyze solution component dependencies</p>
      </header>

      {errorMessage && (
        <div className="notification error-notification">
          {errorMessage}
        </div>
      )}

      <div className="main-layout">
        <aside className="sidebar">
          <SolutionPicker
            solutionOptions={solutionRecords}
            selectedValue={selectedSolutionId}
            onSelectionChange={setSelectedSolutionId}
            onTriggerScan={handleAnalyze}
            scanningInProgress={isProcessing}
          />

          {analysisResult && (
            <>
              <div className="view-selector">
                <h3>View Mode</h3>
                <div className="view-buttons">
                  <button
                    className={`view-btn ${currentView === 'tree' ? 'active' : ''}`}
                    onClick={() => setCurrentView('tree')}
                  >
                    📋 Tree
                  </button>
                  <button
                    className={`view-btn ${currentView === 'graph' ? 'active' : ''}`}
                    onClick={() => setCurrentView('graph')}
                  >
                    🔷 Graph
                  </button>
                  <button
                    className={`view-btn ${currentView === 'summary' ? 'active' : ''}`}
                    onClick={() => setCurrentView('summary')}
                  >
                    📊 Summary
                  </button>
                </div>
              </div>

              <SearchFilter
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                kindFilterValue={kindFilter}
                onKindFilterChange={setKindFilter}
              />
            </>
          )}
        </aside>

        <main className="content-area">
          {!analysisResult ? (
            <div className="empty-state">
              <p>Select a solution and click "Analyze Dependencies" to begin</p>
            </div>
          ) : (
            <>
              {currentView === 'summary' && (
                <SummaryReport 
                  analysisData={analysisResult}
                  solutionName={solutionRecords.find(s => s.solutionid === selectedSolutionId)?.friendlyname || 'Unknown'}
                />
              )}
              
              {currentView === 'graph' && (
                <DependencyGraph
                  assets={getFilteredAssets()}
                  links={analysisResult.links}
                  onAssetClick={setSelectedAssetId}
                  selectedAssetId={selectedAssetId}
                />
              )}

              {currentView === 'tree' && (
                <div className="tree-view">
                  {getFilteredAssets().map(asset => (
                    <div
                      key={asset.assetId}
                      className={`tree-item ${selectedAssetId === asset.assetId ? 'selected' : ''} ${asset.hasLoop ? 'has-loop' : ''}`}
                      onClick={() => setSelectedAssetId(asset.assetId)}
                    >
                      <span className="asset-icon">{getAssetIcon(asset.kind)}</span>
                      <span className="asset-name">{asset.label}</span>
                      {asset.hasLoop && <span className="loop-badge">🔄</span>}
                      <span className="dep-count">{asset.linksTo.length} deps</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedAsset && (
                <AssetDetails selectedAsset={selectedAsset} allAssets={analysisResult.assets} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function getAssetIcon(kind: AssetKind): string {
  const icons: Record<AssetKind, string> = {
    entity: '📦',
    form: '📝',
    view: '👁️',
    plugin: '🔌',
    webresource: '🌐',
    workflow: '⚡',
    app: '📱',
    attribute: '🏷️',
    relationship: '🔗',
    other: '❓'
  };
  return icons[kind] || '❓';
}

export default App;
