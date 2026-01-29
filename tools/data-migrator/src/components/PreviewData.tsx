import { PreviewRecord, DataverseField } from "../models/interfaces";

interface PreviewDataProps {
  previewRecords: PreviewRecord[];
  selectedFields: string[];
  fields: DataverseField[];
  onClose: () => void;
  onConfirm: () => void;
}

export function PreviewData({
  previewRecords,
  selectedFields,
  fields,
  onClose,
  onConfirm,
}: PreviewDataProps) {
  const getFieldDisplayName = (logicalName: string) => {
    const field = fields.find((f) => f.logicalName === logicalName);
    return field?.displayName || logicalName;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Preview Migration Data</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="preview-info">
          <p>
            <strong>{previewRecords.length} records</strong> will be migrated
            with the selected operation.
          </p>
        </div>

        <div className="preview-table-container">
          <table className="preview-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Primary ID</th>
                <th>Primary Name</th>
                {selectedFields.map((fieldName) => (
                  <th key={fieldName}>{getFieldDisplayName(fieldName)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRecords.slice(0, 100).map((record, index) => (
                <tr key={index}>
                  <td>
                    <span className={`action-badge action-${record.action.toLowerCase()}`}>
                      {record.action}
                    </span>
                  </td>
                  <td>{record.primaryId}</td>
                  <td>{record.primaryName}</td>
                  {selectedFields.map((fieldName) => (
                    <td key={fieldName}>
                      {record.data[fieldName]?.toString() || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {previewRecords.length > 100 && (
            <p className="preview-note">
              Showing first 100 of {previewRecords.length} records
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={onConfirm}>
            Start Migration
          </button>
        </div>
      </div>
    </div>
  );
}
