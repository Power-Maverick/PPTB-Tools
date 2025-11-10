import axios, { AxiosInstance } from 'axios';
import { DataverseAttribute, DataverseRelationship, DataverseSolution, DataverseTable } from '../models/interfaces';
import { Helper } from './Helper';

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
 * Client for interacting with Dataverse Web API
 */
export class DataverseClient {
  private axiosInstance: AxiosInstance;
  private environmentUrl: string;
  private apiVersion: string;
  private isPPTB: boolean;

  constructor(config: DataverseConfig, isPPTB: boolean) {
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
  }

  /**
   * Fetch solution metadata from Dataverse
   * @param solutionUniqueName Unique name of the solution
   * @returns Solution with all tables and metadata
   */
  async fetchSolution(solutionUniqueName: string): Promise<DataverseSolution> {
    try {
      const helper = new Helper(this.axiosInstance);

      // Fetch solution details
      const responseSolution = await helper.getOData(`solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid,friendlyname,uniquename,_publisherid_value,version&$expand=publisherid($select=customizationprefix)`, this.isPPTB)
      console.log("Solution Metadata",responseSolution);
      
      if (!responseSolution || responseSolution.length === 0) {
        throw new Error(`Solution '${solutionUniqueName}' not found`);
      }
      const solutionData = responseSolution[0];
      console.log("Solution Data",solutionData);

      // Publisher Prefix
      const publisherPrefix = solutionData.publisherid?.customizationprefix ?? 'unknown';

      // Fetch solution components (tables)
      const responseComponent = await helper.getOData(`solutioncomponents?$filter=_solutionid_value eq ${solutionData.solutionid} and componenttype eq 1&$select=objectid`, this.isPPTB);
      console.log("Component List",responseComponent);
      
      const tableIds = responseComponent.map((c: any) => c.objectid);
      console.log("Table IDs", tableIds);

      // Fetch tables in parallel
      const tables = await this.fetchTables(tableIds);
      console.log("Tables", tables);

      return {
        uniqueName: solutionData.uniquename,
        displayName: solutionData.friendlyname,
        version: solutionData.version,
        publisherPrefix: publisherPrefix,
        tables: tables,
      };
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Dataverse API error: ${error.response.status} - ${error.response.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch multiple tables by their IDs in parallel
   */
  private async fetchTables(tableIds: string[]): Promise<DataverseTable[]> {
    if (tableIds.length === 0) {
      return [];
    }

    // Execute all table fetches in parallel
    const tableFetchPromises = tableIds.map(tableId => 
      this.fetchTable(tableId).catch(error => {
        console.warn(`Failed to fetch table ${tableId}:`, error);
        return null;
      })
    );

    const results = await Promise.all(tableFetchPromises);
    
    // Filter out null results from failed fetches
    return results.filter((table: DataverseTable | null): table is DataverseTable => table !== null);
  }

  /**
   * Fetch a single table by ID
   */
  private async fetchTable(tableId: string): Promise<DataverseTable | null> {
    try {
      const helper = new Helper(this.axiosInstance);
      
      // Fetch entity metadata
      const entity = await window.dataverseAPI.getEntityMetadata(tableId,false,["LogicalName","DisplayName","SchemaName","PrimaryIdAttribute","PrimaryNameAttribute","TableType","IsIntersect"]);
      console.log("Entity Metadata", entity);

      // Fetch attributes
      // Fetch attributes and all relationship types in parallel
      const [responseAttributes, responseOneToMany, responseManyToOne, responseManyToMany] = await Promise.all([
        helper.getOData(`EntityDefinitions(${tableId})/Attributes?$select=LogicalName,DisplayName,AttributeType,IsPrimaryId,IsPrimaryName,RequiredLevel`, this.isPPTB),
        helper.getOData(`EntityDefinitions(${tableId})/OneToManyRelationships?$select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute`, this.isPPTB),
        helper.getOData(`EntityDefinitions(${tableId})/ManyToOneRelationships?$select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute`, this.isPPTB),
        helper.getOData(`EntityDefinitions(${tableId})/ManyToManyRelationships?$select=SchemaName,Entity1LogicalName,Entity2LogicalName,IntersectEntityName`, this.isPPTB),
      ]);

      console.log("Entity Attributes", responseAttributes);

      const attributes: DataverseAttribute[] = responseAttributes.map((attr: any) => ({
        logicalName: attr.LogicalName,
        displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.LogicalName,
        type: this.mapAttributeType(attr.AttributeType),
        isPrimaryId: attr.IsPrimaryId || false,
        isPrimaryName: attr.IsPrimaryName || false,
        isRequired: attr.RequiredLevel?.Value === 'ApplicationRequired' || attr.RequiredLevel?.Value === 'SystemRequired',
      }));

      // Process relationships from parallel fetch results
      const relationships = this.processRelationships(
        entity.LogicalName,
        responseOneToMany,
        responseManyToOne,
        responseManyToMany
      );

      return {
        logicalName: entity.LogicalName,
        displayName: entity.LogicalName, //entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName,
        schemaName: entity.SchemaName as string,
        primaryIdAttribute: entity.PrimaryIdAttribute as string,
        primaryNameAttribute: entity.PrimaryNameAttribute as string,
        isIntersect: entity.IsIntersect as boolean || false,
        tableType: entity.TableType as string,
        attributes: attributes,
        relationships: relationships,
      };
    } catch (error) {
      console.warn(`Failed to fetch table metadata for ${tableId}:`, error);
      return null;
    }
  }

  /**
   * Process relationships from parallel fetch results
   */
  private processRelationships(
    logicalName: string,
    responseOneToMany: any[],
    responseManyToOne: any[],
    responseManyToMany: any[]
  ): DataverseRelationship[] {
    const relationships: DataverseRelationship[] = [];

    try {
      // Process One-to-Many relationships
      console.log("One-to-Many Relationships", responseOneToMany);
      for (const rel of responseOneToMany) {
        if (rel.ReferencedEntity === logicalName) {
          relationships.push({
            schemaName: rel.SchemaName,
            type: 'OneToMany',
            relatedTable: rel.ReferencingEntity,
            lookupAttribute: rel.ReferencingAttribute,
          });
        }
      }

      // Process Many-to-One relationships
      console.log("Many-to-One Relationships", responseManyToOne);
      for (const rel of responseManyToOne) {
        if (rel.ReferencingEntity === logicalName) {
          relationships.push({
            schemaName: rel.SchemaName,
            type: 'ManyToOne',
            relatedTable: rel.ReferencedEntity,
            lookupAttribute: rel.ReferencingAttribute,
          });
        }
      }

      // Process Many-to-Many relationships
      console.log("Many-to-Many Relationships", responseManyToMany);
      for (const rel of responseManyToMany) {
        const isEntity1 = rel.Entity1LogicalName === logicalName;
        relationships.push({
          schemaName: rel.SchemaName,
          type: 'ManyToMany',
          relatedTable: isEntity1 ? rel.Entity2LogicalName : rel.Entity1LogicalName,
          intersectTable: rel.IntersectEntityName,
        });
      }
    } catch (error) {
      console.warn(`Failed to process relationships for ${logicalName}:`, error);
    }

    return relationships;
  }

  /**
   * @deprecated Use processRelationships instead - relationships are now fetched in parallel with attributes
   * Fetch relationships for a table
   */
  private async fetchRelationships(tableId: string, logicalName: string): Promise<DataverseRelationship[]> {
    const relationships: DataverseRelationship[] = [];
    const helper = new Helper(this.axiosInstance);

    try {
      // Fetch One-to-Many relationships
      const responseOneToMany = await helper.getOData(`EntityDefinitions(${tableId})/OneToManyRelationships?$select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute`,this.isPPTB);
      console.log("One-to-Many Relationships", responseOneToMany);
      
      for (const rel of responseOneToMany) {
        if (rel.ReferencedEntity === logicalName) {
          relationships.push({
            schemaName: rel.SchemaName,
            type: 'OneToMany',
            relatedTable: rel.ReferencingEntity,
            lookupAttribute: rel.ReferencingAttribute,
          });
        }
      }

      // Fetch Many-to-One relationships
      const responseManyToOne = await helper.getOData(`EntityDefinitions(${tableId})/ManyToOneRelationships?$select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute`,this.isPPTB);
      console.log("Many-to-One Relationships", responseManyToOne);
      for (const rel of responseManyToOne) {
        if (rel.ReferencingEntity === logicalName) {
          relationships.push({
            schemaName: rel.SchemaName,
            type: 'ManyToOne',
            relatedTable: rel.ReferencedEntity,
            lookupAttribute: rel.ReferencingAttribute,
          });
        }
      }

      // Fetch Many-to-Many relationships
      const responseManyToMany = await helper.getOData(`EntityDefinitions(${tableId})/ManyToManyRelationships?$select=SchemaName,Entity1LogicalName,Entity2LogicalName,IntersectEntityName`,this.isPPTB);
      console.log("Many-to-Many Relationships", responseManyToMany);
      for (const rel of responseManyToMany) {
        const isEntity1 = rel.Entity1LogicalName === logicalName;
        relationships.push({
          schemaName: rel.SchemaName,
          type: 'ManyToMany',
          relatedTable: isEntity1 ? rel.Entity2LogicalName : rel.Entity1LogicalName,
          intersectTable: rel.IntersectEntityName,
        });
      }
    } catch (error) {
      console.warn(`Failed to fetch relationships for ${logicalName}:`, error);
    }

    return relationships;
  }

  /**
   * Map Dataverse attribute types to simplified types
   */
  private mapAttributeType(attributeType: string): string {
    const typeMap: { [key: string]: string } = {
      'String': 'string',
      'Memo': 'string',
      'Integer': 'int',
      'BigInt': 'int',
      'Decimal': 'decimal',
      'Double': 'decimal',
      'Money': 'money',
      'DateTime': 'datetime',
      'Boolean': 'boolean',
      'Lookup': 'lookup',
      'Customer': 'lookup',
      'Owner': 'lookup',
      'Picklist': 'picklist',
      'State': 'picklist',
      'Status': 'picklist',
      'Uniqueidentifier': 'guid',
    };

    return typeMap[attributeType] || 'string';
  }

  /**
   * List all solutions in the environment
   * @returns Array of solution names
   */
  async listSolutions(): Promise<Array<{ uniqueName: string; displayName: string; version: string }>> {
    try {
      const helper = new Helper(this.axiosInstance);
      const solutions = await helper.getOData(`solutions?$select=uniquename,friendlyname,version&$filter=isvisible eq true&$orderby=friendlyname asc`,this.isPPTB);
      console.log("Solutions", solutions);
      
      return solutions.map((s: any) => ({
        uniqueName: s.uniquename,
        displayName: s.friendlyname,
        version: s.version,
      }));
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Dataverse API error: ${error.response.status} - ${error.response.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }
}
