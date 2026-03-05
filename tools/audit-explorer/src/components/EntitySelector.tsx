import {
    Combobox,
    Label,
    Option,
    Spinner,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import { DataverseEntity } from "../models/interfaces";

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalXS,
    },
    combobox: {
        width: "100%",
    },
    hint: {
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
    },
});

interface EntitySelectorProps {
    entities: DataverseEntity[];
    selectedEntity: DataverseEntity | null;
    loading: boolean;
    onSelect: (entity: DataverseEntity | null) => void;
}

export function EntitySelector({ entities, selectedEntity, loading, onSelect }: EntitySelectorProps) {
    const styles = useStyles();

    const handleSelect = (_ev: unknown, data: { optionValue?: string }) => {
        if (!data.optionValue) {
            onSelect(null);
            return;
        }
        const found = entities.find((e) => e.logicalName === data.optionValue);
        onSelect(found ?? null);
    };

    return (
        <div className={styles.root}>
            <Label htmlFor="entity-combobox" weight="semibold">
                Entity
            </Label>
            {loading ? (
                <Spinner size="tiny" label="Loading entities…" />
            ) : (
                <>
                    <Combobox
                        id="entity-combobox"
                        className={styles.combobox}
                        placeholder="Search and select an entity…"
                        value={selectedEntity?.displayName ?? ""}
                        selectedOptions={selectedEntity ? [selectedEntity.logicalName] : []}
                        onOptionSelect={handleSelect}
                    >
                        {entities.map((e) => (
                            <Option key={e.logicalName} value={e.logicalName} text={e.displayName}>
                                {e.displayName}
                                <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginLeft: 6 }}>
                                    ({e.logicalName})
                                </Text>
                            </Option>
                        ))}
                    </Combobox>
                    <Text className={styles.hint}>{entities.length} entities available</Text>
                </>
            )}
        </div>
    );
}
