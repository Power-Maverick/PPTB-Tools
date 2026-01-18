# Power Platform ToolBox (PPTB) Tools

Tools for Power Platform ToolBox (PPTB) - a comprehensive toolkit for working with Microsoft Dataverse and Power Platform.

## Overview

This is a monorepo containing various tools designed primarily for Power Platform ToolBox (PPTB), with additional support for Dataverse DevTools (DVDT) VS Code extension.

## Tools

### [@power-maverick/tool-erd-generator](./tools/erd-generator)

Tool README: [here](./tools/erd-generator/README.md)

Generate Entity Relationship Diagrams (ERD) from Dataverse solutions. Dual integration support for:

- **PPTB (Power Platform Toolbox)**: Primary integration - Electron desktop app
- **DVDT (Dataverse DevTools)**: Secondary support - VS Code WebView panel integration

**Key Features:**

- **React + TypeScript**: Modern component-based architecture with Vite build system
- **Dual Platform Support**: Seamlessly works in Electron desktop app (PPTB) and VS Code WebView (DVDT)
- **Self-Contained UI**: Complete React webview with modern controls and configuration options
- **PPTB Integration**: Full toolboxAPI support with context awareness
- **Minimal DVDT Integration**: DVDT provides environment URL and token - tool handles everything else
- Fetch solution metadata automatically from Dataverse
- Multiple output formats: Mermaid, PlantUML, Graphviz DOT
- Download diagrams as source code or copy to clipboard
- User-configurable options (include attributes, relationships, max attributes)

**Technical Architecture:**

- **React 18** with functional components and hooks
- **Vite** for fast development and optimized production builds
- **TypeScript** for type safety
- **Browser-only bundle**: No Node.js-specific artifacts in webview output
- **Separate builds**: Extension code (Node.js) and webview (browser) are built independently

**Testing:**

- **PPTB Testing**: Install the tool in Power Platform ToolBox and test with your Dataverse environment.
- **Local DVDT Integration**: See [LOCAL_TESTING.md](./LOCAL_TESTING.md) for step-by-step instructions on integrating with a local copy of Dataverse DevTools.

### [@power-maverick/tool-entity-field-catalog](./tools/entity-field-catalog)

Tool README: [here](./tools/entity-field-catalog/README.md)

Export comprehensive entity and field metadata from Dataverse solutions to Excel formats. Exclusively for PPTB.

**Key Features:**

- **Modern Fluent UI Design**: Built with Microsoft's Fluent UI React components for a professional, minimalist interface
- **Multi-Entity Selection**: Select multiple entities from a solution with an intuitive checkbox interface
- **Comprehensive Metadata Export**: Exports detailed information about entities and their fields including:
    - Entity metadata: logical name, display name, schema name, type, description
    - Field metadata: logical name, display name, schema name, type, description
    - Field properties: isPrimaryId, isPrimaryName, isRequired
    - Field constraints: maxLength, precision, format
- **Multiple Export Formats**:
    - Excel (.xlsx) - Structured workbook with proper formatting
    - CSV (.csv) - Simple comma-separated values for universal compatibility
- **PPTB-Only Integration**: Exclusive integration with Power Platform ToolBox using latest @pptb/types (v1.0.13)
- **Real-time Statistics**: View selected entity count and total field count before export

**Technical Architecture:**

- **React 18** with TypeScript and functional components
- **Fluent UI React Components** for modern Microsoft design language
- **Vite** for fast development and optimized production builds
- **XLSX library** for Excel export functionality
- **@pptb/types v1.0.13** - Latest PPTB type definitions

### [@power-maverick/tool-view-layout-replicator](./tools/view-layout-replicator)

Tool README: [here](./tools/view-layout-replicator/README.md)

Copy layout from one view to multiple views of the same entity in a single operation. Exclusively for PPTB.

**Key Features:**

- **React + TypeScript**: Modern component-based architecture with Vite build system
- **PPTB-Only Integration**: Designed exclusively for Power Platform ToolBox (uses @pptb/types v1.0.12)
- **Entity & View Management**: Browse entities and their views with an intuitive interface
- **Layout Copying**: Copy view layouts from one view to multiple target views in one operation
- **Real-time Progress Tracking**: See the status of each view update as it happens
- **Error Handling**: Clear feedback on success and failure for each operation

**Use Cases:**

- Standardize view layouts across multiple views of an entity
- Quickly copy column configurations
- Maintain consistency in view designs across your Dataverse environment

### [@power-maverick/tool-dataverse-trace-analyzer](./tools/dataverse-trace-analyzer)

Tool README: [here](./tools/dataverse-trace-analyzer/README.md)

Analyze and view Plugin Trace Logs from Microsoft Dataverse. Exclusively for PPTB.

**Key Features:**

- **React + TypeScript**: Modern component-based architecture with Vite build system
- **PPTB-Only Integration**: Designed exclusively for Power Platform ToolBox (uses @pptb/types v1.0.14)
- **Modern Minimalist UI**: Clean design with no header and optimized to avoid excessive scrolling
- **Smart Filtering**: Filter trace logs by message name, entity, correlation ID, or show only exceptions
- **Detailed Analysis**: View complete trace details including execution duration, message blocks, and exception information
- **Log Management**: Delete individual trace logs when no longer needed
- **Real-time Data**: Refresh to get the latest trace logs from your environment

**Use Cases:**

- Debug plugin execution issues
- Monitor plugin performance and execution duration
- Investigate exceptions in plugin code
- Track related operations using correlation IDs
- Clean up old trace logs

### [@power-maverick/tool-data-migrator](./tools/data-migrator)

Tool README: [here](./tools/data-migrator/README.md)

Migrate data from one Dataverse environment to another with intelligent auto-mapping and smart operations. Exclusively for PPTB.

**Key Features:**

- **React + TypeScript**: Modern component-based architecture with Vite build system
- **PPTB-Only Integration**: Designed exclusively for Power Platform ToolBox (uses @pptb/types v1.0.16)
- **Modern Minimalist UI**: Clean design with no header and optimized to avoid excessive scrolling and whitespace
- **Auto-Mapping**: Automatically map users, teams, and business units between environments
- **Smart Migration Operations**: Choose between create, update, or upsert operations
- **Field Selection**: Select which fields to include in the migration
- **Lookup Handling**: Intelligent mapping of lookup fields and references
- **Real-time Progress**: Monitor migration progress with detailed status for each record
- **Batch Processing**: Efficient batch processing for large data sets with configurable batch size

**Use Cases:**

- Migrate data between environments after refresh
- Transfer test data from development to test environments
- Cross-tenant data migration with automatic user/team mapping
- Partial data migration using OData filters
- Data synchronization with upsert operations

**Technical Architecture:**

- **React 18** with TypeScript and functional components
- **Fluent UI React Components** for modern Microsoft design language
- **Vite** for fast development and optimized production builds
- **@pptb/types v1.0.16** - Latest PPTB type definitions
- **MigrationEngine** - Core migration logic with auto-mapping capabilities

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](LICENSE) file for details.
