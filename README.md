# DVDT-Tools

Tools that can be integrated with Dataverse DevTools VS Code extension.

## Overview

This is a monorepo containing various tools for working with Microsoft Dataverse and Power Platform.

## Tools

### [@dvdt-tools/erd-generator](./tools/erd-generator)

Generate Entity Relationship Diagrams (ERD) from Dataverse solutions. **React-based tool** with dual integration support for:
- **DVDT (Dataverse DevTools)**: VS Code WebView panel integration
- **PPTB (Power Platform Toolbox)**: Standalone web-based tool integration

**Key Features:**
- **React + TypeScript**: Modern component-based architecture with Vite build system
- **Dual Platform Support**: Seamlessly works in both VS Code (DVDT) and web browser (PPTB)
- **Self-Contained UI**: Complete React webview with modern controls and configuration options
- **Minimal Integration**: DVDT provides environment URL and token - tool handles everything else
- **PPTB Integration**: Full toolboxAPI support with context awareness
- Fetch solution metadata automatically from Dataverse
- Multiple output formats: Mermaid, PlantUML, Graphviz DOT
- Download diagrams as source code or copy to clipboard
- User-configurable options (include attributes, relationships, max attributes)

**DVDT Integration (Simple Function Call):**
```typescript
import { showERDPanel } from '@dvdt-tools/erd-generator';

// Just call this when you want to show the ERD panel
showERDPanel(context.extensionUri, environmentUrl, accessToken);
```

**PPTB Integration:**
The tool automatically detects PPTB environment and uses `window.toolboxAPI` for:
- Getting connection context via `getToolContext()`
- Showing notifications via `showNotification()`
- Listening to toolbox events via `onToolboxEvent()`
- Receiving TOOLBOX_CONTEXT via postMessage

**Technical Architecture:**
- **React 18** with functional components and hooks
- **Vite** for fast development and optimized production builds
- **TypeScript** for type safety
- **Browser-only bundle**: No Node.js-specific artifacts in webview output
- **Separate builds**: Extension code (Node.js) and webview (browser) are built independently

See [VSCODE_INTEGRATION.md](./VSCODE_INTEGRATION.md) for complete WebView integration guide.

**Testing:**

- **Standalone Testing**: Open `packages/erd-generator/ui/test.html` in your browser to test without DVDT integration. Just provide your environment URL and access token.
- **Local DVDT Integration**: See [LOCAL_TESTING.md](./LOCAL_TESTING.md) for step-by-step instructions on integrating with a local copy of Dataverse DevTools.

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

```bash
cd tools/erd-generator
npm run dev
```

## Repository Structure

```
DVDT-Tools/
├── tools/
│   └── erd-generator/       # ERD generation tool
│       ├── src/
│       │   ├── ERDGenerator.ts
│       │   ├── types.ts
│       │   └── index.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md
├── package.json             # Root package with workspaces
├── tsconfig.json           # Shared TypeScript config
├── LICENSE
└── README.md
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](LICENSE) file for details.
