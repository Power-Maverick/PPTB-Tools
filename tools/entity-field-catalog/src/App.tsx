import {
  Button,
  Checkbox,
  Dropdown,
  Input,
  Option,
  Spinner,
  Text,
  Title2,
  makeStyles,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import {
  Add24Regular,
  ArrowDownload24Regular,
  Delete24Regular,
  Save24Regular,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import {
  ColumnConfiguration,
  CustomColumn,
  DataverseEntity,
  DataverseSolution,
} from "./models/interfaces";
import { ConfigurationManager } from "./utils/ConfigurationManager";
import { DataverseClient } from "./utils/DataverseClient";
import { ExportUtil } from "./utils/ExportUtil";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.overflow("hidden"),
  },
  container: {
    maxWidth: "1400px",
    width: "100%",
    margin: "0 auto",
    ...shorthands.padding("16px"),
    ...shorthands.overflow("auto"),
    height: "100vh",
  },
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.padding("16px"),
    boxShadow: tokens.shadow4,
    marginBottom: "12px",
  },
  formGroup: {
    marginBottom: "12px",
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
  },
  dropdown: {
    width: "100%",
  },
  entityList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "8px",
    marginTop: "8px",
    maxHeight: "280px",
    overflowY: "auto",
    ...shorthands.padding("8px"),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
  },
  entityCheckbox: {
    display: "block",
  },
  exportSection: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  button: {
    minWidth: "100px",
  },
  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    ...shorthands.padding("32px"),
    gap: "12px",
  },
  error: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground1,
    ...shorthands.padding("12px"),
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    marginBottom: "12px",
  },
  info: {
    backgroundColor: tokens.colorPaletteBlueBackground2,
    color: tokens.colorNeutralForeground1,
    ...shorthands.padding("12px"),
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    marginBottom: "12px",
  },
  stats: {
    display: "flex",
    gap: "16px",
    marginTop: "12px",
    ...shorthands.padding("12px"),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  statLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  statValue: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
  },
  customColumnRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "8px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  customColumnInput: {
    flex: "1",
    minWidth: "150px",
  },
  columnList: {
    marginTop: "8px",
    maxHeight: "180px",
    overflowY: "auto",
  },
  configRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "8px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  sectionTitle: {
    marginBottom: "12px",
    fontSize: tokens.fontSizeBase400,
  },
});

function App() {
  const styles = useStyles();
  const [isPPTB, setIsPPTB] = useState<boolean>(false);
  const [connectionUrl, setConnectionUrl] = useState<string>("");
  const [solutions, setSolutions] = useState<DataverseSolution[]>([]);
  const [selectedSolution, setSelectedSolution] = useState<string>("");
  const [entities, setEntities] = useState<DataverseEntity[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingEntities, setLoadingEntities] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Custom columns management
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [newColumnName, setNewColumnName] = useState<string>("");
  const [newColumnDefault, setNewColumnDefault] = useState<string>("");
  const [configName, setConfigName] = useState<string>("");
  const [savedConfigs, setSavedConfigs] = useState<ColumnConfiguration[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<string>("");

  // Detect environment and initialize
  useEffect(() => {
    const initializeEnvironment = async () => {
      // Check if we're in PPTB
      if (window.toolboxAPI) {
        setIsPPTB(true);

        try {
          // Get active connection
          const activeConnection =
            await window.toolboxAPI.connections.getActiveConnection();
          setConnectionUrl(activeConnection?.url || "");
        } catch (error) {
          console.error("Failed to get connection:", error);
          setError("Failed to get connection from PPTB");
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

  // Load solutions when connection is available
  useEffect(() => {
    if (connectionUrl) {
      loadSolutions();
    }
  }, [connectionUrl]);

  // Load saved configurations on mount
  useEffect(() => {
    const loadConfigs = async () => {
      const configs = await ConfigurationManager.loadConfigurations();
      setSavedConfigs(configs);
    };
    loadConfigs();
  }, []);

  const loadSolutions = async () => {
    try {
      const client = new DataverseClient();

      const solutionList = await client.listSolutions();
      setSolutions(solutionList);
    } catch (error: any) {
      showError(`Failed to load solutions: ${error.message}`);
    }
  };

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(""), 5000);
  };

  const handleSolutionChange = async (_event: any, data: any) => {
    const solutionName = data.optionValue;
    setSelectedSolution(solutionName);
    setEntities([]);
    setSelectedEntities(new Set());

    if (!solutionName) return;

    try {
      setLoadingEntities(true);
      const client = new DataverseClient();

      const entityList = await client.fetchSolutionEntities(solutionName);
      setEntities(entityList);

      if (isPPTB && window.toolboxAPI?.utils?.showNotification) {
        await window.toolboxAPI.utils.showNotification({
          title: "Success",
          body: `Loaded ${entityList.length} entities from solution`,
          type: "success",
        });
      }
    } catch (error: any) {
      showError(`Failed to load entities: ${error.message}`);
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleEntityToggle = (entityLogicalName: string, checked: boolean) => {
    const newSelected = new Set(selectedEntities);
    if (checked) {
      newSelected.add(entityLogicalName);
    } else {
      newSelected.delete(entityLogicalName);
    }
    setSelectedEntities(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedEntities.size === entities.length) {
      // Deselect all
      setSelectedEntities(new Set());
    } else {
      // Select all
      setSelectedEntities(new Set(entities.map((e) => e.logicalName)));
    }
  };

  // Custom column management functions
  const handleAddColumn = () => {
    if (!newColumnName.trim()) {
      showError("Please enter a column name");
      return;
    }

    const newColumn: CustomColumn = {
      id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: newColumnName.trim(),
      defaultValue: newColumnDefault.trim() || undefined,
    };

    setCustomColumns([...customColumns, newColumn]);
    setNewColumnName("");
    setNewColumnDefault("");
  };

  const handleRemoveColumn = (columnId: string) => {
    setCustomColumns(customColumns.filter((col) => col.id !== columnId));
  };

  const handleSaveConfiguration = async () => {
    if (!configName.trim()) {
      showError("Please enter a configuration name");
      return;
    }

    if (customColumns.length === 0) {
      showError("Please add at least one custom column");
      return;
    }

    try {
      await ConfigurationManager.saveConfiguration(configName.trim(), customColumns);
      const updatedConfigs = await ConfigurationManager.loadConfigurations();
      setSavedConfigs(updatedConfigs);
      setConfigName("");
      
      if (isPPTB && window.toolboxAPI?.utils?.showNotification) {
        window.toolboxAPI.utils.showNotification({
          title: "Success",
          body: "Configuration saved successfully",
          type: "success",
        });
      }
    } catch (error: any) {
      showError(`Failed to save configuration: ${error.message}`);
    }
  };

  const handleLoadConfiguration = async (_event: any, data: any) => {
    const configId = data.optionValue;
    setSelectedConfig(configId);

    if (!configId) {
      setCustomColumns([]);
      return;
    }

    const config = await ConfigurationManager.getConfiguration(configId);
    if (config) {
      setCustomColumns(config.columns);
    }
  };

  const handleDeleteConfiguration = async () => {
    if (!selectedConfig) return;

    try {
      await ConfigurationManager.deleteConfiguration(selectedConfig);
      const updatedConfigs = await ConfigurationManager.loadConfigurations();
      setSavedConfigs(updatedConfigs);
      setSelectedConfig("");
      setCustomColumns([]);
      
      if (isPPTB && window.toolboxAPI?.utils?.showNotification) {
        window.toolboxAPI.utils.showNotification({
          title: "Success",
          body: "Configuration deleted successfully",
          type: "success",
        });
      }
    } catch (error: any) {
      showError(`Failed to delete configuration: ${error.message}`);
    }
  };

  const handleExport = async () => {
    if (selectedEntities.size === 0) {
      showError("Please select at least one entity to export");
      return;
    }

    try {
      const entitiesToExport = entities.filter((e) =>
        selectedEntities.has(e.logicalName),
      );

      await ExportUtil.export(entitiesToExport, selectedSolution, customColumns);

      if (isPPTB && window.toolboxAPI?.utils?.showNotification) {
        await window.toolboxAPI.utils.showNotification({
          title: "Success",
          body: `Exported ${selectedEntities.size} entities to Excel`,
          type: "success",
        });
      }
    } catch (error: any) {
      showError(`Failed to export: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.loading}>
          <Spinner size="huge" label="Loading..." />
        </div>
      </div>
    );
  }

  const totalFields = entities
    .filter((e) => selectedEntities.has(e.logicalName))
    .reduce((sum, e) => sum + e.fields.length, 0);

  return (
    <div className={styles.root}>
      <div className={styles.container}>
        {error && (
          <div className={styles.error}>
            <Text weight="semibold">{error}</Text>
          </div>
        )}

        <div className={styles.card}>
          <Title2 className={styles.sectionTitle}>Select Solution</Title2>
          <div className={styles.formGroup}>
            <label className={styles.label}>Solution</label>
            <Dropdown
              className={styles.dropdown}
              placeholder="Select a solution"
              value={selectedSolution}
              onOptionSelect={handleSolutionChange}
            >
              {solutions.map((solution) => (
                <Option
                  key={solution.uniqueName}
                  value={solution.uniqueName}
                  text={solution.displayName}
                >
                  {solution.displayName} (v{solution.version})
                </Option>
              ))}
            </Dropdown>
          </div>

          {loadingEntities && (
            <div className={styles.loading}>
              <Spinner label="Loading entities..." />
            </div>
          )}

          {entities.length > 0 && (
            <>
              <div className={styles.formGroup}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <label className={styles.label}>
                    Select Entities ({selectedEntities.size} of{" "}
                    {entities.length} selected)
                  </label>
                  <Button appearance="subtle" onClick={handleSelectAll}>
                    {selectedEntities.size === entities.length
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                </div>
                <div className={styles.entityList}>
                  {entities.map((entity) => (
                    <Checkbox
                      key={entity.logicalName}
                      className={styles.entityCheckbox}
                      label={`${entity.displayName} (${entity.fields.length} fields)`}
                      checked={selectedEntities.has(entity.logicalName)}
                      onChange={(_e, data) =>
                        handleEntityToggle(
                          entity.logicalName,
                          data.checked === true,
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              {selectedEntities.size > 0 && (
                <div className={styles.stats}>
                  <div className={styles.statItem}>
                    <Text className={styles.statLabel}>Selected Entities</Text>
                    <Text className={styles.statValue}>
                      {selectedEntities.size}
                    </Text>
                  </div>
                  <div className={styles.statItem}>
                    <Text className={styles.statLabel}>Total Fields</Text>
                    <Text className={styles.statValue}>{totalFields}</Text>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {entities.length > 0 && selectedEntities.size > 0 && (
          <>
            <div className={styles.card}>
              <Title2 className={styles.sectionTitle}>Custom Columns</Title2>
              
              {/* Load saved configuration */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Load Saved Configuration</label>
                <div className={styles.configRow}>
                  <Dropdown
                    className={styles.dropdown}
                    placeholder="Select a saved configuration"
                    value={selectedConfig}
                    onOptionSelect={handleLoadConfiguration}
                  >
                    <Option value="">None</Option>
                    {savedConfigs.map((config) => (
                      <Option key={config.id} value={config.id}>
                        {config.name} ({config.columns.length} columns)
                      </Option>
                    ))}
                  </Dropdown>
                  {selectedConfig && (
                    <Button
                      appearance="subtle"
                      icon={<Delete24Regular />}
                      onClick={handleDeleteConfiguration}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>

              {/* Add new column */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Add Custom Column</label>
                <div className={styles.customColumnRow}>
                  <Input
                    className={styles.customColumnInput}
                    placeholder="Column name"
                    value={newColumnName}
                    onChange={(_e, data) => setNewColumnName(data.value)}
                  />
                  <Input
                    className={styles.customColumnInput}
                    placeholder="Default value (optional)"
                    value={newColumnDefault}
                    onChange={(_e, data) => setNewColumnDefault(data.value)}
                  />
                  <Button
                    appearance="primary"
                    icon={<Add24Regular />}
                    onClick={handleAddColumn}
                  >
                    Add
                  </Button>
                </div>
              </div>

              {/* Custom columns list */}
              {customColumns.length > 0 && (
                <div className={styles.columnList}>
                  <label className={styles.label}>
                    Custom Columns ({customColumns.length})
                  </label>
                  {customColumns.map((column) => (
                    <div key={column.id} className={styles.customColumnRow}>
                      <Text style={{ flex: 1 }}>
                        <strong>{column.name}</strong>
                        {column.defaultValue && ` (default: ${column.defaultValue})`}
                      </Text>
                      <Button
                        appearance="subtle"
                        icon={<Delete24Regular />}
                        onClick={() => handleRemoveColumn(column.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Save configuration */}
              {customColumns.length > 0 && (
                <div className={styles.formGroup} style={{ marginTop: "20px" }}>
                  <label className={styles.label}>Save Configuration</label>
                  <div className={styles.customColumnRow}>
                    <Input
                      className={styles.customColumnInput}
                      placeholder="Configuration name"
                      value={configName}
                      onChange={(_e, data) => setConfigName(data.value)}
                    />
                    <Button
                      appearance="secondary"
                      icon={<Save24Regular />}
                      onClick={handleSaveConfiguration}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.card}>
              <Title2 className={styles.sectionTitle}>Export</Title2>
              <Text style={{ marginBottom: "8px", display: "block", fontSize: tokens.fontSizeBase200 }}>
                Export selected entities to Excel with custom columns and field type validation.
              </Text>
              <div className={styles.exportSection}>
                <Button
                  className={styles.button}
                  appearance="primary"
                  icon={<ArrowDownload24Regular />}
                  onClick={handleExport}
                >
                  Export to Excel
                </Button>
              </div>
            </div>
          </>
        )}

        {!selectedSolution && !loadingEntities && (
          <div className={styles.info}>
            <Text>Please select a solution to begin.</Text>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
