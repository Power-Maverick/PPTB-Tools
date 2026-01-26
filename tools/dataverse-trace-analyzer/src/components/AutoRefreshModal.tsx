import { useState } from "react";

interface AutoRefreshModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentMode: 'off' | 'auto' | 'notify';
    onSave: (mode: 'off' | 'auto' | 'notify', intervalSeconds: number) => void;
    currentInterval: number;
}

export function AutoRefreshModal({ 
    isOpen, 
    onClose, 
    currentMode, 
    onSave,
    currentInterval 
}: AutoRefreshModalProps) {
    const [selectedMode, setSelectedMode] = useState<'off' | 'auto' | 'notify'>(currentMode);
    const [interval, setInterval] = useState<number>(currentInterval);

    if (!isOpen) return null;

    const handleSave = () => {
        if (selectedMode !== 'off' && interval < 10) {
            alert('Interval must be at least 10 seconds');
            return;
        }
        onSave(selectedMode, interval);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content auto-refresh-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Auto-Refresh Settings</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    <div className="form-group">
                        <label className="form-label">Auto-Refresh Mode:</label>
                        <div className="radio-group">
                            <label className="radio-option">
                                <input 
                                    type="radio" 
                                    name="refreshMode" 
                                    value="off"
                                    checked={selectedMode === 'off'}
                                    onChange={() => setSelectedMode('off')}
                                />
                                <span>Off</span>
                                <small>No automatic refresh</small>
                            </label>
                            <label className="radio-option">
                                <input 
                                    type="radio" 
                                    name="refreshMode" 
                                    value="auto"
                                    checked={selectedMode === 'auto'}
                                    onChange={() => setSelectedMode('auto')}
                                />
                                <span>Auto</span>
                                <small>Silently refresh logs in background</small>
                            </label>
                            <label className="radio-option">
                                <input 
                                    type="radio" 
                                    name="refreshMode" 
                                    value="notify"
                                    checked={selectedMode === 'notify'}
                                    onChange={() => setSelectedMode('notify')}
                                />
                                <span>Notify</span>
                                <small>Show PPTB notification when new logs found</small>
                            </label>
                        </div>
                    </div>

                    {selectedMode !== 'off' && (
                        <div className="form-group">
                            <label className="form-label" htmlFor="interval">
                                Refresh Interval (seconds):
                            </label>
                            <input
                                id="interval"
                                type="number"
                                className="form-control"
                                value={interval}
                                onChange={(e) => setInterval(parseInt(e.target.value) || 30)}
                                min="10"
                                max="300"
                                step="10"
                            />
                            <small className="form-hint">Minimum 10 seconds, Maximum 300 seconds (5 minutes)</small>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
}
