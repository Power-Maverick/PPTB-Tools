import { MigrationOperation } from "../models/interfaces";

interface OperationSelectorProps {
  operations: MigrationOperation[];
  onOperationsChange: (operations: MigrationOperation[]) => void;
}

export function OperationSelector({
  operations,
  onOperationsChange,
}: OperationSelectorProps) {
  const allOperations: MigrationOperation[] = ["create", "update", "delete"];

  const handleOperationToggle = (op: MigrationOperation) => {
    if (operations.includes(op)) {
      // Remove if already selected (but keep at least one)
      if (operations.length > 1) {
        onOperationsChange(operations.filter((o) => o !== op));
      }
    } else {
      // Add if not selected
      onOperationsChange([...operations, op]);
    }
  };

  const getOperationDescription = (op: MigrationOperation) => {
    switch (op) {
      case "create":
        return "Insert new records only";
      case "update":
        return "Update existing records by primary key";
      case "delete":
        return "Delete records from target environment";
    }
  };

  return (
    <div className="form-group">
      <label>Migration Operations (Select one or more)</label>
      <div className="operation-checkboxes">
        {allOperations.map((op) => (
          <div key={op} className="checkbox-group">
            <input
              type="checkbox"
              id={`op-${op}`}
              checked={operations.includes(op)}
              onChange={() => handleOperationToggle(op)}
            />
            <label htmlFor={`op-${op}`}>
              <strong>{op.charAt(0).toUpperCase() + op.slice(1)}</strong> - {getOperationDescription(op)}
            </label>
          </div>
        ))}
      </div>
      <p style={{ fontSize: "12px", color: "#605e5c", margin: "8px 0 0 0" }}>
        {operations.length === 1 && operations[0] === "create" &&
          "Creates new records in the target environment. Will fail if record already exists."}
        {operations.length === 1 && operations[0] === "update" &&
          "Updates existing records by matching primary key. Requires records to exist in target."}
        {operations.length === 1 && operations[0] === "delete" &&
          "Deletes records from the target environment by matching primary key."}
        {operations.length > 1 &&
          `Selected ${operations.length} operations: ${operations.join(", ")}. Records will be processed with all selected operations.`}
      </p>
    </div>
  );
}
