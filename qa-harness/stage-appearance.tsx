// QA HARNESS — NOT shipped. Mounts the REAL Profile > Appearance section
// (src/components/stage/profile/StageAppearance.tsx) on its own, so the
// accent, sound and tap-sound controls can be checked without signing in.
import { createRoot } from "react-dom/client";
import StageAppearance from "@/components/stage/profile/StageAppearance";
import { initAppearance } from "@/lib/appearance";
import "@/index.css";
import "@/styles/stage-fonts.css";
import "@/styles/stage.css";

initAppearance();
createRoot(document.getElementById("root")!).render(
  <div style={{ maxWidth: 672, margin: "24px auto", padding: "0 16px" }}>
    <StageAppearance />
  </div>,
);
