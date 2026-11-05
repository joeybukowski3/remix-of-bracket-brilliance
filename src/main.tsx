import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { reloadForNewDeploy } from "./lib/chunkRecovery";
import "./index.css";

// A deploy replaces the hashed chunks; a page opened before it then fails to load a lazy route. Reload once to pick up the new
// shell (guarded, see lib/chunkRecovery.ts). If the guard holds the reload back, the error reaches the ErrorBoundary as before.
window.addEventListener("vite:preloadError", () => {
  reloadForNewDeploy();
});

createRoot(document.getElementById("root")!).render(<App />);
