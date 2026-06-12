# Plugin Registration

Register and manage Microsoft Dataverse plugin assemblies, custom workflow activities, SDK message processing steps, service endpoints, and webhooks. Exclusively for PPTB.

## Overview

The Plugin Registration tool brings the classic Microsoft Dataverse Plugin Registration Tool experience directly into Power Platform ToolBox. It allows developers to register, update, and unregister plugin assemblies and their associated components without leaving PPTB.

## Key Features

- **React + TypeScript**: Modern component-based architecture with Vite build system
- **PPTB-Only Integration**: Designed exclusively for Power Platform ToolBox (uses @pptb/types v1.0.20)
- **Plugin Assembly Management**: Register, update, and unregister plugin assemblies (.dll files)
- **Plugin Type Browsing**: View all plugin classes within each registered assembly
- **Step Registration**: Register and manage SDK Message Processing Steps with full configuration including Unsecure Config, Secure Config, and Supported Deployment
- **Step Images**: Register pre/post entity images for processing steps
- **Enable/Disable Steps**: Toggle step activation status without removing them
- **Service Endpoint Management**: Register and manage all 9 Dataverse contract types — One Way, Queue, REST, Two Way, Topic, Persistent Queue, Event Hub, Webhook, and Event Grid
- **Webhook Management**: Register webhooks with HttpHeader, WebhookKey, or HttpQueryString authentication
- **Endpoint Step Registration**: Register SDK message processing steps bound to service endpoints
- **Tree View UI**: Hierarchical view of assemblies → plugin types → steps → images, plus service endpoints and their steps
- **Plugins / Endpoints Filter**: Toolbar checkboxes to show or hide Plugins and Endpoints independently
- **Dark/Light Theme Support**: Follows PPTB theme settings automatically

## Use Cases

- Register custom plugin assemblies implementing `IPlugin`
- Set up SDK message processing steps on standard Dataverse messages (Create, Update, Delete, etc.)
- Configure pre/post entity images for plugin steps
- Register custom workflow activities
- Manage plugin step lifecycle (enable, disable, unregister)
- Update plugin assemblies when a new version is compiled
- Register webhooks and Azure Service Bus endpoints for event-driven integrations
- Attach SDK message processing steps to service endpoints (webhook/Service Bus triggers)
- Configure unsecure and secure configuration strings on plugin steps

## UI

The tool uses a split-panel layout:

- **Left panel**: Tree view of all registered assemblies, their plugin types, processing steps, and images — followed by service endpoints and their steps
- **Right panel**: Detailed information and action buttons for the selected item
- **Toolbar filter**: Checkboxes to show/hide Plugins and Endpoints sections independently

### Supported Actions

| Selected Item | Available Actions |
|---|---|
| Assembly | Update Assembly, Unregister Assembly |
| Plugin Type | Register Step |
| Processing Step | Register Image, Enable, Disable, Update Step, Unregister Step |
| Step Image | Update Image, Unregister Image |
| Service Endpoint / Webhook | Register Step, Update, Unregister, Save Description |
| Endpoint Step | Enable, Disable, Update Step, Unregister Step |

## Getting Started

### Prerequisites

- Power Platform ToolBox (PPTB) with an active Dataverse connection
- A compiled plugin assembly (.dll) built against the Dataverse SDK

### Building

```bash
cd tools/plugin-registration
npm install
npm run build
```

### Development

```bash
npm run dev
```

## Architecture

```
src/
├── components/
│   ├── PluginTree.tsx                    # Tree view component (plugins + endpoints)
│   ├── AssemblyDetails.tsx               # Assembly details & actions
│   ├── PluginTypeDetails.tsx             # Plugin type details
│   ├── StepDetails.tsx                   # Processing step details & actions
│   ├── ImageDetails.tsx                  # Step image details & actions
│   ├── ServiceEndpointDetails.tsx        # Service endpoint / webhook details & actions
│   ├── RegisterAssemblyDialog.tsx        # Register/update assembly dialog
│   ├── RegisterStepDialog.tsx            # Register/update step dialog (with config fields)
│   ├── RegisterImageDialog.tsx           # Register/update image dialog
│   ├── RegisterServiceEndpointDialog.tsx # Register/update service endpoint or webhook
│   └── RegisterEndpointStepDialog.tsx    # Register step bound to a service endpoint
├── models/
│   └── interfaces.ts           # TypeScript interfaces
├── utils/
│   └── DataverseClient.ts      # Dataverse API wrapper
├── App.tsx                     # Main application component
├── main.tsx                    # Entry point with theme support
└── styles.css                  # CSS with light/dark theme variables
```

## Dataverse Entities Used

| Entity | Purpose |
|---|---|
| `pluginassembly` | Stores compiled assembly metadata and content |
| `plugintype` | Stores plugin class information within an assembly |
| `sdkmessageprocessingstep` | Stores step configuration (message, entity, stage, mode) |
| `sdkmessageprocessingstepimage` | Stores pre/post entity images for steps |
| `sdkmessage` | SDK messages (Create, Update, Delete, etc.) |
| `sdkmessagefilter` | Entity-specific filters for messages |
| `serviceendpoint` | Stores webhook and Service Bus endpoint configuration |
| `sdkmessageprocessingstepsecureconfig` | Stores secure configuration strings for steps |

## Reference

- [Microsoft Plugin Registration Tool Docs](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in#about-the-plug-in-registration-tool)
- [PPTB Types Package](https://www.npmjs.com/package/@pptb/types)
