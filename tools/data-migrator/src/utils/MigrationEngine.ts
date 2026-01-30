import {
  MigrationConfig,
  MigrationProgress,
  MigrationRecord,
  MigrationStatus,
  AutoMappingResult,
  UserRecord,
  TeamRecord,
  BusinessUnitRecord,
} from "../models/interfaces";
import { DataverseClient } from "./DataverseClient";

/**
 * Engine for performing data migration operations
 */
export class MigrationEngine {
  private sourceClient: DataverseClient;
  private targetClient: DataverseClient;
  private userMappings: Map<string, string> = new Map();
  private teamMappings: Map<string, string> = new Map();
  private businessUnitMappings: Map<string, string> = new Map();

  constructor() {
    this.sourceClient = new DataverseClient("primary");
    this.targetClient = new DataverseClient("secondary");
  }

  /**
   * Auto-map users between source and target environments
   */
  async autoMapUsers(): Promise<AutoMappingResult[]> {
    try {
      const sourceUsers = await this.sourceClient.fetchUsers();
      const targetUsers = await this.targetClient.fetchUsers();

      const results: AutoMappingResult[] = [];

      for (const sourceUser of sourceUsers) {
        // Try to match by domain name first (highest confidence)
        let targetUser = targetUsers.find(
          (u) => u.domainname === sourceUser.domainname
        );
        let confidence: "high" | "medium" | "low" = "high";
        let matchCriteria = "Domain Name";

        // If not found, try by email
        if (!targetUser && sourceUser.internalemailaddress) {
          targetUser = targetUsers.find(
            (u) =>
              u.internalemailaddress === sourceUser.internalemailaddress
          );
          confidence = "high";
          matchCriteria = "Email Address";
        }

        // If not found, try by full name
        if (!targetUser) {
          targetUser = targetUsers.find(
            (u) => u.fullname === sourceUser.fullname
          );
          confidence = "medium";
          matchCriteria = "Full Name";
        }

        if (targetUser) {
          this.userMappings.set(
            sourceUser.systemuserid,
            targetUser.systemuserid
          );
          results.push({
            sourceId: sourceUser.systemuserid,
            targetId: targetUser.systemuserid,
            displayName: sourceUser.fullname,
            confidence,
            matchCriteria,
          });
        }
      }

      return results;
    } catch (error: any) {
      console.error("Failed to auto-map users:", error);
      throw new Error(`Failed to auto-map users: ${error.message}`);
    }
  }

  /**
   * Auto-map teams between source and target environments
   */
  async autoMapTeams(): Promise<AutoMappingResult[]> {
    try {
      const sourceTeams = await this.sourceClient.fetchTeams();
      const targetTeams = await this.targetClient.fetchTeams();

      const results: AutoMappingResult[] = [];

      for (const sourceTeam of sourceTeams) {
        // Match by name and team type
        const targetTeam = targetTeams.find(
          (t) => t.name === sourceTeam.name && t.teamtype === sourceTeam.teamtype
        );

        if (targetTeam) {
          this.teamMappings.set(sourceTeam.teamid, targetTeam.teamid);
          results.push({
            sourceId: sourceTeam.teamid,
            targetId: targetTeam.teamid,
            displayName: sourceTeam.name,
            confidence: "high",
            matchCriteria: "Name & Type",
          });
        }
      }

      return results;
    } catch (error: any) {
      console.error("Failed to auto-map teams:", error);
      throw new Error(`Failed to auto-map teams: ${error.message}`);
    }
  }

  /**
   * Auto-map business units between source and target environments
   */
  async autoMapBusinessUnits(): Promise<AutoMappingResult[]> {
    try {
      const sourceUnits = await this.sourceClient.fetchBusinessUnits();
      const targetUnits = await this.targetClient.fetchBusinessUnits();

      const results: AutoMappingResult[] = [];

      for (const sourceUnit of sourceUnits) {
        // Match by name
        const targetUnit = targetUnits.find((u) => u.name === sourceUnit.name);

        if (targetUnit) {
          this.businessUnitMappings.set(
            sourceUnit.businessunitid,
            targetUnit.businessunitid
          );
          results.push({
            sourceId: sourceUnit.businessunitid,
            targetId: targetUnit.businessunitid,
            displayName: sourceUnit.name,
            confidence: "high",
            matchCriteria: "Name",
          });
        }
      }

      return results;
    } catch (error: any) {
      console.error("Failed to auto-map business units:", error);
      throw new Error(`Failed to auto-map business units: ${error.message}`);
    }
  }

  /**
   * Migrate records based on configuration
   */
  async migrateRecords(
    config: MigrationConfig,
    onProgress: (progress: MigrationProgress) => void
  ): Promise<void> {
    try {
      // Fetch source records
      const selectFields = config.fieldMappings
        .filter((m) => m.isEnabled)
        .map((m) => m.sourceField);

      // Add primary ID field
      const entityMetadata = await window.dataverseAPI.getEntityMetadata(
        config.entityLogicalName,
        true,  // searchByLogicalName should be true
        ["PrimaryIdAttribute"],
        "primary"  // Use primary connection for source
      );
      
      if (!entityMetadata || !entityMetadata.PrimaryIdAttribute) {
        throw new Error(`Unable to get primary ID attribute for entity ${config.entityLogicalName}`);
      }
      
      const primaryIdField = entityMetadata.PrimaryIdAttribute;

      if (!selectFields.includes(primaryIdField)) {
        selectFields.push(primaryIdField);
      }

      let sourceRecords: any[];

      // Use appropriate query method based on filter type
      if (config.filterType === "fetchxml" && config.filterQuery) {
        // Use FetchXML query
        sourceRecords = await this.sourceClient.queryRecordsWithFetchXml(config.filterQuery);
      } else {
        // Use OData query
        sourceRecords = await this.sourceClient.queryRecords(
          config.entityLogicalName,
          selectFields,
          config.filterQuery
        );
      }

      const totalRecords = sourceRecords.length;
      const totalBatches = Math.ceil(totalRecords / config.batchSize);

      const progress: MigrationProgress = {
        total: totalRecords,
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        records: [],
        isInProgress: true,
        currentBatch: 0,
        totalBatches: totalBatches,
      };

      // Process records in batches
      for (let i = 0; i < totalRecords; i += config.batchSize) {
        const batch = sourceRecords.slice(i, i + config.batchSize);
        progress.currentBatch = Math.floor(i / config.batchSize) + 1;

        for (const sourceRecord of batch) {
          const recordId = sourceRecord[primaryIdField];
          
          // Get primary name from entity metadata
          const entityMetadataForName = await window.dataverseAPI.getEntityMetadata(
            config.entityLogicalName,
            true,
            ["PrimaryNameAttribute"],
            "primary"
          );
          const primaryNameField = entityMetadataForName?.PrimaryNameAttribute;
          const primaryName = primaryNameField ? sourceRecord[primaryNameField] : "";
          
          const displayField = config.fieldMappings.find(
            (m) => m.sourceField.includes("name")
          )?.sourceField;
          const displayName =
            displayField && sourceRecord[displayField]
              ? sourceRecord[displayField]
              : (primaryName || recordId);

          const migrationRecord: MigrationRecord = {
            sourceId: recordId,
            displayName,
            primaryName: primaryName || displayName,
            status: "processing",
          };

          progress.records.push(migrationRecord);
          onProgress({ ...progress });

          try {
            // Transform record with mappings
            const targetData = this.transformRecord(sourceRecord, config);

            // Perform all selected operations on each record
            for (const operation of config.operations) {
              switch (operation) {
                case "create":
                  const createdId = await this.targetClient.createRecord(
                    config.entityLogicalName,
                    targetData
                  );
                  migrationRecord.targetId = createdId;
                  break;

                case "update":
                  await this.targetClient.updateRecord(
                    config.entityLogicalName,
                    recordId,
                    targetData
                  );
                  migrationRecord.targetId = recordId;
                  break;

                case "delete":
                  await this.targetClient.deleteRecord(
                    config.entityLogicalName,
                    recordId
                  );
                  migrationRecord.targetId = recordId;
                  break;
              }
            }
            
            migrationRecord.status = "success";
            progress.successful++;
          } catch (error: any) {
            migrationRecord.status = "error";
            migrationRecord.errorMessage = error.message;
            progress.failed++;
          }

          progress.processed++;
          onProgress({ ...progress });
        }
      }

      progress.isInProgress = false;
      onProgress({ ...progress });
    } catch (error: any) {
      console.error("Failed to migrate records:", error);
      throw new Error(`Failed to migrate records: ${error.message}`);
    }
  }

  /**
   * Transform source record to target record with field mappings
   */
  private transformRecord(sourceRecord: any, config: MigrationConfig): any {
    const targetRecord: any = {};

    for (const mapping of config.fieldMappings) {
      if (!mapping.isEnabled) {
        continue;
      }

      let sourceValue = sourceRecord[mapping.sourceField];

      if (sourceValue === null || sourceValue === undefined) {
        continue;
      }

      // Check if this is a lookup field that needs mapping
      const lookupMapping = config.lookupMappings.find(
        (l) => l.fieldName === mapping.sourceField
      );

      if (lookupMapping) {
        if (lookupMapping.strategy === "skip") {
          continue;
        }

        // Extract GUID from lookup value (handle both string and object formats)
        let lookupGuid: string;
        if (typeof sourceValue === "string") {
          lookupGuid = sourceValue;
        } else if (sourceValue._value) {
          lookupGuid = sourceValue._value;
        } else if (sourceValue.id) {
          lookupGuid = sourceValue.id;
        } else {
          // Try to get the value from formatted lookup field name
          const lookupValueField = `_${mapping.sourceField}_value`;
          lookupGuid = sourceRecord[lookupValueField] || sourceValue;
        }

        // Remove curly braces if present
        lookupGuid = lookupGuid.replace(/[{}]/g, "");

        // Apply auto-mapping based on entity type
        let mappedGuid = lookupGuid;

        if (lookupMapping.targetEntity === "systemuser") {
          mappedGuid = this.userMappings.get(lookupGuid) || lookupGuid;
        } else if (lookupMapping.targetEntity === "team") {
          mappedGuid = this.teamMappings.get(lookupGuid) || lookupGuid;
        } else if (lookupMapping.targetEntity === "businessunit") {
          mappedGuid =
            this.businessUnitMappings.get(lookupGuid) || lookupGuid;
        } else if (
          lookupMapping.strategy === "manual" &&
          lookupMapping.manualMappings
        ) {
          mappedGuid =
            lookupMapping.manualMappings.get(lookupGuid) || lookupGuid;
        }

        // Format as OData lookup reference
        // For single-valued navigation properties, use @odata.bind format
        targetRecord[`${mapping.targetField}@odata.bind`] = 
          `/${lookupMapping.targetEntity}s(${mappedGuid})`;
      } else {
        targetRecord[mapping.targetField] = sourceValue;
      }
    }

    return targetRecord;
  }

  /**
   * Get current user mappings
   */
  getUserMappings(): Map<string, string> {
    return this.userMappings;
  }

  /**
   * Get current team mappings
   */
  getTeamMappings(): Map<string, string> {
    return this.teamMappings;
  }

  /**
   * Get current business unit mappings
   */
  getBusinessUnitMappings(): Map<string, string> {
    return this.businessUnitMappings;
  }
}
