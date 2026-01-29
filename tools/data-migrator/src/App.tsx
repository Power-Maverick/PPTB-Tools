import { useEffect, useState } from "react";
import { AutoMappingPanel } from "./components/AutoMappingPanel";
import { EntitySelector } from "./components/EntitySelector";
import { FieldSelector } from "./components/FieldSelector";
import { LookupMapper } from "./components/LookupMapper";
import { MigrationProgress as MigrationProgressComponent } from "./components/MigrationProgress";
import { OperationSelector } from "./components/OperationSelector";
import { PreviewData } from "./components/PreviewData";
import {
  AutoMappingResult,
  DataverseEntity,
  FieldMapping,
  LookupMapping,
  MigrationConfig,
  MigrationOperation,
  MigrationProgress,
  PreviewRecord,
} from "./models/interfaces";
import "./styles/App.css";
import { DataverseClient } from "./utils/DataverseClient";
import { MigrationEngine } from "./utils/MigrationEngine";

function App() {
  const [isPPTB, setIsPPTB] = useState<boolean>(false);
  const [connectionUrl, setConnectionUrl] = useState<string>("");
  const [secondaryConnectionUrl, setSecondaryConnectionUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Entities
  const [entities, setEntities] = useState<DataverseEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState<boolean>(false);
  const [selectedEntity, setSelectedEntity] = useState<DataverseEntity | null>(null);
  const [loadingFields, setLoadingFields] = useState<boolean>(false);

  // Migration configuration
  const [operation, setOperation] = useState<MigrationOperation>("create");
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

  // Step management for better UX
  const [currentStep, setCurrentStep] = useState<number>(1);

  const [migrationEngine] = useState<MigrationEngine>(() => new MigrationEngine());

  // Detect environment and initialize
  useEffect(() => {
    const initializeEnvironment = async () => {
      if (window.toolboxAPI) {
        setIsPPTB(true);

        try {
          // Get active (source) connection
          const activeConnection = await window.toolboxAPI.connections.getActiveConnection();
          setConnectionUrl(activeConnection?.url || "");

          // Get secondary (target) connection
          const secondaryConnection = await window.toolboxAPI.connections.getSecondaryConnection();
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
    } catch (error: any) {
      setError(`Failed to load entities: ${error.message}`);
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleEntitySelect = async (entity: DataverseEntity) => {
    setSelectedEntity(entity);
    setLoadingFields(true);
    setError("");
    setCurrentStep(2);

    try {
      // Load fields for the selected entity
      const client = new DataverseClient("primary");
      const fields = await client.fetchEntityFields(entity.logicalName);

      const updatedEntity = { ...entity, fields };
      setSelectedEntity(updatedEntity);

      // Initialize field mappings
      const mappings: FieldMapping[] = fields.map((field) => ({
        sourceField: field.logicalName,
        targetField: field.logicalName,
        isEnabled: !field.isPrimaryId, // Exclude primary ID by default
        fieldType: field.type,
      }));
      setFieldMappings(mappings);

      // Initialize lookup mappings for reference fields
      const lookupFields = fields.filter(
        (f) => f.type.includes("Lookup") || f.type.includes("Owner") || f.type.includes("Customer")
      );

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
      const selectFields = fieldMappings.filter((m) => m.isEnabled).map((m) => m.sourceField);

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
          100 // Limit preview to 100 records
        );
      }

      const preview: PreviewRecord[] = sourceRecords.map((record) => ({
        action: operation.toUpperCase() as "CREATE" | "UPDATE" | "DELETE",
        data: record,
        primaryId: record[selectedEntity.primaryIdAttribute] || "",
        primaryName: record[selectedEntity.primaryNameAttribute] || "",
      }));

      setPreviewRecords(preview);
      setShowPreview(true);
    } catch (error: any) {
      setError(`Failed to load preview: ${error.message}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleStartMigration = async () => {
    if (!selectedEntity) {
      setError("Please select an entity first");
      return;
    }

    setShowPreview(false);
    setIsMigrating(true);
    setError("");

    const config: MigrationConfig = {
      entityLogicalName: selectedEntity.logicalName,
      entityDisplayName: selectedEntity.displayName,
      operation,
      fieldMappings,
      lookupMappings,
      filterQuery: filterQuery || undefined,
      filterType,
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

      <div className="content-fluid">
        {/* Header with connections */}
        <div className="header-card">
          <div className="header-content">
            <h1 className="app-title">Data Migrator</h1>
            {connectionUrl && secondaryConnectionUrl && (
              <div className="connection-flow">
                <div className="connection-badge source">
                  <span className="connection-label">Source</span>
                  <span className="connection-url">{new URL(connectionUrl).hostname}</span>
                </div>
                <div className="flow-arrow">→</div>
                <div className="connection-badge target">
                  <span className="connection-label">Target</span>
                  <span className="connection-url">{new URL(secondaryConnectionUrl).hostname}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main content with steps */}
        <div className="steps-container">
          {/* Step 1: Entity Selection */}
          <div className={`step-card ${currentStep >= 1 ? "active" : ""}`}>
            <div className="step-header">
              <div className="step-number">1</div>
              <h2 className="step-title">Select Entity</h2>
            </div>
            <div className="step-content">
              <EntitySelector
                entities={entities}
                selectedEntity={selectedEntity}
                onEntitySelect={handleEntitySelect}
                loading={loadingEntities}
              />
            </div>
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
              <div className={`step-card ${currentStep >= 2 ? "active" : ""}`}>
                <div className="step-header" onClick={() => setCurrentStep(2)}>
                  <div className="step-number">2</div>
                  <h2 className="step-title">Select Fields</h2>
                  <span className="step-count">{fieldMappings.filter((m) => m.isEnabled).length} selected</span>
                </div>
                <div className="step-content">
                  <FieldSelector
                    fields={selectedEntity.fields}
                    fieldMappings={fieldMappings}
                    onFieldMappingsChange={setFieldMappings}
                  />
                </div>
              </div>

              {/* Step 3: Filter Configuration */}
              <div className={`step-card ${currentStep >= 2 ? "active" : ""}`}>
                <div className="step-header" onClick={() => setCurrentStep(3)}>
                  <div className="step-number">3</div>
                  <h2 className="step-title">Filter Data</h2>
                  <span className="step-badge">Optional</span>
                </div>
                <div className="step-content">
                  <div className="filter-type-selector">
                    <button
                      className={`filter-type-btn ${filterType === "odata" ? "active" : ""}`}
                      onClick={() => setFilterType("odata")}
                    >
                      OData
                    </button>
                    <button
                      className={`filter-type-btn ${filterType === "fetchxml" ? "active" : ""}`}
                      onClick={() => setFilterType("fetchxml")}
                    >
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
                        <label>FetchXML Query</label>
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
              </div>

              {/* Step 4: Settings */}
              <div className={`step-card ${currentStep >= 2 ? "active" : ""}`}>
                <div className="step-header" onClick={() => setCurrentStep(4)}>
                  <div className="step-number">4</div>
                  <h2 className="step-title">Settings</h2>
                </div>
                <div className="step-content">
                  <div className="settings-grid">
                    <div className="setting-item">
                      <OperationSelector operation={operation} onOperationChange={setOperation} />
                    </div>
                    <div className="setting-item">
                      <label>Batch Size (Max 100)</label>
                      <input
                        type="number"
                        value={batchSize}
                        onChange={(e) =>
                          setBatchSize(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))
                        }
                        min="1"
                        max="100"
                        className="modern-input"
                      />
                      <p className="field-hint">Records per batch</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 5: Lookup Mapping */}
              {lookupMappings.length > 0 && (
                <div className={`step-card ${currentStep >= 2 ? "active" : ""}`}>
                  <div className="step-header" onClick={() => setCurrentStep(5)}>
                    <div className="step-number">5</div>
                    <h2 className="step-title">Lookup Mappings</h2>
                    <span className="step-badge">Optional</span>
                  </div>
                  <div className="step-content">
                    <LookupMapper
                      lookupMappings={lookupMappings}
                      onLookupMappingsChange={setLookupMappings}
                      onAutoMapping={handleAutoMapping}
                    />
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="action-bar">
                <button
                  className="btn-preview"
                  onClick={handlePreview}
                  disabled={loadingPreview || isMigrating}
                >
                  {loadingPreview ? "Loading..." : "Preview Data"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Migration Progress */}
        {migrationProgress && (
          <div className="progress-card">
            <MigrationProgressComponent progress={migrationProgress} />
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
