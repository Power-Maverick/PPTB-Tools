import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssemblyDetails } from "./components/AssemblyDetails";
import { BottomGrid } from "./components/BottomGrid";
import { ImageDetails } from "./components/ImageDetails";
import { PackageDetails } from "./components/PackageDetails";
import { PluginTree } from "./components/PluginTree";
import { PluginTypeDetails } from "./components/PluginTypeDetails";
import { RegisterAssemblyDialog } from "./components/RegisterAssemblyDialog";
import { RegisterEndpointStepDialog } from "./components/RegisterEndpointStepDialog";
import { RegisterImageDialog } from "./components/RegisterImageDialog";
import { RegisterPackageDialog } from "./components/RegisterPackageDialog";
import { RegisterServiceEndpointDialog } from "./components/RegisterServiceEndpointDialog";
import { RegisterStepDialog } from "./components/RegisterStepDialog";
import { ServiceEndpointDetails } from "./components/ServiceEndpointDetails";
import { StepDetails } from "./components/StepDetails";
import type { PluginAssembly, PluginPackage, PluginType, ProcessingStep, ServiceEndpoint, StepImage, TreeNode } from "./models/interfaces";
import { DataverseClient } from "./utils/DataverseClient";

const client = new DataverseClient();

function buildTreeNodes(
    assemblies: PluginAssembly[],
    packages: PluginPackage[],
    pluginTypes: Map<string, PluginType[]>,
    steps: Map<string, ProcessingStep[]>,
    images: Map<string, StepImage[]>,
    expandedIds: Set<string>,
    serviceEndpoints: ServiceEndpoint[],
    endpointSteps: Map<string, ProcessingStep[]>,
    showPlugins: boolean,
    showEndpoints: boolean,
    viewMode: 'assemblies' | 'packages',
): TreeNode[] {
    // Inner helper: build a single assembly node (recursive into types/steps/images)
    const buildAssemblyNode = (asm: PluginAssembly): TreeNode => {
        const types = pluginTypes.get(asm.pluginassemblyid) ?? [];
        const typeNodes: TreeNode[] = types.map((pt) => {
            const ptSteps = steps.get(pt.plugintypeid) ?? [];
            const stepNodes: TreeNode[] = ptSteps.map((step) => {
                const stepImages = images.get(step.sdkmessageprocessingstepid) ?? [];
                const imageNodes: TreeNode[] = stepImages.map((img) => ({
                    id: img.sdkmessageprocessingstepimageid,
                    type: "image" as const,
                    name: img.name,
                    data: img,
                }));
                return {
                    id: step.sdkmessageprocessingstepid,
                    type: "step" as const,
                    name: step.name,
                    data: step,
                    children: imageNodes,
                    isExpanded: expandedIds.has(step.sdkmessageprocessingstepid),
                    childrenLoaded: images.has(step.sdkmessageprocessingstepid),
                };
            });
            return {
                id: pt.plugintypeid,
                type: "plugintype" as const,
                name: pt.typename,
                data: pt,
                children: stepNodes,
                isExpanded: expandedIds.has(pt.plugintypeid),
                isWorkflowActivity: pt.isworkflowactivity,
                childrenLoaded: steps.has(pt.plugintypeid),
            };
        });
        return {
            id: asm.pluginassemblyid,
            type: "assembly" as const,
            name: asm.name,
            data: asm,
            children: typeNodes,
            isExpanded: expandedIds.has(asm.pluginassemblyid),
            childrenLoaded: pluginTypes.has(asm.pluginassemblyid),
        };
    };

    // Standalone assemblies (no package association)
    const standaloneAssemblyNodes: TreeNode[] = assemblies
        .filter((asm) => !asm._packageid_value)
        .map(buildAssemblyNode);

    // Group packaged assemblies by package ID
    const assemblyByPackageId = new Map<string, PluginAssembly[]>();
    for (const asm of assemblies.filter((a) => !!a._packageid_value)) {
        const pkgId = asm._packageid_value!;
        if (!assemblyByPackageId.has(pkgId)) assemblyByPackageId.set(pkgId, []);
        assemblyByPackageId.get(pkgId)!.push(asm);
    }

    // Package nodes (each contains its associated assembly nodes as children)
    const knownPackageIds = new Set(packages.map((p) => p.pluginpackageid));
    const packageNodes: TreeNode[] = packages.map((pkg) => {
        const pkgAssemblies = assemblyByPackageId.get(pkg.pluginpackageid) ?? [];
        return {
            id: pkg.pluginpackageid,
            type: "package" as const,
            name: pkg.name,
            data: pkg,
            children: pkgAssemblies.map(buildAssemblyNode),
            isExpanded: expandedIds.has(pkg.pluginpackageid),
            childrenLoaded: true,
        };
    });

    // Orphaned: assemblies whose packageId doesn't match any loaded package
    const orphanedAssemblies = assemblies.filter(
        (a) => !!a._packageid_value && !knownPackageIds.has(a._packageid_value!),
    );
    const orphanedNodes: TreeNode[] = orphanedAssemblies.length > 0
        ? [{
            id: "__orphaned_packages__",
            type: "package-group" as const,
            name: "Unknown Package (orphaned)",
            data: { groupName: "Unknown Package (orphaned)", groupType: "package" as const },
            children: orphanedAssemblies.map(buildAssemblyNode),
            isExpanded: expandedIds.has("__orphaned_packages__"),
            childrenLoaded: true,
        }]
        : [];

    const endpointNodes: TreeNode[] = serviceEndpoints.map((ep) => {
        const epSteps = endpointSteps.get(ep.serviceendpointid) ?? [];
        const stepNodes: TreeNode[] = epSteps.map((step) => {
            const stepImages = images.get(step.sdkmessageprocessingstepid) ?? [];
            const imageNodes: TreeNode[] = stepImages.map((img) => ({
                id: img.sdkmessageprocessingstepimageid,
                type: "image" as const,
                name: img.name,
                data: img,
            }));
            return {
                id: step.sdkmessageprocessingstepid,
                type: "step" as const,
                name: step.name,
                data: step,
                children: imageNodes,
                isExpanded: expandedIds.has(step.sdkmessageprocessingstepid),
                childrenLoaded: images.has(step.sdkmessageprocessingstepid),
            };
        });
        return {
            id: ep.serviceendpointid,
            type: "serviceendpoint" as const,
            name: ep.name,
            data: ep,
            children: stepNodes,
            isExpanded: expandedIds.has(ep.serviceendpointid),
            childrenLoaded: endpointSteps.has(ep.serviceendpointid),
            isWebhook: ep.contract === 8,
        };
    });

    const result: TreeNode[] = [];
    if (showPlugins) {
        if (viewMode === 'packages') {
            result.push(...packageNodes);
            result.push(...orphanedNodes);
            result.push(...standaloneAssemblyNodes);
        } else {
            // Assemblies view: flat list of all assemblies regardless of package association
            result.push(...assemblies.map(buildAssemblyNode));
        }
    }
    if (showEndpoints) result.push(...endpointNodes);
    return result;
}

/** Filter tree nodes for search. Images are excluded from matching but shown as children of matched steps. */
function filterTreeForSearch(nodes: TreeNode[], lowerTerm: string): TreeNode[] {
    if (!lowerTerm) return nodes;
    return nodes.flatMap((node) => {
        const nameMatch = node.type !== "image" && node.name.toLowerCase().includes(lowerTerm);
        if (nameMatch) {
            // Show this node (expanded) with all original children
            return [{ ...node, isExpanded: !!(node.children && node.children.length > 0) }];
        }
        if (node.type !== "image" && node.children) {
            const filteredChildren = filterTreeForSearch(node.children, lowerTerm);
            if (filteredChildren.length > 0) {
                return [{ ...node, children: filteredChildren, isExpanded: true }];
            }
        }
        return [];
    });
}

export default function App() {
    const [isPPTB, setIsPPTB] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Data maps
    const [assemblies, setAssemblies] = useState<PluginAssembly[]>([]);
    const [packages, setPackages] = useState<PluginPackage[]>([]);
    const [pluginTypes, setPluginTypes] = useState<Map<string, PluginType[]>>(new Map());
    const [steps, setSteps] = useState<Map<string, ProcessingStep[]>>(new Map());
    const [images, setImages] = useState<Map<string, StepImage[]>>(new Map());
    const [serviceEndpoints, setServiceEndpoints] = useState<ServiceEndpoint[]>([]);
    const [endpointSteps, setEndpointSteps] = useState<Map<string, ProcessingStep[]>>(new Map());

    // Tree state
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

    // Search
    const [searchTerm, setSearchTerm] = useState("");

    // Filter toggles
    const [showPlugins, setShowPlugins] = useState(true);
    const [showEndpoints, setShowEndpoints] = useState(true);

    // Bulk enable/disable in progress
    const [bulkToggling, setBulkToggling] = useState(false);

    // View mode: 'assemblies' (default, flat list) | 'packages' (grouped under package nodes)
    const [viewMode, setViewMode] = useState<'assemblies' | 'packages'>('assemblies');

    // Register dropdown
    const [showRegisterDropdown, setShowRegisterDropdown] = useState(false);
    const [showViewDropdown, setShowViewDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const viewDropdownRef = useRef<HTMLDivElement>(null);

    // Dialog state
    const [showRegisterAssembly, setShowRegisterAssembly] = useState(false);
    const [showUpdateAssembly, setShowUpdateAssembly] = useState(false);
    const [showRegisterPackage, setShowRegisterPackage] = useState(false);
    const [showUpdatePackage, setShowUpdatePackage] = useState(false);
    const [showRegisterStep, setShowRegisterStep] = useState(false);
    const [showUpdateStep, setShowUpdateStep] = useState(false);
    const [showRegisterImage, setShowRegisterImage] = useState(false);
    const [showUpdateImage, setShowUpdateImage] = useState(false);
    const [showRegisterWebhook, setShowRegisterWebhook] = useState(false);
    const [showRegisterServiceEndpoint, setShowRegisterServiceEndpoint] = useState(false);
    const [showUpdateEndpoint, setShowUpdateEndpoint] = useState(false);
    const [showRegisterEndpointStep, setShowRegisterEndpointStep] = useState(false);
    const [showUpdateEndpointStep, setShowUpdateEndpointStep] = useState(false);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowRegisterDropdown(false);
            }
            if (viewDropdownRef.current && !viewDropdownRef.current.contains(e.target as Node)) {
                setShowViewDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // Environment check
    useEffect(() => {
        if (window.toolboxAPI) {
            setIsPPTB(true);
        } else {
            setError("This tool requires Power Platform Toolbox (PPTB).");
        }
        setLoading(false);
    }, []);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setError("");
        // Reset all state upfront so the tree clears immediately
        setAssemblies([]);
        setPackages([]);
        setServiceEndpoints([]);
        setPluginTypes(new Map());
        setSteps(new Map());
        setImages(new Map());
        setEndpointSteps(new Map());
        setSelectedNode(null);
        setExpandedIds(new Set());
        // Fetch independently — one failure must not block the other
        const [assembliesResult, endpointsResult, packagesResult] = await Promise.allSettled([
            client.fetchAssemblies(),
            client.fetchServiceEndpoints(),
            client.fetchPackages(),
        ]);
        if (assembliesResult.status === "fulfilled") {
            setAssemblies(assembliesResult.value);
        } else {
            const msg = assembliesResult.reason instanceof Error ? assembliesResult.reason.message : String(assembliesResult.reason);
            setError(msg);
        }
        if (endpointsResult.status === "fulfilled") {
            setServiceEndpoints(endpointsResult.value);
        } else {
            const msg = endpointsResult.reason instanceof Error ? endpointsResult.reason.message : String(endpointsResult.reason);
            setError((prev) => (prev ? `${prev}\n${msg}` : msg));
        }
        if (packagesResult.status === "fulfilled") {
            setPackages(packagesResult.value);
        } else {
            const msg = packagesResult.reason instanceof Error ? packagesResult.reason.message : String(packagesResult.reason);
            setError((prev) => (prev ? `${prev}\n${msg}` : msg));
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (isPPTB) {
            void loadAll();
        }
    }, [isPPTB, loadAll]);

    // Load children data when a node is selected (for bottom grid)
    const handleSelectNode = useCallback(
        async (node: TreeNode) => {
            setSelectedNode(node);
            const loadErr = (err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                if (window.toolboxAPI) {
                    void window.toolboxAPI.utils.showNotification({ title: "Error", body: msg, type: "error" });
                }
            };
            if (node.type === "assembly") {
                const asmId = node.id;
                if (!pluginTypes.has(asmId)) {
                    try {
                        const types = await client.fetchPluginTypes(asmId);
                        setPluginTypes((prev: Map<string, PluginType[]>) => new Map(prev).set(asmId, types));
                    } catch (err) {
                        loadErr(err);
                    }
                }
            } else if (node.type === "plugintype") {
                const ptId = node.id;
                if (!steps.has(ptId)) {
                    try {
                        const s = await client.fetchSteps(ptId);
                        setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(ptId, s));
                    } catch (err) {
                        loadErr(err);
                    }
                }
            } else if (node.type === "step") {
                const stepId = node.id;
                if (!images.has(stepId)) {
                    try {
                        const imgs = await client.fetchImages(stepId);
                        setImages((prev: Map<string, StepImage[]>) => new Map(prev).set(stepId, imgs));
                    } catch (err) {
                        loadErr(err);
                    }
                }
            } else if (node.type === "serviceendpoint") {
                const epId = node.id;
                if (!endpointSteps.has(epId)) {
                    try {
                        const s = await client.fetchStepsForEndpoint(epId);
                        setEndpointSteps((prev) => new Map(prev).set(epId, s));
                    } catch (err) {
                        loadErr(err);
                    }
                }
            }
            // 'package' nodes: assemblies are already loaded — no async fetch needed
        },
        [pluginTypes, steps, images, endpointSteps],
    );

    const handleToggleExpand = useCallback(
        async (nodeId: string) => {
            setExpandedIds((prev: Set<string>) => {
                const next = new Set(prev);
                if (next.has(nodeId)) {
                    next.delete(nodeId);
                } else {
                    next.add(nodeId);
                }
                return next;
            });

            // Lazy-load children on expand
            const asm = assemblies.find((a: PluginAssembly) => a.pluginassemblyid === nodeId);
            if (asm && !pluginTypes.has(nodeId)) {
                try {
                    const types = await client.fetchPluginTypes(nodeId);
                    setPluginTypes((prev: Map<string, PluginType[]>) => new Map(prev).set(nodeId, types));
                } catch (err) {
                    console.error(err);
                }
            }
            const ep = serviceEndpoints.find((e) => e.serviceendpointid === nodeId);
            if (ep && !endpointSteps.has(nodeId)) {
                try {
                    const s = await client.fetchStepsForEndpoint(nodeId);
                    setEndpointSteps((prev) => new Map(prev).set(nodeId, s));
                } catch (err) {
                    console.error(err);
                }
            }
            for (const [, pts] of pluginTypes) {
                const pt = pts.find((p: PluginType) => p.plugintypeid === nodeId);
                if (pt && !steps.has(nodeId)) {
                    try {
                        const s = await client.fetchSteps(nodeId);
                        setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(nodeId, s));
                    } catch (err) {
                        console.error(err);
                    }
                    break;
                }
            }
            for (const [, ss] of steps) {
                const step = ss.find((s: ProcessingStep) => s.sdkmessageprocessingstepid === nodeId);
                if (step && !images.has(nodeId)) {
                    try {
                        const imgs = await client.fetchImages(nodeId);
                        setImages((prev: Map<string, StepImage[]>) => new Map(prev).set(nodeId, imgs));
                    } catch (err) {
                        console.error(err);
                    }
                    break;
                }
            }
            // Also check endpoint steps for image loading
            for (const [, ss] of endpointSteps) {
                const step = ss.find((s: ProcessingStep) => s.sdkmessageprocessingstepid === nodeId);
                if (step && !images.has(nodeId)) {
                    try {
                        const imgs = await client.fetchImages(nodeId);
                        setImages((prev: Map<string, StepImage[]>) => new Map(prev).set(nodeId, imgs));
                    } catch (err) {
                        console.error(err);
                    }
                    break;
                }
            }
        },
        [assemblies, pluginTypes, steps, images, serviceEndpoints, endpointSteps],
    );

    const notify = (message: string, type: "success" | "error" = "success") => {
        if (window.toolboxAPI) {
            void window.toolboxAPI.utils.showNotification({ title: type === "success" ? "Success" : "Error", body: message, type });
        }
    };

    // ── Assembly actions ──
    const handleRegisterAssembly = async (content: string, name: string, isolationMode: number, description: string, packageId?: string) => {
        try {
            await client.registerAssembly(content, name, isolationMode, description, packageId);
            notify("Assembly registered successfully.");
            const newId = await client.registerAssembly(content, name, isolationMode, description);
            setShowRegisterAssembly(false);

            // Verify plugin types were discovered by the server
            const types = await client.fetchPluginTypes(newId);
            if (types.length === 0) {
                notify(
                    "Assembly registered but no plugin types were found. Ensure the DLL contains public classes implementing IPlugin or CodeActivity.",
                    "error",
                );
            } else {
                notify(`Assembly registered with ${types.length} plugin type(s).`);
            }

            // Refresh the full tree, then pre-populate the new assembly's types and auto-expand it
            await loadAll();
            setPluginTypes(new Map<string, PluginType[]>([[newId, types]]));
            setExpandedIds(new Set([newId]));
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err; // re-throw so dialog can show inline error
        }
    };

    const handleUpdateAssembly = async (content: string, _name: string, _isolationMode: number, description: string, packageId?: string) => {
        if (selectedNode?.type !== "assembly") return;
        const asm = selectedNode.data as PluginAssembly;
        try {
            await client.updateAssembly(asm.pluginassemblyid, description, content, packageId);
            notify("Assembly updated.");
            await client.updateAssembly(asm.pluginassemblyid, description, content);
            setShowUpdateAssembly(false);

            if (content) {
                const types = await client.fetchPluginTypes(asm.pluginassemblyid);
                if (types.length === 0) {
                    notify(
                        "Assembly updated but no plugin types were found. The DLL may not contain valid plugin classes.",
                        "error",
                    );
                } else {
                    notify(`Assembly updated with ${types.length} plugin type(s).`);
                }
            } else {
                notify("Assembly updated.");
            }

            void loadAll();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err;
        }
    };

    const handleSaveAssemblyDescription = async (description: string) => {
        if (selectedNode?.type !== "assembly") return;
        const asm = selectedNode.data as PluginAssembly;
        try {
            await client.updateAssembly(asm.pluginassemblyid, description);
            notify("Assembly description saved.");
            void loadAll();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const handleUnregisterAssembly = async () => {
        if (selectedNode?.type !== "assembly") return;
        const asm = selectedNode.data as PluginAssembly;
        if (!window.confirm(`Unregister assembly "${asm.name}"? This will remove all associated plugin types, steps, and images.`)) return;
        try {
            await client.deleteAssembly(asm.pluginassemblyid);
            notify("Assembly unregistered.");
            setSelectedNode(null);
            void loadAll();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    // ── Plugin Package actions ──
    const handleCreatePackage = async (name: string, uniquename: string, version: string, content: string) => {
        try {
            await client.createPackage(name, uniquename, version, content);
            notify("Package registered successfully.");
            setShowRegisterPackage(false);
            void loadAll();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err;
        }
    };

    const handleUpdatePackage = async (_name: string, _uniquename: string, version: string, content: string) => {
        if (selectedNode?.type !== "package") return;
        const pkg = selectedNode.data as PluginPackage;
        try {
            await client.updatePackage(pkg.pluginpackageid, version, content || undefined);
            notify("Package updated.");
            setShowUpdatePackage(false);
            void loadAll();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err;
        }
    };

    const handleDeletePackage = async () => {
        if (selectedNode?.type !== "package") return;
        const pkg = selectedNode.data as PluginPackage;
        if (pkg.ismanaged) {
            notify("This package is part of a managed solution and cannot be deleted.", "error");
            return;
        }
        if (!window.confirm(`Delete package "${pkg.name}"?\nThis will NOT delete associated assemblies — they will become standalone.`)) return;
        try {
            await client.deletePackage(pkg.pluginpackageid);
            notify("Package deleted.");
            setSelectedNode(null);
            void loadAll();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    // ── Step actions ──
    const getSelectedPluginType = (): PluginType | null => {
        if (selectedNode?.type === "plugintype") return selectedNode.data as PluginType;
        return null;
    };

    const handleRegisterStep = async (stepData: Partial<ProcessingStep> & { messageId: string; filterId?: string; pluginTypeId: string; configuration?: string; secureconfig?: string; supporteddeployment?: number }) => {
        try {
            // If secureconfig provided, create the secure config record first and bind it
            const stepPayload: typeof stepData & { secureconfigid?: string } = { ...stepData };
            let createdScId: string | undefined;
            if (stepData.secureconfig) {
                createdScId = await client.createSecureConfig(stepData.secureconfig);
                stepPayload.secureconfigid = createdScId;
            }
            try {
                await client.registerStep(stepPayload);
            } catch (registerErr) {
                // Clean up orphaned secure config record if step creation failed
                if (createdScId) await client.deleteSecureConfig(createdScId).catch(() => undefined);
                throw registerErr;
            }
            notify("Step registered successfully.");
            setShowRegisterStep(false);
            const ptId = stepData.pluginTypeId;
            const s = await client.fetchSteps(ptId);
            setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(ptId, s));
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err; // re-throw so dialog can show inline error
        }
    };

    const handleUpdateStep = async (stepData: Partial<ProcessingStep> & { messageId: string; filterId?: string; pluginTypeId: string; configuration?: string; secureconfig?: string; supporteddeployment?: number }) => {
        if (selectedNode?.type !== "step") return;
        const step = selectedNode.data as ProcessingStep;
        try {
            // Handle secure config changes
            const stepPayload: typeof stepData & { secureconfigid?: string } = { ...stepData };
            let createdScId: string | undefined;
            if (stepData.secureconfig) {
                if (step.secureconfigid) {
                    await client.updateSecureConfig(step.secureconfigid, stepData.secureconfig);
                } else {
                    createdScId = await client.createSecureConfig(stepData.secureconfig);
                    stepPayload.secureconfigid = createdScId;
                }
            }
            try {
                await client.updateStep(step.sdkmessageprocessingstepid, stepPayload);
            } catch (updateErr) {
                // Clean up orphaned secure config record if step update failed
                if (createdScId) await client.deleteSecureConfig(createdScId).catch(() => undefined);
                throw updateErr;
            }
            notify("Step updated.");
            setShowUpdateStep(false);
            const ptId = step.plugintypeid ?? stepData.pluginTypeId;
            if (ptId) {
                const s = await client.fetchSteps(ptId);
                setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(ptId, s));
                const updated = s.find((st) => st.sdkmessageprocessingstepid === step.sdkmessageprocessingstepid);
                if (updated) setSelectedNode((prev) => prev ? { ...prev, data: updated } : prev);
            }
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err; // re-throw so dialog can show inline error
        }
    };

    const handleSaveStepDescription = async (description: string) => {
        if (selectedNode?.type !== "step") return;
        const step = selectedNode.data as ProcessingStep;
        try {
            await client.updateStep(step.sdkmessageprocessingstepid, { description });
            notify("Step description saved.");
            const ptId = step.plugintypeid;
            if (ptId) {
                const s = await client.fetchSteps(ptId);
                setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(ptId, s));
                const updated = s.find((st) => st.sdkmessageprocessingstepid === step.sdkmessageprocessingstepid);
                if (updated) setSelectedNode((prev) => prev ? { ...prev, data: updated } : prev);
            }
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const handleUnregisterStep = async () => {
        if (selectedNode?.type !== "step") return;
        const step = selectedNode.data as ProcessingStep;
        if (!window.confirm(`Unregister step "${step.name}"?`)) return;
        try {
            await client.deleteStep(step.sdkmessageprocessingstepid);
            notify("Step unregistered.");
            setSelectedNode(null);
            const ptId = step.plugintypeid;
            if (ptId) {
                const s = await client.fetchSteps(ptId);
                setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(ptId, s));
            }
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const handleEnableStep = async () => {
        if (selectedNode?.type !== "step") return;
        const step = selectedNode.data as ProcessingStep;
        try {
            await client.enableStep(step.sdkmessageprocessingstepid);
            notify("Step enabled.");
            const ptId = step.plugintypeid;
            if (ptId) {
                const s = await client.fetchSteps(ptId);
                setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(ptId, s));
                const updated = s.find((st) => st.sdkmessageprocessingstepid === step.sdkmessageprocessingstepid);
                if (updated) setSelectedNode((prev) => prev ? { ...prev, data: updated } : prev);
            } else if (step.serviceendpointid) {
                const s = await client.fetchStepsForEndpoint(step.serviceendpointid);
                setEndpointSteps((prev) => new Map(prev).set(step.serviceendpointid!, s));
                const updated = s.find((st) => st.sdkmessageprocessingstepid === step.sdkmessageprocessingstepid);
                if (updated) setSelectedNode((prev) => prev ? { ...prev, data: updated } : prev);
            }
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const handleDisableStep = async () => {
        if (selectedNode?.type !== "step") return;
        const step = selectedNode.data as ProcessingStep;
        try {
            await client.disableStep(step.sdkmessageprocessingstepid);
            notify("Step disabled.");
            const ptId = step.plugintypeid;
            if (ptId) {
                const s = await client.fetchSteps(ptId);
                setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(ptId, s));
                const updated = s.find((st) => st.sdkmessageprocessingstepid === step.sdkmessageprocessingstepid);
                if (updated) setSelectedNode((prev) => prev ? { ...prev, data: updated } : prev);
            } else if (step.serviceendpointid) {
                const s = await client.fetchStepsForEndpoint(step.serviceendpointid);
                setEndpointSteps((prev) => new Map(prev).set(step.serviceendpointid!, s));
                const updated = s.find((st) => st.sdkmessageprocessingstepid === step.sdkmessageprocessingstepid);
                if (updated) setSelectedNode((prev) => prev ? { ...prev, data: updated } : prev);
            }
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const bulkToggleStepsForPluginType = async (action: "enable" | "disable") => {
        if (selectedNode?.type !== "plugintype") return;
        const pt = selectedNode.data as PluginType;
        const verb = action === "enable" ? "enabled" : "disabled";
        setBulkToggling(true);
        try {
            const cached = steps.get(pt.plugintypeid);
            const ptSteps = cached ?? (await client.fetchSteps(pt.plugintypeid));
            if (!cached) setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(pt.plugintypeid, ptSteps));
            if (ptSteps.length === 0) { notify("No steps found."); return; }
            const op = (id: string) => (action === "enable" ? client.enableStep(id) : client.disableStep(id));
            const results = await Promise.allSettled(ptSteps.map((s) => op(s.sdkmessageprocessingstepid)));
            const failed = results.filter((r) => r.status === "rejected").length;
            if (failed > 0) {
                notify(`${ptSteps.length - failed} step(s) ${verb}. ${failed} failed.`, "error");
            } else {
                notify(`All ${ptSteps.length} step(s) ${verb}.`);
            }
            const refreshed = await client.fetchSteps(pt.plugintypeid);
            setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(pt.plugintypeid, refreshed));
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        } finally {
            setBulkToggling(false);
        }
    };

    const handleEnableAllStepsForPluginType = () => bulkToggleStepsForPluginType("enable");
    const handleDisableAllStepsForPluginType = () => bulkToggleStepsForPluginType("disable");

    const bulkToggleStepsForAssembly = async (action: "enable" | "disable") => {
        if (selectedNode?.type !== "assembly") return;
        const asm = selectedNode.data as PluginAssembly;
        const verb = action === "enable" ? "enabled" : "disabled";
        setBulkToggling(true);
        try {
            const cachedTypes = pluginTypes.get(asm.pluginassemblyid);
            const pts = cachedTypes ?? (await client.fetchPluginTypes(asm.pluginassemblyid));
            if (!cachedTypes) setPluginTypes((prev: Map<string, PluginType[]>) => new Map(prev).set(asm.pluginassemblyid, pts));
            if (pts.length === 0) { notify("No plugin types found."); return; }
            const stepsEntries = await Promise.all(
                pts.map(async (pt: PluginType) => {
                    const cached = steps.get(pt.plugintypeid);
                    const ptSteps = cached ?? (await client.fetchSteps(pt.plugintypeid));
                    return { ptId: pt.plugintypeid, ptSteps };
                }),
            );
            setSteps((prev: Map<string, ProcessingStep[]>) => {
                const next = new Map(prev);
                for (const { ptId, ptSteps } of stepsEntries) {
                    if (!prev.has(ptId)) next.set(ptId, ptSteps);
                }
                return next;
            });
            const allSteps = stepsEntries.flatMap(({ ptSteps }) => ptSteps);
            if (allSteps.length === 0) { notify("No steps found."); return; }
            const op = (id: string) => (action === "enable" ? client.enableStep(id) : client.disableStep(id));
            const results = await Promise.allSettled(allSteps.map((s) => op(s.sdkmessageprocessingstepid)));
            const failed = results.filter((r) => r.status === "rejected").length;
            if (failed > 0) {
                notify(`${allSteps.length - failed} step(s) ${verb}. ${failed} failed.`, "error");
            } else {
                notify(`All ${allSteps.length} step(s) ${verb}.`);
            }
            const refreshed = await Promise.all(pts.map(async (pt: PluginType) => ({ ptId: pt.plugintypeid, ptSteps: await client.fetchSteps(pt.plugintypeid) })));
            setSteps((prev: Map<string, ProcessingStep[]>) => {
                const next = new Map(prev);
                for (const { ptId, ptSteps } of refreshed) next.set(ptId, ptSteps);
                return next;
            });
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        } finally {
            setBulkToggling(false);
        }
    };

    const handleEnableAllStepsForAssembly = () => bulkToggleStepsForAssembly("enable");
    const handleDisableAllStepsForAssembly = () => bulkToggleStepsForAssembly("disable");

    // ── Service Endpoint actions ──
    const handleRegisterServiceEndpoint = async (data: Partial<ServiceEndpoint>) => {
        try {
            await client.registerServiceEndpoint(data);
            notify("Service endpoint registered successfully.");
            setShowRegisterWebhook(false);
            setShowRegisterServiceEndpoint(false);
            void loadAll();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err;
        }
    };

    const handleUpdateServiceEndpoint = async (data: Partial<ServiceEndpoint>) => {
        if (selectedNode?.type !== "serviceendpoint") return;
        const ep = selectedNode.data as ServiceEndpoint;
        try {
            await client.updateServiceEndpoint(ep.serviceendpointid, data);
            notify("Service endpoint updated.");
            setShowUpdateEndpoint(false);
            void loadAll();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err;
        }
    };

    const handleSaveEndpointDescription = async (description: string) => {
        if (selectedNode?.type !== "serviceendpoint") return;
        const ep = selectedNode.data as ServiceEndpoint;
        try {
            await client.updateServiceEndpoint(ep.serviceendpointid, { description });
            notify("Description saved.");
            void loadAll();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const handleUnregisterServiceEndpoint = async () => {
        if (selectedNode?.type !== "serviceendpoint") return;
        const ep = selectedNode.data as ServiceEndpoint;
        if (!window.confirm(`Unregister "${ep.name}"? This will also remove all associated steps.`)) return;
        try {
            await client.deleteServiceEndpoint(ep.serviceendpointid);
            notify("Service endpoint unregistered.");
            setSelectedNode(null);
            void loadAll();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const handleRegisterEndpointStep = async (stepData: {
        name: string;
        description?: string;
        rank?: number;
        mode?: number;
        stage?: number;
        filteringattributes?: string;
        asyncautodelete?: boolean;
        messageId: string;
        filterId?: string;
        endpointId: string;
        configuration?: string;
        supporteddeployment?: number;
    }) => {
        try {
            await client.registerStepForEndpoint(stepData);
            notify("Step registered successfully.");
            setShowRegisterEndpointStep(false);
            const s = await client.fetchStepsForEndpoint(stepData.endpointId);
            setEndpointSteps((prev) => new Map(prev).set(stepData.endpointId, s));
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err;
        }
    };

    const handleUpdateEndpointStep = async (stepData: {
        name: string;
        description?: string;
        rank?: number;
        mode?: number;
        stage?: number;
        filteringattributes?: string;
        asyncautodelete?: boolean;
        messageId: string;
        filterId?: string;
        endpointId: string;
        configuration?: string;
        supporteddeployment?: number;
    }) => {
        if (selectedNode?.type !== "step") return;
        const step = selectedNode.data as ProcessingStep;
        try {
            await client.updateStep(step.sdkmessageprocessingstepid, {
                name: stepData.name,
                description: stepData.description,
                rank: stepData.rank,
                mode: stepData.mode,
                stage: stepData.stage,
                filteringattributes: stepData.filteringattributes,
                asyncautodelete: stepData.asyncautodelete,
                messageId: stepData.messageId,
                filterId: stepData.filterId,
                configuration: stepData.configuration,
                supporteddeployment: stepData.supporteddeployment,
            });
            notify("Step updated.");
            setShowUpdateEndpointStep(false);
            const s = await client.fetchStepsForEndpoint(stepData.endpointId);
            setEndpointSteps((prev) => new Map(prev).set(stepData.endpointId, s));
            const updated = s.find((st) => st.sdkmessageprocessingstepid === step.sdkmessageprocessingstepid);
            if (updated) setSelectedNode((prev) => prev ? { ...prev, data: updated } : prev);
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err;
        }
    };

    // ── Image actions ──
    const handleRegisterImage = async (imageData: Partial<StepImage> & { stepId: string }) => {
        try {
            await client.registerImage(imageData);
            notify("Image registered.");
            setShowRegisterImage(false);
            const imgs = await client.fetchImages(imageData.stepId);
            setImages((prev: Map<string, StepImage[]>) => new Map(prev).set(imageData.stepId, imgs));
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err; // re-throw so dialog can show inline error
        }
    };

    const handleUpdateImage = async (imageData: Partial<StepImage> & { stepId: string }) => {
        if (selectedNode?.type !== "image") return;
        const img = selectedNode.data as StepImage;
        try {
            if (imageData.stepId) {
                imageData.sdkmessageprocessingstepid = imageData.stepId;
            }
            await client.updateImage(img.sdkmessageprocessingstepimageid, imageData);
            notify("Image updated.");
            setShowUpdateImage(false);
            const imgs = await client.fetchImages(imageData.stepId);
            setImages((prev: Map<string, StepImage[]>) => new Map(prev).set(imageData.stepId, imgs));
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err; // re-throw so dialog can show inline error
        }
    };

    const handleSaveImageDescription = async (description: string) => {
        if (selectedNode?.type !== "image") return;
        const img = selectedNode.data as StepImage;
        try {
            await client.updateImage(img.sdkmessageprocessingstepimageid, { description });
            notify("Image description saved.");
            const imgs = await client.fetchImages(img.sdkmessageprocessingstepid);
            setImages((prev: Map<string, StepImage[]>) => new Map(prev).set(img.sdkmessageprocessingstepid, imgs));
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    const handleUnregisterImage = async () => {
        if (selectedNode?.type !== "image") return;
        const img = selectedNode.data as StepImage;
        if (!window.confirm(`Unregister image "${img.name}"?`)) return;
        try {
            await client.deleteImage(img.sdkmessageprocessingstepimageid);
            notify("Image unregistered.");
            setSelectedNode(null);
            const imgs = await client.fetchImages(img.sdkmessageprocessingstepid);
            setImages((prev: Map<string, StepImage[]>) => new Map(prev).set(img.sdkmessageprocessingstepid, imgs));
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    // ── Computed selection state ──
    const selectedAssembly = selectedNode?.type === "assembly" ? (selectedNode.data as PluginAssembly) : null;
    const selectedPackage = selectedNode?.type === "package" ? (selectedNode.data as PluginPackage) : null;
    const selectedPluginType = getSelectedPluginType();
    const selectedStep = selectedNode?.type === "step" ? (selectedNode.data as ProcessingStep) : null;
    const selectedImage = selectedNode?.type === "image" ? (selectedNode.data as StepImage) : null;
    const selectedEndpoint = selectedNode?.type === "serviceendpoint" ? (selectedNode.data as ServiceEndpoint) : null;
    // A step belonging to a service endpoint (has serviceendpointid set)
    const selectedEndpointStep = (selectedNode?.type === "step" && (selectedNode.data as ProcessingStep).serviceendpointid)
        ? (selectedNode.data as ProcessingStep)
        : null;
    // Find the parent endpoint for a selected endpoint step
    const parentEndpoint: ServiceEndpoint | null = (() => {
        if (!selectedEndpointStep) return null;
        return serviceEndpoints.find((e) => e.serviceendpointid === selectedEndpointStep.serviceendpointid) ?? null;
    })();

    const stepPluginType: PluginType | null = (() => {
        if (selectedNode?.type === "step") {
            const step = selectedNode.data as ProcessingStep;
            for (const [, pts] of pluginTypes) {
                const pt = pts.find((p) => p.plugintypeid === step.plugintypeid);
                if (pt) return pt;
            }
        }
        return null;
    })();

    // Flat stepId → ProcessingStep lookup built once per steps change, used by imageStep below.
    const stepById = useMemo(() => {
        const map = new Map<string, ProcessingStep>();
        for (const [, ss] of steps) {
            for (const s of ss) {
                map.set(s.sdkmessageprocessingstepid, s);
            }
        }
        return map;
    }, [steps]);

    // When an image node is selected, find its parent step so the update-image dialog can be rendered.
    const imageStep: ProcessingStep | null = (() => {
        if (selectedNode?.type === "image") {
            const img = selectedNode.data as StepImage;
            return stepById.get(img.sdkmessageprocessingstepid) ?? null;
        }
        return null;
    })();

    // Context-sensitive toolbar state
    const canUpdate = !!(selectedAssembly || selectedStep || selectedImage || selectedEndpoint || selectedPackage);
    const canUnregister = !!(selectedAssembly || selectedStep || selectedImage || selectedEndpoint || selectedPackage);
    const canRegisterStep = !!(selectedPluginType && !selectedPluginType.isworkflowactivity);
    const canRegisterImage = !!selectedStep;
    const isStepSelected = !!selectedStep;
    const stepIsEnabled = selectedStep?.statecode === 0;

    const handleUpdateSelected = () => {
        if (selectedPackage) setShowUpdatePackage(true);
        else if (selectedAssembly) setShowUpdateAssembly(true);
        else if (selectedEndpointStep) setShowUpdateEndpointStep(true);
        else if (selectedStep) setShowUpdateStep(true);
        else if (selectedImage) setShowUpdateImage(true);
        else if (selectedEndpoint) setShowUpdateEndpoint(true);
    };

    const handleUnregisterSelected = () => {
        if (selectedPackage) void handleDeletePackage();
        else if (selectedAssembly) void handleUnregisterAssembly();
        else if (selectedStep) void handleUnregisterStep();
        else if (selectedImage) void handleUnregisterImage();
        else if (selectedEndpoint) void handleUnregisterServiceEndpoint();
    };

    // Double-click tree node → open update dialog
    const handleDoubleClickNode = (node: TreeNode) => {
        if (node.type === "package") {
            setSelectedNode(node);
            const pkg = node.data as PluginPackage;
            if (!pkg.ismanaged) setShowUpdatePackage(true);
        } else if (node.type === "assembly") {
            setSelectedNode(node);
            setShowUpdateAssembly(true);
        } else if (node.type === "step") {
            setSelectedNode(node);
            const step = node.data as ProcessingStep;
            if (step.serviceendpointid) {
                setShowUpdateEndpointStep(true);
            } else {
                setShowUpdateStep(true);
            }
        } else if (node.type === "image") {
            setSelectedNode(node);
            setShowUpdateImage(true);
        } else if (node.type === "serviceendpoint") {
            setSelectedNode(node);
            setShowUpdateEndpoint(true);
        }
    };

    // Bottom grid data
    const bottomGridMode = (() => {
        if (!selectedNode) return "none" as const;
        if (selectedNode.type === "assembly") return "plugins" as const;
        if (selectedNode.type === "plugintype") return "steps" as const;
        if (selectedNode.type === "step") return "images" as const;
        return "none" as const;
    })();

    const bottomPluginTypes = selectedAssembly ? (pluginTypes.get(selectedAssembly.pluginassemblyid) ?? []) : [];
    const bottomSteps = selectedPluginType ? (steps.get(selectedPluginType.plugintypeid) ?? []) : [];
    const bottomImages = selectedStep ? (images.get(selectedStep.sdkmessageprocessingstepid) ?? []) : [];

    const rawTreeNodes = buildTreeNodes(assemblies, packages, pluginTypes, steps, images, expandedIds, serviceEndpoints, endpointSteps, showPlugins, showEndpoints, viewMode);

    const treeNodes = searchTerm
        ? filterTreeForSearch(rawTreeNodes, searchTerm.toLowerCase())
        : rawTreeNodes;

    if (loading && assemblies.length === 0) {
        return (
            <div className="loading-container">
                <div className="loading-spinner" />
                <span>Loading…</span>
            </div>
        );
    }

    if (error && !isPPTB) {
        return (
            <div className="error-container">
                <span>⚠️ {error}</span>
            </div>
        );
    }

    return (
        <div className="page-layout">
            {/* Top toolbar */}
            <div className="main-toolbar">
                {/* Register dropdown */}
                <div className="toolbar-group" ref={dropdownRef}>
                    <button className="toolbar-btn" onClick={() => setShowRegisterDropdown((v) => !v)}>
                        Register <span className="dropdown-arrow">▾</span>
                    </button>
                    {showRegisterDropdown && (
                        <div className="toolbar-dropdown">
                            <div
                                className="toolbar-dropdown-item"
                                onClick={() => {
                                    setShowRegisterAssembly(true);
                                    setShowRegisterDropdown(false);
                                }}
                            >
                                New Assembly
                            </div>
                            <div
                                className="toolbar-dropdown-item"
                                onClick={() => {
                                    setShowRegisterPackage(true);
                                    setShowRegisterDropdown(false);
                                }}
                            >
                                New Package
                            </div>
                            {canRegisterStep && (
                                <div
                                    className="toolbar-dropdown-item"
                                    onClick={() => {
                                        setShowRegisterStep(true);
                                        setShowRegisterDropdown(false);
                                    }}
                                >
                                    New Step
                                </div>
                            )}
                            {canRegisterImage && (
                                <div
                                    className="toolbar-dropdown-item"
                                    onClick={() => {
                                        setShowRegisterImage(true);
                                        setShowRegisterDropdown(false);
                                    }}
                                >
                                    New Image
                                </div>
                            )}
                            {selectedEndpoint && (
                                <div
                                    className="toolbar-dropdown-item"
                                    onClick={() => {
                                        setShowRegisterEndpointStep(true);
                                        setShowRegisterDropdown(false);
                                    }}
                                >
                                    New Endpoint Step
                                </div>
                            )}
                            <div
                                className="toolbar-dropdown-item"
                                onClick={() => {
                                    setShowRegisterWebhook(true);
                                    setShowRegisterDropdown(false);
                                }}
                            >
                                New Webhook
                            </div>
                            <div
                                className="toolbar-dropdown-item"
                                onClick={() => {
                                    setShowRegisterServiceEndpoint(true);
                                    setShowRegisterDropdown(false);
                                }}
                            >
                                New Service Endpoint
                            </div>
                        </div>
                    )}
                </div>

                {/* View dropdown */}
                <div className="toolbar-group" ref={viewDropdownRef}>
                    <button className="toolbar-btn" onClick={() => setShowViewDropdown((v) => !v)}>
                        View: {viewMode === 'packages' ? 'Packages' : 'Assemblies'} <span className="dropdown-arrow">▾</span>
                    </button>
                    {showViewDropdown && (
                        <div className="toolbar-dropdown" role="menu">
                            <button
                                role="menuitem"
                                className={`toolbar-dropdown-item${viewMode === 'assemblies' ? ' toolbar-dropdown-item--active' : ''}`}
                                onClick={() => { setViewMode('assemblies'); setShowViewDropdown(false); setSelectedNode(null); }}
                            >
                                Assemblies
                            </button>
                            <button
                                role="menuitem"
                                className={`toolbar-dropdown-item${viewMode === 'packages' ? ' toolbar-dropdown-item--active' : ''}`}
                                onClick={() => { setViewMode('packages'); setShowViewDropdown(false); setSelectedNode(null); }}
                            >
                                Packages
                            </button>
                        </div>
                    )}
                </div>

                <div className="toolbar-separator" />

                <div className="toolbar-group">
                    <button className="toolbar-btn" onClick={handleUpdateSelected} disabled={!canUpdate}>
                        Update
                    </button>
                    <button className="toolbar-btn danger" onClick={handleUnregisterSelected} disabled={!canUnregister}>
                        Unregister
                    </button>
                </div>

                <div className="toolbar-separator" />

                <div className="toolbar-group">
                    <button className="toolbar-btn" onClick={() => void loadAll()} disabled={loading}>
                        {loading ? "Refreshing…" : "Refresh"}
                    </button>
                </div>

                <div className="toolbar-separator" />

                <div className="toolbar-group toolbar-filter-group">
                    <label className="toolbar-filter-label">
                        <input type="checkbox" checked={showPlugins} onChange={(e) => setShowPlugins(e.target.checked)} />
                        Plugins
                    </label>
                    <label className="toolbar-filter-label">
                        <input type="checkbox" checked={showEndpoints} onChange={(e) => setShowEndpoints(e.target.checked)} />
                        Endpoints
                    </label>
                </div>

                {isStepSelected && (
                    <>
                        <div className="toolbar-separator" />
                        <div className="toolbar-group">
                            <button className="toolbar-btn" onClick={() => void handleEnableStep()} disabled={stepIsEnabled}>
                                Enable
                            </button>
                            <button className="toolbar-btn" onClick={() => void handleDisableStep()} disabled={!stepIsEnabled}>
                                Disable
                            </button>
                        </div>
                    </>
                )}
                {(selectedPluginType || selectedAssembly) && (
                    <>
                        <div className="toolbar-separator" />
                        <div className="toolbar-group">
                            <button
                                className="toolbar-btn"
                                disabled={bulkToggling}
                                onClick={() => {
                                    if (selectedPluginType) void handleEnableAllStepsForPluginType();
                                    else void handleEnableAllStepsForAssembly();
                                }}
                            >
                                {bulkToggling ? <><span className="toolbar-spinner" /> Enabling…</> : "Enable All"}
                            </button>
                            <button
                                className="toolbar-btn"
                                disabled={bulkToggling}
                                onClick={() => {
                                    if (selectedPluginType) void handleDisableAllStepsForPluginType();
                                    else void handleDisableAllStepsForAssembly();
                                }}
                            >
                                {bulkToggling ? <><span className="toolbar-spinner" /> Disabling…</> : "Disable All"}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Page subtitle */}
            <div className="page-subtitle">Registered Plugins &amp; Custom Workflow Activities</div>

            {/* Error banner */}
            {error && isPPTB && <div className="error-banner">⚠️ {error}</div>}

            {/* Content area: tree + details */}
            <div className="content-area">
                {/* Left: tree */}
                <div className="left-panel">
                    <div className="left-panel-header">
                        <input
                            className="tree-search"
                            type="text"
                            placeholder="Search assemblies, plugins, steps…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button className="tree-search-clear" onClick={() => setSearchTerm("")} title="Clear search">✕</button>
                        )}
                    </div>
                    <PluginTree
                        nodes={treeNodes}
                        selectedId={selectedNode?.id ?? null}
                        onSelectNode={(node) => void handleSelectNode(node)}
                        onToggleExpand={(id) => void handleToggleExpand(id)}
                        onDoubleClickNode={handleDoubleClickNode}
                        emptyMessage={
                            searchTerm
                                ? `No results for "${searchTerm}"`
                                : "No assemblies found. Click Register → New Assembly to add one."
                        }
                    />
                </div>

                {/* Right: details */}
                <div className="right-panel">
                    {!selectedNode && <div className="details-placeholder">Select an item from the tree to view its properties.</div>}
                    {selectedPackage && (
                        <PackageDetails
                            pkg={selectedPackage}
                            assemblies={assemblies.filter((a) => a._packageid_value === selectedPackage.pluginpackageid)}
                            onUpdate={() => setShowUpdatePackage(true)}
                            onDelete={() => void handleDeletePackage()}
                        />
                    )}
                    {selectedAssembly && (
                        <AssemblyDetails
                            assembly={selectedAssembly}
                            onSave={(desc) => handleSaveAssemblyDescription(desc)}
                            onUpdate={() => setShowUpdateAssembly(true)}
                            onUnregister={() => void handleUnregisterAssembly()}
                        />
                    )}
                    {selectedPluginType && <PluginTypeDetails pluginType={selectedPluginType} onRegisterStep={() => setShowRegisterStep(true)} />}
                    {selectedStep && (
                        <StepDetails
                            step={selectedStep}
                            onSave={(desc) => handleSaveStepDescription(desc)}
                            onRegisterImage={() => setShowRegisterImage(true)}
                            onEnable={() => void handleEnableStep()}
                            onDisable={() => void handleDisableStep()}
                            onUnregister={() => void handleUnregisterStep()}
                            onUpdate={() => setShowUpdateStep(true)}
                        />
                    )}
                    {selectedImage && (
                        <ImageDetails
                            image={selectedImage}
                            onSave={(desc) => handleSaveImageDescription(desc)}
                            onUpdate={() => setShowUpdateImage(true)}
                            onUnregister={() => void handleUnregisterImage()}
                        />
                    )}
                    {selectedEndpoint && (
                        <ServiceEndpointDetails
                            endpoint={selectedEndpoint}
                            onSave={(desc) => handleSaveEndpointDescription(desc)}
                            onUpdate={() => setShowUpdateEndpoint(true)}
                            onUnregister={() => void handleUnregisterServiceEndpoint()}
                            onRegisterStep={() => setShowRegisterEndpointStep(true)}
                        />
                    )}
                </div>
            </div>

            {/* Bottom grid */}
            <div className="bottom-grid-section">
                <BottomGrid mode={bottomGridMode} pluginTypes={bottomPluginTypes} steps={bottomSteps} images={bottomImages} />
            </div>

            {/* Dialogs */}
            <RegisterPackageDialog
                isOpen={showRegisterPackage}
                isUpdate={false}
                onRegister={(name, uniquename, version, content) => handleCreatePackage(name, uniquename, version, content)}
                onClose={() => setShowRegisterPackage(false)}
            />
            <RegisterPackageDialog
                isOpen={showUpdatePackage}
                isUpdate={true}
                existingPackage={selectedPackage ?? undefined}
                onRegister={(name, uniquename, version, content) => handleUpdatePackage(name, uniquename, version, content)}
                onClose={() => setShowUpdatePackage(false)}
            />
            <RegisterAssemblyDialog
                isOpen={showRegisterAssembly}
                isUpdate={false}
                packages={packages}
                onCreatePackage={() => { setShowRegisterAssembly(false); setShowRegisterPackage(true); }}
                onRegister={(content, name, isolationMode, description, packageId) => handleRegisterAssembly(content, name, isolationMode, description, packageId)}
                onClose={() => setShowRegisterAssembly(false)}
            />
            <RegisterAssemblyDialog
                isOpen={showUpdateAssembly}
                isUpdate={true}
                existingAssembly={selectedAssembly ?? undefined}
                packages={packages}
                onRegister={(content, name, isolationMode, description, packageId) => handleUpdateAssembly(content, name, isolationMode, description, packageId)}
                onClose={() => setShowUpdateAssembly(false)}
            />
            {(selectedPluginType || stepPluginType) && (
                <RegisterStepDialog
                    isOpen={showRegisterStep}
                    isUpdate={false}
                    pluginType={(selectedPluginType ?? stepPluginType)!}
                    onRegister={(stepData) => handleRegisterStep(stepData)}
                    onClose={() => setShowRegisterStep(false)}
                />
            )}
            {selectedStep && stepPluginType && (
                <RegisterStepDialog
                    isOpen={showUpdateStep}
                    isUpdate={true}
                    pluginType={stepPluginType}
                    existingStep={selectedStep}
                    onRegister={(stepData) => handleUpdateStep(stepData)}
                    onClose={() => setShowUpdateStep(false)}
                />
            )}
            {selectedStep && (
                <RegisterImageDialog
                    isOpen={showRegisterImage}
                    isUpdate={false}
                    step={selectedStep}
                    onRegister={(imageData) => handleRegisterImage(imageData)}
                    onClose={() => setShowRegisterImage(false)}
                />
            )}
            {selectedImage && imageStep && (
                <RegisterImageDialog
                    isOpen={showUpdateImage}
                    isUpdate={true}
                    step={imageStep}
                    existingImage={selectedImage}
                    onRegister={(imageData) => handleUpdateImage(imageData)}
                    onClose={() => setShowUpdateImage(false)}
                />
            )}
            <RegisterServiceEndpointDialog
                isOpen={showRegisterWebhook}
                isUpdate={false}
                isWebhook={true}
                onSave={(data) => handleRegisterServiceEndpoint(data)}
                onClose={() => setShowRegisterWebhook(false)}
            />
            <RegisterServiceEndpointDialog
                isOpen={showRegisterServiceEndpoint}
                isUpdate={false}
                isWebhook={false}
                onSave={(data) => handleRegisterServiceEndpoint(data)}
                onClose={() => setShowRegisterServiceEndpoint(false)}
            />
            <RegisterServiceEndpointDialog
                isOpen={showUpdateEndpoint}
                isUpdate={true}
                isWebhook={selectedEndpoint?.contract === 8}
                existingEndpoint={selectedEndpoint ?? undefined}
                onSave={(data) => handleUpdateServiceEndpoint(data)}
                onClose={() => setShowUpdateEndpoint(false)}
            />
            {(selectedEndpoint ?? parentEndpoint) && (
                <RegisterEndpointStepDialog
                    isOpen={showRegisterEndpointStep}
                    isUpdate={false}
                    endpoint={(selectedEndpoint ?? parentEndpoint)!}
                    onRegister={(stepData) => handleRegisterEndpointStep(stepData)}
                    onClose={() => setShowRegisterEndpointStep(false)}
                />
            )}
            {selectedEndpointStep && parentEndpoint && (
                <RegisterEndpointStepDialog
                    isOpen={showUpdateEndpointStep}
                    isUpdate={true}
                    endpoint={parentEndpoint}
                    existingStep={selectedEndpointStep}
                    onRegister={(stepData) => handleUpdateEndpointStep(stepData)}
                    onClose={() => setShowUpdateEndpointStep(false)}
                />
            )}
        </div>
    );
}
