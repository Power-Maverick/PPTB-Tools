import { Button, Checkbox, Combobox, Field, Input, Option, Spinner, Text, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowDownload20Regular, ArrowSync20Regular, ChevronDown20Regular, ChevronUp20Regular } from "@fluentui/react-icons";
import { useState } from "react";
import { AuditFilters, DataverseEntity } from "../models/interfaces";

/**
 * Format a Date as a datetime-local input value (YYYY-MM-DDTHH:mm) in **UTC**.
 * Dataverse FetchXML treats unzoned datetime strings as UTC, so we use UTC here
 * to ensure the filter value matches what is stored in Dataverse.
 */
function toDateTimeLocal(d: Date): string {
    // toISOString() returns "YYYY-MM-DDTHH:mm:ss.mmmZ"; take the first 16 chars
    return d.toISOString().slice(0, 16);
}

const useStyles = makeStyles({
    // Outer wrapper: the card itself
    card: {
        backgroundColor: tokens.colorNeutralBackground1,
        borderRadius: tokens.borderRadiusMedium,
        boxShadow: tokens.shadow2,
        flexShrink: 0,
        padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    },
    // Single flat row with all controls
    row: {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: tokens.spacingHorizontalM,
        flexWrap: "wrap",
    },
    // Entity combobox — slightly wider so display names fit
    entityField: {
        flexShrink: 0,
    },
    combobox: {
        width: "100%",
    },
    // Date inputs
    dateField: {
        flexShrink: 0,
    },
    // Record limit
    limitField: {
        flexShrink: 0,
    },
    // Search / filter inputs
    searchField: {
        flexShrink: 0,
        minWidth: "160px",
    },
    // Quick time preset buttons row
    quickTimeGroup: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "2px",
        paddingTop: "22px",
        flexShrink: 0,
    },
    quickTimeLabel: {
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
        whiteSpace: "nowrap",
        marginRight: "2px",
    },
    // Thin vertical separator
    sep: {
        width: "1px",
        height: "32px",
        backgroundColor: tokens.colorNeutralStroke2,
        flexShrink: 0,
        marginBottom: "2px",
    },
    // Action checkboxes group
    actionsGroup: {
        display: "flex",
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        paddingBottom: "2px",
    },
    actionsLabel: {
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground3,
        whiteSpace: "nowrap",
    },
    // FetchXML toggle link
    fetchXmlToggle: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        cursor: "pointer",
        userSelect: "none",
        color: tokens.colorNeutralForeground2,
        fontSize: tokens.fontSizeBase200,
        whiteSpace: "nowrap",
        paddingBottom: "6px",
        flexShrink: 0,
    },
    // Push action buttons to the far right
    spacer: {
        flex: "1 1 0",
        minWidth: 0,
    },
    // Action buttons
    buttonsGroup: {
        display: "flex",
        flexDirection: "row",
        gap: tokens.spacingHorizontalS,
        flexShrink: 0,
        paddingBottom: "2px",
    },
    // FetchXML textarea section (expands below the row)
    fetchXmlArea: {
        marginTop: tokens.spacingVerticalS,
    },
    xmlTextarea: {
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: tokens.fontSizeBase200,
    },
});

const FILTERABLE_ACTIONS = [
    { value: 1, label: "Create" },
    { value: 2, label: "Update" },
    { value: 3, label: "Delete" },
    { value: 4, label: "Activate" },
    { value: 5, label: "Deactivate" },
];

const TOP_OPTIONS = [100, 250, 500, 1000, 2000];

interface ControlBarProps {
    // Entity selector
    entities: DataverseEntity[];
    selectedEntity: DataverseEntity | null;
    loadingEntities: boolean;
    onSelectEntity: (entity: DataverseEntity | null) => void;
    // Filters
    filters: AuditFilters;
    onFiltersChange: (filters: AuditFilters) => void;
    // Action buttons
    loadingAudit: boolean;
    canExport: boolean;
    onLoad: () => void;
    onExport: () => void;
}

export function ControlBar({ entities, selectedEntity, loadingEntities, onSelectEntity, filters, onFiltersChange, loadingAudit, canExport, onLoad, onExport }: ControlBarProps) {
    const styles = useStyles();
    const [showFetchXml, setShowFetchXml] = useState(false);

    const updateFilter = <K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) => {
        onFiltersChange({ ...filters, [key]: value });
    };

    const toggleAction = (actionValue: number, checked: boolean) => {
        const next = checked ? [...filters.selectedActions, actionValue] : filters.selectedActions.filter((a) => a !== actionValue);
        updateFilter("selectedActions", next);
    };

    const handleEntitySelect = (_ev: unknown, data: { optionValue?: string }) => {
        if (!data.optionValue) {
            onSelectEntity(null);
            return;
        }
        const found = entities.find((e) => e.logicalName === data.optionValue);
        onSelectEntity(found ?? null);
    };

    /** Apply a quick "last N minutes" time preset */
    const applyQuickTime = (minutes: number) => {
        const now = new Date();
        const from = new Date(now.getTime() - minutes * 60 * 1000);
        onFiltersChange({ ...filters, dateFrom: toDateTimeLocal(from), dateTo: toDateTimeLocal(now) });
    };

    return (
        <div className={styles.card}>
            {/* ── Row 1: entity · date range · quick presets · limit ── */}
            <div className={styles.row}>
                {/* Entity combobox */}
                <Field label="Entity" className={styles.entityField} hint={!loadingEntities ? `${entities.length} audit-enabled` : undefined}>
                    {loadingEntities ? (
                        <Spinner size="tiny" label="Loading…" />
                    ) : (
                        <Combobox
                            id="entity-combobox"
                            className={styles.combobox}
                            placeholder="Search and select…"
                            value={selectedEntity?.displayName ?? ""}
                            selectedOptions={selectedEntity ? [selectedEntity.logicalName] : []}
                            onOptionSelect={handleEntitySelect}
                        >
                            {entities.map((e) => (
                                <Option key={e.logicalName} value={e.logicalName} text={e.displayName}>
                                    {e.displayName}
                                    <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginLeft: "6px" }}>
                                        ({e.logicalName})
                                    </Text>
                                </Option>
                            ))}
                        </Combobox>
                    )}
                </Field>

                {/* Date from */}
                <Field label="Date from" className={styles.dateField}>
                    <Input type="datetime-local" value={filters.dateFrom} onChange={(_e, d) => updateFilter("dateFrom", d.value)} />
                </Field>

                {/* Date to */}
                <Field label="Date to" className={styles.dateField}>
                    <Input type="datetime-local" value={filters.dateTo} onChange={(_e, d) => updateFilter("dateTo", d.value)} />
                </Field>

                {/* Quick time presets */}
                <div className={styles.quickTimeGroup}>
                    <Text className={styles.quickTimeLabel}>Quick:</Text>
                    <Button size="small" appearance="subtle" onClick={() => applyQuickTime(30)}>30m</Button>
                    <Button size="small" appearance="subtle" onClick={() => applyQuickTime(60)}>1h</Button>
                    <Button size="small" appearance="subtle" onClick={() => applyQuickTime(120)}>2h</Button>
                    {(filters.dateFrom || filters.dateTo) && (
                        <Button size="small" appearance="subtle" onClick={() => onFiltersChange({ ...filters, dateFrom: "", dateTo: "" })}>✕</Button>
                    )}
                </div>

                {/* Limit */}
                <Field label="Limit" className={styles.limitField}>
                    <Input
                        type="number"
                        value={String(filters.topCount)}
                        list="top-options"
                        min={1}
                        max={5000}
                        onChange={(_e, d) => {
                            const n = parseInt(d.value, 10);
                            if (!isNaN(n) && n > 0) updateFilter("topCount", n);
                        }}
                    />
                    <datalist id="top-options">
                        {TOP_OPTIONS.map((v) => (
                            <option key={v} value={v} />
                        ))}
                    </datalist>
                </Field>
            </div>

            {/* ── Row 2: record search · changed field · actions · fetchxml toggle ── */}
            <div className={styles.row}>
                {/* Record search: primary ID (GUID) or primary name */}
                <Field label="Record ID / Name" className={styles.searchField} hint="GUID or name — filters server-side">
                    <Input
                        placeholder="Enter ID or name…"
                        value={filters.recordSearch}
                        onChange={(_e, d) => updateFilter("recordSearch", d.value)}
                    />
                </Field>

                {/* Changed field filter: client-side, post-load */}
                <Field label="Changed field" className={styles.searchField} hint="Filter rows by field name">
                    <Input
                        placeholder="e.g. statuscode"
                        value={filters.changedFieldFilter}
                        onChange={(_e, d) => updateFilter("changedFieldFilter", d.value)}
                    />
                </Field>

                {/* Action checkboxes */}
                <div className={styles.actionsGroup}>
                    <Text className={styles.actionsLabel}>Actions:</Text>
                    {FILTERABLE_ACTIONS.map((a) => (
                        <Checkbox key={a.value} label={a.label} checked={filters.selectedActions.includes(a.value)} onChange={(_e, d) => toggleAction(a.value, !!d.checked)} />
                    ))}
                </div>

                {/* FetchXML toggle */}
                <div
                    className={styles.fetchXmlToggle}
                    onClick={() => setShowFetchXml((v) => !v)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setShowFetchXml((v) => !v);
                        }
                    }}
                    aria-expanded={showFetchXml}
                >
                    {showFetchXml ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                    FetchXML
                </div>
            </div>

            {/* ── Row 3: FetchXML textarea (shown when expanded) ── */}
            {showFetchXml && (
                <div className={styles.row}>
                    <div className={styles.fetchXmlArea}>
                        <Field hint="Provide a FetchXML query returning records of the selected entity. Audit history will be restricted to those records.">
                            <Textarea
                                className={styles.xmlTextarea}
                                placeholder={`<fetch top="50">
  <entity name="account">
    <attribute name="accountid"/>
    <filter>
      <condition attribute="statecode" operator="eq" value="0"/>
    </filter>
  </entity>
</fetch>`}
                                rows={4}
                                value={filters.fetchXml}
                                onChange={(_e, d) => updateFilter("fetchXml", d.value)}
                            />
                        </Field>
                        {filters.fetchXml.trim() && (
                            <Button size="small" appearance="subtle" onClick={() => updateFilter("fetchXml", "")} style={{ marginTop: "4px" }}>
                                Clear
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Row 4: action buttons ── */}
            <div className={styles.row}>
                <div className={styles.buttonsGroup}>
                    <Button appearance="primary" disabled={!selectedEntity || loadingAudit} icon={loadingAudit ? <Spinner size="tiny" /> : <ArrowSync20Regular />} onClick={onLoad}>
                        {loadingAudit ? "Loading…" : "Load Audit History"}
                    </Button>
                    <Button appearance="secondary" icon={<ArrowDownload20Regular />} disabled={!canExport} onClick={onExport}>
                        Export to Excel
                    </Button>
                </div>
            </div>
        </div>
    );
}
