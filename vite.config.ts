import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { nonBlockingCss } from "./build/non-blocking-css";

/**
 * BUILD STAMP — what commit is this bundle, really?
 *
 * 🔴 THE INCIDENT THIS PREVENTS (2026-08-14). The preview branch alias stayed
 * pinned to a hand-aliased CLI deployment. A later green push built fine, the
 * dashboard said READY, and the URL still served week-old code. Nobody could
 * tell from the screen — the only way to catch it was pulling the shipped JS
 * chunk and grepping for a line that should have been gone.
 *
 * So the bundle now carries its own identity. Vercel sets VERCEL_GIT_COMMIT_SHA
 * on the build; it is NOT a VITE_ var, so it is injected here rather than read
 * from import.meta.env. Local builds fall back to "dev". Read it on screen in
 * the prototype badge: if it does not match the commit you were handed, the
 * alias is stale — re-point it, do not debug the app.
 */
function buildStamp() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "";
  return {
    __BUILD_SHA__: JSON.stringify(sha ? sha.slice(0, 7) : "dev"),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: buildStamp(),
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
