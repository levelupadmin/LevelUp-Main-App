import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./supabase/functions/_shared"),
      // Edge-function handlers import supabase-js by its Deno URL specifier,
      // which vitest cannot resolve (there is no deno.json / import map here).
      // `@supabase/supabase-js` is an ordinary dependency of this package, so
      // point the URL at it and a handler becomes importable by a test that
      // drives a real Request through it, instead of grepping its source.
      // All three spellings the functions tree actually uses. These match the
      // exact specifier only (rollup-alias semantics), so the bare `@2` entry
      // does not shadow the pinned ones.
      "https://esm.sh/@supabase/supabase-js@2": "@supabase/supabase-js",
      "https://esm.sh/@supabase/supabase-js@2.98.0": "@supabase/supabase-js",
      "https://esm.sh/@supabase/supabase-js@2.39.0": "@supabase/supabase-js",
    },
  },
});
