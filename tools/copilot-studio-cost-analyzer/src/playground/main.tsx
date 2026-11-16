import { createRoot } from "react-dom/client";
import App from "../App";
import { createPlaygroundHost } from "./mockHost";
import { createPlaygroundSession } from "./session";
import "./playground.css";

const rootElement = document.getElementById("root");
const themeSelect = document.getElementById("playground-theme");
const notification = document.getElementById("playground-notification");
if (!rootElement || !(themeSelect instanceof HTMLSelectElement) || !notification) {
    throw new Error("The playground page is missing required UI elements.");
}

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
themeSelect.value = theme;
document.documentElement.style.colorScheme = theme;
const host = createPlaygroundHost(theme, (message) => {
    notification.textContent = message;
    notification.hidden = false;
});
Object.defineProperties(window, {
    toolboxAPI: { value: host.toolbox },
    powerplatformAPI: { value: { CopilotStudio: { Raw: host.raw } } },
    azureAPI: { value: host.azure },
});
themeSelect.addEventListener("change", () => {
    params.set("theme", themeSelect.value);
    location.search = params.toString();
});
void createPlaygroundSession(host).then((initialSession) => {
    createRoot(rootElement).render(<App initialSession={initialSession} />);
}).catch((error: unknown) => {
    console.error("Could not initialize the sample reports.", error);
    notification.textContent = "The sample reports could not be loaded. Reload the playground to try again.";
    notification.hidden = false;
});
