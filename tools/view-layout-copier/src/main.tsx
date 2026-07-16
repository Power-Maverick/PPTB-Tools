import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const applyThemeClass = (theme: string) => {
    if (theme === "dark") {
        document.body.classList.add("dark-theme");
    } else {
        document.body.classList.remove("dark-theme");
    }
};

const resolveTheme = async () => {
    if (window.toolboxAPI) {
        const currentTheme = await window.toolboxAPI.utils.getCurrentTheme();
        applyThemeClass(currentTheme);
    }
};

const themeEventHandler = (_event: any, payload: any) => {
    if (payload.event !== "settings:updated") return;

    const theme = (payload.data as { theme?: string }).theme;
    if (theme) {
        applyThemeClass(theme);
    } else {
        resolveTheme();
    }
};

const registerToolboxEvents = () => {
    if (window.toolboxAPI) {
        window.toolboxAPI.events.on(themeEventHandler);
    }
};

const bootstrap = async () => {
    // Outside PPTB during development, run against an in-memory mock so the
    // tool can be exercised locally with `npm run dev`.
    if (import.meta.env.DEV && !window.dataverseAPI) {
        const { installMockAPI } = await import("./mock/mockAPI");
        installMockAPI();
    }

    resolveTheme();
    registerToolboxEvents();

    createRoot(document.getElementById("root")!).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
};

bootstrap();
