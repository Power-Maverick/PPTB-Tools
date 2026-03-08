import { useState } from "react";

interface PropertySectionProps {
    title: string;
    children: React.ReactNode;
    defaultExpanded?: boolean;
}

export function PropertySection({ title, children, defaultExpanded = true }: PropertySectionProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
        <div className="prop-section">
            <div
                className="prop-section-header"
                onClick={() => setExpanded((v) => !v)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v); }}
            >
                <span className="prop-section-toggle">{expanded ? "▼" : "▶"}</span>
                <span className="prop-section-title">{title}</span>
            </div>
            {expanded && <div className="prop-section-body">{children}</div>}
        </div>
    );
}
