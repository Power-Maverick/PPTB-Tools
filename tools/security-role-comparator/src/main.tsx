import { FluentProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

function Root() {
    const [theme, setTheme] = useState(webLightTheme);

    useEffect(() => {
        const applyTheme = (themeName: string) => {
            setTheme(themeName === "dark" ? webDarkTheme : webLightTheme);
            if (themeName === "dark") {
                document.body.classList.add("dark-theme");
            } else {
                document.body.classList.remove("dark-theme");
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

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <Root />
    </StrictMode>,
);
