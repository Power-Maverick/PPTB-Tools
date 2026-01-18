import styles from "./ProjectPathPicker.module.css";

interface ProjectPathPickerProps {
  label: string;
  value: string;
  placeholder?: string;
  helperText?: string;
  onChange: (value: string) => void;
  onBrowse: () => void | Promise<void>;
}

export function ProjectPathPicker({
  label,
  value,
  placeholder,
  helperText,
  onChange,
  onBrowse,
}: ProjectPathPickerProps) {
  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor="projectPath">
        {label}
      </label>
      <div className={styles.row}>
        <input
          id="projectPath"
          className={styles.input}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" className="btn btn-ghost" onClick={onBrowse}>
          Browse
        </button>
      </div>
      {helperText && <p className={styles.helper}>{helperText}</p>}
    </div>
  );
}
