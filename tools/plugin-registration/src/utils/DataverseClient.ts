import type { CustomApi, CustomApiField, CustomApiRequestParameter, ManagedIdentity, ManagedIdentityInput, PluginAssembly, PluginPackage, PluginType, ProcessingStep, SdkMessage, SdkMessageFilter, SolutionOption, StepImage, ServiceEndpoint } from "../models/interfaces";
import { MI_CREDENTIAL_SOURCE_MANAGED } from "../models/interfaces";
import type { CustomApiChildTable } from "./customApiRules";
import { customApiCreateRecord, isEmptyPlan, isGuid, planCustomApiUpdate, REQUEST_TABLE, RESPONSE_TABLE, validateCustomApi } from "./customApiRules";

/** A plug-in type offered as the handler of a Custom API. */
/** Thrown when a Custom API was created but could not be added to its solution. Carries the new API's id. */
export class CustomApiCreatedError extends Error {
  constructor(readonly customApiId: string, message: string) {
    super(message);
    this.name = "CustomApiCreatedError";
  }
}

export interface CustomApiPluginTypeOption {
  plugintypeid: string;
  typename: string;
  pluginassemblyid: string;
}

const CUSTOM_API_SELECT =
  "customapiid,name,uniquename,displayname,description,bindingtype,boundentitylogicalname,allowedcustomprocessingsteptype,_plugintypeid_value,_sdkmessageid_value,executeprivilegename,isfunction,isprivate,workflowsdkstepenabled,ismanaged,iscustomizable";
const FIELD_SELECT = "_customapiid_value,name,uniquename,displayname,description,type,logicalentityname,ismanaged,iscustomizable";
const REQUEST_SELECT = `customapirequestparameterid,${FIELD_SELECT},isoptional`;
const RESPONSE_SELECT = `customapiresponsepropertyid,${FIELD_SELECT}`;

/** iscustomizable is a managed property: { Value: boolean, ... }. A missing value means customizable. */
function readCustomizable(value: unknown): boolean {
  if (value && typeof value === "object" && "Value" in value) return (value as { Value: unknown }).Value !== false;
  return value !== false;
}

function toCustomApi(a: Record<string, unknown>): CustomApi {
  return {
    customapiid: a["customapiid"] as string,
    name: (a["name"] as string) ?? "",
    uniquename: (a["uniquename"] as string) ?? "",
    displayname: (a["displayname"] as string) ?? "",
    description: (a["description"] as string) ?? "",
    // An absent choice must not quietly become Global/None and change the contract on save.
    bindingtype: (a["bindingtype"] as number) ?? -1,
    boundentitylogicalname: (a["boundentitylogicalname"] as string) ?? "",
    allowedcustomprocessingsteptype: (a["allowedcustomprocessingsteptype"] as number) ?? -1,
    plugintypeid: (a["_plugintypeid_value"] as string) ?? undefined,
    sdkmessageid: (a["_sdkmessageid_value"] as string) ?? undefined,
    executeprivilegename: (a["executeprivilegename"] as string) ?? "",
    isfunction: (a["isfunction"] as boolean) ?? false,
    isprivate: (a["isprivate"] as boolean) ?? false,
    workflowsdkstepenabled: (a["workflowsdkstepenabled"] as boolean) ?? false,
    ismanaged: (a["ismanaged"] as boolean) ?? false,
    iscustomizable: readCustomizable(a["iscustomizable"]),
    requestParameters: [],
    responseProperties: [],
  };
}

function toField(f: Record<string, unknown>, id: string): CustomApiField {
  return {
    id,
    customapiid: (f["_customapiid_value"] as string) ?? "",
    name: (f["name"] as string) ?? "",
    uniquename: (f["uniquename"] as string) ?? "",
    displayname: (f["displayname"] as string) ?? "",
    description: (f["description"] as string) ?? "",
    type: (f["type"] as number) ?? -1,
    logicalentityname: (f["logicalentityname"] as string) ?? "",
    ismanaged: (f["ismanaged"] as boolean) ?? false,
    iscustomizable: readCustomizable(f["iscustomizable"]),
  };
}

function toRequestParameter(r: Record<string, unknown>): CustomApiRequestParameter {
  return { ...toField(r, r["customapirequestparameterid"] as string), isoptional: (r["isoptional"] as boolean) ?? false };
}

function toResponseProperty(r: Record<string, unknown>): CustomApiField {
  return toField(r, r["customapiresponsepropertyid"] as string);
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

  /**
   * Adds a record to an unmanaged solution, looking up the component type of its table. Pass a map to
   * reuse component types already looked up when adding several records.
   */
  private async addToSolution(componentId: string, entityLogicalName: string, solutionUniqueName: string, componentTypes?: Map<string, number>): Promise<void> {
    let componentType = componentTypes?.get(entityLogicalName);
    if (componentType === undefined) {
      componentType = await this.fetchSolutionComponentType(entityLogicalName);
      componentTypes?.set(entityLogicalName, componentType);
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

  private async fetchSolutionComponentType(entityLogicalName: string): Promise<number> {
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
    return componentType;
  }

  // ── Custom API methods ──

  /** True when the environment has the Custom API tables. Any error counts as "not supported". */
  async isCustomApiSupported(): Promise<boolean> {
    try {
      await window.dataverseAPI.getEntityMetadata("customapi", true, ["LogicalName"]);
      return true;
    } catch {
      return false;
    }
  }

  /** Every Custom API with its request parameters and response properties, ordered by unique name. */
  async fetchCustomApis(): Promise<CustomApi[]> {
    try {
      const [apis, requests, responses] = await Promise.all([
        window.dataverseAPI.queryData(`customapis?$select=${CUSTOM_API_SELECT}&$orderby=uniquename`, "primary"),
        window.dataverseAPI.queryData(`customapirequestparameters?$select=${REQUEST_SELECT}&$orderby=uniquename`, "primary"),
        window.dataverseAPI.queryData(`customapiresponseproperties?$select=${RESPONSE_SELECT}&$orderby=uniquename`, "primary"),
      ]);
      const result = (apis.value as Record<string, unknown>[]).map(toCustomApi);
      const byId = new Map(result.map((a) => [a.customapiid.toLowerCase(), a]));
      for (const r of requests.value as Record<string, unknown>[]) {
        byId.get(String(r["_customapiid_value"] ?? "").toLowerCase())?.requestParameters.push(toRequestParameter(r));
      }
      for (const r of responses.value as Record<string, unknown>[]) {
        byId.get(String(r["_customapiid_value"] ?? "").toLowerCase())?.responseProperties.push(toResponseProperty(r));
      }
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch Custom APIs: ${msg}`);
    }
  }

  /** Plug-in types that can handle a Custom API (not workflow activities), ordered by type name. */
  async fetchCustomApiPluginTypes(): Promise<CustomApiPluginTypeOption[]> {
    try {
      const response = await window.dataverseAPI.queryData(
        "plugintypes?$select=plugintypeid,typename,_pluginassemblyid_value&$filter=isworkflowactivity eq false&$orderby=typename",
        "primary",
      );
      return (response.value as Record<string, unknown>[]).map((t) => ({
        plugintypeid: t["plugintypeid"] as string,
        typename: (t["typename"] as string) ?? "",
        pluginassemblyid: (t["_pluginassemblyid_value"] as string) ?? "",
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch plug-in types: ${msg}`);
    }
  }

  /** The customization prefix of an unmanaged solution's publisher. */
  async fetchPublisherPrefix(solutionUniqueName: string): Promise<string> {
    const name = solutionUniqueName.replace(/'/g, "''");
    const response = await window.dataverseAPI.queryData(
      `solutions?$select=uniquename&$filter=uniquename eq '${name}' and ismanaged eq false&$expand=publisherid($select=customizationprefix)`,
      "primary",
    );
    const values = response.value as Record<string, unknown>[];
    const publisher = values.length === 1 ? (values[0]["publisherid"] as Record<string, unknown> | null) : null;
    const prefix = publisher?.["customizationprefix"] as string | undefined;
    if (!prefix) {
      throw new Error(`The unmanaged solution "${solutionUniqueName}" or its publisher prefix could not be found.`);
    }
    return prefix;
  }

  /**
   * Creates a Custom API with its request parameters and response properties in one request, then adds
   * the API and its children to the solution. Unique names must use the solution publisher's prefix.
   * Returns the new API's id.
   */
  async createCustomApi(api: CustomApi, solutionUniqueName: string): Promise<string> {
    if (!solutionUniqueName) throw new Error("Failed to create the Custom API: select an unmanaged solution.");
    let id: string;
    try {
      const prefix = await this.fetchPublisherPrefix(solutionUniqueName);
      const errors = validateCustomApi(api, undefined, prefix);
      if (errors.length > 0) throw new Error(errors.join("\n"));
      const result = await window.dataverseAPI.create("customapi", customApiCreateRecord(api), "primary");
      id = result.id;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create the Custom API: ${msg}`);
    }

    try {
      const componentTypes = new Map<string, number>();
      await this.addToSolution(id, "customapi", solutionUniqueName, componentTypes);
      const filter = `$filter=_customapiid_value eq ${id}`;
      const childSets: [CustomApiChildTable, string][] = [[REQUEST_TABLE, "customapirequestparameters"], [RESPONSE_TABLE, "customapiresponseproperties"]];
      for (const [table, entitySet] of childSets) {
        const children = await window.dataverseAPI.queryData(`${entitySet}?$select=${table}id&${filter}`, "primary");
        for (const child of children.value as Record<string, unknown>[]) {
          await this.addToSolution(child[`${table}id`] as string, table, solutionUniqueName, componentTypes);
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new CustomApiCreatedError(id, `The Custom API was created, but adding it to solution "${solutionUniqueName}" failed: ${msg}`);
    }
    return id;
  }

  /**
   * Saves the differences between the saved API and the edited draft. Removed children are deleted first,
   * so a new child can reuse a removed name. New children join every unmanaged solution the API is in.
   * Returns false when there was nothing to save. Dataverse saves each write on its own, so after a
   * failure part of the edit may already be saved; reload the API before trying again.
   */
  async updateCustomApi(original: CustomApi, draft: CustomApi): Promise<boolean> {
    const errors = validateCustomApi(draft, original);
    if (errors.length > 0) throw new Error(`Failed to update the Custom API: ${errors.join("\n")}`);
    const plan = planCustomApiUpdate(original, draft);
    if (isEmptyPlan(plan)) return false;

    let solutions: string[] = [];
    try {
      if (plan.creates.length > 0) solutions = await this.fetchUnmanagedSolutionsContaining(original.customapiid);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update the Custom API: ${msg}`);
    }

    const componentTypes = new Map<string, number>();
    try {
      for (const d of plan.deletes) await window.dataverseAPI.delete(d.table, d.id, "primary");
      if (Object.keys(plan.apiChanges).length > 0) await window.dataverseAPI.update("customapi", original.customapiid, plan.apiChanges, "primary");
      for (const u of plan.updates) await window.dataverseAPI.update(u.table, u.id, u.changes, "primary");
      for (const c of plan.creates) {
        const created = await window.dataverseAPI.create(c.table, c.record, "primary");
        for (const solution of solutions) await this.addToSolution(created.id, c.table, solution, componentTypes);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update the Custom API. Some changes may already be saved; reload before trying again. ${msg}`);
    }
    return true;
  }

  /** Deletes an unmanaged Custom API. Dataverse deletes its parameters, properties and message with it. */
  async deleteCustomApi(api: CustomApi): Promise<void> {
    if (api.ismanaged) throw new Error("A managed Custom API must be removed through its managed solution.");
    try {
      await window.dataverseAPI.delete("customapi", api.customapiid, "primary");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete the Custom API: ${msg}`);
    }
  }

  /** Deletes one unmanaged request parameter or response property. */
  async deleteCustomApiField(table: CustomApiChildTable, field: CustomApiField): Promise<void> {
    const kind = table === REQUEST_TABLE ? "request parameter" : "response property";
    if (field.ismanaged) throw new Error(`A managed ${kind} must be removed through its managed solution.`);
    try {
      await window.dataverseAPI.delete(table, field.id, "primary");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete the ${kind}: ${msg}`);
    }
  }

  /** Unique names of the unmanaged, visible solutions (other than Default) that contain a record. */
  private async fetchUnmanagedSolutionsContaining(componentId: string): Promise<string[]> {
    if (!isGuid(componentId)) throw new Error(`Invalid component ID: "${componentId}"`);
    const components = await window.dataverseAPI.queryData(
      `solutioncomponents?$select=_solutionid_value&$filter=objectid eq ${componentId}`,
      "primary",
    );
    const solutionIds = [...new Set((components.value as Record<string, unknown>[]).map((c) => c["_solutionid_value"] as string).filter(isGuid))];
    if (solutionIds.length === 0) return [];
    const idFilter = solutionIds.map((s) => `solutionid eq ${s}`).join(" or ");
    const solutions = await window.dataverseAPI.queryData(
      `solutions?$select=uniquename&$filter=(${idFilter}) and ismanaged eq false and isvisible eq true and uniquename ne 'Default'&$orderby=uniquename`,
      "primary",
    );
    return (solutions.value as Record<string, unknown>[]).map((s) => s["uniquename"] as string).filter(Boolean);
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
