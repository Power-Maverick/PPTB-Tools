import { useState } from "react";
import { FilterOption } from "../models/interfaces";

interface SearchableFilterOptionsProps {
    id: string;
    label: string;
    options: FilterOption[];
    selected: string[];
    onToggle: (value: string) => void;
}

export function SearchableFilterOptions({ id, label, options, selected, onToggle }: SearchableFilterOptionsProps) {
    const [search, setSearch] = useState("");
    const availableOptions = [...options, ...selected.filter((value) => !options.some((option) => option.value === value)).map((value) => ({ value, label: value, count: 0 }))];
    const matchingOptions = availableOptions.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <div className="filter-section">
            <label htmlFor={id}>
                {label}
                <span className="filter-selection-count">{selected.length} selected</span>
            </label>
            <input
                id={id}
                type="search"
                className="filter-input filter-option-search"
                placeholder={`Search ${label.toLowerCase()}...`}
                aria-label={`Search ${label.toLowerCase()}`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
            />
            <div className="checkbox-list" role="group" aria-label={label}>
                {matchingOptions.length === 0 && <div className="empty-message">{availableOptions.length === 0 ? "No options available" : "No matches"}</div>}
                {matchingOptions.map((option) => (
                    <label key={option.value} className="checkbox-item">
                        <input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} />
                        <span className="checkbox-label-text">
                            <span className="filter-option-name">{option.label}</span>
                            {(option.count ?? 0) > 0 && <span className="item-count">({option.count})</span>}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
}
