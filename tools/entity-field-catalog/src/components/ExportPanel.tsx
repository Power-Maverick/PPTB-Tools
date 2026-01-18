import { Button, Text, Title3, makeStyles, mergeClasses } from "@fluentui/react-components";
import { ArrowDownload24Regular } from "@fluentui/react-icons";

interface ExportPanelProps {
    selectedCount: number;
    totalFields: number;
    onExport: () => void | Promise<void>;
    className?: string;
}

const useExportStyles = makeStyles({
    section: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
    },
    summary: {
        display: "flex",
        gap: "16px",
        flexWrap: "wrap",
    },
    stat: {
        display: "flex",
        flexDirection: "column",
    },
});

export function ExportPanel({ selectedCount, totalFields, onExport, className }: ExportPanelProps) {
    const styles = useExportStyles();

    return (
        <section className={mergeClasses(styles.section, className)}>
            <div>
                <Title3>Export</Title3>
                <br />
                <Text size={200} style={{ color: "var(--colorNeutralForeground3)" }}>
                    Download a clean matrix with consolidated entity info and dedicated tabs per entity.
                </Text>
            </div>

            <div className={styles.summary}>
                <div className={styles.stat}>
                    <Text weight="semibold">Entities</Text>
                    <Text>{selectedCount}</Text>
                </div>
                <div className={styles.stat}>
                    <Text weight="semibold">Fields</Text>
                    <Text>{totalFields}</Text>
                </div>
            </div>

            <Button appearance="primary" icon={<ArrowDownload24Regular />} onClick={onExport} disabled={selectedCount === 0}>
                Export to Excel
            </Button>
        </section>
    );
}
