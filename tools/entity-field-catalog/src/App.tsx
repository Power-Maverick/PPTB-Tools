import { Spinner, Text } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { CustomColumnManager } from "./components/CustomColumnManager";
import { EntitySelector } from "./components/EntitySelector";
import { ExportPanel } from "./components/ExportPanel";
import { SolutionSelector } from "./components/SolutionSelector";
import { StatusBanner } from "./components/StatusBanner";
import {
  ColumnConfiguration,
  CustomColumn,
  DataverseEntity,
  DataverseSolution,
} from "./models/interfaces";
import { useAppStyles } from "./styles/useAppStyles";
import { ConfigurationManager } from "./utils/ConfigurationManager";
import { DataverseClient } from "./utils/DataverseClient";
import { ExportUtil } from "./utils/ExportUtil";

function App() {
  const styles = useAppStyles();
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

  const handleSolutionChange = async (solutionName: string) => {
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
      await ConfigurationManager.saveConfiguration(
        configName.trim(),
        customColumns,
      );
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

  const handleLoadConfiguration = async (configId: string) => {
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

      await ExportUtil.export(
        entitiesToExport,
        selectedSolution,
        customColumns,
      );

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
        <div className={styles.surface}>
          <div className={styles.loading}>
            <Spinner size="huge" label="Loading..." />
          </div>
        </div>
      </div>
    );
  }

  const selectedCount = selectedEntities.size;
  const totalFields = entities
    .filter((e) => selectedEntities.has(e.logicalName))
    .reduce((sum, e) => sum + e.fields.length, 0);

  const columnsAvailable = entities.length > 0 && selectedCount > 0;
  const entityPlaceholderMessage = selectedSolution
    ? "Entities will appear here once loading finishes."
    : "Select a solution to browse entities.";
  const columnPlaceholderMessage =
    entities.length === 0
      ? "Pick a solution to unlock custom columns."
      : "Select at least one entity to configure custom columns.";

  return (
    <div className={styles.root}>
      <div className={styles.surface}>
        {error && (
          <StatusBanner
            type="error"
            message={error}
            className={styles.bannerSpace}
          />
        )}

        <div className={styles.content}>
          <div className={styles.board}>
            <div className={styles.panel}>
              <SolutionSelector
                solutions={solutions}
                selectedSolution={selectedSolution}
                onSelect={handleSolutionChange}
                isLoadingEntities={loadingEntities}
              />
              <ExportPanel
                selectedCount={selectedCount}
                totalFields={totalFields}
                onExport={handleExport}
              />
            </div>

            <div className={styles.panel}>
              {entities.length > 0 ? (
                <EntitySelector
                  entities={entities}
                  selectedEntities={selectedEntities}
                  onToggle={handleEntityToggle}
                  onSelectAll={handleSelectAll}
                  totalFields={totalFields}
                />
              ) : (
                <div className={styles.placeholder}>
                  <Text>{entityPlaceholderMessage}</Text>
                </div>
              )}

              {columnsAvailable ? (
                <CustomColumnManager
                  customColumns={customColumns}
                  newColumnName={newColumnName}
                  newColumnDefault={newColumnDefault}
                  configName={configName}
                  savedConfigs={savedConfigs}
                  selectedConfig={selectedConfig}
                  onColumnNameChange={setNewColumnName}
                  onColumnDefaultChange={setNewColumnDefault}
                  onAddColumn={handleAddColumn}
                  onRemoveColumn={handleRemoveColumn}
                  onConfigNameChange={setConfigName}
                  onSaveConfiguration={handleSaveConfiguration}
                  onConfigSelect={handleLoadConfiguration}
                  onDeleteConfiguration={handleDeleteConfiguration}
                />
              ) : (
                <div className={styles.placeholder}>
                  <Text>{columnPlaceholderMessage}</Text>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
