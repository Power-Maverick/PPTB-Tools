import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const applyThemeClass = (theme: string) => {
    if (theme === "dark") {
        document.body.classList.add("dark-theme");
    } else {
        document.body.classList.remove("dark-theme");
    }
};

const resolveTheme = () => {
    if (window.toolboxAPI) {
        const currentTheme = window.toolboxAPI.utils.getCurrentTheme();
        applyThemeClass(currentTheme);
    }
};

const registerToolboxEvents = () => {
    if (window.toolboxAPI) {
        window.toolboxAPI.events.on((event, payload) => {
            if (payload.event !== "settings:updated") return;

            const theme = (payload.data as { theme?: string }).theme;
            if (theme) {
                applyThemeClass(theme);
            } else {
                resolveTheme();
            }
        });
    }
};

// Apply initial theme
resolveTheme();

// Register event handler
registerToolboxEvents();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
