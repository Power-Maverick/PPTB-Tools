import type { StepImage } from "../models/interfaces";

interface ImageDetailsProps {
    image: StepImage;
    onUpdate: () => void;
    onUnregister: () => void;
}

const IMAGE_TYPES: Record<number, string> = { 0: "Pre Image", 1: "Post Image", 2: "Both" };

export function ImageDetails({ image, onUpdate, onUnregister }: ImageDetailsProps) {
    return (
        <div className="details-section">
            <div className="details-section-title">🖼️ Image: {image.name}</div>
            <div className="details-grid">
                <span className="detail-label">Entity Alias</span>
                <span className="detail-value">{image.entityalias}</span>
                <span className="detail-label">Image Type</span>
                <span className="detail-value">{IMAGE_TYPES[image.imagetype] ?? image.imagetype}</span>
                <span className="detail-label">Message Property</span>
                <span className="detail-value">{image.messagepropertyname}</span>
                <span className="detail-label">Attributes</span>
                <span className="detail-value">{image.attributes || <em>All</em>}</span>
                <span className="detail-label">Description</span>
                <span className="detail-value">{image.description || <em>—</em>}</span>
            </div>
            <div className="action-buttons">
                <button className="btn-primary" onClick={onUpdate}>Update Image</button>
                <button className="btn-danger" onClick={onUnregister}>Unregister Image</button>
            </div>
        </div>
    );
}
