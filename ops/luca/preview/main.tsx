import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LucaApp from "@/luca/LucaApp";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <BrowserRouter>
      <Routes>
        <Route path="/luca/*" element={<LucaApp />} />
        <Route path="*" element={<Navigate to="/luca/luca-demo" replace />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>,
);
