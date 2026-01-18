# Data Migrator

Migrate data from one Dataverse environment to another with intelligent auto-mapping and smart operations.

## Overview

The Data Migrator is a React-based tool designed exclusively for Power Platform ToolBox (PPTB) that enables seamless data transfer between Dataverse environments with advanced features:

- **Auto-Mapping**: Automatically map users, teams, and business units between environments
- **Smart Operations**: Choose between create, update, or upsert operations
- **Field Selection**: Select which fields to migrate
- **Lookup Handling**: Intelligent mapping of lookup fields and references
- **Progress Tracking**: Real-time progress monitoring with detailed status for each record
- **Batch Processing**: Efficient batch processing for large data sets

## Features

### Auto-Mapping

The tool automatically maps system entities between source and target environments:

- **Users**: Matched by domain name, email address, or full name
- **Teams**: Matched by name and team type
- **Business Units**: Matched by name

Each mapping includes a confidence level (high, medium, low) based on the matching criteria used.

### Smart Migration Operations

Choose the operation that fits your scenario:

- **Create**: Insert new records only (fails if record exists)
- **Update**: Update existing records by primary key (requires records to exist)
- **Upsert**: Smart operation that creates new records or updates existing ones

### Field and Lookup Management

- Select which fields to include in the migration
- Configure lookup field mapping strategies:
  - **Auto-Map**: Automatically map system entities (users, teams, business units)
  - **Skip**: Exclude the lookup field from migration

### Advanced Options

- **Filter Query**: Apply OData filters to select specific records
- **Batch Size**: Control batch size for optimal performance (1-1000 records per batch)

### Progress Tracking

Real-time monitoring with:

- Overall progress bar
- Statistics (total, successful, failed, skipped)
- Batch processing status
- Detailed record-by-record status with error messages

## Technical Stack

- **React 18** with TypeScript
- **Fluent UI React Components** for modern UI
- **Vite** for fast development and optimized builds
- **PPTB API** for all Dataverse operations
- **@pptb/types v1.0.16** - Latest PPTB type definitions

## Installation

This tool is distributed as part of the PPTB-Tools monorepo and can be installed in Power Platform ToolBox.

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Build

```bash
cd tools/data-migrator
npm install
npm run build
```

The build output will be in the `dist` directory.

## Usage in PPTB

1. **Install the tool** in Power Platform ToolBox
2. **Connect to your source environment** (primary connection)
3. **Select a secondary connection** as the target environment
4. **Open the Data Migrator tool**
5. The tool will display both connections:
   - Source (Primary): Your source environment
   - Target (Secondary): Your target environment
6. **Select an entity** to migrate
7. **Choose migration operation** (create, update, or upsert)
8. **Select fields** to include in the migration
9. **Configure lookup mappings**:
   - Click "Auto-Map System Entities" to automatically map users, teams, and business units
   - Review the auto-mapping results
10. **Set advanced options** (optional):
    - Add OData filter to select specific records
    - Adjust batch size if needed
11. **Start Migration** and monitor progress

## Important Notes

- **Secondary Connection Required**: This tool requires both a primary (source) and secondary (target) connection to be configured in PPTB
- **Source Environment**: Data is read from the primary connection
- **Target Environment**: Data is written to the secondary connection
- **Auto-Mapping**: Users, teams, and business units are mapped between source and target environments

## Use Cases

- **Environment Refresh**: Migrate configuration or transactional data after environment refresh
- **Dev to Test Migration**: Move test data from development to test environments
- **Cross-Tenant Migration**: Transfer data between different tenants with user/team mapping
- **Partial Data Migration**: Use filters to migrate specific records
- **Data Synchronization**: Keep data in sync between environments with upsert operations

## Architecture

### Components

- **App.tsx**: Main application component and state management
- **EntitySelector**: Entity selection dropdown
- **OperationSelector**: Migration operation selection
- **FieldSelector**: Field selection with bulk actions
- **LookupMapper**: Lookup field mapping configuration
- **MigrationProgress**: Real-time progress display
- **AutoMappingPanel**: Auto-mapping results modal

### Utilities

- **DataverseClient**: Handles all Dataverse API interactions via PPTB API
- **MigrationEngine**: Core migration logic with auto-mapping and transformation

## Design Philosophy

The UI follows a **modern minimalist approach**:

- No header or unnecessary chrome
- Compact layout to minimize scrolling
- Clear visual hierarchy
- Progressive disclosure (options appear as needed)
- Real-time feedback
- Clean, professional appearance

## Reference

This tool is inspired by [Colso.Xrm.DataTransporter](https://github.com/bcolpaert/Colso.Xrm.DataTransporter) with enhancements for modern React, PPTB integration, and improved user experience.

## Limitations

- Primary key-based operations only (for update and upsert)
- Lookup auto-mapping limited to system entities (users, teams, business units)
- Requires same metadata schema in source and target environments
- Large data sets may take time to migrate (monitor batch progress)

## Best Practices

1. **Test First**: Always test with a small data set first
2. **Use Filters**: Use OData filters to migrate specific records
3. **Check Mappings**: Review auto-mapping results before starting migration
4. **Monitor Progress**: Watch for errors during migration
5. **Backup Data**: Always backup target environment before migration
6. **Same Metadata**: Ensure source and target have matching entity/field schemas

## Troubleshooting

### Migration Fails

- Check that target environment has the same entity/field structure
- Verify required fields have values
- Review error messages in the progress panel

### Lookup Mapping Issues

- Run auto-mapping before starting migration
- Verify users/teams/business units exist in target environment
- Check that names match between environments

### Performance Issues

- Reduce batch size for better stability
- Use filters to migrate fewer records at once
- Check network connectivity

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](../../LICENSE) file for details.

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/Power-Maverick/PPTB-Tools).
