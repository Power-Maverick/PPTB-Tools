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

export type TreeNodeType = 'assembly' | 'plugintype' | 'step' | 'image';

export interface TreeNode {
    id: string;
    type: TreeNodeType;
    name: string;
    data: PluginAssembly | PluginType | ProcessingStep | StepImage;
    children?: TreeNode[];
    isExpanded?: boolean;
    isWorkflowActivity?: boolean;
}

export interface RegistrationData {
    assemblies: PluginAssembly[];
    pluginTypes: Map<string, PluginType[]>;   // key: assemblyId
    steps: Map<string, ProcessingStep[]>;      // key: pluginTypeId
    images: Map<string, StepImage[]>;          // key: stepId
}
