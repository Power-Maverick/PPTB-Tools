import {
  Text,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from "@fluentui/react-components";

interface StatusBannerProps {
  type: "error" | "info";
  message: string;
  className?: string;
}

const useBannerStyles = makeStyles({
  root: {
    ...shorthands.padding("12px"),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  error: {
    backgroundColor: tokens.colorPaletteRedBackground3,
    color: tokens.colorPaletteRedForeground2,
  },
  info: {
    backgroundColor: tokens.colorPaletteBlueBackground2,
    color: tokens.colorNeutralForeground2,
  },
});

export function StatusBanner({ type, message, className }: StatusBannerProps) {
  const styles = useBannerStyles();
  const appearanceClass = type === "error" ? styles.error : styles.info;

  return (
    <div
      className={mergeClasses(styles.root, appearanceClass, className)}
      role="status"
    >
      <Text weight="semibold">{message}</Text>
    </div>
  );
}
