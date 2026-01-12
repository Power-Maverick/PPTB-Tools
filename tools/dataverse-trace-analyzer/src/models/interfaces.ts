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
    entityName?: string;
    messageName?: string;
    correlationId?: string;
    hasException?: boolean;
    searchText?: string;
}

export interface OperationType {
    value: number;
    label: string;
}

export interface MessageType {
    value: string;
    label: string;
}
