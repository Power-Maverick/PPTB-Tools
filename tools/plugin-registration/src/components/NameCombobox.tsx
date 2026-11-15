import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** Most suggestions shown at once; typing narrows the rest. */
export const MAX_SUGGESTIONS = 100;

/**
 * Names containing the query, ignoring case: names that start with it first, each group in its original
 * order. An empty query matches everything. At most `limit` are returned, with the total match count.
 */
export function filterNames(options: readonly string[], query: string, limit = MAX_SUGGESTIONS): { matches: string[]; total: number } {
    const q = query.trim().toLowerCase();
    if (!q) return { matches: options.slice(0, limit), total: options.length };
    const starts: string[] = [];
    const contains: string[] = [];
    for (const option of options) {
        const index = option.toLowerCase().indexOf(q);
        if (index === 0) starts.push(option);
        else if (index > 0) contains.push(option);
    }
    const all = starts.concat(contains);
    return { matches: all.slice(0, limit), total: all.length };
}

interface NameComboboxProps {
    value: string;
    onChange: (value: string) => void;
    /** Suggestions, or null while they load or when they couldn't be loaded: then this is a plain text box. */
    options: readonly string[] | null;
    disabled?: boolean;
    placeholder?: string;
    maxLength?: number;
    "aria-label"?: string;
}

interface ListPosition {
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
}

/**
 * A text box with a searchable, scrolling list of suggestions. Unlike a datalist it stays usable with
 * thousands of names: it shows the first matches and says how many more there are. The list is fixed to
 * the window, so dialogs that scroll or clip their content don't cut it off.
 */
export function NameCombobox({ value, onChange, options, disabled, placeholder, maxLength, "aria-label": ariaLabel }: NameComboboxProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [position, setPosition] = useState<ListPosition | null>(null);
    const listId = useId();

    const { matches, total } = open && options ? filterNames(options, value) : { matches: [], total: 0 };
    const showList = open && !disabled && matches.length > 0;

    // Place the list under the box, or above it when there's more room there.
    useLayoutEffect(() => {
        if (!showList) return;
        const place = () => {
            const rect = inputRef.current?.getBoundingClientRect();
            if (!rect) return;
            const below = window.innerHeight - rect.bottom - 8;
            const above = rect.top - 8;
            const width = Math.max(rect.width, 260);
            const left = Math.min(rect.left, Math.max(0, window.innerWidth - width - 8));
            setPosition(below >= 160 || below >= above
                ? { left, width, top: rect.bottom + 2, maxHeight: Math.min(280, below) }
                : { left, width, bottom: window.innerHeight - rect.top + 2, maxHeight: Math.min(280, above) });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [showList]);

    // Keep the highlighted suggestion in view while moving with the arrow keys.
    useEffect(() => {
        if (!showList) return;
        const item = listRef.current?.children[active] as HTMLElement | undefined;
        item?.scrollIntoView({ block: "nearest" });
    }, [active, showList]);

    const choose = (name: string) => {
        onChange(name);
        setOpen(false);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) {
                setOpen(true);
                setActive(0);
                return;
            }
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (matches.length === 0 ? 0 : (i + step + matches.length) % matches.length));
        } else if (e.key === "Enter" && showList) {
            e.preventDefault();
            choose(matches[Math.min(active, matches.length - 1)]);
        } else if (e.key === "Escape" && showList) {
            // Close the list without closing the dialog around it.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
        }
    };

    return (
        <>
            <input
                ref={inputRef}
                className="form-input"
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                maxLength={maxLength}
                aria-label={ariaLabel}
                role="combobox"
                aria-expanded={showList}
                aria-controls={listId}
                aria-autocomplete="list"
                autoComplete="off"
                onFocus={() => {
                    setOpen(true);
                    setActive(0);
                }}
                onBlur={() => setOpen(false)}
                onChange={(e) => {
                    onChange(e.target.value.trim());
                    setOpen(true);
                    setActive(0);
                }}
                onKeyDown={onKeyDown}
            />
            {showList && position && (
                <ul
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    className="name-combobox-list"
                    style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
                    // Keep focus in the box, so choosing doesn't blur it first and close the list.
                    onMouseDown={(e) => e.preventDefault()}
                >
                    {matches.map((name, i) => (
                        <li
                            key={name}
                            role="option"
                            aria-selected={i === active}
                            className={`name-combobox-item${i === active ? " name-combobox-item--active" : ""}`}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => choose(name)}
                        >
                            {name}
                        </li>
                    ))}
                    {total > matches.length && (
                        <li className="name-combobox-more" aria-hidden="true">
                            Showing {matches.length} of {total.toLocaleString()}. Type to narrow the list.
                        </li>
                    )}
                </ul>
            )}
        </>
    );
}
