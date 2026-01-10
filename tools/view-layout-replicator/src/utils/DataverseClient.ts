import { Entity, View } from "../models/interfaces";

export class DataverseClient {
    constructor() {
        // No longer need credentials - using window.dataverseAPI
    }

    async listEntities(): Promise<Entity[]> {
        try {
            // Use getAllEntitiesMetadata from dataverseAPI
            const response = await window.dataverseAPI.getAllEntitiesMetadata(["LogicalName", "DisplayName", "ObjectTypeCode", "IsValidForAdvancedFind", "IsCustomizable"]);

            // Filter for valid and customizable entities
            return response.value
                .filter((entity: any) => entity.IsValidForAdvancedFind === true && entity.IsCustomizable?.Value === true)
                .map((entity: any) => ({
                    logicalName: entity.LogicalName,
                    displayName: entity.DisplayName?.LocalizedLabels?.[0]?.Label || entity.LogicalName,
                    objectTypeCode: entity.ObjectTypeCode,
                }))
                .sort((a, b) => a.logicalName.localeCompare(b.logicalName));
        } catch (error: any) {
            console.error("Failed to fetch entities:", error);
            throw new Error(`Failed to fetch entities: ${error.message}`);
        }
    }

    async listViews(entityLogicalName: string): Promise<View[]> {
        try {
            // Get entity set name for OData query
            const entitySetName = await window.dataverseAPI.getEntitySetName("savedquery");

            // Use queryData with OData filter for savedqueries
            const response = await window.dataverseAPI.queryData(
                `${entitySetName}?$select=savedqueryid,name,fetchxml,layoutxml,returnedtypecode,querytype&$filter=returnedtypecode eq '${entityLogicalName}' and statecode eq 0&$orderby=name`,
            );

            const views: View[] = response.value.map((view: any) => ({
                savedqueryid: view.savedqueryid,
                name: view.name,
                fetchxml: view.fetchxml,
                layoutxml: view.layoutxml,
                returnedtypecode: view.returnedtypecode,
                querytype: view.querytype,
            }));

            return views;
        } catch (error: any) {
            console.error("Failed to fetch views:", error);
            throw new Error(`Failed to fetch views: ${error.message}`);
        }
    }

    async getView(viewId: string): Promise<View> {
        try {
            // Use retrieve to get a specific savedquery
            const view = await window.dataverseAPI.retrieve("savedquery", viewId, ["savedqueryid", "name", "fetchxml", "layoutxml", "returnedtypecode", "querytype"]);

            return {
                savedqueryid: view.savedqueryid as string,
                name: view.name as string,
                fetchxml: view.fetchxml as string,
                layoutxml: view.layoutxml as string,
                returnedtypecode: view.returnedtypecode as string,
                querytype: view.querytype as number,
            };
        } catch (error: any) {
            console.error("Failed to fetch view:", error);
            throw new Error(`Failed to fetch view: ${error.message}`);
        }
    }

    async updateViewLayout(entityLogicalName: string, viewId: string, layoutXml: string): Promise<void> {
        try {
            // Use update to modify the savedquery's layoutxml
            await window.dataverseAPI.update("savedquery", viewId, {
                layoutxml: layoutXml,
            });

            // Publish the customizations after update
            await window.dataverseAPI.publishCustomizations(entityLogicalName);
        } catch (error: any) {
            console.error("Failed to update view layout:", error);
            throw new Error(`Failed to update view layout: ${error.message}`);
        }
    }
}
