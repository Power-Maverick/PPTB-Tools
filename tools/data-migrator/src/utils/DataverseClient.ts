import { BusinessUnitRecord, DataverseEntity, DataverseField, TeamRecord, UserRecord } from "../models/interfaces";

/**
 * Safely extract the localized label from Dataverse metadata fields
 */
function extractLabel(value: any): string | undefined {
    if (!value) {
        return undefined;
    }

    if (typeof value === "string") {
        return value;
    }

    return value?.UserLocalizedLabel?.Label || value?.LocalizedLabels?.[0]?.Label || value?.Label?.UserLocalizedLabel?.Label || value?.Label?.LocalizedLabels?.[0]?.Label || undefined;
}

/**
 * Escape OData string literals to prevent injection
 */
function escapeODataString(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Client for interacting with Dataverse using PPTB API
 */
export class DataverseClient {
    private connectionTarget: "primary" | "secondary";

    constructor(connectionTarget: "primary" | "secondary" = "primary") {
        this.connectionTarget = connectionTarget;
    }

    /**
     * Fetch all entities from the environment (without fields)
     */
    async fetchAllEntities(): Promise<DataverseEntity[]> {
        try {
            const entities = await window.dataverseAPI.getAllEntitiesMetadata(
                ["DisplayName", "LogicalName", "SchemaName", "PrimaryIdAttribute", "PrimaryNameAttribute", "Description", "ObjectTypeCode"],
                this.connectionTarget,
            );

            return entities.value.map((entityMetadata: any) => ({
                logicalName: entityMetadata.LogicalName,
                displayName: extractLabel(entityMetadata.DisplayName) || entityMetadata.LogicalName,
                schemaName: entityMetadata.SchemaName || entityMetadata.LogicalName,
                primaryIdAttribute: entityMetadata.PrimaryIdAttribute || "",
                primaryNameAttribute: entityMetadata.PrimaryNameAttribute || "",
                description: extractLabel(entityMetadata.Description),
                objectTypeCode: entityMetadata.ObjectTypeCode,
                fields: [], // Fields will be loaded on demand
            }));
        } catch (error: any) {
            console.error("Failed to fetch entities:", error);
            throw new Error(`Failed to fetch entities: ${error.message}`);
        }
    }

    /**
     * Fetch fields for a specific entity
     */
    async fetchEntityFields(entityLogicalName: string): Promise<DataverseField[]> {
        try {
            const entityMetadata = await window.dataverseAPI.getEntityRelatedMetadata(
                entityLogicalName,
                "Attributes",
                ["LogicalName", "DisplayName", "SchemaName", "AttributeTypeName", "AttributeType", "IsPrimaryId", "IsPrimaryName", "RequiredLevel", "Description"],
                this.connectionTarget,
            );

            const attributes = entityMetadata.value || [];

            return attributes.map((attr: any) => ({
                logicalName: attr.LogicalName,
                displayName: extractLabel(attr.DisplayName) || attr.LogicalName,
                schemaName: attr.SchemaName || attr.LogicalName,
                type: attr.AttributeTypeName?.Value || attr.AttributeType || "Unknown",
                attributeType: attr.AttributeType,
                isPrimaryId: attr.IsPrimaryId || false,
                isPrimaryName: attr.IsPrimaryName || false,
                requiredLevel: attr.RequiredLevel?.Value,
                description: extractLabel(attr.Description),
            }));
        } catch (error: any) {
            console.error(`Failed to fetch fields for ${entityLogicalName}:`, error);
            throw new Error(`Failed to fetch fields for ${entityLogicalName}: ${error.message}`);
        }
    }

    /**
     * Query records from an entity
     */
    async queryRecords(entityLogicalName: string, selectFields: string[], filterQuery?: string, orderBy?: string, top?: number): Promise<any[]> {
        try {
            const entitySetName = await window.dataverseAPI.getEntitySetName(entityLogicalName);

            let query = `${entitySetName}?$select=${selectFields.join(",")}`;

            if (filterQuery) {
                query += `&$filter=${filterQuery}`;
            }

            if (orderBy) {
                query += `&$orderby=${orderBy}`;
            }

            if (top) {
                query += `&$top=${top}`;
            }

            const response = await window.dataverseAPI.queryData(query, this.connectionTarget);
            return response.value || [];
        } catch (error: any) {
            console.error(`Failed to query records from ${entityLogicalName}:`, error);
            throw new Error(`Failed to query records: ${error.message}`);
        }
    }

    /**
     * Create a record
     */
    async createRecord(entityLogicalName: string, recordData: any): Promise<string> {
        try {
            const response = await window.dataverseAPI.create(entityLogicalName, recordData, this.connectionTarget);

            // Extract ID from response
            return response.id;
        } catch (error: any) {
            console.error(`Failed to create record in ${entityLogicalName}:`, error);
            throw new Error(`Failed to create record: ${error.message}`);
        }
    }

    /**
     * Update a record
     */
    async updateRecord(entityLogicalName: string, recordId: string, recordData: any): Promise<void> {
        try {
            await window.dataverseAPI.update(entityLogicalName, recordId, recordData, this.connectionTarget);
        } catch (error: any) {
            console.error(`Failed to update record in ${entityLogicalName}:`, error);
            throw new Error(`Failed to update record: ${error.message}`);
        }
    }

    /**
     * Upsert a record (update if exists, create if not)
     */
    async upsertRecord(entityLogicalName: string, recordId: string, recordData: any): Promise<string> {
        try {
            // Try to retrieve the record first to see if it exists
            try {
                await window.dataverseAPI.retrieve(entityLogicalName, recordId, [], this.connectionTarget);

                // Record exists, update it
                await window.dataverseAPI.update(entityLogicalName, recordId, recordData, this.connectionTarget);

                return recordId;
            } catch (retrieveError: any) {
                // Record doesn't exist, create it
                // Add the primary ID to the record data
                const entityMetadata = await window.dataverseAPI.getEntityMetadata(entityLogicalName, true, ["PrimaryIdAttribute"], this.connectionTarget);

                const primaryIdField = entityMetadata.PrimaryIdAttribute as string;
                const recordWithId = { ...recordData, [primaryIdField]: recordId };

                const response = await window.dataverseAPI.create(entityLogicalName, recordWithId, this.connectionTarget);

                return response.id || recordId;
            }
        } catch (error: any) {
            console.error(`Failed to upsert record in ${entityLogicalName}:`, error);
            throw new Error(`Failed to upsert record: ${error.message}`);
        }
    }

    /**
     * Delete a record
     */
    async deleteRecord(
        entityLogicalName: string,
        recordId: string,
    ): Promise<void> {
        try {
            await window.dataverseAPI.delete(
                entityLogicalName,
                recordId,
                this.connectionTarget,
            );
        } catch (error: any) {
            console.error(`Failed to delete record in ${entityLogicalName}:`, error);
            throw new Error(`Failed to delete record: ${error.message}`);
        }
    }

    /**
     * Fetch users from the environment
     */
    async fetchUsers(): Promise<UserRecord[]> {
        try {
            return await this.queryRecords("systemuser", ["systemuserid", "fullname", "domainname", "internalemailaddress"], "isdisabled eq false", "fullname asc");
        } catch (error: any) {
            console.error("Failed to fetch users:", error);
            throw new Error(`Failed to fetch users: ${error.message}`);
        }
    }

    /**
     * Fetch teams from the environment
     */
    async fetchTeams(): Promise<TeamRecord[]> {
        try {
            return await this.queryRecords("team", ["teamid", "name", "teamtype"], undefined, "name asc");
        } catch (error: any) {
            console.error("Failed to fetch teams:", error);
            throw new Error(`Failed to fetch teams: ${error.message}`);
        }
    }

    /**
     * Fetch business units from the environment
     */
    async fetchBusinessUnits(): Promise<BusinessUnitRecord[]> {
        try {
            return await this.queryRecords("businessunit", ["businessunitid", "name"], undefined, "name asc");
        } catch (error: any) {
            console.error("Failed to fetch business units:", error);
            throw new Error(`Failed to fetch business units: ${error.message}`);
        }
    }
}
