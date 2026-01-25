import { PCFControlConfig } from "../models/interfaces";
import styles from "./ControlPanel.module.css";
import { ProjectPathPicker } from "./ProjectPathPicker";

export type ControlAction = "create" | "open-vscode" | "build" | "test" | "quick-deploy" | "install-deps";

interface ControlPanelProps {
    projectPath: string;
    controlConfig: PCFControlConfig;
    packageList: string;
    activeAction: ControlAction | null;
    hasExistingProject: boolean;
    isTestRunning: boolean;
    onControlChange: (update: Partial<PCFControlConfig>) => void;
    onProjectPathChange: (value: string) => void;
    onPackageListChange: (value: string) => void;
    onSelectFolder: () => void | Promise<void>;
    onAction: (action: ControlAction) => void | Promise<void>;
}

export function ControlPanel({
    projectPath,
    controlConfig,
    packageList,
    activeAction,
    hasExistingProject,
    isTestRunning,
    onControlChange,
    onProjectPathChange,
    onPackageListChange,
    onSelectFolder,
    onAction,
}: ControlPanelProps) {
    const hasPath = Boolean(projectPath);
    const canCreate = hasPath && controlConfig.namespace && controlConfig.name && !hasExistingProject;
    const canRunExistingActions = hasPath && hasExistingProject;
    const fieldsReadOnly = hasExistingProject;
    const incrementVersionOnBuild = Boolean(controlConfig.incrementVersionOnBuild);

    const actionButtons: Array<{
        id: ControlAction;
        defaultLabel: string;
        busyLabel?: string;
        className: string;
    }> = [
        {
            id: "create",
            defaultLabel: "Create",
            busyLabel: "Creating...",
            className: "btn btn-primary",
        },
        {
            id: "install-deps",
            defaultLabel: "npm Install",
            busyLabel: "Installing...",
            className: "btn btn-ghost",
        },
        {
            id: "open-vscode",
            defaultLabel: "Open in VS Code",
            busyLabel: "Opening...",
            className: "btn btn-ghost",
        },
        {
            id: "build",
            defaultLabel: "Build",
            busyLabel: "Building...",
            className: "btn btn-ghost",
        },
        {
            id: "test",
            defaultLabel: "Start Test",
            busyLabel: "Starting...",
            className: "btn btn-ghost",
        },
        {
            id: "quick-deploy",
            defaultLabel: "Quick Deploy",
            busyLabel: "Deploying...",
            className: "btn btn-accent",
        },
    ];

    const panelClassName = fieldsReadOnly ? `${styles.panel} ${styles.panelReadOnly}` : styles.panel;

    return (
        <section className={panelClassName}>
            <header className={styles.header}>
                <p className={styles.kicker}>Control</p>
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

            <div className={styles.controlGrid}>
                <div className={`${styles.cell} ${styles.span4}`}>
                    <label htmlFor="namespace">Namespace *</label>
                    <input
                        id="namespace"
                        type="text"
                        value={controlConfig.namespace}
                        placeholder="Contoso"
                        readOnly={fieldsReadOnly}
                        onChange={(event) => onControlChange({ namespace: event.target.value })}
                    />
                </div>
                <div className={`${styles.cell} ${styles.span4}`}>
                    <label htmlFor="name">Control Name *</label>
                    <input
                        id="name"
                        type="text"
                        value={controlConfig.name}
                        placeholder="TimelineControl"
                        readOnly={fieldsReadOnly}
                        onChange={(event) => onControlChange({ name: event.target.value })}
                    />
                </div>
                <div className={`${styles.cell} ${styles.span4}`}>
                    <label htmlFor="displayName">Display Name</label>
                    <input
                        id="displayName"
                        type="text"
                        value={controlConfig.displayName}
                        placeholder="Timeline (Preview)"
                        readOnly={fieldsReadOnly}
                        onChange={(event) => onControlChange({ displayName: event.target.value })}
                    />
                </div>

                <div className={`${styles.cell} ${styles.fullRow}`}>
                    <label htmlFor="description">Description</label>
                    <textarea
                        id="description"
                        value={controlConfig.description}
                        placeholder="Explain what this control unlocks for makers."
                        readOnly={fieldsReadOnly}
                        onChange={(event) => onControlChange({ description: event.target.value })}
                    />
                </div>

                <div className={`${styles.cell} ${styles.span4}`}>
                    <label htmlFor="controlType">Control Type</label>
                    <select
                        id="controlType"
                        value={controlConfig.controlType}
                        disabled={fieldsReadOnly}
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
                <div className={`${styles.cell} ${styles.span4}`}>
                    <label htmlFor="template">Template</label>
                    <select
                        id="template"
                        value={controlConfig.template}
                        disabled={fieldsReadOnly}
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
                <div className={`${styles.cell} ${styles.span4}`}>
                    <label htmlFor="version">Version</label>
                    <input
                        id="version"
                        type="text"
                        value={controlConfig.version}
                        placeholder="1.0.0"
                        readOnly={fieldsReadOnly}
                        onChange={(event) => onControlChange({ version: event.target.value })}
                    />
                </div>

                <div className={`${styles.cell} ${styles.span8}`}>
                    <label htmlFor="packages">Additional Packages (comma separated)</label>
                    <input
                        id="packages"
                        type="text"
                        value={packageList}
                        placeholder="@fluentui/react-components, dayjs"
                        readOnly={fieldsReadOnly}
                        onChange={(event) => onPackageListChange(event.target.value)}
                    />
                    <p className={styles.helperText}>
                        Packages are added via <code>--npm-packages</code> during control init.
                    </p>
                </div>
                <div className={`${styles.cell} ${styles.span4}`}>
                    <label className={styles.toggleLabel} htmlFor="incrementVersion">
                        Increment Version on Build
                    </label>
                    <div className={styles.toggleRow}>
                        <input
                            id="incrementVersion"
                            type="checkbox"
                            checked={incrementVersionOnBuild}
                            disabled={fieldsReadOnly}
                            onChange={(event) => onControlChange({ incrementVersionOnBuild: event.target.checked })}
                            className={styles.checkbox}
                        />
                        <span>Auto bump package version after each build.</span>
                    </div>
                </div>
            </div>

            <div className="button-grid">
                {actionButtons.map((action) => {
                    const isActiveAction = activeAction === action.id;
                    let label = action.defaultLabel;

                    if (action.id === "test") {
                        if (isTestRunning) {
                            label = "Stop Test";
                        } else if (isActiveAction) {
                            label = action.busyLabel ?? action.defaultLabel;
                        }
                    } else if (isActiveAction) {
                        label = action.busyLabel ?? action.defaultLabel;
                    }

                    const isDisabled = (() => {
                        if (action.id === "create") {
                            return !canCreate || isActiveAction;
                        }
                        if (action.id === "test") {
                            if (!canRunExistingActions) {
                                return true;
                            }
                            return !isTestRunning && isActiveAction;
                        }
                        return !canRunExistingActions || isActiveAction;
                    })();

                    return (
                        <button key={action.id} type="button" className={action.className} disabled={isDisabled} onClick={() => onAction(action.id)}>
                            {label}
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
