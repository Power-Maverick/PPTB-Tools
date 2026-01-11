export interface Entity {
    logicalName: string;
    displayName: string;
    objectTypeCode: number;
}

export interface View {
    savedqueryid: string;
    name: string;
    fetchxml: string;
    layoutxml: string;
    returnedtypecode: string;
    querytype: number;
}

export interface ViewListItem {
    id: string;
    name: string;
    type: "system" | "user";
}
