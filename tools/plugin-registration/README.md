# Plugin Registration

Register and manage Microsoft Dataverse plugin assemblies, custom workflow activities, SDK message processing steps, service endpoints, and webhooks.

## Table of Contents

- [Plugin Registration](#plugin-registration)
    - [UI Preview](#ui-preview)
    - [Features](#features)
    - [Installation](#installation)
    - [Development](#development)
    - [Usage in ToolBox](#usage-in-toolbox)
    - [Key Concepts](#key-concepts)
        - [Plugin Assemblies](#plugin-assemblies)
        - [SDK Message Processing Steps](#sdk-message-processing-steps)
        - [Service Endpoints](#service-endpoints)
        - [Managed Identities](#managed-identities)
        - [Custom APIs](#custom-apis)
    - [Technical Stack](#technical-stack)
    - [Troubleshooting](#troubleshooting)
    - [Contributing](#contributing)
    - [License](#license)
    - [Support](#support)

## UI Preview

![Plugin Registration demo](/assets/pluginRegistration.gif)

## Features

- ✅ React 18 with TypeScript
- ✅ Vite for fast development and optimized builds
- ✅ Register, update, and unregister plugin assemblies
- ✅ Manage SDK Message Processing Steps with full configuration
- ✅ Step Images support (pre/post entity images)
- ✅ Enable/disable steps without removal
- ✅ Service Endpoint Management (9 contract types supported)
- ✅ Webhook management with multiple auth types
- ✅ Custom workflow activities support
- ✅ Hierarchical tree view UI for organization
- ✅ Plugins/Endpoints filtering and toggling
- ✅ Dark/light theme support
- ✅ Unsecure and Secure Config management
- ✅ Managed identities for plug-in assemblies and packages: link, create, edit and delete identities
- ✅ Custom APIs: create, edit and delete APIs with their request parameters and response properties

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

### Publishing

The [Publish Plugin Registration workflow](../../.github/workflows/publish-plugin-registration.yml) installs dependencies, builds, tests, and publishes `@power-maverick/tool-plugin-registration` publicly to npm when a pull request containing changes under `tools/plugin-registration/` is merged into `main`, or when manually dispatched on `main`. Update the package version before merging a release if that version already exists on npm.

To publish manually, open GitHub **Actions > Publish Plugin Registration > Run workflow**, select **main**, and click **Run workflow**. Manual runs on other branches skip the publish job.

Configure an npm trusted publisher for this package using the `Power-Maverick/PPTB-Tools` repository and the `publish-plugin-registration.yml` workflow filename. The workflow uses OIDC rather than a stored npm token.

Keep the top-level `repository.url` in [package.json](./package.json) set to `git+https://github.com/Power-Maverick/PPTB-Tools.git`, with `repository.directory` set to `tools/plugin-registration`. npm verifies this repository against GitHub Actions provenance; `configurations.repository` is separate PPTB metadata and does not satisfy that check. A missing or mismatched npm repository URL causes an `E422` provenance verification failure.

After correcting a failed release's metadata, merge a new pull request or manually dispatch the workflow on the updated `main` branch to publish the corrected package. Re-running the original failed workflow uses its original commit, not the updated manifest.

## Usage in ToolBox

1. Build the tool:

    ```bash
    npm run build
    ```

2. The built files will be in the `dist/` directory:
    - `index.html` - Main entry point
    - `index.js` - Bundled application
    - `index.css` - Compiled styles

3. Install the tool in Power Platform ToolBox through the UI

4. Use Plugin Registration:
    - Register plugin assemblies by uploading .dll files
    - Configure SDK Message Processing Steps
    - Register pre/post entity images
    - Manage service endpoints and webhooks
    - Enable/disable steps for testing

## Key Concepts

### Plugin Assemblies

Plugin assemblies are compiled .NET libraries (.dll files) that implement the Dataverse plugin interface. The tool allows you to:

- **Register**: Upload a new assembly from your development environment
- **Update**: Replace an existing assembly with a new version
- **Unregister**: Remove an assembly (and its components)
- **View Types**: See all plugin classes available in the assembly

### SDK Message Processing Steps

SDK Message Processing Steps (plugin steps) bind your plugin code to specific Dataverse messages and events:

- **Message**: The Dataverse operation (Create, Update, Delete, etc.)
- **Entity**: The table the message applies to
- **Stage**: Pre-operation (before the transaction) or Post-operation (after)
- **Execution Mode**: Synchronous or Asynchronous
- **Unsecure Config**: Non-sensitive configuration passed to the plugin
- **Secure Config**: Sensitive configuration (encrypted in Dataverse)

### Service Endpoints

Service Endpoints allow Dataverse to call external systems when events occur. Supported types:

- **REST**: HTTP POST to a custom endpoint
- **Webhook**: Secure webhook with authentication
- **Service Bus**: Azure Service Bus (One Way, Queue, Topic)
- **Event Hub**: Azure Event Hub
- **Event Grid**: Azure Event Grid

### Managed Identities

A managed identity lets a plug-in get tokens for Azure resources (Key Vault, Storage, your own APIs) through `IManagedIdentityService`, with no secrets to store. Select an assembly or package and choose **Managed Identity** to link an identity, or to create, edit or delete one.

- The option only appears when the environment has the `managedidentity` table.
- An assembly that is part of a plug-in package uses the package's identity, so the identity is set on the package.
- The assembly or package must be **signed with a certificate**; a strong name alone isn't enough. Dataverse refuses the link otherwise.
- The app registration or user-assigned managed identity in Entra ID needs a **federated credential** for each environment, because the credential subject contains the environment ID. Use a separate app registration per environment.
- New identities use **version 2**, which Microsoft recommends. Editing an identity can upgrade its version but not downgrade it.

See [Set up managed identity for Dataverse plug-ins](https://learn.microsoft.com/power-platform/admin/set-up-managed-identity).

### Custom APIs

A Custom API defines your own Dataverse message, with request parameters and response properties, and optionally a plug-in type that runs it. Choose **View → Custom APIs** to list every API with its request parameters and response properties beneath it. Expanding an API also lists the steps registered on its message. Choose **Register → New Custom API** to create one, or select an API, parameter or property and choose **Update** or **Unregister**.

- The view and the menu option only appear when the environment has the `customapi` table.
- A new API goes into the unmanaged solution you choose, or one you create from the dialog with **New solution…**. Its unique name must start with that solution's publisher prefix, which the dialog fills in for you. The API and its parameters and properties are created in one request, then each is added to the solution.
- Request parameters and response properties are edited in the same dialog as the API. Parameters and properties you add later join every unmanaged solution the API is already in.
- Dataverse fixes some fields at creation: the unique name, binding type, bound table, allowed step type, Is Function and Enabled for Workflow of the API, and the unique name, type, table and Is Optional of a parameter or property. These are read-only when editing. To change one, delete the record and create it again.
- **Enabled for Workflow** offers the API as a step in classic workflows. It can only be set when creating the API. Such an API can't be a function, and its parameters can't be Entity, EntityCollection or StringArray, or EntityReference unless the API is entity-bound.
- A managed API that doesn't allow customization keeps its existing fields, and new request parameters added to it must be optional. Managed APIs, parameters and properties can't be deleted here; remove them through their managed solution.
- Each change in an edit is saved on its own. If one fails, the API is reloaded, so check what was saved before trying again.
- To run code when the API is called, link a plug-in type, or register a step on the API's message from a plug-in type like any other message. Messages of private APIs are listed too.

See [Custom API tables](https://learn.microsoft.com/power-apps/developer/data-platform/custom-api-tables).

## Technical Stack

- **React 18** with TypeScript
- **Vite** for fast development and optimized production builds
- **Fluent UI React Components** for modern UI
- **PPTB API** for all Dataverse operations
- **@pptb/types** - PPTB type definitions

## Troubleshooting

### Assembly Upload Fails

**Issue**: Cannot upload or register plugin assembly

**Solution**:

- Verify .dll file is built against the correct Dataverse SDK version
- Check that you have appropriate Dataverse permissions
- Ensure assembly implements IPlugin correctly
- Try uploading a smaller/simpler assembly first

### Step Registration Issues

**Issue**: Cannot register SDK Message Processing Step

**Solution**:

- Verify plugin assembly is registered first
- Check that entity and message are valid
- Ensure you have permissions on the plugin table
- Verify stage selection (Pre vs Post operation)

### Service Endpoint Issues

**Issue**: Cannot register or test service endpoint

**Solution**:

- Verify endpoint URL is accessible and valid
- Check authentication credentials are correct
- Test endpoint availability manually first
- Review webhook logs for failed deliveries

### Permission Issues

**Issue**: Operations fail with permission error

**Solution**:

- Verify you have system administrator or plugin registration admin role
- Check connection context is correct
- Ensure target organization is accessible
- Verify solution context is correct

## Best Practices

1. **Version Control**: Maintain version numbers for plugin assemblies
2. **Test Environments**: Always test plugins thoroughly before production
3. **Configuration**: Use Secure Config for sensitive data (API keys, passwords)
4. **Error Handling**: Implement comprehensive error handling in plugins
5. **Logging**: Use plugin trace logs for debugging
6. **Step Order**: Configure step execution order carefully
7. **Filtering**: Use step filtering to optimize performance

## Contributing

Contributions are welcome! When contributing:

1. Maintain PPTB integration patterns
2. Keep webview bundle browser-only (no Node.js dependencies)
3. Test in Power Platform ToolBox
4. Update documentation as needed
5. Follow existing code style

## License

This project is licensed under the GPL-2.0 License - see the [LICENSE](../../LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/Power-Maverick/PPTB-Tools/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Power-Maverick/PPTB-Tools/discussions)

## Dataverse Entities Used

| Entity                                 | Purpose                                                  |
| -------------------------------------- | -------------------------------------------------------- |
| `pluginassembly`                       | Stores compiled assembly metadata and content            |
| `plugintype`                           | Stores plugin class information within an assembly       |
| `sdkmessageprocessingstep`             | Stores step configuration (message, entity, stage, mode) |
| `sdkmessageprocessingstepimage`        | Stores pre/post entity images for steps                  |
| `sdkmessage`                           | SDK messages (Create, Update, Delete, etc.)              |
| `sdkmessagefilter`                     | Entity-specific filters for messages                     |
| `serviceendpoint`                      | Stores webhook and Service Bus endpoint configuration    |
| `managedidentity`                      | Identity that plug-in assemblies and packages use for Azure tokens |
| `sdkmessageprocessingstepsecureconfig` | Stores secure configuration strings for steps            |

## Reference

- [Microsoft Plugin Registration Tool Docs](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in#about-the-plug-in-registration-tool)
- [PPTB Types Package](https://www.npmjs.com/package/@pptb/types)
