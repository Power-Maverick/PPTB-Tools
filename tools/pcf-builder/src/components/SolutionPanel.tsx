import { PCFSolutionConfig } from "../models/interfaces";
import { ProjectPathPicker } from "./ProjectPathPicker";
import styles from "./SolutionPanel.module.css";

export type SolutionAction = "create" | "add-control" | "deploy";

interface SolutionPanelProps {
  projectPath: string;
  solutionConfig: PCFSolutionConfig;
  activeAction: SolutionAction | null;
  onSolutionChange: (update: Partial<PCFSolutionConfig>) => void;
  onProjectPathChange: (value: string) => void;
  onSelectFolder: () => void | Promise<void>;
  onAction: (action: SolutionAction) => void | Promise<void>;
}

export function SolutionPanel({
  projectPath,
  solutionConfig,
  activeAction,
  onSolutionChange,
  onProjectPathChange,
  onSelectFolder,
  onAction,
}: SolutionPanelProps) {
  const hasPath = Boolean(projectPath);
  const canCreate =
    hasPath && solutionConfig.publisherName && solutionConfig.publisherPrefix;
  const canDeploy = hasPath && solutionConfig.solutionName;

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
      disabled: !hasPath,
    },
    {
      id: "deploy" as SolutionAction,
      label: activeAction === "deploy" ? "Deploying..." : "Deploy",
      className: "btn btn-success",
      disabled: !canDeploy,
    },
  ];

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Solution</p>
          <h2>
            Package and ship your controls as managed or unmanaged solutions.
          </h2>
        </div>
        {projectPath && <span className={styles.pathBadge}>{projectPath}</span>}
      </header>

      <ProjectPathPicker
        label="Solution Workspace"
        value={projectPath}
        placeholder="D:\\PowerApps\\MyControl"
        helperText="Solution commands run inside this path."
        onChange={onProjectPathChange}
        onBrowse={onSelectFolder}
      />

      <div className={styles.grid}>
        <div>
          <label htmlFor="solutionName">Solution Name *</label>
          <input
            id="solutionName"
            type="text"
            value={solutionConfig.solutionName}
            placeholder="ContosoTimeline"
            onChange={(event) =>
              onSolutionChange({ solutionName: event.target.value })
            }
          />
        </div>
        <div>
          <label htmlFor="solutionVersion">Version</label>
          <input
            id="solutionVersion"
            type="text"
            value={solutionConfig.version}
            placeholder="1.0.0"
            onChange={(event) =>
              onSolutionChange({ version: event.target.value })
            }
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
            onChange={(event) =>
              onSolutionChange({ publisherName: event.target.value })
            }
          />
        </div>
        <div>
          <label htmlFor="publisherPrefix">Publisher Prefix *</label>
          <input
            id="publisherPrefix"
            type="text"
            value={solutionConfig.publisherPrefix}
            placeholder="con"
            onChange={(event) =>
              onSolutionChange({ publisherPrefix: event.target.value })
            }
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
          onChange={(event) =>
            onSolutionChange({ publisherFriendlyName: event.target.value })
          }
        />
      </div>

      <p className={styles.helperText}>
        Deploy expects a packaged ZIP inside <code>./bin/Debug</code> named
        after your solution. Adjust the command in <em>Deploy</em> if you keep
        builds elsewhere.
      </p>

      <div className="button-grid">
        {actionButtons.map((action) => (
          <button
            key={action.id}
            type="button"
            className={action.className}
            disabled={action.disabled || activeAction === action.id}
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
