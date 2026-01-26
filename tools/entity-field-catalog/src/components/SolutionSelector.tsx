import { Dropdown, Option, Spinner, Text, Title3, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { DataverseSolution } from "../models/interfaces";

interface SolutionSelectorProps {
    solutions: DataverseSolution[];
    selectedSolution: string;
    onSelect: (solutionName: string) => void | Promise<void>;
    isLoadingEntities: boolean;
    className?: string;
}

const useSolutionStyles = makeStyles({
    section: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
    },
    dropdown: {
        width: "100%",
    },
    helperText: {
        color: tokens.colorNeutralForeground3,
    },
    spinner: {
        display: "flex",
        justifyContent: "center",
        marginTop: "12px",
    },
});

export function SolutionSelector({ solutions, selectedSolution, onSelect, isLoadingEntities, className }: SolutionSelectorProps) {
    const styles = useSolutionStyles();

    return (
        <section className={mergeClasses(styles.section, className)}>
            <div>
                <Title3>Select Solution</Title3>
                <br />
                <Text className={styles.helperText}>Choose a Dataverse solution to load its entities.</Text>
            </div>

            <Dropdown className={styles.dropdown} placeholder="Select a solution" value={selectedSolution} onOptionSelect={(_event, data) => onSelect(data.optionValue ?? "")}>
                <Option value="">None</Option>
                {solutions.map((solution) => (
                    <Option key={solution.uniqueName} value={solution.uniqueName} text={solution.displayName}>
                        {solution.displayName} (v{solution.version})
                    </Option>
                ))}
            </Dropdown>

            {isLoadingEntities && (
                <div className={styles.spinner}>
                    <Spinner label="Loading entities" />
                </div>
            )}
        </section>
    );
}
