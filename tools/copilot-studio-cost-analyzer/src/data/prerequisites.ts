import type { AzureAPI } from "../types/azureAPI";

export type CheckStatus = "ok" | "missing" | "denied" | "unverified" | "info";

export interface PrerequisiteCheck {
    id: string;
    label: string;
    status: CheckStatus;
    detail: string;
}

export type PowerPlatformConnectionStatus = "outside" | "none" | "disabled" | "ready" | "error";
export type PowerPlatformReportOutcome = "succeeded" | "authFailed" | "accessDenied" | "notAvailable";

export interface PowerPlatformPrerequisiteInput {
    connection: PowerPlatformConnectionStatus;
    reportOutcome?: PowerPlatformReportOutcome;
}

export interface AzurePrerequisiteInput {
    available: boolean;
    connection?: AzureAPI.ConnectionState;
    connectionError?: string;
    approved: boolean;
    subscriptionId: string;
    subscriptionValid: boolean;
    access?: AzureAPI.CostAccessCheck;
    lastErrorCode?: string;
}

export function powerPlatformChecks(input: PowerPlatformPrerequisiteInput): PrerequisiteCheck[] {
    const { connection, reportOutcome } = input;
    return [
        {
            id: "pptb",
            label: "Running inside Power Platform ToolBox",
            status: connection === "outside" ? "missing" : "ok",
            detail: connection === "outside" ? "Open this tool from PPTB; it can't call Microsoft APIs in a standalone browser." : "PPTB host APIs are available.",
        },
        {
            id: "pp-connection",
            label: "Active connection with Power Platform API enabled",
            status: connection === "ready" ? "ok" : connection === "outside" ? "unverified" : connection === "error" ? "unverified" : "missing",
            detail: connection === "ready"
                ? "The active connection has the Power Platform API enabled."
                : connection === "disabled"
                  ? "Edit the active connection in PPTB and enable the Power Platform API."
                  : connection === "none"
                    ? "Select or create a connection in PPTB."
                    : "Connection details couldn't be read.",
        },
        {
            id: "pp-role",
            label: "Delegated user with a tenant administrator role",
            status: reportOutcome === "succeeded" ? "ok" : reportOutcome === "authFailed" || reportOutcome === "accessDenied" ? "denied" : "unverified",
            detail: reportOutcome === "succeeded"
                ? "A Copilot Studio report succeeded with this account."
                : reportOutcome === "authFailed"
                  ? "Authentication failed. Reconnect with a delegated user account; app-only (client secret) connections aren't supported."
                  : reportOutcome === "accessDenied"
                    ? "Access was denied. The user needs Global Administrator, Power Platform Administrator, or Dynamics 365 Administrator."
                    : "Verified when a report runs. Requires Global Administrator, Power Platform Administrator, or Dynamics 365 Administrator.",
        },
        {
            id: "pp-availability",
            label: "Copilot Studio report API available for the tenant",
            status: reportOutcome === "succeeded" ? "ok" : reportOutcome === "notAvailable" ? "missing" : "unverified",
            detail: reportOutcome === "succeeded"
                ? "The report API responded for this tenant."
                : reportOutcome === "notAvailable"
                  ? "The report API isn't enabled for this tenant or region yet."
                  : "Verified when a report runs. Availability can depend on tenant region and rollout.",
        },
    ];
}

export function azureChecks(input: AzurePrerequisiteInput): PrerequisiteCheck[] {
    const { connection, access } = input;
    if (!input.available) {
        return [{
            id: "azure-host",
            label: "PPTB Azure API support",
            status: "missing",
            detail: "Update Power Platform ToolBox to a 1.2.9+ build with Azure Resource Manager support.",
        }];
    }
    const signedIn = Boolean(connection?.signedIn) && connection?.status !== "notConnected";
    const approvalNeeded = input.lastErrorCode === "consentRequired" || input.lastErrorCode === "interactionRequired" || connection?.status === "interactionRequired";
    return [
        { id: "azure-host", label: "PPTB Azure API support", status: "ok", detail: "This PPTB build supports host-managed Azure requests." },
        {
            id: "azure-enabled",
            label: "Azure Resource Manager API enabled on the connection",
            status: input.connectionError ? "unverified" : connection?.configured ? "ok" : connection ? "missing" : "unverified",
            detail: input.connectionError
                ? input.connectionError
                : connection?.configured
                  ? "Additional API › Azure Resource Manager API is enabled."
                  : "Edit the connection in PPTB and enable Additional APIs › Azure Resource Manager API.",
        },
        {
            id: "azure-signin",
            label: "Connection signed in",
            status: !connection ? "unverified" : connection.status === "interactionRequired" ? "missing" : signedIn ? "ok" : "missing",
            detail: !connection
                ? "Connection state is unknown."
                : connection.status === "interactionRequired"
                  ? "Sign-in is required again (for example, MFA or Conditional Access). Select Connect Azure."
                  : signedIn
                    ? `Signed in${connection.displayName || connection.accountId ? ` as ${connection.displayName || connection.accountId}` : ""}.`
                    : "Reconnect the connection in PPTB.",
        },
        {
            id: "azure-identity",
            label: "Authentication type",
            status: connection ? "info" : "unverified",
            detail: connection?.authentication === "application"
                ? "Application (client ID/secret): Azure roles must be assigned to the app's service principal, not to a user."
                : connection
                  ? "Delegated: Azure roles must be assigned to the signed-in user (or a group they belong to)."
                  : "Shown after the connection state is read.",
        },
        {
            id: "azure-approval",
            label: "Tool approved for read-only Azure access",
            status: input.approved ? "ok" : approvalNeeded ? "missing" : "unverified",
            detail: input.approved
                ? "Approved for this session."
                : "Select Connect Azure and approve the PPTB prompt. The app registration needs Azure Service Management › user_impersonation with consent.",
        },
        {
            id: "azure-scope",
            label: "Subscription selected",
            status: input.subscriptionValid ? "ok" : "missing",
            detail: input.subscriptionValid
                ? `Scope: /subscriptions/${input.subscriptionId}`
                : input.subscriptionId
                  ? "The subscription ID isn't a valid GUID."
                  : "Choose the subscription linked to your Power Platform billing plan, or enter its ID.",
        },
        {
            id: "azure-cost-access",
            label: "Cost data access on the subscription",
            status: access?.costData === "accessible" ? "ok" : access?.costData === "accessDenied" || input.lastErrorCode === "accessDenied" ? "denied" : "unverified",
            detail: access?.costData === "accessible"
                ? `Verified ${new Date(access.checkedAt).toLocaleString()} for yesterday's actual cost. Amortized and older periods are verified when loaded.`
                : access?.costData === "accessDenied" || input.lastErrorCode === "accessDenied"
                  ? "Denied. Ask an administrator for Cost Management Reader (or equivalent) on the subscription and to check billing visibility settings. A 403 can't identify one exact missing role."
                  : "Not verified yet. Run Check access after selecting a subscription.",
        },
    ];
}
