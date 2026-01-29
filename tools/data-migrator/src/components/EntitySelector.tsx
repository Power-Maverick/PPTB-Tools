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
  return (
    <div className="form-group">
      <label htmlFor="entity-select">Select Entity</label>
      {loading ? (
        <div style={{ padding: "8px" }}>Loading entities...</div>
      ) : (
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
          {entities.map((entity) => (
            <option key={entity.logicalName} value={entity.logicalName}>
              {entity.displayName} ({entity.logicalName})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
