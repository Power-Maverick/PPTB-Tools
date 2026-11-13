import type { CustomApi, CustomApiField, CustomApiRequestParameter } from "../models/interfaces";
import {
  CUSTOM_API_BINDING_ENTITY,
  CUSTOM_API_BINDING_ENTITY_COLLECTION,
  CUSTOM_API_BINDING_GLOBAL,
  CUSTOM_API_BINDING_TYPES,
  CUSTOM_API_PARAMETER_TYPES,
  CUSTOM_API_STEP_TYPES,
  CUSTOM_API_TYPE_ENTITY,
  CUSTOM_API_TYPE_ENTITY_COLLECTION,
  CUSTOM_API_TYPE_ENTITY_REFERENCE,
  CUSTOM_API_TYPE_STRING_ARRAY,
} from "../models/interfaces";

/**
 * Custom API rules that don't need React or Dataverse: validation of a draft, the records sent to
 * Dataverse, and the changes needed to turn a saved API into an edited one.
 */

export const REQUEST_TABLE = "customapirequestparameter";
export const RESPONSE_TABLE = "customapiresponseproperty";
export type CustomApiChildTable = typeof REQUEST_TABLE | typeof RESPONSE_TABLE;

/** Collection-valued navigation properties of customapi, used for deep insert. */
export const REQUEST_NAVIGATION = "CustomAPIRequestParameters";
export const RESPONSE_NAVIGATION = "CustomAPIResponseProperties";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a Dataverse-format GUID: hyphenated hex, any case, no braces. */
export function isGuid(value: string): boolean {
  return GUID.test(value);
}

/** Dataverse stores blank text as null; editors return "". Treat both as the same value. */
function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "") === (b ?? "");
}

function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

function optionalText(value: string | null | undefined): string | null {
  return value ? value : null;
}

/** True when Dataverse would refuse changes to the record's own fields. */
export function isLocked(record: { ismanaged: boolean; iscustomizable: boolean }): boolean {
  return record.ismanaged && !record.iscustomizable;
}

/** Suggests a unique name from a display name: letters, digits and underscores only. */
export function suggestUniqueName(displayName: string, prefix = ""): string {
  const body = displayName.replace(/[^A-Za-z0-9_]/g, "");
  return prefix ? `${prefix}_${body}` : body;
}

/** Whether a table logical name can be given for this parameter type. */
export function canSpecifyTable(type: number, isRequest: boolean): boolean {
  return type === CUSTOM_API_TYPE_ENTITY || type === CUSTOM_API_TYPE_ENTITY_REFERENCE || (isRequest && type === CUSTOM_API_TYPE_ENTITY_COLLECTION);
}

/**
 * Validates a draft before it is saved. Pass the saved API when editing: its ids and managed
 * properties decide which edits Dataverse allows. Pass the solution publisher prefix when creating.
 * Returns the problems found; an empty list means the draft can be saved.
 */
export function validateCustomApi(draft: CustomApi, original?: CustomApi, publisherPrefix?: string): string[] {
  const errors: string[] = [];
  const isEdit = !!original;

  validateNames(draft, "Custom API", errors, original);
  // The API description is required, but don't block other edits on a blank one saved elsewhere.
  if (!original || !same(draft.description, original.description)) required(draft.description, "Custom API description", errors);
  maxLength(draft.description, 300, "Custom API description", errors);
  maxLength(draft.boundentitylogicalname, 100, "Bound table logical name", errors);
  maxLength(draft.executeprivilegename, 100, "Execute privilege name", errors);

  // A choice read back without a value can't be fixed in the editor once the field is locked, so only check new or changed values.
  if (draft.bindingtype !== original?.bindingtype && !(draft.bindingtype in CUSTOM_API_BINDING_TYPES)) errors.push("Select a valid binding type.");
  if (draft.allowedcustomprocessingsteptype !== original?.allowedcustomprocessingsteptype && !(draft.allowedcustomprocessingsteptype in CUSTOM_API_STEP_TYPES)) {
    errors.push("Select a valid allowed custom processing step type.");
  }
  if (draft.bindingtype === CUSTOM_API_BINDING_GLOBAL && draft.boundentitylogicalname) {
    errors.push("A global Custom API cannot specify a bound table logical name.");
  } else if (draft.bindingtype === CUSTOM_API_BINDING_ENTITY || draft.bindingtype === CUSTOM_API_BINDING_ENTITY_COLLECTION) {
    required(draft.boundentitylogicalname, "Bound table logical name", errors);
  }
  if (draft.plugintypeid && !GUID.test(draft.plugintypeid)) errors.push("The plug-in type ID is not valid.");
  if (draft.isfunction && draft.responseProperties.length === 0) errors.push("A function must have at least one response property.");
  if (draft.workflowsdkstepenabled && draft.isfunction) errors.push("A Custom API enabled for workflow cannot be a function.");

  if (!isEdit) {
    if (draft.customapiid) errors.push("A new Custom API must have an empty ID.");
    if (publisherPrefix && (!draft.uniquename.startsWith(`${publisherPrefix}_`) || draft.uniquename.length === publisherPrefix.length + 1)) {
      errors.push(`Custom API unique name must start with the solution publisher prefix '${publisherPrefix}_' followed by a name.`);
    }
  } else {
    validateApiChanges(draft, original, errors);
  }

  const ids = new Set<string>();
  validateFields(draft.requestParameters, original?.requestParameters, true, draft, original, ids, errors);
  validateFields(draft.responseProperties, original?.responseProperties, false, draft, original, ids, errors);
  return errors;
}

function validateApiChanges(draft: CustomApi, original: CustomApi, errors: string[]) {
  if (!original.customapiid || !sameId(draft.customapiid, original.customapiid)) errors.push("The Custom API ID must match the saved definition.");
  // Dataverse fixes the message contract at creation, even in unmanaged solutions.
  immutable(same(draft.uniquename, original.uniquename), "Custom API unique name", errors);
  immutable(draft.bindingtype === original.bindingtype, "Binding type", errors);
  immutable(same(draft.boundentitylogicalname, original.boundentitylogicalname), "Bound table logical name", errors);
  immutable(draft.allowedcustomprocessingsteptype === original.allowedcustomprocessingsteptype, "Allowed custom processing step type", errors);
  immutable(draft.isfunction === original.isfunction, "Is Function", errors);
  immutable(draft.workflowsdkstepenabled === original.workflowsdkstepenabled, "Enabled for Workflow", errors);
  if (
    isLocked(original) &&
    (!same(draft.name, original.name) ||
      !same(draft.displayname, original.displayname) ||
      !same(draft.description, original.description) ||
      !same(draft.executeprivilegename, original.executeprivilegename) ||
      !sameId(draft.plugintypeid, original.plugintypeid) ||
      draft.isprivate !== original.isprivate)
  ) {
    errors.push("This managed Custom API does not allow customization.");
  }
}

function validateFields(
  fields: CustomApiField[],
  originals: CustomApiField[] | undefined,
  isRequest: boolean,
  draft: CustomApi,
  original: CustomApi | undefined,
  ids: Set<string>,
  errors: string[],
) {
  const kind = isRequest ? "Request parameter" : "Response property";
  const names = new Set<string>();
  const retained = new Set<string>();
  for (const field of fields) {
    const label = `${kind} '${field.uniquename}'`;
    const saved = field.id ? originals?.find((o) => sameId(o.id, field.id)) : undefined;
    validateNames(field, label, errors, saved);
    maxLength(field.description, isRequest ? 300 : 100, `${label} description`, errors);
    maxLength(field.logicalentityname, 100, `${label} table logical name`, errors);
    const key = field.uniquename.toLowerCase();
    if (field.uniquename) {
      if (names.has(key)) errors.push(`${label} has a duplicate unique name.`);
      names.add(key);
    }
    if (field.type !== saved?.type && !(field.type in CUSTOM_API_PARAMETER_TYPES)) errors.push(`${label} must have a valid type.`);
    if (!canSpecifyTable(field.type, isRequest) && field.logicalentityname) errors.push(`${label} cannot specify a table logical name for this type.`);
    if (isRequest && draft.bindingtype === CUSTOM_API_BINDING_ENTITY && key === "target") {
      // Entity binding supplies Target automatically; collection binding does not.
      errors.push(`${label} conflicts with the implicit Target parameter for an entity-bound Custom API.`);
    }
    if (
      draft.workflowsdkstepenabled &&
      (field.type === CUSTOM_API_TYPE_ENTITY ||
        field.type === CUSTOM_API_TYPE_ENTITY_COLLECTION ||
        field.type === CUSTOM_API_TYPE_STRING_ARRAY ||
        (field.type === CUSTOM_API_TYPE_ENTITY_REFERENCE && draft.bindingtype !== CUSTOM_API_BINDING_ENTITY))
    ) {
      errors.push(`${label} has a type that is not supported by workflow for this binding.`);
    }

    if (field.id) {
      const id = field.id.toLowerCase();
      retained.add(id);
      if (ids.has(id)) errors.push(`${label} has a duplicate ID.`);
      ids.add(id);
      if (!saved) errors.push(`${label} must have an empty ID unless it belongs to the saved definition.`);
    }
    if (saved) {
      immutable(same(field.uniquename, saved.uniquename), `${label} unique name`, errors);
      immutable(field.type === saved.type, `${label} type`, errors);
      immutable(same(field.logicalentityname, saved.logicalentityname), `${label} table logical name`, errors);
      if (isRequest) {
        immutable((field as CustomApiRequestParameter).isoptional === (saved as CustomApiRequestParameter).isoptional, `${label} Is Optional`, errors);
      }
      if (isLocked(saved) && (!same(field.name, saved.name) || !same(field.displayname, saved.displayname) || !same(field.description, saved.description))) {
        errors.push(`${label} is managed and does not allow customization.`);
      }
    } else if (original && isLocked(original) && isRequest && !(field as CustomApiRequestParameter).isoptional) {
      // A protected API may be extended without changing the contract existing callers use.
      errors.push(`${label} must be optional when added to a managed Custom API that disallows customization.`);
    }
  }
  for (const removed of originals ?? []) {
    if (!retained.has(removed.id.toLowerCase()) && removed.ismanaged) {
      errors.push(`${kind} '${removed.uniquename}' is managed and must be removed through its managed solution.`);
    }
  }
}

function validateNames(
  record: { name: string; uniquename: string; displayname: string },
  label: string,
  errors: string[],
  saved?: { name: string; displayname: string },
) {
  // Records created elsewhere may lack these names; an unchanged blank must not block other edits.
  if (!saved || !same(record.name, saved.name)) required(record.name, `${label} name`, errors);
  required(record.uniquename, `${label} unique name`, errors);
  if (!saved || !same(record.displayname, saved.displayname)) required(record.displayname, `${label} display name`, errors);
  maxLength(record.name, 100, `${label} name`, errors);
  maxLength(record.uniquename, 128, `${label} unique name`, errors);
  maxLength(record.displayname, 100, `${label} display name`, errors);
  // Dataverse accepts some characters the editor doesn't offer. A saved unique name can't change,
  // so only check new ones; otherwise the whole record would become uneditable.
  if (!saved && record.uniquename.trim() && !IDENTIFIER.test(record.uniquename)) {
    errors.push(`${label} unique name must start with a letter or underscore and contain only letters, digits, and underscores.`);
  }
}

function required(value: string | null | undefined, label: string, errors: string[]) {
  if (!value || !value.trim()) errors.push(`${label} is required.`);
}

function maxLength(value: string | null | undefined, max: number, label: string, errors: string[]) {
  if (value && value.length > max) errors.push(`${label} cannot exceed ${max} characters.`);
}

function immutable(unchanged: boolean, label: string, errors: string[]) {
  if (!unchanged) errors.push(`${label} cannot be changed after creation.`);
}

// ── Records sent to Dataverse ──

export function pluginTypeBind(pluginTypeId: string): string {
  if (!isGuid(pluginTypeId)) throw new Error(`Invalid plug-in type ID: "${pluginTypeId}"`);
  return `/plugintypes(${pluginTypeId})`;
}

export function customApiBind(customApiId: string): string {
  if (!isGuid(customApiId)) throw new Error(`Invalid Custom API ID: "${customApiId}"`);
  return `/customapis(${customApiId})`;
}

/** The fields of a saved request parameter or response property that can still change. */
function mutableField(field: CustomApiField): Record<string, unknown> {
  return {
    name: field.name,
    displayname: field.displayname,
    description: optionalText(field.description),
  };
}

/** The record that creates a request parameter or response property. */
export function fieldCreateRecord(field: CustomApiField, isRequest: boolean): Record<string, unknown> {
  const record: Record<string, unknown> = {
    ...mutableField(field),
    uniquename: field.uniquename,
    type: field.type,
    logicalentityname: optionalText(field.logicalentityname),
  };
  if (isRequest) record["isoptional"] = (field as CustomApiRequestParameter).isoptional;
  return record;
}

/** The record that creates a Custom API with its request parameters and response properties (deep insert). */
export function customApiCreateRecord(api: CustomApi): Record<string, unknown> {
  const record: Record<string, unknown> = {
    name: api.name,
    uniquename: api.uniquename,
    displayname: api.displayname,
    description: optionalText(api.description),
    bindingtype: api.bindingtype,
    boundentitylogicalname: optionalText(api.boundentitylogicalname),
    allowedcustomprocessingsteptype: api.allowedcustomprocessingsteptype,
    executeprivilegename: optionalText(api.executeprivilegename),
    isfunction: api.isfunction,
    isprivate: api.isprivate,
    workflowsdkstepenabled: api.workflowsdkstepenabled,
  };
  if (api.plugintypeid) record["PluginTypeId@odata.bind"] = pluginTypeBind(api.plugintypeid);
  if (api.requestParameters.length > 0) record[REQUEST_NAVIGATION] = api.requestParameters.map((p) => fieldCreateRecord(p, true));
  if (api.responseProperties.length > 0) record[RESPONSE_NAVIGATION] = api.responseProperties.map((p) => fieldCreateRecord(p, false));
  return record;
}

function changedValues(original: Record<string, unknown>, updated: Record<string, unknown>): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updated)) {
    const previous = original[key];
    const unchanged = typeof value === "string" || typeof previous === "string" || value === null || previous === null
      ? same(previous as string | null, value as string | null)
      : previous === value;
    // A null value is intentional: leaving it out would keep the old value in Dataverse.
    if (!unchanged) changes[key] = value;
  }
  return changes;
}

export interface CustomApiUpdatePlan {
  /** Changed fields of the API itself; empty when nothing changed. */
  apiChanges: Record<string, unknown>;
  /** Saved children the draft no longer has. Delete these first, so a replacement can reuse the name. */
  deletes: { table: CustomApiChildTable; id: string }[];
  updates: { table: CustomApiChildTable; id: string; changes: Record<string, unknown> }[];
  /** New children, already bound to the API. */
  creates: { table: CustomApiChildTable; record: Record<string, unknown> }[];
}

export function isEmptyPlan(plan: CustomApiUpdatePlan): boolean {
  return Object.keys(plan.apiChanges).length === 0 && plan.deletes.length === 0 && plan.updates.length === 0 && plan.creates.length === 0;
}

/** Works out the writes that turn the saved API into the draft. Only fields Dataverse lets you change are written. */
export function planCustomApiUpdate(original: CustomApi, draft: CustomApi): CustomApiUpdatePlan {
  const apiChanges = changedValues(
    { name: original.name, displayname: original.displayname, description: original.description, executeprivilegename: original.executeprivilegename, isprivate: original.isprivate },
    { name: draft.name, displayname: draft.displayname, description: optionalText(draft.description), executeprivilegename: optionalText(draft.executeprivilegename), isprivate: draft.isprivate },
  );
  if (!sameId(original.plugintypeid, draft.plugintypeid)) {
    apiChanges["PluginTypeId@odata.bind"] = draft.plugintypeid ? pluginTypeBind(draft.plugintypeid) : null;
  }

  const plan: CustomApiUpdatePlan = { apiChanges, deletes: [], updates: [], creates: [] };
  const children: [CustomApiField[], CustomApiField[], CustomApiChildTable][] = [
    [original.requestParameters, draft.requestParameters, REQUEST_TABLE],
    [original.responseProperties, draft.responseProperties, RESPONSE_TABLE],
  ];
  for (const [saved, edited, table] of children) {
    const keptIds = new Set(edited.filter((f) => f.id).map((f) => f.id.toLowerCase()));
    for (const removed of saved) {
      if (!keptIds.has(removed.id.toLowerCase())) plan.deletes.push({ table, id: removed.id });
    }
    for (const field of edited) {
      if (!field.id) {
        plan.creates.push({ table, record: { ...fieldCreateRecord(field, table === REQUEST_TABLE), "CustomAPIId@odata.bind": customApiBind(original.customapiid) } });
        continue;
      }
      const previous = saved.find((s) => sameId(s.id, field.id));
      if (!previous) continue; // validation reports this
      const changes = changedValues(mutableField(previous), mutableField(field));
      if (Object.keys(changes).length > 0) plan.updates.push({ table, id: field.id, changes });
    }
  }
  return plan;
}

/** An empty draft for a new API or one of its fields. */
export function newCustomApi(): CustomApi {
  return {
    customapiid: "",
    name: "",
    uniquename: "",
    displayname: "",
    description: "",
    bindingtype: CUSTOM_API_BINDING_GLOBAL,
    boundentitylogicalname: "",
    allowedcustomprocessingsteptype: 0,
    executeprivilegename: "",
    isfunction: false,
    isprivate: false,
    workflowsdkstepenabled: false,
    ismanaged: false,
    iscustomizable: true,
    requestParameters: [],
    responseProperties: [],
  };
}

export function newCustomApiField(customApiId: string): CustomApiRequestParameter {
  return {
    id: "",
    customapiid: customApiId,
    name: "",
    uniquename: "",
    displayname: "",
    description: "",
    type: 10, // String
    logicalentityname: "",
    ismanaged: false,
    iscustomizable: true,
    isoptional: false,
  };
}
