import { PCFSolutionConfig } from "../models/interfaces";
import styles from "./SolutionPanel.module.css";

export type SolutionAction = "create" | "add-control" | "deploy" | "build-solution";

export const PUBLISHER_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const PUBLISHER_NAME_ERROR = "Publisher Name may only contain letters, digits, and underscores, and must start with a letter or underscore.";

interface SolutionPanelProps {
    projectPath: string;
    solutionConfig: PCFSolutionConfig;
    activeAction: SolutionAction | null;
    fieldsLocked: boolean;
    isControlReferenced: boolean;
    solutionProjectCreated: boolean;
    onSolutionChange: (update: Partial<PCFSolutionConfig>) => void;
    onAction: (action: SolutionAction) => void | Promise<void>;
}

export function SolutionPanel({ projectPath, solutionConfig, activeAction, fieldsLocked, isControlReferenced, solutionProjectCreated, onSolutionChange, onAction }: SolutionPanelProps) {
    const hasPath = Boolean(projectPath);
    const publisherNameInvalid = Boolean(solutionConfig.publisherName) && !PUBLISHER_NAME_REGEX.test(solutionConfig.publisherName);
    const canCreate = hasPath && solutionConfig.publisherName && !publisherNameInvalid && solutionConfig.publisherPrefix && !solutionProjectCreated;
    const canDeploy = hasPath && solutionConfig.solutionName;
    const canAddControl = hasPath && !isControlReferenced;
    const canBuildSolution = hasPath && solutionProjectCreated;
    const panelClassName = fieldsLocked ? `${styles.panel} ${styles.panelReadOnly}` : styles.panel;
    const workspaceSummary = hasPath ? "Solution commands reuse the workspace selected on the Control tab." : "Select a workspace from the Control tab to enable solution commands.";

    const actionButtons = [
        {
            id: "create" as SolutionAction,
            label: activeAction === "create" ? "Creating..." : "Create",
            className: "btn btn-primary",
            disabled: !canCreate,
        },
        {
            id: "add-control" as SolutionAction,
            label: activeAction === "add-control" ? "Adding..." : "Add Control",
            className: "btn btn-ghost",
            disabled: !canAddControl,
        },
        {
            id: "build-solution" as SolutionAction,
            label: activeAction === "build-solution" ? "Building..." : "Build Solution",
            className: "btn btn-ghost",
            disabled: !canBuildSolution,
        },
        {
            id: "deploy" as SolutionAction,
            label: activeAction === "deploy" ? "Deploying..." : "Deploy",
            className: "btn btn-success",
            disabled: !canDeploy,
        },
    ];

    return (
        <section className={panelClassName}>
            <header className={styles.header}>
                <p className={styles.kicker}>Solution</p>
            </header>

            <p className={styles.workspaceSummary}>{workspaceSummary}</p>

            <div className={styles.grid}>
                <div>
                    <label htmlFor="publisherFriendlyName">Publisher Friendly Name</label>
                    <input
                        id="publisherFriendlyName"
                        type="text"
                        value={solutionConfig.publisherFriendlyName}
                        placeholder="Contoso"
                        readOnly={fieldsLocked}
                        onChange={(event) => onSolutionChange({ publisherFriendlyName: event.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="publisherName">Publisher Name *</label>
                    <input
                        id="publisherName"
                        type="text"
                        value={solutionConfig.publisherName}
                        placeholder="contoso"
                        readOnly={fieldsLocked}
                        className={publisherNameInvalid ? styles.inputError : undefined}
                        onChange={(event) => onSolutionChange({ publisherName: event.target.value })}
                    />
                    {publisherNameInvalid && (
                        <p className={styles.fieldError}>{PUBLISHER_NAME_ERROR}</p>
                    )}
                </div>
            </div>

            <div className={styles.grid}>
                <div>
                    <label htmlFor="publisherPrefix">Publisher Prefix *</label>
                    <input
                        id="publisherPrefix"
                        type="text"
                        value={solutionConfig.publisherPrefix}
                        placeholder="con"
                        readOnly={fieldsLocked}
                        onChange={(event) => onSolutionChange({ publisherPrefix: event.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="solutionVersion">Version</label>
                    <input
                        id="solutionVersion"
                        type="text"
                        value={solutionConfig.version}
                        placeholder="1.0.0"
                        readOnly={fieldsLocked}
                        onChange={(event) => onSolutionChange({ version: event.target.value })}
                    />
                </div>
            </div>

            <p className={styles.helperText}>
                Deploy expects a packaged ZIP inside <code>./bin/Debug</code> named after your solution. Adjust the command in <em>Deploy</em> if you keep builds elsewhere.
            </p>

            <div className="button-grid">
                {actionButtons.map((action) => (
                    <button key={action.id} type="button" className={action.className} disabled={action.disabled || activeAction === action.id} onClick={() => onAction(action.id)}>
                        {action.label}
                    </button>
                ))}
            </div>

            {isControlReferenced && <p className={styles.helperText}>This control is already referenced inside the solution project.</p>}
        </section>
    );
}
