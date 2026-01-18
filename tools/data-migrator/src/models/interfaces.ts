/**
 * Represents a Dataverse entity (table)
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
  /** Attribute type (for reference types) */
  attributeType?: string;
  /** Whether this is a primary key */
  isPrimaryId: boolean;
  /** Whether this is the primary name field */
  isPrimaryName: boolean;
  /** Required level for the field */
  requiredLevel?: string;
  /** Description of the field */
  description?: string;
  /** Targets for lookup fields */
  targets?: string[];
}

/**
 * Migration operation type
 */
export type MigrationOperation = "create" | "update" | "upsert";

/**
 * Migration status for a record
 */
export type MigrationStatus = "pending" | "processing" | "success" | "error" | "skipped";

/**
 * Represents a record being migrated
 */
export interface MigrationRecord {
  /** Source record ID */
  sourceId: string;
  /** Target record ID (if created/updated) */
  targetId?: string;
  /** Display name or identifier */
  displayName: string;
  /** Status of the migration */
  status: MigrationStatus;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Field mapping configuration
 */
export interface FieldMapping {
  /** Source field logical name */
  sourceField: string;
  /** Target field logical name */
  targetField: string;
  /** Whether this field should be mapped */
  isEnabled: boolean;
  /** Field type */
  fieldType: string;
}

/**
 * Lookup mapping for reference fields
 */
export interface LookupMapping {
  /** Field logical name */
  fieldName: string;
  /** Field display name */
  fieldDisplayName: string;
  /** Target entity type */
  targetEntity: string;
  /** Mapping strategy */
  strategy: "auto" | "manual" | "skip";
  /** Manual mapping values (source ID -> target ID) */
  manualMappings?: Map<string, string>;
}

/**
 * Auto-mapping result for system entities
 */
export interface AutoMappingResult {
  /** Source ID */
  sourceId: string;
  /** Target ID */
  targetId: string;
  /** Display name */
  displayName: string;
  /** Match confidence */
  confidence: "high" | "medium" | "low";
  /** Match criteria used */
  matchCriteria: string;
}

/**
 * Migration configuration
 */
export interface MigrationConfig {
  /** Source entity logical name */
  entityLogicalName: string;
  /** Entity display name */
  entityDisplayName: string;
  /** Migration operation */
  operation: MigrationOperation;
  /** Field mappings */
  fieldMappings: FieldMapping[];
  /** Lookup mappings */
  lookupMappings: LookupMapping[];
  /** Filter query for source records */
  filterQuery?: string;
  /** Batch size for migration */
  batchSize: number;
}

/**
 * Migration progress information
 */
export interface MigrationProgress {
  /** Total records to migrate */
  total: number;
  /** Records processed */
  processed: number;
  /** Records successful */
  successful: number;
  /** Records failed */
  failed: number;
  /** Records skipped */
  skipped: number;
  /** Migration records detail */
  records: MigrationRecord[];
  /** Whether migration is in progress */
  isInProgress: boolean;
  /** Current batch being processed */
  currentBatch?: number;
  /** Total batches */
  totalBatches?: number;
}

/**
 * User record for mapping
 */
export interface UserRecord {
  /** User ID */
  systemuserid: string;
  /** Full name */
  fullname: string;
  /** Domain name / email */
  domainname: string;
  /** Internal email address */
  internalemailaddress?: string;
}

/**
 * Team record for mapping
 */
export interface TeamRecord {
  /** Team ID */
  teamid: string;
  /** Team name */
  name: string;
  /** Team type */
  teamtype: number;
}

/**
 * Business Unit record for mapping
 */
export interface BusinessUnitRecord {
  /** Business unit ID */
  businessunitid: string;
  /** Name */
  name: string;
}
