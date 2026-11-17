import { Button, Combobox, Dropdown, MessageBar, MessageBarBody, Option, OptionGroup, SearchBox, Spinner, Switch, Tooltip } from "@fluentui/react-components";
import {
    AddCircleFilled,
    DismissCircleRegular,
    OrganizationRegular,
    PeopleRegular,
    PeopleTeamRegular,
    PersonRegular,
    ProhibitedRegular,
    SubtractCircleFilled,
} from "@fluentui/react-icons";
import { ComponentType, CSSProperties, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { DEPTH_LABELS, depthRank, NON_TABLE_OPERATION, ParsedPrivilege, PrivilegeDepth, SecurityRole } from "./models/interfaces";
import "./styles.css";
import { DataverseConnector } from "./utils/dataverseClient";

const MAX_COMPARE_ROLES = 5;
const MAX_ENVIRONMENTS = 5;
const STORAGE_PREFIX = "security-role-comparator:recent-selections:v1";

/** Ordered list of operation values used by the operation filter (incl. the non-table placeholder). */
const OPERATION_ORDER = ["Create", "Read", "Write", "Delete", "Append", "AppendTo", "Assign", "Share", NON_TABLE_OPERATION];

/** Friendlier labels for operation values (others display as-is). */
const OPERATION_LABELS: Record<string, string> = { AppendTo: "Append To" };
const operationLabel = (op: string) => OPERATION_LABELS[op] ?? op;

/** Sentinel value for the "All" shortcut option in the multi-select filters. */
const ALL_VALUE = "__all__";

/**
 * Computes the next multi-select state when an option is toggled, with an "All" shortcut.
 * State is either [ALL_VALUE] (everything), a concrete subset (in `available` order), or [] (none).
 * - Clicking "All" selects everything, or clears everything if already in "all" mode.
 * - Clicking an individual option while in "all" mode starts a fresh selection of just that option.
 * - Otherwise the individual option is toggled in/out of the current subset.
 */
function toggleMultiSelect(optionValue: string, current: string[], available: string[]): string[] {
    const allMode = current.includes(ALL_VALUE);
    if (optionValue === ALL_VALUE) {
        return allMode ? [] : [ALL_VALUE];
    }
    if (allMode) {
        return [optionValue];
    }
    const set = new Set(current);
    if (set.has(optionValue)) set.delete(optionValue);
    else set.add(optionValue);
    return available.filter((value) => set.has(value));
}

/** True when a value passes a multi-select filter ("all" mode passes everything). */
const passesMultiSelect = (value: string, selected: string[]) => selected.includes(ALL_VALUE) || selected.includes(value);

function groupSelectionSummary(selected: string[]): string {
    if (selected.includes(ALL_VALUE)) return "All groups";
    if (selected.length === 0) return "No groups";
    return selected
        .map((label) => label.replace(/\s+Tables$/i, "").replace(/\s+Privileges$/i, "").replace(/^Privacy Related$/i, "Privacy"))
        .join(", ");
}

function operationSelectionSummary(selected: string[]): string {
    if (selected.includes(ALL_VALUE)) return "All operations";
    if (selected.length === 0) return "No operations";
    return selected.map(operationLabel).join(", ");
}

/** Row-level filter modes for the comparison grid. */
type DiffFilter = "differences" | "more" | "less" | "same" | "all" | "combined";

const DIFF_FILTER_OPTIONS: { value: DiffFilter; label: string }[] = [
    { value: "differences", label: "All differences" },
    { value: "more", label: "More than base" },
    { value: "less", label: "Less than base" },
    { value: "same", label: "Same as base" },
    { value: "all", label: "Show all" },
    { value: "combined", label: "Combined Permission" },
];

type DepthIconInfo = { Icon: ComponentType<{ className?: string; style?: CSSProperties; "aria-label"?: string }>; color: string };

/**
 * Fluent icons chosen to mirror the OOB Dataverse security-role editor depth glyphs,
 * colored to echo that legend (None red, User teal, Business Unit blue, Parent-Child red,
 * Organization green).
 */
const DEPTH_ICON: Record<PrivilegeDepth, DepthIconInfo> = {
    [PrivilegeDepth.None]: { Icon: ProhibitedRegular, color: "#c50f1f" },
    [PrivilegeDepth.Basic]: { Icon: PersonRegular, color: "#038387" },
    [PrivilegeDepth.Local]: { Icon: PeopleRegular, color: "#0f6cbd" },
    [PrivilegeDepth.Deep]: { Icon: PeopleTeamRegular, color: "#d13438" },
    [PrivilegeDepth.Global]: { Icon: OrganizationRegular, color: "#107c10" },
};

interface SavedSelections {
    version: 2;
    baseEnvironmentId: string;
    baseRoleId: string;
    compareEnvironmentIds: string[];
    compareRoleIds: string[];
}

interface RoleSelections {
    baseEnvironmentId: string;
    baseRoleId: string;
    compareEnvironmentIds: string[];
    compareRoleIds: string[];
}

interface ConnectedEnvironment {
    connection: ToolBoxAPI.Connection;
    slot: number;
    connector: DataverseConnector;
    roles: SecurityRole[];
}

interface ComparedRole {
    selectionKey: string;
    environmentId: string;
    environmentName: string;
    roleId: string;
    roleName: string;
}

function buildStorageKey(environments: ConnectedEnvironment[]): string {
    const environmentKey = environments.map(({ connection }) => connection.url.replace(/\/$/, "").toLowerCase()).join("|");
    return `${STORAGE_PREFIX}:${environmentKey}`;
}

function readSavedSelections(storageKey: string): SavedSelections | null {
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<SavedSelections>;
        if (parsed.version !== 2) return null;

        return {
            version: 2,
            baseEnvironmentId: typeof parsed.baseEnvironmentId === "string" ? parsed.baseEnvironmentId : "",
            baseRoleId: typeof parsed.baseRoleId === "string" ? parsed.baseRoleId : "",
            compareEnvironmentIds: Array.isArray(parsed.compareEnvironmentIds)
                ? parsed.compareEnvironmentIds.filter((value): value is string => typeof value === "string")
                : [],
            compareRoleIds: Array.isArray(parsed.compareRoleIds) ? parsed.compareRoleIds.filter((value): value is string => typeof value === "string") : [],
        };
    } catch {
        return null;
    }
}

function saveSavedSelections(storageKey: string, selections: SavedSelections): void {
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(selections));
    } catch {
        // Browser storage may be unavailable or disabled; persistence is optional.
    }
}

function getRoleGroupLabel(isManaged: boolean): string {
    return isManaged ? "Managed Roles" : "Unmanaged Roles";
}

function getRoleDisplayName(role: SecurityRole, duplicateNames: Set<string>): string {
    // Disambiguate same-named roles by business unit; otherwise show the plain role name.
    if (duplicateNames.has(role.name) && role.businessunitName) {
        return `${role.name} · ${role.businessunitName}`;
    }
    return role.name;
}

interface RoleComboboxProps {
    roles: SecurityRole[];
    selectedRoleId: string;
    placeholder: string;
    ariaLabel: string;
    disabled: boolean;
    onChange: (roleId: string) => void;
}

function RoleCombobox({ roles, selectedRoleId, placeholder, ariaLabel, disabled, onChange }: RoleComboboxProps) {
    const duplicateNames = useMemo(() => {
        const counts = new Map<string, number>();
        for (const role of roles) counts.set(role.name, (counts.get(role.name) ?? 0) + 1);
        return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([name]) => name));
    }, [roles]);
    const selectedRole = roles.find((role) => role.roleid === selectedRoleId);
    const selectedLabel = selectedRole ? getRoleDisplayName(selectedRole, duplicateNames) : "";
    const [inputValue, setInputValue] = useState(selectedLabel);

    useEffect(() => {
        setInputValue(selectedLabel);
    }, [selectedLabel]);

    const normalizedSearch = inputValue.trim().toLowerCase();
    const isSelectedLabel = normalizedSearch === selectedLabel.toLowerCase();
    const matchingRoles =
        !normalizedSearch || isSelectedLabel
            ? roles
            : roles.filter((role) => getRoleDisplayName(role, duplicateNames).toLowerCase().includes(normalizedSearch));
    const unmanagedRoles = matchingRoles.filter((role) => !role.ismanaged);
    const managedRoles = matchingRoles.filter((role) => role.ismanaged);

    return (
        <Combobox
            className="role-combobox"
            size="small"
            inlinePopup
            value={inputValue}
            selectedOptions={selectedRoleId ? [selectedRoleId] : []}
            placeholder={placeholder}
            aria-label={ariaLabel}
            disabled={disabled}
            onChange={(event) => {
                const value = event.target.value;
                setInputValue(value);
                if (!value) onChange("");
            }}
            onFocus={(event) => (event.target as HTMLInputElement).select()}
            onBlur={() => setInputValue(selectedLabel)}
            onOptionSelect={(_, data) => {
                const roleId = data.optionValue ?? "";
                const role = roles.find((candidate) => candidate.roleid === roleId);
                onChange(roleId);
                setInputValue(role ? getRoleDisplayName(role, duplicateNames) : "");
            }}
        >
            {unmanagedRoles.length > 0 && (
                <OptionGroup label={getRoleGroupLabel(false)}>
                    {unmanagedRoles.map((role) => {
                        const label = getRoleDisplayName(role, duplicateNames);
                        return (
                            <Option className="role-option" key={role.roleid} value={role.roleid} text={label}>
                                {label}
                            </Option>
                        );
                    })}
                </OptionGroup>
            )}
            {managedRoles.length > 0 && (
                <OptionGroup label={getRoleGroupLabel(true)}>
                    {managedRoles.map((role) => {
                        const label = getRoleDisplayName(role, duplicateNames);
                        return (
                            <Option className="role-option" key={role.roleid} value={role.roleid} text={label}>
                                {label}
                            </Option>
                        );
                    })}
                </OptionGroup>
            )}
        </Combobox>
    );
}

/** Renders the Fluent icon representing a privilege depth level. */
function DepthIcon({ depth, muted }: { depth: PrivilegeDepth; muted?: boolean }) {
    const { Icon, color } = DEPTH_ICON[depth] ?? DEPTH_ICON[PrivilegeDepth.None];
    return (
        <Tooltip content={DEPTH_LABELS[depth]} relationship="label">
            <Icon className={`depth-icon depth-icon-${depth}${muted ? " depth-icon-muted" : ""}`} style={{ color }} aria-label={DEPTH_LABELS[depth]} />
        </Tooltip>
    );
}

function downloadComparison(content: string, fileName: string, contentType: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: contentType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value: string): string {
    const safeValue = /^[\s\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replace(/"/g, '""')}"`;
}

function markdownCell(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export default function App() {
    const [environments, setEnvironments] = useState<ConnectedEnvironment[]>([]);
    const [loadingEnvironment, setLoadingEnvironment] = useState(false);
    const [loadingRoles, setLoadingRoles] = useState(false);
    const [baseEnvironmentId, setBaseEnvironmentId] = useState("");
    const [baseRoleId, setBaseRoleId] = useState<string>("");
    const [compareEnvironmentIds, setCompareEnvironmentIds] = useState<string[]>([""]);
    const [compareRoleIds, setCompareRoleIds] = useState<string[]>([""]);
    const [comparing, setComparing] = useState(false);
    const [comparisonData, setComparisonData] = useState<ParsedPrivilege[]>([]);
    const [comparedRoleIds, setComparedRoleIds] = useState<string[]>([]);
    const [comparedRoles, setComparedRoles] = useState<ComparedRole[]>([]);
    const [hasComparedOnce, setHasComparedOnce] = useState(false);
    const [error, setError] = useState<string>("");
    const [searchTerm, setSearchTerm] = useState("");
    const [diffFilter, setDiffFilter] = useState<DiffFilter>("differences");
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedOperations, setSelectedOperations] = useState<string[]>([]);
    const [parentRolesOnly, setParentRolesOnly] = useState(true);
    const storageKeyRef = useRef<string>("");
    const initializedRef = useRef(false);

    useEffect(() => {
        void loadEnvironment();
    }, []);

    useEffect(() => {
        if (!initializedRef.current || !storageKeyRef.current) return;

        saveSavedSelections(storageKeyRef.current, {
            version: 2,
            baseEnvironmentId,
            baseRoleId,
            compareEnvironmentIds,
            compareRoleIds,
        });
    }, [baseEnvironmentId, baseRoleId, compareEnvironmentIds, compareRoleIds]);

    const getSelectionDefaults = (availableEnvironments: ConnectedEnvironment[], savedSelections: SavedSelections | null): RoleSelections => {
        const defaultEnvironmentId = availableEnvironments[0]?.connection.id ?? "";
        const environmentById = new Map(availableEnvironments.map((environment) => [environment.connection.id, environment]));
        const savedBaseEnvironmentId = savedSelections?.baseEnvironmentId ?? "";
        const nextBaseEnvironmentId = environmentById.has(savedBaseEnvironmentId) ? savedBaseEnvironmentId : defaultEnvironmentId;
        const baseRoles = environmentById.get(nextBaseEnvironmentId)?.roles ?? [];
        const nextBaseRoleId = savedSelections?.baseRoleId && baseRoles.some((role) => role.roleid === savedSelections.baseRoleId) ? savedSelections.baseRoleId : "";
        const nextCompareEnvironmentIds: string[] = [];
        const nextCompareRoleIds: string[] = [];
        const usedSelections = new Set(nextBaseRoleId ? [`${nextBaseEnvironmentId}:${nextBaseRoleId}`] : []);

        for (let index = 0; index < Math.min(savedSelections?.compareRoleIds.length ?? 0, MAX_COMPARE_ROLES); index++) {
            const environmentId = environmentById.has(savedSelections?.compareEnvironmentIds[index] ?? "")
                ? savedSelections!.compareEnvironmentIds[index]
                : defaultEnvironmentId;
            const roleId = savedSelections!.compareRoleIds[index] ?? "";
            const roles = environmentById.get(environmentId)?.roles ?? [];
            const selectionKey = `${environmentId}:${roleId}`;
            nextCompareEnvironmentIds.push(environmentId);
            nextCompareRoleIds.push(roleId && roles.some((role) => role.roleid === roleId) && !usedSelections.has(selectionKey) ? roleId : "");
            if (nextCompareRoleIds[index]) usedSelections.add(selectionKey);
        }

        return {
            baseEnvironmentId: nextBaseEnvironmentId,
            baseRoleId: nextBaseRoleId,
            compareEnvironmentIds: nextCompareEnvironmentIds.length > 0 ? nextCompareEnvironmentIds : [defaultEnvironmentId],
            compareRoleIds: nextCompareRoleIds.length > 0 ? nextCompareRoleIds : [""],
        };
    };

    const applySelectionDefaults = ({
        baseEnvironmentId: nextBaseEnvironmentId,
        baseRoleId: nextBaseRoleId,
        compareEnvironmentIds: nextCompareEnvironmentIds,
        compareRoleIds: nextCompareRoleIds,
    }: RoleSelections) => {
        setBaseEnvironmentId(nextBaseEnvironmentId);
        setBaseRoleId(nextBaseRoleId);
        setCompareEnvironmentIds(nextCompareEnvironmentIds);
        setCompareRoleIds(nextCompareRoleIds);
    };

    const loadEnvironment = async (): Promise<{ selections: RoleSelections; environments: ConnectedEnvironment[] } | null> => {
        setLoadingEnvironment(true);
        setError("");

        try {
            if (!window.toolboxAPI) throw new Error("Toolbox API not available");
            const connectionSlots = await window.toolboxAPI.connections.getConnections();
            const connectedSlots = connectionSlots
                .map((connection, slot) => ({ connection, slot }))
                .filter((entry): entry is { connection: ToolBoxAPI.Connection; slot: number } => entry.connection !== null)
                .slice(0, MAX_ENVIRONMENTS);
            if (connectedSlots.length === 0) throw new Error("No active connection found. Please connect to a Dataverse environment first.");

            const loadedEnvironments = await Promise.all(
                connectedSlots.map(async ({ connection, slot }): Promise<ConnectedEnvironment> => {
                    const connector = new DataverseConnector(connection.url, slot);
                    return {
                        connection,
                        slot,
                        connector,
                        roles: await connector.fetchRoles(undefined, parentRolesOnly),
                    };
                }),
            );
            setEnvironments(loadedEnvironments);
            storageKeyRef.current = buildStorageKey(loadedEnvironments);

            const savedSelections = readSavedSelections(storageKeyRef.current);
            const resolvedSelections = getSelectionDefaults(loadedEnvironments, savedSelections);
            applySelectionDefaults(resolvedSelections);

            setComparisonData([]);
            setComparedRoleIds([]);
            setComparedRoles([]);
            initializedRef.current = loadedEnvironments.some((environment) => environment.roles.length > 0);

            if (!initializedRef.current) {
                setError("No security roles were found in the connected environment.");
            }

            return { selections: resolvedSelections, environments: loadedEnvironments };
        } catch (err: any) {
            setError(err.message || "Failed to load security roles");
            return null;
        } finally {
            setLoadingEnvironment(false);
            setLoadingRoles(false);
        }
    };

    const runRefreshAndComparison = async () => {
        const refreshed = await loadEnvironment();
        if (!refreshed) return;
        await runComparisonWith(
            refreshed.selections.baseEnvironmentId,
            refreshed.selections.baseRoleId,
            refreshed.selections.compareEnvironmentIds,
            refreshed.selections.compareRoleIds,
            refreshed.environments,
        );
    };

    const runPrimaryAction = async () => {
        if (hasComparedOnce) {
            await runRefreshAndComparison();
            return;
        }
        await runComparison();
    };

    const addCompareSlot = () => {
        if (compareRoleIds.length < MAX_COMPARE_ROLES) {
            setCompareRoleIds((prev) => [...prev, ""]);
            setCompareEnvironmentIds((prev) => [...prev, baseEnvironmentId || environments[0]?.connection.id || ""]);
        }
    };

    const removeCompareSlot = (index: number) => {
        setCompareRoleIds((prev) => prev.filter((_, i) => i !== index));
        setCompareEnvironmentIds((prev) => prev.filter((_, i) => i !== index));
    };

    const setCompareRole = (index: number, value: string) => {
        setCompareRoleIds((prev) => prev.map((id, i) => (i === index ? value : id)));
    };

    const setCompareEnvironment = (index: number, environmentId: string) => {
        setCompareEnvironmentIds((prev) => prev.map((id, i) => (i === index ? environmentId : id)));
        setCompareRole(index, "");
    };

    const setParentRoleFilter = async (checked: boolean) => {
        if (environments.length === 0) return;

        setParentRolesOnly(checked);
        setLoadingRoles(true);
        setError("");

        try {
            const reloadedEnvironments = await Promise.all(
                environments.map(async (environment): Promise<ConnectedEnvironment> => {
                    environment.connector.clearRoleCache();
                    return {
                        ...environment,
                        roles: await environment.connector.fetchRoles(undefined, checked),
                    };
                }),
            );
            setEnvironments(reloadedEnvironments);

            const resolvedSelections = getSelectionDefaults(reloadedEnvironments, {
                version: 2,
                baseEnvironmentId,
                baseRoleId,
                compareEnvironmentIds,
                compareRoleIds,
            });
            applySelectionDefaults(resolvedSelections);
        } catch (err: any) {
            setParentRolesOnly(!checked);
            setError(err.message || "Failed to load security roles");
            await DataverseConnector.showMessage("Error", err.message || "Failed to load security roles", "error");
        } finally {
            setLoadingRoles(false);
        }
    };

    const canCompare = !!baseRoleId && compareRoleIds.some((id) => id !== "");

    const runComparisonWith = async (
        baseEnvironment: string,
        baseId: string,
        compareEnvironments: string[],
        compareIds: string[],
        availableEnvironments = environments,
    ) => {
        const environmentById = new Map(availableEnvironments.map((environment) => [environment.connection.id, environment]));
        const selectedSlots = [
            { environmentId: baseEnvironment, roleId: baseId },
            ...compareIds.map((roleId, index) => ({ environmentId: compareEnvironments[index], roleId })).filter(({ roleId }) => roleId),
        ];
        if (!baseId || selectedSlots.length < 2) return;

        setComparing(true);
        setError("");
        setComparisonData([]);
        try {
            const comparisonSelections = selectedSlots.map(({ environmentId, roleId }, index) => {
                const environment = environmentById.get(environmentId);
                if (!environment) throw new Error("A selected environment is no longer available.");
                const role = environment.roles.find((candidate) => candidate.roleid === roleId);
                if (!role) throw new Error("A selected security role is no longer available.");
                const selectionKey = `${index}:${environmentId}:${roleId}`;
                return {
                    connector: environment.connector,
                    roleId,
                    selectionKey,
                    comparedRole: {
                        selectionKey,
                        environmentId,
                        environmentName: environment.connection.name,
                        roleId,
                        roleName: role.name,
                    },
                };
            });
            const data = await DataverseConnector.buildCrossEnvironmentComparison(comparisonSelections);
            const nextComparedRoles = comparisonSelections.map(({ comparedRole }) => comparedRole);
            setComparisonData(data);
            setComparedRoleIds(nextComparedRoles.map(({ selectionKey }) => selectionKey));
            setComparedRoles(nextComparedRoles);
            setHasComparedOnce(true);
        } catch (err: any) {
            setError(err.message || "Comparison failed");
            await DataverseConnector.showMessage("Error", err.message || "Comparison failed", "error");
        } finally {
            setComparing(false);
        }
    };

    const runComparison = () => runComparisonWith(baseEnvironmentId, baseRoleId, compareEnvironmentIds, compareRoleIds);

    // Swap a compare-slot role with the current base role, then refresh the comparison.
    const setCompareRoleAsBase = async (index: number) => {
        const promotedRoleId = compareRoleIds[index];
        if (!promotedRoleId) return;
        const promotedEnvironmentId = compareEnvironmentIds[index];
        const nextCompareIds = compareRoleIds.map((id, i) => (i === index ? baseRoleId : id));
        const nextCompareEnvironmentIds = compareEnvironmentIds.map((id, i) => (i === index ? baseEnvironmentId : id));
        setBaseEnvironmentId(promotedEnvironmentId);
        setBaseRoleId(promotedRoleId);
        setCompareEnvironmentIds(nextCompareEnvironmentIds);
        setCompareRoleIds(nextCompareIds);
        await runComparisonWith(promotedEnvironmentId, promotedRoleId, nextCompareEnvironmentIds, nextCompareIds);
    };

    const getRoleName = (selectionKey: string) => {
        const comparedRole = comparedRoles.find((role) => role.selectionKey === selectionKey);
        if (!comparedRole) return selectionKey;
        return environments.length > 1 ? `${comparedRole.roleName} (${comparedRole.environmentName})` : comparedRole.roleName;
    };

    const getEntityLabel = (priv: ParsedPrivilege) => `${priv.entityDisplayName} (${priv.entitySchemaName})`;

    const baseRoleForResults = comparedRoleIds[0];

    const getRowDiff = (priv: ParsedPrivilege) => {
        const baseRank = depthRank(priv.depthByRole[baseRoleForResults]);
        let hasMore = false;
        let hasLess = false;
        for (let i = 1; i < comparedRoleIds.length; i++) {
            const rank = depthRank(priv.depthByRole[comparedRoleIds[i]]);
            if (rank > baseRank) hasMore = true;
            else if (rank < baseRank) hasLess = true;
        }
        return { hasMore, hasLess };
    };

    // Net permission if the user were assigned the base plus all comparison roles: the highest
    // depth granted by any of them for the privilege.
    const getCombinedDepth = (priv: ParsedPrivilege): PrivilegeDepth => {
        let best: PrivilegeDepth = PrivilegeDepth.None;
        let bestRank = 0;
        for (const rid of comparedRoleIds) {
            const depth = priv.depthByRole[rid] ?? PrivilegeDepth.None;
            const rank = depthRank(depth);
            if (rank > bestRank) {
                bestRank = rank;
                best = depth;
            }
        }
        return best;
    };

    const exportComparison = (format: "csv" | "markdown") => {
        const headers = ["Group", "Entity", "Schema Name", "Operation", ...comparedRoleIds.map(getRoleName), ...(showCombined ? ["Combined Permission"] : [])];
        const rows = filteredData.map((priv) => [
            priv.categoryLabel,
            priv.entityDisplayName,
            priv.entitySchemaName,
            operationLabel(priv.operation),
            ...comparedRoleIds.map((roleId) => DEPTH_LABELS[priv.depthByRole[roleId] ?? PrivilegeDepth.None]),
            ...(showCombined ? [DEPTH_LABELS[getCombinedDepth(priv)]] : []),
        ]);

        if (format === "csv") {
            const content = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
            downloadComparison(`\uFEFF${content}`, "security-role-comparison.csv", "text/csv;charset=utf-8");
            return;
        }

        const markdownRows = [headers, ...rows].map((row) => `| ${row.map(markdownCell).join(" | ")} |`);
        markdownRows.splice(1, 0, `| ${headers.map(() => "---").join(" | ")} |`);
        downloadComparison(markdownRows.join("\n"), "security-role-comparison.md", "text/markdown;charset=utf-8");
    };

    const showCombined = diffFilter === "combined";

    const matchesDiffFilter = (priv: ParsedPrivilege) => {
        if (diffFilter === "all") return true;
        if (diffFilter === "combined") return depthRank(getCombinedDepth(priv)) > 0;
        const { hasMore, hasLess } = getRowDiff(priv);
        switch (diffFilter) {
            case "differences":
                return hasMore || hasLess;
            case "more":
                return hasMore;
            case "less":
                return hasLess;
            case "same":
                return !hasMore && !hasLess;
            default:
                return true;
        }
    };

    // Distinct category labels present in the data, preserving the connector's ordering.
    const availableCategories = useMemo(() => {
        const seen: string[] = [];
        const set = new Set<string>();
        for (const priv of comparisonData) {
            if (!set.has(priv.categoryLabel)) {
                set.add(priv.categoryLabel);
                seen.push(priv.categoryLabel);
            }
        }
        return seen;
    }, [comparisonData]);

    // Operations present in the data, in a stable canonical order.
    const availableOperations = useMemo(() => {
        const present = new Set(comparisonData.map((priv) => priv.operation));
        return OPERATION_ORDER.filter((op) => present.has(op));
    }, [comparisonData]);

    // Default both multiselect filters to "all" whenever a new comparison is run.
    useEffect(() => {
        setSelectedCategories([ALL_VALUE]);
        setSelectedOperations([ALL_VALUE]);
    }, [comparisonData]); // eslint-disable-line react-hooks/exhaustive-deps

    const filteredData = comparisonData.filter((priv) => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            if (!priv.entitySearchText.includes(term) && !priv.operation.toLowerCase().includes(term) && !priv.rawName.toLowerCase().includes(term)) {
                return false;
            }
        }
        if (!passesMultiSelect(priv.categoryLabel, selectedCategories)) return false;
        if (!passesMultiSelect(priv.operation, selectedOperations)) return false;
        return matchesDiffFilter(priv);
    });

    // Two-level grouping: category (OOB tab / section) -> entity (or single misc privilege row).
    const categoryGroups = useMemo(() => {
        const categories = new Map<string, { key: string; label: string; kind: string; entityGroups: Map<string, ParsedPrivilege[]> }>();
        for (const priv of filteredData) {
            let category = categories.get(priv.categoryKey);
            if (!category) {
                category = { key: priv.categoryKey, label: priv.categoryLabel, kind: priv.categoryKind, entityGroups: new Map() };
                categories.set(priv.categoryKey, category);
            }
            const rows = category.entityGroups.get(priv.entityLogicalName);
            if (rows) rows.push(priv);
            else category.entityGroups.set(priv.entityLogicalName, [priv]);
        }
        // filteredData preserves the connector's category/entity/operation ordering, so Map
        // insertion order already reflects the intended display order.
        return Array.from(categories.values()).map((category) => ({
            key: category.key,
            label: category.label,
            kind: category.kind,
            entityGroups: Array.from(category.entityGroups.entries()).map(([entityKey, rows]) => ({ entityKey, rows })),
        }));
    }, [filteredData]);

    const columnCount = 2 + comparedRoleIds.length + (showCombined ? 1 : 0);
    const hasResults = comparisonData.length > 0;
    const actionLabel = hasComparedOnce ? "Refresh" : "Compare";


    return (
        <div className="src-root">
            <div className="selector-bar">
                <div className="selector-row">
                    <div className="role-selector-group">
                        <label className="role-label base-label">Base Role</label>
                        {environments.length > 1 && (
                            <select
                                className="environment-select"
                                value={baseEnvironmentId}
                                onChange={(event) => {
                                    setBaseEnvironmentId(event.target.value);
                                    setBaseRoleId("");
                                }}
                                disabled={loadingEnvironment || loadingRoles}
                                aria-label="Base role environment"
                            >
                                {environments.map(({ connection }) => (
                                    <option key={connection.id} value={connection.id}>
                                        {connection.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <div className="select-wrapper">
                            <RoleCombobox
                                roles={(environments.find(({ connection }) => connection.id === baseEnvironmentId)?.roles ?? []).filter(
                                    (role) =>
                                        role.roleid === baseRoleId ||
                                        !compareRoleIds.some(
                                            (compareRoleId, index) => compareEnvironmentIds[index] === baseEnvironmentId && compareRoleId === role.roleid,
                                        ),
                                )}
                                selectedRoleId={baseRoleId}
                                placeholder="Select or search base role"
                                ariaLabel="Select or search base role"
                                disabled={loadingEnvironment || loadingRoles}
                                onChange={setBaseRoleId}
                            />
                        </div>
                    </div>

                    <div className="compare-slots">
                        {compareRoleIds.map((id, idx) => (
                            <div key={idx} className="role-selector-group">
                                <label className="role-label">
                                    Compare {idx + 1}
                                    {id && (
                                        <button type="button" className="set-base-link" onClick={() => void setCompareRoleAsBase(idx)} title="Swap this role with the base role and re-compare">
                                            (Set as Base)
                                        </button>
                                    )}
                                </label>
                                {environments.length > 1 && (
                                    <select
                                        className="environment-select"
                                        value={compareEnvironmentIds[idx] ?? environments[0]?.connection.id ?? ""}
                                        onChange={(event) => setCompareEnvironment(idx, event.target.value)}
                                        disabled={loadingEnvironment || loadingRoles}
                                        aria-label={`Comparison role ${idx + 1} environment`}
                                    >
                                        {environments.map(({ connection }) => (
                                            <option key={connection.id} value={connection.id}>
                                                {connection.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <div className="select-wrapper compare-select-row">
                                    <RoleCombobox
                                        roles={(environments.find(({ connection }) => connection.id === compareEnvironmentIds[idx])?.roles ?? []).filter(
                                            (role) =>
                                                role.roleid === id ||
                                                !(
                                                    (compareEnvironmentIds[idx] === baseEnvironmentId && role.roleid === baseRoleId) ||
                                                    compareRoleIds.some(
                                                        (compareId, compareIndex) =>
                                                            compareIndex !== idx &&
                                                            compareEnvironmentIds[compareIndex] === compareEnvironmentIds[idx] &&
                                                            compareId === role.roleid,
                                                    )
                                                ),
                                        )}
                                        selectedRoleId={id}
                                        placeholder="Select or search role"
                                        ariaLabel={`Select or search comparison role ${idx + 1}`}
                                        disabled={loadingEnvironment || loadingRoles}
                                        onChange={(roleId) => setCompareRole(idx, roleId)}
                                    />
                                    {compareRoleIds.length > 1 && (
                                        <button
                                            type="button"
                                            className="remove-slot-btn"
                                            onClick={() => removeCompareSlot(idx)}
                                            title="Remove"
                                            aria-label="Remove compare role"
                                        >
                                            <DismissCircleRegular />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {compareRoleIds.length < MAX_COMPARE_ROLES && (
                            <button className="add-slot-btn" onClick={addCompareSlot} disabled={loadingEnvironment || loadingRoles}>
                                + Add Role
                            </button>
                        )}
                    </div>

                    <div className="selector-actions">
                        <Switch
                            checked={parentRolesOnly}
                            onChange={(_, data) => void setParentRoleFilter(data.checked)}
                            label="Parent roles only"
                            disabled={loadingEnvironment || loadingRoles}
                        />
                        {loadingEnvironment || loadingRoles ? (
                            <Spinner size="tiny" label="Loading selections…" labelPosition="after" />
                        ) : (
                            <Button
                                appearance="primary"
                                onClick={() => void runPrimaryAction()}
                                disabled={!canCompare || comparing || loadingEnvironment || loadingRoles}
                                size="medium"
                            >
                                {comparing ? <Spinner size="tiny" /> : actionLabel}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {error && (
                <MessageBar intent="error" className="error-bar">
                    <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
            )}

            {hasResults && (
                <div className="filter-bar">
                    <SearchBox
                        placeholder="Filter by entity display name, schema name, or operation…"
                        value={searchTerm}
                        onChange={(_e, data) => setSearchTerm(data.value)}
                        size="small"
                        className="search-box"
                    />
                    <select
                        className="diff-filter-select"
                        value={diffFilter}
                        onChange={(e) => setDiffFilter(e.target.value as DiffFilter)}
                        aria-label="Row filter"
                    >
                        {DIFF_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <Dropdown
                        className="multi-filter group-filter"
                        size="small"
                        multiselect
                        placeholder="Groups"
                        listbox={{ className: "filter-listbox" }}
                        selectedOptions={selectedCategories}
                        value={groupSelectionSummary(selectedCategories)}
                        button={{
                            children: <span className="multi-filter-summary">{groupSelectionSummary(selectedCategories)}</span>,
                        }}
                        title={groupSelectionSummary(selectedCategories)}
                        onOptionSelect={(_e, data) => setSelectedCategories((prev) => toggleMultiSelect(data.optionValue ?? "", prev, availableCategories))}
                        aria-label="Filter by group"
                    >
                        <Option className="filter-option" value={ALL_VALUE}>
                            All groups
                        </Option>
                        {availableCategories.map((label) => (
                            <Option className="filter-option" key={label} value={label}>
                                {label}
                            </Option>
                        ))}
                    </Dropdown>
                    <Dropdown
                        className="multi-filter operation-filter"
                        size="small"
                        multiselect
                        placeholder="Operations"
                        listbox={{ className: "filter-listbox" }}
                        selectedOptions={selectedOperations}
                        value={operationSelectionSummary(selectedOperations)}
                        button={{
                            children: <span className="multi-filter-summary">{operationSelectionSummary(selectedOperations)}</span>,
                        }}
                        title={operationSelectionSummary(selectedOperations)}
                        onOptionSelect={(_e, data) => setSelectedOperations((prev) => toggleMultiSelect(data.optionValue ?? "", prev, availableOperations))}
                        aria-label="Filter by operation"
                    >
                        <Option className="filter-option" value={ALL_VALUE}>
                            All operations
                        </Option>
                        {availableOperations.map((op) => (
                            <Option className="filter-option" key={op} value={op}>
                                {operationLabel(op)}
                            </Option>
                        ))}
                    </Dropdown>
                    <span className="result-count">
                        {filteredData.length} / {comparisonData.length} privileges
                    </span>
                    <div className="export-actions">
                        <Button appearance="secondary" size="small" onClick={() => exportComparison("csv")} disabled={filteredData.length === 0}>
                            Export CSV
                        </Button>
                        <Button appearance="secondary" size="small" onClick={() => exportComparison("markdown")} disabled={filteredData.length === 0}>
                            Export Markdown
                        </Button>
                    </div>
                </div>
            )}

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
                                    </th>
                                ))}
                                {showCombined && (
                                    <th className="col-role col-combined" title="Combined permission of the base and all comparison roles">
                                        <span className="role-col-name">Combined Permission</span>
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {categoryGroups.map((category) =>
                                category.entityGroups.map((group, groupIdx) => {
                                    const isFirstGroup = groupIdx === 0;
                                    return group.rows.map((priv, rowIdx) => (
                                        <Fragment key={priv.privilegeid}>
                                            {isFirstGroup && rowIdx === 0 && (
                                                <tr className="category-row">
                                                    <td className="category-cell" colSpan={columnCount}>
                                                        {category.label}
                                                        <span className="category-kind-tag">{category.kind === "table" ? "Tables" : category.kind === "privacy" ? "Privacy" : "Misc"}</span>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr className={rowIdx % 2 === 0 ? "row-even" : "row-odd"}>
                                                {rowIdx === 0 && (
                                                    <td className="col-entity entity-cell" rowSpan={group.rows.length}>
                                                        <div className="entity-cell-content" title={getEntityLabel(priv)}>
                                                            <span className="entity-display-name">{priv.entityDisplayName}</span>
                                                            <span className="entity-schema-name">{priv.entitySchemaName}</span>
                                                        </div>
                                                    </td>
                                                )}
                                                <td className="col-operation">{operationLabel(priv.operation)}</td>
                                                {comparedRoleIds.map((rid, ci) => {
                                                    const depth = priv.depthByRole[rid] ?? PrivilegeDepth.None;
                                                    const baseRank = depthRank(priv.depthByRole[comparedRoleIds[0]]);
                                                    const rank = depthRank(depth);
                                                    const direction = ci === 0 ? "none" : rank > baseRank ? "more" : rank < baseRank ? "less" : "none";
                                                    return (
                                                        <td key={rid} className={`col-role-cell ${ci === 0 ? "col-base-cell" : ""}`}>
                                                            {direction === "more" && (
                                                                <Tooltip content="More permission than base" relationship="label">
                                                                    <AddCircleFilled className="diff-icon diff-more" aria-label="More permission than base" />
                                                                </Tooltip>
                                                            )}
                                                            {direction === "less" && (
                                                                <Tooltip content="Less permission than base" relationship="label">
                                                                    <SubtractCircleFilled className="diff-icon diff-less" aria-label="Less permission than base" />
                                                                </Tooltip>
                                                            )}
                                                            <DepthIcon depth={depth} muted={ci > 0 && direction === "none"} />
                                                        </td>
                                                    );
                                                })}
                                                {showCombined && (
                                                    <td className="col-role-cell col-combined-cell">
                                                        <DepthIcon depth={getCombinedDepth(priv)} />
                                                    </td>
                                                )}
                                            </tr>
                                        </Fragment>
                                    ));
                                }),
                            )}
                            {categoryGroups.length === 0 && (
                                <tr>
                                    <td colSpan={columnCount} className="empty-row">
                                        No privileges match the current filter.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {hasResults && (
                <div className="legend-bar">
                    {(Object.entries(DEPTH_LABELS) as [string, string][]).map(([depth, label]) => (
                        <span key={depth} className="legend-item">
                            <DepthIcon depth={Number(depth) as PrivilegeDepth} />
                            <span className="legend-label">{label}</span>
                        </span>
                    ))}
                    <span className="legend-item">
                        <AddCircleFilled className="diff-icon diff-more" />
                        <span className="legend-label">More than base</span>
                    </span>
                    <span className="legend-item">
                        <SubtractCircleFilled className="diff-icon diff-less" />
                        <span className="legend-label">Less than base</span>
                    </span>
                </div>
            )}

            {!hasResults && !comparing && !loadingRoles && !loadingEnvironment && !error && (
                <div className="empty-state">
                    <p>
                        Choose a base role and one or more comparison roles, then click <strong>{actionLabel}</strong>.
                    </p>
                </div>
            )}
        </div>
    );
}
