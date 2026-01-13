# PCF Builder

A PowerPlatform ToolBox tool for building and managing Power Apps Component Framework (PCF) custom controls using React and Vite.

## Features

- ✅ React 18 with TypeScript
- ✅ Vite for fast development and building
- ✅ Access to ToolBox API via `window.toolboxAPI`
- ✅ PPTB-only integration (no DVDT support)
- ✅ Create new PCF controls with visual interface
- ✅ Edit existing PCF controls
- ✅ Build and test PCF projects
- ✅ Solution package creation
- ✅ Support for Field and Dataset templates
- ✅ Additional package integration (Fluent UI, React, etc.)
- ✅ Command execution and output display

## Structure

```
pcf-builder/
├── src/
│   ├── App.tsx               # Main React component
│   ├── main.tsx              # Entry point
│   ├── styles.css            # Global styles
│   ├── models/
│   │   └── interfaces.ts     # TypeScript interfaces
│   ├── components/           # React components (future)
│   ├── utils/                # Utility functions (future)
│   └── types/                # Type definitions (future)
├── index.html                # HTML template
├── vite.config.ts            # Vite configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

Install dependencies:

```bash
npm install
```

## Development

Run development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Usage in ToolBox

1. Build the tool:
   ```bash
   npm run build
   ```

2. The built files will be in the `dist/` directory:
   - `index.html` - Main entry point
   - `index.js` - Bundled application
   - `index.css` - Compiled styles

3. Install the tool in PowerPlatform ToolBox through the UI or programmatically

## Key Concepts

### ToolBox API Integration

The tool integrates with PowerPlatform ToolBox via `window.toolboxAPI`:

```typescript
// Get active connection
const connection = await window.toolboxAPI.connections.getActiveConnection();

// Show notification
await window.toolboxAPI.showNotification({
  title: "Success",
  body: "Operation completed successfully",
  type: "success"
});

// Execute terminal command
const result = await window.toolboxAPI.terminal.executeCommand(command);

// File system operations
const folder = await window.toolboxAPI.fileSystem.selectFolder();
const file = await window.toolboxAPI.fileSystem.selectFile();
```

**Important**: This tool is designed exclusively for PPTB and does not support DVDT (VS Code) integration.

### React Hooks

The tool demonstrates:

- `useState` for managing component state
- `useEffect` for initialization and side effects  
- Type-safe event handling with TypeScript
- PPTB API integration patterns

### PCF Control Creation

The tool supports creating PCF controls with:

1. **Namespace** - Your organization/project namespace
2. **Control Name** - Technical name for the control
3. **Display Name** - User-friendly name (optional)
4. **Description** - Brief description (optional)
5. **Control Type** - Standard or Virtual
6. **Template** - Field (single field) or Dataset (grid)
7. **Additional Packages** - Optional npm packages (Fluent UI, React, etc.)

Example command generated:
```bash
pac pcf init --namespace Contoso --name MyControl --template field
```

### Building and Testing

The tool provides buttons to:
- **Build Project** - Runs `npm run build` in the project directory
- **Test Project** - Runs `npm start` to launch the test harness

### Solution Package Creation

Create solution packages with:
- **Publisher Name** - Name of the publisher
- **Publisher Prefix** - Short prefix for the publisher
- **Publisher Friendly Name** - Human-readable publisher name (optional)

The tool will:
1. Initialize a solution with `pac solution init`
2. Add PCF reference with `pac solution add-reference`

### Styling

Uses CSS with modern features:

- CSS Grid for layouts
- Flexbox for alignment
- Gradient backgrounds
- Responsive design
- Clean, professional UI matching PPTB style

## TypeScript

Full TypeScript support with:

- Type declarations for ToolBox API
- Strict type checking
- Modern ES2020 features
- React JSX types
- PCF-specific types

## PCF Workflow

The typical workflow:

1. **Create Control**: Use "New Control" tab to initialize a PCF project
2. **Edit Control**: Open the project folder to build and test
3. **Build**: Compile the control with `npm run build`
4. **Test**: Launch test harness with `npm start`
5. **Solution**: Create a solution package for deployment
6. **Deploy**: Use PPTB's deployment features or Power Apps CLI

## Command Execution

All commands are executed through PPTB's terminal API:

```typescript
const result = await window.toolboxAPI.terminal.executeCommand(command);
if (result.success) {
  // Handle success
} else {
  // Handle error
}
```

Commands include:
- `pac pcf init` - Initialize PCF control
- `npm run build` - Build the control
- `npm start` - Start test harness
- `pac solution init` - Create solution
- `pac solution add-reference` - Add PCF to solution

## Configuration Options

### Control Configuration
- Namespace, name, display name, description
- Control type (standard/virtual)
- Template (field/dataset)
- Additional npm packages

### Solution Configuration
- Publisher name and prefix
- Publisher friendly name
- Solution version (auto-managed)

## Output Display

All command outputs are displayed in a formatted pre-block with:
- Syntax highlighting
- Scrollable area
- Copy-friendly formatting
- Clear success/error indication

## Troubleshooting

### Build Issues

If builds fail, ensure:
- Node.js and npm are installed
- Power Apps CLI (pac) is installed
- Project folder is valid
- All dependencies are installed

### PPTB Integration Issues

Check:
1. `window.toolboxAPI` is available
2. Tool is running inside PPTB
3. Active connection is established
4. File system permissions are granted

## Prerequisites

Before using this tool, ensure you have:

1. **Node.js & npm**: Install from [nodejs.org](https://nodejs.org/) (LTS version recommended)
2. **Power Apps CLI**: Download from [aka.ms/PowerAppsCLI](https://aka.ms/PowerAppsCLI)
3. **PowerPlatform ToolBox**: The tool is designed for PPTB environment

## Features Not Included

This tool provides a visual interface for PCF development but does NOT include:
- Direct code editing (use your preferred IDE)
- Visual Studio integration (use external tools)
- Direct deployment to environments (use PPTB deployment features)
- Property/resource management (edit manifest manually)

## Contributing

Contributions are welcome! When contributing:

1. Maintain PPTB-only integration patterns
2. Keep webview bundle browser-only (no Node.js dependencies)
3. Test in PowerPlatform ToolBox
4. Update documentation as needed
5. Follow existing code style

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](../../LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/Power-Maverick/PPTB-Tools/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Power-Maverick/PPTB-Tools/discussions)

## Reference

This tool is based on the PCF Custom Control Builder for XrmToolBox:
- Reference: [PCF-CustomControlBuilder](https://github.com/Power-Maverick/PCF-CustomControlBuilder)
- Adapted for PPTB with React + TypeScript + Vite stack
