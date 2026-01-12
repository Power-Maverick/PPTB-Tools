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
            let filterQuery = "$filter=statecode eq 0";
            
            if (filter?.startDate) {
                // Properly format date for OData query
                const formattedDate = this.formatODataDate(filter.startDate);
                filterQuery += ` and createdon ge ${formattedDate}`;
            }
            
            if (filter?.endDate) {
                // Properly format date for OData query
                const formattedDate = this.formatODataDate(filter.endDate);
                filterQuery += ` and createdon le ${formattedDate}`;
            }
            
            if (filter?.entityName) {
                // Escape and sanitize entity name to prevent OData injection
                const escapedEntity = this.escapeODataValue(filter.entityName);
                filterQuery += ` and contains(primaryentity, ${escapedEntity})`;
            }
            
            if (filter?.messageName) {
                // Escape and sanitize message name to prevent OData injection
                const escapedMessage = this.escapeODataValue(filter.messageName);
                filterQuery += ` and messagename eq ${escapedMessage}`;
            }
            
            if (filter?.correlationId) {
                // Escape and sanitize correlation ID to prevent OData injection
                const escapedCorrelation = this.escapeODataValue(filter.correlationId);
                filterQuery += ` and correlationid eq ${escapedCorrelation}`;
            }
            
            if (filter?.hasException) {
                filterQuery += ` and exceptiondetails ne null`;
            }

            // TODO: Add pagination support for datasets larger than 100 records
            // Consider making the limit configurable via settings or adding infinite scroll
            const query = `${entitySetName}?$select=plugintracelogid,typename,messageblock,messagename,performanceexecutionstarttime,performanceexecutionduration,exceptiondetails,depth,correlationid,operationtype,primaryentity,createdon,mode&${filterQuery}&$orderby=createdon desc&$top=100`;

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
