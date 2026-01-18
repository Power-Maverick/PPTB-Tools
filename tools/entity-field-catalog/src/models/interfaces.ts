/**
 * Represents a Dataverse entity (table) in the solution
 */
export interface DataverseEntity {
    /** Logical name of the entity */
    logicalName: string;
    /** Display name of the entity */
    displayName: string;
    /** Schema name of the entity */
    schemaName: string;
    /** Primary ID attribute name */
    primaryIdAttribute: string;
    /** Primary name attribute */
    primaryNameAttribute: string;
    /** Description */
    description?: string;
    /** Object type code */
    objectTypeCode?: number;
    /** Fields (attributes) in the entity */
    fields: DataverseField[];
}

/**
 * Represents a field (attribute) in a Dataverse entity
 */
export interface DataverseField {
    /** Logical name of the field */
    logicalName: string;
    /** Display name of the field */
    displayName: string;
    /** Schema name of the field */
    schemaName: string;
    /** Data type of the field */
    type: string;
    /** Whether this is a primary key */
    isPrimaryId: boolean;
    /** Whether this is the primary name field */
    isPrimaryName: boolean;
    /** Required level for the field */
    requiredLevel?: string;
    /** Description of the field */
    description?: string;
}

/**
 * Represents a Dataverse solution
 */
export interface DataverseSolution {
    /** Unique name of the solution */
    uniqueName: string;
    /** Display name of the solution */
    displayName: string;
    /** Version of the solution */
    version: string;
    /** Publisher prefix */
    publisherPrefix: string;
}

/**
 * Export format options
 */
export type ExportFormat = "Excel";

/**
 * Custom column definition for export
 */
export interface CustomColumn {
    /** Unique ID for the column */
    id: string;
    /** Column header name */
    name: string;
    /** Default value for the column (optional) */
    defaultValue?: string;
}

/**
 * Saved column configuration
 */
export interface ColumnConfiguration {
    /** Unique ID for the configuration */
    id: string;
    /** Name of the configuration */
    name: string;
    /** List of custom columns */
    columns: CustomColumn[];
    /** Creation timestamp */
    createdAt: number;
}
