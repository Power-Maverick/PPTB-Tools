import {
    Badge,
    Body1,
    Caption1,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableHeaderCell,
    TableRow,
    Text,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import { ChevronDown16Regular, ChevronRight16Regular } from "@fluentui/react-icons";
import { useState } from "react";
import { AuditEntry } from "../models/interfaces";

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
    },
    tableWrapper: {
        flex: 1,
        overflowY: "auto",
        overflowX: "auto",
        borderRadius: tokens.borderRadiusMedium,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    headerRow: {
        backgroundColor: tokens.colorNeutralBackground3,
        position: "sticky",
        top: 0,
        zIndex: 1,
    },
    headerCell: {
        fontWeight: tokens.fontWeightSemibold,
        fontSize: tokens.fontSizeBase200,
        whiteSpace: "nowrap",
    },
    dataRow: {
        cursor: "pointer",
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground1Hover,
        },
    },
    expandedRow: {
        backgroundColor: tokens.colorNeutralBackground2,
    },
    detailsRow: {
        backgroundColor: tokens.colorNeutralBackground2,
    },
    detailTable: {
        width: "100%",
        borderCollapse: "collapse",
        marginTop: tokens.spacingVerticalXS,
    },
    detailHeaderCell: {
        fontWeight: tokens.fontWeightSemibold,
        fontSize: tokens.fontSizeBase100,
        color: tokens.colorNeutralForeground3,
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
        textAlign: "left",
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    detailCell: {
        fontSize: tokens.fontSizeBase200,
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
        verticalAlign: "top",
        wordBreak: "break-word",
    },
    oldValue: {
        color: tokens.colorStatusDangerForeground1,
        textDecoration: "line-through",
    },
    newValue: {
        color: tokens.colorStatusSuccessForeground1,
    },
    expandIcon: {
        marginRight: tokens.spacingHorizontalXS,
        verticalAlign: "middle",
        flexShrink: 0,
    },
    actionBadge: {
        minWidth: "64px",
        justifyContent: "center",
    },
    emptyState: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: tokens.spacingVerticalXXL,
        color: tokens.colorNeutralForeground3,
    },
    dateCell: {
        whiteSpace: "nowrap",
        fontSize: tokens.fontSizeBase200,
    },
    recordIdCell: {
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: tokens.fontSizeBase100,
        color: tokens.colorNeutralForeground3,
    },
    userCell: {
        fontWeight: tokens.fontWeightMedium,
        fontSize: tokens.fontSizeBase200,
    },
    spinner: {
        padding: tokens.spacingVerticalXL,
    },
    noData: {
        padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
        color: tokens.colorNeutralForeground3,
        textAlign: "center",
    },
});

type ActionColor = "informative" | "success" | "danger" | "warning" | "severe" | "important";

function actionColor(action: number): ActionColor {
    if (action === 1) return "success";
    if (action === 2) return "informative";
    if (action === 3) return "danger";
    if (action === 4) return "success";
    if (action === 5) return "warning";
    return "informative";
}

interface AuditTableProps {
    entries: AuditEntry[];
    loading: boolean;
}

export function AuditTable({ entries, loading }: AuditTableProps) {
    const styles = useStyles();
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const toggleRow = (id: string) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    if (loading) {
        return (
            <div className={`${styles.root} ${styles.spinner}`}>
                <Spinner size="medium" label="Loading audit history…" />
            </div>
        );
    }

    return (
        <div className={styles.root}>
            <div className={styles.tableWrapper}>
                {entries.length === 0 ? (
                    <div className={styles.noData}>
                        <Body1>No audit records found. Select an entity and click "Load Audit History".</Body1>
                    </div>
                ) : (
                    <Table size="small" noNativeElements>
                        <TableHeader>
                            <TableRow className={styles.headerRow}>
                                <TableHeaderCell className={styles.headerCell} style={{ width: 24 }} />
                                <TableHeaderCell className={styles.headerCell} style={{ width: 160 }}>Date / Time</TableHeaderCell>
                                <TableHeaderCell className={styles.headerCell} style={{ width: 160 }}>Changed By</TableHeaderCell>
                                <TableHeaderCell className={styles.headerCell} style={{ width: 90 }}>Action</TableHeaderCell>
                                <TableHeaderCell className={styles.headerCell}>Record ID</TableHeaderCell>
                                <TableHeaderCell className={styles.headerCell} style={{ width: 80 }}>Fields</TableHeaderCell>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {entries.map((entry) => {
                                const isExpanded = expandedRows.has(entry.auditId);
                                const hasFields = entry.changedFields.length > 0;
                                return (
                                    <>
                                        <TableRow
                                            key={entry.auditId}
                                            className={isExpanded ? styles.expandedRow : styles.dataRow}
                                            onClick={() => hasFields && toggleRow(entry.auditId)}
                                            aria-expanded={isExpanded}
                                        >
                                            <TableCell>
                                                {hasFields ? (
                                                    isExpanded ? (
                                                        <ChevronDown16Regular className={styles.expandIcon} />
                                                    ) : (
                                                        <ChevronRight16Regular className={styles.expandIcon} />
                                                    )
                                                ) : null}
                                            </TableCell>
                                            <TableCell>
                                                <Caption1 className={styles.dateCell}>
                                                    {entry.createdOn ? new Date(entry.createdOn).toLocaleString() : "—"}
                                                </Caption1>
                                            </TableCell>
                                            <TableCell>
                                                <Text className={styles.userCell}>{entry.userName}</Text>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    className={styles.actionBadge}
                                                    color={actionColor(entry.action)}
                                                    appearance="tint"
                                                    size="small"
                                                >
                                                    {entry.actionLabel}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Caption1 className={styles.recordIdCell}>{entry.recordId || "—"}</Caption1>
                                            </TableCell>
                                            <TableCell>
                                                <Caption1>{entry.changedFields.length > 0 ? entry.changedFields.length : "—"}</Caption1>
                                            </TableCell>
                                        </TableRow>

                                        {isExpanded && hasFields && (
                                            <TableRow key={`${entry.auditId}-details`} className={styles.detailsRow}>
                                                <TableCell colSpan={6} style={{ padding: `0 ${tokens.spacingHorizontalL} ${tokens.spacingVerticalS}` }}>
                                                    <table className={styles.detailTable}>
                                                        <thead>
                                                            <tr>
                                                                <th className={styles.detailHeaderCell} style={{ width: "30%" }}>Field</th>
                                                                <th className={styles.detailHeaderCell} style={{ width: "35%" }}>Old Value</th>
                                                                <th className={styles.detailHeaderCell} style={{ width: "35%" }}>New Value</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {entry.changedFields.map((f, idx) => (
                                                                <tr key={`${entry.auditId}-field-${idx}`}>
                                                                    <td className={styles.detailCell}>
                                                                        <code style={{ fontSize: tokens.fontSizeBase100 }}>{f.logicalName}</code>
                                                                    </td>
                                                                    <td className={`${styles.detailCell} ${styles.oldValue}`}>{f.oldValue || "—"}</td>
                                                                    <td className={`${styles.detailCell} ${styles.newValue}`}>{f.newValue || "—"}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>
        </div>
    );
}
