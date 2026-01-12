# Dataverse Trace Analyzer

Analyze and view Plugin Trace Logs from Microsoft Dataverse. Modern React-based tool for Power Platform ToolBox (PPTB).

## Overview

The Dataverse Trace Analyzer is a powerful tool that helps developers and administrators investigate plugin execution traces in Microsoft Dataverse environments. It provides a clean, minimalist interface to view, filter, and analyze plugin trace logs.

## Features

- **View Plugin Trace Logs**: Browse all plugin trace logs from your Dataverse environment
- **Smart Filtering**: Filter logs by message name, entity, correlation ID, or show only exceptions
- **Detailed View**: Inspect complete trace details including:
  - Plugin/step name
  - Message and entity information
  - Execution duration
  - Message block content
  - Exception details (when available)
  - Correlation ID for tracking related operations
- **Delete Logs**: Remove individual trace logs when no longer needed
- **Modern UI**: Clean, minimalist design with no header and optimized for minimal scrolling
- **Real-time Data**: Refresh to get the latest trace logs from your environment

## PPTB Integration

This tool is designed exclusively for Power Platform ToolBox and uses the `@pptb/types` package for seamless integration.

### APIs Used

- `window.toolboxAPI.connections.getActiveConnection()` - Get active Dataverse connection
- `window.toolboxAPI.utils.showNotification()` - Display notifications to users
- `window.dataverseAPI.queryData()` - Query plugin trace logs
- `window.dataverseAPI.retrieve()` - Get detailed trace log information
- `window.dataverseAPI.delete()` - Delete trace logs

## Installation

```bash
npm install
```

## Development

Run in development mode with hot reload:

```bash
npm run dev
```

## Build

Build for production:

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

1. Open the tool in Power Platform ToolBox
2. Connect to your Dataverse environment
3. The tool will automatically load the latest 100 trace logs
4. Use the filter controls to narrow down results:
   - Enter message name (e.g., "Create", "Update")
   - Enter entity name (e.g., "account", "contact")
   - Enter correlation ID to find related operations
   - Check "Exceptions Only" to see only failed executions
5. Click "Refresh" to update the log list
6. Click on any log item to view full details
7. Use the "Delete" button to remove unwanted logs

## Key Concepts

### Plugin Trace Logs

Plugin Trace Logs (`plugintracelog` entity) are records created by Dataverse when plugin tracing is enabled. They capture:
- Plugin or custom workflow activity execution details
- Performance metrics (execution duration)
- Message block content
- Exception information when errors occur
- Context information (depth, correlation ID, operation type)

### Correlation ID

A unique identifier that links related plugin executions together, helping you trace the full sequence of operations triggered by a single user action.

## Technical Details

- **React 18**: Modern functional components with hooks
- **TypeScript**: Full type safety
- **Vite**: Fast development and optimized production builds
- **@pptb/types v1.0.13**: Latest PPTB type definitions

## License

GPL-2.0
