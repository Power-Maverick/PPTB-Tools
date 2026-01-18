import { AutoMappingResult } from "../models/interfaces";

interface AutoMappingPanelProps {
  userMappings: AutoMappingResult[];
  teamMappings: AutoMappingResult[];
  businessUnitMappings: AutoMappingResult[];
  onClose: () => void;
}

export function AutoMappingPanel({
  userMappings,
  teamMappings,
  businessUnitMappings,
  onClose,
}: AutoMappingPanelProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Auto-Mapping Results</h3>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="mapping-grid">
          <div className="mapping-section">
            <h4>Users ({userMappings.length} mapped)</h4>
            <div className="mapping-list">
              {userMappings.length === 0 ? (
                <div className="mapping-item">No users mapped</div>
              ) : (
                userMappings.map((mapping, index) => (
                  <div key={index} className="mapping-item">
                    <div style={{ fontWeight: 500 }}>{mapping.displayName}</div>
                    <div
                      style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                    >
                      {mapping.matchCriteria} •{" "}
                      <span className={`confidence-${mapping.confidence}`}>
                        {mapping.confidence}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mapping-section">
            <h4>Teams ({teamMappings.length} mapped)</h4>
            <div className="mapping-list">
              {teamMappings.length === 0 ? (
                <div className="mapping-item">No teams mapped</div>
              ) : (
                teamMappings.map((mapping, index) => (
                  <div key={index} className="mapping-item">
                    <div style={{ fontWeight: 500 }}>{mapping.displayName}</div>
                    <div
                      style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                    >
                      {mapping.matchCriteria} •{" "}
                      <span className={`confidence-${mapping.confidence}`}>
                        {mapping.confidence}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mapping-section">
            <h4>Business Units ({businessUnitMappings.length} mapped)</h4>
            <div className="mapping-list">
              {businessUnitMappings.length === 0 ? (
                <div className="mapping-item">No business units mapped</div>
              ) : (
                businessUnitMappings.map((mapping, index) => (
                  <div key={index} className="mapping-item">
                    <div style={{ fontWeight: 500 }}>{mapping.displayName}</div>
                    <div
                      style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                    >
                      {mapping.matchCriteria} •{" "}
                      <span className={`confidence-${mapping.confidence}`}>
                        {mapping.confidence}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
