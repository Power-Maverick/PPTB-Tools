import type { ReadOnlyDataverse } from "../host/readOnlyDataverse";

export type ConditionOperator = "eq" | "ne" | "in" | "ge" | "le" | "gt" | "lt" | "null" | "not-null" | "like";

export interface Condition {
    attribute: string;
    operator: ConditionOperator;
    value?: string | number | boolean | Date | Array<string | number>;
}

export interface FetchSpec {
    entity: string;
    attributes: string[];
    conditions?: Condition[];
    /** Combine conditions with "or" instead of the default "and". */
    filterType?: "and" | "or";
    /** Nested groups, AND-ed with the top-level conditions. */
    subFilters?: Array<{ type: "and" | "or"; conditions: Condition[] }>;
    orders?: Array<{ attribute: string; descending?: boolean }>;
    top?: number;
}

/**
 * Filter on an EntityName column (sdkmessagefilter.primaryobjecttypecode, workflow.primaryentity).
 * Dataverse converts `in` values on these to Int32 type codes, so logical names fail there:
 * use type codes when every table's code is known, otherwise OR-ed `eq` conditions on the names.
 */
export function entityNameFilter(attribute: string, tables: string[], typeCodes?: Map<string, number>): Pick<FetchSpec, "conditions" | "subFilters"> {
    const codes = tables.map((t) => typeCodes?.get(t));
    if (codes.length && codes.every((c): c is number => typeof c === "number")) {
        return { conditions: [{ attribute, operator: "in", value: codes }] };
    }
    return { subFilters: [{ type: "or", conditions: tables.map((t) => ({ attribute, operator: "eq" as const, value: t })) }] };
}

export function escapeXml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function formatValue(value: string | number | boolean | Date): string {
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

function conditionXml(c: Condition): string {
    const attr = escapeXml(c.attribute);
    if (c.operator === "null" || c.operator === "not-null") {
        return `<condition attribute="${attr}" operator="${c.operator}" />`;
    }
    if (Array.isArray(c.value)) {
        const values = c.value.map((v) => `<value>${escapeXml(formatValue(v))}</value>`).join("");
        return `<condition attribute="${attr}" operator="${c.operator}">${values}</condition>`;
    }
    return `<condition attribute="${attr}" operator="${c.operator}" value="${escapeXml(formatValue(c.value ?? ""))}" />`;
}

export function buildFetchXml(spec: FetchSpec, paging?: { page: number; count: number; cookie?: string }): string {
    const fetchAttrs = [
        spec.top !== undefined && !paging ? `top="${spec.top}"` : "",
        paging ? `page="${paging.page}" count="${paging.count}"` : "",
        paging?.cookie ? `paging-cookie="${escapeXml(paging.cookie)}"` : "",
    ]
        .filter(Boolean)
        .join(" ");
    const attrs = spec.attributes.map((a) => `<attribute name="${escapeXml(a)}" />`).join("");
    const orders = (spec.orders ?? []).map((o) => `<order attribute="${escapeXml(o.attribute)}" descending="${o.descending ? "true" : "false"}" />`).join("");
    const groups = (spec.subFilters ?? []).filter((g) => g.conditions.length).map((g) => `<filter type="${g.type}">${g.conditions.map(conditionXml).join("")}</filter>`);
    const filter = spec.conditions?.length || groups.length ? `<filter type="${spec.filterType ?? "and"}">${(spec.conditions ?? []).map(conditionXml).join("")}${groups.join("")}</filter>` : "";
    return `<fetch ${fetchAttrs}><entity name="${escapeXml(spec.entity)}">${attrs}${orders}${filter}</entity></fetch>`;
}

/**
 * Pulls the inner paging cookie out of the "@Microsoft.Dynamics.CRM.fetchxmlpagingcookie" annotation.
 * The annotation is `<cookie pagenumber="2" pagingcookie="%253ccookie..." />`, double URL-encoded.
 */
export function extractPagingCookie(annotation: unknown): string | undefined {
    if (typeof annotation !== "string") return undefined;
    const match = /pagingcookie="([^"]*)"/.exec(annotation);
    if (!match) return undefined;
    try {
        return decodeURIComponent(decodeURIComponent(match[1]));
    } catch {
        return undefined;
    }
}

export interface PageOptions {
    pageSize?: number;
    maxPages?: number;
    signal?: AbortSignal;
}

export interface Page<T = Record<string, unknown>> {
    rows: T[];
    page: number;
    /** True when the page limit stopped paging while Dataverse still had more rows. */
    truncated: boolean;
}

/** Yields one page at a time so the UI can render progressively instead of waiting for a full scan. */
export async function* fetchPages(dv: ReadOnlyDataverse, spec: FetchSpec, options: PageOptions = {}): AsyncGenerator<Page> {
    const count = options.pageSize ?? 500;
    const maxPages = options.maxPages ?? 20;
    let cookie: string | undefined;
    for (let page = 1; page <= maxPages; page++) {
        if (options.signal?.aborted) return;
        const result = await dv.fetchXml(buildFetchXml(spec, { page, count, cookie }));
        const raw = result as unknown as Record<string, unknown>;
        const rows = result.value ?? [];
        const moreFlag = raw["@Microsoft.Dynamics.CRM.morerecords"];
        const more = typeof moreFlag === "boolean" ? moreFlag : rows.length === count;
        cookie = extractPagingCookie(raw["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"]);
        const last = !more || page === maxPages;
        yield { rows, page, truncated: more && page === maxPages };
        if (last) return;
    }
}
