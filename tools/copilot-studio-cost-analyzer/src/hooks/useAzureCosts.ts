import { useCallback, useEffect, useRef, useState } from "react";
import type { AzureAPI } from "../types/azureAPI";
import {
    authenticateAzure,
    azureErrorMessage,
    checkSubscriptionAccess,
    getAzureApi,
    isAbortError,
    listAllSubscriptions,
    loadAzureCosts,
    logAzureFailure,
    toAzureError,
    type AzureCostRequest,
    type AzureCostResult,
} from "../api/azureCosts";

export type AzureBusy = "authenticating" | "subscriptions" | "access" | "costs";

export interface AzureDiagnostic {
    operation: string;
    occurredAt: string;
    code: string;
    status?: number;
    requestId?: string;
    correlationId?: string;
}

export interface AzureCostState {
    available: boolean;
    connection?: AzureAPI.ConnectionState;
    connectionError?: string;
    approved: boolean;
    subscriptions: AzureAPI.Subscription[];
    subscriptionsLoaded: boolean;
    subscriptionId: string;
    access?: AzureAPI.CostAccessCheck;
    busy?: AzureBusy;
    page: number;
    result?: AzureCostResult & { request: AzureCostRequest; retrievedAt: Date };
    lastRequest?: AzureCostRequest;
    error?: string;
    diagnostic?: AzureDiagnostic;
    stopped: boolean;
}

export interface AzureCostActions {
    connect: () => Promise<void>;
    refreshSubscriptions: () => Promise<void>;
    setSubscriptionId: (subscriptionId: string) => void;
    checkAccess: () => Promise<void>;
    loadCosts: (request: Omit<AzureCostRequest, "subscriptionId">) => Promise<void>;
    stop: () => void;
    clearResult: () => void;
}

const OPERATION_LABELS: Record<AzureBusy, string> = {
    authenticating: "authentication",
    subscriptions: "subscription listing",
    access: "cost access check",
    costs: "cost query",
};

export type InitialAzureSession = Pick<AzureCostState, "connection" | "approved" | "subscriptions" | "subscriptionsLoaded" | "subscriptionId" | "result" | "lastRequest">;

export function useAzureCosts(initial?: InitialAzureSession): AzureCostState & AzureCostActions {
    const api = getAzureApi();
    const controller = useRef<AbortController | undefined>(undefined);
    const [connection, setConnection] = useState<AzureAPI.ConnectionState | undefined>(initial?.connection);
    const [connectionError, setConnectionError] = useState<string>();
    const [approved, setApproved] = useState(initial?.approved ?? false);
    const [subscriptions, setSubscriptions] = useState<AzureAPI.Subscription[]>(initial?.subscriptions ?? []);
    const [subscriptionsLoaded, setSubscriptionsLoaded] = useState(initial?.subscriptionsLoaded ?? false);
    const [subscriptionId, setSubscriptionIdState] = useState(initial?.subscriptionId ?? "");
    const [access, setAccess] = useState<AzureAPI.CostAccessCheck>();
    const [busy, setBusy] = useState<AzureBusy>();
    const [page, setPage] = useState(0);
    const [result, setResult] = useState<AzureCostState["result"]>(initial?.result);
    const [lastRequest, setLastRequest] = useState<AzureCostRequest | undefined>(initial?.lastRequest);
    const [error, setError] = useState<string>();
    const [diagnostic, setDiagnostic] = useState<AzureDiagnostic>();
    const [stopped, setStopped] = useState(false);

    const refreshConnection = useCallback(async () => {
        if (!api) return;
        try {
            const state = await api.arm.getConnectionState("primary");
            setConnection(state);
            setConnectionError(undefined);
        } catch (reason) {
            logAzureFailure("connection state lookup", reason);
            setConnection(undefined);
            setConnectionError(azureErrorMessage(reason));
        }
    }, [api]);

    const resetForConnectionChange = useCallback(() => {
        controller.current?.abort();
        controller.current = undefined;
        setBusy(undefined);
        setApproved(false);
        setSubscriptions([]);
        setSubscriptionsLoaded(false);
        setSubscriptionIdState("");
        setAccess(undefined);
        setResult(undefined);
        setLastRequest(undefined);
        setDiagnostic(undefined);
    }, []);

    useEffect(() => {
        if (!api) return;
        void refreshConnection();
        const unsubscribe = api.onConnectionChanged((event) => {
            if (event.reason === "connectionChanged") {
                resetForConnectionChange();
                setError(azureErrorMessage({ code: "connectionChanged" }));
            } else if (event.reason === "interactionRequired") {
                setApproved(false);
            }
            void refreshConnection();
        });
        const toolbox = typeof window === "undefined" ? undefined : window.toolboxAPI;
        const handleToolboxEvent = (_: unknown, payload: ToolBoxAPI.ToolBoxEventPayload) => {
            if (["connection:created", "connection:updated", "connection:deleted"].includes(payload.event)) void refreshConnection();
        };
        toolbox?.events.on(handleToolboxEvent);
        return () => {
            unsubscribe();
            toolbox?.events.off(handleToolboxEvent);
            controller.current?.abort();
        };
    }, [api, refreshConnection, resetForConnectionChange]);

    const run = useCallback(async (kind: AzureBusy, work: (azure: AzureAPI.API, signal: AbortSignal) => Promise<void>) => {
        if (!api) {
            setError(azureErrorMessage({ code: "unavailable" }));
            return;
        }
        controller.current?.abort();
        const current = new AbortController();
        controller.current = current;
        setBusy(kind);
        setError(undefined);
        setDiagnostic(undefined);
        setStopped(false);
        try {
            await work(api, current.signal);
        } catch (reason) {
            if (controller.current !== current) return;
            if (isAbortError(reason)) return;
            logAzureFailure(OPERATION_LABELS[kind], reason);
            const failure = toAzureError(reason);
            if (failure.code === "interactionRequired" || failure.code === "consentRequired") setApproved(false);
            setError(azureErrorMessage(failure));
            setDiagnostic({
                operation: OPERATION_LABELS[kind],
                occurredAt: new Date().toISOString(),
                code: failure.code,
                status: failure.status,
                requestId: failure.requestId,
                correlationId: failure.correlationId,
            });
        } finally {
            if (controller.current === current) {
                controller.current = undefined;
                setBusy(undefined);
                setPage(0);
            }
        }
    }, [api]);

    const refreshSubscriptions = useCallback(() => run("subscriptions", async (azure, signal) => {
        const list = await listAllSubscriptions(azure, signal);
        setSubscriptions(list);
        setSubscriptionsLoaded(true);
        setSubscriptionIdState((current) => current || (list.length === 1 ? list[0].subscriptionId : ""));
    }), [run]);

    const connect = useCallback(async () => {
        let authenticated = false;
        await run("authenticating", async (azure, signal) => {
            const state = await authenticateAzure(azure, signal);
            setConnection(state);
            setApproved(true);
            authenticated = true;
        });
        if (authenticated) await refreshSubscriptions();
    }, [run, refreshSubscriptions]);

    const setSubscriptionId = useCallback((value: string) => {
        setSubscriptionIdState(value.trim());
        setAccess(undefined);
        setResult(undefined);
        setLastRequest(undefined);
    }, []);

    const checkAccess = useCallback(() => run("access", async (azure, signal) => {
        const check = await checkSubscriptionAccess(azure, subscriptionId, signal);
        setAccess(check);
        if (check.error) {
            const failure = toAzureError(check.error);
            setError(azureErrorMessage(failure));
            setDiagnostic({
                operation: OPERATION_LABELS.access,
                occurredAt: check.checkedAt,
                code: failure.code,
                status: failure.status,
                requestId: failure.requestId,
                correlationId: failure.correlationId,
            });
            return;
        }
        setApproved(true);
    }).then(() => undefined), [run, subscriptionId]);

    const loadCosts = useCallback((options: Omit<AzureCostRequest, "subscriptionId">) => run("costs", async (azure, signal) => {
        setResult(undefined);
        const request = { ...options, subscriptionId };
        setLastRequest(request);
        const loaded = await loadAzureCosts(azure, request, signal, setPage);
        setResult({ ...loaded, request, retrievedAt: new Date() });
        setApproved(true);
    }), [run, subscriptionId]);

    const stop = useCallback(() => {
        if (!controller.current) return;
        controller.current.abort();
        controller.current = undefined;
        setBusy(undefined);
        setPage(0);
        setStopped(true);
    }, []);

    return {
        available: Boolean(api),
        connection,
        connectionError,
        approved,
        subscriptions,
        subscriptionsLoaded,
        subscriptionId,
        access,
        busy,
        page,
        result,
        lastRequest,
        error,
        diagnostic,
        stopped,
        connect,
        refreshSubscriptions,
        setSubscriptionId,
        checkAccess,
        loadCosts,
        stop,
        clearResult: () => setResult(undefined),
    };
}
