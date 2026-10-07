/**
 * LUCA click-through preview: the real LUCA screens, with the network and
 * sign-in replaced by recorded demo-cohort envelopes. No login, no Supabase,
 * nothing written anywhere. Not part of the app build.
 *
 *   npx vite --config ops/luca/preview/vite.config.ts      → http://localhost:5199
 *
 * The recordings come from ops/luca/preview/rooms/ (git-ignored; make them with
 * ops/luca/preview/record-rooms.sh) or from LUCA_ROOMS. They hold <stage>.json (luca_room), <stage>.desk.json (luca_desk)
 * and <stage>.clock.json (luca_demo_clock) for the ten demo days; see the
 * header of src/luca/__tests__/screens.render.test.tsx for how to record them.
 */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "node:fs";
import path from "node:path";

const HERE = __dirname;
const APP = path.resolve(HERE, "../../..");
const ROOMS = process.env.LUCA_ROOMS || path.join(HERE, "rooms");

/** Serves the recorded envelopes at /__rooms/<file>. */
function rooms(): Plugin {
  return {
    name: "luca-rooms",
    configureServer(server) {
      server.middlewares.use("/__rooms/", (req, res) => {
        const f = path.basename(decodeURIComponent((req.url ?? "").split("?")[0]));
        const p = path.join(ROOMS, f);
        if (!ROOMS || !/^[a-z0-9]+(\.desk|\.clock)?\.json$/.test(f) || !fs.existsSync(p)) { res.statusCode = 404; res.end("null"); return; }
        res.setHeader("Content-Type", "application/json");
        res.end(fs.readFileSync(p));
      });
    },
  };
}

export default defineConfig({
  root: HERE,
  publicDir: path.join(APP, "public"),
  plugins: [react(), rooms()],
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.join(HERE, "mock-supabase.ts") },
      { find: "@/contexts/AuthContext", replacement: path.join(HERE, "mock-auth.tsx") },
      { find: "@", replacement: path.join(APP, "src") },
    ],
  },
  server: { port: 5199, strictPort: true, fs: { allow: [APP] } },
});
