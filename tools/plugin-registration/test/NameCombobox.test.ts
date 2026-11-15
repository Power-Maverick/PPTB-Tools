import { describe, expect, it } from "vitest";
import { filterNames } from "../src/components/NameCombobox";

const privileges = ["prvActivateBusinessRule", "prvAppendAccount", "prvCreateAccount", "prvReadAccount", "prvReadContact"];

describe("filterNames", () => {
    it("matches anywhere in the name, ignoring case, with names that start with the query first", () => {
        expect(filterNames(privileges, "ACCOUNT").matches).toEqual(["prvAppendAccount", "prvCreateAccount", "prvReadAccount"]);
        expect(filterNames(privileges, "prvread").matches).toEqual(["prvReadAccount", "prvReadContact"]);
        expect(filterNames(["contact", "account", "accountleads"], "account").matches).toEqual(["account", "accountleads"]);
        expect(filterNames(["xaccount", "account"], "account").matches).toEqual(["account", "xaccount"]);
    });

    it("returns everything for an empty query and nothing when nothing matches", () => {
        expect(filterNames(privileges, "  ")).toEqual({ matches: privileges, total: 5 });
        expect(filterNames(privileges, "zzz")).toEqual({ matches: [], total: 0 });
    });

    it("caps the list and reports how many matched in all", () => {
        const many = Array.from({ length: 5000 }, (_, i) => `prvRead${i}`);
        const { matches, total } = filterNames(many, "prvread");
        expect(matches).toHaveLength(100);
        expect(total).toBe(5000);
        expect(filterNames(many, "prvRead4999")).toEqual({ matches: ["prvRead4999"], total: 1 });
        expect(filterNames(privileges, "", 2)).toEqual({ matches: privileges.slice(0, 2), total: 5 });
    });
});
