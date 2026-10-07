/**
 * Renders every LUCA screen against REAL room envelopes, one per demo day.
 *
 * Skipped unless LUCA_ROOMS points at a folder of fixtures, so CI needs no
 * database. To produce them: load the LUCA migrations and ops/luca/demo/seed.sql
 * into a scratch Postgres, then for each stage call
 * `luca_demo_scenario('luca-demo', <stage>)` and save `luca_room('luca-demo')`
 * as <stage>.json and `luca_desk('luca-demo')` as <stage>.desk.json.
 *
 *   LUCA_ROOMS=/path/to/rooms npx vitest run src/luca/__tests__/screens.render.test.tsx
 *
 * Only the network (supabase.rpc / functions) and auth are mocked; every
 * screen, hook, derivation and overlay runs for real.
 */
import { Component, type ReactNode } from "react";
import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fs from "node:fs";
import path from "node:path";

const DIR = process.env.LUCA_ROOMS ?? "";
const STAGES = ["browse", "applied", "decision", "prestart", "orientation", "week1", "week5", "sprint", "demo", "alumni"] as const;
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const current: { room: unknown; desk: unknown; clock: unknown } = { room: null, desk: null, clock: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (fn: string) => {
      if (fn === "luca_room") return { data: current.room, error: null };
      if (fn === "luca_desk") return { data: current.desk, error: null };
      if (fn === "luca_notes") return { data: [], error: null };
      if (fn === "luca_demo_clock") return { data: current.clock, error: null };
      if (fn === "luca_surface_enabled") return { data: true, error: null };
      if (fn === "luca_my_programs") return { data: [], error: null };
      return { data: null, error: null };
    },
    functions: { invoke: async () => ({ data: { status: "ok" }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-0000-0000-00000000000a", email: "admin@x.in" }, profile: { full_name: "Diya Sharma", email: "admin@x.in", role: "admin" }, loading: false }),
}));
vi.mock("@/hooks/useInterviewSlots", () => ({
  useInterviewSlots: () => ({ slots: [], applicationToken: null, isWaiting: false, isLoading: false }),
  calendlyBookingUrl: (u: string) => u,
}));

class Catch extends Component<{ children: ReactNode; onError: (e: Error) => void }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e: Error) { this.props.onError(e); }
  render() { return this.state.err ? <div data-testid="crashed" /> : this.props.children; }
}
function Where({ out }: { out: { path: string } }) { out.path = useLocation().pathname + useLocation().search; return null; }

beforeAll(() => {
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  if (!("IntersectionObserver" in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  }
  if (!window.requestAnimationFrame) window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
});

async function renderAt(url: string) {
  const { default: LucaApp } = await import("../LucaApp");
  const errors: Error[] = [];
  const where = { path: "" };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const r = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Catch onError={(e) => errors.push(e)}>
          <Routes><Route path="/luca/*" element={<LucaApp />} /></Routes>
          <Where out={where} />
        </Catch>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    if (errors.length) return;
    expect(r.container.querySelector(".page:not(.lu-err)")).not.toBeNull();
    expect(r.container.querySelector(".lu-load")).toBeNull();
  }, { timeout: 8000 });
  const text = r.container.textContent ?? "";
  cleanup();
  return { errors, where: where.path, text };
}

describe.skipIf(!DIR)("every LUCA screen renders on every demo day", () => {
  for (const stage of STAGES) {
    describe(stage, () => {
      const routes = (): string[] => {
        const room = current.room as { access: string; sessions: { id: string; recording_minutes: number | null; ends_at: string }[]; assignments?: { id: string }[]; weeks: { n: number; prewatch: object }[] };
        const base = "/luca/luca-demo";
        if (room.access === "none") return ["program", "trailer", "review", "apply/1"].map((x) => `${base}/${x}`);
        if (room.access === "applicant") return ["status", "interview", "offer"].map((x) => `${base}/${x}`);
        const rec = room.sessions.find((s) => (s.recording_minutes ?? 0) > 0 && Date.parse(s.ends_at) < Date.now());
        const pw = room.weeks.find((w) => Object.keys(w.prewatch ?? {}).length);
        return [
          "today", "calendar", "calendar?v=all", "work", "recordings", "recordings?f=hot", "clan", "clan?tab=board", "clan?tab=board&when=week", "clan?tab=coins",
          "sprint", "me", "certificate", "balance", "desk", "desk?tab=sprint", "desk?tab=hot", "desk?tab=people", "demo",
          `session/${room.sessions[0].id}`, `session/${room.sessions[room.sessions.length - 1].id}`,
          ...(room.assignments ?? []).slice(0, 11).map((a) => `assign/${a.id}`),
          ...(rec ? [`rec/${rec.id}`] : []), ...(pw ? [`prewatch/${pw.n}`] : []),
        ].map((x) => `${base}/${x}`);
      };
      it("renders without an error", async () => {
        current.room = load(`${stage}.json`);
        current.desk = load(`${stage}.desk.json`);
        current.clock = fs.existsSync(path.join(DIR, `${stage}.clock.json`)) ? load(`${stage}.clock.json`) : null;
        const failures: string[] = [];
        const landed: string[] = [];
        for (const url of routes()) {
          const res = await renderAt(url);
          if (process.env.LUCA_ROOMS_DUMP && url.endsWith(process.env.LUCA_ROOMS_DUMP)) console.log(`[${stage}] ${url}\n${res.text.replace(/\s+/g, " ").slice(0, 900)}`);
          landed.push(`${url.replace("/luca/luca-demo/", "")} -> ${res.where.replace("/luca/luca-demo/", "")}`);
          if (res.errors.length) failures.push(`${url}: ${res.errors[0].message}`);
          else if (/NaN|undefined|\[object Object\]|Invalid Date/.test(res.text)) failures.push(`${url}: suspicious text "${(res.text.match(/.{0,40}(NaN|undefined|\[object Object\]|Invalid Date).{0,40}/) ?? [""])[0]}"`);
        }
        if (process.env.LUCA_ROOMS_VERBOSE) console.log(`[${stage}]\n  ${landed.join("\n  ")}`);
        expect(failures).toEqual([]);
      }, 120_000);
    });
  }
});
