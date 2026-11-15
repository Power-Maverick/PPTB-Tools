# Copilot Studio Cost & Usage Analyzer

Review Copilot Studio agent credit consumption and environment capacity from Power Platform licensing reports, and related monetary charges from Azure Cost Management. The tool requests data directly from the Power Platform API and, through PPTB's Azure API, Azure Resource Manager—there are no report files to download, upload, or import, and no separate sync flow to set up.

Select **Prerequisites & permissions** in the tool header at any time to see a live checklist of what is ready, missing, denied, or not yet verified, plus a reference of what an administrator needs to provision.

## Before you start

Make sure all of the following are true:

1. **Use Power Platform ToolBox 1.2.9 or later.** The tool uses the Power Platform API's raw-response methods to follow the report-generation workflow and download its compressed report.
2. **Have an active PPTB connection.** In the connection settings, enable **Power Platform API** for that connection. Select or activate this connection before opening the tool.
3. **Sign in as a user.** The reports API requires a delegated Microsoft Entra sign-in. App-only/service-principal authentication is not supported for these reports.
4. **Have a required administrator role in the tenant.** The account must hold at least one of:
   - Global Administrator
   - Power Platform Administrator
   - Dynamics 365 Administrator
5. **Check tenant availability.** The API is enabled per tenant and the initial documented availability is for tenants whose home geo is North America (NAM). Report types and JSON output may also depend on tenant rollout and data readiness.

PPTB manages sign-in and token renewal. The tool does not ask you to paste a token or app secret.

## Use the tool

1. Open **Copilot Studio Cost & Usage Analyzer** in Power Platform ToolBox.
2. Choose one of the report cards. Each includes an illustrative preview (not tenant data):
   - **Agent usage** to see Copilot Credit use by agent/resource, environment, feature, and available dimensions such as model, channel, tool, and knowledge source.
   - **Environment capacity** to see entitled capacity and consumption split between prepaid capacity and pay-as-you-go.
3. Choose the **start** and **end dates**. The tool defaults to the previous 30 complete UTC days so the usage trend and month-end estimate have a full baseline. The current UTC day isn't complete and can't be selected as the report end date.
4. Choose **Daily** or **Summary**:
   - **Daily** keeps the report's date column, allowing you to inspect and chart day-by-day results.
   - **Summary** combines the requested period; the report omits its date column.
5. Select **Run report**. Report generation is asynchronous and can take several minutes. The tool waits one minute after submitting the report before its first status check, then follows the service's `Retry-After` interval. The status shows a countdown and elapsed time, with an automatic 15-minute timeout. Rotating status quips and an optional 60-second coffee-bean game are available while you wait; they do not affect report polling. The game shows caught and lost beans; each bean that escapes after 1.45 seconds counts as lost. If the report arrives during a round, a quiet message lets you know it is ready below without interrupting the game. Individual API requests also time out after 60 seconds. Select **Stop** to stop waiting and prevent future status checks. An API request already in progress may finish in the background.
6. Review the summary cards and tables. In the agent report, filter by environment, feature, model, channel, or agent/environment text. Compare per-agent billed usage between the earlier and later halves of the selected period. The detail table initially shows up to 250 rows; select **Show more rows** to reveal more.
7. Select **Export filtered CSV** to save the rows currently matching the selected filters. Exports are created locally from the report already loaded in the tool; there is no import or additional API request.

You can run another report at any time by choosing the other card or changing the date range. The two report types have different dimensions and response shapes, so Microsoft does not combine them into one API report and their rows cannot be reliably joined. The tool runs one selected report at a time.

## Breakdowns, comparisons, and estimates

- **Breakdowns:** Agent feature results can be filtered by environment, feature, model, channel, and agent/environment name or ID. Totals and CSV exports reflect the matching rows. The environment report can be filtered by environment.
- **Period comparison:** In Daily mode, the agent report compares the earlier and later halves of the selected date range, including totals by agent. This is a comparison within the selected report, not a separately requested baseline period.
- **Freshness and coverage:** The results show the requested UTC period, the minimum and maximum dates found in returned rows, row count, and when the data was retrieved. A returned date range does not guarantee complete source data; Microsoft can delay or restate daily values.
- **Potential spikes:** A daily value is flagged when billed credits are greater than twice the preceding seven-day average. Dates with no returned rows are treated as zero for this calculation. A flag is only an indicator for investigation.
- **Month-end estimate:** Available only when the agent report covers 30 complete UTC days. It multiplies the average billed credits per day in those last 30 days by the number of days in the month. It assumes that recent usage continues at the same rate, and is not a prediction, invoice amount, or billing advice. Use a Daily report; Summary data does not include daily dates.

## What the reports show

### Agent feature consumption

The `FeatureDetailsPerResource` report shows agent/resource-level usage, including:

- Billed and non-billed Copilot Credit quantities.
- Agent and environment names/IDs.
- Product and AI/billable feature.
- Channel, LLM model, tool, knowledge source, and scenario when those dimensions are provided.
- Consumption processing date in Daily mode.

Some dimensions can be empty, depending on the data available for that agent. An agent can have multiple rows for a day because rows are grouped by report dimensions such as feature, model, or channel. The tool totals these rows when showing agent summaries.

This report is rebuilt daily for the previous **30 complete UTC days**. An additional older day might be retained, but isn't guaranteed or refreshed. A wider date selection cannot recreate expired history. Its `Consumption Date` is the service's processing/creation date, which might differ from when the underlying interaction occurred. Late-arriving data and corrections can change previously reported daily totals.

### Environment capacity & billing

The `BillingDetailsPerEnvironment` report shows environment-level:

- Entitled Copilot Credit quantity in Daily mode.
- Consumption from prepaid capacity.
- Consumption through pay-as-you-go.
- Environment, entitlement, and billing-policy identifiers/names where available.

This report supports a date range, but availability and report data are controlled by the service. Entitled quantities are daily values; the Summary report omits the date and sums consumption quantities.

## Azure costs

The **Azure costs** tab shows monetary charges from Azure Cost Management for one subscription. It complements Copilot Credits; it doesn't replace them.

### Azure prerequisites

1. **Use a PPTB build with Azure API support.** In the connection settings, enable **Additional APIs › Azure Resource Manager API** for the active connection.
2. **App registration (custom OAuth connections):** add the delegated **Azure Service Management › user_impersonation** permission with user or admin consent, and the `http://localhost` mobile/desktop redirect URI.
3. **Azure RBAC:** **Cost Management Reader** (or Reader / Cost Management Contributor) on the subscription or a parent management group. For delegated sign-in, assign it to the user or a group they belong to. For client ID/secret connections, assign it to the app's service principal.
4. **Billing visibility:** for Enterprise Agreements, *view charges* must be enabled for account/department owners; for Microsoft Customer Agreements, Azure charge visibility must allow subscription users to see costs.
5. **Subscription:** choose the subscription linked to your Power Platform pay-as-you-go billing plan. Only subscription scopes in the Azure public cloud are supported.

Select **Connect Azure**. PPTB shows a confirmation and handles sign-in and consent; the tool never sees tokens. Approval is read-only and lasts for the session.

### Load costs

1. Choose a **Subscription** from the list, or select **Enter ID** to type a subscription ID you have access to. Select **Choose from list** to switch back; the entered ID is preserved. If no subscriptions are listed, use **Enter ID**.
2. Choose **Costs**:
   - **Power Platform only** filters to `Microsoft.PowerPlatform/accounts` resources, which pay-as-you-go billing plans create.
   - **All costs** returns every cost in the subscription. Use it to confirm data exists if the Power Platform filter returns nothing.
3. Choose **Cost type**: **Actual** (as billed) or **Amortized** (reservations and purchases spread over their term).
4. Choose **Period** (month to date, last month, or the last 30 days) and **Group by** (meter, meter category, service, resource group, or resource).
5. Select **Load costs**. Select **Stop** to cancel a request in progress.

Results show the subscription, period, cost type, scope, and retrieval time; totals per currency; a daily cost chart; and a grouped table with each item's share of the total in the same currency. Select **Export CSV** to save the grouped results locally. Currencies are never added together.

### Limitations

- **No per-agent monetary cost.** Azure meters charge by billing plan and meter, not by Copilot Studio agent. Use the Copilot Credits tab for per-agent usage.
- Amounts are **pre-tax** and current-period values can change until the billing period closes. They aren't invoices.
- An empty result doesn't prove zero spend—check the subscription, billing plan link, filter, and data latency.
- Cost data can be delayed by up to a day or more after usage.

## Understand credits versus money

**Copilot Credits are usage units, not currency.** In particular:

- A **billed credit** is a report classification; it does not prove that the credit was charged as money on an Azure invoice.
- The environment report separates prepaid from pay-as-you-go credit quantities, but does not show the monetary amount charged.
- The two reports might not reconcile exactly because their processing and date bases differ.
- Use Azure Cost Management to review actual monetary charges. Do not treat this tool's credit totals as an invoice, an immutable billing ledger, or exact per-conversation cost.

## Troubleshooting

| What you see | What to check |
|---|---|
| Power Platform API connection isn't ready | Open the active PPTB connection settings and enable **Power Platform API**. Confirm that the intended connection is active. |
| `401` / authentication failure | Reconnect the user account in PPTB and retry. The report API requires a delegated user token for the Power Platform API. |
| `403` / insufficient permissions | Confirm the signed-in user has one of the tenant administrator roles listed above and belongs to the target tenant. |
| `404` / report or resource not found | The report API might not yet be enabled for the tenant, or the selected report/format might not be available in its rollout. |
| No rows returned | Check the selected dates and report type. Reports can omit groups without positive retained consumption, and recent data might not have finished processing. |
| Report still processing or times out | Generation can take several minutes. Try a shorter date range; if it continues to fail, ask your Power Platform administrator to check API/report availability. |
| `429` / too many requests | Wait before retrying. Avoid starting repeated reports while one is already processing. |
| Azure: not configured / not connected | Enable **Azure Resource Manager API** under **Additional APIs** for the active connection, then select **Connect Azure**. |
| Azure: consent or interaction required | Select **Reconnect Azure** and complete sign-in. An administrator might need to grant consent for **Azure Service Management › user_impersonation**. |
| Azure: access denied (`403`) | Ask an administrator for Cost Management Reader (or equivalent) on the subscription and to check billing visibility settings. A 403 can't identify one exact missing role. Use **Copy details** in the Prerequisites dialog to share the request and correlation IDs. |
| Azure: throttled (`429`) | The tool retries once when Azure asks to wait up to 60 seconds. Otherwise wait and try again. |
| Azure: no cost rows | Try **All costs** and a wider period. Confirm the subscription is linked to the Power Platform billing plan. |

Errors are shown in the tool and a safe diagnostic summary is written to the developer console; report contents and authentication tokens are not logged. PPTB performs the API requests and handles authentication; no bearer token needs to be copied into the tool.

## Data handling

The tool reads reports directly from the Power Platform API and Azure Cost Management, processes the results in memory, and displays them. It does not import report files, create records in Dataverse, or retain report data after the tool session ends. Report contents are tenant operational data; use an authorized PPTB connection and follow your organization's access and data-handling policies.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run validate
```

The Power Platform API raw-response workflow requires PPTB 1.2.9 or later and `@pptb/types` 1.2.9 or later.

API requirements are declared under `features.requiredAPIs`: `pp` and `arm` are required. Graph is not declared because the tool does not use it. Azure costs use PPTB's `window.azureAPI`. Until a `@pptb/types` release includes the Azure API types and updated manifest validator support, the tool uses a temporary shim at `src/types/azureAPI.d.ts`, and older `pptb-validate` versions may reject `features.requiredAPIs`. When the release is available, update `@pptb/types`, delete the shim, and run validation again.
