import axios, { AxiosInstance } from 'axios';

/**
 * Configuration for connecting to Dataverse
 */
export interface DataverseConfig {
  /** Dataverse environment URL (e.g., https://org.crm.dynamics.com) */
  environmentUrl: string;
  /** Access token for authentication */
  accessToken?: string;
  /** API version to use (default: 9.2) */
  apiVersion?: string;
}

/**
 * Helper class for making OData requests
 */
export class Helper {
  private axiosInstance: AxiosInstance;
  private isPPTB: boolean;

  constructor(axiosInstance: AxiosInstance, isPPTB: boolean) {
    this.axiosInstance = axiosInstance;
    this.isPPTB = isPPTB;
  }

  /**
   * Make an OData GET request
   */
  async getOData(endpoint: string): Promise<any[]> {
    try {
      if (this.isPPTB && window.toolboxAPI) {
        // Use PPTB API for data retrieval
        const response = await window.toolboxAPI.dataverse.retrieveMultiple(endpoint);
        return response.value || response;
      } else {
        // Use axios for direct HTTP calls
        const response = await this.axiosInstance.get(endpoint);
        return response.data.value || response.data;
      }
    } catch (error: any) {
      console.error('OData request failed:', error);
      throw error;
    }
  }
}
