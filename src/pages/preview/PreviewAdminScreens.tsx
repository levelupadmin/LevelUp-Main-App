/**
 * The ADMIN DEMO — the architecture doc, playable.
 *
 * Three screens, zero database:
 *   AdminScreen        the hub: your cohorts + the two live tools
 *   CohortLauncher     launch_cohort() in the browser — start date + blackouts
 *                      → the full dated 13-week calendar → Announce
 *   TemplateStudio     edit a week's cards → SAVED edits project instantly
 *                      onto the student Path and session pages
 *
 * Same law as every preview file: canonical components only.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarPlus, Video, Megaphone, KeyRound, ChevronRight, Check, Rocket,
  PencilLine, Radio, Zap, ClipboardList, Eye, CalendarX, X, Layers, Plus, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, SurfaceCard } from "@/components/patterns";
import { ENGINE, PHASES, SESSION_INFO } from "./previewData";
import { generateSchedule, fmtDay, fmtTime, type ScheduledWeek } from "./previewAdmin";
import { toneForPhase } from "./previewTheme";
import { BackRow, type ScreenProps } from "./PreviewScreens";

/* ── Admin hub ──────────────────────────────────────────────────────────── */

export function AdminScreen({ s, d, go }: ScreenProps) {
  const tools = [
    { icon: Video, title: "Run the week", body: "The evening desk: mark a session done, drop the recording in, open the feedback gate, check who has submitted. A session is over when you say it is.", to: "admin/run", live: true },
    { icon: PencilLine, title: "Creator Academy content", body: "The real Cohort 02 curriculum, week by week. Pick a week, pick a card, fill the form its type defines. Weeks 0 and 1 are authored end to end.", to: "admin/week", live: true },
    { icon: Plus, title: "Build a program from scratch", body: "Any shape — 2 weeks or 15, your phases, your days, your cards (live classes, community calls, tasks, resources with links). The Path draws itself.", to: "admin/builder", live: true },
    { icon: Rocket, title: "Launch a cohort", body: "Template + start date + blackout days → the full dated calendar, previewed, then announced. Ten minutes, zero code.", to: "admin/launch", live: true },
    { icon: PencilLine, title: "Template Studio", body: "The Creator Academy curriculum as typed cards. Edit a card's content and watch it project onto the student Path.", to: "admin/template", live: true },
    { icon: Video, title: "Upload a recording", body: "Protected storage; plays only for enrolled students through an expiring link." },
    { icon: Megaphone, title: "Post an announcement", body: "Pinned to the top of the room's feed until you unpin it." },
    { icon: KeyRound, title: "Unlock a week for one student", body: `Override the gate with a reason and an audit trail.${s.week5Unlocked ? " (Week 5 currently open via the block.)" : ""}` },
  ];
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Creator Studio control"
        subtitle="The glowing tools are LIVE in this demo — build a program from nothing, launch the December cohort, edit the template."
      />

      {s.programs.length > 0 && (
        <Section title="Your programs" description="Built from scratch, in the app.">
          <div className="grid gap-3 lg:grid-cols-2">
            {s.programs.map((p) => {
              const weeks = p.phases.reduce((x, ph) => x + ph.weeks.length, 0);
              const cards = p.phases.reduce((x, ph) => x + ph.weeks.reduce((y, w) => y + w.cards.length, 0), 0);
              return (
                <SurfaceCard key={p.id} variant="static" padding="lg">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold">{p.name || "Untitled program"}</div>
                      <div className="mt-0.5 text-[11.5px] text-[hsl(var(--muted-foreground))]">
                        {p.phases.length} phase{p.phases.length !== 1 ? "s" : ""} · {weeks} week{weeks !== 1 ? "s" : ""} · {cards} card{cards !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => go(`admin/preview/${p.id}`)}><Eye /> Path</Button>
                      <Button variant="outline" size="sm" onClick={() => go(`admin/builder/${p.id}`)}><PencilLine /> Edit</Button>
                      <button
                        type="button"
                        aria-label={`Delete ${p.name || "untitled program"}`}
                        onClick={() => d({ type: "delete_program", id: p.id })}
                        className="grid h-8 w-8 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-black/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Your cohorts">
        <div className="grid gap-3 lg:grid-cols-2">
          <SurfaceCard variant="static" padding="lg">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[13.5px] font-semibold">Creator Academy · Cohort 01</div>
                <div className="mt-0.5 text-[11.5px] text-[hsl(var(--muted-foreground))]">Template v2 · started Sun 6 Jul · Week 4 of 13</div>
              </div>
              <span className="rounded-full border border-[hsl(var(--success)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--success))]">Live</span>
            </div>
          </SurfaceCard>
          {s.cohort ? (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
              <SurfaceCard variant="static" padding="lg" className="border-[hsl(var(--gold)/0.35)]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[13.5px] font-semibold">{s.cohort.name}</div>
                    <div className="mt-0.5 text-[11.5px] text-[hsl(var(--muted-foreground))]">
                      Template v2 · starts {fmtDay(`${s.cohort.start}T00:00:00`)}
                      {s.cohort.shiftedCount > 0 && ` · ${s.cohort.shiftedCount} class${s.cohort.shiftedCount > 1 ? "es" : ""} shifted past blackouts`}
                    </div>
                  </div>
                  <span className="rounded-full border border-[hsl(var(--gold)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--gold))]">Announced</span>
                </div>
              </SurfaceCard>
            </motion.div>
          ) : (
            <button
              type="button"
              onClick={() => go("admin/launch")}
              className="grid min-h-[72px] place-items-center rounded-xl border border-dashed border-[hsl(var(--border-hover))] bg-black/30 text-[12px] font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
            >
              + Launch the next cohort
            </button>
          )}
        </div>
      </Section>

      <Section title="Tools">
        <div className="grid gap-4 lg:grid-cols-2">
          {tools.map((r) =>
            r.live ? (
              <SurfaceCard key={r.title} variant="interactive" padding="lg" className="border-[hsl(var(--gold)/0.3)]" onClick={() => go(r.to!)}>
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--gold)/0.14)]">
                    <r.icon className="h-4 w-4 text-[hsl(var(--gold))]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold">{r.title}</span>
                      <span className="rounded-full bg-[hsl(var(--gold)/0.14)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--gold))]">Try it</span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">{r.body}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                </div>
              </SurfaceCard>
            ) : (
              <SurfaceCard key={r.title} variant="static" padding="lg">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--cream)/0.1)]">
                    <r.icon className="h-4 w-4 text-[hsl(var(--cream))]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">{r.title}</div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">{r.body}</p>
                  </div>
                </div>
              </SurfaceCard>
            ),
          )}
        </div>
      </Section>
    </div>
  );
}

/* ── Cohort Launcher — the December-5th button ──────────────────────────── */

export function CohortLauncherScreen({ s, d, go }: ScreenProps) {
  const [start, setStart] = useState("2026-12-05");
  const [blackouts, setBlackouts] = useState<string[]>([]);
  const [blackoutDraft, setBlackoutDraft] = useState("");
  const [generated, setGenerated] = useState<ScheduledWeek[] | null>(null);

  const shiftedCount = useMemo(() => (generated ?? []).filter((w) => w.shifted).length, [generated]);
  const announced = Boolean(s.cohort);

  const addBlackout = () => {
    if (!blackoutDraft || blackouts.includes(blackoutDraft)) return;
    setBlackouts((b) => [...b, blackoutDraft].sort());
    setBlackoutDraft("");
    setGenerated(null); // calendar is stale — regenerate
  };

  return (
    <div className="space-y-6">
      <BackRow label="Admin" onClick={() => go("admin")} />
      <PageHeader
        eyebrow="Admin · Cohort Launcher"
        title={<>Launch the next cohort</>}
        subtitle="Pick the template, pick the date, mark the holidays. The calendar generates itself — you just read it and press Announce."
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr] lg:items-start">
        {/* The form — everything an admin decides, nothing more. */}
        <SurfaceCard variant="static" padding="lg" className="lg:sticky lg:top-24">
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Template</label>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2.5">
                <Layers className="h-4 w-4 text-[hsl(var(--gold))]" />
                <span className="text-[13px] font-medium">Creator Academy · v2</span>
                <span className="ml-auto rounded-full border border-[hsl(var(--success)/0.4)] px-2 py-0.5 text-[9.5px] font-bold text-[hsl(var(--success))]">Published</span>
              </div>
              <p className="mt-1 text-[10.5px] text-[hsl(var(--muted-foreground))]">The cohort pins this version forever — later template edits never move a running batch.</p>
            </div>

            <div>
              <label htmlFor="cohort-start" className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Start date · first live class</label>
              <input
                id="cohort-start"
                type="date"
                value={start}
                onChange={(ev) => { setStart(ev.target.value); setGenerated(null); }}
                className="mt-1.5 w-full rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2.5 text-[13px] outline-none [color-scheme:dark] focus:border-[hsl(var(--border-hover))]"
              />
            </div>

            <div>
              <label htmlFor="blackout-input" className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Blackout days · no class</label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="blackout-input"
                  type="date"
                  value={blackoutDraft}
                  onChange={(ev) => setBlackoutDraft(ev.target.value)}
                  className="w-full rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2.5 text-[13px] outline-none [color-scheme:dark] focus:border-[hsl(var(--border-hover))]"
                />
                <Button variant="outline" size="sm" disabled={!blackoutDraft} onClick={addBlackout}>Add</Button>
              </div>
              {blackouts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {blackouts.map((b) => (
                    <span key={b} className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--accent-crimson)/0.4)] px-2.5 py-1 text-[11px] text-[hsl(var(--accent-crimson))]">
                      <CalendarX className="h-3 w-3" /> {fmtDay(`${b}T00:00:00`)}
                      <button type="button" aria-label={`Remove blackout ${b}`} onClick={() => { setBlackouts((x) => x.filter((y) => y !== b)); setGenerated(null); }}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[10.5px] text-[hsl(var(--muted-foreground))]">A class landing on a blackout pushes itself — and everything after — one week. Nothing already done ever moves.</p>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">Mentor</label>
              <div className="mt-1.5 rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2.5 text-[13px]">Rahul · Filmmaking</div>
            </div>

            <Button variant="champagne" className="w-full" onClick={() => setGenerated(generateSchedule(start, blackouts))}>
              <CalendarPlus /> Generate the calendar
            </Button>
          </div>
        </SurfaceCard>

        {/* The generated calendar — read it, then announce it. */}
        <div className="space-y-4">
          {!generated && !announced && (
            <SurfaceCard variant="static" padding="lg" className="grid min-h-[200px] place-items-center text-center">
              <div>
                <CalendarPlus className="mx-auto h-6 w-6 text-[hsl(var(--muted-foreground))]" />
                <p className="mt-2 max-w-xs text-[12.5px] text-[hsl(var(--muted-foreground))]">
                  Set the date, add any holidays, and generate. Every week's class, block deadline and review lands on the calendar automatically.
                </p>
              </div>
            </SurfaceCard>
          )}

          <AnimatePresence>
            {generated && (
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 240, damping: 26 }} className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[hsl(var(--border-hover))] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">13 weeks · {generated.length * 4} cards dated</span>
                  <span className="rounded-full border border-[hsl(var(--border-hover))] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">Demo Day {fmtDay(generated[12].reviewISO)}</span>
                  {shiftedCount > 0 && (
                    <span className="rounded-full border border-[hsl(var(--accent-amber)/0.45)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--accent-amber))]">
                      {shiftedCount} class{shiftedCount > 1 ? "es" : ""} shifted past blackouts
                    </span>
                  )}
                </div>

                {PHASES.map((p) => {
                  const t = toneForPhase(p.name);
                  const rows = generated.filter((w) => w.phase === p.name);
                  return (
                    <div key={p.name}>
                      <div className="pb-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.18em]" style={{ color: t.c }}>{p.name} · {p.weeks}</div>
                      <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                        {rows.map((w) => (
                          <div key={w.week} className="flex items-center gap-3 bg-[hsl(var(--card))] px-3 py-2.5">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-extrabold" style={{ background: t.c, color: "hsl(var(--cream-text))" }}>
                              {w.week}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12.5px] font-semibold">{w.title}</div>
                              <div className="text-[10.5px] text-[hsl(var(--muted-foreground))]">
                                Class {fmtDay(w.classISO)} {fmtTime(w.classISO)} · block due {fmtDay(w.blockISO)} {fmtTime(w.blockISO)} · review {fmtDay(w.reviewISO)}
                              </div>
                            </div>
                            {w.shifted && (
                              <span className="shrink-0 rounded-full border border-[hsl(var(--accent-amber)/0.45)] px-2 py-0.5 text-[9.5px] font-bold text-[hsl(var(--accent-amber))]">shifted</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {!announced ? (
                  <Button
                    variant="champagne"
                    className="w-full"
                    onClick={() =>
                      d({
                        type: "launch_cohort",
                        cohort: { name: "Creator Academy · Cohort 03", start, blackouts, shiftedCount },
                      })
                    }
                  >
                    <Rocket /> Announce Creator Academy · Cohort 03
                  </Button>
                ) : (
                  <SurfaceCard variant="static" padding="lg" className="border-[hsl(var(--success)/0.35)]">
                    <div className="flex items-center gap-2 text-[hsl(var(--success))]">
                      <Check className="h-4 w-4" />
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Announced</span>
                    </div>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                      Cohort 03 now sits on the admin hub with its calendar pinned to template v2. In the real build this is where enrolment opens, Zoom meetings get created, and the student Path renders these exact dates.
                    </p>
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={() => go("admin")}>Back to the hub <ChevronRight /></Button>
                    </div>
                  </SurfaceCard>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ── Template Studio — edit a card, watch it hit the student Path ───────── */

const CARD_BADGES = {
  live_session: { label: "Live session", icon: Radio, cls: "border-[hsl(var(--gold)/0.4)] text-[hsl(var(--gold))]" },
  task: { label: "Task", icon: Check, cls: "border-[hsl(var(--border-hover))] text-[hsl(var(--muted-foreground))]" },
  block: { label: "Block", icon: Zap, cls: "border-[hsl(var(--accent-amber)/0.45)] text-[hsl(var(--accent-amber))]" },
  review: { label: "Review", icon: ClipboardList, cls: "border-[hsl(var(--accent-emerald)/0.45)] text-[hsl(var(--accent-emerald))]" },
} as const;

export function TemplateStudioScreen({ s, d, go }: ScreenProps) {
  const [week, setWeek] = useState(6);
  const e = ENGINE[week];
  const t = toneForPhase(e.phase);
  const override = s.overrides[week] ?? {};
  const [blurb, setBlurb] = useState<string | null>(null);
  const [block, setBlock] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const liveBlurb = blurb ?? override.blurb ?? SESSION_INFO[week]?.blurb ?? "";
  const liveBlock = block ?? override.block ?? e.block;
  const dirty = blurb !== null || block !== null;

  const pickWeek = (n: number) => { setWeek(n); setBlurb(null); setBlock(null); setSaved(false); };

  const save = () => {
    d({ type: "admin_edit_card", week, blurb: blurb ?? undefined, block: block ?? undefined });
    setBlurb(null); setBlock(null); setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
      <BackRow label="Admin" onClick={() => go("admin")} />
      <PageHeader
        eyebrow="Admin · Template Studio"
        title="Creator Academy · template v2"
        subtitle="Each week is a set of typed cards. Fill the type's form — the student screens render it. Save, then view it as a student."
      />

      {/* Week picker */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ENGINE.map((w) => (
          <button
            key={w.n}
            type="button"
            onClick={() => pickWeek(w.n)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors ${
              week === w.n ? "border-[hsl(var(--border-hover))] bg-[hsl(var(--secondary))]" : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
            }`}
            style={week === w.n ? { color: toneForPhase(w.phase).c } : undefined}
          >
            W{w.n}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        {/* The cards + the form */}
        <div className="space-y-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: t.c }}>
            Week {week} · {e.title}
          </div>

          {/* live_session card — editable blurb */}
          <SurfaceCard variant="static" padding="lg">
            <CardHead kind="live_session" title={`Live class — ${e.title}`} meta="Sun · 3:00 PM · 20 XP" />
            <label htmlFor="tpl-blurb" className="mt-3 block text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
              Session blurb <span className="normal-case tracking-normal">(shows on the Path hover + session page)</span>
            </label>
            <textarea
              id="tpl-blurb"
              value={liveBlurb}
              onChange={(ev) => setBlurb(ev.target.value)}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-xl border border-[hsl(var(--input))] bg-black/40 p-3 text-[13px] leading-relaxed outline-none focus:border-[hsl(var(--border-hover))]"
            />
            <div className="mt-2 space-y-1">
              {(SESSION_INFO[week]?.agenda ?? []).map((line, i) => (
                <div key={line} className="flex gap-2 text-[11.5px] text-[hsl(var(--muted-foreground))]">
                  <span className="font-bold" style={{ color: t.c }}>{i + 1}.</span> {line}
                </div>
              ))}
            </div>
          </SurfaceCard>

          {/* block card — editable deliverable */}
          <SurfaceCard variant="static" padding="lg">
            <CardHead kind="block" title="The block — the week's one deliverable" meta="Thu · 9:00 PM · 25 XP · gates next week" />
            <label htmlFor="tpl-block" className="mt-3 block text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
              Deliverable
            </label>
            <input
              id="tpl-block"
              value={liveBlock}
              onChange={(ev) => setBlock(ev.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[hsl(var(--input))] bg-black/40 px-3 py-2.5 text-[13px] outline-none focus:border-[hsl(var(--border-hover))]"
            />
          </SurfaceCard>

          {/* the two fixed cards — visible, not editable in the demo */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SurfaceCard variant="static" padding="lg">
              <CardHead kind="task" title="Guided drill" meta="Tue · 10 XP" />
            </SurfaceCard>
            <SurfaceCard variant="static" padding="lg">
              <CardHead kind="review" title="Ship / Fix / Hold" meta="Sat · 6 PM · mentor-driven" />
            </SurfaceCard>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="champagne" disabled={!dirty} onClick={save}>
              <Check /> Save to template
            </Button>
            <AnimatePresence>
              {saved && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[hsl(var(--success))]"
                >
                  <Check className="h-3.5 w-3.5" /> Saved — live on the student Path
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* The point of the whole demo: admin writes, student screen shows it. */}
        <div className="space-y-3 lg:sticky lg:top-24">
          <SurfaceCard variant="static" padding="lg" className="border-[hsl(var(--cream)/0.25)]">
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <Eye className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Student preview · live</span>
            </div>
            <div className="mt-3 rounded-xl border border-[hsl(var(--border))] bg-black/40 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: t.c }}>
                Week {week} · {e.phase}
              </div>
              <div className="mt-1 text-[15px] font-bold tracking-[-0.01em]">{e.title}</div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">{liveBlurb}</p>
              <div className="mt-2.5 border-t border-[hsl(var(--border))] pt-2.5 text-[11.5px] text-[hsl(var(--muted-foreground))]">
                The block: <span className="text-[hsl(var(--foreground))]">{liveBlock}</span>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              This panel renders the same data the student's session page reads. Unsaved edits preview here; saved edits hit the real Path.
            </p>
            <div className="mt-3">
              <Button variant="outline" size="sm" className="w-full" onClick={() => go(`session/${week}`)}>
                <Eye /> View Week {week} as a student
              </Button>
            </div>
          </SurfaceCard>

          <SurfaceCard variant="static" padding="lg">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">How this scales</div>
            <p className="mt-2 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              Six card types, each a fixed form — admins fill forms, never design screens. A new product (Editing Studio, Filmmaking Studio) is this same editor on a cloned template: different weeks, different cards, zero code.
            </p>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}

function CardHead({ kind, title, meta }: { kind: keyof typeof CARD_BADGES; title: string; meta: string }) {
  const b = CARD_BADGES[kind];
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold">{title}</div>
        <div className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{meta}</div>
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${b.cls}`}>
        <b.icon className="h-3 w-3" /> {b.label}
      </span>
    </div>
  );
}
