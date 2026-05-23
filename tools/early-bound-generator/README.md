# Early Bound Generator

Generate strongly-typed C# early-bound classes for Microsoft Dataverse entities, option sets, and messages directly inside Power Platform ToolBox.

## Overview

The Early Bound Generator is a PPTB port of the popular [EarlyBoundGeneratorV2](https://github.com/daryllabar/DLaB.Xrm.XrmToolBoxTools) XrmToolBox plugin by Daryl LaBar. It reads metadata from your active Dataverse connection and generates C# classes compatible with the `Microsoft.Xrm.Sdk` and `Microsoft.PowerPlatform.Dataverse.Client` libraries.

Unlike the original XrmToolBox plugin, **code generation is implemented entirely in TypeScript and runs inside PPTB** — no PAC CLI, no .NET runtime, and no `pac modelbuilder build` invocation is required. The generated output is designed to be fully backwards compatible with EarlyBoundGeneratorV2.

## Key Features

- **Entity classes** — strongly-typed C# classes for Dataverse entities with attributes, relationships, and option set enums
- **Option set enums** — C# enums for all local and global option sets, state codes, and status reasons
- **Service context** — a typed `OrganizationServiceContext` subclass for LINQ queries
- **Message classes** — request/response pairs for SDK messages, custom APIs, and actions
- **DLaB.ModelBuilderExtensions compatible** — settings file is the same XML format used by XrmToolBox EarlyBoundGeneratorV2
- **CamelCase naming** — full CamelCaser port including built-in dictionary and custom word support
- **Whitelist / blacklist filtering** — entity, attribute, prefix, and message filters
- **Dark/Light theme support** — follows PPTB theme settings automatically

## Getting Started

### Prerequisites

- Power Platform ToolBox with an active Dataverse connection
- An output directory where the generated `.cs` files will be written

### Basic Usage

1. Click **Open Settings** to browse to an existing `settings.xml` file, or select a folder to create a new one
2. Configure the output directory under **Global → Output Relative Directory**
3. Select the entities to generate under **Entities → Entities Whitelist**
4. Click **Generate**

## Settings

Settings are stored in a `settings.xml` file on disk, using the same format as XrmToolBox EarlyBoundGeneratorV2. Existing settings files from XrmToolBox can be opened directly.

### Global

| Setting | Description |
|---|---|
| Namespace | C# namespace for all generated classes |
| Service Context Name | Class name for the generated `OrganizationServiceContext` subclass |
| Output Relative Directory | Path to write generated files, relative to the settings file |
| Suppress Generated Code Attribute | Omit `[GeneratedCode]` attributes from generated classes |
| Remove Runtime Version Comment | Strip the runtime version comment from file headers |
| CamelCase Class Names | Apply CamelCase transformation to entity class names |
| CamelCase Member Names | Apply CamelCase transformation to attribute and property names |
| Token Capitalisation Overrides | Words that override the dictionary for CamelCase capitalisation |

### Entities

| Setting | Description |
|---|---|
| Entities Whitelist | Only generate classes for these entities (logical names) |
| Entities To Skip | Exclude these entities even if they match the whitelist |
| Entity Prefixes Whitelist | Include all entities whose logical name starts with these prefixes |
| Create One File Per Entity | Write one `.cs` file per entity; otherwise combine into a single file |
| Generate Attribute Name Consts | Emit a `Fields` inner class with `const string` attribute name constants |
| Generate Entity Relationships | Emit relationship navigation properties |
| Emit Virtual Attributes | Include virtual (formatted value) attributes |
| Obsolete Deprecated | Mark deprecated attributes with `[ObsoleteAttribute]` |

### Option Sets

| Setting | Description |
|---|---|
| Create One File Per Option Set | Write one `.cs` file per enum; otherwise combine into a single file |
| Generate Global Option Sets | Include global (solution-level) option sets |
| Adjust Casing For Enum Options | Apply CamelCase to enum member names |
| Local Option Set Format | Format string for local option set enum names (`{0}` = entity, `{1}` = attribute) |

### Messages

| Setting | Description |
|---|---|
| Generate Messages | Generate request/response classes for SDK messages |
| Messages Whitelist | Only generate classes for these message names |
| Messages To Skip | Exclude these messages even if they match the whitelist |
| Create One File Per Message | Write one `.cs` file per message; otherwise combine |
| Group Message Request With Response | Emit request and response in the same file |

### Service Classes

These values are saved to the settings file for compatibility with XrmToolBox EarlyBoundGeneratorV2 but have no effect on code generation in PPTB, which implements generation directly without invoking PAC CLI.

## Output Structure

With default settings and a whitelist of `[contact, account]`:

```
<OutputDirectory>/
  Entities/
    Account.cs
    Contact.cs
  OptionSets/
    Account_AccountCategoryCode.cs
    Account_AccountClassificationCode.cs
    Contact_GenderCode.cs
    ...
  DataverseContext.cs
```

## Generation Log

The Output panel shows a structured log during generation:

```
=== Early Bound Generator ===
Loading dictionary...
Fetching entity list...
Fetching metadata for 2 entities...
	[account] attrs=298 withOptions=30
	[contact] attrs=387 withOptions=30
	Fetched 2 / 2
--- Entities (2) ---
	Code written to .../Entities/Account.cs.
	Code written to .../Entities/Contact.cs.
--- Option Sets (64) ---
	Code written to .../OptionSets/Account_AccountCategoryCode.cs.
	...
--- Service Context ---
	Code written to .../DataverseContext.cs.
=== Generation Complete ===
```

## Building

```bash
cd tools/early-bound-generator
npm install
npm run build
```

## Development

```bash
npm run dev
```

## Architecture

```
src/
├── codegen/
│   ├── camelCaser.ts         # CamelCase name transformation (full DLaB port)
│   ├── contextGenerator.ts   # OrganizationServiceContext class generation
│   ├── entityGenerator.ts    # Entity class generation
│   ├── filters.ts            # Entity, attribute, and message filter logic
│   ├── helpers.ts            # Shared codegen utilities (indents, headers, etc.)
│   ├── messageGenerator.ts   # SDK message request/response generation
│   ├── naming.ts             # NamingService (class/member/enum name resolution)
│   ├── optionSetGenerator.ts # Option set enum generation
│   ├── orchestrator.ts       # Generation coordinator — fetches metadata and writes files
│   └── types.ts              # Metadata type definitions
├── components/
│   ├── BoolSettingRow.tsx    # Checkbox setting row
│   ├── EntityAttributeEditor.tsx  # Two-level entity → attributes editor
│   ├── EntityPickerDialog.tsx     # Entity selection dialog
│   ├── KeyValueEditor.tsx         # Key/value pair editor
│   ├── PathInput.tsx              # File/folder path input with Browse button
│   ├── PropertySection.tsx        # Collapsible settings section
│   ├── SettingRow.tsx             # Single labelled setting row
│   ├── SettingsToolbar.tsx        # Top toolbar (Generate, Open, Save)
│   ├── StringListEditor.tsx       # Editable string list
│   └── TerminalPanel.tsx          # Generation output panel
├── models/
│   └── interfaces.ts         # EbgSettings interface and DEFAULT_SETTINGS
├── utils/
│   ├── builderSettingsBuilder.ts  # Builds builderSettings.json object
│   ├── DataverseClient.ts         # Dataverse entity metadata fetcher
│   ├── getErrorMessage.ts         # Error message extraction utility
│   ├── pathUtils.ts               # Path join and dirname utilities
│   └── xmlSerializer.ts           # Settings XML serialisation / deserialisation
├── App.tsx                   # Main application component
├── main.tsx                  # Entry point with theme support
└── styles.css                # CSS with light/dark theme variables
```

## Dataverse Entities Used

| Entity | Purpose |
|---|---|
| Entity metadata API | Fetch entity and attribute definitions |
| `sdkmessage` | Enumerate available SDK messages |
| `sdkmessagefilter` | Entity-scoped message filters |
| `sdkmessagepair` | Request/response message pair definitions |
| `sdkmessagerequest` | Message request field definitions |
| `sdkmessageresponse` | Message response field definitions |

## Compatibility

Generated code targets the same output as XrmToolBox EarlyBoundGeneratorV2 with `DLaB.ModelBuilderExtensions`. Settings files (`.xml`) are fully interchangeable between the two tools.

## Reference

- [EarlyBoundGeneratorV2 (XrmToolBox)](https://github.com/daryllabar/DLaB.Xrm.XrmToolBoxTools)
- [DLaB.ModelBuilderExtensions](https://www.nuget.org/packages/DLaB.ModelBuilderExtensions)
- [PPTB Types Package](https://www.npmjs.com/package/@pptb/types)
- [Microsoft Dataverse SDK](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/org-service/overview)
