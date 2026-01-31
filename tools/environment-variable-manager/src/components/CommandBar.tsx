import { CommandBarProps } from "../models/interfaces";

export function CommandBar({ onRefresh, onCreateNew, loading }: CommandBarProps) {
    return (
        <div className="command-bar">
            <button
                className="btn btn-primary"
                onClick={onCreateNew}
                disabled={loading}
            >
                <span className="btn-icon">➕</span>
                New Variable
            </button>
            <button
                className="btn btn-secondary"
                onClick={onRefresh}
                disabled={loading}
            >
                <span className="btn-icon">{loading ? "⟳" : "🔄"}</span>
                {loading ? "Loading..." : "Refresh"}
            </button>
        </div>
    );
}
