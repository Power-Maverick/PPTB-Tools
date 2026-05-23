import { describe, it, expect } from "vitest";
import { generateMessageFile, generateMessagesFile } from "../messageGenerator";
import { makeSettings, TEST_VERSION } from "./helpers/settings";
import { buildNamingService } from "./helpers/naming";
import { calculateCommissionMessage, noFieldsMessage } from "./fixtures/messages";

describe("messageGenerator", () => {
    describe("generateMessageFile", () => {
        it("generates a single message file with request and response fields", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateMessageFile(calculateCommissionMessage, naming, settings, TEST_VERSION);

            expect(output).toMatchSnapshot();
        });

        it("generates a message file with no fields", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateMessageFile(noFieldsMessage, naming, settings, TEST_VERSION);

            expect(output).toMatchSnapshot();
        });

        it("includes Fields nested class when generateMessageAttributeNameConsts = true", () => {
            const settings = makeSettings({ generateMessageAttributeNameConsts: true });
            const naming = buildNamingService(settings);

            const output = generateMessageFile(calculateCommissionMessage, naming, settings, TEST_VERSION);

            expect(output).toContain("public static class Fields");
            expect(output).toContain('public const string ActionName = "contoso_CalculateCommission"');
        });

        it("omits Fields nested class when generateMessageAttributeNameConsts = false", () => {
            const settings = makeSettings({ generateMessageAttributeNameConsts: false });
            const naming = buildNamingService(settings);

            const output = generateMessageFile(calculateCommissionMessage, naming, settings, TEST_VERSION);

            expect(output).not.toContain("public static class Fields");
        });

        it("response fields have setter when makeResponseMessagesEditable = true", () => {
            const settings = makeSettings({ makeResponseMessagesEditable: true });
            const naming = buildNamingService(settings);

            const output = generateMessageFile(calculateCommissionMessage, naming, settings, TEST_VERSION);

            const responseClassStart = output.indexOf("ResponseProxyAttribute");
            expect(output.slice(responseClassStart)).toContain("set");
        });

        it("response fields are read-only when makeResponseMessagesEditable = false", () => {
            const settings = makeSettings({ makeResponseMessagesEditable: false });
            const naming = buildNamingService(settings);

            const output = generateMessageFile(calculateCommissionMessage, naming, settings, TEST_VERSION);

            const responseClassStart = output.indexOf("ResponseProxyAttribute");

            expect(output.slice(responseClassStart)).not.toContain("set\n");
        });

        it("optional request fields get ? suffix on their type", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateMessageFile(calculateCommissionMessage, naming, settings, TEST_VERSION);

            expect(output).toContain("System.Nullable<decimal>? OverrideRate");
        });

        it("contains RequestProxyAttribute with message name", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateMessageFile(calculateCommissionMessage, naming, settings, TEST_VERSION);

            expect(output).toContain('[Microsoft.Xrm.Sdk.Client.RequestProxyAttribute("contoso_CalculateCommission")]');
        });
    });

    describe("generateMessagesFile", () => {
        it("generates a combined messages file", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateMessagesFile([calculateCommissionMessage, noFieldsMessage], naming, settings, TEST_VERSION);

            expect(output).toMatchSnapshot();
        });

        it("combined file contains both message class pairs", () => {
            const settings = makeSettings();
            const naming = buildNamingService(settings);

            const output = generateMessagesFile([calculateCommissionMessage, noFieldsMessage], naming, settings, TEST_VERSION);

            expect(output).toContain("contoso_CalculateCommissionRequest");
            expect(output).toContain("contoso_CalculateCommissionResponse");
            expect(output).toContain("contoso_TriggerSyncRequest");
            expect(output).toContain("contoso_TriggerSyncResponse");
        });
    });
});
