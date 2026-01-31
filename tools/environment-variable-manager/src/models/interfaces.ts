/**
 * Environment Variable Definition from Dataverse
 */
export interface EnvironmentVariableDefinition {
    environmentvariabledefinitionid: string;
    schemaname: string;
    displayname: string;
    description?: string;
    type: number; // 100000000: String, 100000001: Number, 100000002: Boolean, 100000003: JSON
    defaultvalue?: string;
    isrequired?: boolean;
    statecode?: number;
    statuscode?: number;
    _createdby_value?: string;
    _modifiedby_value?: string;
    createdon?: string;
    modifiedon?: string;
}

/**
 * Environment Variable Value from Dataverse (per-environment values)
 */
export interface EnvironmentVariableValue {
    environmentvariablevalueid: string;
    _environmentvariabledefinitionid_value: string;
    value?: string;
    statecode?: number;
    statuscode?: number;
    _createdby_value?: string;
    _modifiedby_value?: string;
    createdon?: string;
    modifiedon?: string;
}

/**
 * Combined view of Environment Variable with its value
 */
export interface EnvironmentVariable {
    definition: EnvironmentVariableDefinition;
    value?: EnvironmentVariableValue;
    currentValue?: string; // Either value or defaultValue
    hasCustomValue: boolean; // True if there's an environment-specific value
}

/**
 * Type of environment variable
 */
export enum VariableType {
    String = 100000000,
    Number = 100000001,
    Boolean = 100000002,
    JSON = 100000003,
    DataSource = 100000004
}

/**
 * Props for various components
 */
export interface EnvironmentVariableListProps {
    variables: EnvironmentVariable[];
    selectedVariable: EnvironmentVariable | null;
    onSelectVariable: (variable: EnvironmentVariable) => void;
    onRefresh: () => void;
    onDelete: (variable: EnvironmentVariable) => void;
    loading: boolean;
}

export interface EnvironmentVariableEditorProps {
    variable: EnvironmentVariable | null;
    onSave: (variable: EnvironmentVariable, newValue: string, isDefault: boolean) => Promise<void>;
    onCreate: (schemaName: string, displayName: string, type: number, defaultValue: string, description: string) => Promise<void>;
    onClose: () => void;
    saving: boolean;
}

export interface CommandBarProps {
    onRefresh: () => void;
    onCreateNew: () => void;
    onExport?: () => void;
    onImport?: () => void;
    loading: boolean;
}
