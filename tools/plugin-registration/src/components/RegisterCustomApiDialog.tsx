import { useEffect, useMemo, useState } from "react";
import type { CustomApi, CustomApiField, CustomApiRequestParameter, PluginAssembly, SolutionOption } from "../models/interfaces";
import {
    CUSTOM_API_BINDING_GLOBAL,
    CUSTOM_API_BINDING_TYPES,
    CUSTOM_API_PARAMETER_TYPES,
    CUSTOM_API_STEP_TYPES,
} from "../models/interfaces";
import { canSpecifyTable, isLocked, newCustomApi, newCustomApiField, suggestUniqueName, validateCustomApi } from "../utils/customApiRules";
import type { CustomApiPluginTypeOption } from "../utils/DataverseClient";
import { DataverseClient } from "../utils/DataverseClient";

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
    /** Saves the draft. solutionUniqueName is set when creating. The dialog stays open if this throws. */
    onSave: (draft: CustomApi, solutionUniqueName?: string) => Promise<void>;
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
        setPrefix("");
        setSaving(false);
        setErrors([]);
        const fail = (err: unknown) => {
            if (!cancelled) setErrors([err instanceof Error ? err.message : String(err)]);
        };
        client.fetchCustomApiPluginTypes().then((list) => !cancelled && setPluginTypes(list)).catch(fail);
        if (!existing) client.fetchUnmanagedSolutions().then((list) => !cancelled && setSolutions(list)).catch(fail);
        return () => {
            cancelled = true;
        };
        // Reload choices only when the dialog opens or changes between create and edit, not when the API reloads.
    }, [isOpen, isEdit]);

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

    // Plug-in types grouped by assembly name, assemblies in name order.
    const pluginTypeGroups = useMemo(() => {
        const assemblyNames = new Map(assemblies.map((a) => [a.pluginassemblyid.toLowerCase(), a.name]));
        const groups = new Map<string, CustomApiPluginTypeOption[]>();
        for (const t of pluginTypes) {
            const name = assemblyNames.get(t.pluginassemblyid.toLowerCase()) ?? "(Other assemblies)";
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name)!.push(t);
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [assemblies, pluginTypes]);

    if (!isOpen) return null;

    const set = <K extends keyof CustomApi>(key: K, value: CustomApi[K]) => setDraft((d) => ({ ...d, [key]: value }));

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

    const handleSave = async () => {
        const found: string[] = [];
        if (!isEdit && !solutionUniqueName) found.push("Select an unmanaged solution.");
        found.push(...validateCustomApi(draft, existing, prefix || undefined));
        if (found.length > 0) {
            setErrors(found);
            return;
        }
        setSaving(true);
        setErrors([]);
        try {
            await onSave(draft, isEdit ? undefined : solutionUniqueName);
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
                                        <input className="form-input" value={f.logicalentityname} maxLength={100} placeholder={canSpecifyTable(f.type, isRequest) ? "Any table" : ""}
                                            disabled={fixed || !canSpecifyTable(f.type, isRequest)}
                                            onChange={(e) => updateField(kind, i, { logicalentityname: e.target.value.trim() })} />
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
                            <select className="form-select" value={solutionUniqueName} onChange={(e) => setSolutionUniqueName(e.target.value)}>
                                <option value="">(Select an unmanaged solution)</option>
                                {solutions.map((s) => (
                                    <option key={s.uniquename} value={s.uniquename}>{s.friendlyname}</option>
                                ))}
                            </select>
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
                            <select className="form-select" value={draft.plugintypeid ?? ""} disabled={locked}
                                onChange={(e) => set("plugintypeid", e.target.value || undefined)}>
                                <option value="">(None)</option>
                                {draft.plugintypeid && !pluginTypes.some((t) => t.plugintypeid.toLowerCase() === draft.plugintypeid!.toLowerCase()) && (
                                    <option value={draft.plugintypeid}>{draft.plugintypeid}</option>
                                )}
                                {pluginTypeGroups.map(([assembly, types]) => (
                                    <optgroup key={assembly} label={assembly}>
                                        {types.map((t) => (
                                            <option key={t.plugintypeid} value={t.plugintypeid}>{t.typename}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
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
                            <input className="form-input" value={draft.boundentitylogicalname} maxLength={100}
                                disabled={isEdit || draft.bindingtype === CUSTOM_API_BINDING_GLOBAL}
                                onChange={(e) => set("boundentitylogicalname", e.target.value.trim())} />
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
                            <input className="form-input" value={draft.executeprivilegename} maxLength={100} disabled={locked}
                                onChange={(e) => set("executeprivilegename", e.target.value.trim())} />
                        </div>
                    </div>
                    <div className="form-row">
                        <label className="form-label">Description *</label>
                        <textarea className="form-textarea" value={draft.description} maxLength={300} disabled={locked}
                            onChange={(e) => set("description", e.target.value)} />
                    </div>
                    <div style={{ display: "flex", gap: 20 }}>
                        <label className="form-checkbox-row">
                            <input type="checkbox" checked={draft.isfunction} disabled={isEdit} onChange={(e) => set("isfunction", e.target.checked)} />
                            Is Function
                        </label>
                        <label className="form-checkbox-row">
                            <input type="checkbox" checked={draft.isprivate} disabled={locked} onChange={(e) => set("isprivate", e.target.checked)} />
                            Is Private
                        </label>
                        <label className="form-checkbox-row" title="Shown for reference; this tool doesn't change it.">
                            <input type="checkbox" checked={draft.workflowsdkstepenabled} disabled />
                            Enabled for Workflow
                        </label>
                    </div>
                    {isEdit && (
                        <div className="form-hint" style={{ marginBottom: 10 }}>
                            Unique name, binding, bound table, step type and Is Function can't change after creation. Neither can a saved
                            parameter's unique name, type, table or Is Optional.
                        </div>
                    )}
                    {renderFields("request")}
                    {renderFields("response")}
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
