import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomApi } from "../src/models/interfaces";
import { newCustomApi, newCustomApiField } from "../src/utils/customApiRules";
import { CustomApiCreatedError, DataverseClient } from "../src/utils/DataverseClient";

const API_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const RESPONSE_ID = "44444444-4444-4444-8444-444444444444";
const NEW_CHILD_ID = "66666666-6666-4666-8666-666666666666";
const SOLUTION_ID = "77777777-7777-4777-8777-777777777777";

const create = vi.fn();
const update = vi.fn();
const del = vi.fn();
const execute = vi.fn();
const queryData = vi.fn();
const getEntityMetadata = vi.fn();
const client = new DataverseClient();

/** Answers queryData by the start of the query; every call is recorded in order. */
let queryAnswers: [string, Record<string, unknown>[]][] = [];

/** Every write in call order, to check the order Dataverse sees them in. */
const writes: string[] = [];

beforeEach(() => {
    writes.length = 0;
    for (const fn of [create, update, del, execute, queryData, getEntityMetadata]) fn.mockReset();
    create.mockImplementation(async (table: string) => {
        writes.push(`create ${table}`);
        return { id: table === "customapi" ? API_ID : NEW_CHILD_ID };
    });
    update.mockImplementation(async (table: string, id: string) => void writes.push(`update ${table} ${id}`));
    del.mockImplementation(async (table: string, id: string) => void writes.push(`delete ${table} ${id}`));
    execute.mockImplementation(async (request: { parameters: Record<string, unknown> }) => {
        writes.push(`add ${String(request.parameters["ComponentId"])} to ${String(request.parameters["SolutionUniqueName"])}`);
        return {};
    });
    queryAnswers = [];
    queryData.mockImplementation(async (query: string) => {
        const answer = queryAnswers.find(([start]) => query.startsWith(start));
        return { value: answer ? answer[1] : [] };
    });
    vi.stubGlobal("window", { dataverseAPI: { create, update, delete: del, execute, queryData, getEntityMetadata } });
});

function savedApi(): CustomApi {
    return {
        ...newCustomApi(),
        customapiid: API_ID,
        name: "sample_Echo",
        uniquename: "sample_Echo",
        displayname: "Echo",
        description: "Returns its input",
        requestParameters: [{ ...newCustomApiField(API_ID), id: REQUEST_ID, name: "Input", uniquename: "Input", displayname: "Input" }],
        responseProperties: [{ ...newCustomApiField(API_ID), id: RESPONSE_ID, name: "Output", uniquename: "Output", displayname: "Output" }],
    };
}

function copy(api: CustomApi): CustomApi {
    return { ...api, requestParameters: api.requestParameters.map((p) => ({ ...p })), responseProperties: api.responseProperties.map((p) => ({ ...p })) };
}

describe("isCustomApiSupported", () => {
    it("is true when the customapi table exists and false on any error", async () => {
        getEntityMetadata.mockResolvedValueOnce({ LogicalName: "customapi" });
        await expect(client.isCustomApiSupported()).resolves.toBe(true);
        expect(getEntityMetadata).toHaveBeenCalledWith("customapi", true, ["LogicalName"]);

        getEntityMetadata.mockRejectedValueOnce(new Error("not found"));
        await expect(client.isCustomApiSupported()).resolves.toBe(false);
    });
});

describe("fetchCustomApis", () => {
    it("joins request parameters and response properties to their API and reads managed properties", async () => {
        queryAnswers = [
            ["customapis?", [{
                customapiid: API_ID, name: "sample_Echo", uniquename: "sample_Echo", displayname: "Echo", description: null,
                bindingtype: 1, boundentitylogicalname: "account", allowedcustomprocessingsteptype: 2, _plugintypeid_value: null,
                _sdkmessageid_value: "msg-id", executeprivilegename: null, isfunction: false, isprivate: true,
                workflowsdkstepenabled: false, ismanaged: true, iscustomizable: { Value: false, CanBeChanged: false },
            }]],
            ["customapirequestparameters?", [{
                customapirequestparameterid: REQUEST_ID, _customapiid_value: API_ID.toUpperCase(), name: "Input", uniquename: "Input",
                displayname: "Input", description: null, type: 10, logicalentityname: null, isoptional: true, ismanaged: true,
                iscustomizable: { Value: true },
            }]],
            ["customapiresponseproperties?", [{
                customapiresponsepropertyid: RESPONSE_ID, _customapiid_value: API_ID, name: "Output", uniquename: "Output",
                displayname: "Output", type: 0, ismanaged: false,
            }]],
        ];

        const [api] = await client.fetchCustomApis();

        expect(api).toMatchObject({
            customapiid: API_ID, description: "", bindingtype: 1, boundentitylogicalname: "account", plugintypeid: undefined,
            sdkmessageid: "msg-id", isprivate: true, ismanaged: true, iscustomizable: false,
        });
        expect(api.requestParameters).toEqual([expect.objectContaining({ id: REQUEST_ID, isoptional: true, iscustomizable: true, logicalentityname: "" })]);
        expect(api.responseProperties).toEqual([expect.objectContaining({ id: RESPONSE_ID, type: 0, iscustomizable: true })]);
    });

    it("keeps an unset choice as -1 so a save can't quietly change the contract", async () => {
        queryAnswers = [["customapis?", [{ customapiid: API_ID, uniquename: "x" }]]];
        const [api] = await client.fetchCustomApis();
        expect(api.bindingtype).toBe(-1);
        expect(api.allowedcustomprocessingsteptype).toBe(-1);
    });

    it("wraps failures", async () => {
        queryData.mockRejectedValueOnce(new Error("boom"));
        await expect(client.fetchCustomApis()).rejects.toThrow("Failed to fetch Custom APIs: boom");
    });
});

describe("createCustomApi", () => {
    beforeEach(() => {
        queryAnswers = [
            ["solutions?$select=uniquename&$filter=uniquename eq 'Contoso'", [{ uniquename: "Contoso", publisherid: { customizationprefix: "sample" } }]],
            ["solutioncomponentdefinitions?", [{ solutioncomponenttype: 10000 }]],
            ["customapirequestparameters?$select=customapirequestparameterid&$filter=_customapiid_value eq", [{ customapirequestparameterid: REQUEST_ID }]],
            ["customapiresponseproperties?$select=customapiresponsepropertyid&$filter=_customapiid_value eq", [{ customapiresponsepropertyid: RESPONSE_ID }]],
        ];
    });

    it("creates the API and its children in one request, then adds all of them to the solution", async () => {
        const draft = savedApi();
        draft.customapiid = "";
        draft.requestParameters[0].id = "";
        draft.responseProperties[0].id = "";

        await expect(client.createCustomApi(draft, "Contoso")).resolves.toBe(API_ID);

        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith("customapi", expect.objectContaining({
            uniquename: "sample_Echo",
            CustomAPIRequestParameters: [expect.objectContaining({ uniquename: "Input" })],
            CustomAPIResponseProperties: [expect.objectContaining({ uniquename: "Output" })],
        }), "primary");
        expect(writes).toEqual([
            "create customapi",
            `add ${API_ID} to Contoso`,
            `add ${REQUEST_ID} to Contoso`,
            `add ${RESPONSE_ID} to Contoso`,
        ]);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({
            operationName: "AddSolutionComponent",
            parameters: expect.objectContaining({ ComponentType: 10000, AddRequiredComponents: false }),
        }));
    });

    it("refuses a unique name without the publisher prefix before creating anything", async () => {
        const draft = { ...savedApi(), customapiid: "", uniquename: "other_Echo", requestParameters: [], responseProperties: [] };
        await expect(client.createCustomApi(draft, "Contoso")).rejects.toThrow("publisher prefix 'sample_'");
        expect(create).not.toHaveBeenCalled();
    });

    it("escapes quotes in the solution name", async () => {
        await expect(client.createCustomApi({ ...newCustomApi() }, "it's")).rejects.toThrow();
        expect(queryData.mock.calls[0][0]).toContain("uniquename eq 'it''s'");
    });

    it("says the API was created when adding it to the solution fails", async () => {
        execute.mockRejectedValueOnce(new Error("no access"));
        const draft = { ...savedApi(), customapiid: "", requestParameters: [], responseProperties: [] };
        const error = await client.createCustomApi(draft, "Contoso").catch((e: unknown) => e);
        expect(error).toBeInstanceOf(CustomApiCreatedError);
        expect(error).toMatchObject({
            customApiId: API_ID,
            message: 'The Custom API was created, but adding it to solution "Contoso" failed: no access',
        });
    });

    it("looks up each table's solution component type once", async () => {
        queryAnswers[2] = ["customapirequestparameters?$select=customapirequestparameterid&$filter=_customapiid_value eq", [{ customapirequestparameterid: REQUEST_ID }, { customapirequestparameterid: NEW_CHILD_ID }]];
        const draft = savedApi();
        draft.customapiid = "";
        draft.requestParameters = [
            { ...draft.requestParameters[0], id: "" },
            { ...draft.requestParameters[0], id: "", name: "Second", uniquename: "Second", displayname: "Second" },
        ];
        draft.responseProperties[0].id = "";

        await client.createCustomApi(draft, "Contoso");

        const lookups = queryData.mock.calls.map(([q]) => q as string).filter((q) => q.startsWith("solutioncomponentdefinitions?"));
        expect(lookups).toHaveLength(3);
        expect(execute).toHaveBeenCalledTimes(4);
    });
});

describe("updateCustomApi", () => {
    it("returns false and writes nothing when nothing changed", async () => {
        const original = savedApi();
        await expect(client.updateCustomApi(original, copy(original))).resolves.toBe(false);
        expect(writes).toEqual([]);
    });

    it("deletes first, then updates, then creates new children in the API's unmanaged solutions", async () => {
        queryAnswers = [
            ["solutioncomponents?", [{ _solutionid_value: SOLUTION_ID }, { _solutionid_value: SOLUTION_ID }]],
            ["solutions?$select=uniquename&$filter=(", [{ uniquename: "Contoso" }]],
            ["solutioncomponentdefinitions?", [{ solutioncomponenttype: 10001 }]],
        ];
        const original = savedApi();
        const draft = copy(original);
        draft.displayname = "Echo 2";
        draft.requestParameters[0].description = "Text to echo";
        // Replace the response property with a new one of the same name
        draft.responseProperties = [{ ...newCustomApiField(API_ID), name: "Output", uniquename: "Output", displayname: "Output", type: 7 }];

        await expect(client.updateCustomApi(original, draft)).resolves.toBe(true);

        expect(writes).toEqual([
            `delete customapiresponseproperty ${RESPONSE_ID}`,
            `update customapi ${API_ID}`,
            `update customapirequestparameter ${REQUEST_ID}`,
            "create customapiresponseproperty",
            `add ${NEW_CHILD_ID} to Contoso`,
        ]);
        expect(update).toHaveBeenCalledWith("customapi", API_ID, { displayname: "Echo 2" }, "primary");
        expect(create).toHaveBeenCalledWith("customapiresponseproperty", expect.objectContaining({
            uniquename: "Output", type: 7, "CustomAPIId@odata.bind": `/customapis(${API_ID})`,
        }), "primary");
        const solutionQuery = queryData.mock.calls.map((c) => c[0] as string).find((q) => q.startsWith("solutions?"));
        expect(solutionQuery).toContain(`solutionid eq ${SOLUTION_ID}`);
        expect(solutionQuery).toContain("ismanaged eq false and isvisible eq true and uniquename ne 'Default'");
    });

    it("refuses an edit to a fixed field without writing", async () => {
        const original = savedApi();
        const draft = copy(original);
        draft.bindingtype = 1;
        draft.boundentitylogicalname = "account";
        await expect(client.updateCustomApi(original, draft)).rejects.toThrow("Binding type cannot be changed after creation.");
        expect(writes).toEqual([]);
    });

    it("warns that part of the edit may be saved when a later write fails", async () => {
        const original = savedApi();
        const draft = copy(original);
        draft.displayname = "Echo 2";
        draft.requestParameters[0].description = "changed";
        update.mockImplementationOnce(async () => undefined).mockRejectedValueOnce(new Error("locked"));
        await expect(client.updateCustomApi(original, draft)).rejects.toThrow("Some changes may already be saved; reload before trying again. locked");
    });
});

describe("deleting", () => {
    it("deletes an unmanaged API, and refuses a managed one", async () => {
        await client.deleteCustomApi(savedApi());
        expect(del).toHaveBeenCalledWith("customapi", API_ID, "primary");

        del.mockClear();
        await expect(client.deleteCustomApi({ ...savedApi(), ismanaged: true })).rejects.toThrow("managed solution");
        expect(del).not.toHaveBeenCalled();
    });

    it("deletes an unmanaged parameter from its table, and refuses a managed one", async () => {
        const api = savedApi();
        await client.deleteCustomApiField("customapirequestparameter", api.requestParameters[0]);
        expect(del).toHaveBeenCalledWith("customapirequestparameter", REQUEST_ID, "primary");

        await expect(client.deleteCustomApiField("customapiresponseproperty", { ...api.responseProperties[0], ismanaged: true }))
            .rejects.toThrow("A managed response property must be removed through its managed solution.");
    });
});

describe("fetchStepsForMessage", () => {
    const MESSAGE_ID = "88888888-8888-4888-8888-888888888888";
    const PLUGIN_TYPE_ID = "22222222-2222-4222-8222-222222222222";

    it("loads the message's steps and sets each step's plug-in type or service endpoint", async () => {
        queryAnswers = [["sdkmessageprocessingsteps?", [
            { sdkmessageprocessingstepid: "s1", name: "Plug-in step", stage: 40, _sdkmessageid_value: MESSAGE_ID, sdkmessageid: { name: "sample_Echo" }, eventhandler_plugintype: { plugintypeid: PLUGIN_TYPE_ID }, eventhandler_serviceendpoint: null },
            { sdkmessageprocessingstepid: "s2", name: "Endpoint step", stage: 40, _sdkmessageid_value: MESSAGE_ID, sdkmessageid: { name: "sample_Echo" }, eventhandler_plugintype: null, eventhandler_serviceendpoint: { serviceendpointid: SOLUTION_ID } },
        ]]];

        const steps = await client.fetchStepsForMessage(MESSAGE_ID);

        expect(queryData.mock.calls[0][0]).toContain(`$filter=_sdkmessageid_value eq ${MESSAGE_ID}`);
        expect(steps.map((s) => [s.name, s.messageName, s.plugintypeid, s.serviceendpointid])).toEqual([
            ["Plug-in step", "sample_Echo", PLUGIN_TYPE_ID, undefined],
            ["Endpoint step", "sample_Echo", undefined, SOLUTION_ID],
        ]);
    });

    it("rejects an invalid message id without querying", async () => {
        await expect(client.fetchStepsForMessage("x' or 1 eq 1")).rejects.toThrow("Invalid message ID");
        expect(queryData).not.toHaveBeenCalled();
    });
});

describe("solutions", () => {
    const PUBLISHER_ID = "99999999-9999-4999-8999-999999999999";

    it("lists only editable publishers with a customization prefix", async () => {
        queryAnswers = [["publishers?", [
            { publisherid: PUBLISHER_ID, friendlyname: "Contoso", customizationprefix: "sample" },
            { publisherid: SOLUTION_ID, friendlyname: "Microsoft", customizationprefix: "" },
        ]]];
        await expect(client.fetchPublishers()).resolves.toEqual([{ publisherid: PUBLISHER_ID, friendlyname: "Contoso", customizationprefix: "sample" }]);
        expect(queryData.mock.calls[0][0]).toContain("$filter=isreadonly eq false");
    });

    it("creates an unmanaged solution bound to its publisher", async () => {
        const created = await client.createSolution({ friendlyname: " Custom APIs ", uniquename: "CustomApis", version: "1.0", publisherid: PUBLISHER_ID });
        expect(created).toEqual({ uniquename: "CustomApis", friendlyname: "Custom APIs" });
        expect(create).toHaveBeenCalledWith("solution", {
            uniquename: "CustomApis",
            friendlyname: "Custom APIs",
            version: "1.0.0.0",
            "publisherid@odata.bind": `/publishers(${PUBLISHER_ID})`,
        }, "primary");
    });

    it("refuses an invalid solution without creating anything", async () => {
        await expect(client.createSolution({ friendlyname: "", uniquename: "1bad", version: "one", publisherid: "" })).rejects.toThrow("Failed to create the solution");
        expect(create).not.toHaveBeenCalled();
    });
});
