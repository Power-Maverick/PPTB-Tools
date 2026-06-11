import { useState } from "react";
import { DataverseField, FieldMapping } from "../models/interfaces";

type SortBy = "name" | "type";
type SortOrder = "asc" | "desc";

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
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

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

  const handleSortByChange = (newSortBy: SortBy) => {
    if (newSortBy === sortBy) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(newSortBy);
      setSortOrder("asc");
    }
  };

  const fieldMap = new Map(fields.map((f) => [f.logicalName, f]));

  // Filter fields based on search term
  const filteredMappings = fieldMappings
    .filter((mapping) => {
      if (!searchTerm) return true;
      const field = fieldMap.get(mapping.sourceField);
      if (!field) return false;

      const searchLower = searchTerm.toLowerCase();
      return (
        field.logicalName.toLowerCase().includes(searchLower) ||
        field.displayName.toLowerCase().includes(searchLower) ||
        mapping.fieldType.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      let aVal: string;
      let bVal: string;

      if (sortBy === "type") {
        aVal = a.fieldType;
        bVal = b.fieldType;
      } else {
        aVal = fieldMap.get(a.sourceField)?.displayName ?? a.sourceField;
        bVal = fieldMap.get(b.sourceField)?.displayName ?? b.sourceField;
      }

      const cmp = aVal.localeCompare(bVal);
      return sortOrder === "asc" ? cmp : -cmp;
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

      {/* Search and sort controls */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search fields by name or type..."
          className="modern-input"
          style={{ marginBottom: "0", flex: 1 }}
        />
        <button
          className={`btn-secondary${sortBy === "name" ? " active" : ""}`}
          onClick={() => handleSortByChange("name")}
          title={sortBy === "name" ? `Sort by Name (${sortOrder === "asc" ? "A→Z" : "Z→A"})` : "Sort by Name"}
        >
          Name {sortBy === "name" ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
        </button>
        <button
          className={`btn-secondary${sortBy === "type" ? " active" : ""}`}
          onClick={() => handleSortByChange("type")}
          title={sortBy === "type" ? `Sort by Type (${sortOrder === "asc" ? "A→Z" : "Z→A"})` : "Sort by Type"}
        >
          Type {sortBy === "type" ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
        </button>
      </div>

      <div className="field-list">
        {filteredMappings.map((mapping) => {
          const field = fieldMap.get(mapping.sourceField);
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
                <span style={{ color: "#8a8886", fontSize: "11px", marginLeft: "6px", fontStyle: "italic" }}>
                  {mapping.fieldType}
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
