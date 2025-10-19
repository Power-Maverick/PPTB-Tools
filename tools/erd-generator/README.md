# ERD Generator for Dataverse

Generate Entity Relationship Diagrams (ERD) from Dataverse solutions. **React-based tool** with dual integration support for **DVDT (Dataverse DevTools)** and **PPTB (Power Platform Toolbox)**.

## Features

- **🎨 Modern React UI**: Component-based architecture with React 18 and TypeScript
- **🔄 Dual Platform Support**: Works seamlessly in both VS Code (DVDT) and web browser (PPTB)
- **⚡ Fast Development**: Vite for instant HMR and optimized production builds
- **🔌 Minimal Integration**: Just pass credentials - tool handles all the rest
- **📊 Multiple Formats**: Generate ERDs in Mermaid, PlantUML, or Graphviz DOT
- **🎯 Smart Detection**: Automatically detects DVDT vs PPTB environment
- **🛠️ Configurable Output**: Control attributes, relationships, and detail level
- **📥 Export Options**: Download source files or copy to clipboard
- **🔍 Visual Preview**: Interactive Mermaid diagram rendering (when available)

## Technical Architecture

### Build System
- **Vite**: Modern build tool for fast development and optimized production builds
- **React 18**: Latest React with hooks and concurrent features
- **TypeScript**: Full type safety across the codebase
- **Dual Build Target**: 
  - Extension code (Node.js/VS Code) compiled with `tsc`
  - Webview (browser) bundled with Vite

### Platform Integration
The tool automatically detects its environment:

1. **DVDT (VS Code)**: Detects `window.acquireVsCodeApi()`
   - Receives credentials via `postMessage` with `setCredentials` command
   - Uses VS Code APIs for file operations and clipboard
   
2. **PPTB (Web)**: Detects `window.toolboxAPI`
   - Gets context via `toolboxAPI.getToolContext()`
   - Listens for `TOOLBOX_CONTEXT` via `postMessage`
   - Uses browser APIs for file downloads and clipboard

## Installation

```bash
npm install @dvdt-tools/erd-generator
```

## Development & Testing

### Building the Project

The project uses dual build targets:

```bash
npm run build
```

This runs:
1. **Extension build** (`npm run build:extension`): Compiles TypeScript for Node.js/VS Code
   - Input: `src/` TypeScript files
   - Output: `dist/src/` JavaScript files
   - Target: Node.js runtime (VS Code extension host)

2. **Webview build** (`npm run build:webview`): Bundles React app for browser
   - Input: `webview/` React components
   - Output: `dist/webview/` bundled files (index.js, index.css)
   - Target: Browser runtime (Chrome-based webview)

### Development Mode

Run with hot module replacement:

```bash
npm run dev
```

This starts:
- TypeScript compiler in watch mode
- Vite dev server with instant HMR

### Preview Production Build

Preview the production build locally:

```bash
npm run preview
```

## Integration Guide

### DVDT (Dataverse DevTools) Integration

The ERD Generator provides a simple function to show the panel in VS Code:

```typescript
import { showERDPanel } from '@dvdt-tools/erd-generator';

// In your DVDT extension code
export function activate(context: vscode.ExtensionContext) {
  // When you want to show ERD Generator (e.g., from a command)
  showERDPanel(
    context.extensionUri,
    environmentUrl,  // Your Dataverse environment URL
    accessToken      // Your Dataverse access token
  );
}
```

**What it does:**
1. Creates or reveals a VS Code WebView panel
2. Loads the React app into the webview
3. Sends credentials via `postMessage`
4. Handles file save and clipboard operations through VS Code APIs

### PPTB (Power Platform Toolbox) Integration

The tool automatically integrates with PPTB when deployed as a tool:

**No code required!** The React app detects PPTB environment and:
1. Listens for `TOOLBOX_CONTEXT` via `postMessage`
2. Calls `window.toolboxAPI.getToolContext()` to get connection details
3. Uses `window.toolboxAPI.showNotification()` for user feedback
4. Subscribes to toolbox events via `window.toolboxAPI.onToolboxEvent()`

**Package structure for PPTB:**
```json
{
  "name": "dvdt-erd-generator",
  "version": "0.0.6",
  "displayName": "Dataverse ERD Generator",
  "description": "Generate Entity Relationship Diagrams for Dataverse solutions"
}
```

The `dist/webview/` folder contains the complete tool:
- `index.html` - Entry point
- `index.js` - Bundled React app
- `index.css` - Styles

## Usage

### In DVDT (VS Code)

1. Install the tool in your Dataverse DevTools extension
2. Call `showERDPanel()` with connection details
3. The panel opens showing available solutions
4. Select a solution and configure options
5. Click "Generate ERD" to create the diagram
6. Download or copy the generated diagram

### In PPTB (Web)

1. Install the tool in Power Platform Toolbox
2. Open the tool from the toolbox interface
3. Tool automatically receives connection context
4. Select a solution and configure options
5. Click "Generate ERD" to create the diagram
6. Download to your computer or copy to clipboard

## Configuration Options

The tool provides several configuration options:

- **Output Format**: Choose between Mermaid, PlantUML, or Graphviz
- **Include Attributes**: Show/hide table columns in the diagram
- **Include Relationships**: Show/hide relationships between tables
- **Max Attributes**: Limit the number of attributes shown per table (0 = show all)

## Output Formats

### Mermaid
- Modern, declarative diagram syntax
- Visual preview available in the tool
- Great for documentation and GitHub

### PlantUML
- Widely supported UML format
- Can be rendered by many tools
- Standard UML notation

### Graphviz DOT
- Graph description language
- Powerful layout engines
- Flexible customization options

## Architecture Details

### No Node.js Dependencies in Webview

The webview bundle (`dist/webview/index.js`) is **pure browser JavaScript**:
- ✅ No `require()` or `module.exports`
- ✅ No `process.env` or Node.js globals
- ✅ No Node.js-specific APIs
- ✅ Uses only browser-standard APIs

This ensures:
- Works in any browser environment (PPTB)
- Works in VS Code webviews (DVDT)
- No runtime dependencies
- Smaller bundle size

### Build Output Structure

```
dist/
├── src/                    # Extension code (Node.js)
│   ├── index.js           # Main export
│   ├── components/
│   │   └── ERDGenerator.js
│   ├── utils/
│   │   └── DataverseClient.js
│   └── dvdtIntegration/
│       └── integration.js  # VS Code panel management
└── webview/               # Browser bundle (React app)
    ├── index.html         # Entry point
    ├── index.js          # Bundled React app (~195 KB)
    └── index.css         # Styles (~5 KB)
```

## Core Components

### ERDGenerator (`src/components/ERDGenerator.ts`)
- Core logic for generating diagrams
- Supports multiple output formats
- Handles table and relationship mapping
- Shared between extension and webview builds

### DataverseClient (`src/utils/DataverseClient.ts`)
- Dataverse API client
- Fetches solutions, tables, attributes, relationships
- Uses Axios for HTTP requests
- Shared between extension and webview builds

### App Component (`webview/App.tsx`)
- Main React component
- Environment detection (DVDT vs PPTB)
- State management with hooks
- User interface and interactions

## Troubleshooting

### Build Issues

If builds fail, try:
```bash
# Clean build artifacts
rm -rf dist node_modules
npm install
npm run build
```

### Webview Not Loading in VS Code

Check:
1. Extension is built: `npm run build:extension`
2. Webview is built: `npm run build:webview`
3. Files exist in `dist/webview/`
4. CSP settings in integration.ts allow loading scripts

### PPTB Integration Issues

Check:
1. `window.toolboxAPI` is available
2. Console logs for TOOLBOX_CONTEXT messages
3. Connection context is being received
4. Network requests are successful

## Migration from Webpack to Vite

This tool was migrated from Webpack to Vite for better performance and simpler configuration:

**Benefits:**
- ⚡ Faster development with instant HMR
- 📦 Smaller production bundles
- 🎯 Simpler configuration
- 🔧 Better TypeScript integration
- 🚀 Native ESM support

**Breaking Changes:**
- Webview bundle location changed from `dist/webview/webview.js` to `dist/webview/index.js`
- HTML is now generated (not loaded from template)
- Build output structure simplified

## Contributing

Contributions are welcome! When contributing:

1. Maintain dual platform support (DVDT + PPTB)
2. Keep webview bundle browser-only (no Node.js dependencies)
3. Test in both environments
4. Update documentation as needed
5. Follow existing code style

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](../../LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/Power-Maverick/DVDT-Tools/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Power-Maverick/DVDT-Tools/discussions)

## Changelog

### v0.0.6
- 🎉 **Major Rewrite**: Converted to React-based architecture
- 🔄 Added PPTB (Power Platform Toolbox) integration support
- ⚡ Migrated from Webpack to Vite
- 🎨 Modern React components with hooks
- 🌐 Dual platform support (DVDT + PPTB)
- 📦 Cleaner build output with no Node.js artifacts in webview
- 🔧 Improved TypeScript configuration
- 📚 Updated documentation

### Previous Versions
See [CHANGELOG.md](../../CHANGELOG.md) for full history.
- Copy to clipboard

## Integration with Dataverse DevTools

### VS Code WebView Panel Integration

**Simple function call - no command registration needed:**

```typescript
import { showERDPanel } from '@dvdt-tools/erd-generator';

// Call this when you want to show the ERD panel
showERDPanel(context.extensionUri, environmentUrl, accessToken);
```

**Complete example:**

```typescript
import { showERDPanel } from '@dvdt-tools/erd-generator';
import * as vscode from 'vscode';

// In your DVDT menu handler or button click
async function openERDGenerator() {
    try {
        const environmentUrl = dvdtConfig.getCurrentEnvironment();
        const accessToken = await dvdtAuth.getAccessToken();

        if (!environmentUrl || !accessToken) {
            vscode.window.showErrorMessage('Please connect to Dataverse first');
            return;
        }

        // Open ERD tool panel
        showERDPanel(context.extensionUri, environmentUrl, accessToken);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open ERD Generator: ${error.message}`);
    }
}
```

That's it! The ERD tool will:
- Open as a panel when called
- List all solutions in a dropdown control
- Allow users to select and generate ERDs
- Handle downloading and copying
- Provide a complete UI experience with configuration options

See [../../VSCODE_INTEGRATION.md](../../VSCODE_INTEGRATION.md) for complete integration guide.

## API

### showERDPanel()

Opens the ERD Generator panel in VS Code.

**Parameters:**
- `extensionUri: vscode.Uri` - VS Code extension URI from context
- `environmentUrl: string` - Dataverse environment URL
- `accessToken: string` - Dataverse access token

**Example:**
```typescript
showERDPanel(context.extensionUri, environmentUrl, accessToken);
```

### DataverseClient

Handles communication with Dataverse Web API.

**Constructor:**
```typescript
new DataverseClient({
  environmentUrl: string,
  accessToken: string,
  apiVersion?: string  // Optional, defaults to '9.2'
})
```

**Methods:**
- `listSolutions(): Promise<Solution[]>` - Lists all solutions
- `fetchSolution(uniqueName: string): Promise<DataverseSolution>` - Fetches complete solution metadata

### ERDGenerator

Generates ERD diagrams from solution metadata.

**Constructor:**
```typescript
new ERDGenerator({
  format: 'mermaid' | 'plantuml' | 'graphviz',
  includeAttributes?: boolean,      // Default: true
  includeRelationships?: boolean,   // Default: true
  maxAttributesPerTable?: number    // Default: 10, 0 = all
})
```

**Methods:**
- `generate(solution: DataverseSolution): string` - Generates ERD diagram

## Architecture

The ERD tool is self-contained:

```
DVDT Extension
    ↓ (provides credentials)
ERD Tool WebView Panel
    ↓ (uses)
DataverseClient → Dataverse Web API
    ↓ (fetches metadata)
ERDGenerator → Generates diagrams
```

## License

GPL-2.0
