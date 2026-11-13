export interface PluginAssembly {
  pluginassemblyid: string;
  name: string;
  version: string;
  culture: string;
  publickeytoken: string;
  sourcetype: number; // 0=Database, 1=Disk, 2=Normal, 3=AzureWebApp
  isolationmode: number; // 1=None, 2=Sandbox
  description: string;
  content?: string; // base64 encoded assembly
  _packageid_value?: string; // GUID of the parent pluginpackage, null = standalone
  _managedidentityid_value?: string; // GUID of the linked managedidentity (online only)
  createdon?: string;
  modifiedon?: string;
}

export interface PluginType {
  plugintypeid: string;
  name: string;
  typename: string;
  friendlyname: string;
  description: string;
  isworkflowactivity: boolean;
  workflowactivitygroupname: string;
  pluginassemblyid: string;
  assemblyname: string;
  createdon?: string;
  modifiedon?: string;
}

export interface SdkMessage {
  sdkmessageid: string;
  name: string;
}

export interface SdkMessageFilter {
  sdkmessagefilterid: string;
  sdkmessageid: string;
  primaryobjecttypecode: string;
  secondaryobjecttypecode?: string;
  messageName?: string;
}

export interface ProcessingStep {
  sdkmessageprocessingstepid: string;
  name: string;
  description: string;
  rank: number;
  mode: number; // 0=Synchronous, 1=Asynchronous
  stage: number; // 10=PreValidation, 20=PreOperation, 40=PostOperation
  sdkmessageid: string;
  messageName: string;
  sdkmessagefilterid: string;
  primaryEntityName: string;
  eventhandler_plugintypeid?: string;
  plugintypeid?: string;
  filteringattributes: string;
  asyncautodelete: boolean;
  statecode: number; // 0=Enabled, 1=Disabled
  plugintypename?: string;
  impersonatinguserid?: string; // GUID of user to impersonate; empty = calling user
  configuration?: string;   // unsecure configuration (Dataverse field: configuration)
  secureconfig?: string;
  secureconfigid?: string;
  supporteddeployment?: number; // 0=ServerOnly, 1=OutlookOnly, 2=Both
  serviceendpointid?: string;
}

export interface StepImage {
  sdkmessageprocessingstepimageid: string;
  name: string;
  entityalias: string;
  imagetype: number; // 0=PreImage, 1=PostImage, 2=Both
  messagepropertyname: string;
  attributes: string;
  sdkmessageprocessingstepid: string;
  description: string;
}

export interface PluginPackage {
  pluginpackageid: string;
  name: string;
  uniquename: string;
  version: string;
  content?: string; // base64 encoded .nupkg (write-only on create/update)
  ismanaged?: boolean;
  _managedidentityid_value?: string; // GUID of the linked managedidentity (online only)
  createdon?: string;
  modifiedon?: string;
}

/**
 * A Dataverse managedidentity record. Plug-in assemblies and packages use it to get tokens through
 * IManagedIdentityService, with a federated identity credential on the app registration in Entra ID.
 */
export interface ManagedIdentity {
  managedidentityid: string;
  name: string;
  applicationid: string;
  tenantid: string;
  subjectscope: number; // see SUBJECT_SCOPES
  version: number | null; // empty = the original, deprecated format (version 0)
  credentialsource?: number; // 2 = IsManaged, the kind plug-ins use
}

/** Values the managed identity dialogs edit; the id is empty for a new identity. */
export type ManagedIdentityInput = Omit<ManagedIdentity, "managedidentityid" | "credentialsource">;

export const SUBJECT_SCOPES: Record<number, string> = { 0: "Global", 1: "Environment", 2: "DevOnly" };

/** credentialsource value for identities used by plug-ins. */
export const MI_CREDENTIAL_SOURCE_MANAGED = 2;

/** Version 2 builds the federated credential subject from the certificate DN hashes; Microsoft recommends it. */
export const RECOMMENDED_MI_VERSION = 2;

export interface SolutionOption {
  uniquename: string;
  friendlyname: string;
}

export interface ServiceEndpoint {
  serviceendpointid: string;
  name: string;
  description: string;
  contract: number;
  // contract: 1=OneWay, 2=Queue, 3=REST, 4=TwoWay, 5=Topic, 6=PersistentQueue, 7=EventHub, 8=Webhook, 9=EventGrid
  url?: string;
  authtype?: number;
  // 0=NotSpecified, 1=ACS, 2=SASKey, 3=SASToken, 4=WebhookKey, 5=HttpHeader, 6=HttpQueryString, 7=ConnectionString, 8=AccessKey, 9=ManagedIdentity
  authvalue?: string;
  messageformat?: number; // 2=JSON, 3=XML
  namespaceaddress?: string;
  path?: string;
  saskeyname?: string;
  saskey?: string;
  sastoken?: string;
  userclaim?: number; // 0=None, 1=UserId, 2=ContactId
  ismanaged?: boolean;
  createdon?: string;
  modifiedon?: string;
}

export type TreeNodeType = 'assembly' | 'plugintype' | 'step' | 'image' | 'entity-group' | 'message-group' | 'package-group' | 'serviceendpoint' | 'package';

export interface VirtualGroupData {
  groupName: string;
  groupType: 'entity' | 'message' | 'package';
}

export interface TreeNode {
  id: string;
  type: TreeNodeType;
  name: string;
  data: PluginAssembly | PluginType | ProcessingStep | StepImage | VirtualGroupData | ServiceEndpoint | PluginPackage;
  children?: TreeNode[];
  isExpanded?: boolean;
  isWorkflowActivity?: boolean;
  isWebhook?: boolean;
  childrenLoaded?: boolean; // true once children have been fetched (even if empty)
}

export interface SystemUser {
  systemuserid: string;
  fullname: string;
  domainname: string;
}

export interface RegistrationData {
  assemblies: PluginAssembly[];
  pluginTypes: Map<string, PluginType[]>;   // key: assemblyId
  steps: Map<string, ProcessingStep[]>;      // key: pluginTypeId
  images: Map<string, StepImage[]>;          // key: stepId
}
