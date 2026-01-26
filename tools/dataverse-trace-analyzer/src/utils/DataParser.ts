export function formatDateTime(dateString: string) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString();
}

export function formatDuration(duration: number) {
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
}

export function getOperationTypeLabel(type: number) {
    const types: { [key: number]: string } = {
        1: "Plugin",
        2: "WF Activity",
    };
    return types[type] || `Type ${type}`;
}

export function getModeLabel(mode: number | undefined) {
    if (mode === undefined || mode === null) return "N/A";
    return mode === 0 ? "Synchronous" : "Asynchronous";
}
