import {
    Button,
    Checkbox,
    Field,
    Input,
    Label,
    Textarea,
    makeStyles,
    tokens,
} from "@fluentui/react-components";
import { ChevronDown20Regular, ChevronUp20Regular } from "@fluentui/react-icons";
import { useState } from "react";
import { AuditFilters } from "../models/interfaces";

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalS,
    },
    row: {
        display: "flex",
        gap: tokens.spacingHorizontalS,
        alignItems: "flex-end",
    },
    field: {
        flex: 1,
    },
    actionsGroup: {
        display: "flex",
        flexWrap: "wrap",
        gap: tokens.spacingHorizontalXS,
    },
    toggle: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXS,
        cursor: "pointer",
        userSelect: "none",
        color: tokens.colorNeutralForeground2,
        fontSize: tokens.fontSizeBase200,
        marginTop: tokens.spacingVerticalXXS,
    },
    xmlArea: {
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: tokens.fontSizeBase200,
    },
    sectionLabel: {
        fontWeight: tokens.fontWeightSemibold,
        fontSize: tokens.fontSizeBase200,
        color: tokens.colorNeutralForeground2,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
    },
});

// Actions users can filter on (most common ones)
const FILTERABLE_ACTIONS: Array<{ value: number; label: string }> = [
    { value: 1, label: "Create" },
    { value: 2, label: "Update" },
    { value: 3, label: "Delete" },
    { value: 4, label: "Activate" },
    { value: 5, label: "Deactivate" },
];

const TOP_OPTIONS = [100, 250, 500, 1000, 2000];

interface FilterPanelProps {
    filters: AuditFilters;
    onChange: (filters: AuditFilters) => void;
}

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
    const styles = useStyles();
    const [showFetchXml, setShowFetchXml] = useState(false);

    const updateField = <K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) => {
        onChange({ ...filters, [key]: value });
    };

    const toggleAction = (actionValue: number, checked: boolean) => {
        const next = checked
            ? [...filters.selectedActions, actionValue]
            : filters.selectedActions.filter((a) => a !== actionValue);
        updateField("selectedActions", next);
    };

    return (
        <div className={styles.root}>
            <Label className={styles.sectionLabel}>Filters</Label>

            {/* Date range */}
            <div className={styles.row}>
                <Field label="Date from" className={styles.field}>
                    <Input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(_e, d) => updateField("dateFrom", d.value)}
                    />
                </Field>
                <Field label="Date to" className={styles.field}>
                    <Input
                        type="date"
                        value={filters.dateTo}
                        onChange={(_e, d) => updateField("dateTo", d.value)}
                    />
                </Field>
                <Field label="Limit" className={styles.field}>
                    <Input
                        type="number"
                        value={String(filters.topCount)}
                        list="top-options"
                        min={1}
                        max={5000}
                        onChange={(_e, d) => {
                            const n = parseInt(d.value, 10);
                            if (!isNaN(n) && n > 0) updateField("topCount", n);
                        }}
                    />
                    <datalist id="top-options">
                        {TOP_OPTIONS.map((v) => (
                            <option key={v} value={v} />
                        ))}
                    </datalist>
                </Field>
            </div>

            {/* Action type checkboxes */}
            <div>
                <Label className={styles.sectionLabel}>Action types</Label>
                <div className={styles.actionsGroup}>
                    {FILTERABLE_ACTIONS.map((a) => (
                        <Checkbox
                            key={a.value}
                            label={a.label}
                            checked={filters.selectedActions.includes(a.value)}
                            onChange={(_e, d) => toggleAction(a.value, !!d.checked)}
                        />
                    ))}
                </div>
            </div>

            {/* FetchXML record filter toggle */}
            <div
                className={styles.toggle}
                onClick={() => setShowFetchXml((v) => !v)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setShowFetchXml((v) => !v);
                }}
                aria-expanded={showFetchXml}
            >
                {showFetchXml ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                FetchXML record filter (optional)
            </div>

            {showFetchXml && (
                <div>
                    <Field
                        hint={`Provide a FetchXML query that returns records of the selected entity.
Audit history will be restricted to the matching records.`}
                    >
                        <Textarea
                            className={styles.xmlArea}
                            placeholder={`<fetch top="50">
  <entity name="account">
    <attribute name="accountid"/>
    <filter>
      <condition attribute="statecode" operator="eq" value="0"/>
    </filter>
  </entity>
</fetch>`}
                            rows={6}
                            value={filters.fetchXml}
                            onChange={(_e, d) => updateField("fetchXml", d.value)}
                        />
                    </Field>
                    {filters.fetchXml.trim() && (
                        <Button
                            size="small"
                            appearance="subtle"
                            onClick={() => updateField("fetchXml", "")}
                            style={{ marginTop: 4 }}
                        >
                            Clear
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
