import { useState, useEffect, useRef } from "react";
import type { SystemUser } from "../models/interfaces";
import { DataverseClient } from "../utils/DataverseClient";

interface UserPickerDialogProps {
    isOpen: boolean;
    onSelect: (user: SystemUser) => void;
    onClose: () => void;
}

const DEBOUNCE_DELAY_MS = 300;
const client = new DataverseClient();

export function UserPickerDialog({ isOpen, onSelect, onClose }: UserPickerDialogProps) {
    const [users, setUsers] = useState<SystemUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [search, setSearch] = useState("");
    const [selectedUserId, setSelectedUserId] = useState("");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadUsers = (searchTerm: string) => {
        setLoading(true);
        setLoadError("");
        client.fetchSystemUsers(searchTerm)
            .then(setUsers)
            .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!isOpen) return;
        setSearch("");
        setSelectedUserId("");
        setUsers([]);
        setLoadError("");
        loadUsers("");
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSearchChange = (value: string) => {
        setSearch(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => loadUsers(value), DEBOUNCE_DELAY_MS);
    };

    const handleConfirm = () => {
        const user = users.find((u) => u.systemuserid === selectedUserId);
        if (user) onSelect(user);
    };

    return (
        <div className="dialog-overlay" style={{ zIndex: 1100 }}>
            <div className="dialog user-picker-dialog">
                <div className="dialog-header">
                    <span className="dialog-title">Select System User</span>
                    <button className="dialog-close" onClick={onClose}>✕</button>
                </div>
                <div className="dialog-body user-picker-body">
                    <input
                        className="form-input"
                        placeholder="Search by name…"
                        value={search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        style={{ marginBottom: "8px" }}
                        autoFocus
                    />
                    {loading ? (
                        <div className="user-picker-placeholder">Loading users…</div>
                    ) : loadError ? (
                        <div className="user-picker-placeholder user-picker-error">{loadError}</div>
                    ) : (
                        <div className="user-picker-list">
                            {users.length === 0 ? (
                                <div className="user-picker-empty">No users found</div>
                            ) : (
                                users.map((user) => (
                                    <div
                                        key={user.systemuserid}
                                        className={`user-picker-item${selectedUserId === user.systemuserid ? " selected" : ""}`}
                                        onClick={() => setSelectedUserId(user.systemuserid)}
                                    >
                                        <span className="user-picker-name">{user.fullname}</span>
                                        {user.domainname && (
                                            <span className="user-picker-domain">{user.domainname}</span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <div className="dialog-footer">
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={handleConfirm}
                        disabled={!selectedUserId}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
