import { useState } from "react";
import { PreviewRecord, DataverseField } from "../models/interfaces";

interface PreviewDataProps {
  previewRecords: PreviewRecord[];
  selectedFields: string[];
  fields: DataverseField[];
  onClose: () => void;
  onConfirm: (selectedRecords: PreviewRecord[]) => void;
}

export function PreviewData({
  previewRecords,
  selectedFields,
  fields,
  onClose,
  onConfirm,
}: PreviewDataProps) {
  // Initialize local state for selections
  const [records, setRecords] = useState<PreviewRecord[]>(() => 
    previewRecords.map(record => ({ ...record, isSelected: record.isSelected ?? true }))
  );

  const getFieldDisplayName = (logicalName: string) => {
    const field = fields.find((f) => f.logicalName === logicalName);
    return field?.displayName || logicalName;
  };

  const selectedCount = records.filter(r => r.isSelected).length;
  const allSelected = selectedCount === records.length;
  const someSelected = selectedCount > 0 && selectedCount < records.length;

  const handleToggleAll = () => {
    const newSelectState = !allSelected;
    setRecords(records.map(record => ({ ...record, isSelected: newSelectState })));
  };

  const handleToggleRecord = (index: number) => {
    setRecords(records.map((record, i) => 
      i === index ? { ...record, isSelected: !record.isSelected } : record
    ));
  };

  const handleConfirm = () => {
    const selectedRecords = records.filter(r => r.isSelected);
    onConfirm(selectedRecords);
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
            <strong>{selectedCount} of {records.length} records</strong> selected for migration.
          </p>
          <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            Use checkboxes to select/deselect records before migrating.
          </p>
        </div>

        <div className="preview-table-container">
          <table className="preview-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={input => {
                      if (input) input.indeterminate = someSelected;
                    }}
                    onChange={handleToggleAll}
                    title={allSelected ? "Deselect all" : "Select all"}
                  />
                </th>
                <th>Action</th>
                <th>Primary ID</th>
                <th>Primary Name</th>
                {selectedFields.map((fieldName) => (
                  <th key={fieldName}>{getFieldDisplayName(fieldName)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 100).map((record, index) => (
                <tr key={index} className={record.isSelected ? '' : 'row-unselected'}>
                  <td>
                    <input
                      type="checkbox"
                      checked={record.isSelected}
                      onChange={() => handleToggleRecord(index)}
                    />
                  </td>
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
          {records.length > 100 && (
            <p className="preview-note">
              Showing first 100 of {records.length} records (all {records.length} will be available for selection)
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn-primary" 
            onClick={handleConfirm}
            disabled={selectedCount === 0}
          >
            Start Migration ({selectedCount} {selectedCount === 1 ? 'record' : 'records'})
          </button>
        </div>
      </div>
    </div>
  );
}
