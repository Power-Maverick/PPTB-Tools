import { SolutionRecord } from "../models/interfaces";

export class DataverseConnector {
    private environmentBaseUrl: string;
    private apiVersionNumber: string;
    private entityAttributesCache: Map<string, any[]> = new Map();
    private entityTypeCodeMap: Map<number, string> = new Map();

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
            const metadata = await window.dataverseAPI.getEntityMetadata(entityId, false, ["LogicalName", "DisplayName", "SchemaName", "MetadataId", "ObjectTypeCode"]);
            if (metadata?.ObjectTypeCode && typeof metadata.ObjectTypeCode === "number" && typeof metadata.LogicalName === "string") {
                this.entityTypeCodeMap.set(metadata.ObjectTypeCode, metadata.LogicalName);
            }
            return metadata;
        } catch (err) {
            console.error(`Entity metadata fetch failed for ${entityId}:`, err);
            return null;
        }
    }

    async fetchEntityAttributes(
        entityId: string,
        options?: {
            solutionAttributeIds?: Set<string>;
            implicitAllIfNoneExplicit?: boolean;
        },
    ): Promise<any[]> {
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

            const attributeList = (attributes?.value || attributes || []) as any[];
            const solutionAttributeIds = options?.solutionAttributeIds;
            const implicitAllIfNoneExplicit = options?.implicitAllIfNoneExplicit ?? false;

            let hasExplicitAttributes = false;
            if (solutionAttributeIds && solutionAttributeIds.size > 0) {
                hasExplicitAttributes = attributeList.some((attr) => solutionAttributeIds.has(String(attr.MetadataId || "").toLowerCase()));
            }

            const withSolutionInfo = attributeList.map((attr) => {
                const attrId = String(attr.MetadataId || "").toLowerCase();
                const inSolution = solutionAttributeIds ? (hasExplicitAttributes ? solutionAttributeIds.has(attrId) : implicitAllIfNoneExplicit) : undefined;
                return {
                    ...attr,
                    inSolution,
                };
            });

            this.entityAttributesCache.set(entityMetadata.LogicalName, withSolutionInfo);
            return withSolutionInfo;
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
            const viewMetadata = await window.dataverseAPI.retrieve("savedquery", viewId, ["savedqueryid", "name", "fetchxml", "returnedtypecode", "layoutxml"]);
            if (!viewMetadata) {
                return null;
            }

            const layoutXml = typeof viewMetadata.layoutxml === "string" ? viewMetadata.layoutxml : "";
            const entityLogicalName = typeof viewMetadata.returnedtypecode === "string" ? viewMetadata.returnedtypecode : undefined;
            const viewColumns = await this.fetchViewColumns(layoutXml, entityLogicalName);

            console.log(layoutXml, viewMetadata, entityLogicalName, viewColumns);

            return {
                ...viewMetadata,
                viewColumns,
            };
        } catch (err) {
            console.error(`View metadata fetch failed for ${viewId}:`, err);
            return null;
        }
    }

    async fetchViewColumns(layoutXml: string, entityLogicalName?: string): Promise<any[]> {
        try {
            if (!window.dataverseAPI) {
                throw new Error("Dataverse API not available");
            }
            if (!layoutXml) {
                return [];
            }

            const logicalNames = this.parseLayoutXmlAttributeNames(layoutXml);
            if (logicalNames.length === 0) {
                return [];
            }

            if (!entityLogicalName) {
                return [];
            }

            const cachedAttributes = this.entityAttributesCache.get(entityLogicalName) || [];
            const logicalNameSet = new Set(logicalNames.map((name) => name.toLowerCase()));
            return cachedAttributes.filter((attr) => logicalNameSet.has(String(attr.LogicalName || "").toLowerCase()));
        } catch (err) {
            console.error("View columns fetch failed:", err);
            return [];
        }
    }

    private parseLayoutXmlAttributeNames(layoutXml: string): string[] {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(layoutXml, "text/xml");
            const cells = Array.from(xmlDoc.getElementsByTagName("cell"));
            const logicalNames = cells.map((cell) => cell.getAttribute("name")).filter((name): name is string => !!name);
            return [...new Set(logicalNames)];
        } catch (err) {
            console.error("Failed to parse view layout XML:", err);
            return [];
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
            //TODO: Fix the PPTB API
            return await window.dataverseAPI.retrieve("webresourceset", webResourceId, ["webresourceid", "name", "displayname", "webresourcetype"]);
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
            return await window.dataverseAPI.retrieve("appmodule", appId, ["appmoduleid", "name"]);
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
