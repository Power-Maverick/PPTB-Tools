import { PluginTraceLog, TraceLogFilter } from "../models/interfaces";

export class DataverseClient {
    constructor() {
        // Using window.dataverseAPI from @pptb/types
    }

    /**
     * Escape and sanitize values for OData queries to prevent injection attacks
     */
    private escapeODataValue(value: string): string {
        if (!value) return "''";
        
        // Remove any single quotes and replace with double single quotes (OData escaping)
        const escaped = value.replace(/'/g, "''");
        
        // Wrap in single quotes for OData string literals
        return `'${escaped}'`;
    }

    /**
     * Format date for OData datetime literal
     */
    private formatODataDate(dateString: string): string {
        // OData expects datetime'YYYY-MM-DDTHH:MM:SS' format
        // Assuming dateString is ISO format or can be parsed
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid date format: ${dateString}`);
        }
        
        const isoString = date.toISOString();
        return `datetime'${isoString}'`;
    }

    async fetchPluginTraceLogs(filter?: TraceLogFilter): Promise<PluginTraceLog[]> {
        try {
            const entitySetName = await window.dataverseAPI.getEntitySetName("plugintracelog");

            // Build OData filter query
            // Note: plugintracelog entity doesn't have statecode property
            let filterQuery = "";
            const filterConditions: string[] = [];
            
            if (filter?.startDate) {
                // Properly format date for OData query
                const formattedDate = this.formatODataDate(filter.startDate);
                filterConditions.push(`createdon ge ${formattedDate}`);
            }
            
            if (filter?.endDate) {
                // Properly format date for OData query
                const formattedDate = this.formatODataDate(filter.endDate);
                filterConditions.push(`createdon le ${formattedDate}`);
            }
            
            // Multi-select entity filter
            if (filter?.entityNames && filter.entityNames.length > 0) {
                const entityConditions = filter.entityNames.map(entity => {
                    const escaped = this.escapeODataValue(entity);
                    return `contains(primaryentity, ${escaped})`;
                });
                if (entityConditions.length === 1) {
                    filterConditions.push(entityConditions[0]);
                } else {
                    filterConditions.push(`(${entityConditions.join(' or ')})`);
                }
            }
            
            // Multi-select plugin filter
            if (filter?.pluginNames && filter.pluginNames.length > 0) {
                const pluginConditions = filter.pluginNames.map(plugin => {
                    const escaped = this.escapeODataValue(plugin);
                    return `contains(typename, ${escaped})`;
                });
                if (pluginConditions.length === 1) {
                    filterConditions.push(pluginConditions[0]);
                } else {
                    filterConditions.push(`(${pluginConditions.join(' or ')})`);
                }
            }
            
            // Single-select message filter
            if (filter?.messageName) {
                // Escape and sanitize message name to prevent OData injection
                const escapedMessage = this.escapeODataValue(filter.messageName);
                filterConditions.push(`messagename eq ${escapedMessage}`);
            }
            
            // Multi-select mode filter (0=Sync, 1=Async)
            if (filter?.modes && filter.modes.length > 0) {
                if (filter.modes.length === 1) {
                    filterConditions.push(`mode eq ${filter.modes[0]}`);
                } else {
                    const modeConditions = filter.modes.map(mode => `mode eq ${mode}`);
                    filterConditions.push(`(${modeConditions.join(' or ')})`);
                }
            }
            
            if (filter?.correlationId) {
                // Escape and sanitize correlation ID to prevent OData injection
                const escapedCorrelation = this.escapeODataValue(filter.correlationId);
                filterConditions.push(`correlationid eq ${escapedCorrelation}`);
            }
            
            if (filter?.hasException) {
                filterConditions.push(`exceptiondetails ne null`);
            }

            // Construct the filter query
            if (filterConditions.length > 0) {
                filterQuery = `$filter=${filterConditions.join(' and ')}`;
            }

            // TODO: Add pagination support for datasets larger than 100 records
            // Consider making the limit configurable via settings or adding infinite scroll
            const filterPart = filterQuery ? `${filterQuery}&` : '';
            const query = `${entitySetName}?$select=plugintracelogid,typename,messageblock,messagename,performanceexecutionstarttime,performanceexecutionduration,exceptiondetails,depth,correlationid,operationtype,primaryentity,createdon,mode&${filterPart}$orderby=createdon desc&$top=100`;

            const response = await window.dataverseAPI.queryData(query);

            const logs: PluginTraceLog[] = response.value.map((log: any) => ({
                plugintracelogid: log.plugintracelogid,
                typename: log.typename || "",
                messageblock: log.messageblock || "",
                messagename: log.messagename || "",
                performanceexecutionstarttime: log.performanceexecutionstarttime || "",
                performanceexecutionduration: log.performanceexecutionduration || 0,
                exceptiondetails: log.exceptiondetails,
                depth: log.depth || 0,
                correlationid: log.correlationid || "",
                operationtype: log.operationtype || 0,
                primaryentity: log.primaryentity || "",
                createdon: log.createdon || "",
                mode: log.mode,
            }));

            return logs;
        } catch (error: any) {
            console.error("Failed to fetch plugin trace logs:", error);
            throw new Error(`Failed to fetch plugin trace logs: ${error.message}`);
        }
    }

    async getTraceLogDetails(logId: string): Promise<PluginTraceLog> {
        try {
            const log = await window.dataverseAPI.retrieve(
                "plugintracelog",
                logId,
                [
                    "plugintracelogid",
                    "typename",
                    "messageblock",
                    "messagename",
                    "performanceexecutionstarttime",
                    "performanceexecutionduration",
                    "exceptiondetails",
                    "depth",
                    "correlationid",
                    "operationtype",
                    "primaryentity",
                    "createdon",
                    "mode",
                    "profile"
                ]
            );

            return {
                plugintracelogid: log.plugintracelogid as string,
                typename: (log.typename as string) || "",
                messageblock: (log.messageblock as string) || "",
                messagename: (log.messagename as string) || "",
                performanceexecutionstarttime: (log.performanceexecutionstarttime as string) || "",
                performanceexecutionduration: (log.performanceexecutionduration as number) || 0,
                exceptiondetails: log.exceptiondetails as string | undefined,
                depth: (log.depth as number) || 0,
                correlationid: (log.correlationid as string) || "",
                operationtype: (log.operationtype as number) || 0,
                primaryentity: (log.primaryentity as string) || "",
                createdon: (log.createdon as string) || "",
                mode: log.mode as number | undefined,
                profile: log.profile as string | undefined,
            };
        } catch (error: any) {
            console.error("Failed to fetch trace log details:", error);
            throw new Error(`Failed to fetch trace log details: ${error.message}`);
        }
    }

    async deleteTraceLog(logId: string): Promise<void> {
        try {
            await window.dataverseAPI.delete("plugintracelog", logId);
        } catch (error: any) {
            console.error("Failed to delete trace log:", error);
            throw new Error(`Failed to delete trace log: ${error.message}`);
        }
    }
}
