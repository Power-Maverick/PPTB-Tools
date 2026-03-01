import { FluentProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

function Root() {
    const [theme, setTheme] = useState(webLightTheme);

    useEffect(() => {
        const applyTheme = (themeName: string) => {
            const isDark = themeName === "dark";
            setTheme(isDark ? webDarkTheme : webLightTheme);

            if (isDark) {
                document.body.classList.add("dark-theme");
                document.body.classList.add("theme-dark");
            } else {
                document.body.classList.remove("dark-theme");
                document.body.classList.remove("theme-dark");
            }
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

        resolveTheme();

        if (window.toolboxAPI) {
            window.toolboxAPI.events.on(eventHandler);
        }

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

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
    <StrictMode>
        <Root />
    </StrictMode>,
);
