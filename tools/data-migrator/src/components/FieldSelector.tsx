import { useState } from "react";
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
  const [searchTerm, setSearchTerm] = useState<string>("");

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

  // Filter fields based on search term
  const filteredMappings = fieldMappings.filter((mapping) => {
    if (!searchTerm) return true;
    const field = fields.find((f) => f.logicalName === mapping.sourceField);
    if (!field) return false;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      field.logicalName.toLowerCase().includes(searchLower) ||
      field.displayName.toLowerCase().includes(searchLower)
    );
  });

  const selectedCount = fieldMappings.filter((m) => m.isEnabled).length;

  return (
    <div className="config-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
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

      {/* Search box */}
      <div className="form-group" style={{ marginBottom: "12px" }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search fields by name..."
          className="modern-input"
          style={{ marginBottom: "0" }}
        />
      </div>

      <div className="field-list">
        {filteredMappings.map((mapping) => {
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
                <strong>{field?.displayName || mapping.sourceField}</strong>
                <span style={{ color: "#605e5c", fontSize: "12px", marginLeft: "8px" }}>
                  ({field?.logicalName})
                </span>
              </label>
            </div>
          );
        })}
        {filteredMappings.length === 0 && (
          <p style={{ textAlign: "center", padding: "20px", color: "#605e5c" }}>
            No fields match your search
          </p>
        )}
      </div>
    </div>
  );
}
