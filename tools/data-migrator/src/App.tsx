import { useEffect, useState } from "react";
import {
  DataverseEntity,
  MigrationConfig,
  MigrationProgress,
  MigrationOperation,
  FieldMapping,
  LookupMapping,
  AutoMappingResult,
} from "./models/interfaces";
import { DataverseClient } from "./utils/DataverseClient";
import { MigrationEngine } from "./utils/MigrationEngine";
import { EntitySelector } from "./components/EntitySelector";
import { FieldSelector } from "./components/FieldSelector";
import { LookupMapper } from "./components/LookupMapper";
import { OperationSelector } from "./components/OperationSelector";
import { MigrationProgress as MigrationProgressComponent } from "./components/MigrationProgress";
import { AutoMappingPanel } from "./components/AutoMappingPanel";
import "./styles/App.css";

function App() {
  const [isPPTB, setIsPPTB] = useState<boolean>(false);
  const [connectionUrl, setConnectionUrl] = useState<string>("");
  const [secondaryConnectionUrl, setSecondaryConnectionUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Entities
  const [entities, setEntities] = useState<DataverseEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState<boolean>(false);
  const [selectedEntity, setSelectedEntity] = useState<DataverseEntity | null>(
    null
  );

  // Migration configuration
  const [operation, setOperation] = useState<MigrationOperation>("create");
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [lookupMappings, setLookupMappings] = useState<LookupMapping[]>([]);
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [batchSize, setBatchSize] = useState<number>(50);

  // Migration progress
  const [migrationProgress, setMigrationProgress] =
    useState<MigrationProgress | null>(null);
  const [isMigrating, setIsMigrating] = useState<boolean>(false);

  // Auto-mapping
  const [showAutoMapping, setShowAutoMapping] = useState<boolean>(false);
  const [userMappings, setUserMappings] = useState<AutoMappingResult[]>([]);
  const [teamMappings, setTeamMappings] = useState<AutoMappingResult[]>([]);
  const [businessUnitMappings, setBusinessUnitMappings] = useState<
    AutoMappingResult[]
  >([]);

  const [migrationEngine] = useState<MigrationEngine>(
    () => new MigrationEngine()
  );

  // Detect environment and initialize
  useEffect(() => {
    const initializeEnvironment = async () => {
      // Check if we're in PPTB
      if (window.toolboxAPI) {
        setIsPPTB(true);

        try {
          // Get active (source) connection
          const activeConnection =
            await window.toolboxAPI.connections.getActiveConnection();
          setConnectionUrl(activeConnection?.url || "");
          
          // Get secondary (target) connection
          const secondaryConnection =
            await window.toolboxAPI.connections.getSecondaryConnection();
          setSecondaryConnectionUrl(secondaryConnection?.url || "");
          
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

  // Load entities when connection is available
  useEffect(() => {
    if (connectionUrl && secondaryConnectionUrl) {
      loadEntities();
    }
  }, [connectionUrl]);

  const loadEntities = async () => {
    setLoadingEntities(true);
    setError("");

    try {
      const client = new DataverseClient();
      const entityList = await client.fetchAllEntities();
      setEntities(entityList.sort((a, b) => a.displayName.localeCompare(b.displayName)));
    } catch (error: any) {
      setError(`Failed to load entities: ${error.message}`);
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleEntitySelect = (entity: DataverseEntity) => {
    setSelectedEntity(entity);

    // Initialize field mappings
    const mappings: FieldMapping[] = entity.fields.map((field) => ({
      sourceField: field.logicalName,
      targetField: field.logicalName,
      isEnabled: !field.isPrimaryId, // Exclude primary ID by default
      fieldType: field.type,
    }));
    setFieldMappings(mappings);

    // Initialize lookup mappings for reference fields
    const lookupFields = entity.fields.filter(
      (f) =>
        f.type.includes("Lookup") ||
        f.type.includes("Owner") ||
        f.type.includes("Customer")
    );

    const lookups: LookupMapping[] = lookupFields.map((field) => ({
      fieldName: field.logicalName,
      fieldDisplayName: field.displayName,
      targetEntity: field.targets?.[0] || "",
      strategy: "auto",
    }));
    setLookupMappings(lookups);

    // Reset migration progress
    setMigrationProgress(null);
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

  const handleStartMigration = async () => {
    if (!selectedEntity) {
      setError("Please select an entity first");
      return;
    }

    setIsMigrating(true);
    setError("");

    const config: MigrationConfig = {
      entityLogicalName: selectedEntity.logicalName,
      entityDisplayName: selectedEntity.displayName,
      operation,
      fieldMappings,
      lookupMappings,
      filterQuery: filterQuery || undefined,
      batchSize,
    };

    try {
      await migrationEngine.migrateRecords(config, (progress) => {
        setMigrationProgress(progress);
      });
    } catch (error: any) {
      setError(`Migration failed: ${error.message}`);
    } finally {
      setIsMigrating(false);
    }
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

  return (
    <div className="app-container">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError("")}>×</button>
        </div>
      )}

      <div className="content">
        <div className="panel">
          <h2>Data Migrator</h2>
          <p className="subtitle">
            Migrate data between environments with auto-mapping
          </p>

          {/* Connection Information */}
          {connectionUrl && secondaryConnectionUrl && (
            <div className="connection-info">
              <div className="connection-item">
                <span className="connection-label">Source (Primary):</span>
                <span className="connection-url">{connectionUrl}</span>
              </div>
              <div className="connection-arrow">→</div>
              <div className="connection-item">
                <span className="connection-label">Target (Secondary):</span>
                <span className="connection-url">{secondaryConnectionUrl}</span>
              </div>
            </div>
          )}

          {/* Entity Selection */}
          <EntitySelector
            entities={entities}
            selectedEntity={selectedEntity}
            onEntitySelect={handleEntitySelect}
            loading={loadingEntities}
          />

          {selectedEntity && (
            <>
              {/* Operation Selection */}
              <OperationSelector
                operation={operation}
                onOperationChange={setOperation}
              />

              {/* Field Selection */}
              <FieldSelector
                fields={selectedEntity.fields}
                fieldMappings={fieldMappings}
                onFieldMappingsChange={setFieldMappings}
              />

              {/* Lookup Mapping */}
              {lookupMappings.length > 0 && (
                <LookupMapper
                  lookupMappings={lookupMappings}
                  onLookupMappingsChange={setLookupMappings}
                  onAutoMapping={handleAutoMapping}
                />
              )}

              {/* Filter and Batch Size */}
              <div className="config-section">
                <h3>Advanced Options</h3>
                <div className="form-group">
                  <label>Filter Query (OData)</label>
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="e.g., statecode eq 0"
                  />
                </div>
                <div className="form-group">
                  <label>Batch Size</label>
                  <input
                    type="number"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value))}
                    min="1"
                    max="1000"
                  />
                </div>
              </div>

              {/* Migration Controls */}
              <div className="migration-controls">
                <button
                  className="btn-primary"
                  onClick={handleStartMigration}
                  disabled={isMigrating}
                >
                  {isMigrating ? "Migrating..." : "Start Migration"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Migration Progress */}
        {migrationProgress && (
          <MigrationProgressComponent progress={migrationProgress} />
        )}

        {/* Auto-Mapping Panel */}
        {showAutoMapping && (
          <AutoMappingPanel
            userMappings={userMappings}
            teamMappings={teamMappings}
            businessUnitMappings={businessUnitMappings}
            onClose={() => setShowAutoMapping(false)}
          />
        )}
      </div>
    </div>
  );
}

export default App;
