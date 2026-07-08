import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { nonBlockingCss } from "./build/non-blocking-css";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Make the app stylesheet non-render-blocking so the inline brand splash
    // paints on the first HTML round-trip (Slow-3G brand-paint ≤2.5s gate).
    // Build-only; see build/non-blocking-css.ts for the safety rationale.
    nonBlockingCss(),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase': ['@supabase/supabase-js'],
          'ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', '@radix-ui/react-select', '@radix-ui/react-popover', 'lucide-react'],
          'query': ['@tanstack/react-query'],
          // Animation runtime split out so it caches independently of app code
          // across releases. It stays on the critical path (StudentLayout needs
          // it) but becomes a stable, long-cache chunk.
          'framer': ['framer-motion'],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Pure, dependency-free logic shared with the Deno edge functions
      // (pricing, phone). Lives under supabase/functions/_shared so it also
      // deploys with the functions; the frontend bundles the same source.
      "@shared": path.resolve(__dirname, "./supabase/functions/_shared"),
    },
    dedupe: ["react", "react-dom"],
  },
}));
