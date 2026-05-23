import { SettingRow } from "./SettingRow";

interface BoolSettingRowProps {
    label: string;
    hint: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}

export function BoolSettingRow({ label, hint, checked, onChange }: BoolSettingRowProps) {
    return (
        <SettingRow label={label} hint={hint}>
            <label className="form-checkbox">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                Enabled
            </label>
        </SettingRow>
    );
}
