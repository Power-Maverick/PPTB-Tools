import { DataverseEntity, DataverseSolution } from "../models/interfaces";

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
    constructor() {
        // No credentials needed - using window.dataverseAPI
    }

    /**
     * List all solutions in the environment
     */
    async listSolutions(): Promise<DataverseSolution[]> {
        try {
            const entitySetName = await window.dataverseAPI.getEntitySetName("solution");

            const response = await window.dataverseAPI.queryData(
                `${entitySetName}?$filter=isvisible eq true and ismanaged eq false&$select=solutionid,friendlyname,uniquename,version&$expand=publisherid($select=customizationprefix)&$orderby=friendlyname asc`,
            );

            return response.value.map((s: any) => ({
                uniqueName: s.uniquename,
                displayName: s.friendlyname,
                version: s.version,
                publisherPrefix: s.publisherid?.customizationprefix || "unknown",
            }));
        } catch (error: any) {
            console.error("Failed to list solutions:", error);
            throw new Error(`Failed to list solutions: ${error.message}`);
        }
    }

    /**
     * Fetch entities in a solution
     */
    async fetchSolutionEntities(solutionUniqueName: string): Promise<DataverseEntity[]> {
        try {
            // Escape solution name for OData query
            const escapedSolutionName = escapeODataString(solutionUniqueName);

            // Fetch solution details
            const solutionEntitySetName = await window.dataverseAPI.getEntitySetName("solution");
            const responseSolution = await window.dataverseAPI.queryData(`${solutionEntitySetName}?$filter=uniquename eq '${escapedSolutionName}'&$select=solutionid,friendlyname,uniquename,version`);

            if (!responseSolution.value || responseSolution.value.length === 0) {
                throw new Error(`Solution '${solutionUniqueName}' not found`);
            }
            const solutionData = responseSolution.value[0];

            // Fetch solution components (entities)
            const componentEntitySetName = await window.dataverseAPI.getEntitySetName("solutioncomponent");
            const responseComponent = await window.dataverseAPI.queryData(`${componentEntitySetName}?$filter=_solutionid_value eq ${solutionData.solutionid} and componenttype eq 1&$select=objectid`);

            const entityIds = responseComponent.value.map((c: any) => c.objectid);

            // Fetch entities in parallel
            const entities = await this.fetchEntities(entityIds);

            return entities;
        } catch (error: any) {
            console.error("Failed to fetch solution entities:", error);
            throw new Error(`Failed to fetch solution entities: ${error.message}`);
        }
    }

    /**
     * Fetch entities by their IDs
     */
    private async fetchEntities(entityIds: string[]): Promise<DataverseEntity[]> {
        if (entityIds.length === 0) {
            return [];
        }

        // Fetch entity metadata for all entities to map IDs to logical names
        const entities = entityIds.map(async (id) => {
            const entityMetadata = await window.dataverseAPI.getEntityMetadata(id, false, [
                "LogicalName",
                "DisplayName",
                "SchemaName",
                "PrimaryIdAttribute",
                "PrimaryNameAttribute",
                "EntitySetName",
                "Description",
                "ObjectTypeCode",
                "MetadataId",
            ]);

            const entityAttributes = await window.dataverseAPI.getEntityRelatedMetadata(entityMetadata.LogicalName, "Attributes", [
                "LogicalName",
                "DisplayName",
                "SchemaName",
                "AttributeType",
                "IsPrimaryId",
                "IsPrimaryName",
                "RequiredLevel",
                "Description",
            ]);

            return {
                logicalName: entityMetadata.LogicalName,
                displayName: entityMetadata.DisplayName?.LocalizedLabels?.[0]?.Label || entityMetadata.LogicalName,
                schemaName: entityMetadata.SchemaName as string,
                primaryIdAttribute: entityMetadata.PrimaryIdAttribute as string,
                primaryNameAttribute: entityMetadata.PrimaryNameAttribute as string,
                description: extractLabel(entityMetadata.Description),
                objectTypeCode: entityMetadata.ObjectTypeCode as number | undefined,
                fields: entityAttributes.value.map((attr: any) => ({
                    logicalName: attr.LogicalName,
                    displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.LogicalName,
                    schemaName: attr.SchemaName,
                    type: attr.AttributeType,
                    isPrimaryId: attr.IsPrimaryId,
                    isPrimaryName: attr.IsPrimaryName,
                    requiredLevel: attr.RequiredLevel?.Value || extractLabel(attr.RequiredLevel?.Label) || extractLabel(attr.RequiredLevel),
                    description: extractLabel(attr.Description),
                })),
            };
        });

        return Promise.all(entities);
    }
}
