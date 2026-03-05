# Audit Explorer

Explore and export audit history from Dataverse entities. Exclusively for PPTB.

## Features

- **Entity Selection**: Browse and search all entities in the connected Dataverse environment
- **Flexible Filtering**: Filter audit records by date range, action type (Create, Update, Delete, etc.), and record count limit
- **FetchXML Record Filter**: Optionally provide a FetchXML query to restrict audit history to specific records
- **Field-Level Changes**: Expand any audit entry to view old and new values for each changed field
- **Excel Export**: Export the complete audit history with two worksheets:
  - **Audit Summary** – one row per audit event
  - **Field Changes** – one row per changed field (old value → new value)
- **Dark / Light Theme**: Respects the PPTB theme setting automatically

## Use Cases

- Investigate who changed what and when for compliance auditing
- Track field-level changes on critical records
- Export audit history for reporting or further analysis in Excel
- Filter to specific records using FetchXML to narrow down audit data
- Identify unauthorized or unexpected changes in your environment

## Requirements

- Power Platform ToolBox (PPTB) desktop application
- Audit must be enabled at the organisation and entity level in Dataverse

## How to Use

1. **Select Entity** – Use the entity dropdown to search and select the entity whose audit history you want to explore
2. **Set Filters** (optional):
   - Choose a date range to limit results
   - Check only the action types you care about (Create / Update / Delete / …)
   - Set the maximum number of records to retrieve (default 500)
   - Expand **FetchXML record filter** and provide a FetchXML query if you want to limit audit history to specific records
3. **Load Audit History** – Click the button to fetch the data
4. **Browse Results** – Click any row in the table to expand field-level change details
5. **Export** – Click **Export to Excel** to download the results as an `.xlsx` file

## Technical Details

- **React + TypeScript**: Built with React 18 and Vite
- **PPTB-Only Integration**: Uses `window.toolboxAPI` and `window.dataverseAPI` exclusively
- **`@pptb/types` v1.0.17**: Latest type definitions
- **ExcelJS**: Excel generation with styled headers and alternating row colours
- **Fluent UI v9**: Microsoft's design system for a consistent PPTB look and feel
