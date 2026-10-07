/**
 * Stand-in for the Supabase client in the click-through preview. Reads serve
 * recorded demo envelopes, re-timed so "now" is now. Writes answer like the
 * server would but change nothing (the screen refetches the same day).
 * The demo day is switched by luca_demo_scenario, exactly as in the app.
 */
type Res = { data: unknown; error: null | { message: string } };
const STAGE_KEY = "luca.preview.stage";
const stage = () => { try { return localStorage.getItem(STAGE_KEY) || "week5"; } catch { return "week5"; } };
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Move every full timestamp by `delta` ms (date-only values stay). */
function retime<T>(v: T, delta: number): T {
  if (typeof v === "string") return (ISO.test(v) && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v) + delta).toISOString() : v) as T;
  if (Array.isArray(v)) return v.map((x) => retime(x, delta)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, retime(x, delta)])) as T;
  return v;
}

const cache = new Map<string, unknown>();
async function file(name: string): Promise<unknown> {
  if (!cache.has(name)) {
    const r = await fetch(`/__rooms/${name}`);
    cache.set(name, r.ok ? await r.json() : null);
  }
  return cache.get(name);
}
async function room(): Promise<Record<string, unknown> | null> {
  const r = (await file(`${stage()}.json`)) as Record<string, unknown> | null;
  if (!r) return null;
  const delta = Date.now() - Date.parse(r.server_now as string);
  return retime(r, delta);
}

const ok = (data: unknown): Res => ({ data, error: null });

async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<Res> {
  switch (fn) {
    case "luca_room": return ok(await room());
    case "luca_desk": {
      const r = (await file(`${stage()}.json`)) as { server_now: string } | null;
      const d = await file(`${stage()}.desk.json`);
      return ok(r && d ? retime(d, Date.now() - Date.parse(r.server_now)) : d);
    }
    case "luca_demo_clock": {
      // The recording is re-timed to now; take that back out of the display shift.
      const r = (await file(`${stage()}.json`)) as { server_now: string } | null;
      const c = (await file(`${stage()}.clock.json`)) as { display_shift_secs: number } | null;
      return ok(r && c ? { display_shift_secs: c.display_shift_secs - (Date.now() - Date.parse(r.server_now)) / 1000 } : c);
    }
    case "luca_demo_scenario": try { localStorage.setItem(STAGE_KEY, String(args.p_stage)); } catch { /* ignore */ } return ok({ stage: args.p_stage });
    case "luca_surface_enabled": return ok(true);
    case "luca_my_programs": return ok([{ slug: "luca-demo", name: "The LevelUp Creator Academy", short_name: "LUCA", cohort_label: "Cohort 03", hero_url: "/luca/img/s-hero.jpg", is_demo: true, starts_at: null, access: "learner", is_staff: true }]);
    case "luca_notes": return ok([]);
    case "luca_note_add": return ok({ id: crypto.randomUUID() });
    case "luca_join_session": return ok({ zoom_url: null, awarded: 100, present: true });
    case "luca_submit": return ok({ id: crypto.randomUUID(), on_time: true, awarded: 150 });
    case "luca_submit_fix": return ok({ id: crypto.randomUUID() });
    case "luca_sprint_log": return ok({ id: crypto.randomUUID(), day: 9, awarded: 250 });
    case "luca_prewatch_check": return ok({ correct: true, answer: args.p_choice, chosen: args.p_choice });
    case "luca_prewatch_complete": return ok({ score: 5, of: 5, awarded: 50 });
    case "luca_feedback": return ok({ awarded: 25 });
    case "luca_nudge": return ok({ sent: true });
    case "luca_setup": return ok({ seat: true });
    case "luca_rotate_cal_token": return ok(crypto.randomUUID());
    case "luca_form_clans": return ok({ assigned: 0 });
    default: return ok({ ok: true, awarded: 0 });
  }
}

/** A query builder that resolves to nothing, whatever is chained. */
function emptyQuery(): unknown {
  const done = Promise.resolve({ data: null, error: null, count: 0 });
  const q: Record<string, unknown> = {};
  const self = new Proxy(q, {
    get(_t, k) {
      if (k === "then") return done.then.bind(done);
      if (k === "maybeSingle" || k === "single") return () => done;
      return () => self;
    },
  });
  return self;
}

export const supabase = {
  rpc,
  from: () => emptyQuery(),
  functions: { invoke: async () => ({ data: { status: "ok", slots: [] }, error: null }) },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => undefined,
};
export default supabase;
