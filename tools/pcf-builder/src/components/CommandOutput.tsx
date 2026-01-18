import styles from "./CommandOutput.module.css";

interface CommandOutputProps {
  output: string;
}

export function CommandOutput({ output }: CommandOutputProps) {
  return (
    <section className={styles.console}>
      <div className={styles.header}>Command Output</div>
      <pre className={styles.body}>
        {output.trim().length > 0
          ? output
          : "Run any action to see logs, build output, or deployment status."}
      </pre>
    </section>
  );
}
