import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/sentry";

// Initialise error reporting before the React tree mounts so we
// catch render/init errors too. No-ops if VITE_SENTRY_DSN isn't set.
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
