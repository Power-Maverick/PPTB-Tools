import { FluentProvider, webLightTheme, webDarkTheme } from "@fluentui/react-components";
import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

function Root() {
  const [theme, setTheme] = useState(webLightTheme);

  useEffect(() => {
    const applyTheme = (themeName: string) => {
      setTheme(themeName === "dark" ? webDarkTheme : webLightTheme);
    };

    const resolveTheme = async () => {
      if (window.toolboxAPI) {
        const currentTheme = await window.toolboxAPI.utils.getCurrentTheme();
        applyTheme(currentTheme);
      }
    };

    const eventHandler = (_event: any, payload: any) => {
      if (payload.event !== "settings:updated") return;

      const themeName = (payload.data as { theme?: string }).theme;
      if (themeName) {
        applyTheme(themeName);
      } else {
        resolveTheme();
      }
    };

    // Apply initial theme
    resolveTheme();

    // Register event handler
    if (window.toolboxAPI) {
      window.toolboxAPI.events.on(eventHandler);
    }

    // Cleanup function
    return () => {
      if (window.toolboxAPI) {
        window.toolboxAPI.events.off(eventHandler);
      }
    };
  }, []);

  return (
    <FluentProvider theme={theme}>
      <App />
    </FluentProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
