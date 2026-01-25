import { PCFControlConfig, PCFSolutionConfig } from "../models/interfaces";

export type FileSystemAPI = ToolBoxAPI.FileSystemAPI;

type FileSystemDirectoryEntry = {
    name?: string;
    type?: "file" | "directory";
    isDirectory?: boolean;
};

const getEntryType = (entry: FileSystemDirectoryEntry) => {
    if (entry.type === "file" || entry.type === "directory") {
        return entry.type;
    }
    if (typeof entry.isDirectory === "boolean") {
        return entry.isDirectory ? "directory" : "file";
    }
    return undefined;
};

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

export const joinFsPath = (root: string, fragment: string) => {
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

const getBasename = (input: string) => {
    if (!input) {
        return "";
    }
    const normalized = normalizeSlashes(input).replace(/\/+$/, "");
    const segments = normalized.split("/");
    return segments[segments.length - 1] ?? "";
};

const isAbsolutePath = (input: string) => /^[a-zA-Z]:/.test(input) || input.startsWith("//") || input.startsWith("/");

export const cleanString = (value: unknown): string | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

export const isNonEmptyValue = (value: unknown): boolean => {
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

const resolveManifestAbsolutePath = (workspace: string, reference: string) => {
    if (!reference) {
        return null;
    }

    let normalized = normalizeSlashes(reference.trim());
    const normalizedWorkspace = normalizeSlashes(workspace).replace(/\/+$/, "");
    normalized = normalized.replace(/\$\(MSBuildProjectDirectory\)/gi, normalizedWorkspace);

    if (isAbsolutePath(normalized)) {
        return normalized;
    }

    normalized = normalized.replace(/^\.\//, "");
    return joinFsPath(workspace, normalized);
};

const readProjectManifestReference = async (fsApi: FileSystemAPI, workspace: string, candidatePath: string): Promise<string | null> => {
    if (!candidatePath) {
        return null;
    }

    const projectPath = isAbsolutePath(candidatePath) ? candidatePath : joinFsPath(workspace, candidatePath);

    if (typeof fsApi.exists === "function") {
        const exists = await fsApi.exists(projectPath);
        if (!exists) {
            return null;
        }
    }

    let projectContent: string;
    try {
        projectContent = await fsApi.readText(projectPath);
    } catch (_err) {
        return null;
    }

    const elementMatch = projectContent.match(/<ControlManifestFile[^>]*>([^<]+)<\/ControlManifestFile>/i);
    if (elementMatch?.[1]) {
        return resolveManifestAbsolutePath(workspace, elementMatch[1]);
    }

    const attributeMatch = projectContent.match(/<ControlManifestFile[^>]*?Include\s*=\s*"([^"]+)"[^>]*\/>/i);
    if (attributeMatch?.[1]) {
        return resolveManifestAbsolutePath(workspace, attributeMatch[1]);
    }

    return null;
};

export const resolveManifestPathsFromProject = async (fsApi: FileSystemAPI, workspace: string, config?: Record<string, any>): Promise<string[]> => {
    const manifestPaths = new Set<string>();
    const projectNameCandidates = new Set<string>();

    const workspaceName = getBasename(workspace);
    if (workspaceName) {
        projectNameCandidates.add(`${workspaceName}.pcfproj`);
    }

    const controlNameCandidates = [cleanString(config?.control?.name), cleanString(config?.controlName), cleanString(config?.name)];
    controlNameCandidates.filter((value): value is string => Boolean(value)).forEach((value) => projectNameCandidates.add(`${value}.pcfproj`));

    const explicitProjectFile = cleanString(config?.pcfProject?.projectFile ?? config?.projectFile);
    if (explicitProjectFile) {
        projectNameCandidates.add(explicitProjectFile);
    }

    for (const projectCandidate of projectNameCandidates) {
        const manifestPath = await readProjectManifestReference(fsApi, workspace, projectCandidate);
        if (manifestPath) {
            manifestPaths.add(manifestPath);
        }
    }
    if (typeof fsApi.readDirectory === "function") {
        const trimmedWorkspace = workspace.replace(/[\\/]+$/, "") || workspace;
        const pendingDirectories: string[] = [trimmedWorkspace];
        const visitedDirectories = new Set<string>(pendingDirectories);

        while (pendingDirectories.length > 0) {
            const currentDirectory = pendingDirectories.shift() as string;
            let entries: FileSystemDirectoryEntry[] = [];
            try {
                entries = await fsApi.readDirectory(currentDirectory);
            } catch (
                // Skip directories we cannot read
                _err
            ) {
                continue;
            }

            entries.forEach((entry) => {
                if (!entry?.name) {
                    return;
                }

                const entryType = getEntryType(entry);
                const entryPath = joinFsPath(currentDirectory, entry.name);
                if (entryType === "directory") {
                    if (!visitedDirectories.has(entryPath)) {
                        visitedDirectories.add(entryPath);
                        pendingDirectories.push(entryPath);
                    }
                    return;
                }

                if (entryType === "file" && entry.name.toLowerCase() === "controlmanifest.input.xml") {
                    manifestPaths.add(entryPath);
                }
            });
        }
    }

    return Array.from(manifestPaths);
};

export function applyDefined<T extends Record<string, any>>(base: T, updates: Partial<T>): T {
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

export function applyMissing<T extends Record<string, any>>(base: T, updates?: Partial<T>): T {
    if (!updates) {
        return base;
    }

    const next = { ...base };

    (Object.entries(updates) as [keyof T, T[keyof T]][]).forEach(([key, value]) => {
        if (!isNonEmptyValue(value)) {
            return;
        }

        const existingValue = next[key];
        if (isNonEmptyValue(existingValue)) {
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

export const normalizeControlType = (value?: string | null): PCFControlConfig["controlType"] => {
    if (typeof value !== "string") {
        return "standard";
    }
    return value.toLowerCase() === "virtual" ? "virtual" : "standard";
};

export const normalizeTemplate = (value?: string | null): PCFControlConfig["template"] => {
    if (typeof value !== "string") {
        return "field";
    }
    return value.toLowerCase() === "dataset" ? "dataset" : "field";
};

export const parseControlManifest = (xml: string): Partial<PCFControlConfig> | null => {
    if (!xml) {
        return null;
    }

    const normalizeKey = (key: string) => key.toLowerCase();

    const buildAttrMap = (element: Element) => {
        const map: Record<string, string> = {};
        Array.from(element.attributes).forEach((attr) => {
            map[normalizeKey(attr.name)] = attr.value;
        });
        return map;
    };

    const buildAttrMapFromString = (input: string) => {
        const match = input.match(/<control\b([^>]*)>/i);
        if (!match) {
            return null;
        }
        const attrString = match[1];
        const attrRegex = /([A-Za-z0-9:_-]+)\s*=\s*"([^"]*)"/g;
        const map: Record<string, string> = {};
        let attrMatch: RegExpExecArray | null;
        while ((attrMatch = attrRegex.exec(attrString)) !== null) {
            map[normalizeKey(attrMatch[1])] = attrMatch[2];
        }
        return Object.keys(map).length > 0 ? map : null;
    };

    let attributes: Record<string, string> | null = null;

    if (typeof DOMParser !== "undefined") {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, "application/xml");
            const controlNode = doc.querySelector("control");
            if (controlNode) {
                attributes = buildAttrMap(controlNode);
            }
        } catch (
            // Fallback to regex parsing
            _err
        ) {
            attributes = null;
        }
    }

    if (!attributes) {
        attributes = buildAttrMapFromString(xml);
    }

    if (!attributes) {
        return null;
    }

    const pickAttribute = (...names: string[]) => {
        for (const name of names) {
            const normalized = normalizeKey(name);
            if (attributes[normalized]) {
                return attributes[normalized];
            }
        }
        return undefined;
    };

    const updates: Partial<PCFControlConfig> = {};

    const namespaceValue = cleanString(pickAttribute("namespace"));
    if (namespaceValue) {
        updates.namespace = namespaceValue;
    }

    const constructorValue = cleanString(pickAttribute("constructor", "name"));
    if (constructorValue) {
        updates.name = constructorValue;
    }

    const displayNameValue = cleanString(pickAttribute("display-name", "display-name-key", "displayname", "displaynamekey"));
    if (displayNameValue) {
        updates.displayName = displayNameValue;
    }

    const descriptionValue = cleanString(pickAttribute("description", "description-key", "descriptionkey"));
    if (descriptionValue) {
        updates.description = descriptionValue;
    }

    const versionValue = cleanString(pickAttribute("version"));
    if (versionValue) {
        updates.version = versionValue;
    }

    return Object.keys(updates).length > 0 ? updates : null;
};

export const tryReadJson = async <T>(fsApi: FileSystemAPI, filePath: string): Promise<T | null> => {
    if (!filePath || typeof fsApi.readText !== "function") {
        return null;
    }

    try {
        const raw = await fsApi.readText(filePath);
        const trimmed = raw?.trim();
        if (!trimmed) {
            return null;
        }
        return JSON.parse(trimmed) as T;
    } catch (
        // Fail silently for optional metadata
        _err
    ) {
        console.warn(`Failed to parse JSON from ${filePath}`);
        return null;
    }
};

export const loadManifestControlUpdates = async (fsApi: FileSystemAPI, workspace: string, options?: { additionalManifestPaths?: string[] }): Promise<Partial<PCFControlConfig> | null> => {
    const defaults = [joinFsPath(workspace, "ControlManifest.Input.xml"), joinFsPath(workspace, joinFsPath("src", "ControlManifest.Input.xml"))];
    const extras = options?.additionalManifestPaths ?? [];
    const candidatePaths = Array.from(new Set([...defaults, ...extras].filter((value): value is string => Boolean(value))));

    for (const manifestPath of candidatePaths) {
        if (typeof fsApi.exists === "function") {
            const exists = await fsApi.exists(manifestPath);
            if (!exists) {
                continue;
            }
        }

        try {
            const manifest = await fsApi.readText(manifestPath);
            const trimmed = manifest?.trim();
            if (!trimmed) {
                continue;
            }
            return parseControlManifest(trimmed);
        } catch (
            // Manifest is optional – ignore errors
            err
        ) {
            console.warn(`Failed to parse ControlManifest.Input.xml at ${manifestPath}`, err);
        }
    }

    return null;
};

export const loadPackageControlUpdates = async (fsApi: FileSystemAPI, workspace: string): Promise<Partial<PCFControlConfig> | null> => {
    const packagePath = joinFsPath(workspace, "package.json");
    const packageJson = await tryReadJson<{ version?: string }>(fsApi, packagePath);
    if (!packageJson) {
        return null;
    }

    const updates: Partial<PCFControlConfig> = {};
    const versionValue = cleanString(packageJson.version);
    if (versionValue) {
        updates.version = versionValue;
    }

    return Object.keys(updates).length > 0 ? updates : null;
};

export const extractControlUpdates = (config: Record<string, any>): Partial<PCFControlConfig> => {
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

    const packagesCandidate: unknown[] | undefined = Array.isArray(config.additionalPackages)
        ? config.additionalPackages
        : Array.isArray(control.additionalPackages)
          ? control.additionalPackages
          : undefined;

    if (packagesCandidate && packagesCandidate.length > 0) {
        const sanitized = packagesCandidate.map((pkg) => cleanString(pkg)).filter((pkg): pkg is string => Boolean(pkg));
        if (sanitized.length > 0) {
            updates.additionalPackages = sanitized;
        }
    }

    return updates;
};

export const extractSolutionUpdates = (config: Record<string, any>, fallbackVersion?: string): Partial<PCFSolutionConfig> | null => {
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
