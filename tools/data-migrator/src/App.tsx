import { useEffect, useState } from "react";
import { AutoMappingPanel } from "./components/AutoMappingPanel";
import { EntitySelector } from "./components/EntitySelector";
import { FieldSelector } from "./components/FieldSelector";
import { LookupMapper } from "./components/LookupMapper";
import { MigrationProgress as MigrationProgressComponent } from "./components/MigrationProgress";
import { OperationSelector } from "./components/OperationSelector";
import { PreviewData } from "./components/PreviewData";
import { AutoMappingResult, DataverseEntity, FieldMapping, LookupMapping, MigrationConfig, MigrationOperation, MigrationProgress, PreviewRecord } from "./models/interfaces";
import "./styles/App.css";
import { DataverseClient } from "./utils/DataverseClient";
import { isReferenceFieldType } from "./utils/fieldUtils";
import { MigrationEngine } from "./utils/MigrationEngine";

// Extends the published DataverseConnection type to include the environmentColor
// property that PPTB returns at runtime (user-configurable per connection).
type DataverseConnectionWithColor = ToolBoxAPI.DataverseConnection & {
    environmentColor?: string;
};

function App() {
    const [isPPTB, setIsPPTB] = useState<boolean>(false);
    const [connectionUrl, setConnectionUrl] = useState<string>("");
    const [connectionName, setConnectionName] = useState<string>("");
    const [connectionEnvironment, setConnectionEnvironment] = useState<string>("");
    const [connectionEnvironmentColor, setConnectionEnvironmentColor] = useState<string>("");
    const [secondaryConnectionUrl, setSecondaryConnectionUrl] = useState<string>("");
    const [secondaryConnectionName, setSecondaryConnectionName] = useState<string>("");
    const [secondaryConnectionEnvironment, setSecondaryConnectionEnvironment] = useState<string>("");
    const [secondaryConnectionEnvironmentColor, setSecondaryConnectionEnvironmentColor] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");
    const [launchContext, setLaunchContext] = useState<Record<string, unknown> | null>(null);

    // Entities
    const [entities, setEntities] = useState<DataverseEntity[]>([]);
    const [loadingEntities, setLoadingEntities] = useState<boolean>(false);
    const [selectedEntity, setSelectedEntity] = useState<DataverseEntity | null>(null);
    const [loadingFields, setLoadingFields] = useState<boolean>(false);
    const [playlist, setPlaylist] = useState<MigrationConfig[]>([]);
    const [isPlaylistCreated, setIsPlaylistCreated] = useState<boolean>(false);
    const [playlistRunIndex, setPlaylistRunIndex] = useState<number | null>(null);

    // Migration configuration
    const [operations, setOperations] = useState<MigrationOperation[]>(["create"]);
    const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
    const [lookupMappings, setLookupMappings] = useState<LookupMapping[]>([]);
    const [filterType, setFilterType] = useState<"odata" | "fetchxml">("odata");
    const [filterQuery, setFilterQuery] = useState<string>("");
    const [batchSize, setBatchSize] = useState<number>(50);

    // Preview
    const [showPreview, setShowPreview] = useState<boolean>(false);
    const [previewRecords, setPreviewRecords] = useState<PreviewRecord[]>([]);
    const [loadingPreview, setLoadingPreview] = useState<boolean>(false);

    // Migration progress
    const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
    const [isMigrating, setIsMigrating] = useState<boolean>(false);

    // Auto-mapping
    const [showAutoMapping, setShowAutoMapping] = useState<boolean>(false);
    const [userMappings, setUserMappings] = useState<AutoMappingResult[]>([]);
    const [teamMappings, setTeamMappings] = useState<AutoMappingResult[]>([]);
    const [businessUnitMappings, setBusinessUnitMappings] = useState<AutoMappingResult[]>([]);

    // Step management for better UX - track which steps are expanded
    const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([1]));
    const [isLaunchingFxs, setIsLaunchingFxs] = useState<boolean>(false);

    const [migrationEngine] = useState<MigrationEngine>(() => new MigrationEngine());

    const getCurrentConfiguration = (): MigrationConfig | null => selectedEntity ? ({
        entityLogicalName: selectedEntity.logicalName,
        entityDisplayName: selectedEntity.displayName,
        operations,
        fieldMappings,
        lookupMappings,
        filterQuery: filterQuery || undefined,
        filterType,
        batchSize,
    }) : null;

    // Detect environment and initialize
    useEffect(() => {
        const initializeEnvironment = async () => {
            if (window.toolboxAPI) {
                setIsPPTB(true);

                try {
                    // Get active (source) connection
                    const activeConnection = (await window.toolboxAPI.connections.getActiveConnection()) as DataverseConnectionWithColor | null;
                    setConnectionUrl(activeConnection?.url || "");
                    setConnectionName(activeConnection?.name || "");
                    setConnectionEnvironment(activeConnection?.environment || "");
                    setConnectionEnvironmentColor(activeConnection?.environmentColor || "");

                    // Get secondary (target) connection
                    const secondaryConnection = (await window.toolboxAPI.connections.getSecondaryConnection()) as DataverseConnectionWithColor | null;
                    setSecondaryConnectionUrl(secondaryConnection?.url || "");
                    setSecondaryConnectionName(secondaryConnection?.name || "");
                    setSecondaryConnectionEnvironment(secondaryConnection?.environment || "");
                    setSecondaryConnectionEnvironmentColor(secondaryConnection?.environmentColor || "");

                    // Identify if launch context exists
                    const launchContext = await window.toolboxAPI.invocation.getLaunchContext();
                    setLaunchContext(launchContext);

                    if (!secondaryConnection) {
                        setError("Please select a secondary connection as the target environment");
                    }
                } catch (error) {
                    console.error("Failed to get connections:", error);
                    setError("Failed to get connections from PPTB");
                }

                setLoading(false);
            } else {
                // Not in supported environment
                setError("This tool only works in Power Platform ToolBox (PPTB)");
                setLoading(false);
            }
        };

        initializeEnvironment();
    }, []);

    // Load entities when connections are available
    useEffect(() => {
        if (connectionUrl && secondaryConnectionUrl) {
            loadEntities();
        }
    }, [connectionUrl, secondaryConnectionUrl]);

    const loadEntities = async () => {
        setLoadingEntities(true);
        setError("");

        try {
            const client = new DataverseClient("primary");
            const entityList = await client.fetchAllEntities();
            setEntities(entityList.sort((a, b) => a.displayName.localeCompare(b.displayName)));

            // Pre-select entity if launch context is available
            if (launchContext) {
                const preselectedEntityName = launchContext?.entityLogicalName;
                const preselectedFetchXML = launchContext?.fetchXml;
                if (preselectedEntityName) {
                    const preselectedEntity = entityList.find((e) => e.logicalName === preselectedEntityName);
                    if (preselectedEntity) {
                        await handleEntitySelect(preselectedEntity);
                    }
                }
                if (preselectedFetchXML) {
                    setFilterType("fetchxml");
                    setFilterQuery(preselectedFetchXML as string);
                }
            }
        } catch (error: any) {
            setError(`Failed to load entities: ${error.message}`);
        } finally {
            setLoadingEntities(false);
        }
    };

    // Helper functions for step management
    const toggleStep = (stepNumber: number) => {
        const newExpanded = new Set(expandedSteps);
        if (newExpanded.has(stepNumber)) {
            newExpanded.delete(stepNumber);
        } else {
            newExpanded.add(stepNumber);
        }
        setExpandedSteps(newExpanded);
    };

    const autoCollapseAndExpand = (_currentStepNum: number, nextStepNum: number) => {
        const newExpanded = new Set<number>();
        // Collapse current step, expand next step
        newExpanded.add(nextStepNum);
        setExpandedSteps(newExpanded);
    };

    const handleEntitySelect = async (entity: DataverseEntity) => {
        setSelectedEntity(entity);
        setLoadingFields(true);
        setError("");

        // Collapse step 1, expand step 2
        autoCollapseAndExpand(1, 2);

        try {
            // Load fields for the selected entity
            const client = new DataverseClient("primary");
            const fields = await client.fetchEntityFields(entity.logicalName);

            // Sort fields by display name
            const sortedFields = [...fields].sort((a, b) => a.displayName.localeCompare(b.displayName));

            const updatedEntity = { ...entity, fields: sortedFields };
            setSelectedEntity(updatedEntity);

            // Initialize field mappings with sorted fields
            const mappings: FieldMapping[] = sortedFields.map((field) => ({
                sourceField: field.logicalName,
                targetField: field.logicalName,
                isEnabled: !field.isPrimaryId, // Exclude primary ID by default
                fieldType: field.type,
            }));
            setFieldMappings(mappings);

            // Initialize lookup mappings for reference fields
            const lookupFields = fields.filter((f) => isReferenceFieldType(f.type));

            const lookups: LookupMapping[] = lookupFields.map((field) => ({
                fieldName: field.logicalName,
                fieldDisplayName: field.displayName,
                targetEntity: field.targets?.[0] || "",
                strategy: "auto",
            }));
            setLookupMappings(lookups);

            // Reset preview and migration progress
            setPreviewRecords([]);
            setMigrationProgress(null);
        } catch (error: any) {
            setError(`Failed to load fields: ${error.message}`);
        } finally {
            setLoadingFields(false);
        }
    };

    const handleAutoMapping = async () => {
        setShowAutoMapping(true);
        setError("");

        try {
            // Auto-map users, teams, and business units
            const users = await migrationEngine.autoMapUsers();
            const teams = await migrationEngine.autoMapTeams();
            const businessUnits = await migrationEngine.autoMapBusinessUnits();

            setUserMappings(users);
            setTeamMappings(teams);
            setBusinessUnitMappings(businessUnits);
        } catch (error: any) {
            setError(`Failed to auto-map: ${error.message}`);
        }
    };

    const handlePreview = async () => {
        if (!selectedEntity) {
            setError("Please select an entity first");
            return;
        }

        setLoadingPreview(true);
        setError("");

        try {
            const client = new DataverseClient("primary");
            const selectFields = fieldMappings
                .filter((m) => m.isEnabled)
                .map((m) => {
                    // Dataverse OData Web API represents lookup fields as _fieldname_value in $select
                    if (isReferenceFieldType(m.fieldType)) {
                        return `_${m.sourceField}_value`;
                    }
                    return m.sourceField;
                });

            // Add primary ID and primary name fields
            if (!selectFields.includes(selectedEntity.primaryIdAttribute)) {
                selectFields.push(selectedEntity.primaryIdAttribute);
            }
            if (!selectFields.includes(selectedEntity.primaryNameAttribute)) {
                selectFields.push(selectedEntity.primaryNameAttribute);
            }

            let sourceRecords: any[];

            if (filterType === "fetchxml" && filterQuery) {
                // Use FetchXML query
                sourceRecords = await client.queryRecordsWithFetchXml(filterQuery);
            } else {
                // Use OData query
                sourceRecords = await client.queryRecords(
                    selectedEntity.logicalName,
                    selectFields,
                    filterQuery || undefined,
                    undefined,
                    100, // Limit preview to 100 records
                    selectedEntity.entitySetName,
                );
            }

            // Normalize lookup fields: OData returns _fieldname_value keys, but the preview table
            // renders cells using the bare logical name. Copy the value so both keys are present.
            const enabledLookupFields = fieldMappings.filter((m) => m.isEnabled && isReferenceFieldType(m.fieldType)).map((m) => m.sourceField);

            const preview: PreviewRecord[] = sourceRecords.map((record) => {
                const normalizedData = { ...record };
                for (const fieldName of enabledLookupFields) {
                    const odataKey = `_${fieldName}_value`;
                    // OData never returns both keys, but guard against overwriting if it ever does
                    if (odataKey in normalizedData && !(fieldName in normalizedData)) {
                        normalizedData[fieldName] = normalizedData[odataKey];
                    }
                }
                return {
                    action: (operations[0] || "create").toUpperCase() as "CREATE" | "UPDATE" | "DELETE",
                    data: normalizedData,
                    primaryId: normalizedData[selectedEntity.primaryIdAttribute] || "",
                    primaryName: normalizedData[selectedEntity.primaryNameAttribute] || "",
                    isSelected: true, // Default all records to selected
                };
            });

            setPreviewRecords(preview);
            setShowPreview(true);
        } catch (error: any) {
            setError(`Failed to load preview: ${error.message}`);
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleStartMigration = async (selectedRecords: PreviewRecord[]) => {
        if (!selectedEntity) {
            setError("Please select an entity first");
            return;
        }

        if (selectedRecords.length === 0) {
            setError("No records selected for migration");
            return;
        }

        setShowPreview(false);
        setIsMigrating(true);
        setError("");

        const config = getCurrentConfiguration()!;

        let migrationSucceeded = false;
        try {
            let failed = 0;
            await migrationEngine.migrateRecords(config, selectedRecords, (progress) => {
                failed = progress.failed;
                setMigrationProgress(progress);
            });
            if (failed > 0) throw new Error(`${failed} record(s) failed; the remaining playlist was stopped.`);
            migrationSucceeded = true;
        } catch (error: any) {
            setError(`Migration failed: ${error.message}`);
        } finally {
            setIsMigrating(false);
        }
        if (!migrationSucceeded && playlistRunIndex !== null) {
            setPlaylistRunIndex(null);
            return;
        }
        if (migrationSucceeded && playlistRunIndex !== null) {
            const nextIndex = playlistRunIndex + 1;
            if (nextIndex < playlist.length) {
                setPlaylistRunIndex(nextIndex);
                await activateConfiguration(playlist[nextIndex]);
                setError(`Next playlist entity loaded (${nextIndex + 1} of ${playlist.length}). Preview it to continue.`);
            } else {
                setPlaylistRunIndex(null);
                setError("Playlist completed.");
            }
        }
    };

    const handleAddToPlaylist = () => {
        const config = getCurrentConfiguration();
        if (!config || !isPlaylistCreated) return;

        setPlaylist((current) => {
            const existingIndex = current.findIndex((item) => item.entityLogicalName === config.entityLogicalName);
            if (existingIndex < 0) return [...current, config];
            return current.map((item, index) => index === existingIndex ? config : item);
        });
        setError("");
    };

    const handleCreatePlaylist = () => {
        setPlaylist([]);
        setIsPlaylistCreated(true);
        setPlaylistRunIndex(null);
        setError("");
    };

    const handleReorderPlaylist = (index: number, offset: number) => {
        setPlaylist((current) => {
            const targetIndex = index + offset;
            if (targetIndex < 0 || targetIndex >= current.length) return current;
            const reordered = [...current];
            [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
            return reordered;
        });
    };

    const activateConfiguration = async (config: MigrationConfig) => {
        const entity = entities.find((item) => item.logicalName === config.entityLogicalName);
        if (!entity) {
            setError(`Entity "${config.entityLogicalName}" not found in this environment`);
            return;
        }

        await handleEntitySelect(entity);
        setOperations(config.operations || ["create"]);
        setFieldMappings(config.fieldMappings || []);
        setLookupMappings((config.lookupMappings || []).map((mapping) => ({
            ...mapping,
            manualMappings: mapping.manualMappings instanceof Map
                ? mapping.manualMappings
                : mapping.manualMappings
                  ? new Map(mapping.manualMappings as unknown as [string, string][])
                  : undefined,
        })));
        setFilterType(config.filterType || "odata");
        setFilterQuery(config.filterQuery || "");
        setBatchSize(config.batchSize || 50);
    };

    const handleRunPlaylist = async () => {
        if (playlist.length === 0) {
            setError("Add at least one entity to the playlist");
            return;
        }
        if (!window.confirm(`Start this ${playlist.length}-entity playlist in order?\n\n${playlist.map((item, index) => `${index + 1}. ${item.entityDisplayName}`).join("\n")}\n\nEach entity will still require preview and confirmation before migration.`)) return;
        const activeConfig = getCurrentConfiguration();
        const configurations = playlist.map((item) => (
            item.entityLogicalName === selectedEntity?.logicalName ? activeConfig! : item
        ));
        setPlaylist(configurations);
        setPlaylistRunIndex(0);
        setError("");
        setMigrationProgress(null);
        await activateConfiguration(configurations[0]);
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Initializing...</p>
            </div>
        );
    }

    if (!isPPTB) {
        return (
            <div className="error-container">
                <h2>Unsupported Environment</h2>
                <p>{error}</p>
            </div>
        );
    }

    const handleOpenFetchXmlStudio = async () => {
        if (!window.toolboxAPI?.invocation) return;

        setIsLaunchingFxs(true);
        setError("");

        try {
            const result = await window.toolboxAPI.invocation.launchTool("@mohsinonxrm/pptb-fetchxml-studio", filterQuery ? { fetchXml: filterQuery } : undefined);

            const fetchxml = result !== null ? (result as { fetchXml?: string }).fetchXml : undefined;
            if (fetchxml) {
                setFilterQuery(fetchxml);
            }
        } catch (err) {
            setError(`Cannot open FetchXML Studio: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLaunchingFxs(false);
        }
    };

    const handleSaveConfiguration = () => {
        const serializeLookupMappings = (item: MigrationConfig) => ({
            ...item,
            lookupMappings: item.lookupMappings.map((mapping) => ({
                ...mapping,
                manualMappings: mapping.manualMappings instanceof Map ? Array.from(mapping.manualMappings.entries()) : mapping.manualMappings,
            })),
        });
        const config = isPlaylistCreated
            ? {
                entities: playlist.map(serializeLookupMappings),
                version: "1.0",
            }
            : (() => {
                const currentConfig = getCurrentConfiguration();
                return currentConfig ? {
                    ...serializeLookupMappings(currentConfig),
                    version: "1.0",
                } : null;
            })();
        if (!config) return;

        const json = JSON.stringify(config, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `migration-config-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleLoadConfiguration = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const config = JSON.parse(text);
            const savedConfigurations = Array.isArray(config.entities) ? config.entities : [config];
            const validConfigurations = savedConfigurations
                .filter((item: MigrationConfig) => entities.some((entity) => entity.logicalName === item.entityLogicalName))
                .map((item: MigrationConfig) => ({
                    ...item,
                    lookupMappings: (item.lookupMappings || []).map((mapping) => ({
                        ...mapping,
                        manualMappings: mapping.manualMappings instanceof Map
                            ? mapping.manualMappings
                            : mapping.manualMappings
                              ? new Map(mapping.manualMappings as unknown as [string, string][])
                              : undefined,
                    })),
                }));
            const missingEntities = savedConfigurations
                .filter((item: MigrationConfig) => !entities.some((entity) => entity.logicalName === item.entityLogicalName))
                .map((item: MigrationConfig) => item.entityLogicalName);
            if (validConfigurations.length === 0) {
                throw new Error(`No saved entities were found in this environment${missingEntities.length ? `: ${missingEntities.join(", ")}` : ""}`);
            }
            const isPlaylistConfiguration = Array.isArray(config.entities);
            setIsPlaylistCreated(isPlaylistConfiguration);
            setPlaylist(isPlaylistConfiguration ? validConfigurations : []);
            await activateConfiguration(validConfigurations[0]);
            if (missingEntities.length) setError(`Skipped entities not found in this environment: ${missingEntities.join(", ")}`);
        } catch (error: any) {
            setError(`Failed to load configuration: ${error.message}`);
        }

        // Reset input
        event.target.value = "";
    };

    const handleResetConfiguration = () => {
        // Reset all configuration to initial state
        setPlaylist([]);
        setIsPlaylistCreated(false);
        setPlaylistRunIndex(null);
        setSelectedEntity(null);
        setFieldMappings([]);
        setLookupMappings([]);
        setOperations(["create"]);
        setFilterType("odata");
        setFilterQuery("");
        setBatchSize(50);
        setPreviewRecords([]);
        setMigrationProgress(null);
        setShowPreview(false);
        setError("");
        setExpandedSteps(new Set([1]));
        setUserMappings([]);
        setTeamMappings([]);
        setBusinessUnitMappings([]);
    };

    return (
        <div className="app-container">
            <div className="content-fluid">
                {/* Header with connections */}
                <div className="header-card">
                    <div className="header-content">
                        <h1 className="app-title">Data Migrator</h1>
                        {connectionUrl && secondaryConnectionUrl && (
                            <div className="connection-flow">
                                <div
                                    className={`connection-badge env-${connectionEnvironment ? connectionEnvironment.toLowerCase() : "default"}`}
                                    style={connectionEnvironmentColor ? { borderLeftColor: connectionEnvironmentColor } : undefined}
                                >
                                    <span className="connection-label">Source</span>
                                    {connectionName && <span className="connection-name">{connectionName}</span>}
                                    <span className="connection-url">{new URL(connectionUrl).hostname}</span>
                                </div>
                                <div className="flow-arrow">→</div>
                                <div
                                    className={`connection-badge env-${secondaryConnectionEnvironment ? secondaryConnectionEnvironment.toLowerCase() : "default"}`}
                                    style={secondaryConnectionEnvironmentColor ? { borderLeftColor: secondaryConnectionEnvironmentColor } : undefined}
                                >
                                    <span className="connection-label">Target</span>
                                    {secondaryConnectionName && <span className="connection-name">{secondaryConnectionName}</span>}
                                    <span className="connection-url">{new URL(secondaryConnectionUrl).hostname}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Configuration Save/Load */}
                <div className="config-toolbar">
                    {!isPlaylistCreated && (
                        <button className="btn-secondary" onClick={handleCreatePlaylist} disabled={isMigrating || playlistRunIndex !== null} title="Create an ordered playlist">
                            ➕ Create Playlist
                        </button>
                    )}
                    <button className="btn-secondary" onClick={handleSaveConfiguration} disabled={isMigrating || (!selectedEntity && (!isPlaylistCreated || playlist.length === 0))} title={isPlaylistCreated ? "Save playlist configuration" : "Save current entity configuration"}>
                        💾 {isPlaylistCreated ? "Save Playlist" : "Save Configuration"}
                    </button>
                    <button className="btn-secondary" onClick={handleAddToPlaylist} disabled={!isPlaylistCreated || !selectedEntity || isMigrating || loadingFields || playlistRunIndex !== null} title="Add or update this entity in the playlist">
                        ➕ Add Entity to Playlist
                    </button>
                    <button className="btn-preview" onClick={handleRunPlaylist} disabled={playlist.length === 0 || isMigrating || loadingFields || playlistRunIndex !== null} title="Start the playlist in order">
                        {isMigrating ? "Migrating..." : `▶ Start Playlist (${playlist.length})`}
                    </button>
                    <label className="btn-secondary" style={{ cursor: "pointer" }}>
                        📂 Load Configuration
                        <input type="file" accept=".json" onChange={handleLoadConfiguration} disabled={isMigrating || playlistRunIndex !== null} style={{ display: "none" }} />
                    </label>
                    <button className="btn-secondary btn-reset" onClick={handleResetConfiguration} disabled={isMigrating} title="Reset all configuration">
                        🔄 Reset
                    </button>
                </div>

                {isPlaylistCreated && (
                    <section className="playlist-card" aria-label="Migration playlist">
                        <div className="playlist-header">
                            <h2>Migration Playlist</h2>
                            <span>{playlist.length} {playlist.length === 1 ? "entity" : "entities"} · processed top to bottom</span>
                        </div>
                        {playlist.length === 0 ? (
                            <p className="playlist-empty">Playlist created. Select and configure an entity below, then choose <strong>Add Entity to Playlist</strong>.</p>
                        ) : (
                            <ol className="playlist-items">
                                {playlist.map((item, index) => (
                                    <li key={item.entityLogicalName} className={item.entityLogicalName === selectedEntity?.logicalName ? "active" : ""}>
                                        <button
                                            className="playlist-entity"
                                            onClick={() => {
                                                setPlaylistRunIndex(null);
                                                activateConfiguration(item);
                                            }}
                                            disabled={isMigrating || loadingFields}
                                            title={`Configure ${item.entityDisplayName}`}
                                        >
                                            <span className="playlist-position">{index + 1}</span>
                                            <span>{item.entityDisplayName}</span>
                                            <small>{item.entityLogicalName}</small>
                                        </button>
                                        <div className="playlist-item-actions">
                                            <button onClick={() => handleReorderPlaylist(index, -1)} disabled={index === 0 || isMigrating || playlistRunIndex !== null} aria-label={`Move ${item.entityDisplayName} up`}>↑</button>
                                            <button onClick={() => handleReorderPlaylist(index, 1)} disabled={index === playlist.length - 1 || isMigrating || playlistRunIndex !== null} aria-label={`Move ${item.entityDisplayName} down`}>↓</button>
                                            <button onClick={() => setPlaylist((current) => current.filter((entry) => entry.entityLogicalName !== item.entityLogicalName))} disabled={isMigrating || playlistRunIndex !== null} aria-label={`Remove ${item.entityDisplayName}`}>×</button>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                )}

                {/* Main content with steps */}
                <div className="steps-container">
                    {/* Step 1: Entity Selection */}
                    <div className={`step-card ${expandedSteps.has(1) ? "active" : "collapsed"}`}>
                        <div className="step-header" onClick={() => toggleStep(1)}>
                            <div className="step-number">1</div>
                            <h2 className="step-title">Select Entity</h2>
                            {selectedEntity && <span className="step-count">{selectedEntity.displayName}</span>}
                            <span className="step-toggle">{expandedSteps.has(1) ? "−" : "+"}</span>
                        </div>
                        {expandedSteps.has(1) && (
                            <div className="step-content">
                                <EntitySelector
                                    entities={entities}
                                    selectedEntity={selectedEntity}
                                    onEntitySelect={(entity) => {
                                        setPlaylistRunIndex(null);
                                        handleEntitySelect(entity);
                                    }}
                                    loading={loadingEntities}
                                />
                            </div>
                        )}
                    </div>

                    {/* Loading indicator */}
                    {loadingFields && (
                        <div className="loading-card">
                            <div className="loading-spinner"></div>
                            <p>Loading fields...</p>
                        </div>
                    )}

                    {/* Steps 2-7: Configuration */}
                    {selectedEntity && selectedEntity.fields.length > 0 && !loadingFields && (
                        <>
                            {/* Step 2: Field Selection */}
                            <div className={`step-card ${expandedSteps.has(2) ? "active" : "collapsed"}`}>
                                <div className="step-header" onClick={() => toggleStep(2)}>
                                    <div className="step-number">2</div>
                                    <h2 className="step-title">Select Fields</h2>
                                    <span className="step-count">{fieldMappings.filter((m) => m.isEnabled).length} selected</span>
                                    <span className="step-toggle">{expandedSteps.has(2) ? "−" : "+"}</span>
                                </div>
                                {expandedSteps.has(2) && (
                                    <div className="step-content">
                                        <FieldSelector fields={selectedEntity.fields} fieldMappings={fieldMappings} onFieldMappingsChange={setFieldMappings} />
                                    </div>
                                )}
                            </div>

                            {/* Step 3: Filter Configuration */}
                            <div className={`step-card ${expandedSteps.has(3) ? "active" : "collapsed"}`}>
                                <div className="step-header" onClick={() => toggleStep(3)}>
                                    <div className="step-number">3</div>
                                    <h2 className="step-title">Filter Data</h2>
                                    <span className="step-badge">Optional</span>
                                    <span className="step-toggle">{expandedSteps.has(3) ? "−" : "+"}</span>
                                </div>
                                {expandedSteps.has(3) && (
                                    <div className="step-content">
                                        <div className="filter-type-selector">
                                            <button className={`filter-type-btn ${filterType === "odata" ? "active" : ""}`} onClick={() => setFilterType("odata")}>
                                                OData
                                            </button>
                                            <button className={`filter-type-btn ${filterType === "fetchxml" ? "active" : ""}`} onClick={() => setFilterType("fetchxml")}>
                                                FetchXML
                                            </button>
                                        </div>

                                        <div className="form-group">
                                            {filterType === "odata" ? (
                                                <>
                                                    <label>OData Filter</label>
                                                    <input
                                                        type="text"
                                                        value={filterQuery}
                                                        onChange={(e) => setFilterQuery(e.target.value)}
                                                        placeholder="e.g., statecode eq 0"
                                                        className="modern-input"
                                                    />
                                                    <p className="field-hint">Example: statecode eq 0 and createdon gt 2024-01-01</p>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="fetchxml-label-row">
                                                        <label>FetchXML Query</label>
                                                        <button
                                                            className="btn-secondary btn-fxs"
                                                            onClick={handleOpenFetchXmlStudio}
                                                            disabled={isLaunchingFxs}
                                                            title="Open FetchXML Studio to build or edit this query"
                                                        >
                                                            {isLaunchingFxs ? (
                                                                "Opening..."
                                                            ) : (
                                                                <>
                                                                    <span aria-hidden="true">🔬</span> Open in FetchXML Studio
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                    <textarea
                                                        value={filterQuery}
                                                        onChange={(e) => setFilterQuery(e.target.value)}
                                                        placeholder="<fetch><entity name='account'>...</entity></fetch>"
                                                        className="modern-textarea"
                                                        rows={6}
                                                    />
                                                    <p className="field-hint">Complete FetchXML query including entity and attributes</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Step 4: Settings */}
                            <div className={`step-card ${expandedSteps.has(4) ? "active" : "collapsed"}`}>
                                <div className="step-header" onClick={() => toggleStep(4)}>
                                    <div className="step-number">4</div>
                                    <h2 className="step-title">Settings</h2>
                                    <span className="step-toggle">{expandedSteps.has(4) ? "−" : "+"}</span>
                                </div>
                                {expandedSteps.has(4) && (
                                    <div className="step-content">
                                        <div className="settings-grid">
                                            <div className="setting-item">
                                                <OperationSelector operations={operations} onOperationsChange={setOperations} />
                                            </div>
                                            <div className="setting-item">
                                                <label>Batch Size (Max 100)</label>
                                                <input
                                                    type="number"
                                                    value={batchSize}
                                                    onChange={(e) => setBatchSize(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                                                    min="1"
                                                    max="100"
                                                    className="modern-input"
                                                />
                                                <p className="field-hint">Records per batch</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Step 5: Lookup Mapping */}
                            {lookupMappings.length > 0 && (
                                <div className={`step-card ${expandedSteps.has(5) ? "active" : "collapsed"}`}>
                                    <div className="step-header" onClick={() => toggleStep(5)}>
                                        <div className="step-number">5</div>
                                        <h2 className="step-title">Lookup Mappings</h2>
                                        <span className="step-badge">Optional</span>
                                        <span className="step-toggle">{expandedSteps.has(5) ? "−" : "+"}</span>
                                    </div>
                                    {expandedSteps.has(5) && (
                                        <div className="step-content">
                                            <LookupMapper
                                                lookupMappings={lookupMappings.filter((l) => fieldMappings.find((f) => f.sourceField === l.fieldName && f.isEnabled))}
                                                onLookupMappingsChange={setLookupMappings}
                                                onAutoMapping={handleAutoMapping}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Action Button */}
                            <div className="action-bar">
                                <button className="btn-preview" onClick={handlePreview} disabled={loadingPreview || isMigrating}>
                                    {loadingPreview ? "Loading..." : "Preview Data"}
                                </button>
                            </div>

                            {/* Error Message - appears below preview button */}
                            {error && !isMigrating && !migrationProgress && (
                                <div className="error-message-inline">
                                    <span>⚠️ {error}</span>
                                    <button onClick={() => setError("")}>×</button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Migration Progress - Always show section when entity is selected */}
                {selectedEntity && (
                    <div className="progress-card">
                        {playlistRunIndex !== null && <div className="playlist-progress">Playlist entity {playlistRunIndex + 1} of {playlist.length}: preview and confirm the migration to continue.</div>}
                        {error && (isMigrating || migrationProgress) && (
                            <div className="error-message-progress">
                                <span>⚠️ {error}</span>
                                <button onClick={() => setError("")}>×</button>
                            </div>
                        )}
                        {migrationProgress ? (
                            <MigrationProgressComponent progress={migrationProgress} />
                        ) : (
                            <div className="progress-placeholder">
                                <h3>Migration Status</h3>
                                <p>Select settings and preview data to begin migration</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Preview Modal */}
                {showPreview && selectedEntity && (
                    <PreviewData
                        previewRecords={previewRecords}
                        selectedFields={fieldMappings.filter((m) => m.isEnabled).map((m) => m.sourceField)}
                        fields={selectedEntity.fields}
                        onClose={() => setShowPreview(false)}
                        onConfirm={handleStartMigration}
                    />
                )}

                {/* Auto-Mapping Panel */}
                {showAutoMapping && <AutoMappingPanel userMappings={userMappings} teamMappings={teamMappings} businessUnitMappings={businessUnitMappings} onClose={() => setShowAutoMapping(false)} />}
            </div>
        </div>
    );
}

export default App;
