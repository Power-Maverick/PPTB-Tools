# Root Cause Analyzer

Trace every plugin, flow and change that touched a Dataverse record — and pinpoint why it's wrong.

Root Cause Analyzer combines what _could_ run when a table (or column) changes (plugin steps, workflows, business rules, cloud flows) with what _did_ run (audit, plugin trace logs, system jobs, flow runs) for one record in a time window, follows the chain to related records, and explains what went wrong in plain language.

## Table of Contents

- [Root Cause Analyzer](#root-cause-analyzer)
    - [Table of Contents](#table-of-contents)
    - [Features](#features)
    - [Development](#development)
    - [Usage in ToolBox](#usage-in-toolbox)
    - [Key Concepts](#key-concepts)
        - [Wiring and History](#wiring-and-history)
        - [Findings](#findings)
        - [Exact and Stitched Links](#exact-and-stitched-links)
        - [Related Records (Hops)](#related-records-hops)
        - [Preflight Check](#preflight-check)
        - [Settings](#settings)
    - [Roadmap](#roadmap)
    - [Technical Stack](#technical-stack)
    - [Troubleshooting](#troubleshooting)
        - [Preflight Shows Errors](#preflight-shows-errors)
        - [Timeline Is Empty](#timeline-is-empty)
        - [Flow Runs Show Low Confidence](#flow-runs-show-low-confidence)
        - ["Couldn't Check" Items in Findings](#couldnt-check-items-in-findings)
        - [Too Many Rows](#too-many-rows)
    - [Contributing](#contributing)
    - [License](#license)
    - [Support](#support)

## Features

- ✅ Strictly read-only — never writes to Dataverse or changes settings (enforced by tests)
- ✅ Preflight check of trace logging, auditing, read access and flow run history, with admin fix-it guidance
- ✅ Analyze a record by URL or ID, with an optional column of interest and time window
- ✅ **Findings**: overwrites, expected-but-missing automation, failures, loops / depth, duplicate side effects, stuck async work, automation changes, performance limits, ownership / access changes, race conditions and computed columns
- ✅ Permission errors explained in plain language (which permission, on which table, for which user)
- ✅ **Timeline**: one lane per actor, effects nested under their cause, before → after values
- ✅ **Impact Map**: everything registered on the tables in execution order, with filtering / image columns, plugin types, assemblies, relationship cascades and highlighted cycles
- ✅ Follows the chain to related records (up to 3 hops)
- ✅ Every link shows whether it's exact or stitched, with a confidence level and the reason
- ✅ Checks that can't run because data is missing are listed as "Unavailable — reason", never hidden
- ✅ Progressive results with cancel; paged reads that never block on a full scan
- ✅ Copy an incident summary (findings, evidence, what couldn't be checked) to paste into a ticket
- ✅ Optional Power Automate API integration for more complete flow run history
- ✅ Dark/light theme support

## Development

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Run unit tests (rules, parsers, correlation, end-to-end run and the read-only guard):

```bash
npm test
```

Build for production:

```bash
npm run build
```

Validate the tool package:

```bash
npm run validate
```

## Usage in ToolBox

1. Search for **Root Cause Analyzer** in the Power Platform ToolBox marketplace and install it.
2. Open the installed tool.
3. Connect to an environment. Enabling the Power Platform API on the connection is recommended for more complete flow run history.
4. Paste a record URL.
5. Optionally pick a column of interest.
6. Click **Analyze**.
7. Start with **Findings**; click any evidence to jump to it on the **Timeline** or **Impact Map**.

## Key Concepts

### Wiring and History

- **Wiring** is what _could_ fire when a table or column changes: plugin steps (with stage, mode, rank, filtering columns and images), classic and real-time workflows, business rules and cloud flows (trigger table, change type, filtering columns, trigger conditions and the tables their actions write to).
- **History** is what _did_ fire: audit (who changed what, old → new), plugin trace logs, system jobs and cloud flow runs.

The tool lays history over wiring for the records in scope.

### Findings

| Check                      | What it finds                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overwrite**              | A value set by one actor replaced by another shortly after — e.g. a user's edit undone by the next integration upsert — and through which plugin or flow.                                                         |
| **Expected but missing**   | Automation that should have run for a change but didn't, and why when it can tell: turned off, or a trigger condition. Automation skipped because of its column filter is working as designed and isn't reported. |
| **Failure**                | Plugin exceptions, failed or suspended system jobs and failed flow runs, with the error and the change that triggered them.                                                                                       |
| **Loop / depth**           | A cycle in the wiring that actually ran, requests that go deep, Dataverse's loop protection, or the same automation repeating on a record.                                                                        |
| **Duplicate side effects** | The same child record created more than once — e.g. two _Primary_ addresses under one account.                                                                                                                    |
| **Stuck async**            | System jobs or flow runs still waiting or in progress after a threshold.                                                                                                                                          |
| **Automation changed**     | A step, workflow, flow or plugin assembly involved was modified during the window — especially when failures started, or runs stopped, right after.                                                               |
| **Performance / limits**   | Timeouts, service protection throttling (429), plugins close to the 2-minute sandbox limit, and slow synchronous plugins.                                                                                         |
| **Ownership / access**     | Owner changes and shares (including ones cascaded from a parent record), and the access errors that followed them.                                                                                                |
| **Race conditions**        | Two independent writers changing the same column within seconds, system jobs running on the same record at once, and concurrency / deadlock errors.                                                               |
| **Computed columns**       | Why a calculated, rollup or formula column has no change history, and where to look instead.                                                                                                                      |

Failure findings also decode permission errors: which permission is missing, on which table, and for which user.

Findings are ordered by severity, and each has a confidence level and evidence links.

### Exact and Stitched Links

- **Exact** links: same request (correlation ID and depth), same database transaction, or the record ID found in a run's own data.
- **Stitched** links: cloud flows and async work start new requests, so they're matched by record, table, timing and identity (for example, the flow owner's account). Stitched links always show a confidence (high / medium / low) and the reason, and are never presented as certain.

### Related Records (Hops)

The cause is rarely on the record you start from. The tool follows links that history supports — a system job in the same request, the same database transaction, or a relationship between tables that automation connects — up to three hops and a record budget.

### Preflight Check

On connect, the tool checks and explains:

- **Plugin trace log** level (Off / Exception / All) and what you'll miss if it isn't All
- **Auditing** for the environment, the table and column you pick, and related tables
- **Read access** to audit, trace logs, system jobs, flow runs, users and plugin / process metadata, including when access to system jobs is limited to your own records
- **Flow run history** availability (`flowrun` only lists solution-aware flows and keeps runs for a limited time)
- **Power Automate API** availability on the connection

### Settings

| Setting                        | Default   | Meaning                                                            |
| ------------------------------ | --------- | ------------------------------------------------------------------ |
| Related-record hops            | 3         | How far to follow the chain                                        |
| Maximum records                | 20        | Upper limit on records in one analysis                             |
| Overwrite window               | 24 hours  | A value replaced within this time counts as overwritten            |
| Stuck after                    | 30 min    | Waiting / in-progress work older than this is flagged              |
| Flow start delay               | 15 min    | How long after a change a flow may start and still be linked to it |
| Depth warning at               | 4         | Flag requests that go this many levels deep                        |
| Race window                    | 5 s       | Two independent writers this close together count as a race        |
| Slow plugin                    | 10 s      | Synchronous plugins slower than this are flagged                   |
| Duplicate check column         | automatic | Column that tells child records apart (e.g. an address type)       |
| Include Microsoft/system steps | off       | Show platform plugin steps on the map and in checks                |

## Roadmap

**v1 (current)**

- Preflight, Timeline, Impact Map and Findings for one record in one environment, following related records up to 3 hops
- Checks: overwrites, expected-but-missing, failures (with permission errors explained), loops / depth, duplicates, stuck async, automation changes, performance limits, ownership / access, race conditions, computed columns
- Relationship cascades on the Impact Map; copyable incident summary

**v2**

- **Environment diff** — compare the wiring of the same tables between environments (e.g. UAT vs Production) to explain "works in UAT, fails in Prod"
- **Column-level lineage across tables** — follow a single column's value as automation copies it between tables
- **Deployment history** — solution imports and component changes laid over the timeline ("failures started after solution X was imported")
- **Upsert / alternate-key mismatches** — explain why an integration created a duplicate instead of updating the existing record
- **Flow action detail** — which cloud flow action failed and what each action wrote (via the Power Automate API)
- **Fuller wiring** — low-code (Power Fx) plugins, Custom APIs, webhooks and Service Bus endpoints on the Impact Map
- **Good run vs bad run** — compare a failing execution with a successful one of the same plugin or flow

**v3**

- **MCP / agent exposure** — let AI agents run an analysis and read the findings

**Later**

- **Save and export** analyses ("processes") to share or revisit
- **Application Insights integration** for telemetry beyond what Dataverse keeps

## Technical Stack

- **React 18** with TypeScript
- **Vite** for fast development and optimized production builds
- **Fluent UI React Components** for modern UI
- **React Flow (@xyflow/react)** for the Impact Map
- **Vitest** for unit tests
- **PPTB API** for all Dataverse operations (read-only)
- **@pptb/types** - PPTB type definitions

## Troubleshooting

### Preflight Shows Errors

**Issue**: Preflight reports trace logging off, auditing off or missing access

**Solution**:

- Expand the preflight panel — every item says what's affected and how an admin can fix it
- The tool never changes settings itself; ask an admin to apply the fix, then refresh the preflight

### Timeline Is Empty

**Issue**: No activity is shown for the record

**Solution**:

- Check that auditing is on for the table (and column) — without it, changes can't be shown
- Plugin trace logs are typically purged after 24 hours — reproduce the issue and analyze soon after
- Widen the time window

### Flow Runs Show Low Confidence

**Issue**: Flow runs are linked with "stitched · low"

**Solution**:

- Enable Power Platform API on the connection in ToolBox so runs can be tied to the exact record
- Narrow the time window to reduce the number of candidate changes

### "Couldn't Check" Items in Findings

**Issue**: Some checks are listed as Unavailable

**Solution**:

- Read the reason — usually a setting (trace level, auditing) or missing read access
- Business rules and real-time workflows leave no execution history, so they can never be confirmed

### Too Many Rows

**Issue**: A warning says there were more rows than the tool reads in one go

**Solution**:

- Narrow the time window
- Pick a column of interest to focus the findings

## Contributing

Contributions are welcome! When contributing:

1. Maintain PPTB integration patterns
2. Keep the tool strictly read-only — all Dataverse access goes through `src/host/readOnlyDataverse.ts`, and the test suite fails if a write path appears
3. Keep findings rules as isolated, pure modules with unit tests
4. Test in Power Platform ToolBox
5. Update documentation as needed

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](../../LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/Power-Maverick/PPTB-Tools/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Power-Maverick/PPTB-Tools/discussions)
