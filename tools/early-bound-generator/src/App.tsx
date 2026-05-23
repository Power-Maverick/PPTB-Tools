import { useState, useEffect, useCallback } from "react";
import { type EbgSettings, DEFAULT_SETTINGS } from "./models/interfaces";
import { settingsToXml, xmlToSettings } from "./utils/xmlSerializer";
import { PropertySection } from "./components/PropertySection";
import { SettingRow } from "./components/SettingRow";
import { SettingsToolbar } from "./components/SettingsToolbar";
import { StringListEditor } from "./components/StringListEditor";
import { TerminalPanel } from "./components/TerminalPanel";
import { EntityPickerDialog } from "./components/EntityPickerDialog";
import { PathInput } from "./components/PathInput";
import { KeyValueEditor } from "./components/KeyValueEditor";
import { EntityAttributeEditor } from "./components/EntityAttributeEditor";
import { runCodegen } from "./codegen/orchestrator";
import "./styles.css";

type EntityPickerTarget = "entitiesWhitelist" | "entitiesToSkip";

function getDirname(p: string): string {
    const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return idx > 0 ? p.substring(0, idx) : p;
}

function joinPaths(a: string, b: string): string {
    const sep = a.includes("\\") ? "\\" : "/";
    return a.replace(/[/\\]+$/, "") + sep + b.replace(/^[/\\]+/, "");
}

const SETTINGS_FILENAME = "DLaB.EBG.Settings.xml";

function App() {
    const [settings, setSettings] = useState<EbgSettings>(DEFAULT_SETTINGS);
    const [settingsDir, setSettingsDir] = useState("");
    const [settingsFileName, setSettingsFileName] = useState(SETTINGS_FILENAME);
    const [xmlCandidates, setXmlCandidates] = useState<string[]>([]);
    const [terminalOutput, setTerminalOutput] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState("");
    const [initializing, setInitializing] = useState(true);
    const [entityPickerOpen, setEntityPickerOpen] = useState(false);
    const [entityPickerTarget, setEntityPickerTarget] = useState<EntityPickerTarget | null>(null);

    const updateSetting = (update: Partial<EbgSettings>) => {
        setSettings((prev) => ({ ...prev, ...update }));
    };

    const loadSettingsFromFile = useCallback(async (dir: string, filename: string) => {
        if (!window.toolboxAPI) return;
        try {
            const raw = await window.toolboxAPI.fileSystem.readText(joinPaths(dir, filename));
            const { settings: loaded } = xmlToSettings(raw);
            setSettings(loaded);
            setSettingsFileName(filename);
            setError("");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(`Failed to load settings: ${msg}`);
        }
    }, []);

    const loadSettingsFromDir = useCallback(
        async (dir: string) => {
            if (!window.toolboxAPI) return;
            try {
                const entries = await window.toolboxAPI.fileSystem.readDirectory(dir);
                const xmlFiles = entries.filter((e) => e.type === "file" && e.name.toLowerCase().endsWith(".xml")).map((e) => e.name);

                setSettingsDir(dir);
                setXmlCandidates([]);

                if (xmlFiles.length === 0) {
                    setSettingsFileName(SETTINGS_FILENAME);
                    setError("");
                } else if (xmlFiles.length === 1) {
                    await loadSettingsFromFile(dir, xmlFiles[0]);
                } else {
                    setXmlCandidates(xmlFiles);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                setError(`Failed to read directory: ${msg}`);
            }
        },
        [loadSettingsFromFile],
    );

    useEffect(() => {
        const init = async () => {
            if (!window.toolboxAPI) {
                setError("Power Platform ToolBox context not detected. Launch this tool inside PPTB.");
                setInitializing(false);
                return;
            }

            setInitializing(false);
        };

        void init();
    }, [loadSettingsFromDir]);

    const handleOpenSettings = async () => {
        if (!window.toolboxAPI) return;
        try {
            const dir = await window.toolboxAPI.fileSystem.selectPath({
                type: "folder",
                title: "Select EBG Settings Folder",
            });
            if (!dir) return;
            await loadSettingsFromDir(dir);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
        }
    };

    const handleSaveSettings = async () => {
        if (!window.toolboxAPI) return;
        const xml = settingsToXml(settings, __APP_VERSION__);
        try {
            if (settingsDir) {
                const filePath = joinPaths(settingsDir, settingsFileName);
                await window.toolboxAPI.fileSystem.writeText(filePath, xml);
                await window.toolboxAPI.utils.showNotification({ title: "Saved", body: filePath, type: "success" });
            } else {
                const savedPath = await window.toolboxAPI.fileSystem.saveFile(SETTINGS_FILENAME, xml, [{ name: "XML files", extensions: ["xml"] }]);
                if (savedPath) {
                    const dir = getDirname(savedPath);
                    const fname = savedPath.replace(/^.*[/\\]/, "");
                    setSettingsDir(dir);
                    setSettingsFileName(fname);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
        }
    };

    const handleGenerate = async () => {
        if (!window.toolboxAPI) {
            setError("Power Platform ToolBox context not detected.");
            return;
        }
        if (!settingsDir) {
            setError("Open a settings folder before generating.");
            return;
        }

        setIsGenerating(true);
        setError("");
        setTerminalOutput("");

        try {
            const connection = await window.toolboxAPI.connections.getActiveConnection();
            if (!connection?.url) {
                setError("No active Dataverse connection. Connect to an environment in PPTB first.");
                setIsGenerating(false);
                return;
            }

            const settingsFilePath = joinPaths(settingsDir, settingsFileName);
            await window.toolboxAPI.fileSystem.writeText(settingsFilePath, settingsToXml(settings, __APP_VERSION__));

            const outputDir = settings.outputRelativeDirectory ? joinPaths(settingsDir, settings.outputRelativeDirectory) : settingsDir;

            const log = (line: string) => {
                setTerminalOutput((prev) => (prev ? prev + "\n" + line : line));
            };

            await runCodegen(settings, settingsDir, outputDir, log, __APP_VERSION__);

            await window.toolboxAPI.utils.showNotification({
                title: "Generation complete",
                body: `Output written to ${outputDir}`,
                type: "success",
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            setTerminalOutput(msg);
        } finally {
            setIsGenerating(false);
        }
    };

    const openEntityPicker = (target: EntityPickerTarget) => {
        setEntityPickerTarget(target);
        setEntityPickerOpen(true);
    };

    const handleEntityPickerConfirm = (entities: string[]) => {
        if (entityPickerTarget === "entitiesWhitelist") {
            updateSetting({ entitiesWhitelist: entities });
        } else if (entityPickerTarget === "entitiesToSkip") {
            updateSetting({ entitiesToSkip: entities });
        }
        setEntityPickerOpen(false);
        setEntityPickerTarget(null);
    };

    const handleEntityPickerClose = () => {
        setEntityPickerOpen(false);
        setEntityPickerTarget(null);
    };

    if (initializing) {
        return (
            <div className="loading-container">
                <div className="loading-spinner" />
                <span>Loading...</span>
            </div>
        );
    }

    return (
        <div className="page-layout">
            <SettingsToolbar
                isGenerating={isGenerating}
                settingsPath={settingsDir ? joinPaths(settingsDir, settingsFileName) : ""}
                onGenerate={handleGenerate}
                onOpenSettings={handleOpenSettings}
                onSaveSettings={handleSaveSettings}
            />
            {error && <div className="error-banner">{error}</div>}
            <div className="content-area">
                <div className="settings-panel">
                    {}
                    <PropertySection title="Global">
                        <SettingRow label="Namespace" hint="C# namespace for all generated classes">
                            <input className="form-input" value={settings.namespace} onChange={(e) => updateSetting({ namespace: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Service Context Name" hint="Name of the generated IOrganizationService context class">
                            <input className="form-input" value={settings.serviceContextName} onChange={(e) => updateSetting({ serviceContextName: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Output Directory" hint="Directory for generated files — relative to the settings file">
                            <PathInput
                                value={settings.outputRelativeDirectory}
                                onChange={(v) => updateSetting({ outputRelativeDirectory: v })}
                                settingsDir={settingsDir}
                                type="folder"
                                placeholder="(same folder as settings file)"
                                title="Select output directory"
                            />
                        </SettingRow>
                        <SettingRow label="Builder Settings JSON Path" hint="Path for the builderSettings.json file written before pac modelbuilder runs">
                            <PathInput
                                value={settings.builderSettingsJsonRelativePath}
                                onChange={(v) => updateSetting({ builderSettingsJsonRelativePath: v })}
                                settingsDir={settingsDir}
                                type="file"
                                filters={[{ name: "JSON files", extensions: ["json"] }]}
                                title="Select builder settings JSON file"
                            />
                        </SettingRow>
                        <SettingRow label="Suppress Generated Code Attribute" hint="Omit [System.CodeDom.Compiler.GeneratedCode] from generated files">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.suppressGeneratedCodeAttribute} onChange={(e) => updateSetting({ suppressGeneratedCodeAttribute: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Remove Runtime Version Comment" hint="Strip the runtime version comment from generated file headers">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.removeRuntimeVersionComment} onChange={(e) => updateSetting({ removeRuntimeVersionComment: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Suppress Auto-Generated File Header" hint="Suppress the auto-generated file header comment entirely">
                            <label className="form-checkbox">
                                <input
                                    type="checkbox"
                                    checked={settings.suppressAutogeneratedFileHeaderComment}
                                    onChange={(e) => updateSetting({ suppressAutogeneratedFileHeaderComment: e.target.checked })}
                                />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Generate Types As Internal" hint="Emit all generated types with internal rather than public visibility">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.generateTypesAsInternal} onChange={(e) => updateSetting({ generateTypesAsInternal: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Include Command Line" hint="Embed the pac command line in generated file headers">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.includeCommandLine} onChange={(e) => updateSetting({ includeCommandLine: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="File Prefix Text" hint="Text prepended to every generated file name">
                            <input className="form-input" value={settings.filePrefixText} placeholder="(none)" onChange={(e) => updateSetting({ filePrefixText: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Make Reference Types Nullable" hint="Add C# nullable annotations to reference-type properties">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.makeReferenceTypesNullable} onChange={(e) => updateSetting({ makeReferenceTypesNullable: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Use Display Name For BPF Name" hint="Use the display name when naming Business Process Flow entities">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.useDisplayNameForBpfName} onChange={(e) => updateSetting({ useDisplayNameForBpfName: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Add New Files To Project" hint="Add newly generated .cs files to the target .csproj automatically">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.addNewFilesToProject} onChange={(e) => updateSetting({ addNewFilesToProject: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Delete Files From Output Folders" hint="Remove stale generated files from output folders">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.deleteFilesFromOutputFolders} onChange={(e) => updateSetting({ deleteFilesFromOutputFolders: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Project Name For Early-Bound Files" hint=".csproj name to add generated files to (leave blank to auto-detect)">
                            <input
                                className="form-input"
                                value={settings.projectNameForEarlyBoundFiles}
                                placeholder="(auto-detect)"
                                onChange={(e) => updateSetting({ projectNameForEarlyBoundFiles: e.target.value })}
                            />
                        </SettingRow>
                        <SettingRow label="Token Capitalisation Overrides" hint="Words treated as known tokens during CamelCase naming (e.g. SlaId, VoiceMail)">
                            <StringListEditor items={settings.tokenCapitalizationOverrides} onChange={(items) => updateSetting({ tokenCapitalizationOverrides: items })} placeholder="Add token..." />
                        </SettingRow>
                        <SettingRow label="CamelCase Class Names" hint="Apply CamelCase formatting to generated class names">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.camelCaseClassNames} onChange={(e) => updateSetting({ camelCaseClassNames: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="CamelCase Member Names" hint="Apply CamelCase formatting to generated property and member names">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.camelCaseMemberNames} onChange={(e) => updateSetting({ camelCaseMemberNames: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="CamelCase Custom Words" hint="Additional words recognised as tokens during CamelCase naming">
                            <StringListEditor items={settings.camelCaseCustomWords} onChange={(items) => updateSetting({ camelCaseCustomWords: items })} placeholder="Add word..." />
                        </SettingRow>
                        <SettingRow label="CamelCase Dictionary Path" hint="Relative path to a custom CamelCase dictionary file. Leave blank to use the built-in dictionary.">
                            <PathInput
                                value={settings.camelCaseNamesDictionaryRelativePath}
                                onChange={(v) => updateSetting({ camelCaseNamesDictionaryRelativePath: v })}
                                settingsDir={settingsDir}
                                type="file"
                                filters={[{ name: "Text files", extensions: ["txt"] }]}
                                placeholder="(built-in dictionary)"
                                title="Select CamelCase dictionary file"
                            />
                        </SettingRow>
                    </PropertySection>

                    {}
                    <PropertySection title="Entities">
                        <SettingRow label="Entity Types Folder" hint="Sub-folder name for generated entity class files">
                            <input className="form-input" value={settings.entityTypesFolder} onChange={(e) => updateSetting({ entityTypesFolder: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="One File Per Entity" hint="Emit a separate .cs file for each entity (vs a single combined file)">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.createOneFilePerEntity} onChange={(e) => updateSetting({ createOneFilePerEntity: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Entities Whitelist" hint="Generate only these entities — leave empty to generate all entities">
                            <div className="entity-picker-row">
                                <StringListEditor items={settings.entitiesWhitelist} onChange={(items) => updateSetting({ entitiesWhitelist: items })} placeholder="Add entity logical name..." />
                                <button className="entity-picker-btn" onClick={() => openEntityPicker("entitiesWhitelist")}>
                                    Browse Entities
                                </button>
                            </div>
                        </SettingRow>
                        <SettingRow label="Entities To Skip" hint="Always exclude these entities even when they appear in other filters">
                            <div className="entity-picker-row">
                                <StringListEditor items={settings.entitiesToSkip} onChange={(items) => updateSetting({ entitiesToSkip: items })} placeholder="Add entity logical name..." />
                                <button className="entity-picker-btn" onClick={() => openEntityPicker("entitiesToSkip")}>
                                    Browse Entities
                                </button>
                            </div>
                        </SettingRow>
                        <SettingRow label="Entity Prefixes To Skip" hint="Skip all entities whose logical name starts with these prefixes">
                            <StringListEditor items={settings.entityPrefixesToSkip} onChange={(items) => updateSetting({ entityPrefixesToSkip: items })} placeholder="Add prefix..." />
                        </SettingRow>
                        <SettingRow label="Entity Prefixes Whitelist" hint="Only generate entities whose logical name starts with these prefixes">
                            <StringListEditor items={settings.entityPrefixesWhitelist} onChange={(items) => updateSetting({ entityPrefixesWhitelist: items })} placeholder="Add prefix..." />
                        </SettingRow>
                        <SettingRow label="Entity Class Name Overrides" hint="Map entity logical names to custom C# class names">
                            <KeyValueEditor
                                entries={settings.entityClassNameOverrides}
                                onChange={(entries) => updateSetting({ entityClassNameOverrides: entries })}
                                keyHeader="Logical Name"
                                valueHeader="Class Name"
                                keyPlaceholder="e.g. account"
                                valuePlaceholder="e.g. MyAccount"
                            />
                        </SettingRow>
                        <SettingRow label="Entity Attribute Specified Names" hint="For each entity, limit generation to only these attributes. Leave empty to generate all attributes.">
                            <EntityAttributeEditor entries={settings.entityAttributeSpecifiedNames} onChange={(entries) => updateSetting({ entityAttributeSpecifiedNames: entries })} />
                        </SettingRow>
                        <SettingRow label="Attribute Blacklist" hint="Attribute logical names to always exclude across all entities">
                            <StringListEditor items={settings.attributeBlacklist} onChange={(items) => updateSetting({ attributeBlacklist: items })} placeholder="Add attribute logical name..." />
                        </SettingRow>
                        <SettingRow label="Generate Attribute Name Consts" hint="Generate a Fields inner class with attribute logical name string constants">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.generateAttributeNameConsts} onChange={(e) => updateSetting({ generateAttributeNameConsts: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Generate Anonymous Type Constructor" hint="Generate a constructor that accepts an anonymous type initialiser">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.generateAnonymousTypeConstructor} onChange={(e) => updateSetting({ generateAnonymousTypeConstructor: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Generate Constructors Sans Logical Name" hint="Generate constructors that do not require the entity logical name argument">
                            <label className="form-checkbox">
                                <input
                                    type="checkbox"
                                    checked={settings.generateConstructorsSansLogicalName}
                                    onChange={(e) => updateSetting({ generateConstructorsSansLogicalName: e.target.checked })}
                                />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Generate Entity Relationships" hint="Generate relationship navigation properties on entity classes">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.generateEntityRelationships} onChange={(e) => updateSetting({ generateEntityRelationships: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Generate Enum Properties" hint="Generate typed enum properties for option set attributes">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.generateEnumProperties} onChange={(e) => updateSetting({ generateEnumProperties: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Replace Option Set Properties With Enum" hint="Replace OptionSetValue properties with the generated enum type">
                            <label className="form-checkbox">
                                <input
                                    type="checkbox"
                                    checked={settings.replaceOptionSetPropertiesWithEnum}
                                    onChange={(e) => updateSetting({ replaceOptionSetPropertiesWithEnum: e.target.checked })}
                                />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Generate INotify Pattern" hint="Implement INotifyPropertyChanged on all entity classes">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.generateINotifyPattern} onChange={(e) => updateSetting({ generateINotifyPattern: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Emit Virtual Attributes" hint="Include virtual/composite attributes (e.g. fullname) in generated classes">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.emitVirtualAttributes} onChange={(e) => updateSetting({ emitVirtualAttributes: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Emit Entity ETC" hint="Emit the entity type code constant in generated classes">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.emitEntityETC} onChange={(e) => updateSetting({ emitEntityETC: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Make All Fields Editable" hint="Generate all fields (including calculated/rollup) as settable properties">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.makeAllFieldsEditable} onChange={(e) => updateSetting({ makeAllFieldsEditable: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Make Read-Only Fields Editable" hint="Generate read-only fields as settable properties">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.makeReadonlyFieldsEditable} onChange={(e) => updateSetting({ makeReadonlyFieldsEditable: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Use Logical Names" hint="Name generated properties using attribute logical names instead of schema names">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.useLogicalNames} onChange={(e) => updateSetting({ useLogicalNames: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Use Enum For State Codes" hint="Generate enums for statecode and statuscode attributes">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.useEnumForStateCodes} onChange={(e) => updateSetting({ useEnumForStateCodes: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Use CrmSvcUtil State Enum Naming" hint="Use CrmSvcUtil-compatible naming convention for state/status enums">
                            <label className="form-checkbox">
                                <input
                                    type="checkbox"
                                    checked={settings.useCrmSvcUtilStateEnumNamingConvention}
                                    onChange={(e) => updateSetting({ useCrmSvcUtilStateEnumNamingConvention: e.target.checked })}
                                />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Obsolete Deprecated" hint="Mark deprecated entities and attributes with [Obsolete]">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.obsoleteDeprecated} onChange={(e) => updateSetting({ obsoleteDeprecated: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Obsolete Tokens" hint="Display name tokens that flag deprecation (e.g. *(Deprecated)*)">
                            <StringListEditor items={settings.obsoleteTokens} onChange={(items) => updateSetting({ obsoleteTokens: items })} placeholder="Add token..." />
                        </SettingRow>
                        <SettingRow label="Property Enum Mappings" hint="Manual enum-to-property mappings (format: EntityName.PropertyName=EnumType)">
                            <StringListEditor items={settings.propertyEnumMappings} onChange={(items) => updateSetting({ propertyEnumMappings: items })} placeholder="Add mapping..." />
                        </SettingRow>
                        <SettingRow label="Add Debugger Non-User Code" hint="Apply [DebuggerNonUserCode] to suppress stepping into generated code">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.addDebuggerNonUserCode} onChange={(e) => updateSetting({ addDebuggerNonUserCode: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                    </PropertySection>

                    {}
                    <PropertySection title="Option Sets">
                        <SettingRow label="Option Sets Folder" hint="Sub-folder name for generated option set enum files">
                            <input className="form-input" value={settings.optionSetsTypesFolder} onChange={(e) => updateSetting({ optionSetsTypesFolder: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="One File Per Option Set" hint="Emit a separate .cs file for each option set enum">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.createOneFilePerOptionSet} onChange={(e) => updateSetting({ createOneFilePerOptionSet: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Generate Global Option Sets" hint="Include global (not entity-local) option sets in the output">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.generateGlobalOptionSets} onChange={(e) => updateSetting({ generateGlobalOptionSets: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Generate Option Set Metadata Attribute" hint="Generate metadata attributes on generated enum values">
                            <label className="form-checkbox">
                                <input
                                    type="checkbox"
                                    checked={settings.generateOptionSetMetadataAttribute}
                                    onChange={(e) => updateSetting({ generateOptionSetMetadataAttribute: e.target.checked })}
                                />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Add Option Set Metadata Attribute" hint="Apply [OptionSetMetadataAttribute] to generated enums">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.addOptionSetMetadataAttribute} onChange={(e) => updateSetting({ addOptionSetMetadataAttribute: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Generate All Option Set Label Metadata" hint="Include all language labels for option set values (not just the default language)">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.generateAllOptionSetLabelMetadata} onChange={(e) => updateSetting({ generateAllOptionSetLabelMetadata: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Adjust Casing For Enum Options" hint="Apply CamelCase formatting to enum value names">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.adjustCasingForEnumOptions} onChange={(e) => updateSetting({ adjustCasingForEnumOptions: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Group Local Option Sets By Entity" hint="Place local option sets inside an entity-named sub-namespace">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.groupLocalOptionSetsByEntity} onChange={(e) => updateSetting({ groupLocalOptionSetsByEntity: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Cleanup CrmSvcUtil Local Option Sets" hint="Remove old CrmSvcUtil-generated local option set files on regeneration">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.cleanupCrmSvcUtilLocalOptionSets} onChange={(e) => updateSetting({ cleanupCrmSvcUtilLocalOptionSets: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Invalid C# Name Prefix" hint="Prefix applied to enum values that start with an invalid C# identifier character">
                            <input className="form-input" value={settings.invalidCSharpNamePrefix} onChange={(e) => updateSetting({ invalidCSharpNamePrefix: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Local Option Set Format" hint="Format string for local option set names: {0}=entity name, {1}=attribute name">
                            <input className="form-input" value={settings.localOptionSetFormat} onChange={(e) => updateSetting({ localOptionSetFormat: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Language Code Override" hint="Override the language code used for option set labels (blank = environment default)">
                            <input
                                type="number"
                                className="form-input"
                                value={settings.optionSetLanguageCodeOverride ?? ""}
                                placeholder="(environment default)"
                                onChange={(e) =>
                                    updateSetting({
                                        optionSetLanguageCodeOverride: e.target.value ? parseInt(e.target.value, 10) : null,
                                    })
                                }
                            />
                        </SettingRow>
                        <SettingRow label="Option Set Names" hint="Override the generated C# name for a conflicting option set. Key: generated name (lowercase). Value: replacement class name.">
                            <KeyValueEditor
                                entries={settings.optionSetNames}
                                onChange={(entries) => updateSetting({ optionSetNames: entries })}
                                keyHeader="Option Set Name"
                                valueHeader="Class Name"
                                keyPlaceholder="e.g. account_rating"
                                valuePlaceholder="e.g. AccountRating"
                            />
                        </SettingRow>
                        <SettingRow label="Option Name Overrides" hint="Fix casing of enum member name tokens. Key: lowercase token to match. Value: correctly-cased replacement (e.g. fedex → FedEx).">
                            <KeyValueEditor
                                entries={settings.optionNameOverrides}
                                onChange={(entries) => updateSetting({ optionNameOverrides: entries })}
                                keyHeader="Token (lowercase)"
                                valueHeader="Replacement"
                                keyPlaceholder="e.g. fedex"
                                valuePlaceholder="e.g. FedEx"
                            />
                        </SettingRow>
                        <SettingRow label="Transliteration Path" hint="Relative path to a transliteration file for non-Latin characters">
                            <PathInput
                                value={settings.transliterationRelativePath}
                                onChange={(v) => updateSetting({ transliterationRelativePath: v })}
                                settingsDir={settingsDir}
                                type="file"
                                placeholder="(none)"
                                title="Select transliteration file"
                            />
                        </SettingRow>
                    </PropertySection>

                    {}
                    <PropertySection title="Messages">
                        <SettingRow label="Generate Messages" hint="Generate Request/Response classes for Dataverse messages, Actions, and Custom APIs">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.generateMessages} onChange={(e) => updateSetting({ generateMessages: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Message Types Folder" hint="Sub-folder name for generated message class files">
                            <input className="form-input" value={settings.messageTypesFolder} onChange={(e) => updateSetting({ messageTypesFolder: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="One File Per Message" hint="Emit a separate .cs file for each message">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.createOneFilePerMessage} onChange={(e) => updateSetting({ createOneFilePerMessage: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Messages Whitelist" hint="Only generate these messages — leave empty to generate all messages">
                            <StringListEditor items={settings.messagesWhitelist} onChange={(items) => updateSetting({ messagesWhitelist: items })} placeholder="Add message name..." />
                        </SettingRow>
                        <SettingRow label="Messages To Skip" hint="Always exclude these messages from generation">
                            <StringListEditor items={settings.messagesToSkip} onChange={(items) => updateSetting({ messagesToSkip: items })} placeholder="Add message name..." />
                        </SettingRow>
                        <SettingRow label="Message Prefixes Whitelist" hint="Only generate messages whose name starts with these prefixes">
                            <StringListEditor items={settings.messagePrefixesWhitelist} onChange={(items) => updateSetting({ messagePrefixesWhitelist: items })} placeholder="Add prefix..." />
                        </SettingRow>
                        <SettingRow label="Group Request With Response" hint="Place Request and Response classes in the same generated file">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.groupMessageRequestWithResponse} onChange={(e) => updateSetting({ groupMessageRequestWithResponse: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Generate Message Attribute Name Consts" hint="Generate a Fields inner class for message parameter name constants">
                            <label className="form-checkbox">
                                <input
                                    type="checkbox"
                                    checked={settings.generateMessageAttributeNameConsts}
                                    onChange={(e) => updateSetting({ generateMessageAttributeNameConsts: e.target.checked })}
                                />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Make Response Messages Editable" hint="Generate settable properties on Response message classes">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.makeResponseMessagesEditable} onChange={(e) => updateSetting({ makeResponseMessagesEditable: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                    </PropertySection>

                    {}
                    <PropertySection title="Service Classes" defaultExpanded={false}>
                        <div className="prop-row">
                            <div />
                            <p className="form-hint">
                                These values are saved to the settings file for compatibility with XrmToolBox EarlyBoundGeneratorV2 but have no effect on code generation in Power Platform ToolBox,
                                which implements generation directly without calling PAC CLI.
                            </p>
                        </div>
                        <SettingRow label="Code Customisation Service" hint="Assembly-qualified type name for DLaB.ModelBuilderExtensions.CustomizeCodeDomService">
                            <input className="form-input" value={settings.codeCustomizationService} onChange={(e) => updateSetting({ codeCustomizationService: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Code Generation Service" hint="Assembly-qualified type name for the code generation service">
                            <input className="form-input" value={settings.codeGenerationService} onChange={(e) => updateSetting({ codeGenerationService: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Code Writer Filter Service" hint="Assembly-qualified type name for the code writer filter service">
                            <input className="form-input" value={settings.codeWriterFilterService} onChange={(e) => updateSetting({ codeWriterFilterService: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Code Writer Message Filter Service" hint="Assembly-qualified type name for the message filter service">
                            <input className="form-input" value={settings.codeWriterMessageFilterService} onChange={(e) => updateSetting({ codeWriterMessageFilterService: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Metadata Provider Service" hint="Assembly-qualified type name for the metadata provider service">
                            <input className="form-input" value={settings.metadataProviderService} onChange={(e) => updateSetting({ metadataProviderService: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Metadata Query Provider Service" hint="Assembly-qualified type name for the metadata query provider service">
                            <input className="form-input" value={settings.metadataQueryProviderService} onChange={(e) => updateSetting({ metadataQueryProviderService: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Naming Service" hint="Assembly-qualified type name for the naming service">
                            <input className="form-input" value={settings.namingService} onChange={(e) => updateSetting({ namingService: e.target.value })} />
                        </SettingRow>
                    </PropertySection>

                    {}
                    <PropertySection title="Debug" defaultExpanded={false}>
                        <SettingRow label="Model Builder Log Level" hint="Verbosity for pac modelbuilder logging: 0 = quiet, 5 = verbose">
                            <input className="form-input" value={settings.modelBuilderLogLevel} onChange={(e) => updateSetting({ modelBuilderLogLevel: e.target.value })} />
                        </SettingRow>
                        <SettingRow label="Update Builder Settings JSON" hint="Write the builderSettings.json file before running pac modelbuilder">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.updateBuilderSettingsJson} onChange={(e) => updateSetting({ updateBuilderSettingsJson: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Read Serialised Metadata" hint="Read metadata from a previously serialised file instead of from Dataverse">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.readSerializedMetadata} onChange={(e) => updateSetting({ readSerializedMetadata: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Serialise Metadata" hint="Write the retrieved metadata to disk for use with Read Serialised Metadata">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.serializeMetadata} onChange={(e) => updateSetting({ serializeMetadata: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                        <SettingRow label="Wait For Attached Debugger" hint="Pause pac modelbuilder at startup until a .NET debugger attaches">
                            <label className="form-checkbox">
                                <input type="checkbox" checked={settings.waitForAttachedDebugger} onChange={(e) => updateSetting({ waitForAttachedDebugger: e.target.checked })} />
                                Enabled
                            </label>
                        </SettingRow>
                    </PropertySection>
                </div>
                <TerminalPanel
                    output={terminalOutput}
                    onClear={() => setTerminalOutput("")}
                    onCopy={() => {
                        void window.toolboxAPI?.utils.copyToClipboard(terminalOutput);
                    }}
                />
            </div>

            <EntityPickerDialog
                isOpen={entityPickerOpen}
                selectedEntities={entityPickerTarget ? settings[entityPickerTarget] : []}
                onConfirm={handleEntityPickerConfirm}
                onClose={handleEntityPickerClose}
            />

            {xmlCandidates.length > 0 && (
                <div className="dialog-overlay">
                    <div className="dialog" style={{ width: 380 }}>
                        <div className="dialog-header">
                            <span style={{ fontWeight: 600, fontSize: 13 }}>Multiple XML files found</span>
                        </div>
                        <div className="dialog-body">
                            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--text-secondary)" }}>Select which settings file to load:</p>
                            <div className="string-list">
                                {xmlCandidates.map((name) => (
                                    <label key={name} className="string-list-item" style={{ cursor: "pointer", gap: 8 }}>
                                        <input
                                            type="radio"
                                            name="xml-pick"
                                            value={name}
                                            onChange={() => {
                                                setXmlCandidates([]);
                                                void loadSettingsFromFile(settingsDir, name);
                                            }}
                                        />
                                        {name}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="dialog-footer">
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    setXmlCandidates([]);
                                    setSettingsFileName(SETTINGS_FILENAME);
                                }}
                            >
                                Use Defaults
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
