import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

export const useAppStyles = makeStyles({
  root: {
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.padding("24px"),
  },
  surface: {
    maxWidth: "1160px",
    margin: "0 auto",
    minHeight: "calc(100vh - 48px)",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  loading: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  board: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: "16px",
  },
  panel: {
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    ...shorthands.padding("18px"),
    boxShadow: tokens.shadow4,
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    minHeight: 0,
  },
  placeholder: {
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.padding("16px"),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
  },
  bannerSpace: {
    marginBottom: "8px",
  },
});
