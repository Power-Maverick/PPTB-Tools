# View Layout Copier

A Power Platform ToolBox (PPTB) tool that allows you to copy layout from one view to multiple views of the same entity in a single operation.

## Overview

View Layout Copier simplifies the process of maintaining consistent view layouts across multiple views in Dataverse. Instead of manually editing each view's layout, you can select a source view and copy its layout to multiple target views at once.

## Features

- **Entity Selection**: Browse and select from all available Dataverse entities
- **View Management**: View all system views for the selected entity
- **Layout Copying**: Copy the layout from one view to multiple other views
- **Real-time Progress**: See the status of each view update in real-time
- **Error Handling**: Clear feedback on success and failure for each view update

## How to Use

1. **Select Entity**: Choose the entity whose views you want to work with
2. **Select Source View**: Pick the view whose layout you want to copy
3. **Select Target Views**: Choose one or more views to apply the layout to
4. **Copy**: Click the "Copy Layout" button to apply the changes

## Technical Details

- **Built with**: React 18 + TypeScript + Vite
- **PPTB Integration**: Uses the latest @pptb/types (v1.0.12)
- **Dataverse API**: Leverages Dataverse Web API for all operations

## Installation

This tool is designed to be installed through Power Platform ToolBox. Follow the PPTB documentation for installing tools.

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## License

GPL-2.0

## Author

Power Maverick

## Reference

## Reference

This tool is inspired by the [XrmToolBox View Layout Replicator](https://github.com/MscrmTools/MsCrmTools.ViewLayoutReplicator) by MscrmTools.
