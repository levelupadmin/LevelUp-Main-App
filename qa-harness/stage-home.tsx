// QA HARNESS — NOT shipped. Mounts the REAL Stage Home (StageHome.tsx) for
// someone signed out of this tab, so the new-person Home (no purchases) can be
// checked against staging data without signing in.
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import StageHome from "@/components/stage/home/StageHome";
import "@/index.css";
import "@/styles/stage-fonts.css";
import "@/styles/stage.css";
import "@/styles/stage-ui.css";
import "@/components/stage/shell.css";

const qc = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <BrowserRouter>
      <AuthProvider>
        <div className="stage-ui sh" style={{ display: "block" }}>
          <main className="sh-content" style={{ paddingTop: 24 }}><StageHome /></main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
