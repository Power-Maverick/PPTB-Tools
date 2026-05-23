export class DataverseClient {
    async fetchAllEntities(): Promise<Array<{ logicalName: string; displayName: string }>> {
        try {
            const response = await window.dataverseAPI.queryData("EntityDefinitions?$select=LogicalName,DisplayName&$orderby=LogicalName");
            return (response.value as Record<string, unknown>[]).map((e) => {
                const dn = e["DisplayName"] as Record<string, unknown> | null;
                const label = (dn?.["UserLocalizedLabel"] as Record<string, unknown> | null)?.["Label"] as string | undefined;
                return {
                    logicalName: (e["LogicalName"] as string) ?? "",
                    displayName: label ?? "",
                };
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch entities: ${msg}`);
        }
    }
}
