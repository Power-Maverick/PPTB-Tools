import type { ManagedIdentity, ManagedIdentityInput, PluginAssembly, PluginPackage, PluginType, ProcessingStep, SdkMessage, SdkMessageFilter, SolutionOption, StepImage, ServiceEndpoint } from "../models/interfaces";
import { MI_CREDENTIAL_SOURCE_MANAGED } from "../models/interfaces";

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate that a string is a Dataverse-format GUID (case-insensitive hex, hyphenated, no braces). */
function isGuid(value: string): boolean {
  return GUID_REGEX.test(value);
}

/** Build the @odata.bind value for the pluginpackages collection. Validates the GUID first. */
function buildPackageBind(packageId: string): string {
  if (!isGuid(packageId)) {
    throw new Error(`Invalid package ID: "${packageId}"`);
  }
  return `/pluginpackages(${packageId})`;
}

/** Build the @odata.bind value for the managedidentities collection. Validates the GUID first. */
function buildManagedIdentityBind(identityId: string): string {
  if (!isGuid(identityId)) {
    throw new Error(`Invalid managed identity ID: "${identityId}"`);
  }
  return `/managedidentities(${identityId})`;
}

/**
 * Display label for a managed identity. Identities created through the Web API (as in Microsoft's
 * setup steps) often have no name, so fall back to a label built from the application ID.
 */
export function managedIdentityLabel(identity: { name?: string | null; applicationid?: string | null }): string {
  const name = identity.name?.trim();
  if (name) return name;
  return identity.applicationid ? `(No name) App ID ${identity.applicationid}` : "(No name)";
}

const MANAGED_IDENTITY_SELECT ="managedidentityid,name,applicationid,tenantid,subjectscope,version,credentialsource";

function toManagedIdentity(m: Record<string, unknown>): ManagedIdentity {
  return {
    managedidentityid: m["managedidentityid"] as string,
    name: (m["name"] as string) ?? "",
    applicationid: (m["applicationid"] as string) ?? "",
    tenantid: (m["tenantid"] as string) ?? "",
    subjectscope: (m["subjectscope"] as number) ?? 1,
    version: m["version"] != null ? (m["version"] as number) : null,
    credentialsource: m["credentialsource"] != null ? (m["credentialsource"] as number) : undefined,
  };
}

export class DataverseClient {
  /**
   * @param withManagedIdentity Also read the managed identity lookup. Only pass true when
   * {@link isManagedIdentitySupported} said so, or the query fails on the missing column.
   */
  async fetchAssemblies(withManagedIdentity = false): Promise<PluginAssembly[]> {
    try {
      const identityColumn = withManagedIdentity ? ",_managedidentityid_value" : "";
      const response = await window.dataverseAPI.queryData(
        `pluginassemblies?$select=pluginassemblyid,name,version,culture,publickeytoken,sourcetype,isolationmode,description,_packageid_value${identityColumn},createdon,modifiedon&$orderby=name`,
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map((a) => ({
        pluginassemblyid: a["pluginassemblyid"] as string,
        name: a["name"] as string,
        version: a["version"] as string,
        culture: a["culture"] as string,
        publickeytoken: a["publickeytoken"] as string,
        sourcetype: a["sourcetype"] as number,
        isolationmode: a["isolationmode"] as number,
        description: (a["description"] as string) ?? "",
        _packageid_value: (a["_packageid_value"] as string) ?? undefined,
        _managedidentityid_value: (a["_managedidentityid_value"] as string) ?? undefined,
        createdon: a["createdon"] as string | undefined,
        modifiedon: a["modifiedon"] as string | undefined,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch assemblies: ${msg}`);
    }
  }

  async fetchPluginTypes(assemblyId: string): Promise<PluginType[]> {
    try {
      const response = await window.dataverseAPI.queryData(
        `plugintypes?$select=plugintypeid,name,typename,friendlyname,description,isworkflowactivity,workflowactivitygroupname,createdon,modifiedon&$filter=_pluginassemblyid_value eq '${assemblyId}'&$orderby=typename`,
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map((t) => ({
        plugintypeid: t["plugintypeid"] as string,
        name: t["name"] as string,
        typename: t["typename"] as string,
        friendlyname: (t["friendlyname"] as string) ?? "",
        description: (t["description"] as string) ?? "",
        isworkflowactivity: (t["isworkflowactivity"] as boolean) ?? false,
        workflowactivitygroupname: (t["workflowactivitygroupname"] as string) ?? "",
        pluginassemblyid: assemblyId,
        assemblyname: "",
        createdon: t["createdon"] as string | undefined,
        modifiedon: t["modifiedon"] as string | undefined,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch plugin types: ${msg}`);
    }
  }

  async fetchSteps(pluginTypeId: string): Promise<ProcessingStep[]> {
    try {
      const response = await window.dataverseAPI.queryData(
        `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,description,rank,mode,stage,filteringattributes,asyncautodelete,statecode,_impersonatinguserid_value,_sdkmessageid_value,_sdkmessagefilterid_value,configuration,_sdkmessageprocessingstepsecureconfigid_value,supporteddeployment&$filter=_eventhandler_value eq '${pluginTypeId}'&$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=name`,
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map((s) => {
        const msgExpand = s["sdkmessageid"] as Record<string, unknown> | null;
        const filterExpand = s["sdkmessagefilterid"] as Record<string, unknown> | null;
        return {
          sdkmessageprocessingstepid: s["sdkmessageprocessingstepid"] as string,
          name: s["name"] as string,
          description: (s["description"] as string) ?? "",
          rank: (s["rank"] as number) ?? 1,
          mode: (s["mode"] as number) ?? 0,
          stage: (s["stage"] as number) ?? 40,
          sdkmessageid: (s["_sdkmessageid_value"] as string) ?? "",
          messageName: (msgExpand?.["name"] as string) ?? "",
          sdkmessagefilterid: (s["_sdkmessagefilterid_value"] as string) ?? "",
          primaryEntityName: (filterExpand?.["primaryobjecttypecode"] as string) ?? "none",
          filteringattributes: (s["filteringattributes"] as string) ?? "",
          asyncautodelete: (s["asyncautodelete"] as boolean) ?? false,
          statecode: (s["statecode"] as number) ?? 0,
          plugintypeid: pluginTypeId,
          impersonatinguserid: (s["_impersonatinguserid_value"] as string) ?? undefined,
          configuration: (s["configuration"] as string) ?? undefined,
          secureconfigid: (s["_sdkmessageprocessingstepsecureconfigid_value"] as string) ?? undefined,
          supporteddeployment: s["supporteddeployment"] != null ? (s["supporteddeployment"] as number) : undefined,
        };
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch steps: ${msg}`);
    }
  }

  async fetchImages(stepId: string): Promise<StepImage[]> {
    try {
      const response = await window.dataverseAPI.queryData(
        `sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,name,entityalias,imagetype,messagepropertyname,attributes,description&$filter=_sdkmessageprocessingstepid_value eq '${stepId}'&$orderby=name`,
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map((i) => ({
        sdkmessageprocessingstepimageid: i["sdkmessageprocessingstepimageid"] as string,
        name: i["name"] as string,
        entityalias: i["entityalias"] as string,
        imagetype: i["imagetype"] as number,
        messagepropertyname: (i["messagepropertyname"] as string) ?? "Target",
        attributes: (i["attributes"] as string) ?? "",
        sdkmessageprocessingstepid: stepId,
        description: (i["description"] as string) ?? "",
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch images: ${msg}`);
    }
  }

  async fetchMessages(): Promise<SdkMessage[]> {
    try {
      const response = await window.dataverseAPI.queryData("sdkmessages?$select=sdkmessageid,name&$orderby=name");
      return (response.value as Record<string, unknown>[]).map((m) => ({
        sdkmessageid: m["sdkmessageid"] as string,
        name: m["name"] as string,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch messages: ${msg}`);
    }
  }

  async fetchMessageFilters(messageId: string): Promise<SdkMessageFilter[]> {
    try {
      const response = await window.dataverseAPI.queryData(
        `sdkmessagefilters?$select=sdkmessagefilterid,primaryobjecttypecode&$filter=_sdkmessageid_value eq '${messageId}'&$orderby=primaryobjecttypecode`,
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map((f) => ({
        sdkmessagefilterid: f["sdkmessagefilterid"] as string,
        sdkmessageid: messageId,
        primaryobjecttypecode: f["primaryobjecttypecode"] as string,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch message filters: ${msg}`);
    }
  }

  async fetchEntityAttributes(entityName: string): Promise<Array<{ logicalName: string; displayName: string }>> {
    // Validate to prevent injection — entity logical names are alphanumeric + underscore
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(entityName)) {
      throw new Error(`Invalid entity name: "${entityName}"`);
    }
    try {
      const response = await window.dataverseAPI.queryData(
        `EntityDefinitions(LogicalName='${entityName}')/Attributes?$select=LogicalName,DisplayName,AttributeType&$orderby=LogicalName`,
        "primary",
      );
      return (response.value as Record<string, unknown>[])
        .filter((a) => (a["AttributeType"] as string) !== "Virtual")
        .map((a) => {
          const dn = a["DisplayName"] as Record<string, unknown> | null;
          const label = (dn?.["UserLocalizedLabel"] as Record<string, unknown> | null)?.["Label"] as string | undefined;
          return {
            logicalName: (a["LogicalName"] as string) ?? "",
            displayName: label ?? "",
          };
        });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch entity attributes: ${msg}`);
    }
  }

  async fetchSystemUsers(search: string): Promise<import("../models/interfaces").SystemUser[]> {
    // Escape single quotes to prevent OData injection
    const safeSearch = search.replace(/'/g, "''").substring(0, 100);
    let filter = "isdisabled eq false";
    if (safeSearch) {
      filter += ` and contains(fullname,'${safeSearch}')`;
    }
    try {
      const response = await window.dataverseAPI.queryData(`systemusers?$select=systemuserid,fullname,domainname&$filter=${filter}&$orderby=fullname&$top=100`);
      return (response.value as Record<string, unknown>[]).map((u) => ({
        systemuserid: u["systemuserid"] as string,
        fullname: (u["fullname"] as string) ?? "",
        domainname: (u["domainname"] as string) ?? "",
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch system users: ${msg}`);
    }
  }

  async fetchSystemUserById(userId: string): Promise<import("../models/interfaces").SystemUser | null> {
    // Validate GUID format to prevent injection
    if (!isGuid(userId)) {
      return null;
    }
    try {
      const response = await window.dataverseAPI.queryData(`systemusers?$select=systemuserid,fullname,domainname&$filter=systemuserid eq '${userId}'&$top=1`);
      const values = response.value as Record<string, unknown>[];
      if (values.length === 0) return null;
      return {
        systemuserid: values[0]["systemuserid"] as string,
        fullname: (values[0]["fullname"] as string) ?? "",
        domainname: (values[0]["domainname"] as string) ?? "",
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch system user by ID: ${msg}`);
    }
  }

  async fetchSystemUserByFullName(fullname: "SYSTEM"): Promise<import("../models/interfaces").SystemUser | null> {
    // Validate even though TypeScript restricts to "SYSTEM" — belt-and-suspenders
    if (!/^[A-Z]{1,50}$/.test(fullname)) {
      throw new Error(`Invalid fullname: "${fullname}"`);
    }
    try {
      const response = await window.dataverseAPI.queryData(`systemusers?$select=systemuserid,fullname,domainname&$filter=fullname eq '${fullname}'&$top=1`);
      const values = response.value as Record<string, unknown>[];
      if (values.length === 0) return null;
      return {
        systemuserid: values[0]["systemuserid"] as string,
        fullname: (values[0]["fullname"] as string) ?? "",
        domainname: (values[0]["domainname"] as string) ?? "",
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch SYSTEM user: ${msg}`);
    }
  }

  async registerAssembly(content: string, name: string, isolationMode: number, description: string, packageId?: string): Promise<string> {
    try {
      const payload: Record<string, unknown> = {
        content,
        name,
        isolationmode: isolationMode,
        description,
        sourcetype: 0,
      };
      if (packageId) {
        payload["packageid@odata.bind"] = buildPackageBind(packageId);
      }
      const result = await window.dataverseAPI.create("pluginassembly", payload, "primary");
      return result.id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to register assembly: ${msg}`);
    }
  }

  async updateAssembly(assemblyId: string, description: string, content?: string, packageId?: string): Promise<void> {
    try {
      const payload: Record<string, unknown> = { description };
      if (content) payload["content"] = content;
      if (packageId !== undefined) {
        payload["packageid@odata.bind"] = packageId ? buildPackageBind(packageId) : null;
      }
      await window.dataverseAPI.update("pluginassembly", assemblyId, payload);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update assembly: ${msg}`);
    }
  }

  async deleteAssembly(assemblyId: string): Promise<void> {
    try {
      await window.dataverseAPI.delete("pluginassembly", assemblyId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete assembly: ${msg}`);
    }
  }

  // ── Plugin Package methods ──

  /** @param withManagedIdentity See {@link fetchAssemblies}. */
  async fetchPackages(withManagedIdentity = false): Promise<PluginPackage[]> {
    try {
      const identityColumn = withManagedIdentity ? ",_managedidentityid_value" : "";
      const response = await window.dataverseAPI.queryData(
        `pluginpackages?$select=pluginpackageid,name,uniquename,version,ismanaged${identityColumn},createdon,modifiedon&$orderby=name`,
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map((p) => ({
        pluginpackageid: p["pluginpackageid"] as string,
        name: p["name"] as string,
        uniquename: (p["uniquename"] as string) ?? "",
        version: (p["version"] as string) ?? "",
        ismanaged: (p["ismanaged"] as boolean) ?? false,
        _managedidentityid_value: (p["_managedidentityid_value"] as string) ?? undefined,
        createdon: p["createdon"] as string | undefined,
        modifiedon: p["modifiedon"] as string | undefined,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch packages: ${msg}`);
    }
  }

  async createPackage(name: string, uniquename: string, version: string, content: string): Promise<string> {
    try {
      const result = await window.dataverseAPI.create(
        "pluginpackage",
        { name, uniquename, version, content },
        "primary",
      );
      return result.id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create package: ${msg}`);
    }
  }

  async updatePackage(packageId: string, version: string, content?: string): Promise<void> {
    try {
      const payload: Record<string, unknown> = { version };
      if (content) payload["content"] = content;
      await window.dataverseAPI.update("pluginpackage", packageId, payload);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update package: ${msg}`);
    }
  }

  async deletePackage(packageId: string): Promise<void> {
    try {
      await window.dataverseAPI.delete("pluginpackage", packageId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete package: ${msg}`);
    }
  }

  // ── Managed identity methods ──

  /**
   * True when plug-in assemblies and packages can be linked to a managed identity, i.e. the
   * environment has the managedidentity table. Any error counts as "not supported".
   */
  async isManagedIdentitySupported(): Promise<boolean> {
    try {
      await window.dataverseAPI.getEntityMetadata("managedidentity", true, ["LogicalName"]);
      return true;
    } catch {
      return false;
    }
  }

  /** The identities plug-ins can use (credential source "managed"), ordered by name. */
  async fetchManagedIdentities(): Promise<ManagedIdentity[]> {
    try {
      const response = await window.dataverseAPI.queryData(
        `managedidentities?$select=${MANAGED_IDENTITY_SELECT}&$filter=credentialsource eq ${MI_CREDENTIAL_SOURCE_MANAGED}&$orderby=name`,
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map(toManagedIdentity);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch managed identities: ${msg}`);
    }
  }

  /** One identity whatever its credential source, or null when it doesn't exist. */
  async fetchManagedIdentity(identityId: string): Promise<ManagedIdentity | null> {
    if (!isGuid(identityId)) {
      return null;
    }
    try {
      const response = await window.dataverseAPI.queryData(
        `managedidentities?$select=${MANAGED_IDENTITY_SELECT}&$filter=managedidentityid eq '${identityId}'&$top=1`,
        "primary",
      );
      const values = response.value as Record<string, unknown>[];
      return values.length > 0 ? toManagedIdentity(values[0]) : null;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch managed identity: ${msg}`);
    }
  }

  /** Display labels (see {@link managedIdentityLabel}) of all managed identities by id, for showing the linked identity on assemblies and packages. */
  async fetchManagedIdentityNames(): Promise<Map<string, string>> {
    try {
      const response = await window.dataverseAPI.queryData("managedidentities?$select=managedidentityid,name,applicationid", "primary");
      return new Map(
        (response.value as Record<string, unknown>[]).map((m) => [
          m["managedidentityid"] as string,
          managedIdentityLabel({ name: m["name"] as string | undefined, applicationid: m["applicationid"] as string | undefined }),
        ]),
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch managed identity names: ${msg}`);
    }
  }

  /** Creates a managed identity and, when a solution is given, adds it to that solution. Returns the new id. */
  async createManagedIdentity(identity: ManagedIdentityInput, solutionUniqueName?: string): Promise<string> {
    let id: string;
    try {
      const result = await window.dataverseAPI.create(
        "managedidentity",
        {
          name: identity.name,
          applicationid: identity.applicationid,
          tenantid: identity.tenantid,
          subjectscope: identity.subjectscope,
          version: identity.version,
          credentialsource: MI_CREDENTIAL_SOURCE_MANAGED,
        },
        "primary",
      );
      id = result.id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create managed identity: ${msg}`);
    }

    if (solutionUniqueName) {
      try {
        await this.addToSolution(id, "managedidentity", solutionUniqueName);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`The managed identity was created, but adding it to solution "${solutionUniqueName}" failed: ${msg}`);
      }
    }
    return id;
  }

  async updateManagedIdentity(identityId: string, identity: ManagedIdentityInput): Promise<void> {
    try {
      await window.dataverseAPI.update("managedidentity", identityId, {
        name: identity.name,
        applicationid: identity.applicationid,
        tenantid: identity.tenantid,
        subjectscope: identity.subjectscope,
        version: identity.version,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update managed identity: ${msg}`);
    }
  }

  async deleteManagedIdentity(identityId: string): Promise<void> {
    try {
      await window.dataverseAPI.delete("managedidentity", identityId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete managed identity: ${msg}`);
    }
  }

  /**
   * Sets or clears the managed identity of a plug-in assembly or package.
   * Dataverse refuses the link unless the assembly or package is signed with a certificate.
   */
  async linkManagedIdentity(kind: "assembly" | "package", recordId: string, identityId: string | null): Promise<void> {
    const entity = kind === "assembly" ? "pluginassembly" : "pluginpackage";
    try {
      await window.dataverseAPI.update(entity, recordId, {
        "managedidentityid@odata.bind": identityId ? buildManagedIdentityBind(identityId) : null,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to ${identityId ? "link" : "remove"} the managed identity: ${msg}`);
    }
  }

  /** Unmanaged, visible solutions other than Default, for adding new components to. */
  async fetchUnmanagedSolutions(): Promise<SolutionOption[]> {
    try {
      const response = await window.dataverseAPI.queryData(
        "solutions?$select=uniquename,friendlyname&$filter=ismanaged eq false and isvisible eq true and uniquename ne 'Default'&$orderby=friendlyname",
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map((s) => ({
        uniquename: s["uniquename"] as string,
        friendlyname: (s["friendlyname"] as string) ?? (s["uniquename"] as string),
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch solutions: ${msg}`);
    }
  }

  /** Adds a record to an unmanaged solution, looking up the component type of its table. */
  private async addToSolution(componentId: string, entityLogicalName: string, solutionUniqueName: string): Promise<void> {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(entityLogicalName)) {
      throw new Error(`Invalid entity name: "${entityLogicalName}"`);
    }
    const definitions = await window.dataverseAPI.queryData(
      `solutioncomponentdefinitions?$select=solutioncomponenttype&$filter=primaryentityname eq '${entityLogicalName}'&$top=1`,
      "primary",
    );
    const componentType = (definitions.value[0]?.["solutioncomponenttype"] as number | undefined) ?? undefined;
    if (componentType === undefined) {
      throw new Error(`Unable to find the solution component type for table ${entityLogicalName}`);
    }
    await window.dataverseAPI.execute({
      operationName: "AddSolutionComponent",
      operationType: "action",
      parameters: {
        ComponentId: componentId,
        ComponentType: componentType,
        SolutionUniqueName: solutionUniqueName,
        AddRequiredComponents: false,
      },
    });
  }

  async registerStep(
    stepData: Partial<ProcessingStep> & {
      messageId: string;
      filterId?: string;
      pluginTypeId: string;
    },
  ): Promise<string> {
    try {
      const payload: Record<string, unknown> = {
        name: stepData.name,
        description: stepData.description ?? "",
        rank: stepData.rank ?? 1,
        mode: stepData.mode ?? 0,
        stage: stepData.stage ?? 40,
        filteringattributes: stepData.filteringattributes ?? "",
        asyncautodelete: stepData.asyncautodelete ?? false,
        "sdkmessageid@odata.bind": `/sdkmessages(${stepData.messageId})`,
        "eventhandler_plugintype@odata.bind": `/plugintypes(${stepData.pluginTypeId})`,
      };
      if (stepData.filterId) {
        payload["sdkmessagefilterid@odata.bind"] = `/sdkmessagefilters(${stepData.filterId})`;
      }
      if (stepData.impersonatinguserid) {
        payload["impersonatinguserid@odata.bind"] = `/systemusers(${stepData.impersonatinguserid})`;
      }
      if (stepData.configuration !== undefined) {
        payload["configuration"] = stepData.configuration;
      }
      if (stepData.supporteddeployment !== undefined) {
        payload["supporteddeployment"] = stepData.supporteddeployment;
      }
      if ((stepData as { secureconfigid?: string }).secureconfigid) {
        payload["sdkmessageprocessingstepsecureconfigid@odata.bind"] = `/sdkmessageprocessingstepsecureconfigs(${(stepData as { secureconfigid?: string }).secureconfigid})`;
      }
      const result = await window.dataverseAPI.create("sdkmessageprocessingstep", payload);
      return result.id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to register step: ${msg}`);
    }
  }

  async updateStep(stepId: string, stepData: Partial<ProcessingStep> & { messageId?: string; filterId?: string }): Promise<void> {
    try {
      const payload: Record<string, unknown> = {};
      if (stepData.name !== undefined) payload["name"] = stepData.name;
      if (stepData.description !== undefined) payload["description"] = stepData.description;
      if (stepData.rank !== undefined) payload["rank"] = stepData.rank;
      if (stepData.mode !== undefined) payload["mode"] = stepData.mode;
      if (stepData.stage !== undefined) payload["stage"] = stepData.stage;
      if (stepData.filteringattributes !== undefined) payload["filteringattributes"] = stepData.filteringattributes;
      if (stepData.asyncautodelete !== undefined) payload["asyncautodelete"] = stepData.asyncautodelete;
      if (stepData.messageId) {
        payload["sdkmessageid@odata.bind"] = `/sdkmessages(${stepData.messageId})`;
      }
      // Handle filterId: undefined => no change, non-empty => set, empty/null => clear
      if (stepData.filterId !== undefined) {
        if (stepData.filterId) {
          payload["sdkmessagefilterid@odata.bind"] = `/sdkmessagefilters(${stepData.filterId})`;
        } else {
          payload["sdkmessagefilterid@odata.bind"] = null;
        }
      }
      // Handle impersonatinguserid: absent => no change, value => set, empty/null => clear
      if ("impersonatinguserid" in stepData) {
        const impersonatingUserId = (stepData as Partial<ProcessingStep>).impersonatinguserid as string | null | undefined;
        if (impersonatingUserId) {
          payload["impersonatinguserid@odata.bind"] = `/systemusers(${impersonatingUserId})`;
        } else {
          payload["impersonatinguserid@odata.bind"] = null;
        }
      }
      if (stepData.configuration !== undefined) {
        payload["configuration"] = stepData.configuration;
      }
      if (stepData.supporteddeployment !== undefined) {
        payload["supporteddeployment"] = stepData.supporteddeployment;
      }
      if ((stepData as { secureconfigid?: string }).secureconfigid) {
        payload["sdkmessageprocessingstepsecureconfigid@odata.bind"] = `/sdkmessageprocessingstepsecureconfigs(${(stepData as { secureconfigid?: string }).secureconfigid})`;
      }
      await window.dataverseAPI.update("sdkmessageprocessingstep", stepId, payload);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update step: ${msg}`);
    }
  }

  async deleteStep(stepId: string): Promise<void> {
    try {
      await window.dataverseAPI.delete("sdkmessageprocessingstep", stepId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete step: ${msg}`);
    }
  }

  async enableStep(stepId: string): Promise<void> {
    try {
      await window.dataverseAPI.update("sdkmessageprocessingstep", stepId, { statecode: 0, statuscode: 1 });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to enable step: ${msg}`);
    }
  }

  async disableStep(stepId: string): Promise<void> {
    try {
      await window.dataverseAPI.update("sdkmessageprocessingstep", stepId, { statecode: 1, statuscode: 2 });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to disable step: ${msg}`);
    }
  }

  async registerImage(imageData: Partial<StepImage> & { stepId: string }): Promise<string> {
    try {
      const payload: Record<string, unknown> = {
        name: imageData.name,
        entityalias: imageData.entityalias,
        imagetype: imageData.imagetype ?? 0,
        messagepropertyname: imageData.messagepropertyname ?? "Target",
        attributes: imageData.attributes ?? "",
        description: imageData.description ?? "",
        "sdkmessageprocessingstepid@odata.bind": `/sdkmessageprocessingsteps(${imageData.stepId})`,
      };
      const result = await window.dataverseAPI.create("sdkmessageprocessingstepimage", payload);
      return result.id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to register image: ${msg}`);
    }
  }

  async updateImage(imageId: string, imageData: Partial<StepImage>): Promise<void> {
    try {
      const payload: Record<string, unknown> = {};
      // name, imagetype and messagepropertyname are set at creation time and cannot be changed via update
      if (imageData.entityalias !== undefined) payload["entityalias"] = imageData.entityalias;
      // Set attributes whenever provided (including empty string, which means "All Attributes" in Dataverse)
      if (imageData.attributes !== undefined) {
        payload["attributes"] = imageData.attributes;
      }

      // Set description whenever provided (including empty string to clear any existing description)
      if (imageData.description !== undefined) {
        payload["description"] = imageData.description;
      }

      // CRITICAL: Some versions of Dataverse require the parent step ID to be
      // present in the update payload to pass internal validation.
      if (imageData.sdkmessageprocessingstepid) {
        payload["sdkmessageprocessingstepid@odata.bind"] = `/sdkmessageprocessingsteps(${imageData.sdkmessageprocessingstepid})`;
      }

      await window.dataverseAPI.update("sdkmessageprocessingstepimage", imageId, payload);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update image: ${msg}`);
    }
  }

  async deleteImage(imageId: string): Promise<void> {
    try {
      await window.dataverseAPI.delete("sdkmessageprocessingstepimage", imageId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete image: ${msg}`);
    }
  }

  async fetchServiceEndpoints(): Promise<ServiceEndpoint[]> {
    try {
      const response = await window.dataverseAPI.queryData(
        // authvalue, saskey, sastoken are write-only in Dataverse — excluded from $select
        "serviceendpoints?$select=serviceendpointid,name,description,contract,url,authtype,messageformat,namespaceaddress,path,saskeyname,userclaim,ismanaged,createdon,modifiedon&$orderby=name",
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map((e) => ({
        serviceendpointid: e["serviceendpointid"] as string,
        name: e["name"] as string,
        description: (e["description"] as string) ?? "",
        contract: e["contract"] as number,
        url: (e["url"] as string) ?? undefined,
        authtype: e["authtype"] != null ? (e["authtype"] as number) : undefined,
        messageformat: e["messageformat"] != null ? (e["messageformat"] as number) : undefined,
        namespaceaddress: (e["namespaceaddress"] as string) ?? undefined,
        path: (e["path"] as string) ?? undefined,
        saskeyname: (e["saskeyname"] as string) ?? undefined,
        userclaim: e["userclaim"] != null ? (e["userclaim"] as number) : undefined,
        ismanaged: (e["ismanaged"] as boolean) ?? undefined,
        createdon: (e["createdon"] as string) ?? undefined,
        modifiedon: (e["modifiedon"] as string) ?? undefined,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch service endpoints: ${msg}`);
    }
  }

  async registerServiceEndpoint(data: Partial<ServiceEndpoint>): Promise<string> {
    try {
      const result = await window.dataverseAPI.create("serviceendpoint", data as Record<string, unknown>, "primary");
      return result.id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to register service endpoint: ${msg}`);
    }
  }

  async updateServiceEndpoint(id: string, data: Partial<ServiceEndpoint>): Promise<void> {
    try {
      await window.dataverseAPI.update("serviceendpoint", id, data as Record<string, unknown>);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update service endpoint: ${msg}`);
    }
  }

  async deleteServiceEndpoint(id: string): Promise<void> {
    try {
      await window.dataverseAPI.delete("serviceendpoint", id);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete service endpoint: ${msg}`);
    }
  }

  async fetchStepsForEndpoint(endpointId: string): Promise<ProcessingStep[]> {
    try {
      const response = await window.dataverseAPI.queryData(
        `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,description,rank,mode,stage,filteringattributes,asyncautodelete,statecode,_sdkmessageid_value,_sdkmessagefilterid_value,configuration,_sdkmessageprocessingstepsecureconfigid_value,supporteddeployment&$filter=_eventhandler_value eq '${endpointId}'&$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=name`,
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map((s) => {
        const msgExpand = s["sdkmessageid"] as Record<string, unknown> | null;
        const filterExpand = s["sdkmessagefilterid"] as Record<string, unknown> | null;
        return {
          sdkmessageprocessingstepid: s["sdkmessageprocessingstepid"] as string,
          name: s["name"] as string,
          description: (s["description"] as string) ?? "",
          rank: (s["rank"] as number) ?? 1,
          mode: (s["mode"] as number) ?? 0,
          stage: (s["stage"] as number) ?? 40,
          sdkmessageid: (s["_sdkmessageid_value"] as string) ?? "",
          messageName: (msgExpand?.["name"] as string) ?? "",
          sdkmessagefilterid: (s["_sdkmessagefilterid_value"] as string) ?? "",
          primaryEntityName: (filterExpand?.["primaryobjecttypecode"] as string) ?? "none",
          filteringattributes: (s["filteringattributes"] as string) ?? "",
          asyncautodelete: (s["asyncautodelete"] as boolean) ?? false,
          statecode: (s["statecode"] as number) ?? 0,
          serviceendpointid: endpointId,
          configuration: (s["configuration"] as string) ?? undefined,
          secureconfigid: (s["_sdkmessageprocessingstepsecureconfigid_value"] as string) ?? undefined,
          supporteddeployment: s["supporteddeployment"] != null ? (s["supporteddeployment"] as number) : undefined,
        };
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch steps for endpoint: ${msg}`);
    }
  }

  async registerStepForEndpoint(stepData: {
    name: string;
    description?: string;
    rank?: number;
    mode?: number;
    stage?: number;
    filteringattributes?: string;
    asyncautodelete?: boolean;
    messageId: string;
    filterId?: string;
    endpointId: string;
    configuration?: string;
    supporteddeployment?: number;
  }): Promise<string> {
    try {
      const payload: Record<string, unknown> = {
        name: stepData.name,
        description: stepData.description ?? "",
        rank: stepData.rank ?? 1,
        mode: stepData.mode ?? 0,
        stage: stepData.stage ?? 40,
        filteringattributes: stepData.filteringattributes ?? "",
        asyncautodelete: stepData.asyncautodelete ?? false,
        "sdkmessageid@odata.bind": `/sdkmessages(${stepData.messageId})`,
        "eventhandler_serviceendpoint@odata.bind": `/serviceendpoints(${stepData.endpointId})`,
      };
      if (stepData.filterId) {
        payload["sdkmessagefilterid@odata.bind"] = `/sdkmessagefilters(${stepData.filterId})`;
      }
      if (stepData.configuration !== undefined) {
        payload["configuration"] = stepData.configuration;
      }
      if (stepData.supporteddeployment !== undefined) {
        payload["supporteddeployment"] = stepData.supporteddeployment;
      }
      const result = await window.dataverseAPI.create("sdkmessageprocessingstep", payload);
      return result.id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to register step for endpoint: ${msg}`);
    }
  }

  async createSecureConfig(secureconfig: string): Promise<string> {
    try {
      const result = await window.dataverseAPI.create("sdkmessageprocessingstepsecureconfig", { secureconfig });
      return result.id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create secure config: ${msg}`);
    }
  }

  async updateSecureConfig(id: string, secureconfig: string): Promise<void> {
    try {
      await window.dataverseAPI.update("sdkmessageprocessingstepsecureconfig", id, { secureconfig });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update secure config: ${msg}`);
    }
  }

  async deleteSecureConfig(id: string): Promise<void> {
    try {
      await window.dataverseAPI.delete("sdkmessageprocessingstepsecureconfig", id);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete secure config: ${msg}`);
    }
  }
}
