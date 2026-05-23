export function joinPath(...parts: string[]): string {
    return parts
        .filter(Boolean)
        .map((p) => p.replace(/\\/g, "/"))
        .join("/")
        .replace(/\/+/g, "/");
}

export function getDirname(p: string): string {
    const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return idx > 0 ? p.substring(0, idx) : p;
}
