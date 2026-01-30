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
  const [newSourceId, setNewSourceId] = useState<string>("");
  const [newTargetId, setNewTargetId] = useState<string>("");

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

  const handleAddMapping = (fieldName: string) => {
    if (!newSourceId.trim() || !newTargetId.trim()) {
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
        updatedMapping.manualMappings.set(newSourceId.trim(), newTargetId.trim());
        return updatedMapping;
      }
      return mapping;
    });

    onLookupMappingsChange(updatedMappings);
    setNewSourceId("");
    setNewTargetId("");
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
                    value={newSourceId}
                    onChange={(e) => setNewSourceId(e.target.value)}
                  />
                  <input
                    type="text"
                    className="modern-input"
                    placeholder="Target ID (GUID)"
                    value={newTargetId}
                    onChange={(e) => setNewTargetId(e.target.value)}
                  />
                  <button
                    className="btn-add"
                    onClick={() => handleAddMapping(mapping.fieldName)}
                    disabled={!newSourceId.trim() || !newTargetId.trim()}
                  >
                    Add
                  </button>
                </div>
                
                <p style={{ fontSize: "11px", color: "#605e5c", marginTop: "8px" }}>
                  💡 Enter source record IDs and their corresponding target IDs. These mappings will be used during migration.
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
