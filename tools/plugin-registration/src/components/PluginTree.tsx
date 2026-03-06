import type { TreeNode } from "../models/interfaces";

interface PluginTreeProps {
    nodes: TreeNode[];
    selectedId: string | null;
    onSelectNode: (node: TreeNode) => void;
    onToggleExpand: (nodeId: string) => void;
}

const NODE_ICONS: Record<string, string> = {
    assembly: "🔧",
    plugintype: "⚙️",
    step: "📋",
    image: "🖼️",
};

interface FlatNodeProps {
    node: TreeNode;
    depth: number;
    selectedId: string | null;
    onSelectNode: (node: TreeNode) => void;
    onToggleExpand: (nodeId: string) => void;
}

function FlatNode({ node, depth, selectedId, onSelectNode, onToggleExpand }: FlatNodeProps) {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = node.id === selectedId;
    const icon = NODE_ICONS[node.type] ?? "•";

    const handleClick = () => {
        onSelectNode(node);
        if (hasChildren) {
            onToggleExpand(node.id);
        }
    };

    return (
        <>
            <div
                className={`tree-node${isSelected ? " selected" : ""}`}
                style={{ paddingLeft: `${8 + depth * 16}px` }}
                onClick={handleClick}
                role="treeitem"
                aria-selected={isSelected}
            >
                <span className="tree-node-toggle">
                    {hasChildren ? (node.isExpanded ? "▾" : "▸") : ""}
                </span>
                <span className="tree-node-icon">{icon}</span>
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
        return <div className="empty-tree">No assemblies found.</div>;
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
