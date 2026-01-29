import { MigrationOperation } from "../models/interfaces";

interface OperationSelectorProps {
  operation: MigrationOperation;
  onOperationChange: (operation: MigrationOperation) => void;
}

export function OperationSelector({
  operation,
  onOperationChange,
}: OperationSelectorProps) {
  return (
    <div className="form-group">
      <label htmlFor="operation-select">Migration Operation</label>
      <select
        id="operation-select"
        value={operation}
        onChange={(e) =>
          onOperationChange(e.target.value as MigrationOperation)
        }
      >
        <option value="create">Create - Insert new records only</option>
        <option value="update">
          Update - Update existing records by primary key
        </option>
        <option value="delete">
          Delete - Delete records from target environment
        </option>
      </select>
      <p style={{ fontSize: "12px", color: "#605e5c", margin: "8px 0 0 0" }}>
        {operation === "create" &&
          "Creates new records in the target environment. Will fail if record already exists."}
        {operation === "update" &&
          "Updates existing records by matching primary key. Requires records to exist in target."}
        {operation === "delete" &&
          "Deletes records from the target environment by matching primary key."}
      </p>
    </div>
  );
}
