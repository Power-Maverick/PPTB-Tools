import { SolutionRecord } from '../models/interfaces';
import '../models/windowTypes';

export class DataverseConnector {
  private environmentBaseUrl: string;
  private apiVersionNumber: string;

  constructor(envUrl: string, version: string = '9.2') {
    this.environmentBaseUrl = envUrl.replace(/\/$/, '');
    this.apiVersionNumber = version;
  }

  async fetchSolutions(): Promise<SolutionRecord[]> {
    const odataQuery = `solutions?$select=solutionid,uniquename,friendlyname,version,ismanaged,description&$expand=publisherid($select=friendlyname)&$filter=isvisible eq true&$orderby=friendlyname asc`;
    
    try {
      const responseData = await this.executeQuery(odataQuery);
      return responseData.value || responseData;
    } catch (err) {
      console.error('Solution fetch failed:', err);
      throw new Error('Unable to retrieve solutions from environment');
    }
  }

  async fetchSolutionAssets(solutionId: string): Promise<any[]> {
    const odataQuery = `solutioncomponents?$filter=_solutionid_value eq ${solutionId}&$select=objectid,componenttype`;
    
    try {
      const responseData = await this.executeQuery(odataQuery);
      return responseData.value || responseData;
    } catch (err) {
      console.error('Component fetch failed:', err);
      throw new Error('Unable to retrieve solution components');
    }
  }

  async fetchEntityMetadata(entityId: string): Promise<any> {
    const odataQuery = `EntityDefinitions(${entityId})?$select=LogicalName,DisplayName,SchemaName,MetadataId`;
    
    try {
      return await this.executeQuery(odataQuery);
    } catch (err) {
      console.error(`Entity metadata fetch failed for ${entityId}:`, err);
      return null;
    }
  }

  async fetchFormMetadata(formId: string): Promise<any> {
    const odataQuery = `systemforms(${formId})?$select=formid,name,objecttypecode,formxml`;
    
    try {
      return await this.executeQuery(odataQuery);
    } catch (err) {
      console.error(`Form metadata fetch failed for ${formId}:`, err);
      return null;
    }
  }

  async fetchViewMetadata(viewId: string): Promise<any> {
    const odataQuery = `savedqueries(${viewId})?$select=savedqueryid,name,returnedtypecode,fetchxml`;
    
    try {
      return await this.executeQuery(odataQuery);
    } catch (err) {
      console.error(`View metadata fetch failed for ${viewId}:`, err);
      return null;
    }
  }

  async fetchPluginMetadata(pluginId: string): Promise<any> {
    const odataQuery = `plugintypes(${pluginId})?$select=plugintypeid,typename,friendlyname`;
    
    try {
      return await this.executeQuery(odataQuery);
    } catch (err) {
      console.error(`Plugin metadata fetch failed for ${pluginId}:`, err);
      return null;
    }
  }

  async fetchWebResourceMetadata(webResourceId: string): Promise<any> {
    const odataQuery = `webresources(${webResourceId})?$select=webresourceid,name,displayname,webresourcetype`;
    
    try {
      return await this.executeQuery(odataQuery);
    } catch (err) {
      console.error(`Web resource metadata fetch failed for ${webResourceId}:`, err);
      return null;
    }
  }

  async fetchWorkflowMetadata(workflowId: string): Promise<any> {
    const odataQuery = `workflows(${workflowId})?$select=workflowid,name,type,category`;
    
    try {
      return await this.executeQuery(odataQuery);
    } catch (err) {
      console.error(`Workflow metadata fetch failed for ${workflowId}:`, err);
      return null;
    }
  }

  private async executeQuery(queryPath: string): Promise<any> {
    if (window.dataverseAPI) {
      return await window.dataverseAPI.queryData(queryPath);
    } else {
      throw new Error('Dataverse API not available');
    }
  }

  static async showMessage(title: string, message: string, severity: 'success' | 'error' | 'warning' | 'info'): Promise<void> {
    if (window.toolboxAPI) {
      await window.toolboxAPI.utils.showNotification({
        title,
        body: message,
        type: severity
      });
    }
  }
}
