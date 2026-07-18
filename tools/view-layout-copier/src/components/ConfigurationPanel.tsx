import { CopyOptions } from "../models/interfaces";

interface ConfigurationPanelProps {
    options: CopyOptions;
    onOptionsChange: (options: CopyOptions) => void;
    componentsAvailable: boolean;
}

export function ConfigurationPanel({ options, onOptionsChange, componentsAvailable }: ConfigurationPanelProps) {
    const toggle = (key: keyof CopyOptions) => onOptionsChange({ ...options, [key]: !options[key] });

    return (
        <div className="config-panel">
            <div className="config-section">
                <div className="config-section-title">Copy options</div>
                <div className="config-section-subtitle">What to copy to the target views</div>

                <label className="option-item">
                    <input type="checkbox" checked={options.columnLayout} onChange={() => toggle("columnLayout")} />
                    <span>
                        <span className="option-name">Column layout</span>
                        <span className="option-detail">Columns, order and widths</span>
                    </span>
                </label>
                <label className="option-item">
                    <input type="checkbox" checked={options.sortOrder} onChange={() => toggle("sortOrder")} />
                    <span>
                        <span className="option-name">Sort order</span>
                        <span className="option-detail">Replaces the targets' sorting</span>
                    </span>
                </label>
                <label className={`option-item ${!componentsAvailable ? "disabled" : ""}`}>
                    <input type="checkbox" checked={options.components && componentsAvailable} disabled={!componentsAvailable} onChange={() => toggle("components")} />
                    <span>
                        <span className="option-name">Components configuration</span>
                        <span className="option-detail">{componentsAvailable ? "Custom controls / grid components" : "Source view has no components configuration"}</span>
                    </span>
                </label>
            </div>

            <div className="filters-note">
                <span aria-hidden="true">ⓘ</span> View filters are never copied — each target keeps its own filter criteria. Changes are published automatically.
            </div>
        </div>
    );
}
