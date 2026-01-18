import { Button, Checkbox, Text, Title3, makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import { DataverseEntity } from "../models/interfaces";

interface EntitySelectorProps {
    entities: DataverseEntity[];
    selectedEntities: Set<string>;
    onToggle: (entityLogicalName: string, checked: boolean) => void;
    onSelectAll: () => void;
    totalFields: number;
    className?: string;
}

const useEntityStyles = makeStyles({
    section: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
    },
    headerRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
    },
    entityList: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "8px",
        maxHeight: "260px",
        overflowY: "auto",
        ...shorthands.padding("8px"),
        backgroundColor: tokens.colorNeutralBackground2,
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
    },
    statsRow: {
        display: "flex",
        gap: "24px",
        flexWrap: "wrap",
    },
    statCard: {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
    },
    statLabel: {
        color: tokens.colorNeutralForeground3,
        fontSize: tokens.fontSizeBase200,
    },
    statValue: {
        color: tokens.colorBrandForeground1,
        fontWeight: tokens.fontWeightSemibold,
        fontSize: tokens.fontSizeBase400,
    },
});

export function EntitySelector({ entities, selectedEntities, onToggle, onSelectAll, totalFields, className }: EntitySelectorProps) {
    const styles = useEntityStyles();
    const selectedCount = selectedEntities.size;

    if (entities.length === 0) {
        return null;
    }

    return (
        <section className={mergeClasses(styles.section, className)}>
            <div className={styles.headerRow}>
                <div>
                    <Title3>Entities</Title3>
                    <br />
                    <Text as="span">
                        {selectedCount} of {entities.length} selected
                    </Text>
                </div>
                <Button appearance="subtle" onClick={onSelectAll}>
                    {selectedCount === entities.length ? "Deselect All" : "Select All"}
                </Button>
            </div>

            <div className={styles.entityList} role="list">
                {entities.map((entity) => (
                    <Checkbox
                        key={entity.logicalName}
                        label={`${entity.displayName} (${entity.fields.length} fields)`}
                        checked={selectedEntities.has(entity.logicalName)}
                        onChange={(_event, data) => onToggle(entity.logicalName, data.checked === true)}
                    />
                ))}
            </div>

            {selectedCount > 0 && (
                <div className={styles.statsRow}>
                    <div className={styles.statCard}>
                        <Text className={styles.statLabel}>Selected Entities</Text>
                        <Text className={styles.statValue}>{selectedCount}</Text>
                    </div>
                    <div className={styles.statCard}>
                        <Text className={styles.statLabel}>Total Fields</Text>
                        <Text className={styles.statValue}>{totalFields}</Text>
                    </div>
                </div>
            )}
        </section>
    );
}
