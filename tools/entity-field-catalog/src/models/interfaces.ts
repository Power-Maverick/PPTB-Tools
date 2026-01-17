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
  /** Whether this field is required */
  isRequired: boolean;
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
export type ExportFormat = "Excel" | "CSV";
