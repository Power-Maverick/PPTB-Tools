import { PCFControlConfig, PCFSolutionConfig } from "../models/interfaces";

export type FileSystemAPI = ToolBoxAPI.FileSystemAPI;

export interface ManifestResolutionResult {
    manifestPaths: string[];
    projectPaths: string[];
}

export interface SolutionProjectDetails {
    metadata: Partial<PCFSolutionConfig> | null;
    controlReferenced: boolean;
}

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

type ProjectManifestLookup = {
    manifestPath: string | null;
    projectExists: boolean;
    projectPath: string | null;
};

const readProjectManifestReference = async (fsApi: FileSystemAPI, workspace: string, candidatePath: string): Promise<ProjectManifestLookup> => {
    if (!candidatePath) {
        return { manifestPath: null, projectExists: false, projectPath: null };
    }

    const projectPath = isAbsolutePath(candidatePath) ? candidatePath : joinFsPath(workspace, candidatePath);

    let projectExists = false;
    if (typeof fsApi.exists === "function") {
        projectExists = await fsApi.exists(projectPath);
        if (!projectExists) {
            return { manifestPath: null, projectExists: false, projectPath };
        }
    }

    let projectContent: string;
    try {
        projectContent = await fsApi.readText(projectPath);
        projectExists = true;
    } catch (_err) {
        return { manifestPath: null, projectExists: projectExists, projectPath };
    }

    const elementMatch = projectContent.match(/<ControlManifestFile[^>]*>([^<]+)<\/ControlManifestFile>/i);
    if (elementMatch?.[1]) {
        return {
            manifestPath: resolveManifestAbsolutePath(workspace, elementMatch[1]),
            projectExists,
            projectPath,
        };
    }

    const attributeMatch = projectContent.match(/<ControlManifestFile[^>]*?Include\s*=\s*"([^"]+)"[^>]*\/>/i);
    if (attributeMatch?.[1]) {
        return {
            manifestPath: resolveManifestAbsolutePath(workspace, attributeMatch[1]),
            projectExists,
            projectPath,
        };
    }

    return { manifestPath: null, projectExists, projectPath };
};

export const resolveManifestPathsFromProject = async (fsApi: FileSystemAPI, workspace: string, config?: Record<string, any>): Promise<ManifestResolutionResult> => {
    const manifestPaths = new Set<string>();
    const projectPaths = new Set<string>();
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
        const { manifestPath, projectExists, projectPath } = await readProjectManifestReference(fsApi, workspace, projectCandidate);
        if (projectExists && projectPath) {
            projectPaths.add(projectPath);
        }
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

                if (entryType === "file") {
                    const lowerName = entry.name.toLowerCase();
                    if (lowerName === "controlmanifest.input.xml") {
                        manifestPaths.add(entryPath);
                    }
                    if (lowerName.endsWith(".pcfproj")) {
                        projectPaths.add(entryPath);
                    }
                }
            });
        }
    }

    return {
        manifestPaths: Array.from(manifestPaths),
        projectPaths: Array.from(projectPaths),
    };
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

const pickXmlValue = (source: string, ...tagNames: string[]): string | undefined => {
    if (!source || tagNames.length === 0) {
        return undefined;
    }

    for (const tag of tagNames) {
        const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
        const match = regex.exec(source);
        if (match?.[1]) {
            const normalized = cleanString(match[1]);
            if (normalized) {
                return normalized;
            }
        }
    }

    return undefined;
};

const pickXmlAttributeValue = (source: string, tagName: string, attributeName: string): string | undefined => {
    if (!source) {
        return undefined;
    }

    const regex = new RegExp(`<${tagName}[^>]*${attributeName}\\s*=\\s*"([^"]+)"[^>]*>`, "i");
    const match = regex.exec(source);
    if (match?.[1]) {
        const normalized = cleanString(match[1]);
        if (normalized) {
            return normalized;
        }
    }

    return undefined;
};

const pickXmlSection = (source: string, tagName: string): string | undefined => {
    if (!source) {
        return undefined;
    }

    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
    const match = regex.exec(source);
    return match?.[0];
};

const parseSolutionXmlMetadata = (xml: string): Partial<PCFSolutionConfig> | null => {
    if (!xml) {
        return null;
    }

    const tryDomParse = (): Partial<PCFSolutionConfig> | null => {
        if (typeof DOMParser === "undefined") {
            return null;
        }

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, "application/xml");
            const manifestElement = doc.querySelector("SolutionManifest");
            const solutionRoot: Document | Element = manifestElement ?? doc;
            const publisherElement = manifestElement?.querySelector("Publisher") ?? doc.querySelector("SolutionManifest Publisher") ?? doc.querySelector("Publisher");

            const pickDomValue = (root: Document | Element | null, selectors: string[]): string | undefined => {
                if (!root) {
                    return undefined;
                }

                for (const selector of selectors) {
                    const node = root.querySelector(selector);
                    if (!node) {
                        continue;
                    }

                    if (node instanceof Element) {
                        const attrValue = cleanString(node.getAttribute("description") ?? node.getAttribute("value") ?? undefined);
                        if (attrValue) {
                            return attrValue;
                        }
                    }

                    const textValue = cleanString(node.textContent ?? undefined);
                    if (textValue) {
                        return textValue;
                    }
                }

                return undefined;
            };

            const domResult: Partial<PCFSolutionConfig> = {};

            const solutionName = pickDomValue(solutionRoot, ["UniqueName", "SolutionName"]);
            if (solutionName) {
                domResult.solutionName = solutionName;
            }

            const versionValue = pickDomValue(solutionRoot, ["Version"]);
            if (versionValue) {
                domResult.version = versionValue;
            }

            const publisherRoot = publisherElement ?? solutionRoot;

            const publisherPrefix = pickDomValue(publisherRoot, ["CustomizationPrefix"]);
            if (publisherPrefix) {
                domResult.publisherPrefix = publisherPrefix;
            }

            const publisherName = pickDomValue(publisherRoot, ["PublisherUniqueName", "PublisherName"]);
            if (publisherName) {
                domResult.publisherName = publisherName;
            }

            const publisherFriendly = pickDomValue(publisherRoot, ["LocalizedNames > LocalizedName", "LocalizedName", "PublisherDisplayName", "PublisherFriendlyName"]);
            if (publisherFriendly) {
                domResult.publisherFriendlyName = publisherFriendly;
            }

            return Object.keys(domResult).length > 0 ? domResult : null;
        } catch (
            // Ignore DOM parsing errors and fall back to regex parsing
            _err
        ) {
            return null;
        }
    };

    const domResult = tryDomParse();
    if (domResult) {
        return domResult;
    }

    const manifestBlock = pickXmlSection(xml, "SolutionManifest") ?? xml;
    const publisherBlock = pickXmlSection(manifestBlock, "Publisher") ?? manifestBlock;

    const result: Partial<PCFSolutionConfig> = {};

    const solutionName = pickXmlValue(manifestBlock, "UniqueName", "SolutionName");
    if (solutionName) {
        result.solutionName = solutionName;
    }

    const versionValue = pickXmlValue(manifestBlock, "Version");
    if (versionValue) {
        result.version = versionValue;
    }

    const publisherPrefix = pickXmlValue(publisherBlock, "CustomizationPrefix");
    if (publisherPrefix) {
        result.publisherPrefix = publisherPrefix;
    }

    const publisherName = pickXmlValue(publisherBlock, "PublisherUniqueName", "PublisherName");
    if (publisherName) {
        result.publisherName = publisherName;
    }

    const publisherFriendly = pickXmlAttributeValue(publisherBlock, "LocalizedName", "description") ?? pickXmlValue(publisherBlock, "PublisherDisplayName", "PublisherFriendlyName");
    if (publisherFriendly) {
        result.publisherFriendlyName = publisherFriendly;
    }

    return Object.keys(result).length > 0 ? result : null;
};

const detectControlReference = (source: string, controlName?: string | null): boolean => {
    if (!source || !controlName) {
        return false;
    }

    const normalizedName = cleanString(controlName);
    if (!normalizedName) {
        return false;
    }

    const condensedName = normalizedName.replace(/\s+/g, "");
    if (!condensedName) {
        return false;
    }

    const searchTokens = new Set<string>([
        normalizedName.toLowerCase(),
        condensedName.toLowerCase(),
        `${condensedName.toLowerCase()}.pcfproj`,
        `${condensedName.toLowerCase()}\\`,
        `${condensedName.toLowerCase()}/`,
    ]);

    const haystack = source.toLowerCase();
    for (const token of searchTokens) {
        if (!token) {
            continue;
        }
        if (haystack.includes(token)) {
            return true;
        }
    }

    return false;
};

const parseCdsprojSolutionMetadata = (xml: string): Partial<PCFSolutionConfig> | null => {
    if (!xml) {
        return null;
    }

    const updates: Partial<PCFSolutionConfig> = {};

    const solutionName = pickXmlValue(xml, "SolutionName", "SolutionUniqueName", "SolutionPackageName");
    if (solutionName) {
        updates.solutionName = solutionName;
    }

    const publisherPrefix = pickXmlValue(xml, "PublisherPrefix");
    if (publisherPrefix) {
        updates.publisherPrefix = publisherPrefix;
    }

    const publisherName = pickXmlValue(xml, "PublisherUniqueName", "PublisherName");
    if (publisherName) {
        updates.publisherName = publisherName;
    }

    const publisherFriendly = pickXmlValue(xml, "PublisherDisplayName", "PublisherFriendlyName");
    if (publisherFriendly) {
        updates.publisherFriendlyName = publisherFriendly;
        if (!updates.publisherName) {
            updates.publisherName = publisherFriendly;
        }
    }

    const version = pickXmlValue(xml, "SolutionVersion", "Version");
    if (version) {
        updates.version = version;
    }

    return Object.keys(updates).length > 0 ? updates : null;
};

const loadSolutionXmlUpdates = async (fsApi: FileSystemAPI, workspace: string, normalizedControlName?: string): Promise<Partial<PCFSolutionConfig> | null> => {
    const solutionRoot = joinFsPath(workspace, "Solution");
    const solutionFolderName = normalizedControlName ? `${normalizedControlName}Solution` : undefined;

    const candidatePaths = new Set<string>();
    const addCandidatePath = (path?: string | null) => {
        if (!path) {
            return;
        }
        candidatePaths.add(path);
    };

    const registerFolder = (folderPath?: string | null) => {
        if (!folderPath) {
            return;
        }
        addCandidatePath(joinFsPath(folderPath, "Solution.xml"));
        const srcPath = joinFsPath(folderPath, "src");
        addCandidatePath(joinFsPath(srcPath, "Solution.xml"));
        const otherPath = joinFsPath(srcPath, "Other");
        addCandidatePath(joinFsPath(otherPath, "Solution.xml"));
    };

    registerFolder(solutionRoot);
    if (solutionFolderName) {
        registerFolder(joinFsPath(solutionRoot, solutionFolderName));
    }

    const pathExists = async (path: string) => {
        if (typeof fsApi.exists !== "function") {
            return true;
        }
        try {
            return await fsApi.exists(path);
        } catch (
            // Treat errors as missing files
            _err
        ) {
            return false;
        }
    };

    if (typeof fsApi.readDirectory === "function") {
        const pending: Array<{ directory: string; depth: number }> = [];
        const enqueue = (directory?: string | null, depth = 0) => {
            if (!directory) {
                return;
            }
            pending.push({ directory, depth });
        };

        enqueue(solutionRoot, 0);
        if (solutionFolderName) {
            enqueue(joinFsPath(solutionRoot, solutionFolderName), 1);
        }

        const visited = new Set<string>();
        const maxDepth = 4;

        while (pending.length > 0) {
            const { directory, depth } = pending.shift() as { directory: string; depth: number };
            if (!directory || visited.has(directory)) {
                continue;
            }
            visited.add(directory);

            let entries: FileSystemDirectoryEntry[] = [];
            try {
                entries = await fsApi.readDirectory(directory);
            } catch (
                // Ignore directories we cannot read
                _err
            ) {
                continue;
            }

            for (const entry of entries) {
                if (!entry?.name) {
                    continue;
                }
                const entryType = getEntryType(entry);
                const entryPath = joinFsPath(directory, entry.name);

                if (entryType === "file" && entry.name.toLowerCase() === "solution.xml") {
                    addCandidatePath(entryPath);
                    continue;
                }

                if (entryType === "directory" && depth < maxDepth) {
                    pending.push({ directory: entryPath, depth: depth + 1 });
                }
            }
        }
    }

    const scoreCandidate = (path: string) => {
        const normalized = normalizeSlashes(path).toLowerCase();
        let score = normalized.length;
        if (normalized.includes("/src/other/")) {
            score -= 20;
        }
        if (solutionFolderName && normalized.includes(solutionFolderName.toLowerCase())) {
            score -= 10;
        }
        if (normalized.endsWith("solution.xml")) {
            score -= 5;
        }
        return score;
    };

    const prioritizedPaths = Array.from(candidatePaths).sort((a, b) => scoreCandidate(a) - scoreCandidate(b));

    for (const candidatePath of prioritizedPaths) {
        try {
            if (!(await pathExists(candidatePath))) {
                continue;
            }
            const content = await fsApi.readText(candidatePath);
            const trimmed = content?.trim();
            if (!trimmed) {
                continue;
            }

            const updates = parseSolutionXmlMetadata(trimmed);
            if (updates) {
                return updates;
            }
        } catch (
            // Continue with next candidate
            err
        ) {
            console.warn(`[PCF Builder] Unable to parse Solution.xml at ${candidatePath}`, err);
        }
    }

    return null;
};

const loadSolutionCdsprojInsights = async (
    fsApi: FileSystemAPI,
    workspace: string,
    options?: { normalizedControlName?: string; controlName?: string | null },
): Promise<{ metadata: Partial<PCFSolutionConfig> | null; controlReferenced: boolean }> => {
    const solutionRoot = joinFsPath(workspace, "Solution");
    const solutionFolderName = options?.normalizedControlName ? `${options.normalizedControlName}Solution` : undefined;

    const candidatePaths = new Set<string>();
    const addCandidatePath = (path?: string | null) => {
        if (!path) {
            return;
        }
        candidatePaths.add(path);
    };

    addCandidatePath(joinFsPath(solutionRoot, "Solution.cdsproj"));
    if (solutionFolderName) {
        addCandidatePath(joinFsPath(solutionRoot, `${solutionFolderName}.cdsproj`));
        addCandidatePath(joinFsPath(joinFsPath(solutionRoot, solutionFolderName), `${solutionFolderName}.cdsproj`));
    }

    const pathExists = async (path: string) => {
        if (typeof fsApi.exists !== "function") {
            return true;
        }
        try {
            return await fsApi.exists(path);
        } catch (
            // Treat errors as missing files
            _err
        ) {
            return false;
        }
    };

    if (typeof fsApi.readDirectory === "function") {
        const pending: Array<{ directory: string; depth: number }> = [{ directory: solutionRoot, depth: 0 }];
        const visited = new Set<string>();
        const maxDepth = 1;

        if (solutionFolderName) {
            pending.push({ directory: joinFsPath(solutionRoot, solutionFolderName), depth: 1 });
        }

        while (pending.length > 0) {
            const { directory, depth } = pending.shift() as { directory: string; depth: number };
            if (!directory || visited.has(directory)) {
                continue;
            }
            visited.add(directory);

            let entries: FileSystemDirectoryEntry[] = [];
            try {
                entries = await fsApi.readDirectory(directory);
            } catch (
                // Ignore directories we cannot read
                _err
            ) {
                continue;
            }

            entries.forEach((entry) => {
                if (!entry?.name) {
                    return;
                }
                const entryType = getEntryType(entry);
                const entryPath = joinFsPath(directory, entry.name);

                if (entryType === "file" && entry.name.toLowerCase().endsWith(".cdsproj")) {
                    addCandidatePath(entryPath);
                    return;
                }

                if (entryType === "directory" && depth < maxDepth) {
                    pending.push({ directory: entryPath, depth: depth + 1 });
                }
            });
        }
    }

    const prioritizedPaths = Array.from(candidatePaths).sort((a, b) => a.length - b.length);

    let metadata: Partial<PCFSolutionConfig> | null = null;
    let controlReferenced = false;

    for (const candidatePath of prioritizedPaths) {
        try {
            if (!(await pathExists(candidatePath))) {
                continue;
            }
            const content = await fsApi.readText(candidatePath);
            const trimmed = content?.trim();
            if (!trimmed) {
                continue;
            }

            if (!metadata) {
                const updates = parseCdsprojSolutionMetadata(trimmed);
                if (updates) {
                    metadata = updates;
                }
            }

            if (!controlReferenced && detectControlReference(trimmed, options?.controlName)) {
                controlReferenced = true;
            }

            if (metadata && controlReferenced) {
                break;
            }
        } catch (
            // Continue with next candidate
            err
        ) {
            console.warn(`[PCF Builder] Unable to parse solution metadata from ${candidatePath}`, err);
        }
    }

    return { metadata, controlReferenced };
};

export const loadSolutionProjectUpdates = async (fsApi: FileSystemAPI, workspace: string, options?: { controlName?: string | null }): Promise<SolutionProjectDetails> => {
    if (!workspace) {
        return {
            metadata: null,
            controlReferenced: false,
        };
    }

    const controlName = cleanString(options?.controlName);
    const normalizedControlName = controlName ? controlName.replace(/\s+/g, "") : undefined;

    const [solutionXmlUpdates, cdsprojInsights] = await Promise.all([
        loadSolutionXmlUpdates(fsApi, workspace, normalizedControlName),
        loadSolutionCdsprojInsights(fsApi, workspace, {
            normalizedControlName,
            controlName,
        }),
    ]);

    const metadata = solutionXmlUpdates ?? cdsprojInsights.metadata ?? null;

    return {
        metadata,
        controlReferenced: cdsprojInsights.controlReferenced,
    };
};
