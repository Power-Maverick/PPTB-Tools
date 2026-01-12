export interface PluginTraceLog {
    plugintracelogid: string;
    typename: string;
    messageblock: string;
    messagename: string;
    performanceexecutionstarttime: string;
    performanceexecutionduration: number;
    exceptiondetails?: string;
    depth: number;
    correlationid: string;
    operationtype: number;
    primaryentity?: string;
    createdon: string;
    mode?: number;
    profile?: string;
}

export interface TraceLogFilter {
    startDate?: string;
    endDate?: string;
    entityNames?: string[]; // Changed to array for multi-select
    messageName?: string; // Single select
    pluginNames?: string[]; // Multi-select for plugins
    correlationId?: string;
    hasException?: boolean;
    modes?: number[]; // Multi-select for modes (0=Sync, 1=Async)
}

export interface FilterOption {
    value: string;
    label: string;
    count?: number;
}
