import { AssetKind } from "./interfaces";

type ComponentTypeDefinition = { code: number; kind: AssetKind; label: string };

/**
 * Canonical Dataverse component type definitions.
 * Reference: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/solutioncomponent#componenttype-choicesoptions
 */
export const COMPONENT_TYPES = {
    ENTITY: { code: 1, kind: "entity", label: "Entity" },
    ATTRIBUTE: { code: 2, kind: "attribute", label: "Attribute" },
    RELATIONSHIP: { code: 3, kind: "relationship", label: "Relationship" },
    OPTION_SET: { code: 9, kind: "optionset", label: "Option Set" },
    ROLE: { code: 20, kind: "role", label: "Role" },
    FORM: { code: 24, kind: "form", label: "Form" },
    SAVED_QUERY: { code: 26, kind: "view", label: "Saved Query" },
    WORKFLOW: { code: 29, kind: "workflow", label: "Workflow" },
    REPORT: { code: 31, kind: "report", label: "Report" },
    EMAIL_TEMPLATE: { code: 36, kind: "emailtemplate", label: "Email Template" },
    SYSTEM_FORM: { code: 60, kind: "form", label: "System Form" },
    WEB_RESOURCE: { code: 61, kind: "webresource", label: "Web Resource" },
    SITE_MAP: { code: 62, kind: "sitemap", label: "Site Map" },
    PLUGIN_TYPE: { code: 90, kind: "plugin", label: "Plugin Type" },
    CANVAS_APP: { code: 300, kind: "canvasapp", label: "Canvas App" },
    CONNECTOR: { code: 371, kind: "connector", label: "Connector" },
    CONNECTOR_REFERENCE: { code: 372, kind: "connector", label: "Connector" },
} as const satisfies Record<string, ComponentTypeDefinition>;

export const LEAF_ONLY_ASSET_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>(["form", "view"]);

export const ComponentTypeCode = Object.fromEntries(Object.entries(COMPONENT_TYPES).map(([key, value]) => [key, value.code])) as {
    [K in keyof typeof COMPONENT_TYPES]: (typeof COMPONENT_TYPES)[K]["code"];
};

const COMPONENT_TYPE_MAP: Record<number, { kind: AssetKind; label: string }> = Object.fromEntries(Object.values(COMPONENT_TYPES).map(({ code, kind, label }) => [code, { kind, label }]));

export function getComponentTypeInfo(typeCode: number): { kind: AssetKind; label: string } {
    return COMPONENT_TYPE_MAP[typeCode] ?? { kind: "other", label: `Unknown (${typeCode})` };
}
