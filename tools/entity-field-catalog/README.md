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
  - Entity logical name, display name, schema name, type, and description
  - Field logical name, display name, schema name, type, and description
  - Field properties: isPrimaryId, isPrimaryName, isRequired
  - Field constraints: maxLength, precision, format
- **Multiple Export Formats**: 
  - Excel (.xlsx) - Structured workbook format
  - CSV (.csv) - Simple comma-separated values
- **PPTB Integration**: Full integration with Power Platform ToolBox API for seamless connectivity

## Technical Stack

- **React 18** with TypeScript
- **Fluent UI React Components** for modern, accessible UI
- **Vite** for fast development and optimized builds
- **XLSX library** for Excel export functionality
- **Axios** for HTTP requests (fallback mode)

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

The exported file includes the following columns:

| Column | Description |
|--------|-------------|
| Entity Logical Name | The logical name of the entity |
| Entity Display Name | The display name of the entity |
| Entity Schema Name | The schema name of the entity |
| Entity Type | The type of entity |
| Entity Description | Description of the entity |
| Field Logical Name | The logical name of the field |
| Field Display Name | The display name of the field |
| Field Schema Name | The schema name of the field |
| Field Type | The data type of the field |
| Is Primary ID | Whether the field is the primary ID |
| Is Primary Name | Whether the field is the primary name |
| Is Required | Whether the field is required |
| Field Description | Description of the field |
| Max Length | Maximum length (for string fields) |
| Precision | Precision (for decimal/money fields) |
| Format | Format specification for the field |

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
