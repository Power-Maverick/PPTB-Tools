/**
 * Reads the tables a classic workflow writes to from its XAML. Pattern-based and defensive:
 * anything unexpected yields fewer edges and a warning, never an exception.
 */
export interface XamlWrite {
    table: string;
    operation: "Create" | "Update";
    columns: string[];
}

export function parseWorkflowXaml(xaml: unknown): { writes: XamlWrite[]; warnings: string[] } {
    const warnings: string[] = [];
    if (typeof xaml !== "string" || !xaml.trim()) return { writes: [], warnings };
    const writes = new Map<string, XamlWrite>();
    try {
        const add = (operation: XamlWrite["operation"], table: string) => {
            const key = `${operation}:${table.toLowerCase()}`;
            if (!writes.has(key)) writes.set(key, { table: table.toLowerCase(), operation, columns: [] });
            return writes.get(key)!;
        };
        for (const m of xaml.matchAll(/<mxswa:(CreateEntity|UpdateEntity)\b[^>]*?\bEntityName="([^"]+)"/g)) {
            add(m[1] === "CreateEntity" ? "Create" : "Update", m[2]);
        }
        // SetEntityProperty Attribute="x" EntityName="y" — the columns being set before a create/update.
        for (const m of xaml.matchAll(/<mxswa:SetEntityProperty\b([^>]*)>/g)) {
            const attr = /\bAttribute="([^"]+)"/.exec(m[1])?.[1];
            const entity = /\bEntityName="([^"]+)"/.exec(m[1])?.[1];
            if (!attr || !entity) continue;
            const target = writes.get(`Update:${entity.toLowerCase()}`) ?? writes.get(`Create:${entity.toLowerCase()}`);
            if (target && !target.columns.includes(attr.toLowerCase())) target.columns.push(attr.toLowerCase());
        }
    } catch {
        warnings.push("The workflow definition couldn't be fully read.");
    }
    return { writes: [...writes.values()], warnings };
}
