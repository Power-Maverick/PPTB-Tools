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
    },
    errorBar: {
        margin: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    },
    layout: {
        display: "flex",
        flex: 1,
        gap: tokens.spacingHorizontalM,
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
        overflow: "hidden",
        minHeight: 0,
    },
    sidebar: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalM,
        width: "300px",
        flexShrink: 0,
        overflowY: "auto",
    },
    sidebarCard: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
        backgroundColor: tokens.colorNeutralBackground1,
        borderRadius: tokens.borderRadiusMedium,
        padding: tokens.spacingHorizontalM,
        boxShadow: tokens.shadow2,
    },
    mainPanel: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        gap: tokens.spacingVerticalS,
        overflow: "hidden",
        minWidth: 0,
    },
    mainCard: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        backgroundColor: tokens.colorNeutralBackground1,
        borderRadius: tokens.borderRadiusMedium,
        padding: tokens.spacingHorizontalM,
        boxShadow: tokens.shadow2,
        overflow: "hidden",
    },
    statusBar: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: tokens.spacingHorizontalS,
        padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
        backgroundColor: tokens.colorNeutralBackground1,
        borderRadius: tokens.borderRadiusMedium,
        boxShadow: tokens.shadow2,
        flexShrink: 0,
    },
    statusLeft: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
    },
    statusRight: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
    },
    connectionDot: {
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        backgroundColor: tokens.colorStatusSuccessForeground1,
        flexShrink: 0,
    },
    tableHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: tokens.spacingVerticalS,
        flexShrink: 0,
    },
    tableTitle: {
        fontWeight: tokens.fontWeightSemibold,
        color: tokens.colorNeutralForeground1,
    },
    loadButton: {
        width: "100%",
    },
    notReady: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        color: tokens.colorNeutralForeground3,
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
    },
    initSpinner: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
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

            {/* Main layout */}
            <div className={styles.layout}>
                {/* Sidebar */}
                <div className={styles.sidebar}>
                    <div className={styles.sidebarCard}>
                        <EntitySelector
                            entities={entities}
                            selectedEntity={selectedEntity}
                            loading={loadingEntities}
                            onSelect={setSelectedEntity}
                        />
                    </div>

                    <div className={styles.sidebarCard}>
                        <FilterPanel filters={filters} onChange={setFilters} />
                    </div>

                    <Button
                        appearance="primary"
                        className={styles.loadButton}
                        disabled={!selectedEntity || loadingAudit}
                        icon={loadingAudit ? <Spinner size="tiny" /> : <ArrowSync20Regular />}
                        onClick={handleLoadAudit}
                    >
                        {loadingAudit ? "Loading…" : "Load Audit History"}
                    </Button>
                </div>

                <Divider vertical style={{ height: "100%" }} />

                {/* Main audit table panel */}
                <div className={styles.mainPanel}>
                    <div className={styles.mainCard}>
                        <div className={styles.tableHeader}>
                            <Text className={styles.tableTitle}>
                                {lastLoadedEntity ? `Audit History — ${lastLoadedEntity}` : "Audit History"}
                            </Text>
                            {auditEntries.length > 0 && (
                                <Badge appearance="tint" color="informative">
                                    {auditEntries.length} record{auditEntries.length !== 1 ? "s" : ""}
                                </Badge>
                            )}
                        </div>
                        <AuditTable entries={auditEntries} loading={loadingAudit} />
                    </div>

                    {/* Status / export bar */}
                    <div className={styles.statusBar}>
                        <div className={styles.statusLeft}>
                            <div className={styles.connectionDot} />
                            <Text size={200}>{connectionName || "PPTB Connected"}</Text>
                        </div>
                        <div className={styles.statusRight}>
                            {auditEntries.length > 0 && (() => {
                                const totalFieldChanges = auditEntries.reduce((s, e) => s + e.changedFields.length, 0);
                                return (
                                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                                        {auditEntries.length} audit record{auditEntries.length !== 1 ? "s" : ""}
                                        {" · "}
                                        {totalFieldChanges} field change{totalFieldChanges !== 1 ? "s" : ""}
                                    </Text>
                                );
                            })()}
                            <Button
                                appearance="secondary"
                                icon={<ArrowDownload20Regular />}
                                disabled={auditEntries.length === 0}
                                onClick={handleExport}
                                size="small"
                            >
                                Export to Excel
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
