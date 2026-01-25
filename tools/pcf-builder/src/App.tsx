import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { CommandOutput } from "./components/CommandOutput";
import { ControlAction, ControlPanel } from "./components/ControlPanel";
import { SolutionAction, SolutionPanel } from "./components/SolutionPanel";
import { TabDefinition, TabSwitcher } from "./components/TabSwitcher";
import { PCFControlConfig, PCFSolutionConfig } from "./models/interfaces";
import "./styles.css";
import type { FileSystemAPI } from "./utils/hydration";
import {
    applyDefined,
    applyMissing,
    extractControlUpdates,
    joinFsPath,
    loadManifestControlUpdates,
    loadPackageControlUpdates,
    loadSolutionProjectUpdates,
    resolveManifestPathsFromProject,
} from "./utils/hydration";

/// <reference types="@pptb/types" />

type AppTab = "control" | "solution";

type ActionSetter<T extends string> = Dispatch<SetStateAction<T | null>>;

interface ExecuteOptions {
    command: string;
    pendingLabel?: string;
    successMessage: string;
    errorMessage: string;
    showLoader?: boolean;
    successType?: "success" | "info";
}

const getFileSystem = (): FileSystemAPI | null => {
    if (!window.toolboxAPI) {
        return null;
    }

    return window.toolboxAPI.fileSystem ?? null;
};

const tabs: TabDefinition[] = [
    {
        id: "control",
        label: "Control",
        description: "Create, open, build, test, and deploy PCF",
    },
    {
        id: "solution",
        label: "Solution",
        description: "Package controls inside solutions",
    },
];

const DEFAULT_CONTROL_CONFIG: PCFControlConfig = {
    namespace: "",
    name: "",
    displayName: "",
    description: "",
    controlType: "standard",
    template: "field",
    version: "1.0.0",
    additionalPackages: [],
    incrementVersionOnBuild: false,
};

const DEFAULT_SOLUTION_CONFIG: PCFSolutionConfig = {
    solutionName: "",
    publisherName: "",
    publisherPrefix: "",
    publisherFriendlyName: "",
    version: "1.0.0",
};

function App() {
    const [activeTab, setActiveTab] = useState<AppTab>("control");
    const [initializing, setInitializing] = useState(true);
    const [error, setError] = useState("");
    const [projectPath, setProjectPath] = useState("");
    const [commandOutput, setCommandOutput] = useState("");
    const [controlConfig, setControlConfig] = useState<PCFControlConfig>(DEFAULT_CONTROL_CONFIG);
    const [solutionConfig, setSolutionConfig] = useState<PCFSolutionConfig>(DEFAULT_SOLUTION_CONFIG);
    const [solutionFieldsLocked, setSolutionFieldsLocked] = useState(false);
    const [isControlInSolution, setIsControlInSolution] = useState(false);
    const [packageList, setPackageList] = useState("");
    const [controlAction, setControlAction] = useState<ControlAction | null>(null);
    const [solutionAction, setSolutionAction] = useState<SolutionAction | null>(null);
    const [hasExistingProject, setHasExistingProject] = useState(false);
    const [isTestRunning, setIsTestRunning] = useState(false);

    const terminalIdRef = useRef<string | null>(null);
    const lastHydratedPathRef = useRef<string>("");
    const abortedActionRef = useRef<ControlAction | null>(null);

    const createTerminal = useCallback(async () => {
        if (!window.toolboxAPI) {
            throw new Error("ToolBox API is not available in this context.");
        }

        const terminal = await window.toolboxAPI.terminal.create({
            name: "PCF Builder",
            visible: false,
        });
        terminalIdRef.current = terminal.id;
        return terminal.id;
    }, []);

    useEffect(() => {
        console.info("[PCF Builder] controlConfig state updated", controlConfig);
    }, [controlConfig]);

    useEffect(() => {
        const initialize = async () => {
            if (!window.toolboxAPI) {
                setError("Power Platform ToolBox context not detected. Launch this tool inside PPTB.");
                setInitializing(false);
                return;
            }

            try {
                await createTerminal();
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to initialize terminal";
                setError(message);
            } finally {
                setInitializing(false);
            }
        };

        initialize();

        return () => {
            const terminalId = terminalIdRef.current;
            if (terminalId && window.toolboxAPI) {
                window.toolboxAPI.terminal.close(terminalId).catch(() => undefined);
            }
        };
    }, [createTerminal]);

    const ensureProjectPath = async () => {
        if (projectPath) {
            return true;
        }

        await window.toolboxAPI?.utils.showNotification({
            title: "Select a workspace",
            body: "Choose a project folder before running this action.",
            type: "warning",
        });
        return false;
    };

    const executeTerminalCommand = async <T extends string>(actionId: T, setAction: ActionSetter<T>, options: ExecuteOptions) => {
        if (!window.toolboxAPI || !terminalIdRef.current) {
            setError("ToolBox API is not available in this context.");
            return false;
        }

        setError("");
        setCommandOutput("");
        setAction(actionId);

        const { showLoader = true } = options;
        let didSucceed = false;

        try {
            if (showLoader) {
                await window.toolboxAPI.utils.showLoading(options.pendingLabel ?? "Working...");
            }

            const result = await window.toolboxAPI.terminal.execute(terminalIdRef.current, options.command);

            const output = result.output || result.error || "";
            const wasAborted = abortedActionRef.current === actionId;
            if (!wasAborted) {
                setCommandOutput(output);
            }

            if (showLoader) {
                await window.toolboxAPI.utils.hideLoading().catch(() => undefined);
            }

            const exitCode = typeof result.exitCode === "number" ? result.exitCode : 0;
            const isSuccess = exitCode === 0 && !result.error;
            didSucceed = isSuccess;

            if (wasAborted) {
                abortedActionRef.current = null;
                return false;
            }

            await window.toolboxAPI.utils.showNotification({
                title: isSuccess ? "Success" : "Error",
                body: isSuccess ? options.successMessage : options.errorMessage,
                type: isSuccess ? (options.successType ?? "success") : "error",
            });
        } catch (err) {
            if (showLoader) {
                await window.toolboxAPI?.utils.hideLoading().catch(() => undefined);
            }
            const wasAborted = abortedActionRef.current === actionId;
            const message = err instanceof Error ? err.message : String(err);

            if (!wasAborted) {
                setCommandOutput(message);
                setError(message);
                await window.toolboxAPI?.utils.showNotification({
                    title: "Error",
                    body: message,
                    type: "error",
                });
            } else {
                abortedActionRef.current = null;
            }
            didSucceed = false;
        } finally {
            setAction(null);
        }

        return didSucceed;
    };

    const stopActiveTerminalCommand = async () => {
        if (!window.toolboxAPI || !terminalIdRef.current) {
            return false;
        }

        abortedActionRef.current = "test";
        const terminalId = terminalIdRef.current;

        try {
            await window.toolboxAPI.terminal.close(terminalId);
            terminalIdRef.current = null;
            setCommandOutput("Test harness stopped by user.");
            await window.toolboxAPI.utils.showNotification({
                title: "Test harness stopped",
                body: "The BrowserSync session was stopped.",
                type: "info",
            });
        } catch (err) {
            abortedActionRef.current = null;
            console.error("[PCF Builder] Failed to close terminal", err);
            await window.toolboxAPI.utils.showNotification({
                title: "Unable to stop command",
                body: err instanceof Error ? err.message : "Failed to close the running terminal.",
                type: "error",
            });
            return false;
        }

        try {
            await createTerminal();
        } catch (err) {
            abortedActionRef.current = null;
            const message = err instanceof Error ? err.message : "Failed to spin up a new terminal session.";
            setError(message);
            await window.toolboxAPI.utils.showNotification({
                title: "Terminal unavailable",
                body: message,
                type: "error",
            });
            return false;
        }

        return true;
    };

    const handlePackageListChange = (value: string) => {
        setPackageList(value);
        const packages = value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        setControlConfig((prev) => ({ ...prev, additionalPackages: packages }));
    };

    const hydrateProjectFromFolder = useCallback(async (workspace: string, options?: { silent?: boolean }) => {
        if (!workspace || !window.toolboxAPI) {
            setHasExistingProject(false);
            return false;
        }

        const fsApi = getFileSystem();

        if (!fsApi || typeof fsApi.readText !== "function") {
            if (!options?.silent) {
                await window.toolboxAPI.utils.showNotification({
                    title: "File reader unavailable",
                    body: "Update PPTB to v1.0.17+ to auto-load control metadata.",
                    type: "warning",
                });
            }
            setHasExistingProject(false);
            return false;
        }

        const configPath = joinFsPath(workspace, "pcfconfig.json");
        if (typeof fsApi.exists === "function") {
            const exists = await fsApi.exists(configPath);
            if (!exists) {
                setHasExistingProject(false);
                if (!options?.silent) {
                    await window.toolboxAPI.utils.showNotification({
                        title: "No PCF project detected",
                        body: "pcfconfig.json was not found in the selected folder.",
                        type: "warning",
                    });
                }
                return false;
            }
        }

        let rawConfig: string;
        try {
            rawConfig = await fsApi.readText(configPath);
        } catch (err) {
            if (!options?.silent) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Unable to read pcfconfig.json",
                    body: err instanceof Error ? err.message : "An unexpected filesystem error occurred.",
                    type: "error",
                });
            }
            setHasExistingProject(false);
            return false;
        }

        const normalizedConfig = rawConfig?.trim();
        if (!normalizedConfig) {
            console.warn("[PCF Builder] pcfconfig.json contained no data", {
                workspace,
            });
            if (!options?.silent) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Empty pcfconfig.json",
                    body: "The configuration file exists but does not contain any data.",
                    type: "warning",
                });
            }
            return false;
        }

        let parsedConfig: Record<string, any>;
        try {
            parsedConfig = JSON.parse(normalizedConfig);
        } catch (err) {
            console.error("[PCF Builder] Failed to parse pcfconfig.json", {
                workspace,
                error: err,
            });
            if (!options?.silent) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Invalid pcfconfig.json",
                    body: err instanceof Error ? err.message : "Unable to parse pcfconfig.json from the selected folder.",
                    type: "error",
                });
            }
            setHasExistingProject(false);
            return false;
        }

        const manifestResolution = await resolveManifestPathsFromProject(fsApi, workspace, parsedConfig);
        const manifestPathHints = manifestResolution.manifestPaths;
        setHasExistingProject(manifestResolution.projectPaths.length > 0);

        const [manifestUpdates, packageUpdates] = await Promise.all([
            loadManifestControlUpdates(fsApi, workspace, {
                additionalManifestPaths: manifestPathHints,
            }),
            loadPackageControlUpdates(fsApi, workspace),
        ]);
        if (!manifestUpdates) {
            console.info("[PCF Builder] No ControlManifest.Input.xml metadata detected", {
                workspace,
                manifestPathHints,
            });
        }

        const controlUpdates = extractControlUpdates(parsedConfig);
        if (!controlUpdates || Object.keys(controlUpdates).length === 0) {
            console.warn("[PCF Builder] pcfconfig.json missing control details", {
                workspace,
                parsedConfig,
            });
        }
        let nextControl = applyDefined({ ...DEFAULT_CONTROL_CONFIG }, controlUpdates);
        nextControl = applyMissing(nextControl, manifestUpdates ?? undefined);
        nextControl = applyMissing(nextControl, packageUpdates ?? undefined);
        console.info("[PCF Builder] Hydrated control config", {
            workspace,
            controlUpdates,
            manifestUpdates,
            packageUpdates,
            resultingControl: nextControl,
        });
        setControlConfig(nextControl);
        setPackageList(nextControl.additionalPackages?.length ? nextControl.additionalPackages.join(", ") : "");

        const solutionProjectDetails = await loadSolutionProjectUpdates(fsApi, workspace, {
            controlName: nextControl.name,
        });

        let nextSolution = { ...DEFAULT_SOLUTION_CONFIG };
        if (solutionProjectDetails.metadata) {
            nextSolution = applyDefined(nextSolution, solutionProjectDetails.metadata);
        }
        nextSolution = applyMissing(nextSolution, {
            version: nextControl.version,
        });
        setSolutionConfig(nextSolution);
        const metadataPopulated = Boolean(solutionProjectDetails.metadata && Object.keys(solutionProjectDetails.metadata).length > 0);
        setSolutionFieldsLocked(metadataPopulated);
        setIsControlInSolution(Boolean(solutionProjectDetails.controlReferenced));

        if (!options?.silent) {
            await window.toolboxAPI.utils.showNotification({
                title: "PCF project detected",
                body: "Fields were populated from the selected folder.",
                type: "success",
            });
        }

        lastHydratedPathRef.current = workspace;

        return true;
    }, []);

    useEffect(() => {
        if (!projectPath) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            if (projectPath === lastHydratedPathRef.current) {
                return;
            }

            hydrateProjectFromFolder(projectPath, { silent: true }).catch((err) => {
                console.error("[PCF Builder] Auto-hydration failed", {
                    workspace: projectPath,
                    error: err,
                });
            });
        }, 400);

        return () => window.clearTimeout(timeoutId);
    }, [projectPath, hydrateProjectFromFolder]);

    const handleSelectFolder = async () => {
        if (!window.toolboxAPI) {
            return;
        }

        try {
            const fileSystem = window.toolboxAPI.fileSystem;
            const legacySelectPath = (
                window.toolboxAPI.utils as unknown as {
                    selectPath?: (options?: ToolBoxAPI.SelectPathOptions) => Promise<string | null>;
                }
            )?.selectPath;
            const selectPath = fileSystem?.selectPath ?? legacySelectPath;

            if (!selectPath) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Folder picker unavailable",
                    body: "Update PPTB to use the built-in file system picker.",
                    type: "warning",
                });
                return;
            }

            const selected = await selectPath({
                type: "folder",
                title: "Select PCF workspace",
                message: "Choose a folder that hosts your PCF solution",
                buttonLabel: "Use folder",
            });

            if (selected) {
                setProjectPath(selected);
                await window.toolboxAPI.utils.showNotification({
                    title: "Workspace updated",
                    body: selected,
                    type: "info",
                });
                await hydrateProjectFromFolder(selected);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await window.toolboxAPI.utils.showNotification({
                title: "Folder selection failed",
                body: message,
                type: "error",
            });
        }
    };

    const handleControlAction = async (action: ControlAction) => {
        switch (action) {
            case "create": {
                const canRun = await ensureProjectPath();
                if (!canRun || !controlConfig.namespace || !controlConfig.name) {
                    return;
                }
                if (hasExistingProject) {
                    await window.toolboxAPI?.utils.showNotification({
                        title: "Control already detected",
                        body: "Create is disabled because a .pcfproj already exists in this workspace.",
                        type: "info",
                    });
                    return;
                }

                const packages = controlConfig.additionalPackages ?? [];
                const packageArg = packages.length > 0 ? ` --npm-packages ${packages.join(" ")}` : "";
                const command = `cd "${projectPath}" && pac pcf init --namespace ${controlConfig.namespace}` + ` --name ${controlConfig.name} --template ${controlConfig.template}${packageArg}`;

                await executeTerminalCommand<ControlAction>(action, setControlAction, {
                    command,
                    pendingLabel: "Creating control...",
                    successMessage: "Control scaffolded successfully.",
                    errorMessage: "Failed to scaffold control.",
                });
                return;
            }
            case "open-vscode": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                if (!hasExistingProject) {
                    return;
                }
                const command = `cd "${projectPath}" && code "${projectPath}"`;
                await executeTerminalCommand<ControlAction>(action, setControlAction, {
                    command,
                    successMessage: "VS Code launched (check your desktop).",
                    errorMessage: "Unable to open VS Code.",
                    showLoader: false,
                    successType: "info",
                });
                return;
            }
            case "build": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                if (!hasExistingProject) {
                    return;
                }
                const command = `cd "${projectPath}" && npm run build`;
                await executeTerminalCommand<ControlAction>(action, setControlAction, {
                    command,
                    pendingLabel: "Building control...",
                    successMessage: "Build completed successfully.",
                    errorMessage: "Build failed.",
                });
                return;
            }
            case "test": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                if (!hasExistingProject) {
                    return;
                }
                if (isTestRunning) {
                    const stopped = await stopActiveTerminalCommand();
                    if (stopped) {
                        setIsTestRunning(false);
                        setControlAction(null);
                    }
                    return;
                }
                const command = `cd "${projectPath}" && npm start`;
                setIsTestRunning(true);
                const succeeded = await executeTerminalCommand<ControlAction>(action, setControlAction, {
                    command,
                    successMessage: "Test harness started (see terminal pane).",
                    errorMessage: "Failed to start test harness.",
                    showLoader: false,
                    successType: "info",
                });
                if (!succeeded) {
                    setIsTestRunning(false);
                }
                return;
            }
            case "quick-deploy": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                if (!hasExistingProject) {
                    return;
                }
                const command = `cd "${projectPath}" && npm run build && pac pcf push --publish`;
                await executeTerminalCommand<ControlAction>(action, setControlAction, {
                    command,
                    pendingLabel: "Deploying control...",
                    successMessage: "Control pushed to the target environment.",
                    errorMessage: "Quick deploy failed.",
                });
                return;
            }
            case "install-deps": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                if (!hasExistingProject) {
                    return;
                }
                const command = `cd "${projectPath}" && npm install`;
                await executeTerminalCommand<ControlAction>(action, setControlAction, {
                    command,
                    pendingLabel: "Installing packages...",
                    successMessage: "Dependencies installed successfully.",
                    errorMessage: "npm install failed.",
                });
                return;
            }
            default:
                return;
        }
    };

    const handleSolutionAction = async (action: SolutionAction) => {
        switch (action) {
            case "create": {
                const canRun = await ensureProjectPath();
                if (!canRun || !solutionConfig.publisherName || !solutionConfig.publisherPrefix) {
                    return;
                }

                const nameArg = solutionConfig.solutionName ? ` --solution-name ${solutionConfig.solutionName}` : "";
                const command = `cd "${projectPath}" && pac solution init --publisher-name ${solutionConfig.publisherName}` + ` --publisher-prefix ${solutionConfig.publisherPrefix}${nameArg}`;

                await executeTerminalCommand<SolutionAction>(action, setSolutionAction, {
                    command,
                    pendingLabel: "Creating solution...",
                    successMessage: "Solution initialized successfully.",
                    errorMessage: "Solution creation failed.",
                });
                return;
            }
            case "add-control": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                const command = `cd "${projectPath}" && pac solution add-reference --path .`;
                await executeTerminalCommand<SolutionAction>(action, setSolutionAction, {
                    command,
                    pendingLabel: "Adding control to solution...",
                    successMessage: "Control referenced inside the solution.",
                    errorMessage: "Failed to add control reference.",
                });
                return;
            }
            case "deploy": {
                const canRun = await ensureProjectPath();
                if (!canRun || !solutionConfig.solutionName) {
                    return;
                }
                const zipPath = `./bin/Debug/${solutionConfig.solutionName}.zip`;
                const command = `cd "${projectPath}" && pac solution import --path "${zipPath}" --publish-changes --force-overwrite`;
                await executeTerminalCommand<SolutionAction>(action, setSolutionAction, {
                    command,
                    pendingLabel: "Deploying solution...",
                    successMessage: "Solution import started. Monitor the terminal for details.",
                    errorMessage: "Solution deployment failed.",
                });
                return;
            }
            default:
                return;
        }
    };

    if (initializing) {
        return (
            <div className="app-root">
                <div className="app-shell">
                    <div className="loading-state">Preparing PCF Builder...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-root">
            <div className="app-shell">
                {error && <div className="status-banner">{error}</div>}

                <TabSwitcher tabs={tabs} activeTab={activeTab} workspacePath={projectPath} onTabChange={(tabId) => setActiveTab(tabId as AppTab)} />

                <div className="panel-area">
                    <div className="panel-stack">
                        <div className={`panel-card ${activeTab === "control" ? "panel-card--active" : ""}`}>
                            <ControlPanel
                                projectPath={projectPath}
                                controlConfig={controlConfig}
                                packageList={packageList}
                                activeAction={controlAction}
                                hasExistingProject={hasExistingProject}
                                isTestRunning={isTestRunning}
                                onControlChange={(update) => setControlConfig((prev) => ({ ...prev, ...update }))}
                                onProjectPathChange={setProjectPath}
                                onPackageListChange={handlePackageListChange}
                                onSelectFolder={handleSelectFolder}
                                onAction={handleControlAction}
                            />
                        </div>
                        <div className={`panel-card ${activeTab === "solution" ? "panel-card--active" : ""}`}>
                            <SolutionPanel
                                projectPath={projectPath}
                                solutionConfig={solutionConfig}
                                activeAction={solutionAction}
                                fieldsLocked={solutionFieldsLocked}
                                isControlReferenced={isControlInSolution}
                                onSolutionChange={(update) => setSolutionConfig((prev) => ({ ...prev, ...update }))}
                                onAction={handleSolutionAction}
                            />
                        </div>
                    </div>

                    <CommandOutput output={commandOutput} />
                </div>
            </div>
        </div>
    );
}

export default App;
