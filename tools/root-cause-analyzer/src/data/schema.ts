import { classifyError } from "../host/errors";
import type { ReadOnlyDataverse } from "../host/readOnlyDataverse";
import type { SourceId, TableSchema } from "../model/types";

export interface TableRequirement {
    table: string;
    /** Without these the dependent source is unavailable. */
    required: string[];
    /** Nice to have; their absence only degrades detail. */
    optional: string[];
}

/**
 * Every table/column the tool reads. Names are checked against EntityDefinitions at runtime;
 * queries later select only columns that verification found.
 */
export const REQUIREMENTS: TableRequirement[] = [
    {
        table: "organization",
        required: ["plugintracelogsetting", "isauditenabled"],
        optional: ["auditretentionperiodv2", "isuseraccessauditenabled"],
    },
    {
        table: "sdkmessageprocessingstep",
        required: ["name", "stage", "mode", "rank", "filteringattributes", "statecode", "sdkmessageid", "sdkmessagefilterid", "eventhandler"],
        optional: ["plugintypeid", "impersonatinguserid", "asyncautodelete", "supporteddeployment", "modifiedon", "modifiedby", "ishidden", "customizationlevel"],
    },
    { table: "sdkmessagefilter", required: ["primaryobjecttypecode", "sdkmessageid"], optional: ["secondaryobjecttypecode"] },
    { table: "sdkmessage", required: ["name"], optional: [] },
    { table: "plugintype", required: ["typename"], optional: ["assemblyname", "friendlyname", "isworkflowactivity", "pluginassemblyid"] },
    { table: "pluginassembly", required: ["name"], optional: ["version", "isolationmode", "sourcetype", "modifiedon", "modifiedby"] },
    { table: "sdkmessageprocessingstepimage", required: ["imagetype", "attributes", "sdkmessageprocessingstepid"], optional: ["entityalias", "name"] },
    {
        table: "workflow",
        required: ["name", "category", "statecode", "primaryentity", "mode", "type", "modifiedon", "modifiedby"],
        optional: ["clientdata", "xaml", "triggeronupdateattributelist", "triggeroncreate", "triggerondelete", "ondemand", "scope", "runas", "statuscode", "workflowidunique", "ownerid", "activeworkflowid"],
    },
    {
        table: "plugintracelog",
        required: ["correlationid", "requestid", "depth", "messagename", "primaryentity", "typename", "mode", "operationtype", "performanceexecutionstarttime", "createdon"],
        optional: ["pluginstepid", "performanceexecutionduration", "exceptiondetails", "messageblock", "persistencekey"],
    },
    {
        table: "asyncoperation",
        required: ["name", "correlationid", "depth", "regardingobjectid", "operationtype", "statecode", "statuscode", "createdon"],
        optional: ["message", "friendlymessage", "workflowactivationid", "completedon", "startedon", "owningextensionid", "retrycount", "errorcode", "requestid", "ownerid"],
    },
    {
        table: "audit",
        required: ["objectid", "objecttypecode", "action", "operation", "userid", "attributemask", "createdon"],
        optional: ["callinguserid", "transactionid", "changedata"],
    },
    { table: "systemuser", required: ["fullname"], optional: ["applicationid", "accessmode", "domainname"] },
    {
        // flowrun's shape varies across service updates; nothing is assumed beyond the table existing.
        table: "flowrun",
        required: [],
        optional: ["name", "status", "starttime", "endtime", "duration", "triggertype", "errorcode", "errormessage", "workflow", "workflowid", "createdon"],
    },
];

export const SOURCE_TABLES: Record<SourceId, string[]> = {
    "wiring.plugins": ["sdkmessageprocessingstep", "sdkmessagefilter", "sdkmessage", "plugintype"],
    "wiring.workflows": ["workflow"],
    "history.trace": ["plugintracelog"],
    "history.traceSuccess": ["plugintracelog"],
    "history.async": ["asyncoperation"],
    "history.audit": ["audit"],
    "history.flowrun": ["flowrun"],
    "history.flowrunApi": [],
};

export async function verifyTable(dv: ReadOnlyDataverse, req: TableRequirement): Promise<TableSchema> {
    try {
        const meta = await dv.entityMetadata(req.table, ["LogicalName", "EntitySetName", "OwnershipType"]);
        const attributes = await dv.entityAttributes(req.table, ["LogicalName"]);
        return compareSchema(req, attributes.map((a) => String(a.LogicalName)), {
            entitySetName: meta.EntitySetName as string | undefined,
            ownership: meta.OwnershipType as string | undefined,
        });
    } catch (error) {
        const classified = classifyError(error);
        return {
            table: req.table,
            exists: false,
            columns: [],
            missingRequired: req.required,
            missingOptional: req.optional,
            error: classified.kind === "notFound" ? `Table '${req.table}' does not exist in this environment` : classified.message,
        };
    }
}

/** Pure: compares discovered columns with the requirement. */
export function compareSchema(req: TableRequirement, columns: string[], meta: { entitySetName?: string; ownership?: string } = {}): TableSchema {
    const present = new Set(columns.map((c) => c.toLowerCase()));
    return {
        table: req.table,
        exists: true,
        entitySetName: meta.entitySetName,
        ownership: meta.ownership,
        columns: [...present].sort(),
        missingRequired: req.required.filter((c) => !present.has(c)),
        missingOptional: req.optional.filter((c) => !present.has(c)),
    };
}

export async function verifyAll(dv: ReadOnlyDataverse): Promise<Record<string, TableSchema>> {
    const results = await Promise.all(REQUIREMENTS.map((req) => verifyTable(dv, req)));
    return Object.fromEntries(results.map((r) => [r.table, r]));
}
