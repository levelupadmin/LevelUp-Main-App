import "@/index.css"; // the main app's base styles, so LUCA renders exactly as it will inside the app
import { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import LucaApp from "@/luca/LucaApp";
import AdminLuca from "@/luca/admin/AdminLuca";
import { LIVE, PEOPLE, setWho, who } from "./who";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Who the preview is signed in as (live mode). Changing it reloads the page. */
function Switcher() {
  const [open, setOpen] = useState(false);
  const me = who();
  const box: CSSProperties = { position: "fixed", left: 8, bottom: 96, zIndex: 9999, font: "500 12px/1.3 system-ui, sans-serif" };
  return (
    <div style={box}>
      {open ? (
        <div style={{ background: "#111", color: "#eee", border: "1px solid #333", borderRadius: 10, padding: 8, width: 230, boxShadow: "0 8px 30px rgba(0,0,0,.5)" }}>
          <div style={{ opacity: 0.6, padding: "2px 6px 6px" }}>{LIVE ? "Live database · sign in as" : "Recorded sample data"}</div>
          {LIVE ? PEOPLE.map((p) => (
            <button key={p.id} type="button" onClick={() => { setWho(p.id); location.reload(); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px", borderRadius: 6, border: 0, cursor: "pointer", background: p.id === me.id ? "#2a2a2a" : "transparent", color: "inherit" }}>
              <b>{p.name}</b> <span style={{ opacity: 0.6 }}>· {p.note}</span>
            </button>
          )) : null}
          <div style={{ display: "flex", gap: 6, padding: "6px 6px 2px", flexWrap: "wrap" }}>
            <a href="/luca" style={{ color: "#f0561a" }}>My cohorts</a>
            <a href="/luca/luca-c3" style={{ color: "#f0561a" }}>luca-c3</a>
            <a href="/luca/luca-demo" style={{ color: "#f0561a" }}>demo</a>
            <a href="/admin/luca" style={{ color: "#f0561a" }}>admin</a>
          </div>
        </div>
      ) : null}
      <button type="button" onClick={() => setOpen(!open)} aria-label="Preview: who am I"
        style={{ marginTop: 6, border: "1px solid #333", background: "#111", color: "#eee", borderRadius: 999, padding: "6px 10px", cursor: "pointer" }}>
        {LIVE ? `● ${me.name}` : "● sample"}
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <BrowserRouter>
      <Routes>
        <Route path="/luca/*" element={<LucaApp />} />
        <Route path="/admin/luca/*" element={<div className="dark min-h-screen bg-background text-foreground"><AdminLuca /></div>} />
        <Route path="*" element={<Navigate to={LIVE ? "/luca/luca-c3" : "/luca/luca-demo"} replace />} />
      </Routes>
      <Switcher />
    </BrowserRouter>
    <Toaster theme="dark" />
  </QueryClientProvider>,
);
