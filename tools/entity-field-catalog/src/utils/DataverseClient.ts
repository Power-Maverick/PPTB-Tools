import axios, { AxiosInstance } from 'axios';
import { DataverseEntity, DataverseField, DataverseSolution } from '../models/interfaces';
import { Helper } from './Helper';

/**
 * Client for interacting with Dataverse Web API
 */
export class DataverseClient {
  private axiosInstance: AxiosInstance;
  private environmentUrl: string;
  private apiVersion: string;
  private isPPTB: boolean;
  private helper: Helper;

  constructor(config: { environmentUrl: string; accessToken?: string; apiVersion?: string }, isPPTB: boolean) {
    this.environmentUrl = config.environmentUrl.replace(/\/$/, '');
    this.apiVersion = config.apiVersion || '9.2';
    this.isPPTB = isPPTB;

    this.axiosInstance = axios.create({
      baseURL: `${this.environmentUrl}/api/data/v${this.apiVersion}`,
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
    });

    this.helper = new Helper(this.axiosInstance, isPPTB);
  }

  /**
   * List all solutions in the environment
   */
  async listSolutions(): Promise<DataverseSolution[]> {
    try {
      const response = await this.helper.getOData(
        "solutions?$filter=isvisible eq true and ismanaged eq false&$select=solutionid,friendlyname,uniquename,version&$expand=publisherid($select=customizationprefix)&$orderby=friendlyname asc"
      );
      
      return response.map((s: any) => ({
        uniqueName: s.uniquename,
        displayName: s.friendlyname,
        version: s.version,
        publisherPrefix: s.publisherid?.customizationprefix || 'unknown',
      }));
    } catch (error: any) {
      console.error('Failed to list solutions:', error);
      throw new Error(`Failed to list solutions: ${error.message}`);
    }
  }

  /**
   * Fetch entities in a solution
   */
  async fetchSolutionEntities(solutionUniqueName: string): Promise<DataverseEntity[]> {
    try {
      // Fetch solution details
      const responseSolution = await this.helper.getOData(
        `solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid,friendlyname,uniquename,version`
      );
      
      if (!responseSolution || responseSolution.length === 0) {
        throw new Error(`Solution '${solutionUniqueName}' not found`);
      }
      const solutionData = responseSolution[0];

      // Fetch solution components (entities)
      const responseComponent = await this.helper.getOData(
        `solutioncomponents?$filter=_solutionid_value eq ${solutionData.solutionid} and componenttype eq 1&$select=objectid`
      );
      
      const entityIds = responseComponent.map((c: any) => c.objectid);

      // Fetch entities in parallel
      const entities = await this.fetchEntities(entityIds);
      
      return entities;
    } catch (error: any) {
      console.error('Failed to fetch solution entities:', error);
      throw new Error(`Failed to fetch solution entities: ${error.message}`);
    }
  }

  /**
   * Fetch entities by their IDs
   */
  private async fetchEntities(entityIds: string[]): Promise<DataverseEntity[]> {
    if (entityIds.length === 0) {
      return [];
    }

    // Fetch entity metadata
    const entityPromises = entityIds.map(async (entityId) => {
      try {
        const entityMetadata = await this.helper.getOData(
          `EntityDefinitions(${entityId})?$select=LogicalName,DisplayName,SchemaName,PrimaryIdAttribute,PrimaryNameAttribute,EntitySetName,Description,ObjectTypeCode`
        );

        const entity = Array.isArray(entityMetadata) ? entityMetadata[0] : entityMetadata;
        
        // Fetch attributes (fields) for this entity
        const fields = await this.fetchEntityFields(entity.LogicalName);

        return {
          logicalName: entity.LogicalName,
          displayName: entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName,
          schemaName: entity.SchemaName,
          primaryIdAttribute: entity.PrimaryIdAttribute,
          primaryNameAttribute: entity.PrimaryNameAttribute,
          entityType: entity.EntitySetName || 'Standard',
          description: entity.Description?.UserLocalizedLabel?.Label || '',
          objectTypeCode: entity.ObjectTypeCode,
          fields: fields,
        };
      } catch (error) {
        console.error(`Failed to fetch entity ${entityId}:`, error);
        return null;
      }
    });

    const entities = await Promise.all(entityPromises);
    return entities.filter((e): e is DataverseEntity => e !== null);
  }

  /**
   * Fetch fields for an entity
   */
  private async fetchEntityFields(entityLogicalName: string): Promise<DataverseField[]> {
    try {
      const response = await this.helper.getOData(
        `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName,DisplayName,SchemaName,AttributeType,IsPrimaryId,IsPrimaryName,RequiredLevel,Description,MaxLength,Precision,Format`
      );

      return response.map((attr: any) => ({
        logicalName: attr.LogicalName,
        displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.LogicalName,
        schemaName: attr.SchemaName,
        type: attr.AttributeType || 'Unknown',
        isPrimaryId: attr.IsPrimaryId || false,
        isPrimaryName: attr.IsPrimaryName || false,
        isRequired: attr.RequiredLevel?.Value === 'ApplicationRequired' || attr.RequiredLevel?.Value === 'SystemRequired',
        description: attr.Description?.UserLocalizedLabel?.Label || '',
        maxLength: attr.MaxLength,
        precision: attr.Precision,
        format: attr.Format,
      }));
    } catch (error) {
      console.error(`Failed to fetch fields for entity ${entityLogicalName}:`, error);
      return [];
    }
  }
}
