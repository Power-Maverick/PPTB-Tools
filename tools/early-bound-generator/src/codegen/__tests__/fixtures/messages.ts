import type { SdkMessagePair } from "../../types";

export const calculateCommissionMessage: SdkMessagePair = {
    Request: {
        Name: "contoso_CalculateCommission",
        Fields: [
            {
                Name: "OpportunityId",
                ClrFormatter: "System.Guid",
                IsOptional: false,
                Index: 0,
            },
            {
                Name: "OverrideRate",
                ClrFormatter: "System.Nullable<decimal>",
                IsOptional: true,
                Index: 1,
            },
        ],
    },
    Response: {
        Fields: [
            {
                Name: "CommissionAmount",
                ClrFormatter: "System.Nullable<decimal>",
                Index: 0,
            },
            {
                Name: "BreakdownJson",
                ClrFormatter: "string",
                Index: 1,
            },
        ],
    },
};

export const noFieldsMessage: SdkMessagePair = {
    Request: {
        Name: "contoso_TriggerSync",
        Fields: [],
    },
    Response: {
        Fields: [],
    },
};
