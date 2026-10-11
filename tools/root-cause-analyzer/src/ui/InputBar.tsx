import { Button, Combobox, Dropdown, Field, Input, Option } from "@fluentui/react-components";
import { Search20Regular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ColumnInfo, TableInfo } from "../data/catalog";
import { resolveTable } from "../data/catalog";
import type { AnalysisInput } from "../model/types";
import { isDifferentEnvironment, normalizeGuid, parseRecordUrl } from "../parse/recordUrl";
import { PRESETS, presetWindow, toLocalInputValue, validateWindow, type WindowPreset } from "../parse/timeWindow";

interface Props {
    tables: TableInfo[];
    loadColumns: (table: string) => Promise<ColumnInfo[]>;
    connectionUrl?: string;
    disabled?: boolean;
    initial?: { recordUrl?: string; table?: string; recordId?: string; column?: string; from?: string; to?: string };
    onAnalyze: (input: AnalysisInput) => void;
    /** Extra controls shown next to the Analyze button (e.g. settings). */
    actions?: ReactNode;
}

const MAX_OPTIONS = 50;

export function InputBar({ tables, loadColumns, connectionUrl, disabled, initial, onAnalyze, actions }: Props) {
    const [recordText, setRecordText] = useState(initial?.recordUrl ?? initial?.recordId ?? "");
    const [table, setTable] = useState(initial?.table ?? "");
    const [tableQuery, setTableQuery] = useState(initial?.table ?? "");
    const [column, setColumn] = useState(initial?.column ?? "");
    const [columnQuery, setColumnQuery] = useState(initial?.column ?? "");
    const [columns, setColumns] = useState<ColumnInfo[]>([]);
    const [preset, setPreset] = useState<WindowPreset>(initial?.from ? "custom" : "7d");
    const initialWindow = presetWindow("7d");
    const [customFrom, setCustomFrom] = useState(toLocalInputValue(initial?.from ? new Date(initial.from) : initialWindow.from));
    const [customTo, setCustomTo] = useState(toLocalInputValue(initial?.to ? new Date(initial.to) : initialWindow.to));

    const parsed = useMemo(() => (recordText.trim() ? parseRecordUrl(recordText) : undefined), [recordText]);

    // A URL that names its table fills the table picker.
    useEffect(() => {
        if (!parsed?.ok || tables.length === 0) return;
        const resolved = resolveTable(parsed.value, tables);
        if (resolved) {
            setTable(resolved);
            setTableQuery(tables.find((t) => t.logicalName === resolved)?.displayName ?? resolved);
        }
    }, [parsed, tables]);

    useEffect(() => {
        setColumns([]);
        if (!table) return;
        let cancelled = false;
        loadColumns(table)
            .then((cols) => !cancelled && setColumns(cols))
            .catch(() => !cancelled && setColumns([]));
        return () => {
            cancelled = true;
        };
    }, [table, loadColumns]);

    const tableOptions = useMemo(() => filterOptions(tables, tableQuery), [tables, tableQuery]);
    const columnOptions = useMemo(() => filterOptions(columns, columnQuery), [columns, columnQuery]);

    const recordId = parsed?.ok ? parsed.value.recordId : normalizeGuid(recordText);
    const customRange = preset === "custom" ? { from: new Date(customFrom), to: new Date(customTo) } : undefined;
    const windowError = preset === "custom" ? validateWindow(customRange?.from, customRange?.to) : undefined;
    const tableKnown = tables.length === 0 || tables.some((t) => t.logicalName === table);
    const recordError = recordText && parsed && !parsed.ok && !(parsed.error.includes("which table") && table) ? parsed.error : undefined;
    const envWarning = parsed?.ok && isDifferentEnvironment(parsed.value, connectionUrl) ? "This URL is from a different environment than the active connection." : undefined;
    const canAnalyze = !disabled && !!recordId && !!table && tableKnown && !windowError;

    const submit = () => {
        if (!canAnalyze || !recordId) return;
        const range = preset === "custom" ? customRange! : presetWindow(preset);
        onAnalyze({ table, recordId, column: column || undefined, from: range.from, to: range.to });
    };

    return (
        <section className="panel input-bar" aria-label="Record to analyze">
            <Field
                className="field-record"
                label="Record URL or ID"
                validationState={recordError ? "error" : envWarning ? "warning" : "none"}
                validationMessage={recordError ?? envWarning}
            >
                <Input value={recordText} onChange={(_, d) => setRecordText(d.value)} placeholder="https://org.crm.dynamics.com/main.aspx?etn=account&id=…" />
            </Field>

            <Field label="Table" validationState={table && !tableKnown ? "error" : "none"} validationMessage={table && !tableKnown ? "Unknown table." : undefined}>
                <Combobox
                    freeform
                    value={tableQuery}
                    selectedOptions={table ? [table] : []}
                    onChange={(e) => setTableQuery(e.target.value)}
                    onOptionSelect={(_, d) => {
                        setTable(d.optionValue ?? "");
                        setTableQuery(d.optionText ?? "");
                        setColumn("");
                        setColumnQuery("");
                    }}
                    placeholder="Search tables"
                >
                    {tableOptions.map((t) => (
                        <Option key={t.logicalName} value={t.logicalName} text={t.displayName}>
                            {t.displayName} <span className="muted">({t.logicalName})</span>
                        </Option>
                    ))}
                </Combobox>
            </Field>

            <Field label="Column of interest (optional)">
                <Combobox
                    freeform
                    clearable
                    disabled={!table}
                    value={columnQuery}
                    selectedOptions={column ? [column] : []}
                    onChange={(e) => {
                        setColumnQuery(e.target.value);
                        if (!e.target.value) setColumn("");
                    }}
                    onOptionSelect={(_, d) => {
                        setColumn(d.optionValue ?? "");
                        setColumnQuery(d.optionText ?? "");
                    }}
                    placeholder="Any column"
                >
                    {columnOptions.map((c) => (
                        <Option key={c.logicalName} value={c.logicalName} text={c.displayName}>
                            {c.displayName} <span className="muted">({c.logicalName})</span>
                        </Option>
                    ))}
                </Combobox>
            </Field>

            <Field label="Time window" validationState={windowError ? "error" : "none"} validationMessage={windowError}>
                <div className="window-row">
                    <Dropdown
                        value={PRESETS.find((p) => p.key === preset)?.label}
                        selectedOptions={[preset]}
                        onOptionSelect={(_, d) => setPreset(d.optionValue as WindowPreset)}
                    >
                        {PRESETS.map((p) => (
                            <Option key={p.key} value={p.key}>
                                {p.label}
                            </Option>
                        ))}
                    </Dropdown>
                    {preset === "custom" && (
                        <>
                            <Input type="datetime-local" value={customFrom} onChange={(_, d) => setCustomFrom(d.value)} aria-label="From" />
                            <Input type="datetime-local" value={customTo} onChange={(_, d) => setCustomTo(d.value)} aria-label="To" />
                        </>
                    )}
                </div>
            </Field>

            <div className="analyze-row">
                <Button appearance="primary" icon={<Search20Regular />} disabled={!canAnalyze} onClick={submit} className="analyze">
                    Analyze
                </Button>
                {actions}
            </div>
        </section>
    );
}

function filterOptions<T extends { logicalName: string; displayName: string }>(items: T[], query: string): T[] {
    const q = query.trim().toLowerCase();
    const matches = q ? items.filter((i) => i.logicalName.includes(q) || i.displayName.toLowerCase().includes(q)) : items;
    return matches.slice(0, MAX_OPTIONS);
}
