import { SolutionRecord } from "../models/interfaces";

export class DataverseConnector {
    private environmentBaseUrl: string;
    private apiVersionNumber: string;

    constructor(envUrl: string, version: string = "9.2") {
        this.environmentBaseUrl = envUrl.replace(/\/$/, "");
        this.apiVersionNumber = version;
    }

    async fetchSolutions(): Promise<SolutionRecord[]> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            const result = await window.dataverseAPI.getSolutions(["solutionid", "uniquename", "friendlyname", "version", "ismanaged", "description"]);
            return (result.value || []) as unknown as SolutionRecord[];
        } catch (err) {
            console.error("Solution fetch failed:", err);
            throw new Error("Unable to retrieve solutions from environment");
        }
    }

    async fetchSolutionAssets(solutionId: string): Promise<any[]> {
        try {
            const sanitizedId = this.sanitizeGuid(solutionId);
            const odataQuery = `solutioncomponents?$filter=_solutionid_value eq ${sanitizedId}&$select=objectid,componenttype`;
            const responseData = await this.executeQuery(odataQuery);
            return responseData.value || responseData;
        } catch (err) {
            console.error("Component fetch failed:", err);
            throw new Error("Unable to retrieve solution components");
        }
    }

    async fetchEntityMetadata(entityId: string): Promise<any> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            return await window.dataverseAPI.getEntityMetadata(entityId, false, ["LogicalName", "DisplayName", "SchemaName", "MetadataId"]);
        } catch (err) {
            console.error(`Entity metadata fetch failed for ${entityId}:`, err);
            return null;
        }
    }

    async fetchEntityAttributes(entityId: string): Promise<any[]> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            // Get entity metadata first to get the logical name
            const entityMetadata = await window.dataverseAPI.getEntityMetadata(entityId, false, ["LogicalName"]);
            if (!entityMetadata || !entityMetadata.LogicalName) {
                return [];
            }

            // Get all attributes for this entity
            const attributes = await window.dataverseAPI.getEntityRelatedMetadata(entityMetadata.LogicalName, "Attributes", [
                "LogicalName",
                "DisplayName",
                "SchemaName",
                "MetadataId",
                "AttributeType",
            ]);

            return (attributes?.value || attributes || []) as any[];
        } catch (err) {
            console.error(`Entity attributes fetch failed for ${entityId}:`, err);
            return [];
        }
    }

    async fetchFormMetadata(formId: string): Promise<any> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            return await window.dataverseAPI.retrieve("systemform", formId, ["formid", "name", "objecttypecode", "formxml"]);
        } catch (err) {
            console.error(`Form metadata fetch failed for ${formId}:`, err);
            return null;
        }
    }

    async fetchViewMetadata(viewId: string): Promise<any> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            return await window.dataverseAPI.retrieve("savedquery", viewId, ["savedqueryid", "name", "fetchxml"]);
        } catch (err) {
            console.error(`View metadata fetch failed for ${viewId}:`, err);
            return null;
        }
    }

    async fetchPluginMetadata(pluginId: string): Promise<any> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            return await window.dataverseAPI.retrieve("plugintype", pluginId, ["plugintypeid", "typename", "friendlyname"]);
        } catch (err) {
            console.error(`Plugin metadata fetch failed for ${pluginId}:`, err);
            return null;
        }
    }

    async fetchWebResourceMetadata(webResourceId: string): Promise<any> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            return await window.dataverseAPI.retrieve("webresource", webResourceId, ["webresourceid", "name", "displayname", "webresourcetype"]);
        } catch (err) {
            console.error(`Web resource metadata fetch failed for ${webResourceId}:`, err);
            return null;
        }
    }

    async fetchWorkflowMetadata(workflowId: string): Promise<any> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            return await window.dataverseAPI.retrieve("workflow", workflowId, ["workflowid", "name", "type", "category"]);
        } catch (err) {
            console.error(`Workflow metadata fetch failed for ${workflowId}:`, err);
            return null;
        }
    }

    async fetchReportMetadata(reportId: string): Promise<any> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            return await window.dataverseAPI.retrieve("report", reportId, ["reportid", "name", "displayname"]);
        } catch (err) {
            console.error(`Report metadata fetch failed for ${reportId}:`, err);
            return null;
        }
    }

    async fetchSiteMapMetadata(siteMapId: string): Promise<any> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            return await window.dataverseAPI.retrieve("sitemap", siteMapId, ["sitemapid", "sitemapname", "displayname"]);
        } catch (err) {
            console.error(`Site map metadata fetch failed for ${siteMapId}:`, err);
            return null;
        }
    }

    async fetchAppMetadata(appId: string): Promise<any> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            return await window.dataverseAPI.retrieve("appmodule", appId, ["appmoduleid", "name", "displayname"]);
        } catch (err) {
            console.error(`App metadata fetch failed for ${appId}:`, err);
            return null;
        }
    }

    private sanitizeGuid(rawValue: string): string {
        const trimmed = rawValue.trim().toLowerCase();
        const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

        if (!guidPattern.test(trimmed)) {
            throw new Error("Invalid identifier format detected");
        }

        return trimmed;
    }

    private async executeQuery(queryPath: string): Promise<any> {
        if (window.dataverseAPI) {
            return await window.dataverseAPI.queryData(queryPath);
        } else {
            throw new Error("Dataverse API not available");
        }
    }

    static async showMessage(title: string, message: string, severity: "success" | "error" | "warning" | "info"): Promise<void> {
        if (window.toolboxAPI) {
            await window.toolboxAPI.utils.showNotification({
                title,
                body: message,
                type: severity,
            });
        }
    }
}
