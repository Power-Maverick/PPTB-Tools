# Power Platform ToolBox (PPTB) Tools

Tools for Power Platform ToolBox (PPTB) - a comprehensive toolkit for working with Microsoft Dataverse and Power Platform.

## Overview

This is a monorepo containing various tools designed primarily for Power Platform ToolBox (PPTB), with additional support for Dataverse DevTools (DVDT) VS Code extension.

## Tools

### [@power-maverick/tool-pcf-builder](./tools/pcf-builder)

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

**PPTB Integration:**
The tool uses `window.toolboxAPI` for:
- Getting active connection via `connections.getActiveConnection()`
- Showing notifications via `showNotification()`
- Executing commands via `terminal.executeCommand()`
- File system operations via `fileSystem.selectFolder()`, `fileSystem.selectFile()`

**Technical Architecture:**
- **React 18** with functional components and hooks
- **Vite** for fast development and optimized production builds
- **TypeScript** for type safety with latest `@pptb/types` (v1.0.12)
- **Browser-only bundle**: No Node.js-specific artifacts in webview output

**Reference:**
Based on [PCF-CustomControlBuilder](https://github.com/Power-Maverick/PCF-CustomControlBuilder) adapted for PPTB.

### [@dvdt-tools/erd-generator](./tools/erd-generator)
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
```

## Repository Structure

```
DVDT-Tools/
├── tools/
│   ├── pcf-builder/         # PCF Custom Control Builder tool (PPTB-only)
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   ├── styles.css
│   │   │   ├── models/
│   │   │   ├── components/
│   │   │   └── utils/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   └── erd-generator/       # ERD generation tool (PPTB + DVDT)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   └── components/
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
│   └── view-layout-replicator/    # View layout copying tool
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
