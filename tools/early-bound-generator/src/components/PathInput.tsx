interface PathInputProps {
    value: string;
    onChange: (value: string) => void;
    settingsDir: string;

    type?: "file" | "folder";
    filters?: { name: string; extensions: string[] }[];
    placeholder?: string;
    title?: string;
}

export function PathInput({ value, onChange, settingsDir, type = "folder", filters, placeholder, title }: PathInputProps) {
    const handleBrowse = async () => {
        if (!window.toolboxAPI) return;
        const chosen = await window.toolboxAPI.fileSystem.selectPath({ type, filters, title });
        if (!chosen) return;

        const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
        const base = norm(settingsDir);
        const target = norm(chosen);

        let relative: string;
        if (base && target.toLowerCase().startsWith(base.toLowerCase() + "/")) {
            relative = target.slice(base.length + 1);
        } else {
            relative = chosen;
            try {
                const dir = type === "file" ? chosen.replace(/[/\\][^/\\]+$/, "") : chosen;
                await window.toolboxAPI.fileSystem.selectPath({
                    type: "folder",
                    title: `Grant access to ${dir}`,
                    defaultPath: dir,
                });
            } catch {}
        }

        onChange(relative);
    };

    return (
        <div className="form-row-with-browse">
            <input className="form-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
            <button type="button" className="btn-secondary btn-browse" onClick={() => void handleBrowse()}>
                Browse
            </button>
        </div>
    );
}
