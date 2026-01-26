import { Button, Dropdown, Input, Option, Text, Title3, makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import { Add24Regular, Delete24Regular, Save24Regular } from "@fluentui/react-icons";
import { ColumnConfiguration, CustomColumn } from "../models/interfaces";

interface CustomColumnManagerProps {
    customColumns: CustomColumn[];
    newColumnName: string;
    newColumnDefault: string;
    configName: string;
    savedConfigs: ColumnConfiguration[];
    selectedConfig: string;
    onColumnNameChange: (value: string) => void;
    onColumnDefaultChange: (value: string) => void;
    onAddColumn: () => void;
    onRemoveColumn: (columnId: string) => void;
    onConfigNameChange: (value: string) => void;
    onSaveConfiguration: () => void | Promise<void>;
    onConfigSelect: (configId: string) => void | Promise<void>;
    onDeleteConfiguration: () => void | Promise<void>;
    className?: string;
}

const useColumnStyles = makeStyles({
    section: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
    },
    row: {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
    },
    input: {
        minWidth: "180px",
        flex: 1,
    },
    list: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        maxHeight: "220px",
        overflowY: "auto",
    },
    columnCard: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px",
        ...shorthands.padding("8px"),
        backgroundColor: tokens.colorNeutralBackground2,
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
    },
    hint: {
        color: tokens.colorNeutralForeground3,
        fontSize: tokens.fontSizeBase200,
    },
});

export function CustomColumnManager({
    customColumns,
    newColumnName,
    newColumnDefault,
    configName,
    savedConfigs,
    selectedConfig,
    onColumnNameChange,
    onColumnDefaultChange,
    onAddColumn,
    onRemoveColumn,
    onConfigNameChange,
    onSaveConfiguration,
    onConfigSelect,
    onDeleteConfiguration,
    className,
}: CustomColumnManagerProps) {
    const styles = useColumnStyles();

    return (
        <section className={mergeClasses(styles.section, className)}>
            <div>
                <Title3>Custom Columns</Title3>
                <br />
                <Text className={styles.hint}>Extend exports with columns that use optional default values.</Text>
            </div>

            <div>
                <Text weight="semibold">Load Configuration</Text>
                <div className={styles.row}>
                    <Dropdown placeholder="Select a saved configuration" value={selectedConfig} onOptionSelect={(_event, data) => onConfigSelect(data.optionValue ?? "")}>
                        <Option value="">None</Option>
                        {savedConfigs.map((config) => (
                            <Option key={config.id} value={config.id} text={`${config.name} (${config.columns.length} columns)`}>
                                {config.name} ({config.columns.length} columns)
                            </Option>
                        ))}
                    </Dropdown>
                    {selectedConfig && (
                        <Button appearance="subtle" icon={<Delete24Regular />} onClick={onDeleteConfiguration}>
                            Delete
                        </Button>
                    )}
                </div>
            </div>

            <div>
                <Text weight="semibold">Add Column</Text>
                <div className={styles.row}>
                    <Input className={styles.input} placeholder="Column name" value={newColumnName} onChange={(_event, data) => onColumnNameChange(data.value)} />
                    <Input className={styles.input} placeholder="Default value (optional)" value={newColumnDefault} onChange={(_event, data) => onColumnDefaultChange(data.value)} />
                    <Button appearance="primary" icon={<Add24Regular />} onClick={onAddColumn} disabled={!newColumnName.trim()}>
                        Add
                    </Button>
                </div>
            </div>

            {customColumns.length > 0 && (
                <div>
                    <Text weight="semibold">Custom Columns ({customColumns.length})</Text>
                    <div className={styles.list}>
                        {customColumns.map((column) => (
                            <div key={column.id} className={styles.columnCard}>
                                <Text>
                                    <strong>{column.name}</strong>
                                    {column.defaultValue && ` - default: ${column.defaultValue}`}
                                </Text>
                                <Button appearance="subtle" icon={<Delete24Regular />} onClick={() => onRemoveColumn(column.id)}>
                                    Remove
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {customColumns.length > 0 && (
                <div>
                    <Text weight="semibold">Save Configuration</Text>
                    <div className={styles.row}>
                        <Input className={styles.input} placeholder="Configuration name" value={configName} onChange={(_event, data) => onConfigNameChange(data.value)} />
                        <Button appearance="secondary" icon={<Save24Regular />} onClick={onSaveConfiguration} disabled={!configName.trim()}>
                            Save
                        </Button>
                    </div>
                </div>
            )}
        </section>
    );
}
