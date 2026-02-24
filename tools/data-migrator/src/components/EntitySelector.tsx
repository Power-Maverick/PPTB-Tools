import { useEffect, useRef, useState } from "react";
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
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayValue = selectedEntity
    ? `${selectedEntity.displayName} (${selectedEntity.logicalName})`
    : "";

  const filteredEntities = entities.filter((entity) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      entity.displayName.toLowerCase().includes(searchLower) ||
      entity.logicalName.toLowerCase().includes(searchLower)
    );
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleSelect = (entity: DataverseEntity) => {
    onEntitySelect(entity);
    setSearchTerm("");
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="form-group">
      <label htmlFor="entity-combobox">Select Entity</label>
      {loading ? (
        <div style={{ padding: "8px" }}>Loading entities...</div>
      ) : (
        <div ref={containerRef} className="entity-combobox">
          <div className="entity-combobox-input-wrapper">
            <input
              id="entity-combobox"
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls="entity-combobox-listbox"
              aria-autocomplete="list"
              className="modern-input entity-combobox-input"
              value={isOpen ? searchTerm : displayValue}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              placeholder="Search or select a table..."
              autoComplete="off"
            />
            <span className="entity-combobox-arrow" onClick={() => setIsOpen((o) => !o)}>
              {isOpen ? "▲" : "▼"}
            </span>
          </div>
          {isOpen && (
            <ul id="entity-combobox-listbox" className="entity-combobox-dropdown" role="listbox">
              {filteredEntities.length > 0 ? (
                filteredEntities.map((entity) => (
                  <li
                    key={entity.logicalName}
                    role="option"
                    aria-selected={selectedEntity?.logicalName === entity.logicalName}
                    className={`entity-combobox-option${selectedEntity?.logicalName === entity.logicalName ? " selected" : ""}`}
                    onMouseDown={() => handleSelect(entity)}
                  >
                    <span className="entity-option-display">{entity.displayName}</span>
                    <span className="entity-option-logical">({entity.logicalName})</span>
                  </li>
                ))
              ) : (
                <li className="entity-combobox-empty">No tables match your search</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
