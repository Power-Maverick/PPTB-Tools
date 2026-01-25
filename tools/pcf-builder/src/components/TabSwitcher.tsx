import styles from "./TabSwitcher.module.css";

export interface TabDefinition {
    id: string;
    label: string;
    description?: string;
}

interface TabSwitcherProps {
    tabs: TabDefinition[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
    workspacePath?: string;
}

export function TabSwitcher({ tabs, activeTab, onTabChange, workspacePath }: TabSwitcherProps) {
    const workspaceLabel = workspacePath?.trim() ? workspacePath : "No workspace selected";

    return (
        <div className={styles.tabShell}>
            <div className={styles.tabStrip} role="tablist">
                {tabs.map((tab) => {
                    const isActive = tab.id === activeTab;
                    return (
                        <button key={tab.id} className={`${styles.tabButton} ${isActive ? styles.active : ""}`} type="button" role="tab" aria-selected={isActive} onClick={() => onTabChange(tab.id)}>
                            <span className={styles.tabLabel}>{tab.label}</span>
                            {tab.description && <span className={styles.tabDescription}>{tab.description}</span>}
                        </button>
                    );
                })}
            </div>

            <div className={styles.workspaceBadge} title={workspaceLabel}>
                <span>Workspace</span>
                <strong>{workspaceLabel}</strong>
            </div>
        </div>
    );
}
