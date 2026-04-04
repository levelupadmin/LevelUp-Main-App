import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (window.location.pathname === "/") {
  window.history.replaceState({}, "", `/home${window.location.search}${window.location.hash}`);
}

createRoot(document.getElementById("root")!).render(<App />);
