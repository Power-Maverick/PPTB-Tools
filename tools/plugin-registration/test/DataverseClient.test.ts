import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataverseClient } from "../src/utils/DataverseClient";

const create = vi.fn();
const client = new DataverseClient();

beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ id: "created-id" });
    vi.stubGlobal("window", { dataverseAPI: { create } });
});

describe("DataverseClient registration", () => {
    it("registers an assembly and links it to a package when supplied", async () => {
        const packageId = "12345678-1234-4234-8234-123456789abc";

        await expect(client.registerAssembly("base64-content", "Contoso.Plugins", 2, "Assembly description", packageId))
            .resolves.toBe("created-id");

        expect(create).toHaveBeenCalledWith("pluginassembly", {
            content: "base64-content",
            name: "Contoso.Plugins",
            isolationmode: 2,
            description: "Assembly description",
            sourcetype: 0,
            "packageid@odata.bind": `/pluginpackages(${packageId})`,
        }, "primary");
    });

    it("rejects an invalid package ID without creating the assembly", async () => {
        await expect(client.registerAssembly("base64-content", "Contoso.Plugins", 2, "", "not-a-guid"))
            .rejects.toThrow('Failed to register assembly: Invalid package ID: "not-a-guid"');

        expect(create).not.toHaveBeenCalled();
    });

    it("registers a processing step with defaults and its message, plug-in type, and entity filter", async () => {
        await expect(client.registerStep({
            name: "Contoso.Plugins.AccountPlugin: Update of account",
            messageId: "message-id",
            pluginTypeId: "plugin-type-id",
            filterId: "filter-id",
        })).resolves.toBe("created-id");

        expect(create).toHaveBeenCalledWith("sdkmessageprocessingstep", {
            name: "Contoso.Plugins.AccountPlugin: Update of account",
            description: "",
            rank: 1,
            mode: 0,
            stage: 40,
            filteringattributes: "",
            asyncautodelete: false,
            "sdkmessageid@odata.bind": "/sdkmessages(message-id)",
            "eventhandler_plugintype@odata.bind": "/plugintypes(plugin-type-id)",
            "sdkmessagefilterid@odata.bind": "/sdkmessagefilters(filter-id)",
        });
    });

    it("passes step configuration and optional execution settings to Dataverse", async () => {
        await client.registerStep({
            name: "Configured step",
            messageId: "message-id",
            pluginTypeId: "plugin-type-id",
            impersonatinguserid: "user-id",
            configuration: "unsecure config",
            supporteddeployment: 2,
        });

        expect(create).toHaveBeenCalledWith("sdkmessageprocessingstep", expect.objectContaining({
            "impersonatinguserid@odata.bind": "/systemusers(user-id)",
            configuration: "unsecure config",
            supporteddeployment: 2,
        }));
    });

    it("registers an image under its processing step", async () => {
        await expect(client.registerImage({
            name: "PreImage",
            entityalias: "PreImage",
            stepId: "step-id",
        })).resolves.toBe("created-id");

        expect(create).toHaveBeenCalledWith("sdkmessageprocessingstepimage", {
            name: "PreImage",
            entityalias: "PreImage",
            imagetype: 0,
            messagepropertyname: "Target",
            attributes: "",
            description: "",
            "sdkmessageprocessingstepid@odata.bind": "/sdkmessageprocessingsteps(step-id)",
        });
    });

    it("registers a service endpoint in the primary environment", async () => {
        await expect(client.registerServiceEndpoint({
            name: "Contoso webhook",
            contract: 8,
            url: "https://example.test/webhook",
        })).resolves.toBe("created-id");

        expect(create).toHaveBeenCalledWith("serviceendpoint", {
            name: "Contoso webhook",
            contract: 8,
            url: "https://example.test/webhook",
        }, "primary");
    });

    it("wraps Dataverse failures with the registration operation", async () => {
        create.mockRejectedValueOnce(new Error("Dataverse unavailable"));

        await expect(client.registerStep({
            name: "Failing step",
            messageId: "message-id",
            pluginTypeId: "plugin-type-id",
        })).rejects.toThrow("Failed to register step: Dataverse unavailable");
    });
});
