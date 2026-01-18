# Entity Field Catalog

Export entity and field metadata from Dataverse solutions to Excel or CSV format.

## Overview

The Entity Field Catalog is a React-based tool designed exclusively for Power Platform ToolBox (PPTB) that allows users to:

- Select a Dataverse solution
- Choose multiple entities from that solution
- Export comprehensive entity and field metadata to Excel (.xlsx) or CSV (.csv) formats

## Features

- **Modern Fluent UI Design**: Built with Microsoft's Fluent UI React components for a consistent, professional look
- **Multi-Entity Selection**: Select one or multiple entities to export at once
- **Comprehensive Metadata Export**: Exports entity and field information including:
  - Entity logical name, display name, schema name, and description
  - Field logical name, display name, schema name, type, and description
  - Field properties: isPrimaryId, isPrimaryName, isRequired
- **Multiple Export Formats**:
  - Excel (.xlsx) - Entities tab plus one tab per entity
  - CSV (.zip) - Entities summary CSV plus one CSV per entity, packaged together
- **PPTB Integration**: Full integration with Power Platform ToolBox API for seamless connectivity

## Technical Stack

- **React 18** with TypeScript
- **Fluent UI React Components** for modern, accessible UI
- **Vite** for fast development and optimized builds
- **ExcelJS** for secure Excel export functionality
- **PPTB API** for all Dataverse operations (no direct HTTP calls)

## Installation

This tool is distributed as part of the PPTB-Tools monorepo and can be installed in Power Platform ToolBox.

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Build

```bash
cd tools/entity-field-catalog
npm install
npm run build
```

## Usage in PPTB

1. Install the tool in Power Platform ToolBox
2. Connect to your Dataverse environment
3. Open the Entity Field Catalog tool
4. Select a solution from the dropdown
5. Check the entities you want to export
6. Choose your export format (Excel or CSV)
7. Click "Export" to download the file

## Export Format

Both export options share the same structure:

- **Excel**: One `Entities` tab with consolidated info and an additional tab per entity for field details.
- **CSV**: A `.zip` file containing `Entities.csv` plus a separate CSV for each entity's fields.

### Entities Summary

| Column                 | Description                       |
| ---------------------- | --------------------------------- |
| Entity Display Name    | Human-friendly name of the entity |
| Entity Logical Name    | Dataverse logical name            |
| Entity Schema Name     | Dataverse schema name             |
| Primary ID Attribute   | Primary key column                |
| Primary Name Attribute | Primary name column               |
| Object Type Code       | Numeric identifier (if available) |
| Description            | Entity description                |
| Field Count            | Number of fields exported         |

### Field Details (per entity)

| Column             | Description                                |
| ------------------ | ------------------------------------------ |
| Field Display Name | Human-friendly field label                 |
| Field Logical Name | Dataverse logical name                     |
| Field Schema Name  | Dataverse schema name                      |
| Field Type         | Data type                                  |
| Is Primary ID      | Indicates if the field is the primary ID   |
| Is Primary Name    | Indicates if the field is the primary name |
| Is Required        | Indicates if the field is required         |
| Field Description  | Field description                          |

## Development

To run the tool in development mode:

```bash
npm run dev
```

This will start the Vite development server with hot module replacement.

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](../../LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Power Maverick - [GitHub](https://github.com/Power-Maverick)
