import { useEffect, useRef } from "react";

interface TerminalPanelProps {
    output: string;
    onClear: () => void;
    onCopy: () => void;
}

export function TerminalPanel({ output, onClear, onCopy }: TerminalPanelProps) {
    const bodyRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [output]);

    return (
        <div className="terminal-panel">
            <div className="terminal-header">
                <span className="terminal-header-label">Output</span>
                <div className="terminal-header-actions">
                    <button className="terminal-action-btn" onClick={onCopy} title="Copy output">
                        Copy
                    </button>
                    <button className="terminal-action-btn" onClick={onClear} title="Clear output">
                        Clear
                    </button>
                </div>
            </div>
            <pre ref={bodyRef} className="terminal-body">
                {output.length > 0 ? output : <span className="terminal-placeholder">Run Generate to see pac modelbuilder output here.</span>}
            </pre>
        </div>
    );
}
