import { DataverseField, FieldMapping } from "../models/interfaces";

interface FieldSelectorProps {
  fields: DataverseField[];
  fieldMappings: FieldMapping[];
  onFieldMappingsChange: (mappings: FieldMapping[]) => void;
}

export function FieldSelector({
  fields,
  fieldMappings,
  onFieldMappingsChange,
}: FieldSelectorProps) {
  const handleToggleField = (fieldName: string) => {
    const updatedMappings = fieldMappings.map((mapping) =>
      mapping.sourceField === fieldName
        ? { ...mapping, isEnabled: !mapping.isEnabled }
        : mapping
    );
    onFieldMappingsChange(updatedMappings);
  };

  const handleSelectAll = () => {
    const updatedMappings = fieldMappings.map((mapping) => ({
      ...mapping,
      isEnabled: true,
    }));
    onFieldMappingsChange(updatedMappings);
  };

  const handleDeselectAll = () => {
    const updatedMappings = fieldMappings.map((mapping) => ({
      ...mapping,
      isEnabled: false,
    }));
    onFieldMappingsChange(updatedMappings);
  };

  const selectedCount = fieldMappings.filter((m) => m.isEnabled).length;

  return (
    <div className="config-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Select Fields ({selectedCount} of {fieldMappings.length})</h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn-secondary" onClick={handleSelectAll}>
            Select All
          </button>
          <button className="btn-secondary" onClick={handleDeselectAll}>
            Deselect All
          </button>
        </div>
      </div>
      <div className="field-list">
        {fieldMappings.map((mapping) => {
          const field = fields.find((f) => f.logicalName === mapping.sourceField);
          return (
            <div key={mapping.sourceField} className="checkbox-group">
              <input
                type="checkbox"
                id={`field-${mapping.sourceField}`}
                checked={mapping.isEnabled}
                onChange={() => handleToggleField(mapping.sourceField)}
              />
              <label htmlFor={`field-${mapping.sourceField}`}>
                {field?.displayName || mapping.sourceField} (
                {field?.type || "Unknown"})
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
