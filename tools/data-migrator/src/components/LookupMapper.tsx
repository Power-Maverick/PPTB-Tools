import { useState } from "react";
import { LookupMapping } from "../models/interfaces";

interface LookupMapperProps {
  lookupMappings: LookupMapping[];
  onLookupMappingsChange: (mappings: LookupMapping[]) => void;
  onAutoMapping: () => void;
}

export function LookupMapper({
  lookupMappings,
  onLookupMappingsChange,
  onAutoMapping,
}: LookupMapperProps) {
  const [expandedMapping, setExpandedMapping] = useState<string | null>(null);
  // Use a Map to store input values per field to avoid shared state issues
  const [inputValues, setInputValues] = useState<Map<string, { source: string; target: string }>>(new Map());

  const handleStrategyChange = (fieldName: string, strategy: "auto" | "manual" | "skip") => {
    const updatedMappings = lookupMappings.map((mapping) => {
      if (mapping.fieldName === fieldName) {
        const updatedMapping = { ...mapping, strategy };
        // Initialize manual mappings if switching to manual and none exist
        if (strategy === "manual" && !updatedMapping.manualMappings) {
          updatedMapping.manualMappings = new Map();
        }
        return updatedMapping;
      }
      return mapping;
    });
    onLookupMappingsChange(updatedMappings);
  };

  const validateGuid = (value: string): boolean => {
    const guidPattern = /^[{]?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[}]?$/;
    return guidPattern.test(value.trim());
  };

  const handleAddMapping = (fieldName: string) => {
    const inputs = inputValues.get(fieldName);
    const sourceId = inputs?.source?.trim() || "";
    const targetId = inputs?.target?.trim() || "";

    if (!sourceId || !targetId) {
      return;
    }

    // Validate GUID format
    if (!validateGuid(sourceId) || !validateGuid(targetId)) {
      alert("Please enter valid GUIDs in the format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
      return;
    }

    const updatedMappings = lookupMappings.map((mapping) => {
      if (mapping.fieldName === fieldName) {
        const updatedMapping = { ...mapping };
        if (!updatedMapping.manualMappings) {
          updatedMapping.manualMappings = new Map();
        } else {
          // Create a new Map to ensure React detects the change
          updatedMapping.manualMappings = new Map(updatedMapping.manualMappings);
        }
        
        // Check for duplicate source ID
        if (updatedMapping.manualMappings.has(sourceId)) {
          if (!confirm(`Source ID ${sourceId} already exists with a different target. Do you want to overwrite it?`)) {
            return mapping;
          }
        }
        
        updatedMapping.manualMappings.set(sourceId, targetId);
        return updatedMapping;
      }
      return mapping;
    });

    onLookupMappingsChange(updatedMappings);
    
    // Clear input values for this field
    setInputValues(prev => {
      const newMap = new Map(prev);
      newMap.set(fieldName, { source: "", target: "" });
      return newMap;
    });
  };

  const handleDeleteMapping = (fieldName: string, sourceId: string) => {
    const updatedMappings = lookupMappings.map((mapping) => {
      if (mapping.fieldName === fieldName && mapping.manualMappings) {
        const updatedMapping = { ...mapping };
        updatedMapping.manualMappings = new Map(updatedMapping.manualMappings);
        updatedMapping.manualMappings.delete(sourceId);
        return updatedMapping;
      }
      return mapping;
    });
    onLookupMappingsChange(updatedMappings);
  };

  const systemEntities = ["systemuser", "team", "businessunit"];
  const hasSystemLookups = lookupMappings.some((m) =>
    systemEntities.includes(m.targetEntity)
  );

  return (
    <div className="config-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Lookup Field Mappings</h3>
        {hasSystemLookups && (
          <button className="btn-secondary" onClick={onAutoMapping}>
            Auto-Map System Entities
          </button>
        )}
      </div>
      <p style={{ fontSize: "12px", color: "#605e5c", margin: "8px 0 12px 0" }}>
        Configure how lookup fields should be mapped from source to target environment.
      </p>
      <div className="lookup-list">
        {lookupMappings.map((mapping) => (
          <div key={mapping.fieldName} className="lookup-item-container">
            <div className="lookup-item">
              <label>
                {mapping.fieldDisplayName} → {mapping.targetEntity}
              </label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select
                  className="modern-input"
                  value={mapping.strategy}
                  onChange={(e) =>
                    handleStrategyChange(
                      mapping.fieldName,
                      e.target.value as "auto" | "manual" | "skip"
                    )
                  }
                  aria-label={`Mapping strategy for ${mapping.fieldDisplayName}`}
                >
                  <option value="auto">Auto-Map</option>
                  <option value="manual">Manual Map</option>
                  <option value="skip">Skip</option>
                </select>
                {mapping.strategy === "manual" && (
                  <button
                    className="btn-toggle"
                    onClick={() =>
                      setExpandedMapping(
                        expandedMapping === mapping.fieldName ? null : mapping.fieldName
                      )
                    }
                    aria-label={
                      expandedMapping === mapping.fieldName
                        ? "Collapse manual mapping panel"
                        : "Expand manual mapping panel"
                    }
                  >
                    {expandedMapping === mapping.fieldName ? "−" : "+"}
                  </button>
                )}
              </div>
            </div>
            
            {mapping.strategy === "manual" && expandedMapping === mapping.fieldName && (
              <div className="manual-mapping-panel">
                <div className="manual-mapping-header">
                  <span>Source ID</span>
                  <span>Target ID</span>
                  <span>Action</span>
                </div>
                
                {mapping.manualMappings && Array.from(mapping.manualMappings.entries()).map(
                  ([sourceId, targetId]) => (
                    <div key={sourceId} className="manual-mapping-row">
                      <span title={sourceId}>{sourceId}</span>
                      <span title={targetId}>{targetId}</span>
                      <button
                        className="btn-delete"
                        onClick={() => handleDeleteMapping(mapping.fieldName, sourceId)}
                        title="Delete mapping"
                        aria-label={`Delete mapping for ${sourceId}`}
                      >
                        ✕
                      </button>
                    </div>
                  )
                )}
                
                <div className="manual-mapping-add">
                  <input
                    type="text"
                    className="modern-input"
                    placeholder="Source ID (GUID)"
                    value={inputValues.get(mapping.fieldName)?.source || ""}
                    onChange={(e) => {
                      setInputValues(prev => {
                        const newMap = new Map(prev);
                        const current = newMap.get(mapping.fieldName) || { source: "", target: "" };
                        newMap.set(mapping.fieldName, { ...current, source: e.target.value });
                        return newMap;
                      });
                    }}
                    aria-label="Source ID"
                  />
                  <input
                    type="text"
                    className="modern-input"
                    placeholder="Target ID (GUID)"
                    value={inputValues.get(mapping.fieldName)?.target || ""}
                    onChange={(e) => {
                      setInputValues(prev => {
                        const newMap = new Map(prev);
                        const current = newMap.get(mapping.fieldName) || { source: "", target: "" };
                        newMap.set(mapping.fieldName, { ...current, target: e.target.value });
                        return newMap;
                      });
                    }}
                    aria-label="Target ID"
                  />
                  <button
                    className="btn-add"
                    onClick={() => handleAddMapping(mapping.fieldName)}
                    disabled={
                      !(inputValues.get(mapping.fieldName)?.source?.trim()) ||
                      !(inputValues.get(mapping.fieldName)?.target?.trim())
                    }
                    aria-label="Add mapping"
                  >
                    Add
                  </button>
                </div>
                
                <p className="manual-mapping-hint">
                  💡 Enter source record IDs and their corresponding target IDs. GUIDs should be in format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      {hasSystemLookups && (
        <p style={{ fontSize: "12px", color: "#605e5c", marginTop: "8px" }}>
          💡 Auto-mapping is available for users, teams, and business units. Click "Auto-Map System Entities" to match them automatically.
        </p>
      )}
    </div>
  );
}
