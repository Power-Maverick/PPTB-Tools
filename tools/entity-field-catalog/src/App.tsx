import {
  Button,
  Checkbox,
  Dropdown,
  Option,
  Spinner,
  Text,
  Title3,
  makeStyles,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import { ArrowDownload24Regular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import {
  DataverseEntity,
  DataverseSolution,
  ExportFormat,
} from "./models/interfaces";
import { DataverseClient } from "./utils/DataverseClient";
import { ExportUtil } from "./utils/ExportUtil";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  container: {
    maxWidth: "1200px",
    width: "100%",
    margin: "0 auto",
    ...shorthands.padding("24px"),
  },
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    ...shorthands.padding("24px"),
    boxShadow: tokens.shadow8,
    marginBottom: "24px",
  },
  formGroup: {
    marginBottom: "20px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  dropdown: {
    width: "100%",
  },
  entityList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: "12px",
    marginTop: "12px",
    maxHeight: "400px",
    overflowY: "auto",
    ...shorthands.padding("12px"),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  entityCheckbox: {
    display: "block",
  },
  exportSection: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  button: {
    minWidth: "120px",
  },
  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    ...shorthands.padding("48px"),
    gap: "16px",
  },
  error: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground1,
    ...shorthands.padding("16px"),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    marginBottom: "16px",
  },
  info: {
    backgroundColor: tokens.colorPaletteBlueBackground2,
    color: tokens.colorNeutralForeground1,
    ...shorthands.padding("16px"),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    marginBottom: "16px",
  },
  stats: {
    display: "flex",
    gap: "24px",
    marginTop: "16px",
    ...shorthands.padding("16px"),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  statLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  statValue: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
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
  const [exportFormat, setExportFormat] = useState<ExportFormat>("Excel");
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingEntities, setLoadingEntities] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

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

  const handleExport = async () => {
    if (selectedEntities.size === 0) {
      showError("Please select at least one entity to export");
      return;
    }

    try {
      const entitiesToExport = entities.filter((e) =>
        selectedEntities.has(e.logicalName),
      );

      await ExportUtil.export(entitiesToExport, exportFormat, selectedSolution);

      if (isPPTB && window.toolboxAPI?.utils?.showNotification) {
        await window.toolboxAPI.utils.showNotification({
          title: "Success",
          body: `Exported ${selectedEntities.size} entities to ${exportFormat.toUpperCase()}`,
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
          <Title3>Select Solution</Title3>
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
          <div className={styles.card}>
            <Title3>Export Options</Title3>
            <div className={styles.formGroup}>
              <label className={styles.label}>Export Format</label>
              <Dropdown
                className={styles.dropdown}
                placeholder="Select export format"
                value={exportFormat}
                onOptionSelect={(_e, data) =>
                  setExportFormat(data.optionValue as ExportFormat)
                }
              >
                <Option value="Excel" text="Excel (.xlsx)">
                  Excel (.xlsx)
                </Option>
                <Option value="CSV" text="CSV (.csv)">
                  CSV (.csv)
                </Option>
              </Dropdown>
            </div>

            <div className={styles.exportSection}>
              <Button
                className={styles.button}
                appearance="primary"
                icon={<ArrowDownload24Regular />}
                onClick={handleExport}
              >
                Export
              </Button>
            </div>
          </div>
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
