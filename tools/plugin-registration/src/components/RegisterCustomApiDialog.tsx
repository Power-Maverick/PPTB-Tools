import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomApi, CustomApiField, CustomApiRequestParameter, NewSolutionInput, PluginAssembly, PublisherOption, SolutionOption } from "../models/interfaces";
import {
    CUSTOM_API_BINDING_GLOBAL,
    CUSTOM_API_BINDING_TYPES,
    CUSTOM_API_PARAMETER_TYPES,
    CUSTOM_API_STEP_TYPES,
} from "../models/interfaces";
import { canSpecifyTable, compareVersions, isLocked, newCustomApi, newCustomApiField, suggestUniqueName, validateCustomApi, validateKnownNames, validateNewSolution } from "../utils/customApiRules";
import type { CustomApiPluginTypeOption } from "../utils/DataverseClient";
import { DataverseClient } from "../utils/DataverseClient";
import { NameCombobox, SearchableSelect } from "./NameCombobox";
import type { SelectOption } from "./NameCombobox";

const client = new DataverseClient();

type FieldKind = "request" | "response";

function cloneApi(api: CustomApi): CustomApi {
    return {
        ...api,
        requestParameters: api.requestParameters.map((p) => ({ ...p })),
        responseProperties: api.responseProperties.map((p) => ({ ...p })),
    };
}

interface RegisterCustomApiDialogProps {
    isOpen: boolean;
    /** The saved API to edit, or undefined to create one. */
    existing?: CustomApi;
    /** Loaded assemblies, used to group plug-in types by assembly. */
    assemblies: PluginAssembly[];
    /**
     * Saves the draft. solutionUniqueName is set when creating. When editing, childSolutions lists the solutions
     * new parameters and properties join, or is undefined when the API's solutions couldn't be loaded. The dialog
     * stays open if this throws.
     */
    onSave: (draft: CustomApi, solutionUniqueName?: string, childSolutions?: string[]) => Promise<void>;
    onClose: () => void;
}

/**
 * Creates a Custom API, or edits one, with its request parameters and response properties.
 * Fields Dataverse fixes at creation are read-only when editing, and so is everything a managed,
 * non-customizable API protects.
 */
export function RegisterCustomApiDialog({ isOpen, existing, assemblies, onSave, onClose }: RegisterCustomApiDialogProps) {
    const isEdit = !!existing;
    const locked = !!existing && isLocked(existing);

    const [draft, setDraft] = useState<CustomApi>(newCustomApi());
    const [uniqueNameTouched, setUniqueNameTouched] = useState(false);
    const [nameTouched, setNameTouched] = useState(false);
    const [pluginTypes, setPluginTypes] = useState<CustomApiPluginTypeOption[]>([]);
    const [solutions, setSolutions] = useState<SolutionOption[]>([]);
    const [solutionUniqueName, setSolutionUniqueName] = useState("");
    const [prefix, setPrefix] = useState("");
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    // Creating a solution from the dialog, as XrmToolBox does
    const [newSolution, setNewSolution] = useState<NewSolutionInput | null>(null);
    const [newSolutionNameTouched, setNewSolutionNameTouched] = useState(false);
    const [publishers, setPublishers] = useState<PublisherOption[] | null>(null);
    const [creatingSolution, setCreatingSolution] = useState(false);
    const [loadingPublishers, setLoadingPublishers] = useState(false);
    // Names that exist in the environment, offered as suggestions and checked on save. Null until loaded.
    const [tableNames, setTableNames] = useState<string[] | null>(null);
    const [privilegeNames, setPrivilegeNames] = useState<string[] | null>(null);
    // When editing: the unmanaged solutions the API is in, and those new parameters and properties join.
    const [apiSolutions, setApiSolutions] = useState<string[] | null>(null);
    const [childSolutions, setChildSolutions] = useState<Set<string>>(new Set());
    // Changes each time the dialog opens, so results that arrive after it closed are ignored.
    const session = useRef(0);

    // Start from the saved API each time the dialog opens, and again when it is reloaded after a failed save
    // (part of that save may be stored). A reload keeps the error that explains it.
    useEffect(() => {
        if (!isOpen) return;
        setDraft(existing ? cloneApi(existing) : newCustomApi());
        setUniqueNameTouched(!!existing);
        setNameTouched(!!existing);
    }, [isOpen, existing]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setSolutionUniqueName("");
        session.current += 1;
        setNewSolution(null);
        setPublishers(null);
        setLoadingPublishers(false);
        setCreatingSolution(false);
        setPrefix("");
        setSaving(false);
        setErrors([]);
        const fail = (err: unknown) => {
            if (!cancelled) setErrors([err instanceof Error ? err.message : String(err)]);
        };
        client.fetchCustomApiPluginTypes().then((list) => !cancelled && setPluginTypes(list)).catch(fail);
        // Suggestions only: without them the fields stay free text and names aren't checked.
        client.fetchTableNames().then((list) => !cancelled && setTableNames(list)).catch((err: unknown) => console.warn(err));
        client.fetchPrivilegeNames().then((list) => !cancelled && setPrivilegeNames(list)).catch((err: unknown) => console.warn(err));
        if (!existing) client.fetchUnmanagedSolutions().then((list) => !cancelled && setSolutions(list)).catch(fail);
        return () => {
            cancelled = true;
        };
        // Reload choices only when the dialog opens or changes between create and edit, not when the API reloads.
    }, [isOpen, isEdit]);

    // The unmanaged solutions of the API being edited; new parameters and properties join the ones left ticked.
    const editedApiId = existing?.customapiid;
    useEffect(() => {
        setApiSolutions(null);
        setChildSolutions(new Set());
        if (!isOpen || !editedApiId) return;
        let cancelled = false;
        client
            .fetchUnmanagedSolutionsContaining(editedApiId)
            .then((list) => {
                if (cancelled) return;
                setApiSolutions(list);
                setChildSolutions(new Set(list));
            })
            // Unknown: the save then adds new children to every unmanaged solution the API is in.
            .catch((err: unknown) => console.warn(err));
        return () => {
            cancelled = true;
        };
    }, [isOpen, editedApiId]);

    const knownNames = useMemo(
        () => ({
            tables: tableNames ? new Set(tableNames) : undefined,
            privileges: privilegeNames ? new Set(privilegeNames.map((n) => n.toLowerCase())) : undefined,
        }),
        [tableNames, privilegeNames],
    );

    // The publisher prefix of the chosen solution starts the API's unique name.
    useEffect(() => {
        if (!isOpen || isEdit || !solutionUniqueName) {
            setPrefix("");
            return;
        }
        let cancelled = false;
        client
            .fetchPublisherPrefix(solutionUniqueName)
            .then((p) => !cancelled && setPrefix(p))
            .catch((err: unknown) => !cancelled && setErrors([err instanceof Error ? err.message : String(err)]));
        return () => {
            cancelled = true;
        };
    }, [isOpen, isEdit, solutionUniqueName]);

    // Keep suggested names in step with the display name and prefix until the user types their own.
    useEffect(() => {
        if (isEdit) return;
        setDraft((d) => {
            const uniquename = uniqueNameTouched ? d.uniquename : suggestUniqueName(d.displayname, prefix);
            const name = nameTouched ? d.name : uniquename.slice(0, 100);
            return uniquename === d.uniquename && name === d.name ? d : { ...d, uniquename, name };
        });
    }, [isEdit, prefix, draft.displayname, uniqueNameTouched, nameTouched]);

    // Plug-in types with their assembly name and version: an assembly can be registered side by side in two
    // major or minor versions, with the same type names in each. Ordered by assembly name, then newest version,
    // then type name. Search covers all three.
    const pluginTypeOptions = useMemo<SelectOption[]>(() => {
        const assemblyById = new Map(assemblies.map((a) => [a.pluginassemblyid.toLowerCase(), a]));
        return pluginTypes
            .map((t: CustomApiPluginTypeOption) => {
                const assembly = assemblyById.get(t.pluginassemblyid.toLowerCase());
                return {
                    value: t.plugintypeid,
                    label: t.typename,
                    detail: assembly ? `${assembly.name} ${assembly.version}`.trim() : "(Other assemblies)",
                    assemblyName: assembly?.name ?? "￿",
                    version: assembly?.version ?? "",
                };
            })
            .sort((a, b) => a.assemblyName.localeCompare(b.assemblyName) || compareVersions(b.version, a.version) || a.label.localeCompare(b.label))
            .map(({ value, label, detail }) => ({ value, label, detail }));
    }, [assemblies, pluginTypes]);

    if (!isOpen) return null;

    const set = <K extends keyof CustomApi>(key: K, value: CustomApi[K]) => setDraft((d) => ({ ...d, [key]: value }));

    const nameErrors = validateKnownNames(draft, existing, knownNames);
    const unknownBoundTable = nameErrors.some((e) => e.startsWith("Bound table "));
    const unknownPrivilege = nameErrors.some((e) => e.startsWith("Execute privilege "));
    const hasNewChildren = draft.requestParameters.some((f) => !f.id) || draft.responseProperties.some((f) => !f.id);
    const toggleChildSolution = (name: string, on: boolean) =>
        setChildSolutions((current) => {
            const next = new Set(current);
            if (on) next.add(name);
            else next.delete(name);
            return next;
        });

    const listKey = (kind: FieldKind): "requestParameters" | "responseProperties" => (kind === "request" ? "requestParameters" : "responseProperties");

    const updateField = (kind: FieldKind, index: number, changes: Partial<CustomApiRequestParameter>) => {
        setDraft((d) => {
            const list = [...d[listKey(kind)]] as CustomApiRequestParameter[];
            const current = list[index];
            const next = { ...current, ...changes };
            if (!current.id && changes.uniquename !== undefined) {
                // A new row's name follows its unique name, and so does a display name the user hasn't changed.
                // Name and display name allow 100 characters, a unique name 128.
                next.name = changes.uniquename.slice(0, 100);
                if (!current.displayname || current.displayname === current.uniquename.slice(0, 100)) next.displayname = changes.uniquename.slice(0, 100);
            }
            if (!canSpecifyTable(next.type, kind === "request")) next.logicalentityname = "";
            list[index] = next;
            return { ...d, [listKey(kind)]: list };
        });
    };

    const addField = (kind: FieldKind) => {
        setDraft((d) => ({ ...d, [listKey(kind)]: [...d[listKey(kind)], newCustomApiField(d.customapiid)] }));
    };

    const removeField = (kind: FieldKind, index: number) => {
        setDraft((d) => ({ ...d, [listKey(kind)]: d[listKey(kind)].filter((_, i) => i !== index) }));
    };

    const openNewSolution = () => {
        // With a single publisher there is nothing to choose.
        setNewSolution({ friendlyname: "", uniquename: "", version: "1.0.0.0", publisherid: publishers?.length === 1 ? publishers[0].publisherid : "" });
        setNewSolutionNameTouched(false);
        if (publishers !== null || loadingPublishers) return;
        const current = session.current;
        setLoadingPublishers(true);
        client.fetchPublishers()
            .then((list) => {
                if (current !== session.current) return;
                setPublishers(list);
                if (list.length === 1) setNewSolution((n) => (n && !n.publisherid ? { ...n, publisherid: list[0].publisherid } : n));
            })
            // Publishers stay unloaded, so opening the panel again retries.
            .catch((err: unknown) => current === session.current && setErrors([err instanceof Error ? err.message : String(err)]))
            .finally(() => current === session.current && setLoadingPublishers(false));
    };

    const editNewSolution = (changes: Partial<NewSolutionInput>) => {
        setNewSolution((n) => {
            if (!n) return n;
            const next = { ...n, ...changes };
            // Suggest the unique name from the display name until the user types one.
            if (changes.friendlyname !== undefined && !newSolutionNameTouched) next.uniquename = suggestUniqueName(changes.friendlyname).slice(0, 65);
            return next;
        });
    };

    const handleCreateSolution = async () => {
        if (!newSolution) return;
        const found = validateNewSolution(newSolution);
        const uniquename = newSolution.uniquename.toLowerCase();
        if (solutions.some((x) => x.uniquename.toLowerCase() === uniquename)) {
            found.push(`A solution named ${newSolution.uniquename} already exists. Select it in the list instead.`);
        }
        if (found.length > 0) {
            setErrors(found);
            return;
        }
        const current = session.current;
        setCreatingSolution(true);
        setErrors([]);
        try {
            const created = await client.createSolution(newSolution);
            if (current !== session.current) return;
            setSolutions((list) => [...list, created].sort((a, b) => a.friendlyname.localeCompare(b.friendlyname)));
            setSolutionUniqueName(created.uniquename);
            setNewSolution(null);
        } catch (err: unknown) {
            if (current !== session.current) return;
            setErrors([err instanceof Error ? err.message : String(err)]);
            // The create may be saved although it reported an error. The name wasn't in the list before, so a
            // solution with it now is the one just created: offer it instead of a create that would clash.
            const list = await client.fetchUnmanagedSolutions().catch(() => undefined);
            const createdAnyway = list?.find((x) => x.uniquename.toLowerCase() === uniquename);
            if (current !== session.current || !list || !createdAnyway) return;
            setSolutions(list);
            setSolutionUniqueName(createdAnyway.uniquename);
            setNewSolution(null);
        } finally {
            if (current === session.current) setCreatingSolution(false);
        }
    };

    const handleSave = async () => {
        const found: string[] = [];
        if (!isEdit && !solutionUniqueName) found.push("Select an unmanaged solution.");
        found.push(...validateCustomApi(draft, existing, prefix || undefined));
        found.push(...validateKnownNames(draft, existing, knownNames));
        if (found.length > 0) {
            setErrors(found);
            return;
        }
        setSaving(true);
        setErrors([]);
        try {
            const chosen = apiSolutions ? apiSolutions.filter((x) => childSolutions.has(x)) : undefined;
            await onSave(draft, isEdit ? undefined : solutionUniqueName, isEdit ? chosen : undefined);
        } catch (err: unknown) {
            setErrors([err instanceof Error ? err.message : String(err)]);
        } finally {
            setSaving(false);
        }
    };

    const renderFields = (kind: FieldKind) => {
        const isRequest = kind === "request";
        const rows = draft[listKey(kind)] as CustomApiField[];
        const saved = (id: string) => !!id;
        const savedRows = isRequest ? existing?.requestParameters : existing?.responseProperties;
        const rowLocked = (f: CustomApiField) => {
            const original = savedRows?.find((s) => s.id === f.id);
            return !!original && isLocked(original);
        };
        return (
            <>
                <div className="form-section-title">
                    <span>{isRequest ? "Request Parameters" : "Response Properties"}</span>
                    <button className="btn-secondary" onClick={() => addField(kind)} disabled={saving}>
                        Add {isRequest ? "Parameter" : "Property"}
                    </button>
                </div>
                <table className="field-table">
                    <thead>
                        <tr>
                            <th>Unique Name *</th>
                            <th>Display Name *</th>
                            <th>Type</th>
                            <th>Table</th>
                            {isRequest && <th>Optional</th>}
                            <th>Description</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={isRequest ? 7 : 6} className="field-table-empty">None</td>
                            </tr>
                        )}
                        {rows.map((f, i) => {
                            const fixed = saved(f.id);
                            const fLocked = rowLocked(f);
                            return (
                                <tr key={f.id || `new-${i}`}>
                                    <td>
                                        <input className="form-input" value={f.uniquename} disabled={fixed} maxLength={128}
                                            onChange={(e) => updateField(kind, i, { uniquename: e.target.value })} />
                                    </td>
                                    <td>
                                        <input className="form-input" value={f.displayname} disabled={fLocked} maxLength={100}
                                            onChange={(e) => updateField(kind, i, { displayname: e.target.value })} />
                                    </td>
                                    <td>
                                        <select className="form-select" value={f.type} disabled={fixed}
                                            onChange={(e) => updateField(kind, i, { type: Number(e.target.value) })}>
                                            {f.type < 0 && <option value={f.type}>(not set)</option>}
                                            {Object.entries(CUSTOM_API_PARAMETER_TYPES).map(([v, label]) => (
                                                <option key={v} value={v}>{label}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <NameCombobox value={f.logicalentityname} maxLength={100} placeholder={canSpecifyTable(f.type, isRequest) ? "Any table" : ""}
                                            options={tableNames} aria-label="Table" disabled={fixed || !canSpecifyTable(f.type, isRequest)}
                                            onChange={(value) => updateField(kind, i, { logicalentityname: value })} />
                                    </td>
                                    {isRequest && (
                                        <td style={{ textAlign: "center" }}>
                                            <input type="checkbox" checked={(f as CustomApiRequestParameter).isoptional} disabled={fixed}
                                                onChange={(e) => updateField(kind, i, { isoptional: e.target.checked })} />
                                        </td>
                                    )}
                                    <td>
                                        <input className="form-input" value={f.description} disabled={fLocked} maxLength={isRequest ? 300 : 100}
                                            onChange={(e) => updateField(kind, i, { description: e.target.value })} />
                                    </td>
                                    <td>
                                        <button className="dialog-close" title={f.ismanaged ? "Managed records can't be removed here" : "Remove"} aria-label="Remove"
                                            disabled={f.ismanaged || saving} onClick={() => removeField(kind, i)}>✕</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </>
        );
    };

    return (
        <div className="dialog-overlay">
            <div className="dialog dialog-wide">
                <div className="dialog-header">
                    <span className="dialog-title">{isEdit ? `Update Custom API: ${existing.uniquename}` : "Register New Custom API"}</span>
                    <button className="dialog-close" onClick={onClose} aria-label="Close dialog" title="Close dialog">✕</button>
                </div>
                <div className="dialog-body">
                    {locked && (
                        <div className="form-hint" style={{ marginBottom: 10 }}>
                            This Custom API is managed and doesn't allow customization. Its existing fields can't be changed, and new request parameters must be optional.
                        </div>
                    )}
                    {!isEdit && (
                        <div className="form-row">
                            <label className="form-label">Solution *</label>
                            <div className="form-inline">
                                <select className="form-select" value={solutionUniqueName} onChange={(e) => setSolutionUniqueName(e.target.value)} disabled={!!newSolution}>
                                    <option value="">(Select an unmanaged solution)</option>
                                    {solutions.map((s) => (
                                        <option key={s.uniquename} value={s.uniquename}>{s.friendlyname}</option>
                                    ))}
                                </select>
                                {!newSolution && (
                                    <button className="btn-secondary" onClick={openNewSolution} disabled={saving}>New solution…</button>
                                )}
                            </div>
                            {newSolution && (
                                <div className="form-subsection">
                                    <div className="form-section-title">New Solution</div>
                                    <div className="form-columns">
                                        <div className="form-row">
                                            <label className="form-label">Display Name *</label>
                                            <input className="form-input" value={newSolution.friendlyname} maxLength={256}
                                                onChange={(e) => editNewSolution({ friendlyname: e.target.value })} />
                                        </div>
                                        <div className="form-row">
                                            <label className="form-label">Unique Name *</label>
                                            <input className="form-input" value={newSolution.uniquename} maxLength={65}
                                                onChange={(e) => {
                                                    setNewSolutionNameTouched(true);
                                                    editNewSolution({ uniquename: e.target.value });
                                                }} />
                                        </div>
                                        <div className="form-row">
                                            <label className="form-label">Publisher *</label>
                                            <select className="form-select" value={newSolution.publisherid} onChange={(e) => editNewSolution({ publisherid: e.target.value })}>
                                                <option value="">{loadingPublishers ? "Loading…" : "(Select a publisher)"}</option>
                                                {(publishers ?? []).map((pub) => (
                                                    <option key={pub.publisherid} value={pub.publisherid}>{`${pub.friendlyname} (${pub.customizationprefix})`}</option>
                                                ))}
                                            </select>
                                            {publishers?.length === 0 && <div className="form-hint">No publishers with a prefix exist. Create one in Power Apps first.</div>}
                                        </div>
                                        <div className="form-row">
                                            <label className="form-label">Version *</label>
                                            <input className="form-input" value={newSolution.version} maxLength={50}
                                                onChange={(e) => editNewSolution({ version: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="form-inline form-inline-end">
                                        <button className="btn-secondary" onClick={() => setNewSolution(null)} disabled={creatingSolution}>Cancel</button>
                                        <button className="btn-primary" onClick={() => void handleCreateSolution()} disabled={creatingSolution}>
                                            {creatingSolution ? "Creating…" : "Create Solution"}
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="form-hint">
                                The API and its parameters are added to this solution. Its publisher prefix starts the unique name{prefix ? ` (${prefix}_)` : ""}.
                            </div>
                        </div>
                    )}
                    <div className="form-columns">
                        <div className="form-row">
                            <label className="form-label">Display Name *</label>
                            <input className="form-input" value={draft.displayname} maxLength={100} disabled={locked}
                                onChange={(e) => set("displayname", e.target.value)} />
                        </div>
                        <div className="form-row">
                            <label className="form-label">Unique Name *</label>
                            <input className="form-input" value={draft.uniquename} maxLength={128} disabled={isEdit}
                                onChange={(e) => { setUniqueNameTouched(true); set("uniquename", e.target.value); }} />
                        </div>
                        <div className="form-row">
                            <label className="form-label">Name *</label>
                            <input className="form-input" value={draft.name} maxLength={100} disabled={locked}
                                onChange={(e) => { setNameTouched(true); set("name", e.target.value); }} />
                        </div>
                        <div className="form-row">
                            <label className="form-label">Plug-in Type</label>
                            <SearchableSelect value={draft.plugintypeid ?? ""} options={pluginTypeOptions} noneLabel="(None)" disabled={locked}
                                aria-label="Plug-in type" onChange={(value) => set("plugintypeid", value || undefined)} />
                        </div>
                        <div className="form-row">
                            <label className="form-label">Binding Type</label>
                            <select className="form-select" value={draft.bindingtype} disabled={isEdit}
                                onChange={(e) => {
                                    const value = Number(e.target.value);
                                    setDraft((d) => ({ ...d, bindingtype: value, boundentitylogicalname: value === CUSTOM_API_BINDING_GLOBAL ? "" : d.boundentitylogicalname }));
                                }}>
                                {draft.bindingtype < 0 && <option value={draft.bindingtype}>(not set)</option>}
                                {Object.entries(CUSTOM_API_BINDING_TYPES).map(([v, label]) => (
                                    <option key={v} value={v}>{label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-row">
                            <label className="form-label">Bound Table Logical Name{draft.bindingtype > CUSTOM_API_BINDING_GLOBAL ? " *" : ""}</label>
                            <NameCombobox value={draft.boundentitylogicalname} maxLength={100} options={tableNames} aria-label="Bound table logical name"
                                disabled={isEdit || draft.bindingtype === CUSTOM_API_BINDING_GLOBAL}
                                onChange={(value) => set("boundentitylogicalname", value)} />
                            {unknownBoundTable && <div className="form-hint form-hint-error">No table with this logical name exists in this environment.</div>}
                        </div>
                        <div className="form-row">
                            <label className="form-label">Allowed Custom Processing Step Type</label>
                            <select className="form-select" value={draft.allowedcustomprocessingsteptype} disabled={isEdit}
                                onChange={(e) => set("allowedcustomprocessingsteptype", Number(e.target.value))}>
                                {draft.allowedcustomprocessingsteptype < 0 && <option value={draft.allowedcustomprocessingsteptype}>(not set)</option>}
                                {Object.entries(CUSTOM_API_STEP_TYPES).map(([v, label]) => (
                                    <option key={v} value={v}>{label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-row">
                            <label className="form-label">Execute Privilege Name</label>
                            <NameCombobox value={draft.executeprivilegename} maxLength={100} disabled={locked} options={privilegeNames} aria-label="Execute privilege name"
                                placeholder="Anyone can call it" onChange={(value) => set("executeprivilegename", value)} />
                            {unknownPrivilege && <div className="form-hint form-hint-error">No privilege with this name exists in this environment.</div>}
                        </div>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Description *</label>
                        <textarea className="form-textarea" value={draft.description} maxLength={300} disabled={locked}
                            onChange={(e) => set("description", e.target.value)} />
                    </div>
                    <div style={{ display: "flex", gap: 20 }}>
                        <label className="form-checkbox-row">
                            <input type="checkbox" checked={draft.isfunction} disabled={isEdit || draft.workflowsdkstepenabled}
                                title={!isEdit && draft.workflowsdkstepenabled ? "A Custom API enabled for workflow can't be a function." : undefined}
                                onChange={(e) => set("isfunction", e.target.checked)} />
                            Is Function
                        </label>
                        <label className="form-checkbox-row">
                            <input type="checkbox" checked={draft.isprivate} disabled={locked} onChange={(e) => set("isprivate", e.target.checked)} />
                            Is Private
                        </label>
                        <label className="form-checkbox-row"
                            title={isEdit ? "Fixed when the Custom API is created." : draft.isfunction ? "A function can't be enabled for workflow." : "Offer this API as a step in classic workflows."}>
                            <input type="checkbox" checked={draft.workflowsdkstepenabled} disabled={isEdit || draft.isfunction}
                                onChange={(e) => set("workflowsdkstepenabled", e.target.checked)} />
                            Enabled for Workflow
                        </label>
                    </div>
                    {!isEdit && draft.workflowsdkstepenabled && (
                        <div className="form-hint" style={{ marginBottom: 10 }}>
                            Classic workflows can't pass Entity, EntityCollection or StringArray values, and accept EntityReference only on an
                            entity-bound API. This can't be changed after the API is created.
                        </div>
                    )}
                    {isEdit && (
                        <div className="form-hint" style={{ marginBottom: 10 }}>
                            Unique name, binding, bound table, step type, Is Function and Enabled for Workflow can't change after creation. Neither can a saved
                            parameter's unique name, type, table or Is Optional.
                        </div>
                    )}
                    {renderFields("request")}
                    {renderFields("response")}
                    {isEdit && hasNewChildren && apiSolutions && (
                        <div className="form-subsection">
                            <div className="form-section-title">Solutions for new parameters and properties</div>
                            {apiSolutions.length === 0 ? (
                                <div className="form-hint">This API isn't in any unmanaged solution, so new parameters and properties are only in the Default solution.</div>
                            ) : (
                                <>
                                    <div className="form-hint">This API is in these unmanaged solutions. New parameters and properties are added to the ones ticked.</div>
                                    {apiSolutions.map((name) => (
                                        <label key={name} className="form-checkbox-row">
                                            <input type="checkbox" checked={childSolutions.has(name)} disabled={saving}
                                                onChange={(e) => toggleChildSolution(name, e.target.checked)} />
                                            {name}
                                        </label>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                    {errors.length > 0 && (
                        <div className="form-submit-error" style={{ whiteSpace: "pre-line" }}>{errors.join("\n")}</div>
                    )}
                </div>
                <div className="dialog-footer">
                    <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
                        {saving ? "Saving…" : isEdit ? "Update" : "Register"}
                    </button>
                </div>
            </div>
        </div>
    );
}
