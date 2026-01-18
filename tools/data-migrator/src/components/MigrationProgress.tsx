import { MigrationProgress as MigrationProgressType } from "../models/interfaces";

interface MigrationProgressProps {
  progress: MigrationProgressType;
}

export function MigrationProgress({ progress }: MigrationProgressProps) {
  const progressPercentage =
    progress.total > 0 ? (progress.processed / progress.total) * 100 : 0;

  return (
    <div className="progress-panel">
      <div className="progress-header">
        <h3>Migration Progress</h3>
        <span>
          {progress.processed} / {progress.total}
        </span>
      </div>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>

      <div className="progress-stats">
        <div className="stat-card">
          <div className="stat-value">{progress.total}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--success-color)" }}>
            {progress.successful}
          </div>
          <div className="stat-label">Success</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--error-color)" }}>
            {progress.failed}
          </div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--text-secondary)" }}>
            {progress.skipped}
          </div>
          <div className="stat-label">Skipped</div>
        </div>
      </div>

      {progress.currentBatch && progress.totalBatches && (
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>
          Processing batch {progress.currentBatch} of {progress.totalBatches}
        </p>
      )}

      <h4 style={{ marginBottom: "12px" }}>Records</h4>
      <div className="record-list">
        {progress.records.map((record, index) => (
          <div key={index} className="record-item">
            <div>
              <div style={{ fontWeight: 500 }}>{record.displayName}</div>
              {record.errorMessage && (
                <div style={{ fontSize: "12px", color: "var(--error-color)", marginTop: "4px" }}>
                  {record.errorMessage}
                </div>
              )}
            </div>
            <div className="record-status">
              <span
                className={`status-badge status-${record.status}`}
              >
                {record.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
