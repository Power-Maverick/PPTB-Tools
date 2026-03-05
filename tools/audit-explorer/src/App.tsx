import {
    Badge,
    Button,
    Divider,
    MessageBar,
    MessageBarActions,
    MessageBarBody,
    Spinner,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import { ArrowDownload20Regular, ArrowSync20Regular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { AuditTable } from "./components/AuditTable";
import { EntitySelector } from "./components/EntitySelector";
import { FilterPanel } from "./components/FilterPanel";
import { AuditEntry, AuditFilters, DataverseEntity } from "./models/interfaces";
import "./styles/App.css";
import { AuditClient } from "./utils/AuditClient";
import { ExportUtil } from "./utils/ExportUtil";

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: tokens.colorNeutralBackground2,
        gap: tokens.spacingVerticalS,
        padding: tokens.spacingHorizontalM,
        paddingTop: tokens.spacingVerticalS,
    },
    errorBar: {
        flexShrink: 0,
    },
    // ── Top controls strip ──────────────────────────────────────
    topPanel: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.spacingHorizontalM,
        backgroundColor: tokens.colorNeutralBackground1,
        borderRadius: tokens.borderRadiusMedium,
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
        boxShadow: tokens.shadow2,
        flexShrink: 0,
    },
    entityCol: {
        width: "240px",
        flexShrink: 0,
    },
    filterCol: {
        flex: 1,
        minWidth: 0,
    },
    actionButtons: {
        display: "flex",
        flexDirection: "row",
        gap: tokens.spacingHorizontalS,
        flexShrink: 0,
    },
    // ── Bottom audit history panel ───────────────────────────────
    bottomPanel: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        backgroundColor: tokens.colorNeutralBackground1,
        borderRadius: tokens.borderRadiusMedium,
        padding: tokens.spacingHorizontalM,
        boxShadow: tokens.shadow2,
        overflow: "hidden",
        minHeight: 0,
    },
    tableHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: tokens.spacingVerticalS,
        flexShrink: 0,
    },
    tableHeaderLeft: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
    },
    tableHeaderRight: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
    },
    tableTitle: {
        fontWeight: tokens.fontWeightSemibold,
        color: tokens.colorNeutralForeground1,
    },
    connectionDot: {
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        backgroundColor: tokens.colorStatusSuccessForeground1,
        flexShrink: 0,
    },
    initSpinner: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
    },
    subtleText: {
        color: tokens.colorNeutralForeground3,
    },
});

const DEFAULT_FILTERS: AuditFilters = {
    dateFrom: "",
    dateTo: "",
    selectedActions: [],
    fetchXml: "",
    topCount: 500,
};

const auditClient = new AuditClient();

export default function App() {
    const styles = useStyles();

    const [initializing, setInitializing] = useState(true);
    const [connectionName, setConnectionName] = useState("");
    const [error, setError] = useState("");

    const [entities, setEntities] = useState<DataverseEntity[]>([]);
    const [loadingEntities, setLoadingEntities] = useState(false);
    const [selectedEntity, setSelectedEntity] = useState<DataverseEntity | null>(null);

    const [filters, setFilters] = useState<AuditFilters>(DEFAULT_FILTERS);

    const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
    const [loadingAudit, setLoadingAudit] = useState(false);
    const [lastLoadedEntity, setLastLoadedEntity] = useState<string>("");

    // Initialize PPTB connection and load entities
    useEffect(() => {
        const init = async () => {
            if (!window.toolboxAPI) {
                setError("This tool only works in Power Platform ToolBox (PPTB).");
                setInitializing(false);
                return;
            }

            try {
                const conn = await window.toolboxAPI.connections.getActiveConnection();
                setConnectionName(conn?.name ?? conn?.url ?? "Connected");
            } catch {
                setError("Failed to retrieve connection information.");
            }

            try {
                setLoadingEntities(true);
                const list = await auditClient.fetchAllEntities();
                setEntities(list);
            } catch (e: unknown) {
                setError(`Failed to load entities: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
                setLoadingEntities(false);
            }

            setInitializing(false);
        };

        init();
    }, []);

    const handleLoadAudit = async () => {
        if (!selectedEntity) return;

        setError("");
        setLoadingAudit(true);
        setAuditEntries([]);

        try {
            const entries = await auditClient.fetchAuditHistory(selectedEntity, filters);
            setAuditEntries(entries);
            setLastLoadedEntity(selectedEntity.displayName);

            if (window.toolboxAPI?.utils?.showNotification) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Audit History Loaded",
                    body: `${entries.length} audit record${entries.length !== 1 ? "s" : ""} loaded for ${selectedEntity.displayName}`,
                    type: "success",
                });
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(`Failed to load audit history: ${msg}`);
        } finally {
            setLoadingAudit(false);
        }
    };

    const handleExport = async () => {
        if (auditEntries.length === 0) return;

        try {
            await ExportUtil.exportToExcel(auditEntries, lastLoadedEntity || selectedEntity?.displayName || "audit");

            if (window.toolboxAPI?.utils?.showNotification) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Export Complete",
                    body: "Audit history exported to Excel successfully",
                    type: "success",
                });
            }
        } catch (e: unknown) {
            setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    if (initializing) {
        return (
            <div className={styles.root}>
                <div className={styles.initSpinner}>
                    <Spinner size="large" label="Initializing…" />
                </div>
            </div>
        );
    }

    return (
        <div className={styles.root}>
            {/* Error banner */}
            {error && (
                <div className={styles.errorBar}>
                    <MessageBar intent="error">
                        <MessageBarBody>{error}</MessageBarBody>
                        <MessageBarActions
                            containerAction={
                                <Button appearance="transparent" size="small" onClick={() => setError("")} aria-label="Dismiss">
                                    ✕
                                </Button>
                            }
                        />
                    </MessageBar>
                </div>
            )}

            {/* Top controls strip: entity selector + filters + action buttons */}
            <div className={styles.topPanel}>
                <div className={styles.entityCol}>
                    <EntitySelector
                        entities={entities}
                        selectedEntity={selectedEntity}
                        loading={loadingEntities}
                        onSelect={setSelectedEntity}
                    />
                </div>

                <Divider vertical style={{ alignSelf: "stretch" }} />

                <div className={styles.filterCol}>
                    <FilterPanel filters={filters} onChange={setFilters} />
                </div>

                <div className={styles.actionButtons}>
                    <Button
                        appearance="primary"
                        disabled={!selectedEntity || loadingAudit}
                        icon={loadingAudit ? <Spinner size="tiny" /> : <ArrowSync20Regular />}
                        onClick={handleLoadAudit}
                    >
                        {loadingAudit ? "Loading…" : "Load Audit History"}
                    </Button>
                    <Button
                        appearance="secondary"
                        icon={<ArrowDownload20Regular />}
                        disabled={auditEntries.length === 0}
                        onClick={handleExport}
                    >
                        Export to Excel
                    </Button>
                </div>
            </div>

            {/* Bottom section: audit history table (takes remaining 70-80% of space) */}
            <div className={styles.bottomPanel}>
                <div className={styles.tableHeader}>
                    <div className={styles.tableHeaderLeft}>
                        <Text className={styles.tableTitle}>
                            {lastLoadedEntity ? `Audit History — ${lastLoadedEntity}` : "Audit History"}
                        </Text>
                        {auditEntries.length > 0 && (
                            <Badge appearance="tint" color="informative">
                                {auditEntries.length} record{auditEntries.length !== 1 ? "s" : ""}
                            </Badge>
                        )}
                    </div>
                    <div className={styles.tableHeaderRight}>
                        {auditEntries.length > 0 && (() => {
                            const totalFieldChanges = auditEntries.reduce((s, e) => s + e.changedFields.length, 0);
                            return (
                                <Text size={200} className={styles.subtleText}>
                                    {totalFieldChanges} field change{totalFieldChanges !== 1 ? "s" : ""}
                                </Text>
                            );
                        })()}
                        <div className={styles.connectionDot} />
                        <Text size={200} className={styles.subtleText}>
                            {connectionName || "PPTB Connected"}
                        </Text>
                    </div>
                </div>
                <AuditTable entries={auditEntries} loading={loadingAudit} />
            </div>
        </div>
    );
}
