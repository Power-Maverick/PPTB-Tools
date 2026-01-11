/**
 * Helper class for making OData requests
 */
export class Helper {
  private isPPTB: boolean;

  constructor(isPPTB: boolean) {
    this.isPPTB = isPPTB;
  }

  /**
   * Make an OData GET request using PPTB API
   */
  async getOData(endpoint: string): Promise<any[]> {
    try {
      if (this.isPPTB && window.toolboxAPI?.dataverse?.retrieveMultiple) {
        // Use PPTB API for data retrieval
        const response = await window.toolboxAPI.dataverse.retrieveMultiple(endpoint);
        return response.value || response;
      } else {
        throw new Error('This tool only works in PPTB environment');
      }
    } catch (error: any) {
      console.error('OData request failed:', error);
      throw error;
    }
  }
}
