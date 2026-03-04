# Security Role Comparator

A [PPTB](https://github.com/Power-Maverick/PowerPlatformToolBox) tool that lets you compare one security role against up to **5** other roles in the same Dataverse environment—side by side, privilege by privilege.

## Features

- **Side-by-side comparison** – Select a base role and up to 5 comparison roles
- **Depth visualization** – Four filled/empty dots represent None → User → Business Unit → Parent-Child BU → Organization
- **Difference highlighting** – Cells that differ from the base role are highlighted in amber
- **"Differences only" filter** – Hide rows where all compared roles share the same privilege depth
- **Entity search** – Filter by entity name or operation (Create, Read, Write, Delete, …)
- **Dark mode** – Follows the PPTB host theme automatically

## Privilege Depth Legend

| Dots | Level | Description |
|------|-------|-------------|
| ○○○○ | None | Privilege not granted |
| ●○○○ | User | Basic (own records) |
| ●●○○ | Business Unit | Local (business unit records) |
| ●●●○ | Parent-Child BU | Deep (business unit + child BU records) |
| ●●●● | Organization | Global (all records) |

## Usage

1. Connect to a Dataverse environment in PPTB.
2. Open **Security Role Comparator**.
3. Select the **Base Role** from the first dropdown.
4. Choose one or more **Compare** roles (up to 5 total).
5. Click **Compare**.
6. Use the search box or *Differences only* checkbox to focus on specific areas.
