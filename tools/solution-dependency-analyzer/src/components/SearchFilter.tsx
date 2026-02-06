import { AssetKind } from '../models/interfaces';

interface SearchFilterProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  kindFilterValue: AssetKind | 'all';
  onKindFilterChange: (kind: AssetKind | 'all') => void;
}

export function SearchFilter({
  searchValue,
  onSearchChange,
  kindFilterValue,
  onKindFilterChange
}: SearchFilterProps) {
  return (
    <div className="search-filter-section">
      <h3>Filters</h3>

      <div className="search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search components..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="kind-filter-wrapper">
        <label htmlFor="kind-filter">Component Type:</label>
        <select
          id="kind-filter"
          value={kindFilterValue}
          onChange={(e) => onKindFilterChange(e.target.value as AssetKind | 'all')}
        >
          <option value="all">All Types</option>
          <option value="entity">📦 Entity</option>
          <option value="attribute">🔤 Attribute</option>
          <option value="relationship">🔗 Relationship</option>
          <option value="form">📝 Form</option>
          <option value="view">👁️ View</option>
          <option value="workflow">⚙️ Workflow</option>
          <option value="plugin">🔌 Plugin</option>
          <option value="webresource">📄 Web Resource</option>
          <option value="app">📱 Model-driven App</option>
          <option value="canvasapp">🎨 Canvas App</option>
          <option value="report">📊 Report</option>
          <option value="emailtemplate">✉️ Email Template</option>
          <option value="optionset">🎛️ Option Set</option>
          <option value="connector">🔌 Connector</option>
          <option value="sitemap">🗺️ Site Map</option>
          <option value="role">🔐 Security Role</option>
          <option value="other">❓ Other</option>
        </select>
      </div>
    </div>
  );
}

// Keep the old FilterBar export for backwards compatibility
export const FilterBar = SearchFilter;
