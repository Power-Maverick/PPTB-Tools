/**
 * Returns true when the Dataverse field type is a reference (Lookup, Owner, or Customer).
 * These fields must be queried as `_fieldname_value` in an OData $select clause.
 */
export function isReferenceFieldType(fieldType: string): boolean {
    return fieldType.includes("Lookup") || fieldType.includes("Owner") || fieldType.includes("Customer");
}
