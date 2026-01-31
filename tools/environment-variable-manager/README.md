# Environment Variable Manager

Manage environment variables default and per-environment values in Microsoft Dataverse. Modern React-based tool for Power Platform ToolBox (PPTB).

## Overview

The Environment Variable Manager is a powerful tool that helps administrators and developers manage environment variables in Microsoft Dataverse environments. It provides a clean, minimalist interface to view, create, edit, and delete environment variables, with support for both default values and environment-specific overrides.

## Features

- **View All Variables**: Browse all environment variables from your Dataverse environment
- **Search & Filter**: Quickly find variables by name, schema, description, or value
- **Create New Variables**: Create new environment variable definitions with schema name, display name, type, default value, and description
- **Edit Values**: Update both default values (used across all environments) and environment-specific values (override defaults for specific environments)
- **Type Support**: Full support for String, Number, Boolean, JSON, and Data Source types
- **Delete Variables**: Remove environment variables when no longer needed
- **Visual Indicators**: Clear badges showing which variables have environment-specific overrides
- **Modern Minimalist UI**: Clean design with no header and optimized for minimal scrolling and whitespace

## PPTB Integration

This tool is designed exclusively for Power Platform ToolBox and uses the `@pptb/types` package (v1.0.17) for seamless integration.

### APIs Used

- `window.toolboxAPI.connections.getActiveConnection()` - Get active Dataverse connection
- `window.toolboxAPI.utils.showNotification()` - Display notifications to users
- `window.dataverseAPI.queryData()` - Query environment variables
- `window.dataverseAPI.create()` - Create new variables
- `window.dataverseAPI.update()` - Update existing variables
- `window.dataverseAPI.delete()` - Delete variables

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
3. The tool will automatically load all environment variables
4. Use the search bar to filter variables by name, schema, description, or value
5. Click on any variable to edit its values
6. Choose whether to edit the **Default Value** (applies to all environments) or **Environment Value** (overrides default for current environment)
7. Click "New Variable" to create a new environment variable definition
8. Click the delete button (🗑️) on any variable to remove it

## Key Concepts

### Environment Variable Definition

The definition (`environmentvariabledefinition` entity) contains:
- **Schema Name**: The unique identifier used in code (e.g., `new_ApiUrl`)
- **Display Name**: Human-friendly name shown in UI
- **Type**: String, Number, Boolean, JSON, or Data Source
- **Default Value**: Value used across all environments unless overridden
- **Description**: Optional documentation

### Environment Variable Value

The value (`environmentvariablevalue` entity) contains environment-specific overrides:
- **Value**: The environment-specific value that overrides the default
- Links to a specific environment variable definition

### Current Value

The "current value" for a variable is:
- The **environment-specific value** if one exists (indicated by 🔧 badge)
- Otherwise, the **default value** from the definition

## Use Cases

- **Environment Configuration**: Manage different API endpoints, URLs, or settings across Dev, Test, and Prod environments
- **Feature Flags**: Control feature availability using Boolean variables
- **Integration Settings**: Store API keys, connection strings, or other integration configuration
- **Application Settings**: Centralize application configuration that may differ per environment
- **JSON Configuration**: Store complex configuration objects using JSON type variables

## Technical Details

- **React 18**: Modern functional components with hooks
- **TypeScript**: Full type safety
- **Vite**: Fast development and optimized production builds
- **Fluent UI**: Microsoft's design system for consistent UI
- **@pptb/types v1.0.17**: Latest PPTB type definitions

## Reference

This tool is inspired by [MscrmTools.EnvironmentVariableManager](https://github.com/MscrmTools/MscrmTools.EnvironmentVariableManager) by MscrmTools.

## License

GPL-2.0

## Author

Power Maverick - [GitHub](https://github.com/Power-Maverick)
