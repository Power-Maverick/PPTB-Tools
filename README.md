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

### [@power-maverick/tool-view-layout-replicator](./tools/view-layout-replicator)

Copy layout from one view to multiple views of the same entity in a single operation. **React-based tool** with PPTB-only integration.

**Key Features:**
- **React + TypeScript**: Modern component-based architecture with Vite build system
- **PPTB-Only Integration**: Designed exclusively for Power Platform ToolBox (uses @pptb/types v1.0.12)
- **Entity & View Management**: Browse entities and their views with an intuitive interface
- **Layout Copying**: Copy view layouts from one view to multiple target views in one operation
- **Real-time Progress Tracking**: See the status of each view update as it happens
- **Error Handling**: Clear feedback on success and failure for each operation

**PPTB Integration:**
The tool uses `window.toolboxAPI` for:
- Getting active connection details via `connections.getActiveConnection()`
- Getting access tokens via `connections.getAccessToken()`
- Showing notifications via `utils.showNotification()`

**Use Cases:**
- Standardize view layouts across multiple views of an entity
- Quickly copy column configurations
- Maintain consistency in view designs across your Dataverse environment

### [@power-maverick/tool-dataverse-trace-analyzer](./tools/dataverse-trace-analyzer)

Analyze and view Plugin Trace Logs from Microsoft Dataverse. **React-based tool** with PPTB-only integration.

**Key Features:**
- **React + TypeScript**: Modern component-based architecture with Vite build system
- **PPTB-Only Integration**: Designed exclusively for Power Platform ToolBox (uses @pptb/types v1.0.13)
- **Modern Minimalist UI**: Clean design with no header and optimized to avoid excessive scrolling
- **Smart Filtering**: Filter trace logs by message name, entity, correlation ID, or show only exceptions
- **Detailed Analysis**: View complete trace details including execution duration, message blocks, and exception information
- **Log Management**: Delete individual trace logs when no longer needed
- **Real-time Data**: Refresh to get the latest trace logs from your environment

**PPTB Integration:**
The tool uses `window.toolboxAPI` and `window.dataverseAPI` for:
- Getting active connection details via `connections.getActiveConnection()`
- Querying plugin trace logs via `queryData()`
- Retrieving detailed trace information via `retrieve()`
- Deleting trace logs via `delete()`
- Showing notifications via `utils.showNotification()`

**Use Cases:**
- Debug plugin execution issues
- Monitor plugin performance and execution duration
- Investigate exceptions in plugin code
- Track related operations using correlation IDs
- Clean up old trace logs

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
# Build erd-generator
cd tools/erd-generator
npm install
npm run build

# Build view-layout-replicator
cd tools/view-layout-replicator
npm install
npm run build

# Build dataverse-trace-analyzer
cd tools/dataverse-trace-analyzer
npm install
npm run build
```

### Development

Watch mode for development:

```bash
# ERD Generator
cd tools/erd-generator
npm run dev

# View Layout Copier
cd tools/view-layout-replicator
npm run dev

# Dataverse Trace Analyzer
cd tools/dataverse-trace-analyzer
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
│   │   ├── vite.config.ts
│   │   └── README.md
│   ├── view-layout-replicator/    # View layout copying tool
│   │   ├── src/
│   │   │   ├── models/
│   │   │   ├── utils/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── README.md
│   └── dataverse-trace-analyzer/  # Plugin trace log analyzer tool
│       ├── src/
│       │   ├── models/
│       │   ├── utils/
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── README.md
├── LICENSE
└── README.md
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](LICENSE) file for details.
