import { useEffect, useRef, useState } from "react";

export interface SearchableSelectOption {
    value: string;
    label: string;
}

interface SearchableSelectProps {
    id?: string;
    options: SearchableSelectOption[];
    selectedValue: string;
    placeholder?: string;
    disabled?: boolean;
    onSelectionChange: (value: string) => void;
}

export function SearchableSelect({ id, options, selectedValue, placeholder = "-- Select --", disabled = false, onSelectionChange }: SearchableSelectProps) {
    const [inputValue, setInputValue] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selectedLabel = options.find((o) => o.value === selectedValue)?.label ?? "";

    const filteredOptions = options.filter((o) => {
        const term = inputValue.toLowerCase().trim();
        return !term || o.label.toLowerCase().includes(term);
    });

    // Sync display label when selection changes externally (e.g. reset)
    useEffect(() => {
        if (!isOpen) {
            setInputValue("");
        }
    }, [selectedValue, isOpen]);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setInputValue("");
                setHighlightedIndex(-1);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Scroll highlighted item into view
    useEffect(() => {
        if (highlightedIndex >= 0 && listRef.current) {
            const item = listRef.current.children[highlightedIndex] as HTMLElement;
            item?.scrollIntoView({ block: "nearest" });
        }
    }, [highlightedIndex]);

    function openDropdown() {
        if (disabled) return;
        setIsOpen(true);
        setInputValue("");
        setHighlightedIndex(-1);
        setTimeout(() => inputRef.current?.focus(), 0);
    }

    function selectOption(option: SearchableSelectOption) {
        onSelectionChange(option.value);
        setIsOpen(false);
        setInputValue("");
        setHighlightedIndex(-1);
    }

    function clearSelection() {
        onSelectionChange("");
        setIsOpen(false);
        setInputValue("");
        setHighlightedIndex(-1);
    }

    // Reset highlighted index when filtered list length changes to avoid out-of-bounds highlights
    useEffect(() => {
        setHighlightedIndex(-1);
    }, [filteredOptions.length]);

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
                selectOption(filteredOptions[highlightedIndex]);
            }
        } else if (e.key === "Escape") {
            setIsOpen(false);
            setInputValue("");
            setHighlightedIndex(-1);
        }
    }

    return (
        <div ref={containerRef} className={`searchable-select${disabled ? " searchable-select--disabled" : ""}`}>
            <div className="searchable-select__control" onClick={openDropdown} role="combobox" aria-expanded={isOpen} aria-haspopup="listbox" aria-owns={id ? `${id}-listbox` : undefined}>
                {isOpen ? (
                    <input
                        ref={inputRef}
                        id={id}
                        className="searchable-select__input"
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setHighlightedIndex(0);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Type to search..."
                        autoComplete="off"
                        aria-autocomplete="list"
                        aria-controls={id ? `${id}-listbox` : undefined}
                    />
                ) : (
                    <span className={`searchable-select__value${!selectedValue ? " searchable-select__placeholder" : ""}`}>{selectedValue ? selectedLabel : placeholder}</span>
                )}
                <span className="searchable-select__indicators">
                    {selectedValue && !disabled && (
                        <button
                            className="searchable-select__clear"
                            onClick={(e) => {
                                e.stopPropagation();
                                clearSelection();
                            }}
                            aria-label="Clear selection"
                            tabIndex={-1}
                        >
                            ✕
                        </button>
                    )}
                    <span className="searchable-select__arrow" aria-hidden="true">
                        {isOpen ? "▲" : "▼"}
                    </span>
                </span>
            </div>

            {isOpen && (
                <ul id={id ? `${id}-listbox` : undefined} ref={listRef} className="searchable-select__listbox" role="listbox">
                    {filteredOptions.length === 0 ? (
                        <li className="searchable-select__no-options" role="status" aria-live="polite">No solutions match</li>
                    ) : (
                        filteredOptions.map((option, index) => (
                            <li
                                key={option.value}
                                className={`searchable-select__option${option.value === selectedValue ? " searchable-select__option--selected" : ""}${index === highlightedIndex ? " searchable-select__option--highlighted" : ""}`}
                                role="option"
                                aria-selected={option.value === selectedValue}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selectOption(option)}
                                onMouseEnter={() => setHighlightedIndex(index)}
                            >
                                {option.label}
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
}
