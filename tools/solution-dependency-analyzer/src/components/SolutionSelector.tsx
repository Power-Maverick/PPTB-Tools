import { useState } from 'react';
import { SolutionRecord } from '../models/interfaces';

interface SolutionPickerProps {
  solutionOptions: SolutionRecord[];
  selectedValue: string;
  onSelectionChange: (solutionId: string) => void;
  onTriggerScan: () => void;
  scanningInProgress: boolean;
}

export function SolutionPicker({
  solutionOptions,
  selectedValue,
  onSelectionChange,
  onTriggerScan,
  scanningInProgress
}: SolutionPickerProps) {
  const [filterManaged, setFilterManaged] = useState<'all' | 'managed' | 'unmanaged'>('all');

  const filteredSolutions = solutionOptions.filter(sol => {
    if (filterManaged === 'managed') return sol.ismanaged;
    if (filterManaged === 'unmanaged') return !sol.ismanaged;
    return true;
  });

  return (
    <div className="solution-picker-section">
      <h2>Solution Selection</h2>
      
      <div className="filter-group">
        <label>Filter Type:</label>
        <div className="radio-buttons">
          <label>
            <input
              type="radio"
              value="all"
              checked={filterManaged === 'all'}
              onChange={(e) => setFilterManaged(e.target.value as 'all')}
            />
            All Solutions
          </label>
          <label>
            <input
              type="radio"
              value="unmanaged"
              checked={filterManaged === 'unmanaged'}
              onChange={(e) => setFilterManaged(e.target.value as 'unmanaged')}
            />
            Unmanaged Only
          </label>
          <label>
            <input
              type="radio"
              value="managed"
              checked={filterManaged === 'managed'}
              onChange={(e) => setFilterManaged(e.target.value as 'managed')}
            />
            Managed Only
          </label>
        </div>
      </div>

      <div className="selector-group">
        <label htmlFor="solution-dropdown">Choose Solution:</label>
        <select
          id="solution-dropdown"
          value={selectedValue}
          onChange={(e) => onSelectionChange(e.target.value)}
          disabled={scanningInProgress}
        >
          <option value="">-- Select a Solution --</option>
          {filteredSolutions.map(sol => (
            <option key={sol.solutionid} value={sol.solutionid}>
              {sol.friendlyname} (v{sol.version}) - {sol.ismanaged ? '🔒 Managed' : '📝 Unmanaged'}
            </option>
          ))}
        </select>
      </div>

      {selectedValue && (
        <div className="solution-info">
          {(() => {
            const selectedSol = solutionOptions.find(s => s.solutionid === selectedValue);
            if (!selectedSol) return null;
            return (
              <>
                <p><strong>Unique Name:</strong> {selectedSol.uniquename}</p>
                <p><strong>Publisher:</strong> {selectedSol.publisherid?.friendlyname || 'Unknown'}</p>
                {selectedSol.description && (
                  <p><strong>Description:</strong> {selectedSol.description}</p>
                )}
              </>
            );
          })()}
        </div>
      )}

      <button
        className="analyze-button"
        onClick={onTriggerScan}
        disabled={!selectedValue || scanningInProgress}
      >
        {scanningInProgress ? 'Scanning Dependencies...' : 'Analyze Dependencies'}
      </button>
    </div>
  );
}
