import { useState } from "react";
import { AnalysisOutput, AssetKind } from "../models/interfaces";

interface SummaryReportProps {
    analysisData: AnalysisOutput;
    solutionName: string;
}

function isExcludedManagedAsset(asset: AnalysisOutput["assets"][number]): boolean {
    return asset.isManaged === true;
}

export function SummaryReport({ analysisData, solutionName }: SummaryReportProps) {
    const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");

    const isEffectivelyManaged = (asset: AnalysisOutput["assets"][number]): boolean => {
        if (asset.isManaged === true) {
            return true;
        }

        if (asset.parentEntityId) {
            const parentEntity = analysisData.assets.find((candidate) => candidate.assetId === asset.parentEntityId);
            return parentEntity?.isManaged === true;
        }

        return false;
    };

    const scopedAssets = analysisData.assets;
    const scopedAssetIds = new Set(scopedAssets.map((asset) => asset.assetId));
    const excludedManagedAssets = analysisData.assets.filter((asset) => isEffectivelyManaged(asset) && asset.hasWarning);

    const scopedMissingAssets = scopedAssets.filter((asset) => asset.notFound);
    const scopedWarningAssets = scopedAssets.filter((asset) => asset.hasWarning && !isEffectivelyManaged(asset));
    const scopedLoopAssets = scopedAssets.filter((asset) => asset.hasLoop);

    const blockerIds = new Set([...scopedMissingAssets, ...scopedWarningAssets, ...scopedLoopAssets].map((asset) => asset.assetId));
    const blockerCount = blockerIds.size;

    const scopedLoops = analysisData.loops.filter((loop) => loop.some((assetId) => scopedAssetIds.has(assetId)));

    const importReadinessScore = Math.max(0, 100 - scopedMissingAssets.length * 30 - scopedWarningAssets.length * 20 - scopedLoops.length * 15);
    const willImportSucceed = blockerCount === 0;

    const generateCSVContent = (): string => {
        const headers = ["Asset ID", "Name", "Type", "Logical Name", "Dependencies", "Dependent By", "Has Circular Ref", "Not Found"];
        const rows = analysisData.assets.map((asset) => [
            asset.assetId,
            asset.label,
            asset.kind,
            asset.logicalName,
            asset.linksTo.length.toString(),
            (asset.linkedBy || []).length.toString(),
            asset.hasLoop ? "Yes" : "No",
            asset.notFound ? "Yes" : "No",
        ]);

        const csvLines = [headers, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","));

        return csvLines.join("\n");
    };

    const generateJSONContent = (): string => {
        const exportData = {
            solution: solutionName,
            timestamp: new Date().toISOString(),
            summary: analysisData.stats,
            importReadiness: {
                willImportSucceed,
                score: importReadinessScore,
                excludedManagedAssets: excludedManagedAssets.map((asset) => ({
                    id: asset.assetId,
                    name: asset.label,
                    type: asset.kind,
                    logicalName: asset.logicalName,
                    isManaged: asset.isManaged === true,
                })),
                blockers: {
                    missing: scopedMissingAssets.map((asset) => asset.assetId),
                    warnings: scopedWarningAssets.map((asset) => asset.assetId),
                    circularChains: scopedLoops,
                },
            },
            assets: analysisData.assets.map((asset) => ({
                id: asset.assetId,
                name: asset.label,
                fullName: asset.fullName,
                type: asset.kind,
                logicalName: asset.logicalName,
                dependencies: asset.linksTo,
                dependentBy: asset.linkedBy || [],
                hasCircularDependency: asset.hasLoop,
                circularChain: asset.loopChain || null,
                notFound: asset.notFound || false,
            })),
            links: analysisData.links,
            circularDependencies: analysisData.loops.map((loop, idx) => ({
                id: idx + 1,
                chain: loop,
            })),
        };

        return JSON.stringify(exportData, null, 2);
    };

    const handleExportData = async () => {
        const content = exportFormat === "csv" ? generateCSVContent() : generateJSONContent();
        const fileExtension = exportFormat === "csv" ? "csv" : "json";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
        const filename = `dependency-analysis-${timestamp}.${fileExtension}`;

        if (window.toolboxAPI) {
            try {
                await window.toolboxAPI.fileSystem.saveFile(filename, content);
                await window.toolboxAPI.utils.showNotification({
                    title: "Export Success",
                    body: `Analysis exported to ${filename}`,
                    type: "success",
                });
            } catch (err: any) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Export Failed",
                    body: err.message || "Unknown error",
                    type: "error",
                });
            }
        }
    };

    const calculateComplexityScore = (): number => {
        const avgDependencies = analysisData.stats.assetCount > 0 ? analysisData.stats.linkCount / analysisData.stats.assetCount : 0;
        const circularPenalty = analysisData.stats.loopCount * 10;
        return Math.round(avgDependencies * 10 + circularPenalty);
    };

    const getMostConnectedAssets = (limit: number = 5) => {
        return [...analysisData.assets]
            .sort((a, b) => {
                const aTotal = a.linksTo.length + (a.linkedBy?.length || 0);
                const bTotal = b.linksTo.length + (b.linkedBy?.length || 0);
                return bTotal - aTotal;
            })
            .slice(0, limit);
    };

    const complexityScore = calculateComplexityScore();
    const topAssets = getMostConnectedAssets();

    return (
        <div className="summary-report">
            <div className="report-header">
                <h2>Dependency Analysis Report</h2>
                <p className="solution-name">Solution: {solutionName}</p>
                <p className="report-timestamp">Generated: {new Date().toLocaleString()}</p>
            </div>

            <div className="statistics-grid">
                <div className="stat-card">
                    <div className="stat-value">{analysisData.stats.assetCount}</div>
                    <div className="stat-label">Total Components</div>
                </div>

                <div className="stat-card">
                    <div className="stat-value">{analysisData.stats.linkCount}</div>
                    <div className="stat-label">Dependencies</div>
                </div>

                <div className={`stat-card ${analysisData.stats.loopCount > 0 ? "warning" : ""}`}>
                    <div className="stat-value">{analysisData.stats.loopCount}</div>
                    <div className="stat-label">Circular Dependencies</div>
                </div>

                <div className="stat-card">
                    <div className="stat-value">{analysisData.notFoundAssets.length}</div>
                    <div className="stat-label">Missing References</div>
                </div>

                <div className="stat-card complexity">
                    <div className="stat-value">{complexityScore}</div>
                    <div className="stat-label">Complexity Score</div>
                </div>
            </div>

            <div className="breakdown-section">
                <h3>Import Readiness</h3>
                <div className="statistics-grid">
                    <div className={`stat-card ${willImportSucceed ? "" : "warning"}`}>
                        <div className="stat-value">{willImportSucceed ? "Yes" : "No"}</div>
                        <div className="stat-label">Likely Import Success</div>
                    </div>

                    <div className={`stat-card ${importReadinessScore < 80 ? "warning" : ""}`}>
                        <div className="stat-value">{importReadinessScore}</div>
                        <div className="stat-label">Import Readiness Score</div>
                    </div>

                    <div className={`stat-card ${blockerCount > 0 ? "warning" : ""}`}>
                        <div className="stat-value">{blockerCount}</div>
                        <div className="stat-label">Blocking Components</div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-value">{excludedManagedAssets.length}</div>
                        <div className="stat-label">Excluded Managed Baseline</div>
                    </div>
                </div>

                <p>Assessment excludes components flagged as managed in Dataverse metadata so managed dependencies do not reduce import readiness.</p>

                {blockerCount > 0 && (
                    <ul className="missing-list">
                        {scopedMissingAssets.length > 0 && <li>Missing references: {scopedMissingAssets.length}</li>}
                        {scopedWarningAssets.length > 0 && <li>Not-in-solution warnings: {scopedWarningAssets.length}</li>}
                        {scopedLoops.length > 0 && <li>Circular dependency chains: {scopedLoops.length}</li>}
                    </ul>
                )}
            </div>

            <div className="breakdown-section">
                <h3>Component Type Breakdown</h3>
                <div className="type-breakdown">
                    {Object.entries(analysisData.stats.kindStats)
                        .filter(([_, count]) => count > 0)
                        .sort(([_, a], [__, b]) => b - a)
                        .map(([type, count]) => (
                            <div key={type} className="type-row">
                                <span className="type-icon">{getTypeIcon(type as AssetKind)}</span>
                                <span className="type-name">{type}</span>
                                <span className="type-count">{count}</span>
                                <div
                                    className="type-bar"
                                    style={{
                                        width: `${(count / analysisData.stats.assetCount) * 100}%`,
                                    }}
                                />
                            </div>
                        ))}
                </div>
            </div>

            {topAssets.length > 0 && (
                <div className="top-assets-section">
                    <h3>Most Connected Components</h3>
                    <table className="assets-table">
                        <thead>
                            <tr>
                                <th>Component</th>
                                <th>Type</th>
                                <th>Dependencies</th>
                                <th>Dependent By</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topAssets.map((asset) => (
                                <tr key={asset.assetId}>
                                    <td>{asset.label}</td>
                                    <td>
                                        <span className="type-badge">{asset.kind}</span>
                                    </td>
                                    <td>{asset.linksTo.length}</td>
                                    <td>{asset.linkedBy?.length || 0}</td>
                                    <td>
                                        <strong>{asset.linksTo.length + (asset.linkedBy?.length || 0)}</strong>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {analysisData.loops.length > 0 && (
                <div className="circular-deps-section">
                    <h3>⚠️ Circular Dependencies Detected</h3>
                    {analysisData.loops.map((loop, idx) => (
                        <div key={idx} className="circular-chain">
                            <strong>Chain {idx + 1}:</strong>
                            <div className="chain-flow">
                                {loop.map((assetId, i) => {
                                    const asset = analysisData.assets.find((a) => a.assetId === assetId);
                                    return (
                                        <span key={i}>
                                            {asset?.label || assetId}
                                            {i < loop.length - 1 && " → "}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {analysisData.notFoundAssets.length > 0 && (
                <div className="missing-refs-section">
                    <h3>⚠️ Missing References</h3>
                    <p>The following dependencies were referenced but not found in the solution:</p>
                    <ul className="missing-list">
                        {analysisData.notFoundAssets.map((asset) => (
                            <li key={asset.assetId}>{asset.assetId}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="export-section">
                <h3>Export Analysis</h3>
                <div className="export-controls">
                    <label>
                        <input type="radio" value="csv" checked={exportFormat === "csv"} onChange={(e) => setExportFormat(e.target.value as "csv")} />
                        CSV Format
                    </label>
                    <label>
                        <input type="radio" value="json" checked={exportFormat === "json"} onChange={(e) => setExportFormat(e.target.value as "json")} />
                        JSON Format
                    </label>
                    <button onClick={handleExportData} className="export-button">
                        📥 Export {exportFormat.toUpperCase()}
                    </button>
                </div>
            </div>
        </div>
    );
}

function getTypeIcon(kind: AssetKind): string {
    const icons: Record<AssetKind, string> = {
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
    return icons[kind] || "❓";
}
