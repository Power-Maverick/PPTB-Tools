// PCF Control Configuration
export interface PCFControlConfig {
    namespace: string;
    name: string;
    displayName: string;
    description: string;
    controlType: "standard" | "virtual";
    template: "field" | "dataset";
    version: string;
    additionalPackages?: string[];
    incrementVersionOnBuild?: boolean;
}

// PCF Solution Configuration
export interface PCFSolutionConfig {
    solutionName: string;
    publisherName: string;
    publisherPrefix: string;
    publisherFriendlyName: string;
    version: string;
}

// PCF Control Property
export interface PCFControlProperty {
    name: string;
    displayName: string;
    dataType: string;
    typeGroup?: string;
    defaultValue?: string;
    description?: string;
    usage: "bound" | "input" | "output";
    required: boolean;
}

// PCF Resource
export interface PCFResource {
    path: string;
    type: "css" | "resx" | "img";
}

// PCF Features
export interface PCFFeatures {
    captureAudio?: boolean;
    captureVideo?: boolean;
    captureImage?: boolean;
    getBarcode?: boolean;
    getCurrentPosition?: boolean;
    pickFile?: boolean;
    utility?: boolean;
    webApi?: boolean;
}

// Authentication Profile
export interface AuthProfile {
    name: string;
    url: string;
    username?: string;
}

// Command Execution Result
export interface CommandResult {
    success: boolean;
    output: string;
    error?: string;
}

// Tool Context (from PPTB)
export interface ToolContext {
    connectionUrl?: string;
    accessToken?: string;
}
