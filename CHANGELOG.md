# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Data Migrator: selectable sources and up to five destinations, repeated playlist combinations, destination-specific system mappings, and final migration confirmation.
- Initial monorepo structure with npm workspaces
- ERD Generator package (`@dvdt-tools/erd-generator`)
  - **VS Code WebView integration** - simple function call integration, no command registration needed
  - **Webpack-bundled architecture** - TypeScript webview code compiled to JavaScript with consistent naming
  - **Direct API access** - webview directly uses DataverseClient and ERDGenerator without postMessage overhead
  - **Self-contained WebView UI** - complete UI with modern dropdown controls
  - **Minimal integration design** - DVDT provides credentials, ERD tool handles everything else
  - **Modern UI** - dropdown solution selector, single-page experience
  - Support for Mermaid diagram format
  - Support for PlantUML diagram format
  - Support for Graphviz DOT format
  - Configurable attributes display (via UI checkbox)
  - Configurable relationships display (via UI checkbox)
  - Support for limiting attributes per table (via UI number input)
  - TypeScript types for Dataverse solutions, tables, attributes, and relationships
  - Automatic fetching of solutions, tables, attributes, and relationships
  - List available solutions from Dataverse
  - File saving and clipboard operations

### Fixed
- Content Security Policy (CSP) now includes `connect-src https:` to allow Dataverse API calls from webview
- Comprehensive documentation
  - VS Code WebView integration guide (VSCODE_INTEGRATION.md)
  - Local testing guide (LOCAL_TESTING.md)
  - Package documentation
- Contributing guidelines

### Changed
- Data Migrator: sticky error notifications, missing playlist connection warnings beside Start playlist, left-aligned preview/playlist actions, and consistent environment step headers.
- Data Migrator: made environment selection the first step, display actual linked connection counts, removed the large title banner, unified action styling, and kept playlist controls and entries together below configuration. PPTB connection events now invalidate stale previews and stop subsequent writes safely.
- Data Migrator: grouped configuration actions separately from playlist execution and entry editing; upgraded `@pptb/types` and minimum PPTB API to 1.2.7 with a two-to-six connection range.
- Simplified VS Code integration from command registration to direct function call
- Replaced solution cards with modern dropdown control
- Removed step-based UI for cleaner single-page experience
- Updated axios dependency to fix version

### Removed
- CLI tool (not needed for DVDT integration)
- Standalone web server (not needed for DVDT integration)
- Example files for standalone usage
- Express and nodemon dependencies
- `registerERDTool()` function (replaced with `showERDPanel()`)
- Step indicator UI components

## [1.0.0] - 2024-10-05

### Added
- Initial release
- Repository structure setup
- Basic README and LICENSE files
