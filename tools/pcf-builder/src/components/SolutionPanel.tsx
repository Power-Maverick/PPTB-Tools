import { PublisherDetails } from "../models/interfaces";
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
    publisherMode: "select" | "new";
    publishers: PublisherDetails[];
    publishersLoading: boolean;
    selectedPublisher: PublisherDetails | null;
    onSolutionChange: (update: Partial<PCFSolutionConfig>) => void;
    onAction: (action: SolutionAction) => void | Promise<void>;
    onPublisherModeChange: (mode: "select" | "new") => void;
    onPublisherSelect: (publisher: PublisherDetails | null) => void;
    onFetchPublishers: () => void;
}

export function SolutionPanel({
    projectPath,
    solutionConfig,
    activeAction,
    fieldsLocked,
    isControlReferenced,
    solutionProjectCreated,
    publisherMode,
    publishers,
    publishersLoading,
    selectedPublisher,
    onSolutionChange,
    onAction,
    onPublisherModeChange,
    onPublisherSelect,
    onFetchPublishers,
}: SolutionPanelProps) {
    const hasPath = Boolean(projectPath);
    const publisherNameInvalid = publisherMode === "new" && Boolean(solutionConfig.publisherName) && !PUBLISHER_NAME_REGEX.test(solutionConfig.publisherName);
    const canCreate =
        hasPath &&
        !solutionProjectCreated &&
        (publisherMode === "select" ? Boolean(selectedPublisher) : Boolean(solutionConfig.publisherName) && !publisherNameInvalid && Boolean(solutionConfig.publisherPrefix));
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

            {solutionProjectCreated ? (
                <>
                    <div className={styles.grid}>
                        <div>
                            <label htmlFor="publisherName">Publisher Name</label>
                            <input id="publisherName" type="text" value={solutionConfig.publisherName} readOnly />
                        </div>
                        <div>
                            <label htmlFor="publisherPrefix">Publisher Prefix</label>
                            <input id="publisherPrefix" type="text" value={solutionConfig.publisherPrefix} readOnly />
                        </div>
                    </div>
                    <div className={styles.grid}>
                        <div>
                            <label htmlFor="solutionVersion">Version</label>
                            <input id="solutionVersion" type="text" value={solutionConfig.version} readOnly />
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className={styles.publisherModeToggle}>
                        <button
                            type="button"
                            className={publisherMode === "select" ? `${styles.modeBtn} ${styles.modeBtnActive}` : styles.modeBtn}
                            onClick={() => onPublisherModeChange("select")}
                        >
                            Select from environment
                        </button>
                        <button
                            type="button"
                            className={publisherMode === "new" ? `${styles.modeBtn} ${styles.modeBtnActive}` : styles.modeBtn}
                            onClick={() => onPublisherModeChange("new")}
                        >
                            Enter manually
                        </button>
                    </div>

                    {publisherMode === "select" ? (
                        <div>
                            <div className={styles.publisherSelectRow}>
                                <div className={styles.publisherSelectField}>
                                    <label htmlFor="publisherDropdown">Publisher *</label>
                                    <select
                                        id="publisherDropdown"
                                        value={selectedPublisher?.uniqueName ?? ""}
                                        disabled={publishersLoading}
                                        onChange={(e) => {
                                            const found = publishers.find((p) => p.uniqueName === e.target.value) ?? null;
                                            onPublisherSelect(found);
                                        }}
                                    >
                                        <option value="">
                                            {publishersLoading ? "Loading publishers..." : publishers.length === 0 ? "No publishers found — click Refresh" : "Select a publisher..."}
                                        </option>
                                        {publishers.map((p) => (
                                            <option key={p.publisherId} value={p.uniqueName}>
                                                {p.localizedName} ({p.uniqueName})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button type="button" className="btn btn-ghost" disabled={publishersLoading} onClick={onFetchPublishers} title="Refresh publisher list from connected environment">
                                    {publishersLoading ? "..." : "Refresh"}
                                </button>
                            </div>
                            {selectedPublisher && (
                                <div className={styles.grid} style={{ marginTop: "12px" }}>
                                    <div>
                                        <label>Publisher Prefix</label>
                                        <input type="text" value={selectedPublisher.customizationPrefix} readOnly />
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={styles.grid}>
                            <div>
                                <label htmlFor="publisherName">Publisher Name *</label>
                                <input
                                    id="publisherName"
                                    type="text"
                                    value={solutionConfig.publisherName}
                                    placeholder="contoso"
                                    className={publisherNameInvalid ? styles.inputError : undefined}
                                    onChange={(event) => onSolutionChange({ publisherName: event.target.value })}
                                />
                                {publisherNameInvalid && <p className={styles.fieldError}>{PUBLISHER_NAME_ERROR}</p>}
                            </div>
                            <div>
                                <label htmlFor="publisherPrefix">Publisher Prefix *</label>
                                <input
                                    id="publisherPrefix"
                                    type="text"
                                    value={solutionConfig.publisherPrefix}
                                    placeholder="con"
                                    onChange={(event) => onSolutionChange({ publisherPrefix: event.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    <div className={styles.grid}>
                        <div>
                            <label htmlFor="solutionVersion">Version</label>
                            <input
                                id="solutionVersion"
                                type="text"
                                value={solutionConfig.version}
                                placeholder="1.0.0"
                                onChange={(event) => onSolutionChange({ version: event.target.value })}
                            />
                        </div>
                    </div>
                </>
            )}

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
