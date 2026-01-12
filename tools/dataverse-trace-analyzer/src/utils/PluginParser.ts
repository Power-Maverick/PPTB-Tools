/**
 * Parses plugin typename string to extract step, assembly, and version information
 * Format: "StepName, AssemblyName, Version=x.x.x.x, Culture=neutral, PublicKeyToken=xxxxx"
 * Example: "PowerTips.Demo.Plugin1, PowerTips.Demo, Version=1.0.0.0, Culture=neutral, PublicKeyToken=9643db7b950e23d1"
 */
export interface PluginInfo {
    step: string;
    assembly: string;
    version: string;
}

export function parsePluginTypeName(typename: string): PluginInfo {
    if (!typename) {
        return {
            step: "Unknown",
            assembly: "Unknown",
            version: "Unknown"
        };
    }

    // Split by comma and trim each part
    const parts = typename.split(',').map(p => p.trim());
    
    // First part is the step name (full type name)
    const step = parts[0] || "Unknown";
    
    // Second part is the assembly name
    const assembly = parts[1] || "Unknown";
    
    // Find the Version part
    let version = "Unknown";
    for (const part of parts) {
        if (part.startsWith("Version=")) {
            version = part.substring("Version=".length);
            break;
        }
    }

    return {
        step,
        assembly,
        version
    };
}
