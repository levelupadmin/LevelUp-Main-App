/**
 * The FROM-SCRATCH Program Builder — the founder's "plus, plus, plus".
 *
 * Any program, any shape: name it, add phases, add weeks inside phases, add
 * cards inside weeks (live class / community call / task / assignment /
 * resource with any link — Drive, recording, whatever). Nothing about the
 * 13-week Creator Academy is assumed. Save it, then open ITS OWN Path —
 * generated from what was just built, rendered with the same trail language
 * the students see.
 *
 * Zero database, same law: canonical components only.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, ChevronRight, Plus, X, Radio, Zap, Users,
  Eye, Trash2, Link2, Map,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SurfaceCard } from "@/components/patterns";
import { PHASE_TONES } from "./previewTheme";
import { BackRow, Serif, type ScreenProps } from "./PreviewScreens";
import type { BuiltCard, BuiltCardKind, BuiltPhase, BuiltProgram, BuiltWeek } from "./previewStore";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const CARD_KINDS: Record<BuiltCardKind, { label: string; icon: typeof Radio; tint: string; hasLink: boolean }> = {
  live_class: { label: "Live class", icon: Radio, tint: "hsl(var(--gold))", hasLink: false },
  community_call: { label: "Community call", icon: Users, tint: "hsl(var(--accent-violet))", hasLink: false },
  task: { label: "Task", icon: Check, tint: "hsl(var(--muted-foreground))", hasLink: false },
  assignment: { label: "Assignment", icon: Zap, tint: "hsl(var(--accent-amber))", hasLink: false },
  resource: { label: "Resource / link", icon: Link2, tint: "hsl(var(--accent-emerald))", hasLink: true },
};

let seq = 0;
const uid = (p: string) => `${p}-${++seq}-${Math.abs(Date.now() % 100000)}`;

const emptyWeek = (n: number): BuiltWeek => ({ id: uid("w"), title: `Week ${n}`, cards: [] });
const emptyPhase = (n: number): BuiltPhase => ({ id: uid("ph"), name: `Phase ${n}`, weeks: [emptyWeek(1)] });

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

  const canSave = program.name.trim().length > 0 && totals.cards > 0;

  return (
    <div className="space-y-6">
      <BackRow label="Admin" onClick={() => go("admin")} />
      <PageHeader
        eyebrow="Admin · Program Builder"
        title={<>Build a program from <Serif>scratch</Serif></>}
        subtitle="Name it, add phases, add weeks, add whatever each day needs. 2 weeks or 15 — the Path draws itself from what you build here."
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

      {/* Program name + shape summary */}
      <SurfaceCard variant="static" padding="lg">
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
      </SurfaceCard>

      {/* Phases → weeks → cards. Plus, plus, plus. */}
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
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-black/40 hover:text-[hsl(var(--destructive-text,0_84%_60%))]"
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
  const [link, setLink] = useState("");

  const addCard = () => {
    if (!title.trim()) return;
    const card: BuiltCard = { id: uid("c"), day, kind, title: title.trim(), link: CARD_KINDS[kind].hasLink && link.trim() ? link.trim() : undefined };
    onChange({ ...week, cards: [...week.cards, card] });
    setTitle(""); setLink(""); setAdding(false);
  };

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
            return (
              <div key={c.id} className="flex items-center gap-2.5 rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-2">
                <span className="w-9 shrink-0 text-[10px] font-extrabold uppercase text-[hsl(var(--muted-foreground))]">{c.day}</span>
                <k.icon className="h-3.5 w-3.5 shrink-0" style={{ color: k.tint }} />
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{c.title}</span>
                {c.link && <Link2 className="h-3 w-3 shrink-0 text-[hsl(var(--accent-emerald))]" />}
                <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide" style={{ borderColor: `${k.tint}66`, color: k.tint }}>
                  {k.label}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${c.title}`}
                  onClick={() => onChange({ ...week, cards: week.cards.filter((x) => x.id !== c.id) })}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-[hsl(var(--muted-foreground))] hover:bg-black/40"
                >
                  <X className="h-3 w-3" />
                </button>
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
            placeholder={kind === "community_call" ? "e.g. Thursday community call — wins & blockers" : kind === "resource" ? "e.g. B-roll shot list template" : "What happens?"}
            aria-label="Card title"
            className="mt-2 w-full rounded-lg border border-[hsl(var(--input))] bg-black/40 px-3 py-2 text-[12.5px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
          />
          {CARD_KINDS[kind].hasLink && (
            <input
              value={link}
              onChange={(ev) => setLink(ev.target.value)}
              placeholder="Paste a link — Google Drive, recording, anything"
              aria-label="Card link"
              className="mt-2 w-full rounded-lg border border-[hsl(var(--input))] bg-black/40 px-3 py-2 text-[12.5px] outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
            />
          )}
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

/* ── The generated Path — the payoff ────────────────────────────────────── */

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
  let weekNo = 0;

  return (
    <div className="space-y-6">
      <BackRow label="Back to the builder" onClick={() => go(`admin/builder/${program.id}`)} />
      <PageHeader
        eyebrow="Generated from your build · student view"
        title={<>{program.name || "Untitled program"}</>}
        subtitle="This Path didn't exist ten minutes ago. Every node below is a card your team added — no code, no template."
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

                {ph.weeks.map((w) => {
                  weekNo += 1;
                  const isFirst = weekNo === 1;
                  return (
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
                        const current = isFirst && nodeIndex === 1;
                        return (
                          <div key={c.id} className="relative flex flex-col items-center" style={{ transform: `translateX(${off}px)` }}>
                            <motion.div
                              whileHover={{ scale: 1.08, y: -2 }}
                              transition={{ type: "spring", stiffness: 340, damping: 18 }}
                              className="grid h-12 w-12 place-items-center rounded-full"
                              style={{
                                background: current ? tone.c : "hsl(var(--secondary))",
                                color: current ? "hsl(var(--cream-text))" : k.tint,
                                boxShadow: `0 5px 0 ${current ? tone.d : "hsl(0 0% 5%)"}`,
                              }}
                            >
                              <k.icon className="h-4 w-4" />
                            </motion.div>
                            <div className="mt-2 text-center">
                              <div className="text-[10px] font-extrabold tracking-wide" style={{ color: current ? tone.c : "hsl(var(--muted-foreground))" }}>
                                {c.day.toUpperCase()} · {k.label.toUpperCase()}
                              </div>
                              <div className="max-w-[180px] text-[10.5px] leading-tight text-[hsl(var(--muted-foreground))]">
                                {c.title}
                                {c.link && (
                                  <a href={c.link} target="_blank" rel="noreferrer" className="ml-1 inline-flex align-middle text-[hsl(var(--accent-emerald))]">
                                    <Link2 className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
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
