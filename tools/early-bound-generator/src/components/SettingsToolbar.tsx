interface SettingsToolbarProps {
    isGenerating: boolean;
    settingsPath: string;
    onGenerate: () => void;
    onOpenSettings: () => void;
    onSaveSettings: () => void;
}

export function SettingsToolbar({ isGenerating, settingsPath, onGenerate, onOpenSettings, onSaveSettings }: SettingsToolbarProps) {
    return (
        <div className="main-toolbar">
            <button className="toolbar-btn primary" onClick={onGenerate} disabled={isGenerating} title="Generate early-bound classes using pac modelbuilder build">
                {isGenerating ? (
                    <>
                        <span className="toolbar-spinner" />
                        Generating...
                    </>
                ) : (
                    "Generate"
                )}
            </button>
            <div className="toolbar-separator" />
            <button className="toolbar-btn" onClick={onOpenSettings} disabled={isGenerating} title="Select a folder containing EBG settings">
                Open Settings
            </button>
            <button className="toolbar-btn" onClick={onSaveSettings} disabled={isGenerating} title="Save settings to file">
                Save Settings
            </button>
            {settingsPath && (
                <>
                    <div className="toolbar-separator" />
                    <span className="toolbar-path" title={settingsPath}>
                        {settingsPath}
                    </span>
                </>
            )}
        </div>
    );
}
