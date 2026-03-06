import type { PluginType, ProcessingStep, StepImage } from "../models/interfaces";

interface BottomGridProps {
    mode: "plugins" | "steps" | "images" | "none";
    pluginTypes: PluginType[];
    steps: ProcessingStep[];
    images: StepImage[];
}

const STAGES: Record<number, string> = { 10: "Pre-Validation", 20: "Pre-Operation", 40: "Post-Operation" };
const MODES: Record<number, string> = { 0: "Synchronous", 1: "Asynchronous" };
const IMAGE_TYPES: Record<number, string> = { 0: "Pre Image", 1: "Post Image", 2: "Both" };

export function BottomGrid({ mode, pluginTypes, steps, images }: BottomGridProps) {
    if (mode === "none") {
        return <div className="bottom-empty">Select an item in the tree to see details.</div>;
    }

    if (mode === "plugins") {
        return (
            <table className="bottom-table">
                <thead>
                    <tr>
                        <th>FriendlyName</th>
                        <th>TypeName</th>
                        <th>WorkflowActivityGroupName</th>
                        <th>Description</th>
                        <th>ModifiedOn</th>
                    </tr>
                </thead>
                <tbody>
                    {pluginTypes.length === 0 ? (
                        <tr><td colSpan={5} className="bottom-empty-cell">No plugin types found.</td></tr>
                    ) : pluginTypes.map((pt) => (
                        <tr key={pt.plugintypeid}>
                            <td>{pt.friendlyname || "—"}</td>
                            <td>{pt.typename}</td>
                            <td>{pt.workflowactivitygroupname || "—"}</td>
                            <td>{pt.description || "—"}</td>
                            <td>{pt.modifiedon || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }

    if (mode === "steps") {
        return (
            <table className="bottom-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Message</th>
                        <th>Primary Entity</th>
                        <th>Stage</th>
                        <th>Mode</th>
                        <th>Rank</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {steps.length === 0 ? (
                        <tr><td colSpan={7} className="bottom-empty-cell">No steps registered.</td></tr>
                    ) : steps.map((s) => (
                        <tr key={s.sdkmessageprocessingstepid}>
                            <td>{s.name}</td>
                            <td>{s.messageName}</td>
                            <td>{s.primaryEntityName || "none"}</td>
                            <td>{STAGES[s.stage] ?? s.stage}</td>
                            <td>{MODES[s.mode] ?? s.mode}</td>
                            <td>{s.rank}</td>
                            <td>
                                <span className={`badge ${s.statecode === 0 ? "badge-success" : "badge-danger"}`}>
                                    {s.statecode === 0 ? "Enabled" : "Disabled"}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }

    if (mode === "images") {
        return (
            <table className="bottom-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Entity Alias</th>
                        <th>Image Type</th>
                        <th>Message Property</th>
                        <th>Attributes</th>
                    </tr>
                </thead>
                <tbody>
                    {images.length === 0 ? (
                        <tr><td colSpan={5} className="bottom-empty-cell">No images registered.</td></tr>
                    ) : images.map((img) => (
                        <tr key={img.sdkmessageprocessingstepimageid}>
                            <td>{img.name}</td>
                            <td>{img.entityalias}</td>
                            <td>{IMAGE_TYPES[img.imagetype] ?? img.imagetype}</td>
                            <td>{img.messagepropertyname}</td>
                            <td>{img.attributes || <em>All</em>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }

    return null;
}
