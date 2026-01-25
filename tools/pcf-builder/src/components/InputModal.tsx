import { FormEvent, useEffect, useRef, useState } from "react";

interface InputModalProps {
    title: string;
    message?: string;
    initialValue?: string;
    placeholder?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onSubmit: (value: string) => void;
    onCancel: () => void;
}

export function InputModal({
    title,
    message,
    initialValue,
    placeholder,
    confirmLabel = "OK",
    cancelLabel = "Cancel",
    onSubmit,
    onCancel,
}: InputModalProps) {
    const [value, setValue] = useState(initialValue ?? "");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        onSubmit(value.trim());
    };

    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card">
                <header className="modal-header">
                    <h3>{title}</h3>
                    {message && <p>{message}</p>}
                </header>
                <form onSubmit={handleSubmit} className="modal-body">
                    <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        placeholder={placeholder}
                        onChange={(event) => setValue(event.target.value)}
                    />
                    <div className="modal-actions">
                        <button type="button" className="btn btn-ghost" onClick={onCancel}>
                            {cancelLabel}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
                            {confirmLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
