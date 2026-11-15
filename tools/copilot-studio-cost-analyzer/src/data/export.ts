export function serializeCsv(headers: string[], rows: Array<Array<string | number>>): string {
    const cell = (value: unknown) => {
        const text = value === null || value === undefined ? "" : String(value);
        return `"${text.replace(/"/g, '""')}"`;
    };
    const content = [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
    return `\uFEFF${content}`;
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
    const url = URL.createObjectURL(new Blob([serializeCsv(headers, rows)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
