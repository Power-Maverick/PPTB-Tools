// Shared type definitions for PPTB integration

declare global {
  interface Window {
    toolboxAPI?: {
      connections: {
        getActiveConnection: () => Promise<{ url: string; environmentUrl?: string }>;
      };
      utils: {
        saveFile: (filename: string, content: string) => Promise<string>;
        showNotification: (options: {
          title: string;
          body: string;
          type: 'success' | 'error' | 'warning' | 'info';
        }) => Promise<void>;
        copyToClipboard: (text: string) => Promise<void>;
      };
    };
    dataverseAPI?: {
      queryData: (query: string) => Promise<any>;
      getEnvironmentUrl: () => Promise<string>;
    };
  }
}

export {};
