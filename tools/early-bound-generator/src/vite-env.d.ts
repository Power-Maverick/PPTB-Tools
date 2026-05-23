/// <reference types="vite/client" />
/// <reference types="@pptb/types" />

declare global {
    const __APP_VERSION__: string;
    interface Window {
        toolboxAPI: ToolBoxAPI.API;
        dataverseAPI: typeof import("@pptb/types").dataverseAPI;
    }
}

export {};
