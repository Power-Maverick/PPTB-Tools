import { useEffect, useRef, useState } from "react";
import { CommandOutput } from "./components/CommandOutput";
import { ControlAction, ControlPanel } from "./components/ControlPanel";
import { SolutionAction, SolutionPanel } from "./components/SolutionPanel";
import { TabDefinition, TabSwitcher } from "./components/TabSwitcher";
import { PCFControlConfig, PCFSolutionConfig } from "./models/interfaces";
import "./styles.css";

/// <reference types="@pptb/types" />

type AppTab = "control" | "solution";

type ActionSetter<T extends string> = React.Dispatch<React.SetStateAction<T | null>>;

interface ExecuteOptions {
    command: string;
    pendingLabel?: string;
    successMessage: string;
    errorMessage: string;
    showLoader?: boolean;
    successType?: "success" | "info";
}

type FileSystemAPI = {
    readFile?: (path: string, encoding?: string) => Promise<unknown>;
    readTextFile?: (path: string, encoding?: string) => Promise<unknown>;
    read?: (path: string, encoding?: string) => Promise<unknown>;
    exists?: (path: string) => Promise<boolean>;
};

const textDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : undefined;

const joinFsPath = (root: string, fragment: string) => {
    if (!root) {
        return fragment;
    }
    if (!fragment) {
        return root;
    }
    const separator = root.includes("\\") ? "\\" : "/";
    const trimmedRoot = root.replace(/[\\/]+$/, "");
    const trimmedFragment = fragment.replace(/^[\\/]+/, "");
    return `${trimmedRoot}${separator}${trimmedFragment}`;
};

const cleanString = (value: unknown): string | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const isNonEmptyValue = (value: unknown): boolean => {
    if (value === undefined || value === null) {
        return false;
    }

    if (typeof value === "string") {
        return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
        return value.length > 0;
    }

    return true;
};

function applyDefined<T extends Record<string, any>>(base: T, updates: Partial<T>): T {
    const next = { ...base };

    (Object.entries(updates) as [keyof T, T[keyof T]][]).forEach(([key, value]) => {
        if (!isNonEmptyValue(value)) {
            return;
        }

        if (Array.isArray(value)) {
            next[key] = [...value] as T[keyof T];
            return;
        }

        next[key] = value;
    });

    return next;
}

const normalizeControlType = (value?: string | null): PCFControlConfig["controlType"] => {
    if (typeof value !== "string") {
        return "standard";
    }
    return value.toLowerCase() === "virtual" ? "virtual" : "standard";
};

const normalizeTemplate = (value?: string | null): PCFControlConfig["template"] => {
    if (typeof value !== "string") {
        return "field";
    }
    return value.toLowerCase() === "dataset" ? "dataset" : "field";
};

const decodeFileResult = (input: unknown): string | null => {
    if (typeof input === "string") {
        return input;
    }

    if (!textDecoder) {
        return null;
    }

    if (input instanceof ArrayBuffer) {
        return textDecoder.decode(new Uint8Array(input));
    }

    if (ArrayBuffer.isView(input)) {
        const view = input as ArrayBufferView;
        const buffer = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        return textDecoder.decode(buffer);
    }

    if (Array.isArray(input)) {
        const buffer = Uint8Array.from(input as number[]);
        return textDecoder.decode(buffer);
    }

    if (input && typeof input === "object" && "data" in input && (input as { data: unknown }).data !== undefined) {
        return decodeFileResult((input as { data: unknown }).data);
    }

    return null;
};

const readTextFile = async (fsApi: FileSystemAPI, filePath: string): Promise<string | null> => {
    if (!filePath) {
        return null;
    }

    const readers = [
        typeof fsApi.readFile === "function" ? fsApi.readFile.bind(fsApi) : null,
        typeof fsApi.readTextFile === "function" ? fsApi.readTextFile.bind(fsApi) : null,
        typeof fsApi.read === "function" ? fsApi.read.bind(fsApi) : null,
    ].filter(Boolean) as Array<(target: string, encoding?: string) => Promise<unknown>>;

    const encodings: Array<string | undefined> = ["utf-8", "utf8", undefined];

    for (const reader of readers) {
        for (const encoding of encodings) {
            try {
                const result = await reader(filePath, encoding);
                const decoded = decodeFileResult(result);
                if (decoded !== null) {
                    return decoded;
                }
            } catch (
                // Continue trying other readers/encodings
                _err
            ) {
                continue;
            }
        }
    }

    return null;
};

const extractControlUpdates = (config: Record<string, any>): Partial<PCFControlConfig> => {
    const updates: Partial<PCFControlConfig> = {};
    const control = typeof config.control === "object" && config.control !== null ? config.control : {};

    const namespaceValue = cleanString(control.namespace) ?? cleanString(config.namespace);
    if (namespaceValue) {
        updates.namespace = namespaceValue;
    }

    const nameValue = cleanString(control.name) ?? cleanString(config.controlName);
    if (nameValue) {
        updates.name = nameValue;
    }

    const displayNameValue = cleanString(control.displayName);
    if (displayNameValue) {
        updates.displayName = displayNameValue;
    }

    const descriptionValue = cleanString(control.description);
    if (descriptionValue) {
        updates.description = descriptionValue;
    }

    const versionValue = cleanString(control.version) ?? cleanString(config.version);
    if (versionValue) {
        updates.version = versionValue;
    }

    updates.controlType = normalizeControlType(cleanString(control.controlType) ?? cleanString(config.controlType));

    updates.template = normalizeTemplate(cleanString(config.template) ?? cleanString(config.controlTemplate) ?? cleanString(control.template) ?? cleanString(config.pcfProject?.template));

    const packagesCandidate = Array.isArray(config.additionalPackages) ? config.additionalPackages : Array.isArray(control.additionalPackages) ? control.additionalPackages : undefined;

    if (packagesCandidate && packagesCandidate.length > 0) {
        const sanitized = packagesCandidate.map((pkg) => cleanString(pkg)).filter((pkg): pkg is string => Boolean(pkg));
        if (sanitized.length > 0) {
            updates.additionalPackages = sanitized;
        }
    }

    return updates;
};

const extractSolutionUpdates = (config: Record<string, any>, fallbackVersion?: string): Partial<PCFSolutionConfig> | null => {
    const updates: Partial<PCFSolutionConfig> = {};
    const solution = typeof config.solution === "object" && config.solution !== null ? config.solution : undefined;
    const publisher =
        typeof solution?.publisher === "object" && solution.publisher !== null ? solution.publisher : typeof config.publisher === "object" && config.publisher !== null ? config.publisher : undefined;

    const solutionName = cleanString(solution?.solutionName) ?? cleanString(solution?.name) ?? cleanString(config.solutionName);
    if (solutionName) {
        updates.solutionName = solutionName;
    }

    const publisherName = cleanString(solution?.publisherName) ?? cleanString(publisher?.name) ?? cleanString(config.publisherName);
    if (publisherName) {
        updates.publisherName = publisherName;
    }

    const publisherPrefix = cleanString(solution?.publisherPrefix) ?? cleanString(publisher?.prefix) ?? cleanString(config.publisherPrefix);
    if (publisherPrefix) {
        updates.publisherPrefix = publisherPrefix;
    }

    const friendlyName = cleanString(solution?.publisherFriendlyName) ?? cleanString(publisher?.friendlyName) ?? cleanString(publisher?.displayName) ?? cleanString(config.publisherFriendlyName);
    if (friendlyName) {
        updates.publisherFriendlyName = friendlyName;
    }

    const versionValue = cleanString(solution?.version) ?? cleanString(config.solutionVersion) ?? fallbackVersion ?? cleanString(config.version);
    if (versionValue) {
        updates.version = versionValue;
    }

    return Object.keys(updates).length > 0 ? updates : null;
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
    const [packageList, setPackageList] = useState("");
    const [controlAction, setControlAction] = useState<ControlAction | null>(null);
    const [solutionAction, setSolutionAction] = useState<SolutionAction | null>(null);

    const terminalIdRef = useRef<string | null>(null);

    useEffect(() => {
        const initialize = async () => {
            if (!window.toolboxAPI) {
                setError("Power Platform ToolBox context not detected. Launch this tool inside PPTB.");
                setInitializing(false);
                return;
            }

            try {
                const terminal = await window.toolboxAPI.terminal.create({
                    name: "PCF Builder",
                    visible: false,
                });
                terminalIdRef.current = terminal.id;
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
    }, []);

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
            return;
        }

        setError("");
        setCommandOutput("");
        setAction(actionId);

        const { showLoader = true } = options;

        try {
            if (showLoader) {
                await window.toolboxAPI.utils.showLoading(options.pendingLabel ?? "Working...");
            }

            const result = await window.toolboxAPI.terminal.execute(terminalIdRef.current, options.command);

            const output = result.output || result.error || "";
            setCommandOutput(output);

            if (showLoader) {
                await window.toolboxAPI.utils.hideLoading().catch(() => undefined);
            }

            const exitCode = typeof result.exitCode === "number" ? result.exitCode : 0;
            const isSuccess = exitCode === 0 && !result.error;

            await window.toolboxAPI.utils.showNotification({
                title: isSuccess ? "Success" : "Error",
                body: isSuccess ? options.successMessage : options.errorMessage,
                type: isSuccess ? (options.successType ?? "success") : "error",
            });
        } catch (err) {
            if (showLoader) {
                await window.toolboxAPI?.utils.hideLoading().catch(() => undefined);
            }

            const message = err instanceof Error ? err.message : String(err);
            setCommandOutput(message);
            setError(message);
            await window.toolboxAPI?.utils.showNotification({
                title: "Error",
                body: message,
                type: "error",
            });
        } finally {
            setAction(null);
        }
    };

    const handlePackageListChange = (value: string) => {
        setPackageList(value);
        const packages = value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        setControlConfig((prev) => ({ ...prev, additionalPackages: packages }));
    };

    const hydrateProjectFromFolder = async (workspace: string, options?: { silent?: boolean }) => {
        if (!workspace || !window.toolboxAPI) {
            return false;
        }

        const fsApi = (window.toolboxAPI as ToolBoxAPI.API & { fileSystem?: FileSystemAPI }).fileSystem;

        if (!fsApi) {
            if (!options?.silent) {
                await window.toolboxAPI.utils.showNotification({
                    title: "File reader unavailable",
                    body: "Update PPTB to a version that exposes the fileSystem API to load project metadata automatically.",
                    type: "warning",
                });
            }
            return false;
        }

        const configPath = joinFsPath(workspace, "pcfconfig.json");
        const rawConfig = await readTextFile(fsApi, configPath);

        if (!rawConfig) {
            if (!options?.silent) {
                await window.toolboxAPI.utils.showNotification({
                    title: "No PCF project detected",
                    body: "pcfconfig.json was not found in the selected folder.",
                    type: "warning",
                });
            }
            return false;
        }

        let parsedConfig: Record<string, any>;
        try {
            parsedConfig = JSON.parse(rawConfig);
        } catch (err) {
            if (!options?.silent) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Invalid pcfconfig.json",
                    body: err instanceof Error ? err.message : "Unable to parse pcfconfig.json from the selected folder.",
                    type: "error",
                });
            }
            return false;
        }

        const controlUpdates = extractControlUpdates(parsedConfig);
        const nextControl = applyDefined({ ...DEFAULT_CONTROL_CONFIG }, controlUpdates);
        setControlConfig(nextControl);
        setPackageList(controlUpdates.additionalPackages?.length ? controlUpdates.additionalPackages.join(", ") : "");

        const solutionUpdates = extractSolutionUpdates(parsedConfig, nextControl.version);
        const nextSolution = solutionUpdates ? applyDefined({ ...DEFAULT_SOLUTION_CONFIG }, solutionUpdates) : { ...DEFAULT_SOLUTION_CONFIG };
        setSolutionConfig(nextSolution);

        if (!options?.silent) {
            await window.toolboxAPI.utils.showNotification({
                title: "PCF project detected",
                body: "Fields were populated from the selected folder.",
                type: "success",
            });
        }

        return true;
    };

    const handleSelectFolder = async () => {
        if (!window.toolboxAPI) {
            return;
        }

        try {
            const selected = await window.toolboxAPI.utils.selectPath({
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

                const packages = controlConfig.additionalPackages ?? [];
                const packageArg = packages.length > 0 ? ` --npm-packages ${packages.join(" ")}` : "";
                const command = `cd "${projectPath}" && pac pcf init --namespace ${controlConfig.namespace}` + ` --name ${controlConfig.name} --template ${controlConfig.template}${packageArg}`;

                return executeTerminalCommand(action, setControlAction, {
                    command,
                    pendingLabel: "Creating control...",
                    successMessage: "Control scaffolded successfully.",
                    errorMessage: "Failed to scaffold control.",
                });
            }
            case "open-vscode": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                const command = `cd "${projectPath}" && code "${projectPath}"`;
                return executeTerminalCommand(action, setControlAction, {
                    command,
                    successMessage: "VS Code launched (check your desktop).",
                    errorMessage: "Unable to open VS Code.",
                    showLoader: false,
                    successType: "info",
                });
            }
            case "build": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                const command = `cd "${projectPath}" && npm run build`;
                return executeTerminalCommand(action, setControlAction, {
                    command,
                    pendingLabel: "Building control...",
                    successMessage: "Build completed successfully.",
                    errorMessage: "Build failed.",
                });
            }
            case "test": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                const command = `cd "${projectPath}" && npm start`;
                return executeTerminalCommand(action, setControlAction, {
                    command,
                    successMessage: "Test harness started (see terminal pane).",
                    errorMessage: "Failed to start test harness.",
                    showLoader: false,
                    successType: "info",
                });
            }
            case "quick-deploy": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                const command = `cd "${projectPath}" && npm run build && pac pcf push --publish`;
                return executeTerminalCommand(action, setControlAction, {
                    command,
                    pendingLabel: "Deploying control...",
                    successMessage: "Control pushed to the target environment.",
                    errorMessage: "Quick deploy failed.",
                });
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

                return executeTerminalCommand(action, setSolutionAction, {
                    command,
                    pendingLabel: "Creating solution...",
                    successMessage: "Solution initialized successfully.",
                    errorMessage: "Solution creation failed.",
                });
            }
            case "add-control": {
                const canRun = await ensureProjectPath();
                if (!canRun) {
                    return;
                }
                const command = `cd "${projectPath}" && pac solution add-reference --path .`;
                return executeTerminalCommand(action, setSolutionAction, {
                    command,
                    pendingLabel: "Adding control to solution...",
                    successMessage: "Control referenced inside the solution.",
                    errorMessage: "Failed to add control reference.",
                });
            }
            case "deploy": {
                const canRun = await ensureProjectPath();
                if (!canRun || !solutionConfig.solutionName) {
                    return;
                }
                const zipPath = `./bin/Debug/${solutionConfig.solutionName}.zip`;
                const command = `cd "${projectPath}" && pac solution import --path "${zipPath}" --publish-changes --force-overwrite`;
                return executeTerminalCommand(action, setSolutionAction, {
                    command,
                    pendingLabel: "Deploying solution...",
                    successMessage: "Solution import started. Monitor the terminal for details.",
                    errorMessage: "Solution deployment failed.",
                });
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

                <TabSwitcher tabs={tabs} activeTab={activeTab} onTabChange={(tabId) => setActiveTab(tabId as AppTab)} />

                <div className="panel-area">
                    {activeTab === "control" ? (
                        <ControlPanel
                            projectPath={projectPath}
                            controlConfig={controlConfig}
                            packageList={packageList}
                            activeAction={controlAction}
                            onControlChange={(update) => setControlConfig((prev) => ({ ...prev, ...update }))}
                            onProjectPathChange={setProjectPath}
                            onPackageListChange={handlePackageListChange}
                            onSelectFolder={handleSelectFolder}
                            onAction={handleControlAction}
                        />
                    ) : (
                        <SolutionPanel
                            projectPath={projectPath}
                            solutionConfig={solutionConfig}
                            activeAction={solutionAction}
                            onSolutionChange={(update) => setSolutionConfig((prev) => ({ ...prev, ...update }))}
                            onProjectPathChange={setProjectPath}
                            onSelectFolder={handleSelectFolder}
                            onAction={handleSolutionAction}
                        />
                    )}

                    <CommandOutput output={commandOutput} />
                </div>
            </div>
        </div>
    );
}

export default App;
