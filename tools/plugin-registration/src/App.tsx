import { useEffect, useState, useCallback } from "react";
import type { TreeNode, PluginAssembly, PluginType, ProcessingStep, StepImage } from "./models/interfaces";
import { DataverseClient } from "./utils/DataverseClient";
import { PluginTree } from "./components/PluginTree";
import { AssemblyDetails } from "./components/AssemblyDetails";
import { PluginTypeDetails } from "./components/PluginTypeDetails";
import { StepDetails } from "./components/StepDetails";
import { ImageDetails } from "./components/ImageDetails";
import { RegisterAssemblyDialog } from "./components/RegisterAssemblyDialog";
import { RegisterStepDialog } from "./components/RegisterStepDialog";
import { RegisterImageDialog } from "./components/RegisterImageDialog";

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
            };
        });
        return {
            id: asm.pluginassemblyid,
            type: "assembly",
            name: asm.name,
            data: asm,
            children: typeNodes,
            isExpanded: expandedIds.has(asm.pluginassemblyid),
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

    // Dialog state
    const [showRegisterAssembly, setShowRegisterAssembly] = useState(false);
    const [showUpdateAssembly, setShowUpdateAssembly] = useState(false);
    const [showRegisterStep, setShowRegisterStep] = useState(false);
    const [showUpdateStep, setShowUpdateStep] = useState(false);
    const [showRegisterImage, setShowRegisterImage] = useState(false);
    const [showUpdateImage, setShowUpdateImage] = useState(false);

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
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isPPTB) {
            void loadAssemblies();
        }
    }, [isPPTB, loadAssemblies]);

    const handleToggleExpand = useCallback(async (nodeId: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) { next.delete(nodeId); }
            else { next.add(nodeId); }
            return next;
        });

        // Lazy-load children
        const asm = assemblies.find((a) => a.pluginassemblyid === nodeId);
        if (asm && !pluginTypes.has(nodeId)) {
            try {
                const types = await client.fetchPluginTypes(nodeId);
                setPluginTypes((prev) => new Map(prev).set(nodeId, types));
            } catch (err: unknown) {
                console.error(err);
            }
        }

        // Find plugin type
        for (const [, pts] of pluginTypes) {
            const pt = pts.find((p) => p.plugintypeid === nodeId);
            if (pt && !steps.has(nodeId)) {
                try {
                    const s = await client.fetchSteps(nodeId);
                    setSteps((prev) => new Map(prev).set(nodeId, s));
                } catch (err: unknown) {
                    console.error(err);
                }
                break;
            }
        }

        // Find step
        for (const [, ss] of steps) {
            const step = ss.find((s) => s.sdkmessageprocessingstepid === nodeId);
            if (step && !images.has(nodeId)) {
                try {
                    const imgs = await client.fetchImages(nodeId);
                    setImages((prev) => new Map(prev).set(nodeId, imgs));
                } catch (err: unknown) {
                    console.error(err);
                }
                break;
            }
        }
    }, [assemblies, pluginTypes, steps, images]);

    const notify = (message: string, type: "success" | "error" = "success") => {
        if (window.toolboxAPI) {
            void window.toolboxAPI.utils.showNotification({ title: type === "success" ? "Success" : "Error", body: message, type });
        }
    };

    // --- Assembly actions ---
    const handleRegisterAssembly = async (content: string, name: string, isolationMode: number, description: string) => {
        await client.registerAssembly(content, name, isolationMode, description);
        notify("Assembly registered successfully.");
        setShowRegisterAssembly(false);
        void loadAssemblies();
    };

    const handleUpdateAssembly = async (content: string, name: string, _isolationMode: number, description: string) => {
        if (selectedNode?.type !== "assembly") return;
        const asm = selectedNode.data as PluginAssembly;
        await client.updateAssembly(asm.pluginassemblyid, content, description);
        notify(`Assembly "${name}" updated.`);
        setShowUpdateAssembly(false);
        void loadAssemblies();
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
            const msg = err instanceof Error ? err.message : String(err);
            notify(msg, "error");
        }
    };

    // --- Step actions ---
    const getSelectedPluginType = (): PluginType | null => {
        if (selectedNode?.type === "plugintype") return selectedNode.data as PluginType;
        return null;
    };

    const handleRegisterStep = async (stepData: Partial<ProcessingStep> & { messageId: string; filterId?: string; pluginTypeId: string }) => {
        await client.registerStep(stepData);
        notify("Step registered successfully.");
        setShowRegisterStep(false);
        // Refresh steps for the plugin type
        const ptId = stepData.pluginTypeId;
        const s = await client.fetchSteps(ptId);
        setSteps((prev) => new Map(prev).set(ptId, s));
    };

    const handleUpdateStep = async (stepData: Partial<ProcessingStep> & { messageId: string; filterId?: string; pluginTypeId: string }) => {
        if (selectedNode?.type !== "step") return;
        const step = selectedNode.data as ProcessingStep;
        await client.updateStep(step.sdkmessageprocessingstepid, stepData);
        notify("Step updated.");
        setShowUpdateStep(false);
        const ptId = step.plugintypeid ?? stepData.pluginTypeId;
        if (ptId) {
            const s = await client.fetchSteps(ptId);
            setSteps((prev) => new Map(prev).set(ptId, s));
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
                setSteps((prev) => new Map(prev).set(ptId, s));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            notify(msg, "error");
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
                setSteps((prev) => new Map(prev).set(ptId, s));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            notify(msg, "error");
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
                setSteps((prev) => new Map(prev).set(ptId, s));
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            notify(msg, "error");
        }
    };

    // --- Image actions ---
    const handleRegisterImage = async (imageData: Partial<StepImage> & { stepId: string }) => {
        await client.registerImage(imageData);
        notify("Image registered.");
        setShowRegisterImage(false);
        const imgs = await client.fetchImages(imageData.stepId);
        setImages((prev) => new Map(prev).set(imageData.stepId, imgs));
    };

    const handleUpdateImage = async (imageData: Partial<StepImage> & { stepId: string }) => {
        if (selectedNode?.type !== "image") return;
        const img = selectedNode.data as StepImage;
        await client.updateImage(img.sdkmessageprocessingstepimageid, imageData);
        notify("Image updated.");
        setShowUpdateImage(false);
        const imgs = await client.fetchImages(imageData.stepId);
        setImages((prev) => new Map(prev).set(imageData.stepId, imgs));
    };

    const handleUnregisterImage = async () => {
        if (selectedNode?.type !== "image") return;
        const img = selectedNode.data as StepImage;
        if (!window.confirm(`Unregister image "${img.name}"?`)) return;
        try {
            await client.deleteImage(img.sdkmessageprocessingstepimageid);
            notify("Image unregistered.");
            setSelectedNode(null);
            const stepId = img.sdkmessageprocessingstepid;
            const imgs = await client.fetchImages(stepId);
            setImages((prev) => new Map(prev).set(stepId, imgs));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            notify(msg, "error");
        }
    };

    const treeNodes = buildTreeNodes(assemblies, pluginTypes, steps, images, expandedIds);

    if (loading) {
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

    const selectedAssembly = selectedNode?.type === "assembly" ? (selectedNode.data as PluginAssembly) : null;
    const selectedPluginType = getSelectedPluginType();
    const selectedStep = selectedNode?.type === "step" ? (selectedNode.data as ProcessingStep) : null;
    const selectedImage = selectedNode?.type === "image" ? (selectedNode.data as StepImage) : null;

    // Find the plugin type for a selected step (for RegisterStepDialog)
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

    return (
        <div className="layout">
            {/* Left panel */}
            <div className="left-panel">
                <div className="toolbar">
                    <span className="toolbar-title">Plugin Registration</span>
                    <button className="btn-secondary" onClick={() => void loadAssemblies()} title="Refresh">
                        🔄 Refresh
                    </button>
                    <button className="btn-primary" onClick={() => setShowRegisterAssembly(true)}>
                        + Assembly
                    </button>
                    {(selectedPluginType && !selectedPluginType.isworkflowactivity) && (
                        <button className="btn-primary" onClick={() => setShowRegisterStep(true)}>
                            + Step
                        </button>
                    )}
                </div>
                {error && (
                    <div style={{ padding: "8px", color: "var(--button-danger-bg)", fontSize: 12 }}>
                        ⚠️ {error}
                    </div>
                )}
                <PluginTree
                    nodes={treeNodes}
                    selectedId={selectedNode?.id ?? null}
                    onSelectNode={setSelectedNode}
                    onToggleExpand={(id) => void handleToggleExpand(id)}
                />
            </div>

            {/* Right panel */}
            <div className="right-panel">
                {!selectedNode && (
                    <div className="details-placeholder">
                        Select an item from the tree to see its details.
                    </div>
                )}
                {selectedAssembly && (
                    <AssemblyDetails
                        assembly={selectedAssembly}
                        onUpdate={() => setShowUpdateAssembly(true)}
                        onUnregister={() => void handleUnregisterAssembly()}
                    />
                )}
                {selectedPluginType && (
                    <PluginTypeDetails
                        pluginType={selectedPluginType}
                        onRegisterStep={() => setShowRegisterStep(true)}
                    />
                )}
                {selectedStep && (
                    <StepDetails
                        step={selectedStep}
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
                        onUpdate={() => setShowUpdateImage(true)}
                        onUnregister={() => void handleUnregisterImage()}
                    />
                )}
            </div>

            {/* Dialogs */}
            <RegisterAssemblyDialog
                isOpen={showRegisterAssembly}
                isUpdate={false}
                onRegister={(content, name, isolationMode, description) =>
                    handleRegisterAssembly(content, name, isolationMode, description)
                }
                onClose={() => setShowRegisterAssembly(false)}
            />
            <RegisterAssemblyDialog
                isOpen={showUpdateAssembly}
                isUpdate={true}
                existingAssembly={selectedAssembly ?? undefined}
                onRegister={(content, name, isolationMode, description) =>
                    handleUpdateAssembly(content, name, isolationMode, description)
                }
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
            {selectedImage && selectedStep && (
                <RegisterImageDialog
                    isOpen={showUpdateImage}
                    isUpdate={true}
                    step={selectedStep}
                    existingImage={selectedImage}
                    onRegister={(imageData) => handleUpdateImage(imageData)}
                    onClose={() => setShowUpdateImage(false)}
                />
            )}
        </div>
    );
}
