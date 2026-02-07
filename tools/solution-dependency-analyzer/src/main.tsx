import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const applyThemeClass = (theme: string | undefined) => {
    const isDark = theme === "dark";
    document.body.classList.toggle("theme-dark", isDark);
};

const resolveTheme = async () => {
    try {
        const theme = await Promise.resolve(window.toolboxAPI?.utils?.getCurrentTheme?.());
        applyThemeClass(theme);
    } catch {
        applyThemeClass("light");
    }
};

const registerToolboxEvents = () => {
    window.toolboxAPI.events.on((event, payload) => {
        if (payload.event !== "settings:updated") return;

        const theme = (payload.data as { theme?: string }).theme;
        if (theme) {
            applyThemeClass(theme);
        } else {
            resolveTheme();
        }
    });
};

resolveTheme();
registerToolboxEvents();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
