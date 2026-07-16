import { useEffect, useMemo, useRef, useState } from "react";
import { Solution } from "../models/interfaces";

interface SolutionPickerProps {
    solutions: Solution[];
    selectedId: string;
    onSelect: (solutionId: string) => void;
    disabled?: boolean;
}

export function SolutionPicker({ solutions, selectedId, onSelect, disabled }: SolutionPickerProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const selected = solutions.find((s) => s.id === selectedId);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return solutions;
        return solutions.filter((s) => s.displayName.toLowerCase().includes(term) || s.uniqueName.toLowerCase().includes(term));
    }, [solutions, search]);

    useEffect(() => {
        if (!open) return;
        searchRef.current?.focus();

        const onPointerDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const choose = (id: string) => {
        onSelect(id);
        setOpen(false);
        setSearch("");
    };

    return (
        <div className="solution-picker" ref={rootRef}>
            <button type="button" className="solution-picker-trigger" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
                <span className="solution-picker-label">Solution</span>
                <span className="solution-picker-value">{selected ? selected.displayName : "All tables"}</span>
                <span className="solution-picker-chevron" aria-hidden="true">
                    ▾
                </span>
            </button>

            {open && (
                <div className="solution-picker-popup" role="listbox">
                    <input ref={searchRef} type="text" className="solution-picker-search" placeholder="Filter solutions…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    <div className="solution-picker-options">
                        <div className={`solution-picker-option ${selectedId === "" ? "active" : ""}`} role="option" aria-selected={selectedId === ""} onClick={() => choose("")}>
                            <span className="solution-option-name">All tables</span>
                            <span className="solution-option-detail">No solution filter</span>
                        </div>
                        {filtered.map((s) => (
                            <div key={s.id} className={`solution-picker-option ${s.id === selectedId ? "active" : ""}`} role="option" aria-selected={s.id === selectedId} onClick={() => choose(s.id)}>
                                <span className="solution-option-name">
                                    {s.displayName}
                                    {s.isManaged && <span className="tag tag-managed">Managed</span>}
                                </span>
                                <span className="solution-option-detail">
                                    {s.uniqueName} · v{s.version}
                                </span>
                            </div>
                        ))}
                        {filtered.length === 0 && <div className="solution-picker-empty">No solutions match "{search}"</div>}
                    </div>
                </div>
            )}
        </div>
    );
}
