import { PCFControlConfig } from "../models/interfaces";
import styles from "./ControlPanel.module.css";
import { ProjectPathPicker } from "./ProjectPathPicker";

export type ControlAction = "create" | "open-vscode" | "build" | "test" | "quick-deploy" | "install-deps";

interface ControlPanelProps {
    projectPath: string;
    controlConfig: PCFControlConfig;
    packageList: string;
    activeAction: ControlAction | null;
    onControlChange: (update: Partial<PCFControlConfig>) => void;
    onProjectPathChange: (value: string) => void;
    onPackageListChange: (value: string) => void;
    onSelectFolder: () => void | Promise<void>;
    onAction: (action: ControlAction) => void | Promise<void>;
}

export function ControlPanel({ projectPath, controlConfig, packageList, activeAction, onControlChange, onProjectPathChange, onPackageListChange, onSelectFolder, onAction }: ControlPanelProps) {
    const hasPath = Boolean(projectPath);
    const canCreate = hasPath && controlConfig.namespace && controlConfig.name;

    const actionButtons = [
        {
            id: "create" as ControlAction,
            label: activeAction === "create" ? "Creating..." : "Create",
            className: "btn btn-primary",
            disabled: !canCreate,
        },
        {
            id: "open-vscode" as ControlAction,
            label: activeAction === "open-vscode" ? "Opening..." : "Open in VS Code",
            className: "btn btn-ghost",
            disabled: !hasPath,
        },
        {
            id: "build" as ControlAction,
            label: activeAction === "build" ? "Building..." : "Build",
            className: "btn btn-ghost",
            disabled: !hasPath,
        },
        {
            id: "test" as ControlAction,
            label: activeAction === "test" ? "Launching..." : "Test",
            className: "btn btn-ghost",
            disabled: !hasPath,
        },
        {
            id: "quick-deploy" as ControlAction,
            label: activeAction === "quick-deploy" ? "Deploying..." : "Quick Deploy",
            className: "btn btn-accent",
            disabled: !hasPath,
        },
        {
            id: "install-deps" as ControlAction,
            label: activeAction === "install-deps" ? "Installing..." : "Install deps",
            className: "btn btn-ghost",
            disabled: !hasPath,
        },
    ];

    return (
        <section className={styles.panel}>
            <header className={styles.header}>
                <div>
                    <p className={styles.kicker}>Control</p>
                    <h2>Create, test, and ship your PCF controls from a single workspace.</h2>
                </div>
                {projectPath && <span className={styles.pathBadge}>{projectPath}</span>}
            </header>

            <div className={styles.section}>
                <ProjectPathPicker
                    label="Project Workspace"
                    value={projectPath}
                    placeholder="D:\\PowerApps\\MyControl"
                    helperText="All control actions run inside this folder."
                    onChange={onProjectPathChange}
                    onBrowse={onSelectFolder}
                />
            </div>

            <div className={styles.grid}>
                <div>
                    <label htmlFor="namespace">Namespace *</label>
                    <input id="namespace" type="text" value={controlConfig.namespace} placeholder="Contoso" onChange={(event) => onControlChange({ namespace: event.target.value })} />
                </div>
                <div>
                    <label htmlFor="name">Control Name *</label>
                    <input id="name" type="text" value={controlConfig.name} placeholder="TimelineControl" onChange={(event) => onControlChange({ name: event.target.value })} />
                </div>
                <div>
                    <label htmlFor="displayName">Display Name</label>
                    <input id="displayName" type="text" value={controlConfig.displayName} placeholder="Timeline (Preview)" onChange={(event) => onControlChange({ displayName: event.target.value })} />
                </div>
                <div>
                    <label htmlFor="version">Version</label>
                    <input id="version" type="text" value={controlConfig.version} placeholder="1.0.0" onChange={(event) => onControlChange({ version: event.target.value })} />
                </div>
            </div>

            <div className={styles.grid}>
                <div>
                    <label htmlFor="controlType">Control Type</label>
                    <select
                        id="controlType"
                        value={controlConfig.controlType}
                        onChange={(event) =>
                            onControlChange({
                                controlType: event.target.value as PCFControlConfig["controlType"],
                            })
                        }
                    >
                        <option value="standard">Standard</option>
                        <option value="virtual">Virtual</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="template">Template</label>
                    <select
                        id="template"
                        value={controlConfig.template}
                        onChange={(event) =>
                            onControlChange({
                                template: event.target.value as PCFControlConfig["template"],
                            })
                        }
                    >
                        <option value="field">Field</option>
                        <option value="dataset">Dataset</option>
                    </select>
                </div>
            </div>

            <div>
                <label htmlFor="description">Description</label>
                <textarea
                    id="description"
                    value={controlConfig.description}
                    placeholder="Explain what this control unlocks for makers."
                    onChange={(event) => onControlChange({ description: event.target.value })}
                />
            </div>

            <div>
                <label htmlFor="packages">Additional Packages (comma separated)</label>
                <input id="packages" type="text" value={packageList} placeholder="@fluentui/react-components, dayjs" onChange={(event) => onPackageListChange(event.target.value)} />
                <p className={styles.helperText}>
                    Packages are added via <code>--npm-packages</code> during control init.
                </p>
            </div>

            <div className="button-grid">
                {actionButtons.map((action) => (
                    <button key={action.id} type="button" className={action.className} disabled={action.disabled || activeAction === action.id} onClick={() => onAction(action.id)}>
                        {action.label}
                    </button>
                ))}
            </div>
        </section>
    );
}
