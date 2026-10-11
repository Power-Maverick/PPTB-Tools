import type { ReadOnlyDataverse } from "../host/readOnlyDataverse";
import type { Actor, TableSchema } from "../model/types";
import { str } from "../parse/values";
import { fetchPages } from "./fetchXml";

export interface UserInfo {
    id: string;
    name: string;
    kind: "user" | "app" | "system";
}

export type UserIndex = Map<string, UserInfo>;

/** Pure: application users (applicationid set) and non-interactive users count as integrations. */
export function classifyUser(row: Record<string, unknown>): UserInfo {
    const id = String(row.systemuserid ?? "").toLowerCase();
    const name = str(row.fullname) ?? id;
    const accessMode = Number(row.accessmode);
    if (/^(system|integration)$/i.test(name.trim())) return { id, name, kind: "system" };
    if (str(row.applicationid) || accessMode === 4) return { id, name, kind: "app" };
    return { id, name, kind: "user" };
}

export function userActor(users: UserIndex, id: string | undefined, fallbackName?: string): Actor {
    if (!id) return { key: "system:unknown", kind: "system", name: fallbackName ?? "Unknown" };
    const info = users.get(id.toLowerCase());
    const kind = info?.kind ?? "user";
    return { key: `${kind}:${id.toLowerCase()}`, kind, name: info?.name ?? fallbackName ?? id };
}

export async function loadUsers(dv: ReadOnlyDataverse, schema: TableSchema | undefined, ids: string[], into: UserIndex): Promise<void> {
    const missing = [...new Set(ids.map((i) => i.toLowerCase()))].filter((id) => !into.has(id));
    if (!missing.length || !schema?.exists) return;
    const attributes = ["systemuserid", ...["fullname", "applicationid", "accessmode", "domainname"].filter((c) => schema.columns.includes(c))];
    for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        try {
            for await (const page of fetchPages(dv, { entity: "systemuser", attributes, conditions: [{ attribute: "systemuserid", operator: "in", value: chunk }] }, { pageSize: 100, maxPages: 2 })) {
                for (const row of page.rows) {
                    const info = classifyUser(row);
                    into.set(info.id, info);
                }
            }
        } catch {
            // Names fall back to IDs; classification falls back to "user".
        }
    }
}
