import type { EbgSettings } from "../models/interfaces";
import type { SdkMessagePair } from "./types";
import { CODEGEN_TOOL_NAME } from "./types";
import { T, T2, T3, T4, codeFileHeader, extractNamespaceBody } from "./helpers";

export function generateMessageFile(messagePair: SdkMessagePair, settings: EbgSettings, appVersion: string): string {
    const requestName = messagePair.Request.Name + "Request";
    const responseName = messagePair.Request.Name + "Response";
    const lines = codeFileHeader(settings.namespace);

    lines.push(`${T}`);
    lines.push(`${T}[System.Runtime.Serialization.DataContractAttribute()]`);
    lines.push(`${T}[Microsoft.Xrm.Sdk.Client.RequestProxyAttribute("${messagePair.Request.Name}")]`);
    if (!settings.suppressGeneratedCodeAttribute) {
        lines.push(`${T}[System.CodeDom.Compiler.GeneratedCodeAttribute("${CODEGEN_TOOL_NAME}", "${appVersion}")]`);
    }
    lines.push(`${T}public partial class ${requestName} : Microsoft.Xrm.Sdk.OrganizationRequest`);
    lines.push(`${T}{`);

    if (settings.generateMessageAttributeNameConsts) {
        lines.push(`${T2}public static class Fields`);
        lines.push(`${T2}{`);
        lines.push(`${T3}public const string ActionName = "${messagePair.Request.Name}";`);
        for (const field of messagePair.Request.Fields) {
            lines.push(`${T3}public const string ${field.Name} = "${field.Name}";`);
        }
        lines.push(`${T2}}`);
        lines.push(`${T2}`);
    }

    lines.push(`${T2}public ${requestName}()`);
    lines.push(`${T2}{`);
    lines.push(`${T3}this.RequestName = "${messagePair.Request.Name}";`);
    lines.push(`${T3}this.Parameters["${messagePair.Request.Name}"] = null;`);
    lines.push(`${T2}}`);

    for (const field of messagePair.Request.Fields) {
        const csType = field.ClrFormatter ?? "object";
        const optionalSuffix = field.IsOptional ? "?" : "";
        lines.push(`${T2}`);
        lines.push(`${T2}[System.Runtime.Serialization.DataMemberAttribute()]`);
        lines.push(`${T2}public ${csType}${optionalSuffix} ${field.Name}`);
        lines.push(`${T2}{`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}get`);
        lines.push(`${T3}{`);
        lines.push(`${T4}return ((${csType})(this.Parameters["${field.Name}"]));`);
        lines.push(`${T3}}`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}set`);
        lines.push(`${T3}{`);
        lines.push(`${T4}this.Parameters["${field.Name}"] = value;`);
        lines.push(`${T3}}`);
        lines.push(`${T2}}`);
    }

    lines.push(`${T}}`);

    lines.push(`${T}`);
    lines.push(`${T}[System.Runtime.Serialization.DataContractAttribute()]`);
    lines.push(`${T}[Microsoft.Xrm.Sdk.Client.ResponseProxyAttribute("${messagePair.Request.Name}")]`);
    if (!settings.suppressGeneratedCodeAttribute) {
        lines.push(`${T}[System.CodeDom.Compiler.GeneratedCodeAttribute("${CODEGEN_TOOL_NAME}", "${appVersion}")]`);
    }
    lines.push(`${T}public partial class ${responseName} : Microsoft.Xrm.Sdk.OrganizationResponse`);
    lines.push(`${T}{`);

    if (settings.generateMessageAttributeNameConsts) {
        lines.push(`${T2}public static class Fields`);
        lines.push(`${T2}{`);
        lines.push(`${T3}public const string ActionName = "${messagePair.Request.Name}";`);
        for (const field of messagePair.Response.Fields) {
            lines.push(`${T3}public const string ${field.Name} = "${field.Name}";`);
        }
        lines.push(`${T2}}`);
        lines.push(`${T2}`);
    }

    for (const field of messagePair.Response.Fields) {
        const csType = field.ClrFormatter ?? "object";
        const readonly_ = !settings.makeResponseMessagesEditable;
        lines.push(`${T2}`);
        lines.push(`${T2}[System.Runtime.Serialization.DataMemberAttribute()]`);
        lines.push(`${T2}public ${csType}? ${field.Name}`);
        lines.push(`${T2}{`);
        lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
        lines.push(`${T3}get`);
        lines.push(`${T3}{`);
        lines.push(`${T4}return ((${csType})(this.Results["${field.Name}"]));`);
        lines.push(`${T3}}`);
        if (!readonly_) {
            lines.push(`${T3}[System.Diagnostics.DebuggerNonUserCode()]`);
            lines.push(`${T3}set`);
            lines.push(`${T3}{`);
            lines.push(`${T4}this.Results["${field.Name}"] = value;`);
            lines.push(`${T3}}`);
        }
        lines.push(`${T2}}`);
    }

    lines.push(`${T}}`);
    lines.push("}");
    lines.push("#pragma warning restore CS1591");

    return lines.join("\n");
}

export function generateMessagesFile(messagePairs: SdkMessagePair[], settings: EbgSettings, appVersion: string): string {
    const lines = codeFileHeader(settings.namespace);

    for (const pair of messagePairs) {
        const content = generateMessageFile(pair, settings, appVersion);

        const inner = extractNamespaceBody(content, settings.namespace);
        if (inner) lines.push(inner);
    }

    lines.push("}");
    lines.push("#pragma warning restore CS1591");
    return lines.join("\n");
}
