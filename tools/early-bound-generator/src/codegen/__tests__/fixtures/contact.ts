import type { EntityMetadata } from "../../types";

export const contactEntity: EntityMetadata = {
    LogicalName: "contact",
    SchemaName: "Contact",
    DisplayName: {
        LocalizedLabels: [{ Label: "Contact", LanguageCode: 1033 }],
    },
    Description: {
        LocalizedLabels: [{ Label: "Person with whom a business unit has a relationship, such as a customer, supplier, or colleague.", LanguageCode: 1033 }],
    },
    LogicalCollectionName: "contacts",
    EntitySetName: "contacts",
    PrimaryIdAttribute: "contactid",
    PrimaryNameAttribute: "fullname",
    Keys: [],
    Attributes: [
        {
            LogicalName: "contactid",
            SchemaName: "ContactId",
            DisplayName: { LocalizedLabels: [{ Label: "Contact", LanguageCode: 1033 }] },
            AttributeType: "Uniqueidentifier",
            IsPrimaryId: true,
            IsValidForCreate: true,
            IsValidForUpdate: false,
            IsValidForRead: true,
        },

        {
            LogicalName: "fullname",
            SchemaName: "FullName",
            DisplayName: { LocalizedLabels: [{ Label: "Full Name", LanguageCode: 1033 }] },
            AttributeType: "String",
            IsPrimaryName: true,
            IsValidForCreate: false,
            IsValidForUpdate: false,
            IsValidForRead: true,
        },

        {
            LogicalName: "firstname",
            SchemaName: "FirstName",
            DisplayName: { LocalizedLabels: [{ Label: "First Name", LanguageCode: 1033 }] },
            AttributeType: "String",
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
        },

        {
            LogicalName: "description",
            SchemaName: "Description",
            DisplayName: { LocalizedLabels: [{ Label: "Description", LanguageCode: 1033 }] },
            AttributeType: "Memo",
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
        },

        {
            LogicalName: "numberofchildren",
            SchemaName: "NumberOfChildren",
            DisplayName: { LocalizedLabels: [{ Label: "No. of Children", LanguageCode: 1033 }] },
            AttributeType: "Integer",
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
        },

        {
            LogicalName: "annualincome",
            SchemaName: "AnnualIncome",
            DisplayName: { LocalizedLabels: [{ Label: "Annual Income", LanguageCode: 1033 }] },
            AttributeType: "Money",
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
        },

        {
            LogicalName: "donotphone",
            SchemaName: "DoNotPhone",
            DisplayName: { LocalizedLabels: [{ Label: "Do not allow Phone Calls", LanguageCode: 1033 }] },
            AttributeType: "Boolean",
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
        },

        {
            LogicalName: "birthdate",
            SchemaName: "BirthDate",
            DisplayName: { LocalizedLabels: [{ Label: "Birthday", LanguageCode: 1033 }] },
            AttributeType: "DateTime",
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
        },

        {
            LogicalName: "parentcustomerid",
            SchemaName: "ParentCustomerId",
            DisplayName: { LocalizedLabels: [{ Label: "Company Name", LanguageCode: 1033 }] },
            AttributeType: "Customer",
            Targets: ["account", "contact"],
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
        },

        {
            LogicalName: "parentcustomeridname",
            SchemaName: "ParentCustomerIdName",
            DisplayName: { LocalizedLabels: [{ Label: "Company Name (Name)", LanguageCode: 1033 }] },
            AttributeType: "String",
            AttributeOf: "parentcustomerid",
            IsValidForCreate: false,
            IsValidForUpdate: false,
            IsValidForRead: true,
        },

        {
            LogicalName: "gendercode",
            SchemaName: "GenderCode",
            DisplayName: { LocalizedLabels: [{ Label: "Gender", LanguageCode: 1033 }] },
            AttributeType: "Picklist",
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
            OptionSet: {
                MetadataId: "aaa00001-0000-0000-0000-000000000001",
                Name: "contact_gendercode",
                DisplayName: { LocalizedLabels: [{ Label: "Gender", LanguageCode: 1033 }] },
                OptionSetType: "Picklist",
                IsGlobal: false,
                Options: [
                    { Value: 1, Label: { LocalizedLabels: [{ Label: "Male", LanguageCode: 1033 }] } },
                    { Value: 2, Label: { LocalizedLabels: [{ Label: "Female", LanguageCode: 1033 }] } },
                ],
            },
        },

        {
            LogicalName: "statecode",
            SchemaName: "StateCode",
            DisplayName: { LocalizedLabels: [{ Label: "Status", LanguageCode: 1033 }] },
            AttributeType: "State",
            IsValidForCreate: false,
            IsValidForUpdate: true,
            IsValidForRead: true,
            OptionSet: {
                MetadataId: "aaa00002-0000-0000-0000-000000000001",
                Name: "contact_statecode",
                DisplayName: { LocalizedLabels: [{ Label: "Status", LanguageCode: 1033 }] },
                OptionSetType: "State",
                IsGlobal: false,
                Options: [
                    { Value: 0, Label: { LocalizedLabels: [{ Label: "Active", LanguageCode: 1033 }] } },
                    { Value: 1, Label: { LocalizedLabels: [{ Label: "Inactive", LanguageCode: 1033 }] } },
                ],
            },
        },

        {
            LogicalName: "statuscode",
            SchemaName: "StatusCode",
            DisplayName: { LocalizedLabels: [{ Label: "Status Reason", LanguageCode: 1033 }] },
            AttributeType: "Status",
            IsValidForCreate: true,
            IsValidForUpdate: true,
            IsValidForRead: true,
            OptionSet: {
                MetadataId: "aaa00003-0000-0000-0000-000000000001",
                Name: "contact_statuscode",
                DisplayName: { LocalizedLabels: [{ Label: "Status Reason", LanguageCode: 1033 }] },
                OptionSetType: "Status",
                IsGlobal: false,
                Options: [
                    { Value: 1, Label: { LocalizedLabels: [{ Label: "Active", LanguageCode: 1033 }] } },
                    { Value: 2, Label: { LocalizedLabels: [{ Label: "Inactive", LanguageCode: 1033 }] } },
                ],
            },
        },

        {
            LogicalName: "aging30",
            SchemaName: "Aging30",
            DisplayName: { LocalizedLabels: [{ Label: "Aging 30", LanguageCode: 1033 }] },
            AttributeType: "Money",
            IsValidForCreate: false,
            IsValidForUpdate: false,
            IsValidForRead: true,
        },
    ],
    OneToManyRelationships: [
        {
            SchemaName: "contact_customer_contacts",
            RelationshipType: "OneToManyRelationship",
            ReferencedEntity: "contact",
            ReferencingEntity: "contact",
            ReferencedEntityNavigationPropertyName: "contact_customer_contacts",
            ReferencingEntityNavigationPropertyName: "parentcustomerid_contact",
        },
    ],
    ManyToOneRelationships: [
        {
            SchemaName: "contact_owning_user",
            RelationshipType: "OneToManyRelationship",
            ReferencedEntity: "systemuser",
            ReferencingEntity: "contact",
            ReferencedEntityNavigationPropertyName: "contact_owning_user",
            ReferencingEntityNavigationPropertyName: "owninguser",
        },
    ],
    ManyToManyRelationships: [
        {
            SchemaName: "contactleads_association",
            RelationshipType: "ManyToManyRelationship",
            Entity1LogicalName: "contact",
            Entity2LogicalName: "lead",
            Entity1NavigationPropertyName: "contactleads_association",
            Entity2NavigationPropertyName: "contactleads_association",
        },
    ],
};

export const systemUserEntity: EntityMetadata = {
    LogicalName: "systemuser",
    SchemaName: "SystemUser",
    DisplayName: { LocalizedLabels: [{ Label: "User", LanguageCode: 1033 }] },
    LogicalCollectionName: "systemusers",
    EntitySetName: "systemusers",
    PrimaryIdAttribute: "systemuserid",
    PrimaryNameAttribute: "fullname",
    Keys: [],
    Attributes: [
        {
            LogicalName: "systemuserid",
            SchemaName: "SystemUserId",
            DisplayName: { LocalizedLabels: [{ Label: "User", LanguageCode: 1033 }] },
            AttributeType: "Uniqueidentifier",
            IsPrimaryId: true,
            IsValidForCreate: true,
            IsValidForUpdate: false,
            IsValidForRead: true,
        },
        {
            LogicalName: "fullname",
            SchemaName: "FullName",
            DisplayName: { LocalizedLabels: [{ Label: "Full Name", LanguageCode: 1033 }] },
            AttributeType: "String",
            IsPrimaryName: true,
            IsValidForCreate: false,
            IsValidForUpdate: false,
            IsValidForRead: true,
        },
    ],
    OneToManyRelationships: [],
    ManyToOneRelationships: [],
    ManyToManyRelationships: [],
};
