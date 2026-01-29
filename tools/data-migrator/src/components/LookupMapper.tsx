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
  const handleStrategyChange = (fieldName: string, strategy: "auto" | "manual" | "skip") => {
    const updatedMappings = lookupMappings.map((mapping) =>
      mapping.fieldName === fieldName ? { ...mapping, strategy } : mapping
    );
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
          <div key={mapping.fieldName} className="lookup-item">
            <label>
              {mapping.fieldDisplayName} → {mapping.targetEntity}
            </label>
            <select
              value={mapping.strategy}
              onChange={(e) =>
                handleStrategyChange(
                  mapping.fieldName,
                  e.target.value as "auto" | "manual" | "skip"
                )
              }
            >
              <option value="auto">Auto-Map</option>
              <option value="skip">Skip</option>
            </select>
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
