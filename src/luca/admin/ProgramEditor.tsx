import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import { ChevronLeft, ExternalLink, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import usePageTitle from "@/hooks/usePageTitle";
import { db, fromZoned, toZoned, type Field, type ProgramRow, type Row } from "./db";
import { RowList, areaCls, ghostCls, inputCls, primaryCls, type Ctx } from "./RowEditor";

const KINDS: [string, string][] = [["orientation", "Orientation"], ["review", "Review (hot seat)"], ["class", "Class"], ["double", "Double session"], ["standup", "Sprint standup"], ["demo", "Demo Day"], ["plan", "Planning class"]];
const FEATURES: [string, string][] = [
  ["application", "In-app application (3 questions + fee). Off: the program page links to the offering instead."],
  ["clans", "Clans"], ["coins", "Coins"], ["leaderboard", "Leaderboard (visible to the cohort)"], ["sprint", "The Sprint"], ["demo_day", "Demo Day"],
  ["whatsapp", "WhatsApp reminders (not built yet; leave off)"],
];

const TABS: [string, string][] = [
  ["program", "Program"], ["content", "Copy"], ["mentors", "Mentors"], ["weeks", "Weeks"], ["sessions", "Sessions"],
  ["assignments", "Assignments"], ["board", "Announcements"], ["resources", "Resources"], ["clans", "Clans"], ["launch", "Launch check"],
];

/* ---- Program: the row itself, nested JSON flattened into fields ---- */
function ProgramTab({ p, reload }: { p: ProgramRow; reload: () => void }) {
  const { toast } = useToast();
  const tz = p.timezone || "Asia/Kolkata";
  const init = useMemo(() => ({
    name: p.name, short_name: p.short_name, cohort_label: p.cohort_label, slug: p.slug, enabled: p.enabled,
    starts_at: toZoned(p.starts_at, tz), demo_day_at: toZoned(p.demo_day_at, tz), ends_at: toZoned(p.ends_at, tz),
    seats: p.seats?.toString() ?? "", hours_per_week: p.hours_per_week?.toString() ?? "", hero_url: p.hero_url ?? "", timezone: p.timezone,
    whatsapp_url: p.whatsapp_url ?? "", drive_url: p.drive_url ?? "", support_whatsapp: p.support_whatsapp ?? "",
    features: { ...p.features }, coin_rules: JSON.parse(JSON.stringify(p.coin_rules ?? {})) as ProgramRow["coin_rules"],
    sprint_starts_on: p.sprint?.starts_on ?? "", sprint_days: String(p.sprint?.days ?? 21), sprint_b: String(p.sprint?.track_b_posts_per_week ?? 3),
    clan_names: (p.clan_config?.names ?? []).join("\n"), clan_size: String(p.clan_config?.size ?? 6), clan_reveal: toZoned(p.clan_config?.reveal_at, tz),
    price: String((p.pricing?.price as number | undefined) ?? ""), deposit: String((p.pricing?.deposit as number | undefined) ?? ""), app_fee: String((p.pricing?.app_fee as number | undefined) ?? ""),
    emi: (p.pricing?.emi as boolean | undefined) ?? true,
  }), [p, tz]);
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(init), [init]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  const save = async () => {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(f.slug)) { toast({ title: "The slug is lowercase letters, numbers and dashes", variant: "destructive" }); return; }
    setBusy(true);
    const { error } = await db.from("luca_programs").update({
      name: f.name, short_name: f.short_name, cohort_label: f.cohort_label, slug: f.slug, enabled: f.enabled,
      starts_at: fromZoned(f.starts_at, tz), demo_day_at: fromZoned(f.demo_day_at, tz), ends_at: fromZoned(f.ends_at, tz),
      seats: num(f.seats), hours_per_week: num(f.hours_per_week), hero_url: f.hero_url || null, timezone: f.timezone || "Asia/Kolkata",
      whatsapp_url: f.whatsapp_url || null, drive_url: f.drive_url || null, support_whatsapp: f.support_whatsapp || null,
      features: f.features, coin_rules: f.coin_rules,
      sprint: { starts_on: f.sprint_starts_on || null, days: Number(f.sprint_days) || 21, track_b_posts_per_week: Number(f.sprint_b) || 3 },
      clan_config: { names: f.clan_names.split("\n").map((x) => x.trim()).filter(Boolean), size: Number(f.clan_size) || 6, reveal_at: fromZoned(f.clan_reveal, tz) },
      pricing: p.is_demo ? { price: num(f.price), deposit: num(f.deposit), app_fee: num(f.app_fee), emi: f.emi } : { ...p.pricing, emi: f.emi },
      updated_at: new Date().toISOString(),
    }).eq("id", p.id);
    setBusy(false);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    else { toast({ title: "Saved" }); reload(); }
  };

  const L = ({ k, label, type = "text", hint }: { k: keyof typeof f; label: string; type?: string; hint?: string }) => (
    <label className="block"><span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      <input className={inputCls} type={type} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} />
      {hint ? <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span> : null}
    </label>
  );
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Basics</h2>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.enabled} disabled={p.is_demo} onChange={(e) => set("enabled", e.target.checked)} />Enabled {p.is_demo ? "(the demo is always staff-only)" : "(learners can see it once the LUCA switch is on)"}</label>
        <div className="grid gap-3 sm:grid-cols-2">
          {L({ k: "name", label: "Name" })}{L({ k: "short_name", label: "Short name" })}
          {L({ k: "cohort_label", label: "Cohort label", hint: "e.g. Cohort 03. Fills {cohort} in the copy." })}{L({ k: "slug", label: "Slug", hint: `The link: /luca/${f.slug}` })}
          {L({ k: "starts_at", label: `Starts (${tz})`, type: "datetime-local", hint: "The first session. The board and Clans open here." })}
          {L({ k: "demo_day_at", label: `Demo Day (${tz})`, type: "datetime-local" })}
          {L({ k: "ends_at", label: `Ends (${tz})`, type: "datetime-local", hint: "After this the cohort shows the alumni view." })}
          {L({ k: "timezone", label: "Timezone" })}
          {L({ k: "seats", label: "Seats", type: "number" })}{L({ k: "hours_per_week", label: "Hours a week", type: "number" })}
          {L({ k: "hero_url", label: "Hero image URL" })}{L({ k: "support_whatsapp", label: "Support WhatsApp number", hint: "With country code, e.g. 919876543210" })}
          {L({ k: "whatsapp_url", label: "Cohort WhatsApp group link", hint: "Learners only" })}{L({ k: "drive_url", label: "Cohort Drive link", hint: "Learners only" })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Money</h2>
        {p.is_demo ? (
          <div className="grid gap-3 sm:grid-cols-3">{L({ k: "price", label: "Price (demo)", type: "number" })}{L({ k: "deposit", label: "Deposit (demo)", type: "number" })}{L({ k: "app_fee", label: "Application fee (demo)", type: "number" })}</div>
        ) : <p className="text-xs text-muted-foreground">Price, deposit, application fee and deadlines come from the offering. Edit them in <Link className="underline" to={`/admin/offerings/${p.offering_id}/edit`}>the offering</Link>.</p>}
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.emi} onChange={(e) => set("emi", e.target.checked)} />Mention No-Cost EMI for the balance</label>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Features</h2>
        {FEATURES.map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.features[k]} onChange={(e) => set("features", { ...f.features, [k]: e.target.checked })} />{l}</label>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Coins</h2>
        <p className="text-xs text-muted-foreground">Coins are only ever given by the server. Changing a value applies to coins earned from now on.</p>
        <div className="border border-border rounded-lg divide-y divide-border">
          {Object.entries(f.coin_rules).map(([k, r]) => (
            <div key={k} className="flex items-center gap-2 px-3 py-2">
              <input className={inputCls} value={r.label} onChange={(e) => set("coin_rules", { ...f.coin_rules, [k]: { ...r, label: e.target.value } })} />
              <input className={inputCls} style={{ width: 100 }} type="number" value={r.value} onChange={(e) => set("coin_rules", { ...f.coin_rules, [k]: { ...r, value: Number(e.target.value) || 0 } })} />
              <code className="text-[10px] text-muted-foreground w-28 truncate">{k}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Sprint and Clans</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {L({ k: "sprint_starts_on", label: "Sprint day 1", type: "date" })}{L({ k: "sprint_days", label: "Sprint days", type: "number" })}{L({ k: "sprint_b", label: "Track B posts a week", type: "number" })}
          {L({ k: "clan_size", label: "Clan size", type: "number" })}{L({ k: "clan_reveal", label: `Clans revealed (${tz})`, type: "datetime-local", hint: "Empty: at the start." })}
        </div>
        <label className="block"><span className="block text-xs font-medium text-muted-foreground mb-1">Clan names, one per line</span>
          <textarea className={areaCls} value={f.clan_names} onChange={(e) => set("clan_names", e.target.value)} /></label>
      </section>

      <div className="sticky bottom-0 py-3 bg-background/90 backdrop-blur flex justify-end">
        <button type="button" className={primaryCls} disabled={busy} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save program</button>
      </div>
    </div>
  );
}

/* ---- Copy: the program's content JSON ---- */
function ContentTab({ p, reload }: { p: ProgramRow; reload: () => void }) {
  const { toast } = useToast();
  const strip = (c: Record<string, unknown>) => { const x = { ...c }; delete x.demo; return x; };
  const [text, setText] = useState(() => JSON.stringify(strip(p.content ?? {}), null, 2));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    let next: Record<string, unknown>;
    try { next = JSON.parse(text); } catch (e) { toast({ title: "That isn't valid JSON", description: (e as Error).message, variant: "destructive" }); return; }
    if (!next || typeof next !== "object" || Array.isArray(next)) { toast({ title: "The copy must be a JSON object", variant: "destructive" }); return; }
    if (p.content?.demo) next.demo = p.content.demo; // the demo's day-switcher data is not editable here
    setBusy(true);
    const { error } = await db.from("luca_programs").update({ content: next, updated_at: new Date().toISOString() }).eq("id", p.id);
    setBusy(false);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    else { toast({ title: "Copy saved" }); reload(); }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Every word learners read on the program page, application, offer, setup, contract and certificate. Placeholders fill from the program: {"{cohort} {program} {app_fee} {deposit} {balance} {price} {start_day} {start_dm} {demo_day} {demo_dm} {days_to_start} {seats} {sprint_start} {sprint_end}"}; in the contract also {"{handle}"}, in the offer {"{name}"}.</p>
      <textarea className={areaCls} style={{ minHeight: 520 }} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="flex justify-end gap-2">
        <button type="button" className={ghostCls} onClick={() => setText(JSON.stringify(strip(p.content ?? {}), null, 2))}>Discard changes</button>
        <button type="button" className={primaryCls} disabled={busy} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save copy</button>
      </div>
    </div>
  );
}

/* ---- Launch check: what's missing before learners see it ---- */
function LaunchTab({ p, ctx }: { p: ProgramRow; ctx: Ctx }) {
  const [s, setS] = useState<{ weeks: number; sessions: Row[]; assignments: number; mentors: Row[]; offering?: Row } | null>(null);
  useEffect(() => {
    void (async () => {
      const [w, se, a, m, o] = await Promise.all([
        db.from("luca_weeks").select("id", { count: "exact", head: true }).eq("program_id", p.id),
        db.from("luca_sessions").select("id, title, starts_at, ends_at, zoom_url, recording_url").eq("program_id", p.id),
        db.from("luca_assignments").select("id", { count: "exact", head: true }).eq("program_id", p.id),
        db.from("luca_mentors").select("id, name, user_id").eq("program_id", p.id),
        p.offering_id ? db.from("offerings").select("id, title, status, payment_mode, price_inr, confirmation_amount_inr, app_fee_inr").eq("id", p.offering_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setS({ weeks: w.count ?? 0, sessions: (se.data as Row[]) ?? [], assignments: a.count ?? 0, mentors: (m.data as Row[]) ?? [], offering: (o.data as Row) ?? undefined });
    })();
  }, [p.id, p.offering_id]);
  if (!s) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  const now = Date.now();
  const noZoom = s.sessions.filter((x) => !x.zoom_url && Date.parse(x.ends_at as string) > now);
  const noRec = s.sessions.filter((x) => !x.recording_url && Date.parse(x.ends_at as string) < now);
  const items: [boolean, string, string?][] = [
    [p.is_demo || !!s.offering, "On an offering", s.offering ? `${s.offering.title} · ${s.offering.status}` : "Pick one when creating the cohort"],
    [p.is_demo || s.offering?.status === "active", "Offering is active", "Applications are refused while it isn't"],
    [p.is_demo || s.offering?.payment_mode === "staged", "Offering takes staged payments (fee, deposit, balance)", "Set the offering's payment mode to staged. Until then LUCA won't open any payment, so nobody is charged the full price by mistake."],
    [p.is_demo || (!!s.offering?.price_inr && !!s.offering?.confirmation_amount_inr && !!s.offering?.app_fee_inr), "Price, deposit and application fee set on the offering"],
    [!!p.starts_at && !!p.ends_at, "Start and end dates"],
    [!!p.cohort_label, "Cohort label"],
    [s.weeks > 0, `Weeks · ${s.weeks}`],
    [s.sessions.length > 0, `Sessions · ${s.sessions.length}`],
    [s.assignments > 0, `Assignments · ${s.assignments}`],
    [s.mentors.length > 0, `Mentors · ${s.mentors.length}`],
    [s.mentors.some((m) => m.user_id), "At least one mentor linked to an account (for the mentor desk)", s.mentors.filter((m) => !m.user_id).map((m) => m.name).join(", ") || undefined],
    [!noZoom.length, "Every upcoming session has a Zoom link", noZoom.slice(0, 4).map((x) => x.title).join(", ") || undefined],
    [!noRec.length, "Every past session has a recording", noRec.slice(0, 4).map((x) => x.title).join(", ") || undefined],
    [!!p.whatsapp_url && !!p.drive_url, "WhatsApp group and Drive links (setup steps)"],
    [!!(p.content as Record<string, unknown>)?.sales, "Program page copy"],
    [p.is_demo || p.enabled, "Cohort enabled"],
  ];
  return (
    <div className="space-y-4">
      <div className="border border-border rounded-lg divide-y divide-border bg-surface">
        {items.map(([ok, t, sub], i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-2.5">
            <span className={`mt-0.5 h-4 w-4 rounded-full shrink-0 ${ok ? "bg-green-500" : "bg-amber-500"}`} />
            <span className="text-sm"><span className="block">{t}</span>{sub && !ok ? <span className="block text-xs text-muted-foreground">{sub}</span> : null}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Last step, once for all of LUCA: the server switch. Until it&apos;s on, every LUCA cohort is visible to staff only, whatever is ticked here. It&apos;s set in SQL, on purpose; see LUCA-LAUNCH.md. Times shown in {ctx.tz}.</p>
    </div>
  );
}

const MENTOR_FIELDS: Field[] = [
  { key: "name", label: "Name", type: "text", required: true }, { key: "angle", label: "What they bring (one line)", type: "text" },
  { key: "photo_url", label: "Photo URL", type: "text" }, { key: "handle", label: "Handle", type: "text" },
  { key: "sort", label: "Order", type: "number" },
  { key: "user_id", label: "LevelUp account (gives them the mentor desk)", type: "user" },
];
const WEEK_FIELDS: Field[] = [
  { key: "n", label: "Week number", type: "number", required: true }, { key: "module", label: "Module", type: "text" },
  { key: "phase", label: "Phase", type: "number", hint: "Index into the phases in the copy (1-based)" }, { key: "starts_on", label: "Starts on", type: "date", hint: "The week's first day. The calendar strip starts weeks on this weekday." },
  { key: "image_url", label: "Image URL", type: "text" }, { key: "post_note", label: "Post note", type: "text", hint: "e.g. 2 posts this week" },
  { key: "is_sprint", label: "Sprint week", type: "bool" }, { key: "is_demo_week", label: "Demo Day week", type: "bool" },
  { key: "prewatch", label: "Pre-watch", type: "json", hint: '{"title": "...", "video_url": "https://youtu.be/... (unlisted)", "minutes": 15}. Empty {} = no pre-watch.' },
  { key: "quiz", label: "Quiz", type: "json", hint: '[{"q": "Question?", "options": ["A", "B", "C"], "answer": 0}]. answer is the right option\'s index; learners never receive it.' },
];
const SESSION_FIELDS: Field[] = [
  { key: "title", label: "Title", type: "text", required: true }, { key: "kind", label: "Kind", type: "select", options: KINDS, required: true },
  { key: "week_n", label: "Week", type: "number" }, { key: "image_url", label: "Image URL", type: "text" },
  { key: "starts_at", label: "Starts", type: "datetime", required: true }, { key: "ends_at", label: "Ends", type: "datetime", required: true },
  { key: "mentor_ids", label: "Mentors", type: "mentors" },
  { key: "zoom_url", label: "Zoom link", type: "text", hint: "Released to learners only when they tap Join (from 15 minutes before)." },
  { key: "recording_url", label: "Recording (unlisted YouTube)", type: "text" }, { key: "recording_minutes", label: "Recording length (minutes)", type: "number" },
  { key: "prep", label: "Have ready (one per line)", type: "lines" },
  { key: "chapters", label: "Chapters", type: "json", hint: '[{"at_sec": 0, "title": "Welcome"}]. Empty: the default agenda for the kind.' },
  { key: "files", label: "Files", type: "json", hint: '[{"badge": "PDF", "title": "Slides", "sub": "Week 3", "url": "https://..."}]' },
];
const ASSIGNMENT_FIELDS: Field[] = [
  { key: "title", label: "Title", type: "text", required: true }, { key: "week_n", label: "Week", type: "number" },
  { key: "due_at", label: "Due", type: "datetime", required: true }, { key: "coins", label: "Coins if on time (empty: the default)", type: "number" },
  { key: "brief", label: "Brief", type: "textarea" },
  { key: "parts", label: "Links to hand in", type: "json", hint: '[{"k": "doc", "label": "Your script", "where": "Google Doc in 02 - Scripts"}]. k: doc, sheet, drive, post, loom, profile, slides, or sign (the Sprint contract). check: "yt" requires a YouTube link.' },
  { key: "review_session_id", label: "Reviewed at", type: "session" }, { key: "is_group", label: "Reviewed with the Clan", type: "bool" }, { key: "sort", label: "Order", type: "number" },
];
const ANNOUNCE_FIELDS: Field[] = [
  { key: "title", label: "Title", type: "text", required: true }, { key: "link_url", label: "Link", type: "text" },
  { key: "body", label: "Body", type: "textarea" }, { key: "pinned", label: "Pinned (stays on Today)", type: "bool" },
];
const RESOURCE_FIELDS: Field[] = [
  { key: "title", label: "Title", type: "text", required: true }, { key: "url", label: "URL", type: "text", required: true },
  { key: "kind", label: "Kind", type: "select", options: [["doc", "Doc"], ["sheet", "Sheet"], ["slides", "Slides"], ["video", "Video"], ["link", "Link"], ["template", "Template"]] },
  { key: "week_n", label: "Week (empty: whole cohort)", type: "number" }, { key: "sort", label: "Order", type: "number" },
];
const CLAN_FIELDS: Field[] = [{ key: "name", label: "Name", type: "text", required: true }, { key: "sort", label: "Order", type: "number" }];

export default function ProgramEditor() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const [p, setP] = useState<ProgramRow | null | undefined>(undefined);
  const [ctx, setCtx] = useState<Ctx>({ tz: "Asia/Kolkata", mentors: [], sessions: [] });
  usePageTitle(p ? `LUCA · ${p.name}` : "LUCA");

  const load = useCallback(async () => {
    const { data, error } = await db.from("luca_programs").select("*").eq("id", id).maybeSingle();
    if (error) toast({ title: "Couldn't load", description: error.message, variant: "destructive" });
    setP((data as ProgramRow) ?? null);
  }, [id, toast]);
  const loadCtx = useCallback(async () => {
    const [m, s] = await Promise.all([
      db.from("luca_mentors").select("id, name").eq("program_id", id).order("sort"),
      db.from("luca_sessions").select("id, title, starts_at").eq("program_id", id).order("starts_at"),
    ]);
    setCtx((c) => ({ ...c, mentors: (m.data as Ctx["mentors"]) ?? [], sessions: (s.data as Ctx["sessions"]) ?? [] }));
  }, [id]);
  useEffect(() => { void load(); void loadCtx(); }, [load, loadCtx]);
  useEffect(() => { if (p) setCtx((c) => ({ ...c, tz: p.timezone || "Asia/Kolkata" })); }, [p]);

  if (p === undefined) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (p === null) return <Navigate to="/admin/luca" replace />;
  const fmt = (iso: unknown) => (iso ? new Date(iso as string).toLocaleString("en-IN", { timeZone: ctx.tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "no date");
  const nextN = async () => {
    const { data } = await db.from("luca_weeks").select("n").eq("program_id", p.id).order("n", { ascending: false }).limit(1).maybeSingle();
    return ((data as { n: number } | null)?.n ?? -1) + 1;
  };
  const clanCount = async () => (await db.from("luca_clans").select("id", { count: "exact", head: true }).eq("program_id", p.id)).count ?? 0;

  return (
    <div className="p-6 max-w-5xl">
      <Link to="/admin/luca" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"><ChevronLeft className="h-4 w-4" />LUCA cohorts</Link>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">{p.name} {p.cohort_label ? <span className="text-muted-foreground">· {p.cohort_label}</span> : null}</h1>
          <p className="text-sm text-muted-foreground mt-1">/luca/{p.slug} · {p.is_demo ? "demo, staff only" : p.enabled ? "enabled" : "off"}</p>
        </div>
        <div className="flex gap-2">
          <a className={ghostCls} href={`/luca/${p.slug}/desk`} target="_blank" rel="noopener noreferrer">Mentor desk</a>
          <a className={ghostCls} href={`/luca/${p.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open</a>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-border mb-5">
        {TABS.map(([k, l]) => (
          <NavLink key={k} to={k === "program" ? `/admin/luca/${p.id}` : `/admin/luca/${p.id}/${k}`} end
            className={({ isActive }) => `px-3 h-9 inline-flex items-center text-sm whitespace-nowrap border-b-2 -mb-px ${isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{l}</NavLink>
        ))}
      </nav>
      {p.is_demo ? <div className="mb-4 rounded-md border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-200">This is the demo cohort. Its dates move with the day switcher in the app (/luca/{p.slug}/demo), so edits to dates here are overwritten the next time someone switches the day.</div> : null}
      <Routes>
        <Route index element={<ProgramTab p={p} reload={load} />} />
        <Route path="content" element={<ContentTab p={p} reload={load} />} />
        <Route path="mentors" element={<RowList table="luca_mentors" programId={p.id} fields={MENTOR_FIELDS} order={[["sort", true], ["name", true]]} ctx={ctx}
          title={(r) => r.name as string} sub={(r) => `${r.angle || ""}${r.user_id ? " · linked to an account" : " · not linked"}`} blank={() => ({ name: "New mentor" })} onChange={loadCtx}
          note="Mentors show on sessions and the program page. Link one to a LevelUp account to give them the mentor desk for this cohort." />} />
        <Route path="weeks" element={<RowList table="luca_weeks" programId={p.id} fields={WEEK_FIELDS} order={[["n", true]]} ctx={ctx}
          title={(r) => `Week ${r.n} · ${r.module || "untitled"}`} sub={(r) => `${r.starts_on ?? "no date"}${r.is_sprint ? " · Sprint" : ""}${r.is_demo_week ? " · Demo Day" : ""}${Object.keys((r.prewatch as object) ?? {}).length ? " · pre-watch" : ""}`}
          blank={async () => ({ n: await nextN(), module: "New week" })} note="Week 0 is Orientation. Each week's pre-watch opens 7 days before it starts and closes an hour before its first session." />} />
        <Route path="sessions" element={<RowList table="luca_sessions" programId={p.id} fields={SESSION_FIELDS} order={[["starts_at", true]]} ctx={ctx}
          title={(r) => r.title as string} sub={(r) => `W${r.week_n} · ${KINDS.find((k) => k[0] === r.kind)?.[1]} · ${fmt(r.starts_at)}${r.zoom_url ? "" : " · no Zoom link"}${r.recording_url ? " · recording" : ""}`}
          blank={() => { const s = new Date(Date.now() + 7 * 864e5); s.setUTCHours(13, 0, 0, 0); return { title: "New session", kind: "class", starts_at: s.toISOString(), ends_at: new Date(s.getTime() + 2 * 36e5).toISOString() }; }}
          onChange={loadCtx} note={`Times are in ${ctx.tz}. Learners subscribed to the calendar feed see changes automatically.`} />} />
        <Route path="assignments" element={<RowList table="luca_assignments" programId={p.id} fields={ASSIGNMENT_FIELDS} order={[["due_at", true], ["sort", true]]} ctx={ctx}
          title={(r) => `W${r.week_n} · ${r.title}`} sub={(r) => `Due ${fmt(r.due_at)} · ${(r.parts as unknown[] | null)?.length ?? 0} links`}
          blank={() => ({ title: "New assignment", due_at: new Date(Date.now() + 7 * 864e5).toISOString(), parts: [{ k: "doc", label: "Your doc", where: "Google Doc" }] })} />} />
        <Route path="board" element={<RowList table="luca_announcements" programId={p.id} fields={ANNOUNCE_FIELDS} order={[["pinned", false], ["created_at", false]]} ctx={ctx}
          title={(r) => r.title as string} sub={(r) => `${r.pinned ? "Pinned · " : ""}${fmt(r.created_at)}`} blank={() => ({ title: "New announcement" })}
          note="The latest two show on Today for every learner." />} />
        <Route path="resources" element={<RowList table="luca_resources" programId={p.id} fields={RESOURCE_FIELDS} order={[["sort", true], ["created_at", true]]} ctx={ctx}
          title={(r) => r.title as string} sub={(r) => `${r.kind}${r.week_n != null ? ` · Week ${r.week_n}` : ""}`} blank={() => ({ title: "New resource", url: "https://", kind: "link" })}
          note="Show in the Work tab." />} />
        <Route path="clans" element={<RowList table="luca_clans" programId={p.id} fields={CLAN_FIELDS} order={[["sort", true], ["name", true]]} ctx={ctx}
          title={(r) => r.name as string} blank={async () => ({ name: `Clan ${(await clanCount()) + 1}`, sort: (await clanCount()) + 1 })}
          note="Rename Clans here. To place learners into Clans (auto, mixing tracks and niches), use the mentor desk's People tab." />} />
        <Route path="launch" element={<LaunchTab p={p} ctx={ctx} />} />
      </Routes>
    </div>
  );
}

