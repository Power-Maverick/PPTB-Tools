import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssemblyDetails } from "./components/AssemblyDetails";
import { BottomGrid } from "./components/BottomGrid";
import { ImageDetails } from "./components/ImageDetails";
import { PluginTree } from "./components/PluginTree";
import { PluginTypeDetails } from "./components/PluginTypeDetails";
import { RegisterAssemblyDialog } from "./components/RegisterAssemblyDialog";
import { RegisterImageDialog } from "./components/RegisterImageDialog";
import { RegisterStepDialog } from "./components/RegisterStepDialog";
import { StepDetails } from "./components/StepDetails";
import type { PluginAssembly, PluginType, ProcessingStep, StepImage, TreeNode } from "./models/interfaces";
import { DataverseClient } from "./utils/DataverseClient";

const client = new DataverseClient();

function buildTreeNodes(
    assemblies: PluginAssembly[],
    pluginTypes: Map<string, PluginType[]>,
    steps: Map<string, ProcessingStep[]>,
    images: Map<string, StepImage[]>,
    expandedIds: Set<string>,
): TreeNode[] {
    return assemblies.map((asm) => {
        const types = pluginTypes.get(asm.pluginassemblyid) ?? [];
        const typeNodes: TreeNode[] = types.map((pt) => {
            const ptSteps = steps.get(pt.plugintypeid) ?? [];
            const stepNodes: TreeNode[] = ptSteps.map((step) => {
                const stepImages = images.get(step.sdkmessageprocessingstepid) ?? [];
                const imageNodes: TreeNode[] = stepImages.map((img) => ({
                    id: img.sdkmessageprocessingstepimageid,
                    type: "image",
                    name: img.name,
                    data: img,
                }));
                return {
                    id: step.sdkmessageprocessingstepid,
                    type: "step",
                    name: step.name,
                    data: step,
                    children: imageNodes,
                    isExpanded: expandedIds.has(step.sdkmessageprocessingstepid),
                    childrenLoaded: images.has(step.sdkmessageprocessingstepid),
                };
            });
            return {
                id: pt.plugintypeid,
                type: "plugintype",
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
            type: "assembly",
            name: asm.name,
            data: asm,
            children: typeNodes,
            isExpanded: expandedIds.has(asm.pluginassemblyid),
            childrenLoaded: pluginTypes.has(asm.pluginassemblyid),
        };
    });
}

export default function App() {
    const [isPPTB, setIsPPTB] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Data maps
    const [assemblies, setAssemblies] = useState<PluginAssembly[]>([]);
    const [pluginTypes, setPluginTypes] = useState<Map<string, PluginType[]>>(new Map());
    const [steps, setSteps] = useState<Map<string, ProcessingStep[]>>(new Map());
    const [images, setImages] = useState<Map<string, StepImage[]>>(new Map());

    // Tree state
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

    // Register dropdown
    const [showRegisterDropdown, setShowRegisterDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Dialog state
    const [showRegisterAssembly, setShowRegisterAssembly] = useState(false);
    const [showUpdateAssembly, setShowUpdateAssembly] = useState(false);
    const [showRegisterStep, setShowRegisterStep] = useState(false);
    const [showUpdateStep, setShowUpdateStep] = useState(false);
    const [showRegisterImage, setShowRegisterImage] = useState(false);
    const [showUpdateImage, setShowUpdateImage] = useState(false);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowRegisterDropdown(false);
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

    const loadAssemblies = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await client.fetchAssemblies();
            setAssemblies(data);
            setPluginTypes(new Map());
            setSteps(new Map());
            setImages(new Map());
            setSelectedNode(null);
            setExpandedIds(new Set());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isPPTB) {
            void loadAssemblies();
        }
    }, [isPPTB, loadAssemblies]);

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
            }
        },
        [pluginTypes, steps, images],
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
        },
        [assemblies, pluginTypes, steps, images],
    );

    const notify = (message: string, type: "success" | "error" = "success") => {
        if (window.toolboxAPI) {
            void window.toolboxAPI.utils.showNotification({ title: type === "success" ? "Success" : "Error", body: message, type });
        }
    };

    // ── Assembly actions ──
    const handleRegisterAssembly = async (content: string, name: string, isolationMode: number, description: string) => {
        try {
            await client.registerAssembly(content, name, isolationMode, description);
            notify("Assembly registered successfully.");
            setShowRegisterAssembly(false);
            void loadAssemblies();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
            throw err; // re-throw so dialog can show inline error
        }
    };

    const handleUpdateAssembly = async (content: string, _name: string, _isolationMode: number, description: string) => {
        if (selectedNode?.type !== "assembly") return;
        const asm = selectedNode.data as PluginAssembly;
        try {
            await client.updateAssembly(asm.pluginassemblyid, description, content);
            notify("Assembly updated.");
            setShowUpdateAssembly(false);
            void loadAssemblies();
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
            void loadAssemblies();
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
            void loadAssemblies();
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
        }
    };

    // ── Step actions ──
    const getSelectedPluginType = (): PluginType | null => {
        if (selectedNode?.type === "plugintype") return selectedNode.data as PluginType;
        return null;
    };

    const handleRegisterStep = async (stepData: Partial<ProcessingStep> & { messageId: string; filterId?: string; pluginTypeId: string }) => {
        try {
            await client.registerStep(stepData);
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

    const handleUpdateStep = async (stepData: Partial<ProcessingStep> & { messageId: string; filterId?: string; pluginTypeId: string }) => {
        if (selectedNode?.type !== "step") return;
        const step = selectedNode.data as ProcessingStep;
        try {
            await client.updateStep(step.sdkmessageprocessingstepid, stepData);
            notify("Step updated.");
            setShowUpdateStep(false);
            const ptId = step.plugintypeid ?? stepData.pluginTypeId;
            if (ptId) {
                const s = await client.fetchSteps(ptId);
                setSteps((prev: Map<string, ProcessingStep[]>) => new Map(prev).set(ptId, s));
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
            }
        } catch (err: unknown) {
            notify(err instanceof Error ? err.message : String(err), "error");
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
    const selectedPluginType = getSelectedPluginType();
    const selectedStep = selectedNode?.type === "step" ? (selectedNode.data as ProcessingStep) : null;
    const selectedImage = selectedNode?.type === "image" ? (selectedNode.data as StepImage) : null;

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
    const canUpdate = !!(selectedAssembly || selectedStep || selectedImage);
    const canUnregister = !!(selectedAssembly || selectedStep || selectedImage);
    const canRegisterStep = !!(selectedPluginType && !selectedPluginType.isworkflowactivity);
    const canRegisterImage = !!selectedStep;
    const isStepSelected = !!selectedStep;
    const stepIsEnabled = selectedStep?.statecode === 0;

    const handleUpdateSelected = () => {
        if (selectedAssembly) setShowUpdateAssembly(true);
        else if (selectedStep) setShowUpdateStep(true);
        else if (selectedImage) setShowUpdateImage(true);
    };

    const handleUnregisterSelected = () => {
        if (selectedAssembly) void handleUnregisterAssembly();
        else if (selectedStep) void handleUnregisterStep();
        else if (selectedImage) void handleUnregisterImage();
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

    const treeNodes = buildTreeNodes(assemblies, pluginTypes, steps, images, expandedIds);

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
                    <button className="toolbar-btn" onClick={() => void loadAssemblies()} disabled={loading}>
                        {loading ? "Refreshing…" : "Refresh"}
                    </button>
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
            </div>

            {/* Page subtitle */}
            <div className="page-subtitle">Registered Plugins &amp; Custom Workflow Activities</div>

            {/* Error banner */}
            {error && isPPTB && <div className="error-banner">⚠️ {error}</div>}

            {/* Content area: tree + details */}
            <div className="content-area">
                {/* Left: tree */}
                <div className="left-panel">
                    <PluginTree nodes={treeNodes} selectedId={selectedNode?.id ?? null} onSelectNode={(node) => void handleSelectNode(node)} onToggleExpand={(id) => void handleToggleExpand(id)} />
                </div>

                {/* Right: details */}
                <div className="right-panel">
                    {!selectedNode && <div className="details-placeholder">Select an item from the tree to view its properties.</div>}
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
                </div>
            </div>

            {/* Bottom grid */}
            <div className="bottom-grid-section">
                <BottomGrid mode={bottomGridMode} pluginTypes={bottomPluginTypes} steps={bottomSteps} images={bottomImages} />
            </div>

            {/* Dialogs */}
            <RegisterAssemblyDialog
                isOpen={showRegisterAssembly}
                isUpdate={false}
                onRegister={(content, name, isolationMode, description) => handleRegisterAssembly(content, name, isolationMode, description)}
                onClose={() => setShowRegisterAssembly(false)}
            />
            <RegisterAssemblyDialog
                isOpen={showUpdateAssembly}
                isUpdate={true}
                existingAssembly={selectedAssembly ?? undefined}
                onRegister={(content, name, isolationMode, description) => handleUpdateAssembly(content, name, isolationMode, description)}
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
        </div>
    );
}
