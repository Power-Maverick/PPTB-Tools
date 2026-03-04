import { Badge, Button, Checkbox, MessageBar, MessageBarBody, SearchBox, Spinner, Tooltip } from "@fluentui/react-components";
import { ArrowSyncRegular, DismissCircleRegular } from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import { DEPTH_LABELS, ParsedPrivilege, PrivilegeDepth, SecurityRole } from "./models/interfaces";
import "./styles.css";
import { DataverseConnector } from "./utils/dataverseClient";

const MAX_COMPARE_ROLES = 5;
const DEPTH_COLORS: Record<PrivilegeDepth, string> = {
    [PrivilegeDepth.None]: "var(--depth-none)",
    [PrivilegeDepth.Basic]: "var(--depth-basic)",
    [PrivilegeDepth.Local]: "var(--depth-local)",
    [PrivilegeDepth.Deep]: "var(--depth-deep)",
    [PrivilegeDepth.Global]: "var(--depth-global)",
};

/** Maps a PrivilegeDepth value to the number of filled dots (0–4). */
const DEPTH_FILLED_COUNT: Record<PrivilegeDepth, number> = {
    [PrivilegeDepth.None]: 0,
    [PrivilegeDepth.Basic]: 1,
    [PrivilegeDepth.Local]: 2,
    [PrivilegeDepth.Deep]: 3,
    [PrivilegeDepth.Global]: 4,
};

/** Renders 4 dots indicating the privilege depth (filled up to the depth level). */
function DepthDots({ depth }: { depth: PrivilegeDepth }) {
    const filledCount = DEPTH_FILLED_COUNT[depth] ?? 0;
    const color = DEPTH_COLORS[depth];
    return (
        <Tooltip content={DEPTH_LABELS[depth]} relationship="label">
            <span className="depth-dots" aria-label={DEPTH_LABELS[depth]}>
                {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="depth-dot" style={{ background: i < filledCount ? color : "var(--dot-empty)" }} />
                ))}
            </span>
        </Tooltip>
    );
}

export default function App() {
    const [roles, setRoles] = useState<SecurityRole[]>([]);
    const [loadingRoles, setLoadingRoles] = useState(false);
    const [baseRoleId, setBaseRoleId] = useState<string>("");
    const [compareRoleIds, setCompareRoleIds] = useState<string[]>([""]);
    const [comparing, setComparing] = useState(false);
    const [comparisonData, setComparisonData] = useState<ParsedPrivilege[]>([]);
    const [comparedRoleIds, setComparedRoleIds] = useState<string[]>([]);
    const [error, setError] = useState<string>("");
    const [searchTerm, setSearchTerm] = useState("");
    const [diffsOnly, setDiffsOnly] = useState(false);
    const connectorRef = useRef<DataverseConnector | null>(null);

    useEffect(() => {
        loadRoles();
    }, []);

    const loadRoles = async () => {
        setLoadingRoles(true);
        setError("");
        try {
            if (!window.toolboxAPI) throw new Error("Toolbox API not available");
            const conn = await window.toolboxAPI.connections.getActiveConnection();
            if (!conn?.url) throw new Error("No active connection found. Please connect to a Dataverse environment first.");
            connectorRef.current = new DataverseConnector(conn.url);
            const fetchedRoles = await connectorRef.current.fetchRoles();
            setRoles(fetchedRoles);
        } catch (err: any) {
            setError(err.message || "Failed to load security roles");
        } finally {
            setLoadingRoles(false);
        }
    };

    const addCompareSlot = () => {
        if (compareRoleIds.length < MAX_COMPARE_ROLES) {
            setCompareRoleIds((prev) => [...prev, ""]);
        }
    };

    const removeCompareSlot = (index: number) => {
        setCompareRoleIds((prev) => prev.filter((_, i) => i !== index));
    };

    const setCompareRole = (index: number, value: string) => {
        setCompareRoleIds((prev) => prev.map((id, i) => (i === index ? value : id)));
    };

    const canCompare = baseRoleId && compareRoleIds.some((id) => id !== "");

    const runComparison = async () => {
        if (!canCompare || !connectorRef.current) return;
        setComparing(true);
        setError("");
        setComparisonData([]);
        try {
            const activeCompareIds = compareRoleIds.filter((id) => id !== "");
            const allIds = [baseRoleId, ...activeCompareIds];
            const data = await connectorRef.current.buildComparisonData(allIds);
            setComparisonData(data);
            setComparedRoleIds(allIds);
        } catch (err: any) {
            setError(err.message || "Comparison failed");
            await DataverseConnector.showMessage("Error", err.message || "Comparison failed", "error");
        } finally {
            setComparing(false);
        }
    };

    const getRoleName = (roleId: string) => roles.find((r) => r.roleid === roleId)?.name ?? roleId;

    // Filter logic
    const filteredData = comparisonData.filter((priv) => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            if (!priv.entity.toLowerCase().includes(term) && !priv.operation.toLowerCase().includes(term) && !priv.rawName.toLowerCase().includes(term)) {
                return false;
            }
        }
        if (diffsOnly) {
            const depths = comparedRoleIds.map((rid) => priv.depthByRole[rid] ?? PrivilegeDepth.None);
            const allSame = depths.every((d) => d === depths[0]);
            if (allSame) return false;
        }
        return true;
    });

    // Group filtered data by entity
    const groupedData = filteredData.reduce<Record<string, ParsedPrivilege[]>>((acc, priv) => {
        if (!acc[priv.entity]) acc[priv.entity] = [];
        acc[priv.entity].push(priv);
        return acc;
    }, {});

    const sortedEntities = Object.keys(groupedData).sort((a, b) => a.localeCompare(b));
    const hasResults = comparisonData.length > 0;

    return (
        <div className="src-root">
            {/* Role selectors */}
            <div className="selector-bar">
                <div className="role-selector-group">
                    <label className="role-label base-label">Base Role</label>
                    <div className="select-wrapper">
                        <select className="role-select" value={baseRoleId} onChange={(e) => setBaseRoleId(e.target.value)} disabled={loadingRoles}>
                            <option value="">— Select base role —</option>
                            {roles.map((r) => (
                                <option key={r.roleid} value={r.roleid}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="compare-slots">
                    {compareRoleIds.map((id, idx) => (
                        <div key={idx} className="role-selector-group">
                            <label className="role-label">Compare {idx + 1}</label>
                            <div className="select-wrapper compare-select-row">
                                <select className="role-select" value={id} onChange={(e) => setCompareRole(idx, e.target.value)} disabled={loadingRoles}>
                                    <option value="">— Select role —</option>
                                    {roles
                                        .filter((r) => r.roleid !== baseRoleId && !compareRoleIds.some((cid, ci) => ci !== idx && cid === r.roleid))
                                        .map((r) => (
                                            <option key={r.roleid} value={r.roleid}>
                                                {r.name}
                                            </option>
                                        ))}
                                </select>
                                {compareRoleIds.length > 1 && (
                                    <button className="remove-slot-btn" onClick={() => removeCompareSlot(idx)} title="Remove">
                                        <DismissCircleRegular />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}

                    {compareRoleIds.length < MAX_COMPARE_ROLES && (
                        <button className="add-slot-btn" onClick={addCompareSlot} disabled={loadingRoles}>
                            + Add Role
                        </button>
                    )}
                </div>

                <div className="selector-actions">
                    {loadingRoles ? (
                        <Spinner size="tiny" label="Loading roles…" labelPosition="after" />
                    ) : (
                        <Button appearance="subtle" icon={<ArrowSyncRegular />} onClick={loadRoles} title="Refresh roles" size="small" />
                    )}
                    <Button appearance="primary" onClick={runComparison} disabled={!canCompare || comparing || loadingRoles} size="medium">
                        {comparing ? <Spinner size="tiny" /> : "Compare"}
                    </Button>
                </div>
            </div>

            {error && (
                <MessageBar intent="error" className="error-bar">
                    <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
            )}

            {/* Filter bar — only visible after comparison */}
            {hasResults && (
                <div className="filter-bar">
                    <SearchBox
                        placeholder="Filter by entity or operation…"
                        value={searchTerm}
                        onChange={(_e, data) => setSearchTerm(data.value)}
                        size="small"
                        className="search-box"
                    />
                    <Checkbox label="Differences only" checked={diffsOnly} onChange={(_e, data) => setDiffsOnly(!!data.checked)} />
                    <span className="result-count">
                        {filteredData.length} / {comparisonData.length} privileges
                    </span>
                </div>
            )}

            {/* Comparison table */}
            {hasResults && (
                <div className="table-container">
                    <table className="comparison-table">
                        <thead>
                            <tr>
                                <th className="col-entity" rowSpan={2}>
                                    Entity
                                </th>
                                <th className="col-operation" rowSpan={2}>
                                    Operation
                                </th>
                                {comparedRoleIds.map((rid, i) => (
                                    <th key={rid} className={`col-role ${i === 0 ? "col-base" : ""}`} title={getRoleName(rid)}>
                                        <span className="role-col-name">{getRoleName(rid)}</span>
                                        {i === 0 && (
                                            <Badge appearance="tint" color="brand" size="small" className="base-badge">
                                                Base
                                            </Badge>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedEntities.map((entity) =>
                                groupedData[entity].map((priv, rowIdx) => (
                                    <tr key={priv.privilegeid} className={rowIdx % 2 === 0 ? "row-even" : "row-odd"}>
                                        {rowIdx === 0 && (
                                            <td className="col-entity entity-cell" rowSpan={groupedData[entity].length}>
                                                {entity}
                                            </td>
                                        )}
                                        <td className="col-operation">{priv.operation}</td>
                                        {comparedRoleIds.map((rid, ci) => {
                                            const depth = priv.depthByRole[rid] ?? PrivilegeDepth.None;
                                            const baseDepth = priv.depthByRole[comparedRoleIds[0]] ?? PrivilegeDepth.None;
                                            const isDiff = ci > 0 && depth !== baseDepth;
                                            return (
                                                <td key={rid} className={`col-role-cell ${ci === 0 ? "col-base-cell" : ""} ${isDiff ? "cell-diff" : ""}`}>
                                                    <DepthDots depth={depth} />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                )),
                            )}
                            {sortedEntities.length === 0 && (
                                <tr>
                                    <td colSpan={2 + comparedRoleIds.length} className="empty-row">
                                        No privileges match the current filter.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Legend */}
            {hasResults && (
                <div className="legend-bar">
                    {(Object.entries(DEPTH_LABELS) as [string, string][]).map(([depth, label]) => (
                        <span key={depth} className="legend-item">
                            <DepthDots depth={Number(depth) as PrivilegeDepth} />
                            <span className="legend-label">{label}</span>
                        </span>
                    ))}
                    <span className="legend-item">
                        <span className="diff-indicator" />
                        <span className="legend-label">Differs from base</span>
                    </span>
                </div>
            )}

            {!hasResults && !comparing && !loadingRoles && !error && (
                <div className="empty-state">
                    <p>Select a base role and one or more comparison roles, then click <strong>Compare</strong>.</p>
                </div>
            )}
        </div>
    );
}
