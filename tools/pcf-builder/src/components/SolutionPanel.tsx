import { PCFSolutionConfig } from "../models/interfaces";
import styles from "./SolutionPanel.module.css";

export type SolutionAction = "create" | "add-control" | "deploy";

interface SolutionPanelProps {
    projectPath: string;
    solutionConfig: PCFSolutionConfig;
    activeAction: SolutionAction | null;
    fieldsLocked: boolean;
    isControlReferenced: boolean;
    onSolutionChange: (update: Partial<PCFSolutionConfig>) => void;
    onAction: (action: SolutionAction) => void | Promise<void>;
}

export function SolutionPanel({ projectPath, solutionConfig, activeAction, fieldsLocked, isControlReferenced, onSolutionChange, onAction }: SolutionPanelProps) {
    const hasPath = Boolean(projectPath);
    const canCreate = hasPath && solutionConfig.publisherName && solutionConfig.publisherPrefix;
    const canDeploy = hasPath && solutionConfig.solutionName;
    const canAddControl = hasPath && !isControlReferenced;
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
                    <label htmlFor="solutionName">Solution Name *</label>
                    <input
                        id="solutionName"
                        type="text"
                        value={solutionConfig.solutionName}
                        placeholder="ContosoTimeline"
                        readOnly={fieldsLocked}
                        onChange={(event) => onSolutionChange({ solutionName: event.target.value })}
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

            <div className={styles.grid}>
                <div>
                    <label htmlFor="publisherName">Publisher Name *</label>
                    <input
                        id="publisherName"
                        type="text"
                        value={solutionConfig.publisherName}
                        placeholder="Contoso"
                        readOnly={fieldsLocked}
                        onChange={(event) => onSolutionChange({ publisherName: event.target.value })}
                    />
                </div>
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
            </div>

            <div>
                <label htmlFor="publisherFriendlyName">Publisher Friendly Name</label>
                <input
                    id="publisherFriendlyName"
                    type="text"
                    value={solutionConfig.publisherFriendlyName}
                    placeholder="Contoso Corporation"
                    readOnly={fieldsLocked}
                    onChange={(event) => onSolutionChange({ publisherFriendlyName: event.target.value })}
                />
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
