import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { APP_BUILD_HASH, APP_BUILD_LABEL } from "./lib/buildInfo";

console.info(`[build] ${APP_BUILD_LABEL}`);

const buildMarker = document.createElement("div");
buildMarker.setAttribute("aria-label", `Build ${APP_BUILD_HASH}`);
buildMarker.textContent = APP_BUILD_HASH;
Object.assign(buildMarker.style, {
  position: "fixed",
  left: "max(4px, env(safe-area-inset-left))",
  bottom: "max(4px, env(safe-area-inset-bottom))",
  zIndex: "2147483647",
  padding: "2px 4px",
  borderRadius: "4px",
  fontSize: "9px",
  lineHeight: "1",
  letterSpacing: "0",
  color: "hsl(var(--muted-foreground))",
  background: "hsl(var(--background) / 0.55)",
  pointerEvents: "none",
  opacity: "0.72",
});
document.body.appendChild(buildMarker);

createRoot(document.getElementById("root")!).render(<App />);
