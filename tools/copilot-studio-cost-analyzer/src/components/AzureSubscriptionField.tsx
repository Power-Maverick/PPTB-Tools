import { useId, useState } from "react";
import { isSubscriptionId } from "../api/azureCosts";
import type { AzureCostActions, AzureCostState } from "../hooks/useAzureCosts";

export function AzureSubscriptionField({ azure, disabled = false }: {
    azure: AzureCostState & AzureCostActions;
    disabled?: boolean;
}) {
    const id = useId();
    const [manualEntry, setManualEntry] = useState(false);
    const busy = disabled || Boolean(azure.busy);
    return (
        <div className="azure-subscription">
            <span className="label-row">
                <label htmlFor={id}>Subscription</label>
                <button type="button" className="link-button" disabled={busy} onClick={() => setManualEntry((value) => !value)}>
                    {manualEntry ? "Choose from list" : "Enter ID"}
                </button>
            </span>
            {manualEntry ? (
                <input id={id} value={azure.subscriptionId} disabled={busy}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    aria-invalid={Boolean(azure.subscriptionId) && !isSubscriptionId(azure.subscriptionId)}
                    onChange={(event) => azure.setSubscriptionId(event.target.value)} />
            ) : (
                <select id={id} value={azure.subscriptionId} disabled={busy || azure.subscriptions.length === 0}
                    onChange={(event) => azure.setSubscriptionId(event.target.value)}>
                    <option value="">{azure.busy === "subscriptions" ? "Loading subscriptions…" : azure.subscriptionsLoaded
                        ? azure.subscriptions.length > 0 ? "Select a subscription" : "No subscriptions found; enter an ID"
                        : "Connect Azure to list subscriptions"}</option>
                    {azure.subscriptions.map((subscription) => (
                        <option key={subscription.subscriptionId} value={subscription.subscriptionId}>
                            {subscription.displayName || subscription.subscriptionId}{subscription.state && subscription.state !== "Enabled" ? ` (${subscription.state})` : ""}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
}
