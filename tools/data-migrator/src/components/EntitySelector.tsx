import { useState } from "react";
import { DataverseEntity } from "../models/interfaces";

interface EntitySelectorProps {
  entities: DataverseEntity[];
  selectedEntity: DataverseEntity | null;
  onEntitySelect: (entity: DataverseEntity) => void;
  loading: boolean;
}

export function EntitySelector({
  entities,
  selectedEntity,
  onEntitySelect,
  loading,
}: EntitySelectorProps) {
  const [searchTerm, setSearchTerm] = useState<string>("");

  const filteredEntities = entities.filter((entity) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      entity.displayName.toLowerCase().includes(searchLower) ||
      entity.logicalName.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="form-group">
      <label htmlFor="entity-select">Select Entity</label>
      {loading ? (
        <div style={{ padding: "8px" }}>Loading entities...</div>
      ) : (
        <>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tables by name..."
            className="modern-input"
            style={{ marginBottom: "8px" }}
          />
          <select
            id="entity-select"
            className="modern-input"
            value={selectedEntity?.logicalName || ""}
            onChange={(e) => {
              const entity = entities.find(
                (ent) => ent.logicalName === e.target.value
              );
              if (entity) {
                onEntitySelect(entity);
              }
            }}
          >
            <option value="">-- Select an entity --</option>
            {filteredEntities.map((entity) => (
              <option key={entity.logicalName} value={entity.logicalName}>
                {entity.displayName} ({entity.logicalName})
              </option>
            ))}
          </select>
          {searchTerm && filteredEntities.length === 0 && (
            <p style={{ textAlign: "center", padding: "8px", color: "#605e5c", fontSize: "13px" }}>
              No tables match your search
            </p>
          )}
        </>
      )}
    </div>
  );
}
