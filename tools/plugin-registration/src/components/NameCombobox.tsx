import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/** Most suggestions shown at once; typing narrows the rest. */
export const MAX_SUGGESTIONS = 100;

/**
 * Items whose text contains the query, ignoring case: items whose text starts with it first, each group
 * in its original order. An empty query matches everything. At most `limit` are returned, with the total
 * match count.
 */
export function filterItems<T>(items: readonly T[], query: string, text: (item: T) => string, limit = MAX_SUGGESTIONS): { matches: T[]; total: number } {
    const q = query.trim().toLowerCase();
    if (!q) return { matches: items.slice(0, limit), total: items.length };
    const starts: T[] = [];
    const contains: T[] = [];
    for (const item of items) {
        const index = text(item).toLowerCase().indexOf(q);
        if (index === 0) starts.push(item);
        else if (index > 0) contains.push(item);
    }
    const all = starts.concat(contains);
    return { matches: all.slice(0, limit), total: all.length };
}

/** filterItems for plain names. */
export function filterNames(options: readonly string[], query: string, limit = MAX_SUGGESTIONS): { matches: string[]; total: number } {
    return filterItems(options, query, (name) => name, limit);
}

interface ListPosition {
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
}

/** Places a list under its box, or above it when there's more room there, and follows it on scroll and resize. */
function useListPosition(inputRef: RefObject<HTMLInputElement | null>, visible: boolean): ListPosition | null {
    const [position, setPosition] = useState<ListPosition | null>(null);
    useLayoutEffect(() => {
        if (!visible) return;
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
    }, [inputRef, visible]);
    return position;
}

interface ListItem {
    key: string;
    label: string;
    /** Secondary text, such as the assembly of a plug-in type. */
    detail?: string;
}

interface SuggestionListProps {
    id: string;
    items: ListItem[];
    total: number;
    active: number;
    position: ListPosition;
    onHover: (index: number) => void;
    onChoose: (index: number) => void;
}

/** The scrolling list under a box. Mouse-down keeps focus in the box, so choosing doesn't blur it first. */
function SuggestionList({ id, items, total, active, position, onHover, onChoose }: SuggestionListProps) {
    const listRef = useRef<HTMLUListElement>(null);
    // Keep the highlighted item in view while moving with the arrow keys.
    useEffect(() => {
        (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
    }, [active]);
    return (
        <ul
            ref={listRef}
            id={id}
            role="listbox"
            className="name-combobox-list"
            style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
            onMouseDown={(e) => e.preventDefault()}
        >
            {items.map((item, i) => (
                <li
                    key={item.key}
                    role="option"
                    aria-selected={i === active}
                    className={`name-combobox-item${i === active ? " name-combobox-item--active" : ""}`}
                    title={item.detail ? `${item.label} (${item.detail})` : item.label}
                    onMouseEnter={() => onHover(i)}
                    onClick={() => onChoose(i)}
                >
                    {item.label}
                    {item.detail && <span className="name-combobox-detail">{item.detail}</span>}
                </li>
            ))}
            {total > items.length && (
                <li className="name-combobox-more" aria-hidden="true">
                    Showing {items.length} of {total.toLocaleString()}. Type to narrow the list.
                </li>
            )}
        </ul>
    );
}

/** Arrow keys, Enter and Escape for a box with a list. Other keys are left to the box. */
function handleListKeys(
    e: React.KeyboardEvent<HTMLInputElement>,
    state: { open: boolean; showList: boolean; count: number; active: number },
    actions: { open: () => void; close: () => void; move: (index: number) => void; choose: (index: number) => void },
): void {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!state.open) {
            actions.open();
            return;
        }
        if (state.count === 0) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        actions.move((state.active + step + state.count) % state.count);
    } else if (e.key === "Enter" && state.showList) {
        e.preventDefault();
        actions.choose(Math.min(state.active, state.count - 1));
    } else if (e.key === "Escape" && state.showList) {
        // Close the list without closing the dialog around it.
        e.preventDefault();
        e.stopPropagation();
        actions.close();
    }
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

/**
 * A text box with a searchable, scrolling list of suggestions. Unlike a datalist it stays usable with
 * thousands of names: it shows the first matches and says how many more there are. The list is fixed to
 * the window, so dialogs that scroll or clip their content don't cut it off.
 */
export function NameCombobox({ value, onChange, options, disabled, placeholder, maxLength, "aria-label": ariaLabel }: NameComboboxProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const listId = useId();

    const { matches, total } = open && options ? filterNames(options, value) : { matches: [], total: 0 };
    const showList = open && !disabled && matches.length > 0;
    const position = useListPosition(inputRef, showList);

    const choose = (index: number) => {
        onChange(matches[index]);
        setOpen(false);
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
                onKeyDown={(e) =>
                    handleListKeys(e, { open, showList, count: matches.length, active }, {
                        open: () => {
                            setOpen(true);
                            setActive(0);
                        },
                        close: () => setOpen(false),
                        move: setActive,
                        choose,
                    })
                }
            />
            {showList && position && (
                <SuggestionList
                    id={listId}
                    items={matches.map((name) => ({ key: name, label: name }))}
                    total={total}
                    active={active}
                    position={position}
                    onHover={setActive}
                    onChoose={choose}
                />
            )}
        </>
    );
}

export interface SelectOption {
    value: string;
    label: string;
    /** Secondary text shown beside the label and searched too, such as an assembly name. */
    detail?: string;
}

interface SearchableSelectProps {
    /** The chosen option's value, or "" for none. */
    value: string;
    onChange: (value: string) => void;
    options: readonly SelectOption[];
    /** Label of the "nothing chosen" option. Without it, the choice can't be cleared. */
    noneLabel?: string;
    disabled?: boolean;
    "aria-label"?: string;
}

/**
 * A drop-down whose options can be searched by typing: by label and by detail. It shows the chosen
 * option's label; typing replaces that with a search, and leaving without choosing restores it. A value
 * that isn't among the options is shown as is, so a saved choice is never hidden.
 */
export function SearchableSelect({ value, onChange, options, noneLabel, disabled, "aria-label": ariaLabel }: SearchableSelectProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    // What the user typed since opening; null until they type, so the full list shows first.
    const [query, setQuery] = useState<string | null>(null);
    const listId = useId();

    const chosen = options.find((o) => o.value.toLowerCase() === value.toLowerCase());
    // The detail tells apart options with the same label, such as a type in two versions of an assembly.
    const shown = chosen ? (chosen.detail ? `${chosen.label} (${chosen.detail})` : chosen.label) : value;
    const none: SelectOption | undefined = noneLabel === undefined ? undefined : { value: "", label: noneLabel };
    const filtered = filterItems(options, query ?? "", (o) => (o.detail ? `${o.label} ${o.detail}` : o.label));
    // "None" is offered until the user starts searching.
    const matches = none && !query ? [none, ...filtered.matches] : filtered.matches;
    const total = filtered.total + (matches.length - filtered.matches.length);
    const showList = open && !disabled && matches.length > 0;
    const position = useListPosition(inputRef, showList);

    const openList = () => {
        setOpen(true);
        // Start on the current choice, so Enter keeps it.
        const current = matches.findIndex((o) => o.value.toLowerCase() === value.toLowerCase());
        setActive(Math.max(0, current));
    };
    const close = () => {
        setOpen(false);
        setQuery(null);
    };
    const choose = (index: number) => {
        onChange(matches[index].value);
        close();
        inputRef.current?.blur();
    };

    return (
        <>
            <input
                ref={inputRef}
                className="form-input searchable-select"
                value={query ?? shown}
                placeholder={noneLabel}
                disabled={disabled}
                aria-label={ariaLabel}
                role="combobox"
                aria-expanded={showList}
                aria-controls={listId}
                aria-autocomplete="list"
                autoComplete="off"
                onFocus={(e) => {
                    e.target.select();
                    openList();
                }}
                onClick={() => !open && openList()}
                onBlur={close}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                    setActive(0);
                }}
                onKeyDown={(e) =>
                    handleListKeys(e, { open, showList, count: matches.length, active }, {
                        open: openList,
                        close,
                        move: setActive,
                        choose,
                    })
                }
            />
            {showList && position && (
                <SuggestionList
                    id={listId}
                    items={matches.map((o) => ({ key: o.value || "(none)", label: o.label, detail: o.detail }))}
                    total={total}
                    active={active}
                    position={position}
                    onHover={setActive}
                    onChoose={choose}
                />
            )}
        </>
    );
}
