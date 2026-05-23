export const CODEGEN_TOOL_NAME = "Dataverse Model Builder";

export interface LocalizedLabel {
    Label: string;
    LanguageCode: number;
}

export interface Label {
    LocalizedLabels: LocalizedLabel[];
    UserLocalizedLabel?: LocalizedLabel;
}

export interface OptionMetadata {
    Value: number | null;
    Label: Label;
    Description?: Label;
    Color?: string;
    DisplayOrder?: number;
}

export interface OptionSetMetadata {
    MetadataId: string;
    Name: string;
    DisplayName: Label;
    Description?: Label;
    OptionSetType: "Picklist" | "State" | "Status" | "Boolean" | string;
    IsGlobal: boolean | null;
    Options: OptionMetadata[];
}

export type AttributeType =
    | "String"
    | "Integer"
    | "BigInt"
    | "Double"
    | "Decimal"
    | "Money"
    | "Boolean"
    | "DateTime"
    | "Lookup"
    | "Customer"
    | "Owner"
    | "Uniqueidentifier"
    | "Picklist"
    | "State"
    | "Status"
    | "Memo"
    | "Image"
    | "File"
    | "Virtual"
    | "MultiSelectPicklist"
    | "CalendarRules"
    | "PartyList"
    | "ManagedProperty"
    | "EntityName"
    | string;

export interface AttributeMetadata {
    LogicalName: string;
    SchemaName: string;
    DisplayName: Label;
    Description?: Label;
    AttributeType: AttributeType;
    AttributeTypeName?: { Value: string };
    AttributeOf?: string | null;
    IsValidForCreate?: boolean;
    IsValidForUpdate?: boolean;
    IsValidForRead?: boolean;
    IsPrimaryId?: boolean;
    IsPrimaryName?: boolean;
    IsRenameable?: { Value: boolean };
    Targets?: string[];
    OptionSet?: OptionSetMetadata;
    DeprecatedVersion?: string | null;
}

export interface RelationshipMetadata {
    SchemaName: string;
    RelationshipType: "OneToManyRelationship" | "ManyToManyRelationship";
    ReferencedEntity?: string;
    ReferencingEntity?: string;
    ReferencedEntityNavigationPropertyName?: string;
    ReferencingEntityNavigationPropertyName?: string;
    Entity1LogicalName?: string;
    Entity2LogicalName?: string;
    Entity1NavigationPropertyName?: string;
    Entity2NavigationPropertyName?: string;
}

export interface EntityKeyMetadata {
    MetadataId?: string;
    KeyAttributes: string[];
}

export interface EntityMetadata {
    LogicalName: string;
    SchemaName: string;
    DisplayName: Label;
    Description?: Label;
    LogicalCollectionName?: string;
    EntitySetName?: string;
    PrimaryIdAttribute?: string;
    PrimaryNameAttribute?: string;
    Keys?: EntityKeyMetadata[];
    Attributes: AttributeMetadata[];
    OneToManyRelationships?: RelationshipMetadata[];
    ManyToOneRelationships?: RelationshipMetadata[];
    ManyToManyRelationships?: RelationshipMetadata[];
}

export interface SdkMessageRequestField {
    Name: string;
    ClrFormatter?: string;
    IsOptional?: boolean;
    Index?: number;
}

export interface SdkMessageResponseField {
    Name: string;
    ClrFormatter?: string;
    Index?: number;
}

export interface SdkMessagePair {
    Request: {
        Name: string;
        Fields: SdkMessageRequestField[];
    };
    Response: {
        Fields: SdkMessageResponseField[];
    };
}
