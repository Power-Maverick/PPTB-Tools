import type {
    PluginAssembly,
    PluginType,
    ProcessingStep,
    StepImage,
    SdkMessage,
    SdkMessageFilter,
} from "../models/interfaces";

export class DataverseClient {
    async fetchAssemblies(): Promise<PluginAssembly[]> {
        try {
            const response = await window.dataverseAPI.queryData(
                "pluginassemblies?$select=pluginassemblyid,name,version,culture,publickeytoken,sourcetype,isolationmode,description&$orderby=name",
                "primary",
            );
            return (response.value as Record<string, unknown>[]).map((a) => ({
                pluginassemblyid: a["pluginassemblyid"] as string,
                name: a["name"] as string,
                version: a["version"] as string,
                culture: a["culture"] as string,
                publickeytoken: a["publickeytoken"] as string,
                sourcetype: a["sourcetype"] as number,
                isolationmode: a["isolationmode"] as number,
                description: (a["description"] as string) ?? "",
            }));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch assemblies: ${msg}`);
        }
    }

    async fetchPluginTypes(assemblyId: string): Promise<PluginType[]> {
        try {
            const response = await window.dataverseAPI.queryData(
                `plugintypes?$select=plugintypeid,name,typename,friendlyname,description,isworkflowactivity,workflowactivitygroupname&$filter=_pluginassemblyid_value eq '${assemblyId}'&$orderby=typename`,
                "primary",
            );
            return (response.value as Record<string, unknown>[]).map((t) => ({
                plugintypeid: t["plugintypeid"] as string,
                name: t["name"] as string,
                typename: t["typename"] as string,
                friendlyname: (t["friendlyname"] as string) ?? "",
                description: (t["description"] as string) ?? "",
                isworkflowactivity: (t["isworkflowactivity"] as boolean) ?? false,
                workflowactivitygroupname: (t["workflowactivitygroupname"] as string) ?? "",
                pluginassemblyid: assemblyId,
                assemblyname: "",
            }));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch plugin types: ${msg}`);
        }
    }

    async fetchSteps(pluginTypeId: string): Promise<ProcessingStep[]> {
        try {
            const response = await window.dataverseAPI.queryData(
                `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,description,rank,mode,stage,filteringattributes,asyncautodelete,statecode&$filter=_eventhandler_value eq '${pluginTypeId}'&$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=name`,
                "primary",
            );
            return (response.value as Record<string, unknown>[]).map((s) => {
                const msgExpand = s["sdkmessageid"] as Record<string, unknown> | null;
                const filterExpand = s["sdkmessagefilterid"] as Record<string, unknown> | null;
                return {
                    sdkmessageprocessingstepid: s["sdkmessageprocessingstepid"] as string,
                    name: s["name"] as string,
                    description: (s["description"] as string) ?? "",
                    rank: (s["rank"] as number) ?? 1,
                    mode: (s["mode"] as number) ?? 0,
                    stage: (s["stage"] as number) ?? 40,
                    sdkmessageid: (s["_sdkmessageid_value"] as string) ?? "",
                    messageName: (msgExpand?.["name"] as string) ?? "",
                    sdkmessagefilterid: (s["_sdkmessagefilterid_value"] as string) ?? "",
                    primaryEntityName: (filterExpand?.["primaryobjecttypecode"] as string) ?? "none",
                    filteringattributes: (s["filteringattributes"] as string) ?? "",
                    asyncautodelete: (s["asyncautodelete"] as boolean) ?? false,
                    statecode: (s["statecode"] as number) ?? 0,
                    plugintypeid: pluginTypeId,
                };
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch steps: ${msg}`);
        }
    }

    async fetchImages(stepId: string): Promise<StepImage[]> {
        try {
            const response = await window.dataverseAPI.queryData(
                `sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,name,entityalias,imagetype,messagepropertyname,attributes,description&$filter=_sdkmessageprocessingstepid_value eq '${stepId}'&$orderby=name`,
                "primary",
            );
            return (response.value as Record<string, unknown>[]).map((i) => ({
                sdkmessageprocessingstepimageid: i["sdkmessageprocessingstepimageid"] as string,
                name: i["name"] as string,
                entityalias: i["entityalias"] as string,
                imagetype: i["imagetype"] as number,
                messagepropertyname: (i["messagepropertyname"] as string) ?? "Target",
                attributes: (i["attributes"] as string) ?? "",
                sdkmessageprocessingstepid: stepId,
                description: (i["description"] as string) ?? "",
            }));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch images: ${msg}`);
        }
    }

    async fetchMessages(): Promise<SdkMessage[]> {
        try {
            const response = await window.dataverseAPI.queryData(
                "sdkmessages?$select=sdkmessageid,name&$orderby=name",
                "primary",
            );
            return (response.value as Record<string, unknown>[]).map((m) => ({
                sdkmessageid: m["sdkmessageid"] as string,
                name: m["name"] as string,
            }));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch messages: ${msg}`);
        }
    }

    async fetchMessageFilters(messageId: string): Promise<SdkMessageFilter[]> {
        try {
            const response = await window.dataverseAPI.queryData(
                `sdkmessagefilters?$select=sdkmessagefilterid,primaryobjecttypecode&$filter=_sdkmessageid_value eq '${messageId}'&$orderby=primaryobjecttypecode`,
                "primary",
            );
            return (response.value as Record<string, unknown>[]).map((f) => ({
                sdkmessagefilterid: f["sdkmessagefilterid"] as string,
                sdkmessageid: messageId,
                primaryobjecttypecode: f["primaryobjecttypecode"] as string,
            }));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch message filters: ${msg}`);
        }
    }

    async registerAssembly(
        content: string,
        name: string,
        isolationMode: number,
        description: string,
    ): Promise<string> {
        try {
            const result = await window.dataverseAPI.create(
                "pluginassembly",
                {
                    content,
                    name,
                    isolationmode: isolationMode,
                    description,
                    sourcetype: 0,
                },
                "primary",
            );
            return result.id;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to register assembly: ${msg}`);
        }
    }

    async updateAssembly(
        assemblyId: string,
        content: string,
        description: string,
    ): Promise<void> {
        try {
            await window.dataverseAPI.update(
                "pluginassembly",
                assemblyId,
                { content, description },
                "primary",
            );
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to update assembly: ${msg}`);
        }
    }

    async deleteAssembly(assemblyId: string): Promise<void> {
        try {
            await window.dataverseAPI.delete("pluginassembly", assemblyId, "primary");
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete assembly: ${msg}`);
        }
    }

    async registerStep(stepData: Partial<ProcessingStep> & {
        messageId: string;
        filterId?: string;
        pluginTypeId: string;
    }): Promise<string> {
        try {
            const payload: Record<string, unknown> = {
                name: stepData.name,
                description: stepData.description ?? "",
                rank: stepData.rank ?? 1,
                mode: stepData.mode ?? 0,
                stage: stepData.stage ?? 40,
                filteringattributes: stepData.filteringattributes ?? "",
                asyncautodelete: stepData.asyncautodelete ?? false,
                "sdkmessageid@odata.bind": `/sdkmessages(${stepData.messageId})`,
                "eventhandler_plugintype@odata.bind": `/plugintypes(${stepData.pluginTypeId})`,
            };
            if (stepData.filterId) {
                payload["sdkmessagefilterid@odata.bind"] = `/sdkmessagefilters(${stepData.filterId})`;
            }
            const result = await window.dataverseAPI.create(
                "sdkmessageprocessingstep",
                payload,
                "primary",
            );
            return result.id;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to register step: ${msg}`);
        }
    }

    async updateStep(
        stepId: string,
        stepData: Partial<ProcessingStep> & { messageId?: string; filterId?: string },
    ): Promise<void> {
        try {
            const payload: Record<string, unknown> = {};
            if (stepData.name !== undefined) payload["name"] = stepData.name;
            if (stepData.description !== undefined) payload["description"] = stepData.description;
            if (stepData.rank !== undefined) payload["rank"] = stepData.rank;
            if (stepData.mode !== undefined) payload["mode"] = stepData.mode;
            if (stepData.stage !== undefined) payload["stage"] = stepData.stage;
            if (stepData.filteringattributes !== undefined) payload["filteringattributes"] = stepData.filteringattributes;
            if (stepData.asyncautodelete !== undefined) payload["asyncautodelete"] = stepData.asyncautodelete;
            if (stepData.messageId) payload["sdkmessageid@odata.bind"] = `/sdkmessages(${stepData.messageId})`;
            if (stepData.filterId) payload["sdkmessagefilterid@odata.bind"] = `/sdkmessagefilters(${stepData.filterId})`;
            await window.dataverseAPI.update("sdkmessageprocessingstep", stepId, payload, "primary");
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to update step: ${msg}`);
        }
    }

    async deleteStep(stepId: string): Promise<void> {
        try {
            await window.dataverseAPI.delete("sdkmessageprocessingstep", stepId, "primary");
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete step: ${msg}`);
        }
    }

    async enableStep(stepId: string): Promise<void> {
        try {
            await window.dataverseAPI.update(
                "sdkmessageprocessingstep",
                stepId,
                { statecode: 0, statuscode: 1 },
                "primary",
            );
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to enable step: ${msg}`);
        }
    }

    async disableStep(stepId: string): Promise<void> {
        try {
            await window.dataverseAPI.update(
                "sdkmessageprocessingstep",
                stepId,
                { statecode: 1, statuscode: 2 },
                "primary",
            );
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to disable step: ${msg}`);
        }
    }

    async registerImage(imageData: Partial<StepImage> & { stepId: string }): Promise<string> {
        try {
            const payload: Record<string, unknown> = {
                name: imageData.name,
                entityalias: imageData.entityalias,
                imagetype: imageData.imagetype ?? 0,
                messagepropertyname: imageData.messagepropertyname ?? "Target",
                attributes: imageData.attributes ?? "",
                description: imageData.description ?? "",
                "sdkmessageprocessingstepid@odata.bind": `/sdkmessageprocessingsteps(${imageData.stepId})`,
            };
            const result = await window.dataverseAPI.create(
                "sdkmessageprocessingstepimage",
                payload,
                "primary",
            );
            return result.id;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to register image: ${msg}`);
        }
    }

    async updateImage(imageId: string, imageData: Partial<StepImage>): Promise<void> {
        try {
            const payload: Record<string, unknown> = {};
            if (imageData.name !== undefined) payload["name"] = imageData.name;
            if (imageData.entityalias !== undefined) payload["entityalias"] = imageData.entityalias;
            if (imageData.imagetype !== undefined) payload["imagetype"] = imageData.imagetype;
            if (imageData.messagepropertyname !== undefined) payload["messagepropertyname"] = imageData.messagepropertyname;
            if (imageData.attributes !== undefined) payload["attributes"] = imageData.attributes;
            if (imageData.description !== undefined) payload["description"] = imageData.description;
            await window.dataverseAPI.update("sdkmessageprocessingstepimage", imageId, payload, "primary");
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to update image: ${msg}`);
        }
    }

    async deleteImage(imageId: string): Promise<void> {
        try {
            await window.dataverseAPI.delete("sdkmessageprocessingstepimage", imageId, "primary");
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to delete image: ${msg}`);
        }
    }
}
