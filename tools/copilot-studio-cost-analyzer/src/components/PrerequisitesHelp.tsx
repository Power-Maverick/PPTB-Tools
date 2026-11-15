import { Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner } from "@fluentui/react-components";
import { useState, type ReactNode } from "react";
import { isSubscriptionId } from "../api/azureCosts";
import { azureChecks, powerPlatformChecks, type CheckStatus, type PowerPlatformPrerequisiteInput, type PrerequisiteCheck } from "../data/prerequisites";
import type { AzureCostActions, AzureCostState } from "../hooks/useAzureCosts";

const STATUS_LABELS: Record<CheckStatus, string> = {
    ok: "Ready",
    missing: "Missing",
    denied: "Denied",
    unverified: "Not verified",
    info: "Info",
};

export function PrerequisitesHelp({ open, onClose, powerPlatform, azure }: {
    open: boolean;
    onClose: () => void;
    powerPlatform: PowerPlatformPrerequisiteInput;
    azure: AzureCostState & AzureCostActions;
}) {
    const [copied, setCopied] = useState(false);
    const subscriptionValid = isSubscriptionId(azure.subscriptionId);
    const ppChecks = powerPlatformChecks(powerPlatform);
    const azChecks = azureChecks({
        available: azure.available,
        connection: azure.connection,
        connectionError: azure.connectionError,
        approved: azure.approved,
        subscriptionId: azure.subscriptionId,
        subscriptionValid,
        access: azure.access,
        lastErrorCode: azure.diagnostic?.code,
    });
    const adminDetails = [
        azure.connection?.tenantId && `Tenant ID: ${azure.connection.tenantId}`,
        subscriptionValid && `Subscription ID: ${azure.subscriptionId}`,
        azure.connection && `Authentication: ${azure.connection.authentication}`,
        azure.diagnostic && `Operation: ${azure.diagnostic.operation}`,
        azure.diagnostic && `Time (UTC): ${azure.diagnostic.occurredAt}`,
        azure.diagnostic && `Error code: ${azure.diagnostic.code}${azure.diagnostic.status ? ` (HTTP ${azure.diagnostic.status})` : ""}`,
        azure.diagnostic?.requestId && `Request ID: ${azure.diagnostic.requestId}`,
        azure.diagnostic?.correlationId && `Correlation ID: ${azure.diagnostic.correlationId}`,
    ].filter((line): line is string => Boolean(line));

    const copyDetails = async () => {
        const text = ["Copilot Studio Cost & Usage Analyzer — Azure cost access request", ...adminDetails,
            "Requested access: Cost Management Reader (or equivalent read access) on the subscription, plus billing visibility for Azure charges under our agreement."].join("\n");
        try {
            if (window.toolboxAPI?.utils?.copyToClipboard) await window.toolboxAPI.utils.copyToClipboard(text);
            else await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch (reason) {
            console.error("Could not copy administrator details.", reason);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
            <DialogSurface className="help-surface">
                <DialogBody>
                    <DialogTitle>Prerequisites and permissions</DialogTitle>
                    <DialogContent className="help-content">
                        <p className="help-intro">Live status for this session. “Not verified” means the requirement can only be confirmed by calling the API; it isn't necessarily missing.</p>

                        <CheckGroup title="Copilot Credit reports (Power Platform)" checks={ppChecks} />

                        <CheckGroup
                            title="Azure costs (Azure Cost Management)"
                            checks={azChecks}
                            action={azure.available && (
                                <button className="secondary-button" disabled={Boolean(azure.busy) || !subscriptionValid} onClick={() => void azure.checkAccess()}>
                                    {azure.busy === "access" ? <><Spinner size="extra-tiny" /> Checking…</> : "Check access"}
                                </button>
                            )}
                        />

                        {adminDetails.length > 0 && (
                            <section className="help-admin">
                                <div className="help-group-heading">
                                    <h3>Details for your administrator</h3>
                                    <button className="secondary-button" onClick={() => void copyDetails()}>{copied ? "Copied" : "Copy details"}</button>
                                </div>
                                <ul>{adminDetails.map((line) => <li key={line}>{line}</li>)}</ul>
                                <p>No tokens or secrets are included. Ask for least-privilege read access rather than Owner or Contributor.</p>
                            </section>
                        )}

                        <details className="help-reference">
                            <summary>What to provision</summary>
                            <h4>Copilot Credit reports</h4>
                            <ul>
                                <li>PPTB connection with the <strong>Power Platform API</strong> enabled, signed in as a delegated user (app-only isn't supported).</li>
                                <li>User role: <strong>Global Administrator</strong>, <strong>Power Platform Administrator</strong>, or <strong>Dynamics 365 Administrator</strong>.</li>
                                <li>Tenant must have the Copilot Studio licensing report API available (may vary by region and rollout).</li>
                            </ul>
                            <h4>Azure costs</h4>
                            <ul>
                                <li>PPTB 1.2.9+ build with Azure API support, and <strong>Additional APIs › Azure Resource Manager API</strong> enabled on the connection.</li>
                                <li>App registration: delegated <strong>Azure Service Management › user_impersonation</strong> with user or admin consent, and the <code>http://localhost</code> mobile/desktop redirect.</li>
                                <li>Azure RBAC: <strong>Cost Management Reader</strong> (or Reader/Cost Management Contributor) on the subscription or a parent management group. For client ID/secret connections, assign it to the app's service principal.</li>
                                <li>Billing visibility: EA “view charges” for account/department owners, or MCA Azure charge visibility, must allow subscription users to see costs.</li>
                                <li>The subscription must be the one linked to your Power Platform pay-as-you-go billing plan. Only Azure public cloud and subscription scopes are supported.</li>
                            </ul>
                        </details>
                    </DialogContent>
                    <DialogActions>
                        <button className="primary-button" onClick={onClose}>Close</button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}

function CheckGroup({ title, checks, action }: { title: string; checks: PrerequisiteCheck[]; action?: ReactNode }) {
    return (
        <section className="help-group">
            <div className="help-group-heading"><h3>{title}</h3>{action}</div>
            <ul className="check-list">
                {checks.map((check) => (
                    <li key={check.id}>
                        <span className={`check-status ${check.status}`}>{STATUS_LABELS[check.status]}</span>
                        <div><strong>{check.label}</strong><span>{check.detail}</span></div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
