# DVDT-Tools

Tools that can be integrated with Dataverse DevTools VS Code extension.

## Overview

This is a monorepo containing various tools for working with Microsoft Dataverse and Power Platform.

## Tools

### [@dvdt-tools/erd-generator](./tools/erd-generator)

Generate Entity Relationship Diagrams (ERD) from Dataverse solutions. Designed as a **VS Code WebView panel** for seamless integration with Dataverse DevTools (DVDT).

**Key Features:**
- **VS Code WebView Panel Integration**: Call one function to show the panel - no command registration needed
- **Self-Contained UI**: Complete webview HTML with modern dropdown controls and configuration options
- **Minimal DVDT Integration**: DVDT only provides environment URL and token - ERD tool handles everything else
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

See [VSCODE_INTEGRATION.md](./VSCODE_INTEGRATION.md) for complete WebView integration guide.

**Testing:**

- **Standalone Testing**: Open `packages/erd-generator/ui/test.html` in your browser to test without DVDT integration. Just provide your environment URL and access token.
- **Local DVDT Integration**: See [LOCAL_TESTING.md](./LOCAL_TESTING.md) for step-by-step instructions on integrating with a local copy of Dataverse DevTools.

### [create-dvdt-tool](./tools/create-dvdt-tool)

Scaffolding tool for creating new DVDT tools with a complete project structure.

**Usage:**
```bash
npx create-dvdt-tool
```

**Features:**
- Interactive prompts for tool name, description, and author
- Creates complete tool structure based on erd-generator template
- Includes TypeScript configuration, Webpack setup, and VS Code WebView integration
- Generates documentation templates and build scripts
- Ready-to-use Dataverse client and VS Code integration code

See the [create-dvdt-tool README](./tools/create-dvdt-tool/README.md) for more details.

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

### Creating a New Tool

Use the scaffolding tool to create a new DVDT tool:

```bash
npx create-dvdt-tool
```

This will interactively guide you through creating a new tool with a complete project structure. For more information, see [create-dvdt-tool](./tools/create-dvdt-tool/README.md) or [CONTRIBUTING.md](./CONTRIBUTING.md).

## Repository Structure

```
DVDT-Tools/
├── tools/
│   ├── erd-generator/       # ERD generation tool
│   │   ├── src/
│   │   │   ├── ERDGenerator.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   └── create-dvdt-tool/    # Scaffolding tool
│       ├── src/
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
