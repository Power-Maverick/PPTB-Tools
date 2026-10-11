import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger, Field, Input, SpinButton, Switch } from "@fluentui/react-components";
import { Settings20Regular } from "@fluentui/react-icons";
import { useState } from "react";
import { DEFAULT_SETTINGS, type AnalysisSettings } from "../model/types";

interface Props {
    settings: AnalysisSettings;
    onChange: (settings: AnalysisSettings) => void;
}

const NUMBERS: Array<{ key: keyof AnalysisSettings; label: string; hint: string; min: number; max: number }> = [
    { key: "maxHops", label: "Related-record hops", hint: "How far to follow the chain to related records (0–3).", min: 0, max: 3 },
    { key: "maxRecords", label: "Maximum records", hint: "Upper limit on records pulled into one analysis.", min: 1, max: 50 },
    { key: "overwriteWindowHours", label: "Overwrite window (hours)", hint: "A value replaced within this time counts as overwritten.", min: 1, max: 720 },
    { key: "stuckAsyncMinutes", label: "Stuck after (minutes)", hint: "System jobs / flow runs waiting longer than this are flagged.", min: 1, max: 10080 },
    { key: "flowTriggerWindowMinutes", label: "Flow start delay (minutes)", hint: "How long after a change a flow may start and still be linked to it.", min: 1, max: 120 },
    { key: "loopDepthThreshold", label: "Depth warning at", hint: "Flag requests that go this many levels deep.", min: 2, max: 8 },
    { key: "raceWindowSeconds", label: "Race window (seconds)", hint: "Two independent writers this close together count as a race.", min: 1, max: 120 },
    { key: "slowPluginSeconds", label: "Slow plugin (seconds)", hint: "Synchronous plugins slower than this are flagged.", min: 1, max: 120 },
];

export function SettingsDialog({ settings, onChange }: Props) {
    const [draft, setDraft] = useState(settings);
    const set = <K extends keyof AnalysisSettings>(key: K, value: AnalysisSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
    return (
        <Dialog onOpenChange={(_, d) => d.open && setDraft(settings)}>
            <DialogTrigger disableButtonEnhancement>
                <Button appearance="subtle" icon={<Settings20Regular />} aria-label="Analysis settings" title="Analysis settings" />
            </DialogTrigger>
            <DialogSurface>
                <DialogBody>
                    <DialogTitle>Analysis settings</DialogTitle>
                    <DialogContent className="settings-grid">
                        {NUMBERS.map((n) => (
                            <Field key={n.key} label={n.label} hint={n.hint}>
                                <SpinButton
                                    min={n.min}
                                    max={n.max}
                                    value={draft[n.key] as number}
                                    onChange={(_, d) => {
                                        const v = d.value ?? Number(d.displayValue);
                                        if (Number.isFinite(v)) set(n.key, Math.min(n.max, Math.max(n.min, Math.round(v as number))) as never);
                                    }}
                                />
                            </Field>
                        ))}
                        <Field label="Duplicate check: column that tells child records apart" hint="E.g. cr_addresstype. Leave empty to pick choice columns named like type / category / primary automatically.">
                            <Input value={draft.duplicateDiscriminator} onChange={(_, d) => set("duplicateDiscriminator", d.value.trim().toLowerCase())} placeholder="automatic" />
                        </Field>
                        <Switch checked={draft.includeSystemSteps} onChange={(_, d) => set("includeSystemSteps", d.checked)} label="Include Microsoft / system plugin steps" />
                    </DialogContent>
                    <DialogActions>
                        <Button appearance="secondary" onClick={() => setDraft(DEFAULT_SETTINGS)}>
                            Reset to defaults
                        </Button>
                        <DialogTrigger disableButtonEnhancement>
                            <Button appearance="secondary">Cancel</Button>
                        </DialogTrigger>
                        <DialogTrigger disableButtonEnhancement>
                            <Button appearance="primary" onClick={() => onChange(draft)}>
                                Save
                            </Button>
                        </DialogTrigger>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}
