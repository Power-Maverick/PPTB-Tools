import { useEffect, useState } from "react";
import { AssetDetails } from "./components/ComponentDetails";
import { DependencyGraph } from "./components/DependencyGraph";
import { TreeView } from "./components/DependencyTree";
import { SearchFilter } from "./components/SearchFilter";
import { SolutionPicker } from "./components/SolutionSelector";
import { SummaryReport } from "./components/SummaryReport";
import { ComponentTypeCode, getComponentTypeInfo } from "./models/componentTypes";
import { AnalysisOutput, Asset, AssetKind, SolutionRecord } from "./models/interfaces";
import { DataverseConnector } from "./utils/dataverseClient";
import { DependencyScanner } from "./utils/dependencyAnalyzer";

type ViewMode = "tree" | "graph" | "summary";
type ParsedDependency = { key: string; kind: AssetKind };

export default function App() {
    const [solutions, setSolutions] = useState<SolutionRecord[]>([]);
    const [selectedSolutionId, setSelectedSolutionId] = useState<string>("");
    const [isScanning, setIsScanning] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<AnalysisOutput | null>(null);
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("tree");
    const [searchTerm, setSearchTerm] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [showLoopsOnly, setShowLoopsOnly] = useState(false);
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const [showImportBlockersOnly, setShowImportBlockersOnly] = useState(false);
    const [isDetailsVisible, setIsDetailsVisible] = useState(true);

    // Load solutions on mount
    useEffect(() => {
        loadSolutions();
    }, []);

    const loadSolutions = async () => {
        try {
            if (!window.toolboxAPI) {
                throw new Error("Toolbox API not available");
            }

            const activeConnection = await window.toolboxAPI.connections.getActiveConnection();
            const envUrl = activeConnection?.url;
            if (!envUrl) {
                throw new Error("Unable to determine environment URL");
            }

            const connector = new DataverseConnector(envUrl);
            const solutionList = await connector.fetchSolutions();
            setSolutions(solutionList);
        } catch (error: any) {
            await DataverseConnector.showMessage("Error", error.message || "Failed to load solutions", "error");
        }
    };

    const analyzeSolution = async () => {
        if (!selectedSolutionId) return;

        setIsScanning(true);
        setAnalysisResult(null);
        setSelectedAsset(null);

        try {
            if (!window.toolboxAPI) {
                throw new Error("Toolbox API not available");
            }

            const activeConnection = await window.toolboxAPI.connections.getActiveConnection();
            const envUrl = activeConnection?.url;
            if (!envUrl) {
                throw new Error("Unable to determine environment URL");
            }

            const connector = new DataverseConnector(envUrl);

            // Fetch solution components
            const components = await connector.fetchSolutionAssets(selectedSolutionId);

            // Build a set of component IDs that are explicitly in the solution
            const solutionComponentIds = new Set(components.map((c) => c.objectid.toLowerCase()));

            // Build a map of entity IDs to their explicitly added attribute IDs
            // This helps determine if attributes were selectively added or all included with entity
            const entityAttributeMap = new Map<string, Set<string>>();
            components.forEach((c) => {
                if (c.componenttype === ComponentTypeCode.ATTRIBUTE) {
                    // We'll need to determine parent entity for this attribute
                    // For now, store all attribute IDs
                }
            });

            const scanner = new DependencyScanner();

            const inferredTypeCodeByKind: Partial<Record<AssetKind, number>> = {
                attribute: ComponentTypeCode.ATTRIBUTE,
                entity: ComponentTypeCode.ENTITY,
                relationship: ComponentTypeCode.RELATIONSHIP,
                webresource: ComponentTypeCode.WEB_RESOURCE,
            };

            const registerParsedDependencies = (parsedDependencies: ParsedDependency[]): string[] => {
                return parsedDependencies.map((dependency) => {
                    const normalizedKey = dependency.key.trim().toLowerCase();
                    const inferredAssetId = `inferred:${dependency.kind}:${normalizedKey}`;

                    const inferredAsset: Asset = {
                        assetId: inferredAssetId,
                        label: dependency.key,
                        fullName: dependency.key,
                        kind: dependency.kind,
                        logicalName: dependency.key,
                        typeCode: inferredTypeCodeByKind[dependency.kind],
                        linksTo: [],
                        hasLoop: false,
                    };

                    scanner.registerAsset(inferredAsset);
                    return inferredAssetId;
                });
            };

            // Process each component based on type
            for (const component of components) {
                const componentId = component.objectid;
                const typeCode = component.componenttype;
                const typeInfo = getComponentTypeInfo(typeCode);
                const componentIsManaged = component.ismanaged === true || component.ismanaged === 1;

                let metadata: any = null;
                let assetName = "Unknown";
                let fullName = componentId;
                let logicalName = componentId;
                let dependencies: string[] = [];
                let warningMessage: string | undefined = undefined;
                let isManaged: boolean | undefined = componentIsManaged;

                try {
                    // Fetch metadata based on component type
                    switch (typeCode) {
                        case ComponentTypeCode.ENTITY:
                            metadata = await connector.fetchEntityMetadata(componentId);
                            if (metadata) {
                                assetName = metadata.DisplayName?.UserLocalizedLabel?.Label || metadata.LogicalName;
                                fullName = metadata.SchemaName || metadata.LogicalName;
                                logicalName = metadata.LogicalName;
                                isManaged = metadata.IsManaged === true || metadata.IsManaged === 1;

                                // Fetch attributes for this entity (cached with solution status)
                                const attributes = await connector.fetchEntityAttributes(componentId, {
                                    solutionAttributeIds: solutionComponentIds,
                                    implicitAllIfNoneExplicit: true,
                                });
                                if (attributes && attributes.length > 0) {
                                    let hasNonSolutionAttributes = false;
                                    dependencies = attributes.map((attr: any) => {
                                        const isInSolution = attr.inSolution !== false;

                                        if (!isInSolution) {
                                            hasNonSolutionAttributes = true;
                                        }

                                        const attrAsset: Asset = {
                                            assetId: attr.MetadataId,
                                            label: attr.DisplayName?.UserLocalizedLabel?.Label || attr.LogicalName,
                                            fullName: attr.LogicalName,
                                            kind: "attribute",
                                            logicalName: attr.LogicalName,
                                            typeCode: ComponentTypeCode.ATTRIBUTE,
                                            isManaged: attr.IsManaged === true,
                                            linksTo: [],
                                            hasLoop: false,
                                            parentEntityId: componentId,
                                            hasWarning: !isInSolution,
                                            warningMessage: !isInSolution ? "Not included in solution" : undefined,
                                        };
                                        scanner.registerAsset(attrAsset);
                                        return attr.MetadataId;
                                    });

                                    if (hasNonSolutionAttributes) {
                                        warningMessage = "Contains attributes not in solution";
                                    }
                                }
                            }
                            break;

                        case ComponentTypeCode.ATTRIBUTE:
                            // Skip attributes - they will be fetched as part of entity metadata
                            continue;

                        case ComponentTypeCode.FORM:
                        case ComponentTypeCode.SYSTEM_FORM:
                            metadata = await connector.fetchFormMetadata(componentId);
                            if (metadata) {
                                assetName = metadata.name;
                                fullName = metadata.name;
                                logicalName = metadata.objecttypecode || "";
                                isManaged = metadata.ismanaged === true || metadata.ismanaged === 1;
                                // Parse form XML to extract dependencies
                                if (metadata.formxml) {
                                    dependencies = registerParsedDependencies(parseFormDependencies(metadata.formxml));
                                }
                            }
                            break;

                        case ComponentTypeCode.SAVED_QUERY:
                            metadata = await connector.fetchViewMetadata(componentId);
                            if (metadata) {
                                assetName = metadata.name;
                                fullName = metadata.name;
                                logicalName = metadata.returnedtypecode || "";
                                isManaged = metadata.ismanaged === true || metadata.ismanaged === 1;
                                // Parse FetchXML to extract dependencies
                                if (metadata.fetchxml) {
                                    dependencies = registerParsedDependencies(parseFetchXmlDependencies(metadata.fetchxml));
                                }

                                const viewColumns = metadata.viewColumns || [];
                                if (viewColumns.length > 0) {
                                    // Check if ANY columns for this view are explicitly in the solution
                                    const hasExplicitColumns = viewColumns.some((col: any) => solutionComponentIds.has(col.MetadataId?.toLowerCase()));

                                    let hasNonSolutionColumns = false;
                                    const columnDependencies = viewColumns.map((col: any) => {
                                        const colId = col.MetadataId?.toLowerCase();

                                        // Determine if column is in solution:
                                        // - If NO columns are explicitly added for this view, all columns are implicitly included
                                        // - If SOME columns are explicitly added, only those are in solution
                                        const isInSolution = hasExplicitColumns ? solutionComponentIds.has(colId) : true;

                                        if (!isInSolution) {
                                            hasNonSolutionColumns = true;
                                        }

                                        const colAsset: Asset = {
                                            assetId: col.MetadataId,
                                            label: col.DisplayName?.UserLocalizedLabel?.Label || col.LogicalName,
                                            fullName: col.LogicalName,
                                            kind: "attribute",
                                            logicalName: col.LogicalName,
                                            typeCode: ComponentTypeCode.ATTRIBUTE,
                                            isManaged: col.IsManaged === true,
                                            linksTo: [],
                                            hasLoop: false,
                                            parentEntityId: componentId,
                                            hasWarning: !isInSolution,
                                            warningMessage: !isInSolution ? "Not included in solution" : undefined,
                                        };
                                        scanner.registerAsset(colAsset);
                                        return col.MetadataId;
                                    });

                                    if (hasNonSolutionColumns) {
                                        warningMessage = "Contains columns not in solution";
                                    }

                                    dependencies = [...dependencies, ...columnDependencies];
                                }
                            }
                            break;

                        case ComponentTypeCode.PLUGIN_TYPE:
                            metadata = await connector.fetchPluginMetadata(componentId);
                            if (metadata) {
                                assetName = metadata.friendlyname || metadata.typename;
                                fullName = metadata.typename;
                                logicalName = metadata.typename;
                                isManaged = metadata.ismanaged === true || metadata.ismanaged === 1;
                            }
                            break;

                        case ComponentTypeCode.WEB_RESOURCE:
                            metadata = await connector.fetchWebResourceMetadata(componentId);
                            if (metadata) {
                                assetName = metadata.displayname || metadata.name;
                                fullName = metadata.name;
                                logicalName = metadata.name;
                                isManaged = metadata.ismanaged === true || metadata.ismanaged === 1;
                            }
                            break;

                        case ComponentTypeCode.WORKFLOW:
                            metadata = await connector.fetchWorkflowMetadata(componentId);
                            if (metadata) {
                                assetName = metadata.name;
                                fullName = metadata.name;
                                logicalName = metadata.name;
                                isManaged = metadata.ismanaged === true || metadata.ismanaged === 1;
                            }
                            break;

                        case ComponentTypeCode.REPORT:
                            metadata = await connector.fetchReportMetadata(componentId);
                            if (metadata) {
                                assetName = metadata.displayname || metadata.name;
                                fullName = metadata.name;
                                logicalName = metadata.name;
                                isManaged = metadata.ismanaged === true || metadata.ismanaged === 1;
                            }
                            break;

                        case ComponentTypeCode.SITE_MAP:
                            metadata = await connector.fetchSiteMapMetadata(componentId);
                            if (metadata) {
                                assetName = metadata.displayname || metadata.sitemapname;
                                fullName = metadata.sitemapname;
                                logicalName = metadata.sitemapname;
                                isManaged = metadata.ismanaged === true || metadata.ismanaged === 1;
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

                scanner.registerAsset(componentId, assetName, fullName, typeInfo.kind, logicalName, dependencies, warningMessage, typeCode, isManaged);
            }

            const analysis = scanner.performAnalysis();
            setAnalysisResult(analysis);

            await DataverseConnector.showMessage("Analysis Complete", `Analyzed ${analysis.stats.assetCount} components with ${analysis.stats.linkCount} dependencies`, "success");
        } catch (error: any) {
            await DataverseConnector.showMessage("Analysis Failed", error.message || "An error occurred during analysis", "error");
        } finally {
            setIsScanning(false);
        }
    };

    const parseFormDependencies = (formXml: string): ParsedDependency[] => {
        const dependencies: ParsedDependency[] = [];
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(formXml, "text/xml");

            // Extract field references
            const fields = doc.querySelectorAll("control[datafieldname]");
            fields.forEach((field) => {
                const fieldName = field.getAttribute("datafieldname");
                if (fieldName) {
                    dependencies.push({ key: fieldName, kind: "attribute" });
                }
            });

            // Extract web resource references
            const webResources = doc.querySelectorAll("control[classid]");
            webResources.forEach((wr) => {
                const wrName = wr.getAttribute("name");
                if (wrName) {
                    dependencies.push({ key: wrName, kind: "webresource" });
                }
            });
        } catch (err) {
            console.warn("Failed to parse form XML:", err);
        }
        return dependencies;
    };

    const parseFetchXmlDependencies = (fetchXml: string): ParsedDependency[] => {
        const dependencies: ParsedDependency[] = [];
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(fetchXml, "text/xml");

            // Extract entity references
            const entities = doc.querySelectorAll("entity");
            entities.forEach((entity) => {
                const entityName = entity.getAttribute("name");
                if (entityName) {
                    dependencies.push({ key: entityName, kind: "entity" });
                }
            });

            // Extract attribute references
            const attributes = doc.querySelectorAll("attribute");
            attributes.forEach((attr) => {
                const attrName = attr.getAttribute("name");
                if (attrName) {
                    dependencies.push({ key: attrName, kind: "attribute" });
                }
            });

            // Extract link-entity references
            const linkEntities = doc.querySelectorAll("link-entity");
            linkEntities.forEach((linkEntity) => {
                const linkName = linkEntity.getAttribute("name");
                if (linkName) {
                    dependencies.push({ key: linkName, kind: "entity" });
                }
            });
        } catch (err) {
            console.warn("Failed to parse FetchXML:", err);
        }
        return dependencies;
    };

    const handleAssetClick = (asset: Asset) => {
        setSelectedAsset(asset);
        setIsDetailsVisible(true);
    };

    const handleGraphAssetClick = (assetId: string) => {
        const asset = analysisResult?.assets.find((a) => a.assetId === assetId);
        if (asset) {
            setSelectedAsset(asset);
            setIsDetailsVisible(true);
        }
    };

    const getSelectedSolutionName = (): string => {
        const solution = solutions.find((s) => s.solutionid === selectedSolutionId);
        return solution?.friendlyname || "Unknown Solution";
    };

    const isEffectivelyManaged = (asset: Asset, allAssets: Asset[]): boolean => {
        if (asset.isManaged === true) {
            return true;
        }

        if (asset.parentEntityId) {
            const parentEntity = allAssets.find((candidate) => candidate.assetId === asset.parentEntityId);
            return parentEntity?.isManaged === true;
        }

        return false;
    };

    const getMissingImpactCount = (): number => {
        if (!analysisResult) return 0;

        return analysisResult.assets.filter((asset) => {
            const hasActionableWarning = asset.hasWarning === true && !isEffectivelyManaged(asset, analysisResult.assets);
            return !!asset.notFound || !!asset.hasLoop || hasActionableWarning;
        }).length;
    };

    return (
        <div className="app-wrapper">
            <div className={`columns-layout ${selectedAsset && isDetailsVisible ? "details-visible" : ""}`}>
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
                                        <div className="quick-stat-value">{getMissingImpactCount()}</div>
                                        <div className="quick-stat-label">Impacting Import</div>
                                    </div>
                                </div>
                            </div>

                            <SearchFilter searchValue={searchTerm} onSearchChange={setSearchTerm} kindFilterValue={kindFilter} onKindFilterChange={setKindFilter} />

                            <div className="loop-filter-checkbox">
                                <input type="checkbox" id="loop-filter" checked={showLoopsOnly} onChange={(e) => setShowLoopsOnly(e.target.checked)} />
                                <label htmlFor="loop-filter">🔄 Show Only Circular Dependencies</label>
                            </div>

                            <div className="loop-filter-checkbox">
                                <input type="checkbox" id="missing-filter" checked={showMissingOnly} onChange={(e) => setShowMissingOnly(e.target.checked)} />
                                <label htmlFor="missing-filter">⚠️ Show Only Missing Dependencies</label>
                            </div>

                            <div className="loop-filter-checkbox">
                                <input type="checkbox" id="import-blockers-filter" checked={showImportBlockersOnly} onChange={(e) => setShowImportBlockersOnly(e.target.checked)} />
                                <label htmlFor="import-blockers-filter">🚫 Show Components Impacting Import</label>
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
                                <button className={`view-tab ${viewMode === "tree" ? "active" : ""}`} onClick={() => setViewMode("tree")}>
                                    🌳 List View
                                </button>
                                {analysisResult.stats.loopCount > 0 && (
                                    <button className={`view-tab ${viewMode === "graph" ? "active" : ""}`} onClick={() => setViewMode("graph")}>
                                        🔄 Circular Dependencies Graph
                                    </button>
                                )}
                                <button className={`view-tab ${viewMode === "summary" ? "active" : ""}`} onClick={() => setViewMode("summary")}>
                                    📋 Summary Report
                                </button>
                            </div>

                            <div className="view-content">
                                {viewMode === "tree" && (
                                    <TreeView
                                        assets={analysisResult.assets}
                                        onAssetClick={handleAssetClick}
                                        selectedAssetId={selectedAsset?.assetId || null}
                                        searchTerm={searchTerm}
                                        kindFilter={kindFilter}
                                        showOnlyLoops={showLoopsOnly}
                                        showOnlyMissing={showMissingOnly}
                                        showOnlyImportBlockers={showImportBlockersOnly}
                                    />
                                )}

                                {viewMode === "graph" && analysisResult.stats.loopCount > 0 && (
                                    <DependencyGraph
                                        assets={analysisResult.assets.filter((a) => a.hasLoop)}
                                        links={analysisResult.links.filter((l) => {
                                            const source = analysisResult.assets.find((a) => a.assetId === l.sourceId);
                                            const target = analysisResult.assets.find((a) => a.assetId === l.targetId);
                                            return source?.hasLoop || target?.hasLoop;
                                        })}
                                        onAssetClick={handleGraphAssetClick}
                                        selectedAssetId={selectedAsset?.assetId || null}
                                    />
                                )}

                                {viewMode === "summary" && <SummaryReport analysisData={analysisResult} solutionName={getSelectedSolutionName()} />}
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
                <div className={`column-right ${selectedAsset && isDetailsVisible ? "visible" : "hidden"}`}>
                    {selectedAsset && isDetailsVisible && (
                        <div className="details-close-button">
                            <button onClick={() => setIsDetailsVisible(false)} className="close-btn" title="Close details">
                                ✕
                            </button>
                        </div>
                    )}
                    {analysisResult && <AssetDetails selectedAsset={selectedAsset} allAssets={analysisResult.assets} onAssetClick={handleAssetClick} />}
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
