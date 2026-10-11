import { describe, expect, it } from "vitest";
import { entityNameFilter } from "../../src/data/fetchXml";
import { loadClassicWorkflows, loadCloudFlows, loadPluginSteps } from "../../src/data/wiring";
import type { ReadOnlyDataverse } from "../../src/host/readOnlyDataverse";
import { addressFlow, flowClientData } from "../fixtures/scenario";
import { healthySchema } from "../fixtures/preflight";

describe("loadCloudFlows", () => {
    const row = { workflowid: addressFlow().rawId, name: "Address – validate & sync", statecode: 1, clientdata: flowClientData({ filtering: "cr_line1" }) };
    const unrelated = { workflowid: "99999999-0000-4000-8000-000000000099", name: "Other", statecode: 1, clientdata: flowClientData().replace(/cr_address/g, "contact").replace(/accounts/g, "contacts") };
    const sets = new Map([
        ["accounts", "account"],
        ["cr_addresses", "cr_address"],
        ["contacts", "contact"],
    ]);

    it("filters on the server by quoted table and entity set names, and keeps only relevant flows", async () => {
        const requests: string[] = [];
        const dv = { fetchXml: async (xml: string) => (requests.push(xml), { value: [row, unrelated] }) } as unknown as ReadOnlyDataverse;
        const result = await loadCloudFlows(dv, healthySchema().workflow, sets, ["account"]);
        expect(requests[0]).toContain('<condition attribute="clientdata" operator="like" value="%&quot;account&quot;%" />');
        expect(requests[0]).toContain('value="%&quot;accounts&quot;%"');
        expect(result.handlers.map((h) => h.name)).toEqual(["Address – validate & sync"]); // writes to account
    });

    it("falls back to a capped scan when the server rejects the filter", async () => {
        let first = true;
        const dv = {
            fetchXml: async () => {
                if (first) {
                    first = false;
                    throw new Error("Invalid condition on ntext column");
                }
                return { value: [row] };
            },
        } as unknown as ReadOnlyDataverse;
        const result = await loadCloudFlows(dv, healthySchema().workflow, sets, ["cr_address"]);
        expect(result.handlers).toHaveLength(1);
        expect(result.warnings[0]).toMatch(/scanning up to 500/);
    });
});

describe("EntityName filters (regression: 0x80040203 'Expected type of attribute value: System.Int32')", () => {
    const capture = () => {
        const requests: string[] = [];
        const dv = { fetchXml: async (xml: string) => (requests.push(xml), { value: [] }) } as unknown as ReadOnlyDataverse;
        return { dv, requests };
    };

    it("uses type codes with `in` when they're known", () => {
        expect(entityNameFilter("primaryobjecttypecode", ["account", "pmav_superhero"], new Map([["account", 1], ["pmav_superhero", 10234]]))).toEqual({
            conditions: [{ attribute: "primaryobjecttypecode", operator: "in", value: [1, 10234] }],
        });
    });

    it("falls back to OR-ed eq on names, never `in` with names", () => {
        expect(entityNameFilter("primaryentity", ["pmav_superhero"], new Map())).toEqual({ subFilters: [{ type: "or", conditions: [{ attribute: "primaryentity", operator: "eq", value: "pmav_superhero" }] }] });
    });

    it("plugin step and workflow queries send type codes", async () => {
        const codes = new Map([["pmav_superhero", 10234]]);
        const steps = capture();
        await loadPluginSteps(steps.dv, healthySchema(), ["pmav_superhero"], codes);
        expect(steps.requests[0]).toContain('<condition attribute="primaryobjecttypecode" operator="in"><value>10234</value></condition>');
        const wf = capture();
        await loadClassicWorkflows(wf.dv, healthySchema().workflow, ["pmav_superhero"], codes);
        expect(wf.requests[0]).toContain('<condition attribute="primaryentity" operator="in"><value>10234</value></condition>');
        expect(wf.requests[0]).not.toContain("<value>pmav_superhero</value>");
    });
});
