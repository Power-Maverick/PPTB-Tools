import { describe, expect, it } from "vitest";
import type { CustomApi, CustomApiRequestParameter } from "../src/models/interfaces";
import {
    customApiCreateRecord,
    isEmptyPlan,
    newCustomApi,
    newCustomApiField,
    planCustomApiUpdate,
    suggestUniqueName,
    validateCustomApi,
} from "../src/utils/customApiRules";

const API_ID = "11111111-1111-4111-8111-111111111111";
const PLUGIN_TYPE_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const RESPONSE_ID = "44444444-4444-4444-8444-444444444444";

function draftApi(overrides: Partial<CustomApi> = {}): CustomApi {
    return {
        ...newCustomApi(),
        name: "sample_Echo",
        uniquename: "sample_Echo",
        displayname: "Echo",
        description: "Returns its input",
        ...overrides,
    };
}

function request(overrides: Partial<CustomApiRequestParameter> = {}): CustomApiRequestParameter {
    return { ...newCustomApiField(""), name: "Input", uniquename: "Input", displayname: "Input", ...overrides };
}

function savedApi(overrides: Partial<CustomApi> = {}): CustomApi {
    return draftApi({
        customapiid: API_ID,
        plugintypeid: PLUGIN_TYPE_ID,
        requestParameters: [request({ id: REQUEST_ID, customapiid: API_ID })],
        responseProperties: [{ ...newCustomApiField(API_ID), id: RESPONSE_ID, name: "Output", uniquename: "Output", displayname: "Output" }],
        ...overrides,
    });
}

/** A copy that edits can change without touching the saved API. */
function copy(api: CustomApi): CustomApi {
    return { ...api, requestParameters: api.requestParameters.map((p) => ({ ...p })), responseProperties: api.responseProperties.map((p) => ({ ...p })) };
}

describe("validateCustomApi for a new API", () => {
    it("accepts a complete global API", () => {
        expect(validateCustomApi(draftApi({ requestParameters: [request()] }), undefined, "sample")).toEqual([]);
    });

    it("requires the solution publisher prefix followed by a name", () => {
        expect(validateCustomApi(draftApi({ uniquename: "other_Echo" }), undefined, "sample")).toContain(
            "Custom API unique name must start with the solution publisher prefix 'sample_' followed by a name.",
        );
        expect(validateCustomApi(draftApi({ uniquename: "sample_" }), undefined, "sample").some((e) => e.includes("publisher prefix"))).toBe(true);
    });

    it("requires names, a description and a valid unique name", () => {
        const errors = validateCustomApi(draftApi({ name: "", displayname: " ", description: "", uniquename: "sample_Has Space" }));
        expect(errors).toEqual(
            expect.arrayContaining([
                "Custom API name is required.",
                "Custom API display name is required.",
                "Custom API description is required.",
                "Custom API unique name must start with a letter or underscore and contain only letters, digits, and underscores.",
            ]),
        );
    });

    it("checks binding: global takes no table, entity binding needs one", () => {
        expect(validateCustomApi(draftApi({ boundentitylogicalname: "account" }))).toContain("A global Custom API cannot specify a bound table logical name.");
        expect(validateCustomApi(draftApi({ bindingtype: 1 }))).toContain("Bound table logical name is required.");
        expect(validateCustomApi(draftApi({ bindingtype: 1, boundentitylogicalname: "account" }))).toEqual([]);
    });

    it("refuses Target as a request parameter of an entity-bound API, but not a collection-bound one", () => {
        const target = [request({ uniquename: "Target", name: "Target", displayname: "Target" })];
        expect(validateCustomApi(draftApi({ bindingtype: 1, boundentitylogicalname: "account", requestParameters: target }))).toContain(
            "Request parameter 'Target' conflicts with the implicit Target parameter for an entity-bound Custom API.",
        );
        expect(validateCustomApi(draftApi({ bindingtype: 2, boundentitylogicalname: "account", requestParameters: target }))).toEqual([]);
    });

    it("requires a function to have a response property", () => {
        expect(validateCustomApi(draftApi({ isfunction: true }))).toContain("A function must have at least one response property.");
    });

    it("finds duplicate unique names regardless of case, and tables on types that take none", () => {
        const errors = validateCustomApi(
            draftApi({ requestParameters: [request(), request({ uniquename: "input", name: "input", displayname: "input", logicalentityname: "account" })] }),
        );
        expect(errors).toContain("Request parameter 'input' has a duplicate unique name.");
        expect(errors).toContain("Request parameter 'input' cannot specify a table logical name for this type.");
    });

    it("allows a table on an EntityCollection request parameter but not on a response property", () => {
        const draft = draftApi({
            requestParameters: [request({ type: 4, logicalentityname: "account" })],
            responseProperties: [{ ...request({ type: 4, logicalentityname: "account" }), uniquename: "Rows", name: "Rows", displayname: "Rows" }],
        });
        expect(validateCustomApi(draft)).toEqual(["Response property 'Rows' cannot specify a table logical name for this type."]);
    });

    it("refuses an unset choice read from Dataverse", () => {
        expect(validateCustomApi(draftApi({ bindingtype: -1 }))).toContain("Select a valid binding type.");
    });
});

describe("validateCustomApi for an edit", () => {
    it("accepts changes to the fields Dataverse allows", () => {
        const original = savedApi();
        const draft = copy(original);
        draft.displayname = "Echo 2";
        draft.isprivate = true;
        draft.plugintypeid = undefined;
        draft.requestParameters[0].description = "New description";
        expect(validateCustomApi(draft, original)).toEqual([]);
    });

    it("refuses changes to fields fixed at creation", () => {
        const original = savedApi();
        const draft = copy(original);
        draft.uniquename = "sample_Other";
        draft.isfunction = true;
        draft.requestParameters[0].type = 7;
        draft.requestParameters[0].isoptional = true;
        const errors = validateCustomApi(draft, original);
        expect(errors).toEqual(
            expect.arrayContaining([
                "Custom API unique name cannot be changed after creation.",
                "Is Function cannot be changed after creation.",
                "Request parameter 'Input' type cannot be changed after creation.",
                "Request parameter 'Input' Is Optional cannot be changed after creation.",
            ]),
        );
    });

    it("doesn't block an edit on a blank description saved elsewhere", () => {
        const original = savedApi({ description: "" });
        const draft = copy(original);
        draft.displayname = "Renamed";
        expect(validateCustomApi(draft, original)).toEqual([]);
    });

    it("protects a managed API that doesn't allow customization, but lets it gain optional parameters", () => {
        const original = savedApi({ ismanaged: true, iscustomizable: false });
        const renamed = copy(original);
        renamed.displayname = "Changed";
        expect(validateCustomApi(renamed, original)).toContain("This managed Custom API does not allow customization.");

        const extended = copy(original);
        extended.requestParameters.push(request({ uniquename: "Extra", name: "Extra", displayname: "Extra" }));
        expect(validateCustomApi(extended, original)).toContain("Request parameter 'Extra' must be optional when added to a managed Custom API that disallows customization.");
        extended.requestParameters[1].isoptional = true;
        expect(validateCustomApi(extended, original)).toEqual([]);
    });

    it("refuses to remove a managed parameter", () => {
        const original = savedApi();
        original.requestParameters[0].ismanaged = true;
        const draft = copy(original);
        draft.requestParameters = [];
        expect(validateCustomApi(draft, original)).toContain("Request parameter 'Input' is managed and must be removed through its managed solution.");
    });

    it("doesn't block an edit on an unset choice it can't change", () => {
        const original = savedApi({ allowedcustomprocessingsteptype: -1 });
        original.requestParameters[0].type = -1;
        const draft = copy(original);
        draft.displayname = "Renamed";
        expect(validateCustomApi(draft, original)).toEqual([]);
    });

    it("refuses an id that isn't in the saved API", () => {
        const original = savedApi();
        const draft = copy(original);
        draft.requestParameters[0].id = "55555555-5555-4555-8555-555555555555";
        expect(validateCustomApi(draft, original)).toContain("Request parameter 'Input' must have an empty ID unless it belongs to the saved definition.");
    });
});

describe("customApiCreateRecord", () => {
    it("builds one deep-insert record with the plug-in type bind and both child lists", () => {
        const record = customApiCreateRecord(
            draftApi({
                plugintypeid: PLUGIN_TYPE_ID,
                requestParameters: [request({ isoptional: true })],
                responseProperties: [{ ...newCustomApiField(""), name: "Output", uniquename: "Output", displayname: "Output", type: 5, logicalentityname: "account" }],
            }),
        );
        expect(record).toEqual({
            name: "sample_Echo",
            uniquename: "sample_Echo",
            displayname: "Echo",
            description: "Returns its input",
            bindingtype: 0,
            boundentitylogicalname: null,
            allowedcustomprocessingsteptype: 0,
            executeprivilegename: null,
            isfunction: false,
            isprivate: false,
            workflowsdkstepenabled: false,
            "PluginTypeId@odata.bind": `/plugintypes(${PLUGIN_TYPE_ID})`,
            CustomAPIRequestParameters: [
                { name: "Input", displayname: "Input", description: null, uniquename: "Input", type: 10, logicalentityname: null, isoptional: true },
            ],
            CustomAPIResponseProperties: [
                { name: "Output", displayname: "Output", description: null, uniquename: "Output", type: 5, logicalentityname: "account" },
            ],
        });
    });

    it("leaves out empty child lists and a missing plug-in type", () => {
        const record = customApiCreateRecord(draftApi());
        expect(record).not.toHaveProperty("PluginTypeId@odata.bind");
        expect(record).not.toHaveProperty("CustomAPIRequestParameters");
        expect(record).not.toHaveProperty("CustomAPIResponseProperties");
    });

    it("rejects an invalid plug-in type id", () => {
        expect(() => customApiCreateRecord(draftApi({ plugintypeid: "not-a-guid" }))).toThrow('Invalid plug-in type ID: "not-a-guid"');
    });
});

describe("planCustomApiUpdate", () => {
    it("is empty when nothing changed, treating null and empty text as the same", () => {
        const original = savedApi({ executeprivilegename: "" });
        expect(isEmptyPlan(planCustomApiUpdate(original, copy(original)))).toBe(true);
    });

    it("writes only changed API fields, and clears the plug-in type with a null bind", () => {
        const original = savedApi();
        const draft = copy(original);
        draft.displayname = "Renamed";
        draft.description = "";
        draft.plugintypeid = undefined;
        expect(planCustomApiUpdate(original, draft).apiChanges).toEqual({
            displayname: "Renamed",
            description: null,
            "PluginTypeId@odata.bind": null,
        });
    });

    it("ignores the case of the plug-in type id", () => {
        const original = savedApi();
        const draft = copy(original);
        draft.plugintypeid = PLUGIN_TYPE_ID.toUpperCase();
        expect(planCustomApiUpdate(original, draft).apiChanges).toEqual({});
    });

    it("deletes removed children, updates changed ones and creates new ones bound to the API", () => {
        const original = savedApi();
        const draft = copy(original);
        draft.requestParameters[0].displayname = "Input text";
        draft.responseProperties = [];
        draft.responseProperties.push({ ...newCustomApiField(API_ID), name: "Result", uniquename: "Result", displayname: "Result", type: 0 });

        const plan = planCustomApiUpdate(original, draft);
        expect(plan.deletes).toEqual([{ table: "customapiresponseproperty", id: RESPONSE_ID }]);
        expect(plan.updates).toEqual([{ table: "customapirequestparameter", id: REQUEST_ID, changes: { displayname: "Input text" } }]);
        expect(plan.creates).toEqual([
            {
                table: "customapiresponseproperty",
                record: {
                    name: "Result",
                    displayname: "Result",
                    description: null,
                    uniquename: "Result",
                    type: 0,
                    logicalentityname: null,
                    "CustomAPIId@odata.bind": `/customapis(${API_ID})`,
                },
            },
        ]);
    });
});

describe("suggestUniqueName", () => {
    it("drops characters a unique name can't have and adds the prefix", () => {
        expect(suggestUniqueName("Get Account Score!", "sample")).toBe("sample_GetAccountScore");
        expect(suggestUniqueName("Input value")).toBe("Inputvalue");
    });
});
