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
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 100;

  const getFieldDisplayName = (logicalName: string) => {
    const field = fields.find((f) => f.logicalName === logicalName);
    return field?.displayName || logicalName;
  };

  const selectedCount = records.filter(r => r.isSelected).length;
  const totalPages = Math.ceil(records.length / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = startIndex + recordsPerPage;
  const displayedRecords = records.slice(startIndex, endIndex);
  const displayedSelectedCount = displayedRecords.filter(r => r.isSelected).length;
  const allDisplayedSelected = displayedSelectedCount === displayedRecords.length && displayedRecords.length > 0;
  const someDisplayedSelected = displayedSelectedCount > 0 && displayedSelectedCount < displayedRecords.length;

  const handleToggleAll = () => {
    // Toggle all displayed records on current page only
    const newSelectState = !allDisplayedSelected;
    setRecords(records.map((record, i) => 
      i >= startIndex && i < endIndex ? { ...record, isSelected: newSelectState } : record
    ));
  };

  const handleToggleRecord = (displayIndex: number) => {
    const actualIndex = startIndex + displayIndex;
    setRecords(records.map((record, i) => 
      i === actualIndex ? { ...record, isSelected: !record.isSelected } : record
    ));
  };
  
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
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
          <p className="preview-helper-text">
            {records.length > recordsPerPage
              ? `Use checkboxes to select/deselect records across all pages. You are viewing page ${currentPage} of ${totalPages}.`
              : "Use checkboxes to select/deselect records before migrating."}
          </p>
          {records.length > recordsPerPage && (
            <p className="preview-warning-text">
              ⚠️ You have {records.length} records. Use pagination below to review and select records from all pages.
            </p>
          )}
        </div>

        <div className="preview-table-container">
          <table className="preview-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={allDisplayedSelected}
                    ref={input => {
                      if (input) input.indeterminate = someDisplayedSelected;
                    }}
                    onChange={handleToggleAll}
                    title={allDisplayedSelected ? "Deselect all displayed" : "Select all displayed"}
                    aria-label={allDisplayedSelected ? "Deselect all displayed records" : "Select all displayed records"}
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
              {displayedRecords.map((record, index) => (
                <tr key={startIndex + index} className={record.isSelected ? '' : 'row-unselected'}>
                  <td>
                    <input
                      type="checkbox"
                      checked={record.isSelected}
                      onChange={() => handleToggleRecord(index)}
                      aria-label={`Select record ${record.primaryName || record.primaryId}`}
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
          {totalPages > 1 && (
            <div className="preview-pagination">
              <button 
                className="pagination-btn" 
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                aria-label="First page"
              >
                «
              </button>
              <button 
                className="pagination-btn" 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="pagination-info">
                Page {currentPage} of {totalPages} ({displayedRecords.length} records on this page)
              </span>
              <button 
                className="pagination-btn" 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                ›
              </button>
              <button 
                className="pagination-btn" 
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                aria-label="Last page"
              >
                »
              </button>
            </div>
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
            {selectedCount === 0 
              ? "Start Migration (No records selected)" 
              : `Start Migration (${selectedCount} ${selectedCount === 1 ? 'record' : 'records'})`}
          </button>
        </div>
      </div>
    </div>
  );
}
