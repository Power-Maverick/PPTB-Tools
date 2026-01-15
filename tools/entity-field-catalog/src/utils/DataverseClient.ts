import { DataverseEntity, DataverseField, DataverseSolution } from '../models/interfaces';

/**
 * Escape OData string literals to prevent injection
 */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Client for interacting with Dataverse using PPTB API
 */
export class DataverseClient {
  constructor() {
    // No credentials needed - using window.dataverseAPI
  }

  /**
   * List all solutions in the environment
   */
  async listSolutions(): Promise<DataverseSolution[]> {
    try {
      const entitySetName = await window.dataverseAPI.getEntitySetName('solution');
      
      const response = await window.dataverseAPI.queryData(
        `${entitySetName}?$filter=isvisible eq true and ismanaged eq false&$select=solutionid,friendlyname,uniquename,version&$expand=publisherid($select=customizationprefix)&$orderby=friendlyname asc`
      );
      
      return response.value.map((s: any) => ({
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
      // Escape solution name for OData query
      const escapedSolutionName = escapeODataString(solutionUniqueName);
      
      // Fetch solution details
      const solutionEntitySetName = await window.dataverseAPI.getEntitySetName('solution');
      const responseSolution = await window.dataverseAPI.queryData(
        `${solutionEntitySetName}?$filter=uniquename eq '${escapedSolutionName}'&$select=solutionid,friendlyname,uniquename,version`
      );
      
      if (!responseSolution.value || responseSolution.value.length === 0) {
        throw new Error(`Solution '${solutionUniqueName}' not found`);
      }
      const solutionData = responseSolution.value[0];

      // Fetch solution components (entities)
      const componentEntitySetName = await window.dataverseAPI.getEntitySetName('solutioncomponent');
      const responseComponent = await window.dataverseAPI.queryData(
        `${componentEntitySetName}?$filter=_solutionid_value eq ${solutionData.solutionid} and componenttype eq 1&$select=objectid`
      );
      
      const entityIds = responseComponent.value.map((c: any) => c.objectid);

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

    // Fetch entity metadata using getAllEntitiesMetadata
    const allEntitiesResponse = await window.dataverseAPI.getAllEntitiesMetadata([
      'LogicalName',
      'DisplayName',
      'SchemaName',
      'PrimaryIdAttribute',
      'PrimaryNameAttribute',
      'EntitySetName',
      'Description',
      'ObjectTypeCode',
      'MetadataId'
    ]);

    // Filter to only the entities in our solution
    const entityMetadataMap = new Map();
    allEntitiesResponse.value.forEach((entity: any) => {
      entityMetadataMap.set(entity.MetadataId, entity);
    });

    // Fetch entity metadata and fields in parallel
    const entityPromises = entityIds.map(async (entityId) => {
      try {
        const entity = entityMetadataMap.get(entityId);
        
        if (!entity) {
          console.warn(`Entity ${entityId} not found in metadata`);
          return null;
        }
        
        // Fetch attributes (fields) for this entity
        const fields = await this.fetchEntityFields(entity.LogicalName);

        return {
          logicalName: entity.LogicalName,
          displayName: entity.DisplayName?.LocalizedLabels?.[0]?.Label || entity.LogicalName,
          schemaName: entity.SchemaName,
          primaryIdAttribute: entity.PrimaryIdAttribute,
          primaryNameAttribute: entity.PrimaryNameAttribute,
          entityType: entity.EntitySetName || 'Standard',
          description: entity.Description?.LocalizedLabels?.[0]?.Label || '',
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
      // Use getEntityMetadata to get attributes
      const entityMetadata = await window.dataverseAPI.getEntityRelatedMetadata(
        entityLogicalName,
        'Attributes'
      );

      if (!entityMetadata.Attributes) {
        return [];
      }

      return entityMetadata.Attributes.map((attr: any) => ({
        logicalName: attr.LogicalName,
        displayName: attr.DisplayName?.LocalizedLabels?.[0]?.Label || attr.LogicalName,
        schemaName: attr.SchemaName,
        type: attr.AttributeType || 'Unknown',
        isPrimaryId: attr.IsPrimaryId || false,
        isPrimaryName: attr.IsPrimaryName || false,
        isRequired: attr.RequiredLevel?.Value === 'ApplicationRequired' || attr.RequiredLevel?.Value === 'SystemRequired',
        description: attr.Description?.LocalizedLabels?.[0]?.Label || '',
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
