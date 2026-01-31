import {
    EnvironmentVariable,
    EnvironmentVariableDefinition,
    EnvironmentVariableValue,
} from "../models/interfaces";

/**
 * DataverseClient for querying environment variables
 */
export class DataverseClient {
    /**
     * Load all environment variable definitions with their values
     */
    static async loadEnvironmentVariables(): Promise<EnvironmentVariable[]> {
        if (!window.dataverseAPI) {
            throw new Error("Dataverse API not available");
        }

        try {
            // Query environment variable definitions with linked values
            const query = `environmentvariabledefinitions?$select=environmentvariabledefinitionid,schemaname,displayname,description,type,defaultvalue,isrequired,statecode,statuscode,createdon,modifiedon,_createdby_value,_modifiedby_value&$expand=environmentvariabledefinition_environmentvariablevalue($select=environmentvariablevalueid,value,statecode,statuscode,createdon,modifiedon,_createdby_value,_modifiedby_value)&$orderby=displayname asc`;

            const response = await window.dataverseAPI.queryData(query);

            if (!response || !response.value) {
                return [];
            }

            const variables: EnvironmentVariable[] = response.value.map((def: any) => {
                const definition: EnvironmentVariableDefinition = {
                    environmentvariabledefinitionid: def.environmentvariabledefinitionid,
                    schemaname: def.schemaname,
                    displayname: def.displayname,
                    description: def.description,
                    type: def.type,
                    defaultvalue: def.defaultvalue,
                    isrequired: def.isrequired,
                    statecode: def.statecode,
                    statuscode: def.statuscode,
                    createdon: def.createdon,
                    modifiedon: def.modifiedon,
                    _createdby_value: def._createdby_value,
                    _modifiedby_value: def._modifiedby_value,
                };

                // Get the environment-specific value (if exists)
                const values = def.environmentvariabledefinition_environmentvariablevalue || [];
                const value: EnvironmentVariableValue | undefined = values.length > 0 ? {
                    environmentvariablevalueid: values[0].environmentvariablevalueid,
                    _environmentvariabledefinitionid_value: def.environmentvariabledefinitionid,
                    value: values[0].value,
                    statecode: values[0].statecode,
                    statuscode: values[0].statuscode,
                    createdon: values[0].createdon,
                    modifiedon: values[0].modifiedon,
                    _createdby_value: values[0]._createdby_value,
                    _modifiedby_value: values[0]._modifiedby_value,
                } : undefined;

                const currentValue = value?.value || definition.defaultvalue || "";
                const hasCustomValue = value !== undefined && value.value !== undefined;

                return {
                    definition,
                    value,
                    currentValue,
                    hasCustomValue,
                };
            });

            return variables;
        } catch (error) {
            console.error("Error loading environment variables:", error);
            throw error;
        }
    }

    /**
     * Create a new environment variable definition
     */
    static async createEnvironmentVariable(
        schemaName: string,
        displayName: string,
        type: number,
        defaultValue: string,
        description: string
    ): Promise<string> {
        if (!window.dataverseAPI) {
            throw new Error("Dataverse API not available");
        }

        const data: any = {
            schemaname: schemaName,
            displayname: displayName,
            type: type,
            statecode: 0,
            statuscode: 1,
        };

        if (defaultValue) {
            data.defaultvalue = defaultValue;
        }

        if (description) {
            data.description = description;
        }

        try {
            const result = await window.dataverseAPI.create(
                "environmentvariabledefinitions",
                data
            );
            return result.id;
        } catch (error) {
            console.error("Error creating environment variable:", error);
            throw error;
        }
    }

    /**
     * Update default value of an environment variable definition
     */
    static async updateDefaultValue(
        definitionId: string,
        defaultValue: string
    ): Promise<void> {
        if (!window.dataverseAPI) {
            throw new Error("Dataverse API not available");
        }

        try {
            await window.dataverseAPI.update(
                "environmentvariabledefinitions",
                definitionId,
                {
                    defaultvalue: defaultValue,
                }
            );
        } catch (error) {
            console.error("Error updating default value:", error);
            throw error;
        }
    }

    /**
     * Create or update an environment-specific value
     */
    static async setEnvironmentValue(
        definitionId: string,
        value: string,
        existingValueId?: string
    ): Promise<void> {
        if (!window.dataverseAPI) {
            throw new Error("Dataverse API not available");
        }

        try {
            if (existingValueId) {
                // Update existing value
                await window.dataverseAPI.update(
                    "environmentvariablevalues",
                    existingValueId,
                    {
                        value: value,
                    }
                );
            } else {
                // Create new value
                await window.dataverseAPI.create("environmentvariablevalues", {
                    "environmentvariabledefinitionid@odata.bind": `/environmentvariabledefinitions(${definitionId})`,
                    value: value,
                    statecode: 0,
                    statuscode: 1,
                });
            }
        } catch (error) {
            console.error("Error setting environment value:", error);
            throw error;
        }
    }

    /**
     * Delete an environment variable definition
     */
    static async deleteEnvironmentVariable(definitionId: string): Promise<void> {
        if (!window.dataverseAPI) {
            throw new Error("Dataverse API not available");
        }

        try {
            await window.dataverseAPI.delete(
                "environmentvariabledefinitions",
                definitionId
            );
        } catch (error) {
            console.error("Error deleting environment variable:", error);
            throw error;
        }
    }

    /**
     * Delete an environment-specific value
     */
    static async deleteEnvironmentValue(valueId: string): Promise<void> {
        if (!window.dataverseAPI) {
            throw new Error("Dataverse API not available");
        }

        try {
            await window.dataverseAPI.delete("environmentvariablevalues", valueId);
        } catch (error) {
            console.error("Error deleting environment value:", error);
            throw error;
        }
    }
}
