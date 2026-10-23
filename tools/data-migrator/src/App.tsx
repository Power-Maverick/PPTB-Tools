import { Play16Filled } from "@fluentui/react-icons";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { assertConnectionsUnchanged, getUnavailablePlaylistConnections, resolveMigrationConnections } from "./utils/connections";

function App() {
    const [isPPTB, setIsPPTB] = useState<boolean>(false);
    const [connections, setConnections] = useState<Array<ToolBoxAPI.Connection | null>>([]);
    const [sourceConnectionId, setSourceConnectionId] = useState("");
    const [targetConnectionIds, setTargetConnectionIds] = useState<string[]>([]);
    const [autoMapSystemRecords, setAutoMapSystemRecords] = useState(false);
    const [activePlaylistIndex, setActivePlaylistIndex] = useState<number | null>(null);
    const [activeDestination, setActiveDestination] = useState("");
    const [pendingMigration, setPendingMigration] = useState<PreviewRecord[] | null>(null);
    const [destinationResults, setDestinationResults] = useState<Array<{ id: string; progress: MigrationProgress }>>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshingConnections, setRefreshingConnections] = useState(false);
    const [error, setError] = useState<string>("");
    const [launchContext, setLaunchContext] = useState<Record<string, unknown> | null>(null);
    const launchContextApplied = useRef(false);
    const connectionRevision = useRef(0);
    const refreshQueued = useRef(false);
    const migrationAbort = useRef<AbortController | null>(null);

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
    const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0, 1]));
    const [isLaunchingFxs, setIsLaunchingFxs] = useState<boolean>(false);

    const sourceSlot = connections.findIndex((connection) => connection?.id === sourceConnectionId);
    const connectionLabel = (id: string) => {
        const connection = connections.find((item) => item?.id === id);
        return connection ? `${connection.name} (${connection.url})` : `Unavailable connection: ${id}`;
    };
    const validateConnections = (config: MigrationConfig, slots = connections) => resolveMigrationConnections(config, slots);
    const linkedConnectionCount = connections.filter((connection) => connection !== null).length;
    const unavailablePlaylistConnections = getUnavailablePlaylistConnections(playlist, connections);

    const refreshConnections = useCallback(async () => {
        const revision = ++connectionRevision.current;
        setRefreshingConnections(true);
        setPendingMigration(null);
        setShowPreview(false);
        setShowAutoMapping(false);
        setPreviewRecords([]);
        setSelectedEntity(null);
        setEntities([]);
        setLoadingFields(false);
        setLoadingPreview(false);
        setLoadingEntities(false);
        setPlaylistRunIndex(null);
        setActivePlaylistIndex(null);
        setUserMappings([]);
        setTeamMappings([]);
        setBusinessUnitMappings([]);
        setExpandedSteps(new Set([0, 1]));
        try {
            const slots = await window.toolboxAPI.connections.getConnections();
            if (revision !== connectionRevision.current) return;
            setConnections(slots);
            setSourceConnectionId((id) => slots.some((connection) => connection?.id === id) ? id : "");
            setTargetConnectionIds((ids) => ids.filter((id) => slots.some((connection) => connection?.id === id)));
            if (slots.filter(Boolean).length < 2) setError("Assign at least two connections in PPTB.");
        } catch (error) {
            if (revision !== connectionRevision.current) return;
            setConnections([]);
            setError(`Failed to refresh connections: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            if (revision === connectionRevision.current) {
                setRefreshingConnections(false);
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        if (!window.toolboxAPI) return;
        const onConnectionEvent = (_event: unknown, payload: ToolBoxAPI.ToolBoxEventPayload) => {
            if (!["connection:updated", "connection:created", "connection:deleted"].includes(payload.event)) return;
            if (isMigrating) {
                ++connectionRevision.current;
                migrationAbort.current?.abort(new Error("Connections changed during migration. Remaining records, destinations, and playlist entries were stopped."));
                refreshQueued.current = true;
                setError("Connections changed during migration. Remaining destinations and playlist entries will be stopped; completed changes are not rolled back.");
                return;
            }
            void refreshConnections();
        };
        window.toolboxAPI.events.on(onConnectionEvent);
        if (!isMigrating && refreshQueued.current) {
            refreshQueued.current = false;
            void refreshConnections();
        }
        return () => window.toolboxAPI.events.off(onConnectionEvent);
    }, [isMigrating, refreshConnections]);

    const getCurrentConfiguration = (): MigrationConfig | null =>
        selectedEntity
            ? {
                  entityLogicalName: selectedEntity.logicalName,
                  entityDisplayName: selectedEntity.displayName,
                  operations,
                  fieldMappings,
                  lookupMappings,
                  filterQuery: filterQuery || undefined,
                  filterType,
                  batchSize,
                  sourceConnectionId,
                  targetConnectionIds: [...targetConnectionIds],
                  autoMapSystemRecords,
              }
            : null;

    // Detect environment and initialize
    useEffect(() => {
        let cancelled = false;
        const revision = connectionRevision.current;
        const initializeEnvironment = async () => {
            if (window.toolboxAPI) {
                setIsPPTB(true);

                try {
                    const slots = await window.toolboxAPI.connections.getConnections();
                    if (cancelled || revision !== connectionRevision.current) return;
                    setConnections(slots);
                    setSourceConnectionId(slots[0]?.id || "");
                    setTargetConnectionIds(slots[1] ? [slots[1].id] : []);

                    // Identify if launch context exists
                    const launchContext = await window.toolboxAPI.invocation.getLaunchContext();
                    if (cancelled) return;
                    setLaunchContext(launchContext);

                    if (slots.filter(Boolean).length < 2) {
                        setError("Assign at least two connections in PPTB, then refresh connections below.");
                    }
                } catch (error) {
                    if (cancelled) return;
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
        return () => { cancelled = true; };
    }, []);

    // Load entities when connections are available
    useEffect(() => {
        if (sourceSlot >= 0) {
            let cancelled = false;
            loadEntities(() => cancelled);
            return () => { cancelled = true; };
        }
    }, [sourceConnectionId, connections]);

    const loadEntities = async (cancelled: () => boolean) => {
        const revision = connectionRevision.current;
        setLoadingEntities(true);

        try {
            const client = new DataverseClient(sourceSlot);
            const entityList = await client.fetchAllEntities();
            if (cancelled() || revision !== connectionRevision.current) return;
            setEntities(entityList.sort((a, b) => a.displayName.localeCompare(b.displayName)));

            // Pre-select entity if launch context is available
            if (launchContext && !launchContextApplied.current) {
                launchContextApplied.current = true;
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
            if (!cancelled() && revision === connectionRevision.current) setError(`Failed to load entities: ${error.message}`);
        } finally {
            if (!cancelled() && revision === connectionRevision.current) setLoadingEntities(false);
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

    const handleEntitySelect = async (entity: DataverseEntity, slot = sourceSlot) => {
        const revision = connectionRevision.current;
        setSelectedEntity(null);
        setLoadingFields(true);
        setError("");

        // Collapse step 1, expand step 2
        autoCollapseAndExpand(1, 2);

        try {
            // Load fields for the selected entity
            const client = new DataverseClient(slot);
            const fields = await client.fetchEntityFields(entity.logicalName);
            if (revision !== connectionRevision.current) return false;

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
            return true;
        } catch (error: any) {
            if (revision === connectionRevision.current) setError(`Failed to load fields: ${error.message}`);
            return false;
        } finally {
            if (revision === connectionRevision.current) setLoadingFields(false);
        }
    };

    const handleAutoMapping = async () => {
        const revision = connectionRevision.current;
        setShowAutoMapping(true);
        setError("");

        try {
            const config = getCurrentConfiguration();
            if (!config) throw new Error("Select an entity first.");
            const slots = validateConnections(config);
            const migrationEngine = new MigrationEngine(slots.source, slots.targets[0]);
            // Auto-map users, teams, and business units
            const users = await migrationEngine.autoMapUsers();
            const teams = await migrationEngine.autoMapTeams();
            const businessUnits = await migrationEngine.autoMapBusinessUnits();
            if (revision !== connectionRevision.current) return;

            setUserMappings(users);
            setTeamMappings(teams);
            setBusinessUnitMappings(businessUnits);
            setAutoMapSystemRecords(true);
        } catch (error: any) {
            if (revision === connectionRevision.current) setError(`Failed to auto-map: ${error.message}`);
        }
    };

    const handlePreview = async () => {
        const revision = connectionRevision.current;
        if (!selectedEntity) {
            setError("Please select an entity first");
            return;
        }

        setLoadingPreview(true);
        setError("");

        try {
            const config = getCurrentConfiguration()!;
            validateConnections(config);
            assertConnectionsUnchanged(config, connections, await window.toolboxAPI.connections.getConnections());
            const client = new DataverseClient(sourceSlot);
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

            if (revision !== connectionRevision.current) return;
            setPreviewRecords(preview);
            setShowPreview(true);
        } catch (error: any) {
            if (revision === connectionRevision.current) setError(`Failed to load preview: ${error.message}`);
        } finally {
            if (revision === connectionRevision.current) setLoadingPreview(false);
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

        const config = getCurrentConfiguration()!;
        try {
            validateConnections(config);
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
            return;
        }
        setShowPreview(false);
        setDestinationResults([]);
        setPendingMigration(selectedRecords);
    };

    const executeMigration = async () => {
        if (!pendingMigration || isMigrating) return;
        const selectedRecords = pendingMigration;
        setPendingMigration(null);
        setIsMigrating(true);
        setError("");

        const config = getCurrentConfiguration()!;
        const revision = connectionRevision.current;
        const controller = new AbortController();
        migrationAbort.current = controller;

        let migrationSucceeded = false;
        let closeProtected = false;
        try {
            closeProtected = await window.toolboxAPI.preventClose();
            const liveConnections = await window.toolboxAPI.connections.getConnections();
            assertConnectionsUnchanged(config, connections, liveConnections);
            const slots = validateConnections(config, liveConnections);
            for (const targetSlot of slots.targets) {
                if (revision !== connectionRevision.current) throw new Error("Connections changed during migration. Remaining destinations were stopped.");
                assertConnectionsUnchanged(config, connections, await window.toolboxAPI.connections.getConnections());
                setActiveDestination(connectionLabel(liveConnections[targetSlot]!.id));
                const migrationEngine = new MigrationEngine(slots.source, targetSlot);
                if (config.autoMapSystemRecords) {
                    await migrationEngine.autoMapUsers();
                    await migrationEngine.autoMapTeams();
                    await migrationEngine.autoMapBusinessUnits();
                }
                if (revision !== connectionRevision.current) throw new Error("Connections changed during migration setup. Remaining destinations were stopped.");
                let failed = 0;
                await migrationEngine.migrateRecords(config, selectedRecords, (progress) => {
                    failed = progress.failed;
                    setMigrationProgress(progress);
                    setDestinationResults((current) => {
                        const result = { id: liveConnections[targetSlot]!.id, progress };
                        return [...current.filter((item) => item.id !== result.id), result];
                    });
                }, controller.signal);
                if (failed > 0) throw new Error(`${failed} record(s) failed in ${connectionLabel(liveConnections[targetSlot]!.id)}; remaining destinations and playlist entries were stopped.`);
            }
            if (revision !== connectionRevision.current) throw new Error("Connections changed during migration. Remaining playlist entries were stopped.");
            migrationSucceeded = true;
        } catch (error: any) {
            setError(`Migration failed: ${error.message}`);
        } finally {
            migrationAbort.current = null;
            setIsMigrating(false);
            if (closeProtected) {
                try {
                    await window.toolboxAPI.releasePreventClose();
                } catch (error) {
                    console.error("Failed to release close protection:", error);
                    setError("Migration finished, but close protection could not be released.");
                }
            }
        }
        if ((!migrationSucceeded || revision !== connectionRevision.current) && playlistRunIndex !== null) {
            setPlaylistRunIndex(null);
            return;
        }
        if (migrationSucceeded && playlistRunIndex !== null) {
            const nextIndex = playlistRunIndex + 1;
            if (nextIndex < playlist.length) {
                setPlaylistRunIndex(nextIndex);
                await activateConfiguration(playlist[nextIndex], nextIndex);
            } else {
                setPlaylistRunIndex(null);
                setActiveDestination("Playlist completed.");
            }
        }
    };

    const handleAddToPlaylist = () => {
        const config = getCurrentConfiguration();
        if (!config || !isPlaylistCreated) return;
        try {
            validateConnections(config);
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
            return;
        }
        setPlaylist((current) => [...current, config]);
        setActivePlaylistIndex(null);
        setError("");
    };

    const handleCreatePlaylist = () => {
        setPlaylist([]);
        setIsPlaylistCreated(true);
        setPlaylistRunIndex(null);
        setActivePlaylistIndex(null);
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

    const activateConfiguration = async (config: MigrationConfig, index: number | null = null) => {
        const revision = connectionRevision.current;
        setLoadingFields(true);
        setSelectedEntity(null);
        try {
            const slots = validateConnections(config);
            const entityList = await new DataverseClient(slots.source).fetchAllEntities();
            if (revision !== connectionRevision.current) return;
            const entity = entityList.find((item) => item.logicalName === config.entityLogicalName);
            if (!entity) throw new Error(`Entity "${config.entityLogicalName}" not found in the saved source environment.`);
            setSourceConnectionId(config.sourceConnectionId!);
            setTargetConnectionIds(config.targetConnectionIds!);
            setAutoMapSystemRecords(config.autoMapSystemRecords || false);
            setActivePlaylistIndex(index);
            setUserMappings([]);
            setTeamMappings([]);
            setBusinessUnitMappings([]);
            if (!await handleEntitySelect(entity, slots.source)) {
                setPlaylistRunIndex(null);
                return;
            }
            setOperations(config.operations || ["create"]);
            setFieldMappings(config.fieldMappings || []);
            setLookupMappings(config.lookupMappings || []);
            setFilterType(config.filterType || "odata");
            setFilterQuery(config.filterQuery || "");
            setBatchSize(config.batchSize || 50);
        } catch (error) {
            if (revision === connectionRevision.current) {
                setPlaylistRunIndex(null);
                setError(error instanceof Error ? error.message : String(error));
            }
        } finally {
            if (revision === connectionRevision.current) setLoadingFields(false);
        }
    };

    const handleRunPlaylist = async () => {
        if (playlist.length === 0) {
            setError("Add at least one entity to the playlist");
            return;
        }
        if (
            !window.confirm(
                `Prepare this ${playlist.length}-entry playlist in order?\n\n${playlist.map((item, index) => `${index + 1}. ${item.entityDisplayName}: ${connectionLabel(item.sourceConnectionId || "")} → ${(item.targetConnectionIds || []).map(connectionLabel).join(", ")}`).join("\n")}\n\nNo records are changed until you preview and confirm each entry.`,
            )
        )
            return;
        try {
            playlist.forEach((config) => validateConnections(config));
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
            return;
        }
        setPlaylistRunIndex(0);
        setError("");
        setMigrationProgress(null);
        await activateConfiguration(playlist[0], 0);
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
            const result = await window.toolboxAPI.invocation.launchTool("@mohsinonxrm/pptb-fetchxml-studio", filterQuery ? { fetchXml: filterQuery } : undefined, {
                connectionIds: [sourceConnectionId],
            });

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
                  version: "2.0",
              }
            : (() => {
                  const currentConfig = getCurrentConfiguration();
                  return currentConfig
                      ? {
                            ...serializeLookupMappings(currentConfig),
                            version: "2.0",
                        }
                      : null;
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
                .map((item: MigrationConfig) => {
                    if (config.version === "2.0" && (typeof item.sourceConnectionId !== "string" || !Array.isArray(item.targetConnectionIds))) {
                        throw new Error("Version 2.0 configurations must specify their source and destination connection IDs.");
                    }
                    if (!Number.isInteger(item.batchSize) || item.batchSize < 1 || item.batchSize > 100) {
                        throw new Error("Each entry must specify a batch size between 1 and 100.");
                    }
                    if (!Array.isArray(item.operations) || !item.operations.length || item.operations.some((operation) => !["create", "update", "delete"].includes(operation))) {
                        throw new Error("Each entry must specify valid migration operations.");
                    }
                    return {
                        ...item,
                        sourceConnectionId: item.sourceConnectionId === undefined ? sourceConnectionId : item.sourceConnectionId,
                        targetConnectionIds: item.targetConnectionIds === undefined ? [...targetConnectionIds] : item.targetConnectionIds,
                        lookupMappings: (item.lookupMappings || []).map((mapping) => ({
                            ...mapping,
                            manualMappings:
                                mapping.manualMappings instanceof Map ? mapping.manualMappings : mapping.manualMappings ? new Map(mapping.manualMappings as unknown as [string, string][]) : undefined,
                        })),
                    };
                });
            if (validConfigurations.length === 0) {
                throw new Error("The playlist contains no entries.");
            }
            const isPlaylistConfiguration = Array.isArray(config.entities);
            setIsPlaylistCreated(isPlaylistConfiguration);
            setPlaylist(isPlaylistConfiguration ? validConfigurations : []);
            await activateConfiguration(validConfigurations[0], isPlaylistConfiguration ? 0 : null);
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
        setActivePlaylistIndex(null);
        setAutoMapSystemRecords(false);
        setActiveDestination("");
        setDestinationResults([]);
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
        setExpandedSteps(new Set([0, 1]));
        setUserMappings([]);
        setTeamMappings([]);
        setBusinessUnitMappings([]);
    };

    return (
        <div className="app-container">
            <div className="content-fluid">
                {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss message" onClick={() => setError("")}>×</button></div>}
                <fieldset className={`step-card connection-picker configuration-fields ${expandedSteps.has(0) ? "active" : "collapsed"}`} aria-label="Select environments" disabled={refreshingConnections || isMigrating || loadingFields || loadingPreview || pendingMigration !== null || playlistRunIndex !== null}>
                    <h2 className="environment-heading">
                        <button className="step-header environment-step-header" onClick={() => toggleStep(0)} aria-expanded={expandedSteps.has(0)} aria-controls="environment-settings">
                            <span className="step-number">1</span>
                            <span className="step-title">Select environments</span>
                            <span className="step-count" role="status">{linkedConnectionCount} active {linkedConnectionCount === 1 ? "connection" : "connections"} linked</span>
                            <span className="step-toggle" aria-hidden="true">{expandedSteps.has(0) ? "−" : "+"}</span>
                        </button>
                    </h2>
                    {expandedSteps.has(0) ? <div id="environment-settings" className="step-content environment-settings">
                    <label htmlFor="source-connection">Source environment</label>
                    <select id="source-connection" className="modern-input" value={sourceConnectionId} onChange={(event) => {
                        const id = event.target.value;
                        setSourceConnectionId(id);
                        const source = connections.find((connection) => connection?.id === id);
                        setTargetConnectionIds((current) => current.filter((targetId) => {
                            const target = connections.find((connection) => connection?.id === targetId);
                            return target && target.id !== id && target.url.replace(/\/$/, "").toLowerCase() !== source?.url.replace(/\/$/, "").toLowerCase();
                        }));
                        setSelectedEntity(null);
                        setExpandedSteps(new Set([0, 1]));
                        setEntities([]);
                        setPreviewRecords([]);
                        setShowPreview(false);
                        setMigrationProgress(null);
                        setAutoMapSystemRecords(false);
                        setActivePlaylistIndex(null);
                        setUserMappings([]);
                        setTeamMappings([]);
                        setBusinessUnitMappings([]);
                        setError("");
                    }}>
                        <option value="">Select a source</option>
                        {connections.map((connection, slot) => connection && <option key={slot} value={connection.id}>Connection {slot + 1}: {connectionLabel(connection.id)}</option>)}
                    </select>
                    <div className="destination-heading">Destinations <strong>{targetConnectionIds.length} selected</strong></div>
                    <p className="field-hint">Any connection can be the source. Each destination is processed separately, in selection order.</p>
                    <div className="destination-grid">
                        {connections.map((connection, slot) => connection && connection.id !== sourceConnectionId && (
                            <label key={slot} className={`destination-option ${targetConnectionIds.includes(connection.id) ? "selected" : ""}`}>
                                <input type="checkbox" checked={targetConnectionIds.includes(connection.id)} disabled={!targetConnectionIds.includes(connection.id) && targetConnectionIds.length >= 5}
                                    onChange={(event) => {
                                        setTargetConnectionIds((current) => event.target.checked ? [...current, connection.id] : current.filter((id) => id !== connection.id));
                                        setPreviewRecords([]);
                                        setMigrationProgress(null);
                                        setUserMappings([]);
                                        setTeamMappings([]);
                                        setBusinessUnitMappings([]);
                                    }} />
                                <span><strong>Connection {slot + 1}: {connection.name}</strong><small>{connection.url}</small></span>
                            </label>
                        ))}
                    </div>
                    <button className="btn-secondary" onClick={refreshConnections}>{refreshingConnections ? "Refreshing connections..." : "Refresh connections"}</button>
                    </div> : <p className="environment-route">{sourceConnectionId ? connectionLabel(sourceConnectionId) : "No source selected"} → {targetConnectionIds.length} {targetConnectionIds.length === 1 ? "destination" : "destinations"} selected</p>}
                </fieldset>

                {/* Configuration Save/Load */}
                <fieldset className="config-toolbar configuration-fields" disabled={refreshingConnections || pendingMigration !== null || loadingFields || loadingPreview || isMigrating}>
                    <span className="toolbar-label">Configuration</span>
                    <label className="btn-secondary file-action">
                        Load configuration
                        <input type="file" accept=".json" onChange={handleLoadConfiguration} disabled={isMigrating || playlistRunIndex !== null} />
                    </label>
                    <button
                        className="btn-secondary"
                        onClick={handleSaveConfiguration}
                        disabled={isMigrating || (!selectedEntity && (!isPlaylistCreated || playlist.length === 0))}
                        title={isPlaylistCreated ? "Save playlist configuration" : "Save current entity configuration"}
                    >
                        {isPlaylistCreated ? "Save playlist" : "Save configuration"}
                    </button>
                    <button className="btn-secondary toolbar-reset" onClick={() => {
                        if (window.confirm("Reset the current configuration and playlist? Unsaved changes will be lost.")) handleResetConfiguration();
                    }} disabled={isMigrating || playlistRunIndex !== null} title="Reset all configuration">
                        Reset
                    </button>
                </fieldset>

                {/* Main content with steps */}
                <fieldset className="steps-container configuration-fields" disabled={refreshingConnections || isMigrating || pendingMigration !== null}>
                    {/* Entity Selection */}
                    <div className={`step-card ${expandedSteps.has(1) ? "active" : "collapsed"}`}>
                        <div className="step-header" onClick={() => toggleStep(1)}>
                            <div className="step-number">2</div>
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
                                        if (refreshingConnections || isMigrating || loadingFields || pendingMigration) return;
                                        setPlaylistRunIndex(null);
                                        setActivePlaylistIndex(null);
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
                                    <div className="step-number">3</div>
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
                                    <div className="step-number">4</div>
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
                                    <div className="step-number">5</div>
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
                                        <div className="step-number">6</div>
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
                                            <label className="auto-map-option"><input type="checkbox" checked={autoMapSystemRecords} onChange={(event) => setAutoMapSystemRecords(event.target.checked)} />Auto-map users, teams, and business units separately for every destination</label>
                                            <p className="field-hint">Mapping preview shows the first selected destination. Manual lookup IDs apply to every selected destination; use separate playlist entries for destination-specific IDs.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                        </>
                    )}
                </fieldset>

                <fieldset className="playlist-card configuration-fields" aria-label="Review and run" disabled={refreshingConnections || pendingMigration !== null || loadingFields || loadingPreview || isMigrating}>
                    <div className="playlist-header">
                        <div>
                            <h2>Review and run</h2>
                            <p className="field-hint">Preview this combination now, or queue combinations in a reusable playlist.</p>
                        </div>
                    </div>
                    <div className="action-bar">
                        <button className="btn-primary" onClick={handlePreview} disabled={!selectedEntity || loadingEntities || loadingFields || loadingPreview}>
                            {loadingPreview ? "Loading..." : "Preview and review migration"}
                        </button>
                        {!isPlaylistCreated ? <button className="btn-secondary" onClick={handleCreatePlaylist}>Create playlist</button> :
                            <div className="entry-actions">
                                <button className="btn-secondary" onClick={handleAddToPlaylist} disabled={!selectedEntity || playlistRunIndex !== null}>Add combination to playlist</button>
                                {activePlaylistIndex !== null && <button className="btn-secondary" disabled={!selectedEntity || playlistRunIndex !== null} onClick={() => {
                                    const config = getCurrentConfiguration();
                                    if (!config) return;
                                    try {
                                        validateConnections(config);
                                        setPlaylist((current) => current.map((item, index) => index === activePlaylistIndex ? config : item));
                                        setError("");
                                    } catch (error) {
                                        setError(error instanceof Error ? error.message : String(error));
                                    }
                                }}>Update entry {activePlaylistIndex + 1}</button>}
                            </div>}
                    </div>
                    {isPlaylistCreated && <section aria-label="Migration playlist">
                        <div className="playlist-header">
                            <h3>Migration playlist</h3>
                            <span role="status">{playlist.length} {playlist.length === 1 ? "combination" : "combinations"} · processed top to bottom</span>
                        </div>
                        {playlist.length === 0 ? <p className="playlist-empty">Use <strong>Add combination to playlist</strong> above to queue the current settings. Each entry can use different environments, including repeated entities.</p> :
                            <ol className="playlist-items">
                                {playlist.map((item, index) => <li key={index} className={`${index === activePlaylistIndex ? "active" : ""} ${unavailablePlaylistConnections.some((issue) => issue.index === index) ? "playlist-item-warning" : ""}`}>
                                    <button className="playlist-entity" onClick={() => activateConfiguration(item, index)} disabled={playlistRunIndex !== null} title={`Configure ${item.entityDisplayName}`}>
                                        <span className="playlist-position">{index + 1}</span>
                                        <span>{item.entityDisplayName}</span>
                                        <small>{connectionLabel(item.sourceConnectionId || "")} → {(item.targetConnectionIds || []).map(connectionLabel).join(", ")} · {item.operations.join(" + ")}</small>
                                    </button>
                                    <div className="playlist-item-actions">
                                        <button onClick={() => { handleReorderPlaylist(index, -1); setActivePlaylistIndex(null); }} disabled={index === 0 || playlistRunIndex !== null} aria-label={`Move ${item.entityDisplayName} up`}>↑</button>
                                        <button onClick={() => { handleReorderPlaylist(index, 1); setActivePlaylistIndex(null); }} disabled={index === playlist.length - 1 || playlistRunIndex !== null} aria-label={`Move ${item.entityDisplayName} down`}>↓</button>
                                        <button onClick={() => { setPlaylist((current) => current.filter((_, entryIndex) => entryIndex !== index)); setActivePlaylistIndex(null); }} disabled={playlistRunIndex !== null} aria-label={`Remove ${item.entityDisplayName}`}>×</button>
                                    </div>
                                </li>)}
                            </ol>}
                        <div className="playlist-footer">
                            <p className="field-hint">Entries run in order. Preview and confirmation are required for each entry.</p>
                            {unavailablePlaylistConnections.length > 0 && <div id="playlist-connection-warning" className="playlist-warning" role="alert">
                                <strong>Playlist cannot start: saved connections are no longer linked.</strong>
                                <ul>{unavailablePlaylistConnections.map((issue) => <li key={issue.index}>Entry {issue.index + 1} ({issue.entityDisplayName}): {issue.missingIds.length} unavailable {issue.missingIds.length === 1 ? "connection" : "connections"}.</li>)}</ul>
                                <span>Relink the connections in PPTB, or remove and recreate the affected entries with available connections.</span>
                            </div>}
                            {playlistRunIndex !== null ? <button className="btn-secondary" onClick={() => setPlaylistRunIndex(null)}>Stop playlist</button> :
                                <button className="btn-primary btn-start-playlist" onClick={handleRunPlaylist} disabled={playlist.length === 0 || unavailablePlaylistConnections.length > 0} aria-describedby={unavailablePlaylistConnections.length > 0 ? "playlist-connection-warning" : undefined}>
                                    <Play16Filled aria-hidden="true" />Start playlist ({playlist.length})
                                </button>}
                        </div>
                    </section>}
                </fieldset>

                {(selectedEntity || migrationProgress || destinationResults.length > 0) && (
                    <div className="progress-card">
                        {activeDestination && <p role="status"><strong>{isMigrating ? "Migrating to: " : "Last run: "}</strong>{activeDestination}</p>}
                        {destinationResults.length > 0 && <ul className="destination-results" aria-label="Destination results">{destinationResults.map(({ id, progress }) => (
                            <li key={id}><strong>{connectionLabel(id)}</strong><span>{progress.isInProgress ? "In progress" : progress.processed < progress.total ? "Stopped" : progress.failed ? "Finished with errors" : "Completed"}: {progress.successful} successful, {progress.failed} failed, {progress.skipped} skipped</span></li>
                        ))}</ul>}
                        {playlistRunIndex !== null && (
                            <div className="playlist-progress">
                                Playlist entity {playlistRunIndex + 1} of {playlist.length}: preview and confirm the migration to continue.
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
                {pendingMigration && selectedEntity && (
                        <dialog className="modal confirmation-modal" aria-labelledby="migration-confirmation-title" ref={(dialog) => {
                            if (dialog && !dialog.open) dialog.showModal();
                        }} onCancel={(event) => { event.preventDefault(); setPendingMigration(null); setShowPreview(true); }}>
                            <div className="modal-header"><h3 id="migration-confirmation-title">Confirm migration</h3></div>
                            <div className="confirmation-content">
                                <p><strong>{pendingMigration.length} selected records</strong> from <strong>{selectedEntity.displayName}</strong> will be processed in each destination.</p>
                                <p><strong>Source:</strong> {connectionLabel(sourceConnectionId)}</p>
                                <p><strong>Operations:</strong> {operations.join(" + ").toUpperCase()}</p>
                                <h4>Destinations ({targetConnectionIds.length})</h4>
                                <ol>{targetConnectionIds.map((id) => <li key={id}>{connectionLabel(id)}</li>)}</ol>
                                <p>{autoMapSystemRecords ? "System mappings will be rebuilt separately for each destination." : "System auto-mapping is disabled."}</p>
                                <p className="preview-warning-text">{operations.includes("delete") ? "WARNING: Selected records will be deleted from every destination. " : ""}Changes cannot be automatically undone. A failure stops remaining destinations and playlist entries; completed changes are not rolled back.</p>
                            </div>
                            <div className="modal-footer">
                                <button className="btn-secondary" autoFocus onClick={() => { setPendingMigration(null); setShowPreview(true); }}>Back to preview</button>
                                <button className="btn-primary" onClick={executeMigration}>Confirm and start migration</button>
                            </div>
                        </dialog>
                )}
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
