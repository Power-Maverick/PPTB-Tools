/**
 * Temporary copy of the PPTB host Azure API contract (PPTB 1.2.9 builds with Azure support).
 * The published @pptb/types 1.2.9-beta.0 does not include it. Delete this file and import
 * `AzureAPI` from "@pptb/types" once the next types release is published.
 */
export namespace AzureAPI {
    export type ConnectionTarget = "primary" | "secondary" | number;

    export interface Options {
        connectionTarget?: ConnectionTarget;
        requestId?: string;
        timeoutMs?: number;
    }

    export interface Response<T = unknown> {
        status: number;
        headers: Record<string, string>;
        data: T | null;
        continuation?: string;
    }

    export type ErrorCode =
        | "invalidRequest"
        | "capabilityDenied"
        | "consentRequired"
        | "notConfigured"
        | "notConnected"
        | "interactionRequired"
        | "authenticationFailed"
        | "accessDenied"
        | "throttled"
        | "costDataUnavailable"
        | "networkError"
        | "serviceError"
        | "cancelled"
        | "timeout"
        | "connectionChanged"
        | "invalidContinuation"
        | "limitExceeded";

    export interface ApiError {
        name: "AzureApiError";
        code: ErrorCode;
        message: string;
        status?: number;
        headers?: Record<string, string>;
        serviceCode?: string;
        requestId?: string;
        correlationId?: string;
        retryAfterMs?: number;
    }

    export interface ConnectionState {
        configured: boolean;
        signedIn: boolean;
        status: "disabled" | "notConnected" | "ready" | "interactionRequired";
        connectionId: string;
        connectionName: string;
        tenantId?: string;
        accountId?: string;
        displayName?: string;
        authentication: "delegated" | "application";
        access: "unverified";
    }

    export interface ConnectionChangedEvent {
        connectionId: string;
        reason: "connectionChanged" | "authenticated" | "interactionRequired";
    }

    export interface ReadClient {
        getConnectionState(connectionTarget?: ConnectionTarget): Promise<ConnectionState>;
        authenticate(options?: Options): Promise<ConnectionState>;
        Get<T = unknown>(path: string, options?: Options): Promise<Response<T>>;
        nextPage<T = unknown>(continuation: string, options?: Options): Promise<Response<T>>;
    }

    export interface ArmClient extends ReadClient {
        queryCosts(scope: string, query: CostQuery, options?: Options): Promise<Response<CostQueryResult>>;
        listSubscriptions(options?: Options): Promise<Response<SubscriptionList>>;
        checkCostAccess(scope: string, options?: Options): Promise<CostAccessCheck>;
    }

    export interface CostAccessCheck {
        configured: boolean;
        signedIn: boolean;
        scopeSelected: boolean;
        costData: "accessible" | "accessDenied" | "unverified";
        checkedAt: string;
        error?: ApiError;
    }

    export interface CostQuery {
        type: "ActualCost" | "AmortizedCost";
        timeframe: "MonthToDate" | "BillingMonthToDate" | "TheLastMonth" | "TheLastBillingMonth" | "WeekToDate" | "Custom";
        timePeriod?: { from: string; to: string };
        dataset: {
            granularity?: "Daily" | "Monthly" | "None";
            aggregation?: Record<string, { name: string; function: "Sum" }>;
            grouping?: Array<{ type: "Dimension" | "TagKey"; name: string }>;
            filter?: CostFilter;
        };
    }

    export interface CostFilter {
        and?: CostFilter[];
        or?: CostFilter[];
        dimensions?: { name: string; operator: "In"; values: string[] };
        tags?: { name: string; operator: "In"; values: string[] };
    }

    export interface CostQueryResult {
        properties: {
            columns: Array<{ name: string; type: string }>;
            rows: Array<Array<string | number | null>>;
        };
    }

    export interface Subscription {
        subscriptionId: string;
        displayName: string;
        tenantId?: string;
        state: string;
    }

    export interface SubscriptionList {
        value: Subscription[];
    }

    export interface API {
        arm: ArmClient;
        cancelRequest(requestId: string): Promise<void>;
        onConnectionChanged(listener: (event: ConnectionChangedEvent) => void): () => void;
    }
}

declare global {
    interface Window {
        /** Undefined in PPTB builds without Azure API support. */
        azureAPI?: AzureAPI.API;
    }
}
