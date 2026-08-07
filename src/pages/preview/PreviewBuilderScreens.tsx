/**
 * The FROM-SCRATCH Program Builder, v2 — cards are TEMPLATES now.
 *
 * Founder round 5: "a live session needs the class name, the mentor, a brief,
 * a Zoom link, a recording after the date, resources… an assignment needs a
 * name, description, resources, and a Tally-style form built in, so
 * submissions go straight to the mentors."
 *
 * So every card expands into its type's form, and the generated Path is now
 * CLICKABLE — every node opens the student page rendered from what the admin
 * filled. Assignment pages take real submissions (demo-local) that appear in
 * the Mentor Desk.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, ChevronRight, ChevronDown, Plus, X, Radio, Zap, Users,
  Eye, Trash2, Link2, Map, Video, FileText, Send, Sparkles, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SurfaceCard } from "@/components/patterns";
import { PHASE_TONES } from "./previewTheme";
import { BackRow, Serif, LinkCard, type ScreenProps } from "./PreviewScreens";
import type { BuiltCard, BuiltCardKind, BuiltPhase, BuiltProgram, BuiltResource, BuiltWeek } from "./previewStore";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const CARD_KINDS: Record<BuiltCardKind, {
  label: string; icon: typeof Radio; tint: string;
  fields: { mentor?: boolean; zoom?: boolean; recording?: boolean; resources?: boolean; submission?: boolean };
  briefLabel: string;
}> = {
  live_class: { label: "Live class", icon: Radio, tint: "hsl(var(--gold))", fields: { mentor: true, zoom: true, recording: true, resources: true }, briefLabel: "What this class covers" },
  community_call: { label: "Community call", icon: Users, tint: "hsl(var(--accent-violet))", fields: { mentor: true, zoom: true }, briefLabel: "What this call is for" },
  task: { label: "Task", icon: Check, tint: "hsl(var(--muted-foreground))", fields: {}, briefLabel: "What to do" },
  assignment: { label: "Assignment", icon: Zap, tint: "hsl(var(--accent-amber))", fields: { resources: true, submission: true }, briefLabel: "The brief — what and why" },
  resource: { label: "Resource", icon: Link2, tint: "hsl(var(--accent-emerald))", fields: { resources: true }, briefLabel: "What's in here" },
};

let seq = 0;
const uid = (p: string) => `${p}-${++seq}-${Math.abs(Date.now() % 100000)}`;

const emptyWeek = (n: number): BuiltWeek => ({ id: uid("w"), title: `Week ${n}`, cards: [] });
const emptyPhase = (n: number): BuiltPhase => ({ id: uid("ph"), name: `Phase ${n}`, weeks: [emptyWeek(1)] });

/** A fully-filled sample so the ideal is one tap away — delete it any time. */
export function sampleProgram(): BuiltProgram {
  const VID = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample";
  return {
    id: uid("prog"),
    name: "Video Editing Studio",
    phases: [
      {
        id: uid("ph"), name: "Foundations", weeks: [
          {
            id: uid("w"), title: "Week 1 · Orientation", cards: [
              { id: uid("c"), day: "Sun", kind: "live_class", title: "Orientation — how this program works", mentor: "Rahul", brief: "The map of the next weeks, how reviews work, and the one project everything builds toward.", zoomUrl: "https://zoom.us/j/91234500011?pwd=editingstudio", recordingUrl: `${VID}/ForBiggerJoyrides.mp4`, resources: [{ id: uid("r"), label: "Program handbook (PDF)", url: "https://drive.google.com/file/d/handbook-editing" }] },
              { id: uid("c"), day: "Tue", kind: "task", title: "Set up your edit bay", brief: "Install the NLE, load the starter project, render the test timeline. Screenshot your workspace when done." },
              { id: uid("c"), day: "Thu", kind: "community_call", title: "Community call — wins & blockers", mentor: "Rahul", brief: "Open mic. Bring one thing that worked and one that's stuck.", zoomUrl: "https://zoom.us/j/91234500022?pwd=editingstudio" },
              { id: uid("c"), day: "Sat", kind: "assignment", title: "First cut — the 30-second sequence", brief: "Cut the supplied footage into a 30-second sequence with a beginning, middle and end. No music yet — rhythm has to come from the cuts.", resources: [{ id: uid("r"), label: "Raw footage folder", url: "https://drive.google.com/drive/folders/raw-w1" }, { id: uid("r"), label: "Reference cut (video)", url: `${VID}/ForBiggerMeltdowns.mp4` }], submitPrompt: "Paste the link to your exported cut (Drive or YouTube unlisted). One line on the hardest cut decision you made." },
            ],
          },
          {
            id: uid("w"), title: "Week 2 · Rhythm & pacing", cards: [
              { id: uid("c"), day: "Sun", kind: "live_class", title: "Cutting on rhythm — J-cuts, L-cuts, and breath", mentor: "Rahul", brief: "Why great edits are heard before they're seen. Live re-cut of two Week-1 submissions.", zoomUrl: "https://zoom.us/j/91234500033?pwd=editingstudio", resources: [{ id: uid("r"), label: "Shot-by-shot cheat sheet", url: "https://drive.google.com/file/d/cheatsheet-rhythm" }] },
              { id: uid("c"), day: "Wed", kind: "resource", title: "Pacing reference pack", brief: "Three sequences with wildly different pacing, plus the timeline breakdowns.", resources: [{ id: uid("r"), label: "Reference pack (Drive)", url: "https://drive.google.com/drive/folders/pacing-pack" }] },
              { id: uid("c"), day: "Sat", kind: "assignment", title: "Re-cut your Week 1 sequence to music", brief: "Same footage, new spine: cut to the supplied track. Keep it 30 seconds.", resources: [{ id: uid("r"), label: "Music track", url: "https://drive.google.com/file/d/track-w2" }], submitPrompt: "Link to the re-cut. Tell us: what changed once the music led?" },
            ],
          },
        ],
      },
      {
        id: uid("ph"), name: "Ship", weeks: [
          {
            id: uid("w"), title: "Week 3 · The showcase piece", cards: [
              { id: uid("c"), day: "Sun", kind: "live_class", title: "Assembling the showcase edit", mentor: "Rahul", brief: "Structure for a 90-second portfolio piece — and how it gets reviewed on Demo Day.", zoomUrl: "https://zoom.us/j/91234500044?pwd=editingstudio" },
              { id: uid("c"), day: "Fri", kind: "assignment", title: "Showcase edit — v1", brief: "Your own footage or the supplied pack. 90 seconds, titled, graded, mixed.", submitPrompt: "Link to v1 + the one note you'd give yourself." },
            ],
          },
        ],
      },
    ],
  };
}

/* ── The builder ────────────────────────────────────────────────────────── */

export function ProgramBuilderScreen({ s, d, go, programId }: ScreenProps & { programId?: string }) {
  const existing = s.programs.find((p) => p.id === programId);
  const [program, setProgram] = useState<BuiltProgram>(
    existing ?? { id: uid("prog"), name: "", phases: [emptyPhase(1)] },
  );
  const [savedFlash, setSavedFlash] = useState(false);

  const totals = useMemo(() => {
    const weeks = program.phases.reduce((n, ph) => n + ph.weeks.length, 0);
    const cards = program.phases.reduce((n, ph) => n + ph.weeks.reduce((m, w) => m + w.cards.length, 0), 0);
    return { weeks, cards };
  }, [program]);

  const mutate = (fn: (p: BuiltProgram) => BuiltProgram) => setProgram(fn);

  const save = () => {
    d({ type: "save_program", program });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  };

  const loadSample = () => {
    const sp = sampleProgram();
    setProgram(sp);
    d({ type: "save_program", program: sp });
  };

  const canSave = program.name.trim().length > 0 && totals.cards > 0;

  return (
    <div className="space-y-6">
      <BackRow label="Admin" onClick={() => go("admin")} />
      <PageHeader
        eyebrow="Admin · Program Builder"
        title={<>Build a program from <Serif>scratch</Serif></>}
        subtitle="Quick-add a card with just a title, then open it and fill its template — mentor, brief, Zoom, recording, resources, and for assignments the in-built submission form."
        actions={
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {savedFlash && (
                <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[hsl(var(--success))]">
                  <Check className="h-3.5 w-3.5" /> Saved
                </motion.span>
              )}
            </AnimatePresence>
            <Button variant="outline" size="sm" disabled={!canSave} onClick={() => { save(); go(`admin/preview/${program.id}`); }}>
              <Eye /> Preview the Path
            </Button>
            <Button variant="champagne" size="sm" disabled={!canSave} onClick={save}>
              <Check /> Save program
            </Button>
          </div>
        }
      />

      <SurfaceCard variant="static" padding="lg">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="prog-name" className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Program name</label>
            <input
              id="prog-name"
              value={program.name}
              onChange={(ev) => mutate((p) => ({ ...p, name: ev.target.value }))}
              placeholder="e.g. Video Editing Studio — Cohort Program"
              className="mt-1.5 w-full rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2.5 text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
            />
            <div className="mt-2 text-[11.5px] text-[hsl(var(--muted-foreground))]">
              {program.phases.length} phase{program.phases.length !== 1 ? "s" : ""} · {totals.weeks} week{totals.weeks !== 1 ? "s" : ""} · {totals.cards} card{totals.cards !== 1 ? "s" : ""}
            </div>
          </div>
          {totals.cards === 0 && !existing && (
            <Button variant="outline" size="sm" onClick={loadSample}>
              <Sparkles /> Load a filled sample instead
            </Button>
          )}
        </div>
      </SurfaceCard>

      <div className="space-y-5">
        {program.phases.map((ph, pi) => {
          const tone = PHASE_TONES[pi % PHASE_TONES.length];
          return (
            <SurfaceCard key={ph.id} variant="static" padding="lg" className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full opacity-15 blur-3xl" style={{ background: tone.c }} />
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: tone.c }}>Phase {pi + 1}</span>
                <input
                  value={ph.name}
                  onChange={(ev) => mutate((p) => ({ ...p, phases: p.phases.map((x) => x.id === ph.id ? { ...x, name: ev.target.value } : x) }))}
                  aria-label={`Phase ${pi + 1} name`}
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] font-bold tracking-[-0.01em] outline-none transition-colors hover:border-[hsl(var(--border))] focus:border-[hsl(var(--border-hover))] focus:bg-black/40"
                />
                {program.phases.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Delete phase ${ph.name}`}
                    onClick={() => mutate((p) => ({ ...p, phases: p.phases.filter((x) => x.id !== ph.id) }))}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-black/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-4">
                {ph.weeks.map((w) => (
                  <WeekEditor
                    key={w.id}
                    week={w}
                    tone={tone}
                    onChange={(next) => mutate((p) => ({ ...p, phases: p.phases.map((x) => x.id === ph.id ? { ...x, weeks: x.weeks.map((y) => (y.id === w.id ? next : y)) } : x) }))}
                    onDelete={ph.weeks.length > 1 ? () => mutate((p) => ({ ...p, phases: p.phases.map((x) => x.id === ph.id ? { ...x, weeks: x.weeks.filter((y) => y.id !== w.id) } : x) })) : undefined}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => mutate((p) => ({ ...p, phases: p.phases.map((x) => x.id === ph.id ? { ...x, weeks: [...x.weeks, emptyWeek(x.weeks.length + 1)] } : x) }))}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[hsl(var(--border-hover))] py-2.5 text-[12px] font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-black/30 hover:text-[hsl(var(--foreground))]"
                >
                  <Plus className="h-3.5 w-3.5" /> Add a week to {ph.name}
                </button>
              </div>
            </SurfaceCard>
          );
        })}

        <button
          type="button"
          onClick={() => mutate((p) => ({ ...p, phases: [...p.phases, emptyPhase(p.phases.length + 1)] }))}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[hsl(var(--border-hover))] py-4 text-[13px] font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-black/30 hover:text-[hsl(var(--foreground))]"
        >
          <Plus className="h-4 w-4" /> Add a phase
        </button>
      </div>
    </div>
  );
}

function WeekEditor({ week, tone, onChange, onDelete }: {
  week: BuiltWeek;
  tone: { c: string };
  onChange: (w: BuiltWeek) => void;
  onDelete?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState("Sun");
  const [kind, setKind] = useState<BuiltCardKind>("live_class");
  const [title, setTitle] = useState("");
  const [openCard, setOpenCard] = useState<string | null>(null);

  const addCard = () => {
    if (!title.trim()) return;
    const card: BuiltCard = { id: uid("c"), day, kind, title: title.trim() };
    onChange({ ...week, cards: [...week.cards, card] });
    setTitle(""); setAdding(false); setOpenCard(card.id); // open the template right away
  };

  const updateCard = (next: BuiltCard) => onChange({ ...week, cards: week.cards.map((c) => (c.id === next.id ? next : c)) });

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-black/30 p-3.5">
      <div className="flex items-center gap-2">
        <input
          value={week.title}
          onChange={(ev) => onChange({ ...week, title: ev.target.value })}
          aria-label="Week title"
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-[13.5px] font-semibold outline-none transition-colors hover:border-[hsl(var(--border))] focus:border-[hsl(var(--border-hover))] focus:bg-black/40"
        />
        <span className="shrink-0 text-[10.5px] text-[hsl(var(--muted-foreground))]">{week.cards.length} card{week.cards.length !== 1 ? "s" : ""}</span>
        {onDelete && (
          <button type="button" aria-label={`Delete ${week.title}`} onClick={onDelete} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-black/40">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {week.cards.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {week.cards.map((c) => {
            const k = CARD_KINDS[c.kind];
            const open = openCard === c.id;
            const filled = Boolean(c.brief || c.zoomUrl || c.mentor || c.submitPrompt || (c.resources?.length ?? 0) > 0);
            return (
              <div key={c.id} className={`rounded-lg ${open ? "border border-[hsl(var(--border-hover))] bg-black/40" : "bg-[hsl(var(--secondary))]"}`}>
                <button
                  type="button"
                  onClick={() => setOpenCard(open ? null : c.id)}
                  className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left"
                  aria-expanded={open}
                  aria-label={`${c.title} — open template`}
                >
                  <span className="w-9 shrink-0 text-[10px] font-extrabold uppercase text-[hsl(var(--muted-foreground))]">{c.day}</span>
                  <k.icon className="h-3.5 w-3.5 shrink-0" style={{ color: k.tint }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{c.title}</span>
                  {!filled && <span className="shrink-0 rounded-full border border-[hsl(var(--accent-amber)/0.45)] px-1.5 py-0.5 text-[8.5px] font-bold uppercase text-[hsl(var(--accent-amber))]">Fill me</span>}
                  <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide" style={{ borderColor: `${k.tint}66`, color: k.tint }}>
                    {k.label}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="overflow-hidden"
                    >
                      <CardTemplateForm
                        card={c}
                        onChange={updateCard}
                        onRemove={() => { onChange({ ...week, cards: week.cards.filter((x) => x.id !== c.id) }); setOpenCard(null); }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <div className="mt-2.5 rounded-lg border border-[hsl(var(--border-hover))] bg-black/40 p-3">
          <div className="flex flex-wrap gap-2">
            <select value={day} onChange={(ev) => setDay(ev.target.value)} aria-label="Day" className="rounded-lg border border-[hsl(var(--input))] bg-black/40 px-2 py-1.5 text-[12px] outline-none [color-scheme:dark]">
              {DAYS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={kind} onChange={(ev) => setKind(ev.target.value as BuiltCardKind)} aria-label="Card type" className="rounded-lg border border-[hsl(var(--input))] bg-black/40 px-2 py-1.5 text-[12px] outline-none [color-scheme:dark]">
              {(Object.keys(CARD_KINDS) as BuiltCardKind[]).map((x) => <option key={x} value={x}>{CARD_KINDS[x].label}</option>)}
            </select>
          </div>
          <input
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter") addCard(); }}
            placeholder={kind === "community_call" ? "e.g. Thursday community call — wins & blockers" : "Name it — the template opens next"}
            aria-label="Card title"
            className="mt-2 w-full rounded-lg border border-[hsl(var(--input))] bg-black/40 px-3 py-2 text-[12.5px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
          />
          <div className="mt-2.5 flex gap-2">
            <Button variant="champagne" size="sm" disabled={!title.trim()} onClick={addCard}><Plus /> Add card</Button>
            <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold transition-colors hover:bg-black/30"
          style={{ color: tone.c }}
        >
          <Plus className="h-3.5 w-3.5" /> Add to {week.title}
        </button>
      )}
    </div>
  );
}

/** The type's template — which fields show depends on the kind. */
function CardTemplateForm({ card, onChange, onRemove }: { card: BuiltCard; onChange: (c: BuiltCard) => void; onRemove: () => void }) {
  const k = CARD_KINDS[card.kind];
  const set = (patch: Partial<BuiltCard>) => onChange({ ...card, ...patch });
  const resources = card.resources ?? [];
  const [resLabel, setResLabel] = useState("");
  const [resUrl, setResUrl] = useState("");

  const addResource = () => {
    if (!resUrl.trim()) return;
    const r: BuiltResource = { id: uid("r"), label: resLabel.trim() || resUrl.trim().replace(/^https?:\/\/(www\.)?/, "").slice(0, 40), url: resUrl.trim() };
    set({ resources: [...resources, r] });
    setResLabel(""); setResUrl("");
  };

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className="mt-1">{node}</div>
    </div>
  );
  const input = (value: string | undefined, onV: (v: string) => void, placeholder: string, aria: string) => (
    <input
      value={value ?? ""}
      onChange={(ev) => onV(ev.target.value)}
      placeholder={placeholder}
      aria-label={aria}
      className="w-full rounded-lg border border-[hsl(var(--input))] bg-black/40 px-3 py-2 text-[12.5px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
    />
  );

  return (
    <div className="space-y-3 border-t border-[hsl(var(--border))] p-3">
      {field("Title", input(card.title, (v) => set({ title: v }), "Card title", `Title for ${card.title}`))}
      {k.fields.mentor && field("Mentor / host", input(card.mentor, (v) => set({ mentor: v }), "e.g. Rahul", `Mentor for ${card.title}`))}
      {field(k.briefLabel, (
        <textarea
          value={card.brief ?? ""}
          onChange={(ev) => set({ brief: ev.target.value })}
          rows={2}
          placeholder="One or two lines students see before opening it."
          aria-label={`Brief for ${card.title}`}
          className="w-full resize-none rounded-lg border border-[hsl(var(--input))] bg-black/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
        />
      ))}
      {k.fields.zoom && field("Zoom link · shown before the session", input(card.zoomUrl, (v) => set({ zoomUrl: v }), "https://zoom.us/j/…", `Zoom link for ${card.title}`))}
      {k.fields.recording && field("Recording link · replaces the Zoom door after the date", input(card.recordingUrl, (v) => set({ recordingUrl: v }), "R2 / Drive / video URL — appears once the class has run", `Recording link for ${card.title}`))}

      {k.fields.resources && field("Resources · videos, PDFs, Drive folders", (
        <div className="space-y-1.5">
          {resources.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1.5">
              <FileText className="h-3 w-3 shrink-0 text-[hsl(var(--accent-emerald))]" />
              <span className="min-w-0 flex-1 truncate text-[11.5px]">{r.label}</span>
              <button type="button" aria-label={`Remove resource ${r.label}`} onClick={() => set({ resources: resources.filter((x) => x.id !== r.id) })} className="grid h-5 w-5 place-items-center rounded text-[hsl(var(--muted-foreground))] hover:bg-black/40">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex gap-1.5">
            <input value={resLabel} onChange={(ev) => setResLabel(ev.target.value)} placeholder="Label" aria-label="Resource label"
              className="w-2/5 rounded-lg border border-[hsl(var(--input))] bg-black/40 px-2.5 py-1.5 text-[11.5px] outline-none placeholder:text-[hsl(var(--muted-foreground))]" />
            <input value={resUrl} onChange={(ev) => setResUrl(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") addResource(); }} placeholder="https://…" aria-label="Resource URL"
              className="flex-1 rounded-lg border border-[hsl(var(--input))] bg-black/40 px-2.5 py-1.5 text-[11.5px] outline-none placeholder:text-[hsl(var(--muted-foreground))]" />
            <Button variant="outline" size="sm" aria-label="Add resource" disabled={!resUrl.trim()} onClick={addResource}><Plus /></Button>
          </div>
        </div>
      ))}

      {k.fields.submission && field("Submission form · in-built, no Tally needed", (
        <div>
          <textarea
            value={card.submitPrompt ?? ""}
            onChange={(ev) => set({ submitPrompt: ev.target.value })}
            rows={2}
            placeholder='What should students submit? e.g. "Paste the link to your cut + one line on your hardest decision."'
            aria-label={`Submission prompt for ${card.title}`}
            className="w-full resize-none rounded-lg border border-[hsl(var(--input))] bg-black/40 px-3 py-2 text-[12.5px] leading-relaxed outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
          />
          <p className="mt-1 text-[10.5px] text-[hsl(var(--muted-foreground))]">Submissions land straight in the Mentor Desk — no external forms.</p>
        </div>
      ))}

      <div className="flex justify-between pt-1">
        <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <Trash2 className="h-3 w-3" /> Remove card
        </button>
        <span className="text-[10.5px] text-[hsl(var(--muted-foreground))]">Auto-kept — hit Save program when done</span>
      </div>
    </div>
  );
}

/* ── The generated Path — clickable now ─────────────────────────────────── */

const BUILT_SNAKE = [0, 40, 62, 40, 0, -40, -62, -40];

export function BuiltPathPreviewScreen({ s, go, programId }: Pick<ScreenProps, "s" | "go"> & { programId: string }) {
  const program = s.programs.find((p) => p.id === programId);
  if (!program) {
    return (
      <div className="space-y-6">
        <BackRow label="Admin" onClick={() => go("admin")} />
        <SurfaceCard variant="static" padding="lg" className="text-center text-[13px] text-[hsl(var(--muted-foreground))]">
          That program isn't saved yet — build and save it first.
        </SurfaceCard>
      </div>
    );
  }

  let nodeIndex = 0;

  return (
    <div className="space-y-6">
      <BackRow label="Back to the builder" onClick={() => go(`admin/builder/${program.id}`)} />
      <PageHeader
        eyebrow="Generated from your build · student view"
        title={<>{program.name || "Untitled program"}</>}
        subtitle="Tap ANY node — every card opens as the student sees it, rendered from what you filled in."
        actions={
          <Button variant="outline" size="sm" onClick={() => go(`admin/builder/${program.id}`)}>
            <Map /> Keep building
          </Button>
        }
      />

      <div className="mx-auto max-w-md lg:max-w-lg">
        <div className="flex flex-col items-center gap-6">
          {program.phases.map((ph, pi) => {
            const tone = PHASE_TONES[pi % PHASE_TONES.length];
            return (
              <div key={ph.id} className="flex w-full flex-col items-center gap-6">
                <div
                  className="relative w-full overflow-hidden rounded-2xl border px-5 py-4"
                  style={{ borderColor: `${tone.c}40`, background: `linear-gradient(120deg, ${tone.c}1f, transparent 65%)` }}
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: tone.c }}>
                    Phase {pi + 1} · {ph.weeks.length} week{ph.weeks.length !== 1 ? "s" : ""}
                  </div>
                  <div className="mt-0.5 text-[16px] font-bold tracking-[-0.01em]">{ph.name}</div>
                </div>

                {ph.weeks.map((w) => (
                  <div key={w.id} className="flex w-full flex-col items-center gap-5">
                    <div className="flex w-full items-center gap-3 py-1">
                      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[hsl(var(--border))]" />
                      <div className="text-center">
                        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: tone.c }}>{w.title}</div>
                        <div className="text-[10.5px] text-[hsl(var(--muted-foreground))]">{w.cards.length} step{w.cards.length !== 1 ? "s" : ""}</div>
                      </div>
                      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[hsl(var(--border))]" />
                    </div>

                    {w.cards.length === 0 && (
                      <div className="text-[11px] text-[hsl(var(--muted-foreground))]">No cards yet — add some in the builder.</div>
                    )}

                    {w.cards.map((c) => {
                      const k = CARD_KINDS[c.kind];
                      const off = BUILT_SNAKE[nodeIndex % BUILT_SNAKE.length];
                      nodeIndex += 1;
                      const current = nodeIndex === 1;
                      return (
                        <div key={c.id} className="relative flex flex-col items-center" style={{ transform: `translateX(${off}px)` }}>
                          <motion.button
                            type="button"
                            onClick={() => go(`builtcard/${program.id}/${c.id}`)}
                            aria-label={`${c.day} — ${c.title}`}
                            whileHover={{ scale: 1.08, y: -2 }}
                            whileTap={{ scale: 0.92, y: 3 }}
                            transition={{ type: "spring", stiffness: 340, damping: 18 }}
                            className="grid h-12 w-12 place-items-center rounded-full"
                            style={{
                              background: current ? tone.c : "hsl(var(--card))",
                              color: current ? "hsl(var(--cream-text))" : k.tint,
                              border: current ? "none" : `1px solid ${k.tint}55`,
                              boxShadow: `0 5px 0 ${current ? tone.d : "hsl(0 0% 5%)"}`,
                            }}
                          >
                            <k.icon className="h-4 w-4" />
                          </motion.button>
                          <div className="mt-2 text-center">
                            <div className="text-[10px] font-extrabold tracking-wide" style={{ color: current ? tone.c : "hsl(var(--muted-foreground))" }}>
                              {c.day.toUpperCase()} · {k.label.toUpperCase()}
                            </div>
                            <div className="max-w-[180px] text-[10.5px] leading-tight text-[hsl(var(--muted-foreground))]">{c.title}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}

          <div className="w-full pt-2">
            <SurfaceCard variant="static" padding="lg" className="text-center">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">Next</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                In the real build this program goes to the Cohort Launcher: pick a start date, and every card gets its calendar slot — same engine you already played.
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => go("admin/launch")}>Open the Launcher <ChevronRight /></Button>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── The student page for a built card — rendered from the template ─────── */

export function BuiltCardScreen({ s, d, go, programId, cardId }: ScreenProps & { programId: string; cardId: string }) {
  const program = s.programs.find((p) => p.id === programId);
  const located = program?.phases.flatMap((ph, pi) => ph.weeks.map((w) => ({ ph, pi, w }))).flatMap(({ ph, pi, w }) =>
    w.cards.filter((c) => c.id === cardId).map((c) => ({ card: c, week: w, phase: ph, pi })),
  )[0];
  const [draft, setDraft] = useState("");

  if (!program || !located) {
    return (
      <div className="space-y-6">
        <BackRow label="Admin" onClick={() => go("admin")} />
        <SurfaceCard variant="static" padding="lg" className="text-center text-[13px] text-[hsl(var(--muted-foreground))]">Card not found.</SurfaceCard>
      </div>
    );
  }

  const { card, week, phase, pi } = located;
  const k = CARD_KINDS[card.kind];
  const tone = PHASE_TONES[pi % PHASE_TONES.length];
  const allResources: BuiltResource[] = [
    ...(card.resources ?? []),
    ...(card.link ? [{ id: "legacy", label: "Attached link", url: card.link }] : []),
  ];
  const mySubmission = s.builtSubmissions.find((b) => b.cardId === card.id);
  const isCall = card.kind === "live_class" || card.kind === "community_call";

  return (
    <div className="space-y-6">
      <BackRow label={program.name || "The program"} onClick={() => go(`admin/preview/${program.id}`)} />
      <PageHeader
        eyebrow={`${phase.name} · ${week.title} · ${card.day} · ${k.label}`}
        title={card.title}
        subtitle={card.brief || undefined}
        meta={
          card.mentor ? (
            <span className="inline-flex items-center gap-1.5"><Radio className="h-3.5 w-3.5" style={{ color: tone.c }} /> Hosted by {card.mentor}</span>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="space-y-4">
          {!card.brief && !allResources.length && !card.submitPrompt && (
            <SurfaceCard variant="static" padding="lg" className="text-center text-[12.5px] text-[hsl(var(--muted-foreground))]">
              This card has a title and nothing else yet — open it in the builder and fill its template.
            </SurfaceCard>
          )}

          {allResources.length > 0 && (
            <SurfaceCard variant="static" padding="lg">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Resources</div>
              <div className="mt-2.5 space-y-2">
                {allResources.map((r) => (
                  <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="block">
                    <LinkCard url={r.url} title={r.label} compact />
                  </a>
                ))}
              </div>
            </SurfaceCard>
          )}

          {card.submitPrompt && (
            <SurfaceCard variant="static" padding="lg" className="border-[hsl(var(--accent-amber)/0.35)]">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--accent-amber))]">Submit here</div>
              <p className="mt-1.5 text-[13px] leading-relaxed">{card.submitPrompt}</p>
              {mySubmission ? (
                <div className="mt-3">
                  <div className="flex items-center gap-2 text-[hsl(var(--success))]">
                    <Check className="h-4 w-4" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Submitted — sitting in the Mentor Desk</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[hsl(var(--secondary))] p-3 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">{mySubmission.body}</p>
                </div>
              ) : (
                <>
                  <textarea
                    value={draft}
                    onChange={(ev) => setDraft(ev.target.value)}
                    rows={4}
                    placeholder="Your submission — links and notes"
                    aria-label={`Submission for ${card.title}`}
                    className="mt-3 w-full resize-none rounded-xl border border-[hsl(var(--input))] bg-black/40 p-3 text-[13px] leading-relaxed outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
                  />
                  <div className="mt-3">
                    <Button variant="champagne" className="w-full" disabled={!draft.trim()} onClick={() => d({ type: "submit_built", programId: program.id, cardId: card.id, body: draft })}>
                      <Send /> Submit — goes straight to the Mentor Desk
                    </Button>
                  </div>
                </>
              )}
            </SurfaceCard>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-24">
          {isCall && (
            <SurfaceCard variant="static" padding="lg">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--gold))]">
                {card.recordingUrl ? "Recording" : "Your seat"}
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                {card.recordingUrl
                  ? "The class has run — the recording replaces the Zoom door. Nothing re-locks."
                  : card.zoomUrl
                    ? "Join link is live. After the date, the recording appears right here."
                    : "The admin hasn't added the Zoom link yet — it'll appear here when they do."}
              </p>
              <div className="mt-3 space-y-2">
                {card.recordingUrl ? (
                  <Button variant="champagne" className="w-full" asChild>
                    <a href={card.recordingUrl} target="_blank" rel="noreferrer"><Video /> Watch the recording</a>
                  </Button>
                ) : card.zoomUrl ? (
                  <Button variant="champagne" className="w-full" asChild>
                    <a href={card.zoomUrl} target="_blank" rel="noreferrer"><Video /> Join on Zoom</a>
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled><Video /> Zoom link pending</Button>
                )}
              </div>
            </SurfaceCard>
          )}

          {card.kind === "task" && (
            <SurfaceCard variant="static" padding="lg">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">The drill</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                Do it, tick it, move on — XP and streak in the real build.
              </p>
              <div className="mt-3"><Button variant="outline" className="w-full"><Check /> Mark done</Button></div>
            </SurfaceCard>
          )}

          <SurfaceCard variant="static" padding="lg">
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <ClipboardList className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">This is your template, rendered</span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              Everything on this page came from the card's form in the builder — change it there, it changes here. That's the whole system.
            </p>
            <div className="mt-3">
              <Button variant="outline" size="sm" className="w-full" onClick={() => go(`admin/builder/${program.id}`)}>Edit this card in the builder</Button>
            </div>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
