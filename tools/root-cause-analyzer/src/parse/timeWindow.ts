export type WindowPreset = "24h" | "7d" | "30d" | "custom";

export const PRESETS: Array<{ key: WindowPreset; label: string; hours?: number }> = [
    { key: "24h", label: "Last 24 hours", hours: 24 },
    { key: "7d", label: "Last 7 days", hours: 24 * 7 },
    { key: "30d", label: "Last 30 days", hours: 24 * 30 },
    { key: "custom", label: "Custom range" },
];

export function presetWindow(preset: Exclude<WindowPreset, "custom">, now = new Date()): { from: Date; to: Date } {
    const hours = PRESETS.find((p) => p.key === preset)!.hours!;
    return { from: new Date(now.getTime() - hours * 3_600_000), to: now };
}

export function validateWindow(from: Date | undefined, to: Date | undefined): string | undefined {
    if (!from || Number.isNaN(from.getTime())) return "Pick a start time.";
    if (!to || Number.isNaN(to.getTime())) return "Pick an end time.";
    if (from >= to) return "The start must be before the end.";
    return undefined;
}

/** For <input type="datetime-local">, which expects local time without a zone. */
export function toLocalInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
