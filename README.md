# Power Platform ToolBox (PPTB) Tools

Tools for Power Platform ToolBox (PPTB) - a comprehensive toolkit for working with Microsoft Dataverse and Power Platform.

## Overview

This is a monorepo containing various tools designed primarily for Power Platform ToolBox (PPTB), with additional support for Dataverse DevTools (DVDT) VS Code extension.

## Tools

### [@power-maverick/tool-erd-generator](./tools/erd-generator)

Generate Entity Relationship Diagrams (ERD) from Dataverse solutions. **React-based tool** with dual integration support for:
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

**PPTB Integration:**
The tool automatically detects PPTB environment and uses `window.toolboxAPI` for:
- Getting connection context via `getToolContext()`
- Showing notifications via `showNotification()`
- Listening to toolbox events via `onToolboxEvent()`
- Receiving TOOLBOX_CONTEXT via postMessage

**DVDT Integration (Simple Function Call):**
```typescript
import { showERDPanel } from '@dvdt-tools/erd-generator';

// Just call this when you want to show the ERD panel in VS Code
showERDPanel(context.extensionUri, environmentUrl, accessToken);
```

**Technical Architecture:**
- **React 18** with functional components and hooks
- **Vite** for fast development and optimized production builds
- **TypeScript** for type safety
- **Browser-only bundle**: No Node.js-specific artifacts in webview output
- **Separate builds**: Extension code (Node.js) and webview (browser) are built independently

See [VSCODE_INTEGRATION.md](./VSCODE_INTEGRATION.md) for complete WebView integration guide.

**Testing:**

- **PPTB Testing**: Install the tool in Power Platform ToolBox and test with your Dataverse environment.
- **Local DVDT Integration**: See [LOCAL_TESTING.md](./LOCAL_TESTING.md) for step-by-step instructions on integrating with a local copy of Dataverse DevTools.

### [@power-maverick/tool-entity-field-catalog](./tools/entity-field-catalog)

Export comprehensive entity and field metadata from Dataverse solutions to Excel or CSV formats. **React-based tool** exclusively for PPTB.

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

**Technical Stack:**
- **React 18** with TypeScript and functional components
- **Fluent UI React Components** for modern Microsoft design language
- **Vite** for fast development and optimized production builds
- **XLSX library** for Excel export functionality
- **@pptb/types v1.0.13** - Latest PPTB type definitions

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
npm install
```

### Building

Build all tools:

```bash
npm run build
```

### Development

Watch mode for development:

**ERD Generator:**
```bash
cd tools/erd-generator
npm run dev
```

**Entity Field Catalog:**
```bash
cd tools/entity-field-catalog
npm run dev
```

## Repository Structure

```
PPTB-Tools/
├── tools/
│   ├── erd-generator/              # ERD generation tool
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── models/
│   │   │   ├── utils/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   └── entity-field-catalog/       # Entity field catalog tool
│       ├── src/
│       │   ├── components/
│       │   ├── models/
│       │   ├── utils/
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md
├── LICENSE
└── README.md
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](LICENSE) file for details.
