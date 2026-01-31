# Power Platform ToolBox (PPTB) Tools

Tools for Power Platform ToolBox (PPTB) - a comprehensive toolkit for working with Microsoft Dataverse and Power Platform.

- [Power Platform ToolBox (PPTB) Tools](#power-platform-toolbox-pptb-tools)
    - [Overview](#overview)
    - [Tools](#tools)
        - [PCF Builder](#pcf-builder)
        - [ERD Generator](#erd-generator)
        - [Entity Field Catalog](#entity-field-catalog)
        - [View Layout Replicator](#view-layout-replicator)
        - [Dataverse Trace Analyzer](#dataverse-trace-analyzer)
        - [Data Migrator](#data-migrator)
    - [Contributing](#contributing)
    - [License](#license)

## Overview

This is a monorepo containing various tools designed primarily for Power Platform ToolBox (PPTB), with additional support for Dataverse DevTools (DVDT) VS Code extension.

## Tools

### [PCF Builder](./tools/pcf-builder)

Tool README: [here](./tools/pcf-builder/README.md)

Build and manage Power Apps Component Framework (PCF) custom controls. **React-based tool** exclusively for:

- **PPTB (Power Platform Toolbox)**: Full integration with PPTB - Electron desktop app

**Key Features:**

- **React + TypeScript**: Modern component-based architecture with Vite build system
- **PPTB-Only Integration**: Designed exclusively for PowerPlatform ToolBox
- **Visual PCF Control Creation**: Create new PCF controls with intuitive UI
- **Project Management**: Build, test, and manage PCF projects
- **Solution Packaging**: Create solution packages for deployment
- **Template Support**: Field (single field) and Dataset (grid) templates
- **Additional Packages**: Support for Fluent UI, React, and other npm packages
- **Command Execution**: Execute Power Apps CLI commands through PPTB terminal API
- **File System Integration**: Select folders and files through PPTB file system API

**Use Cases:**

- Rapidly create new PCF controls with predefined templates
- Manage PCF projects within PPTB
- Build and test PCF controls using integrated commands
- Package PCF controls into solutions for deployment

### [ERD Generator](./tools/erd-generator)

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

**Use Cases:**

- Visualize Dataverse entity relationships for better understanding
- Generate diagrams for documentation or analysis
- Use in both PPTB and DVDT environments seamlessly
- Export diagrams in various formats for different use cases
- Customize diagram content based on user preferences
- Facilitate communication with stakeholders using visual representations

### [Entity Field Catalog](./tools/entity-field-catalog)

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

**Use Cases:**

- Document entity and field structures for analysis or auditing
- Share metadata information with team members or stakeholders
- Facilitate data modeling and schema design discussions
- Quickly generate reports on Dataverse solution structures
- Maintain up-to-date records of entity and field configurations
- Support migration or integration projects with detailed metadata exports

### [View Layout Replicator](./tools/view-layout-replicator)

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

### [Dataverse Trace Analyzer](./tools/dataverse-trace-analyzer)

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

### [Data Migrator](./tools/data-migrator)

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

### [Environment Variable Manager](./tools/environment-variable-manager)

Tool README: [here](./tools/environment-variable-manager/README.md)

Manage environment variables default and per-environment values in Dataverse. Exclusively for PPTB.

**Key Features:**

- **React + TypeScript**: Modern component-based architecture with Vite build system
- **PPTB-Only Integration**: Designed exclusively for Power Platform ToolBox (uses @pptb/types v1.0.17)
- **Modern Minimalist UI**: Clean design with no header and optimized to avoid excessive scrolling and whitespace
- **View & Search**: Browse all environment variables with instant search by name, schema, description, or value
- **Create Variables**: Create new environment variable definitions with full type support (String, Number, Boolean, JSON, Data Source)
- **Edit Values**: Update both default values (all environments) and environment-specific values (current environment only)
- **Visual Indicators**: Clear badges showing which variables have environment-specific overrides
- **Type Support**: Full support for all Dataverse environment variable types
- **Delete Variables**: Remove environment variables when no longer needed

**Use Cases:**

- Manage different API endpoints, URLs, or settings across Dev, Test, and Prod environments
- Control feature availability using Boolean variables as feature flags
- Store API keys, connection strings, or other integration configuration
- Centralize application configuration that may differ per environment
- Store complex configuration objects using JSON type variables

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](LICENSE) file for details.
