import type { TreeNode, TreeNodeType, ProcessingStep } from "../models/interfaces";

interface PluginTreeProps {
    nodes: TreeNode[];
    selectedId: string | null;
    onSelectNode: (node: TreeNode) => void;
    onToggleExpand: (nodeId: string) => void;
}

function getTypeLabel(type: TreeNodeType): string {
    switch (type) {
        case "assembly": return "Assembly";
        case "plugintype": return "Plugin";
        case "step": return "Step";
        case "image": return "Image";
    }
}

function getIconClass(node: TreeNode): string {
    if (node.type === "assembly") return "node-icon node-icon-assembly";
    if (node.type === "plugintype") {
        return node.isWorkflowActivity ? "node-icon node-icon-workflow" : "node-icon node-icon-plugin";
    }
    if (node.type === "step") {
        const step = node.data as ProcessingStep;
        return step.statecode === 0 ? "node-icon node-icon-step-enabled" : "node-icon node-icon-step-disabled";
    }
    return "node-icon node-icon-image";
}

function getIconText(node: TreeNode): string {
    if (node.type === "assembly") return "A";
    if (node.type === "plugintype") return node.isWorkflowActivity ? "W" : "P";
    if (node.type === "step") return "S";
    return "I";
}

interface FlatNodeProps {
    node: TreeNode;
    depth: number;
    selectedId: string | null;
    onSelectNode: (node: TreeNode) => void;
    onToggleExpand: (nodeId: string) => void;
}

function FlatNode({ node, depth, selectedId, onSelectNode, onToggleExpand }: FlatNodeProps) {
    const isSelected = node.id === selectedId;
    const typeLabel = getTypeLabel(node.type);

    // Images never have children.
    // For other node types: show toggle if children haven't been fetched yet (lazy load pending)
    // OR children have been fetched and there is at least one child.
    const canHaveChildren = node.type !== "image";
    const showToggle = canHaveChildren && (
        !node.childrenLoaded || (node.children?.length ?? 0) > 0
    );

    const handleToggleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleExpand(node.id);
    };

    const handleSelectClick = () => {
        onSelectNode(node);
    };

    return (
        <>
            <div
                className={`tree-node${isSelected ? " selected" : ""}`}
                style={{ paddingLeft: `${4 + depth * 18}px` }}
                onClick={handleSelectClick}
                role="treeitem"
                aria-selected={isSelected}
            >
                <span
                    className="tree-node-toggle"
                    onClick={showToggle ? handleToggleClick : undefined}
                    aria-label={showToggle ? (node.isExpanded ? "Collapse" : "Expand") : undefined}
                    style={{ cursor: showToggle ? "pointer" : "default" }}
                >
                    {showToggle ? (node.isExpanded ? "▾" : "▸") : ""}
                </span>
                <span className={getIconClass(node)} title={typeLabel}>
                    {getIconText(node)}
                </span>
                <span className="tree-node-type">({typeLabel})</span>
                <span className="tree-node-label" title={node.name}>{node.name}</span>
            </div>
            {node.isExpanded && node.children?.map((child) => (
                <FlatNode
                    key={child.id}
                    node={child}
                    depth={depth + 1}
                    selectedId={selectedId}
                    onSelectNode={onSelectNode}
                    onToggleExpand={onToggleExpand}
                />
            ))}
        </>
    );
}

export function PluginTree({ nodes, selectedId, onSelectNode, onToggleExpand }: PluginTreeProps) {
    if (nodes.length === 0) {
        return <div className="empty-tree">No assemblies found. Click Register → New Assembly to add one.</div>;
    }
    return (
        <div className="tree-container" role="tree">
            {nodes.map((node) => (
                <FlatNode
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedId}
                    onSelectNode={onSelectNode}
                    onToggleExpand={onToggleExpand}
                />
            ))}
        </div>
    );
}

