# Solution Dependency Analyzer

A powerful tool for analyzing and visualizing Dataverse solution dependencies with circular dependency detection and comprehensive reporting capabilities.

## Features

### 🔍 Comprehensive Analysis
- Scans all solution components (entities, forms, views, plugins, workflows, web resources, apps)
- Identifies direct and indirect dependencies
- Detects circular dependency chains
- Highlights missing references

### 📊 Multiple Visualization Modes
- **Tree View**: List-based view with quick filtering and search
- **Graph View**: Interactive hierarchical radial layout visualization
- **Summary Report**: Statistical overview with detailed metrics

### 📈 Advanced Reporting
- Component type breakdown with visual bars
- Most connected components analysis
- Complexity scoring algorithm
- Circular dependency chain details
- Missing reference tracking

### 💾 Export Capabilities
- CSV export for spreadsheet analysis
- JSON export with complete metadata
- Includes all dependencies, links, and circular chains

## Usage

### 1. Solution Selection
- Select a solution from the dropdown (filters available for managed/unmanaged)
- View solution metadata including publisher and description
- Click "Analyze Dependencies" to start scanning

### 2. View Modes

#### Tree View
- Browse components as a searchable list
- Each item shows dependency count and circular dependency indicators
- Click any component to see detailed information
- Use search and type filters to narrow results

#### Graph View
- Interactive hierarchical radial layout
- Root components (no dependencies) at center
- Each layer represents dependency depth
- Pan and zoom controls for navigation
- Click nodes to view details
- Color-coded by component type and status:
  - Purple: Entities
  - Cyan: Forms  
  - Blue: Views
  - Red: Components with circular dependencies
  - Orange: Missing references

#### Summary Report
- Statistical overview cards
- Component type distribution
- Top 5 most connected components
- Circular dependency chains
- Missing references list
- Export options (CSV/JSON)

### 3. Filtering & Search
- **Search**: Filter by component name or logical name
- **Type Filter**: Show specific component types only
- Real-time filtering across all views

### 4. Component Details
- Click any component to view:
  - Full name and type
  - Logical identifier
  - List of dependencies (components it depends on)
  - Dependent by (components that depend on it)
  - Circular dependency status and chain

### 5. Exporting Results

#### CSV Export
Includes columns:
- Asset ID
- Name
- Type
- Logical Name
- Dependencies count
- Dependent By count
- Has Circular Ref
- Not Found status

#### JSON Export
Complete analysis data including:
- Solution metadata
- Full asset details with IDs
- All dependency links
- Circular dependency chains
- Statistical summary

## Component Type Mapping

The analyzer recognizes these Dataverse component types:

| Type Code | Component Type | Icon |
|-----------|---------------|------|
| 1 | Entity | 📦 |
| 60 | Form | 📝 |
| 26 | View | 👁️ |
| 90 | Plugin | 🔌 |
| 61 | Web Resource | 🌐 |
| 29 | Workflow | ⚡ |
| 80 | App | 📱 |

## Understanding Complexity Score

The complexity score helps assess solution maintainability:

**Calculation**: `(Average Dependencies × 10) + (Circular Dependencies × 10)`

- **0-50**: Low complexity, well-structured
- **51-100**: Moderate complexity, manageable
- **101-200**: High complexity, needs attention
- **200+**: Very high complexity, refactoring recommended

## Circular Dependencies

⚠️ **Important**: Circular dependencies can cause:
- Deployment issues
- Unexpected behavior
- Maintenance difficulties
- Solution import failures

When detected, the tool shows:
- Number of circular chains
- Complete dependency paths for each chain
- Affected components highlighted in red

## Technical Details

### Dependency Extraction

**Forms**: Extracts library dependencies from FormXML
```xml
<Library name="new_library" />
```

**Views**: Extracts entity dependencies from FetchXML
```xml
<entity name="account" />
```

**Other Components**: Parses metadata relationships

### Layout Algorithm

The graph uses a hierarchical radial sunburst layout:
1. Identifies root nodes (no incoming dependencies)
2. Performs BFS layering from roots
3. Positions each layer in concentric circles
4. Distributes nodes evenly around each circle
5. Handles orphaned components by placing at center

### Circular Detection

Uses Tarjan's algorithm variant:
- Depth-first traversal with active path tracking
- Detects back edges indicating cycles
- Extracts complete cycle paths
- Marks all affected components

## Integration

This tool integrates with Power Platform Toolbox (PPTB) and uses:
- `window.toolboxAPI` for connection management
- `window.dataverseAPI` for Dataverse queries
- Native file save and notification APIs

## Best Practices

1. **Before Export**: Always analyze managed solutions before exporting to identify issues
2. **Circular Dependencies**: Address circular dependencies before moving to production
3. **Missing References**: Investigate missing references as they may cause runtime errors
4. **Regular Analysis**: Run analysis after major changes to track complexity growth
5. **Documentation**: Export JSON for historical tracking and documentation

## Troubleshooting

### No Components Found
- Ensure solution contains components
- Check solution is visible (not hidden)
- Verify connection to correct environment

### Missing Dependencies
- Some dependencies may be in other solutions
- System components may not be included
- Check if referenced components exist

### Graph Performance
- Large solutions (500+ components) may be slow
- Use filters to reduce visible components
- Tree view recommended for very large solutions

## Version History

### 1.0.0
- Initial release
- Multi-view interface (Tree, Graph, Summary)
- Circular dependency detection
- CSV/JSON export
- Interactive hierarchical radial graph
- Comprehensive statistics and reporting

## License

GPL-2.0

## Contributing

Contributions welcome! Please submit issues and pull requests to the GitHub repository.

## Credits

Developed by Power Maverick for the Power Platform community.
