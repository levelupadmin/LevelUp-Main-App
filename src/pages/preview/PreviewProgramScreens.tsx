/**
 * THE REAL PATH — LevelUp Creator Academy, rendered from the template.
 *
 * 🔴 WHAT CHANGED, AND WHY IT MATTERS (founder call 2026-08-15). The previous
 * Path was a beautiful shell over invented content: thirteen dummy weeks, and
 * clicking Tuesday landed you on the same page as clicking Sunday. This one
 * draws itself from `previewProgram.LUCA` — the actual Cohort 02 curriculum —
 * and every day is its own card with its own type, its own form, its own gate.
 * Nothing on these screens is hard-coded prose: if you cannot point at the
 * admin field that produced a pixel, the pixel is a bug.
 *
 * The four card types the founder named, and nothing else:
 *   live_session    mentor · what you'll learn · Zoom door → recording door
 *   community_call  host · time · Zoom. No work, no gate.
 *   micro           the day's drill: brief · resources · mark done
 *   block           the week's deliverable + the submission box
 *
 * Recording and review are NOT types. A recording is the second face of a live
 * session; a review is a live session that reads a week's blocks. Making them
 * types would double every node on the trail and buy nothing.
 */
import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Lock, Video, Users, Play, Radio, Zap, ExternalLink, Star, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { PageHeader, Section, SurfaceCard } from "@/components/patterns";
import { Serif } from "./PreviewScreens";
import { snakeOffset, toneForPhase, type PhaseTone } from "./previewTheme";
import type { PlayAction, PlayState } from "./previewStore";
import { activeProgram } from "./previewStore";
import {
  KIND_LABEL, RESOURCE_LABEL, dateOf, fmtDate, dayName, findCard, orderedCards,
  type AnswerValue, type CardKind, type ProgramTemplate, type Question,
  type ResourceKind, type TemplateCard, type TemplateWeek,
} from "./previewProgram";
import { cardState, recordingVerdict, blocksDone, weekOpen, type UnlockInput } from "./previewUnlock";
import { CelebrationOverlay, type Celebration } from "./Celebrate";
import { answersFor, roomFor, sinceOpen, type ActivityStage } from "./previewCohort";
import { Podium, BoardSheet, StandingSheet, RulesSheet, type Standing } from "./PreviewBoard";

/** The prototype's "today". Cohort 02 week 0 is live, week 1 is next. */
export const TODAY_ISO = "2026-08-18";

/** One tint per card type. Colour carries the type, nothing else. */
const TINT: Record<CardKind, { bg: string; fg: string; ring: string }> = {
  live_session:   { bg: "hsl(var(--accent-violet)/0.12)", fg: "hsl(var(--accent-violet))", ring: "hsl(var(--accent-violet)/0.45)" },
  community_call: { bg: "hsl(var(--success)/0.12)",       fg: "hsl(var(--success))",       ring: "hsl(var(--success)/0.45)" },
  micro:          { bg: "hsl(var(--secondary))",          fg: "hsl(var(--muted-foreground))", ring: "hsl(var(--border))" },
  block:          { bg: "hsl(var(--gold)/0.14)",          fg: "hsl(var(--gold))",          ring: "hsl(var(--gold)/0.5)" },
};

export function useUnlock(s: PlayState): UnlockInput {
  return useMemo(
    () => ({
      progress: s.progress,
      submittedCardIds: s.submissions.map((x) => x.cardId),
      todayISO: TODAY_ISO,
    }),
    [s.progress, s.submissions],
  );
}

/**
 * The card, as it is right now. Admin edits rewrite the program in state, so
 * there is nothing to layer — this exists so call sites read intent, and so
 * there is one place to add a per-student override later.
 */
export function resolve(_s: PlayState, card: TemplateCard): TemplateCard {
  return card;
}

/** Dates come from the batch start date, which the admin can change. */
const makeDOf = (t: ProgramTemplate) => (w: number, d: number) => dateOf(t, w, d);


/* ─────────────────────────────────────────────────────────────────────────
   THE PATH — one continuous winding trail, over the real curriculum
   ─────────────────────────────────────────────────────────────────────────

   🔴 THE MISTAKE THIS UNDOES (founder, 2026-08-15). When the dummy content was
   replaced with the real curriculum, the trail went with it and the Path
   became a list of rows. That threw away the only part of this room anyone
   could not buy off a shelf: the board with lips under the nodes, a colour per
   phase, a winding line, a halo on the step you are standing on. The data
   model was right and the surface was wrong. The trail is the surface — the
   real curriculum now runs THROUGH it, not instead of it.
   ───────────────────────────────────────────────────────────────────────── */

interface TrailNode {
  card: TemplateCard;
  week: TemplateWeek;
  state: "done" | "current" | "info" | "locked";
  why?: string;
  when: Date;
}

/**
 * "Current" is the first thing you could actually do — the one node that gets
 * the halo and the pill. Everything past it that is open reads as available,
 * not as urgent. One target on screen at a time.
 */
function buildTrail(s: PlayState, u: UnlockInput): TrailNode[] {
  const dOf = makeDOf(activeProgram(s));
  const out: TrailNode[] = [];
  let currentTaken = false;
  for (const week of activeProgram(s).weeks) {
    for (const raw of orderedCards(week)) {
      const card = resolve(s, raw);
      const v = cardState(activeProgram(s), week, card, u, dOf);
      const when = dOf(week.no, card.dayOffset);
      let state: TrailNode["state"];
      if (v.state === "done") state = "done";
      else if (v.state === "locked") state = "locked";
      else if (!currentTaken && !card.needsAuthoring) { state = "current"; currentTaken = true; }
      else state = "info";
      out.push({ card, week, state, why: v.why, when });
    }
  }
  return out;
}

const PILL: Record<CardKind, string> = {
  live_session: "JOIN", community_call: "DROP IN", micro: "START", block: "SUBMIT",
};

function Halo({ tint }: { tint: string }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full"
      style={{ border: `2px solid ${tint}` }}
      animate={{ scale: [1, 1.45], opacity: [0.55, 0] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

const FACE: Record<CardKind, typeof Video> = {
  live_session: Radio, community_call: Users, micro: Play, block: Zap,
};

function Node({ node, tone, index, go }: { node: TrailNode; tone: PhaseTone; index: number; go: (k: string) => void }) {
  const off = snakeOffset(index, false) * 0.75;
  const { card, state } = node;
  const isCurrent = state === "current";
  const isInfo = state === "info";

  /**
   * 🔴 THE RESTRAINT RULE (founder, 2026-08-15): "keep the colours a little on
   * the darker palette, don't make it too colourful." The deck's interior
   * slides are almost monochrome and colour marks one thing per screen. So:
   * the step you are ON is the brightest thing here, in cream, not the most
   * saturated. Done carries a thin accent outline rather than a filled tile.
   * Everything else is grey and gets out of the way.
   */
  const palette =
    state === "done" ? { bg: "hsl(var(--card))", fg: "hsl(var(--success))", lip: "hsl(0 0% 5%)" }
    : isCurrent ? { bg: "hsl(var(--cream))", fg: "hsl(var(--cream-text))", lip: "hsl(0 0% 4%)" }
    : isInfo ? { bg: "hsl(var(--card))", fg: "hsl(var(--muted-foreground))", lip: "hsl(0 0% 5%)" }
    : { bg: "hsl(var(--card))", fg: "hsl(0 0% 32%)", lip: "hsl(0 0% 5%)" };

  const Icon = FACE[card.kind];
  const face =
    state === "done" ? <Check className="h-4 w-4" strokeWidth={3} />
    : state === "locked" ? <Lock className="h-3.5 w-3.5" />
    : <Icon className={`h-4 w-4 ${card.kind === "micro" ? "fill-current" : ""}`} />;

  // Every node opens. Reading is never gated — only doing is. A locked node
  // still shows you its brief, its mentor and the reason it is shut.
  const hint =
    state === "done" ? "Done — XP banked"
    : state === "locked" ? (node.why ?? "Opens later")
    : card.kind === "live_session" ? "Open the session — Zoom, resources, recording"
    : card.kind === "community_call" ? "Open the room"
    : card.kind === "block" ? "Open the submission box"
    : "Open it";

  return (
    <div className="relative flex flex-col items-center" style={{ transform: `translateX(${off}px)` }}>
      {isCurrent && (
        <div className="absolute -top-8 z-10 animate-bounce" style={{ animationDuration: "1.6s" }}>
          <div className="rounded-md bg-[hsl(var(--cream))] px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-[hsl(var(--cream-text))]">
            {PILL[card.kind]}
          </div>
        </div>
      )}
      <HoverCard openDelay={120} closeDelay={60}>
        <HoverCardTrigger asChild>
          <motion.button
            type="button"
            onClick={() => go(`card/${card.id}`)}
            aria-label={`${dayName(node.when)} ${card.time ?? ""} — ${card.title}`}
            whileHover={{ scale: 1.08, y: -2 }}
            whileTap={{ scale: 0.92, y: 3 }}
            transition={{ type: "spring", stiffness: 340, damping: 18 }}
            className={`relative grid h-12 w-12 place-items-center rounded-[16px] text-[15px] font-semibold ${state === "locked" ? "opacity-80" : ""} ${state !== "current" ? "border" : ""}`}
            style={{
              background: palette.bg,
              color: palette.fg,
              borderColor: state === "done" ? "hsl(var(--success)/0.35)" : "hsl(var(--border))",
              boxShadow: state === "current" ? `0 5px 0 ${palette.lip}, 0 0 0 5px hsl(var(--cream)/0.07)` : `0 4px 0 ${palette.lip}`,
            }}
          >
            {isCurrent && <Halo tint="hsl(var(--cream)/0.5)" />}
            {face}
          </motion.button>
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="center"
          className="w-72 border-[hsl(var(--border))] bg-black/85 p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
        >
          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.c }}>
                Week {node.week.no} · {dayName(node.when)}{card.time ? ` ${card.time}` : ""}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--gold)/0.35)] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--gold))]">
                <Zap className="h-3 w-3" /> {card.xp} XP
              </span>
            </div>
            <div className="mt-1.5 text-[13.5px] font-semibold leading-snug">{card.title}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
              {KIND_LABEL[card.kind]}
              {card.mentor ? ` · ${card.mentor}` : ""}
            </div>
            {card.blurb && (
              <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">{card.blurb}</p>
            )}
            <div
              className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold"
              style={state === "locked" ? { color: "hsl(var(--muted-foreground))" } : { color: tone.c }}
            >
              {state === "locked" ? <Lock className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} {hint}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
      <div className="mt-2 text-center">
        <div
          className="text-[10px] font-extrabold tracking-wide"
          style={{ color: isCurrent ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
        >
          {dayName(node.when).toUpperCase()}{card.time ? ` · ${card.time}` : ""}
        </div>
        <div className="max-w-[190px] text-[10.5px] leading-tight text-[hsl(var(--muted-foreground))]">{card.title}</div>
      </div>
    </div>
  );
}

function WeekDivider({ week, tone, verdict, dOf }: { week: TemplateWeek; tone: PhaseTone; verdict: { state: string; why?: string }; dOf: (w: number, d: number) => Date }) {
  const locked = verdict.state === "locked";
  const block = week.cards.find((c) => c.kind === "block");
  return (
    <div className="flex w-full items-center gap-3 py-1">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[hsl(var(--border))]" />
      <div className="max-w-[300px] text-center">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
          Week {String(week.no).padStart(2, "0")} · {fmtDate(dOf(week.no, 0))}
        </div>
        <div className={`text-[12.5px] font-bold tracking-[-0.01em] ${locked ? "text-[hsl(var(--muted-foreground))]" : ""}`}>
          {week.title}
          {week.noSession && (
            <span className="ml-1.5 rounded bg-[hsl(var(--gold)/0.16)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[hsl(var(--gold))]">
              no session
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[10.5px] leading-snug text-[hsl(var(--muted-foreground))]">
          {week.noSession
            ? week.noSessionNote || "No class this week. The dates do not move."
            : locked
              ? `${verdict.why} Session details are already open.`
              : block
                ? `The block: ${block.title.replace(/^Week \d+ block — /, "")}`
                : ""}
        </div>
      </div>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[hsl(var(--border))]" />
    </div>
  );
}

function PhaseBanner({ name, weeks, tone }: { name: string; weeks: string; tone: PhaseTone }) {
  return (
    <div className="w-full">
      <span className="inline-block rounded-full border border-[hsl(var(--border-hover))] px-3 py-1 text-[11px] text-[hsl(var(--muted-foreground))]">
        Phase · {weeks}
      </span>
      {/* The deck's move: cream heading, one phrase carrying the accent. */}
      <div className="mt-2.5 text-[22px] font-semibold tracking-[-0.01em]">
        {name.split(" ").slice(0, -1).join(" ")}{" "}
        <span style={{ color: tone.c }}>{name.split(" ").slice(-1)}</span>
      </div>
    </div>
  );
}

export function ProgramPathScreen({ s, go }: { s: PlayState; go: (k: string) => void }) {
  const [jump, setJump] = useState(false);
  const [board, setBoard] = useState(false);
  const [who, setWho] = useState<Standing | null>(null);
  const u = useUnlock(s);
  const dOf = makeDOf(activeProgram(s));
  const nodes = useMemo(() => buildTrail(s, u), [s, u]);
  const done = nodes.filter((n) => n.state === "done").length;
  const blocks = blocksDone(activeProgram(s), u.submittedCardIds);
  const weekRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const phases: Array<{ name: string; weeks: TemplateWeek[] }> = [];
  for (const w of activeProgram(s).weeks) {
    const last = phases[phases.length - 1];
    if (last && last.name === w.phase) last.weeks.push(w);
    else phases.push({ name: w.phase, weeks: [w] });
  }

  const progressBar = (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
      <motion.div
        className="h-full rounded-full"
        style={{ background: "linear-gradient(90deg, hsl(var(--gold)), hsl(var(--champagne-from)))" }}
        initial={false}
        animate={{ width: `${Math.round((done / nodes.length) * 100)}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="The Path"
        title={<>Your Distribution <Serif>Engine</Serif></>}
        subtitle="One trail, thirteen blocks. Sessions are always open to read — doors open on the date, once the previous block is in."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setJump(true)}>All weeks</Button>
            <Button variant="outline" size="sm" onClick={() => setBoard(true)}>The board</Button>
          </div>
        }
      />

      {/* Thirteen weeks is a long scroll. Founder asked for this back, and he
          was right: on week nine, reaching week nine should not be a workout. */}
      <AnimatePresence>
        {jump && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setJump(false)} role="dialog" aria-label="All weeks"
          >
            <motion.div
              className="max-h-[80vh] w-full max-w-[460px] overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
              initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 text-[15px] font-semibold">All weeks</div>
              {activeProgram(s).weeks.map((w) => {
                const v = weekOpen(activeProgram(s), w.no, u, dOf);
                return (
                  <button
                    key={w.no}
                    type="button"
                    onClick={() => {
                      setJump(false);
                      window.setTimeout(() => weekRefs.current[w.no]?.scrollIntoView({ behavior: "smooth", block: "start" }), 240);
                    }}
                    className="flex w-full items-baseline justify-between gap-3 border-t border-[hsl(var(--border))] py-2.5 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px]">Week {String(w.no).padStart(2, "0")} · {w.title}</span>
                      <span className="block text-[11px] text-[hsl(var(--muted-foreground))]">
                        {fmtDate(dOf(w.no, 0))}{w.noSession ? " · no session" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-[hsl(var(--muted-foreground))]">
                      {v.state === "open" ? "open" : "locked"}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BoardSheet s={s} open={board} onClose={() => setBoard(false)} onOpen={(st) => { setBoard(false); setWho(st); }} />
      <StandingSheet s={s} standing={who} onClose={() => setWho(null)} />

      <div className="sticky top-0 z-10 -mx-4 border-b border-[hsl(var(--border))] bg-black/85 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1">{progressBar}</div>
          <span className="shrink-0 text-[10.5px] font-bold text-[hsl(var(--muted-foreground))]">
            {blocks.done}/{blocks.total} blocks
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mx-auto max-w-md lg:max-w-lg">
          <div className="mb-6 hidden lg:block">
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-bold text-[hsl(var(--muted-foreground))]">
              <span>PROGRESS</span>
              <span>{done} of {nodes.length} steps · {blocks.done} of {blocks.total} blocks</span>
            </div>
            {progressBar}
          </div>

          <div className="flex flex-col items-center gap-6">
            {phases.map((p) => {
              const tone = toneForPhase(p.name);
              const span = p.weeks.length > 1 ? `W${p.weeks[0].no}–W${p.weeks[p.weeks.length - 1].no}` : `W${p.weeks[0].no}`;
              return (
                <div key={p.name} className="flex w-full flex-col items-center gap-6">
                  <PhaseBanner name={p.name} weeks={span} tone={tone} />
                  {p.weeks.map((week) => (
                    <div
                      key={week.no}
                      ref={(el) => { weekRefs.current[week.no] = el; }}
                      data-week={week.no}
                      className="flex w-full scroll-mt-16 flex-col items-center gap-6 lg:scroll-mt-24"
                    >
                      <WeekDivider week={week} tone={tone} verdict={weekOpen(activeProgram(s), week.no, u, dOf)} dOf={dOf} />
                      {nodes
                        .filter((n) => n.week.no === week.no)
                        .map((n) => (
                          <Node
                            key={n.card.id}
                            node={n}
                            tone={tone}
                            index={nodes.findIndex((x) => x.card.id === n.card.id)}
                            go={go}
                          />
                        ))}
                    </div>
                  ))}
                </div>
              );
            })}

            <div className="w-full pt-2">
              <SurfaceCard variant="static" padding="lg" className="text-center">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">Demo Day</div>
                <div className="mt-1 text-[15px] font-semibold">Sat 14 Nov — your engine, on stage</div>
                <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))]">
                  Thirteen blocks stack into one working Distribution Engine. That's the whole game.
                </p>
              </SurfaceCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ONE CARD — four renderers behind one route
   ───────────────────────────────────────────────────────────────────────── */

function Shell({ children, go, week, card, dOf }: { children: React.ReactNode; go: (k: string) => void; week: TemplateWeek; card: TemplateCard; dOf: (w: number, d: number) => Date }) {
  const when = dOf(week.no, card.dayOffset);
  const tint = TINT[card.kind];
  return (
    <div className="mx-auto max-w-[680px]">
      <button
        type="button"
        onClick={() => go("path")}
        className="mb-4 flex items-center gap-1.5 text-[12px] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> The Path
      </button>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ background: tint.bg, color: tint.fg }}>
          {KIND_LABEL[card.kind]}
        </span>
        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
          Week {week.no} · {dayName(when)} {fmtDate(when).replace(/^\w+,?\s*/, "")}
          {card.time ? ` · ${card.time}` : ""}
          {card.durationMin ? ` · ${card.durationMin} min` : ""}
        </span>
      </div>
      <h2 className="text-[21px] font-extrabold leading-tight tracking-[-0.02em]">{card.title}</h2>
      {card.mentor && <p className="mt-1 text-[13px] text-[hsl(var(--gold))]">with {card.mentor}</p>}
      {card.blurb && <p className="mt-3 text-[14px] leading-relaxed text-[hsl(var(--muted-foreground))]">{card.blurb}</p>}
      {children}
    </div>
  );
}

function Learn({ items, label }: { items?: string[]; label: string }) {
  if (!items?.length) return null;
  return (
    <div className="mt-5">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{label}</div>
      <ul className="flex flex-col gap-1.5">
        {items.map((l) => (
          <li key={l} className="flex gap-2 text-[13.5px] leading-relaxed">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--gold))]" />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Resources({ card }: { card: TemplateCard }) {
  if (!card.resources?.length) return null;
  // Grouped, because "the deck" and "the transcript" are different errands and
  // a flat list makes a student hunt for the one they came for.
  const groups: ResourceKind[] = ["recording", "deck", "transcript", "resource"];
  return (
    <div className="mt-5">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">Resources</div>
      <div className="flex flex-col gap-2">
        {groups.flatMap((g) =>
          (card.resources ?? [])
            .filter((r) => (r.kind ?? "resource") === g)
            .map((r) => (
              <a
                key={r.id}
                href={r.url || "#"}
                onClick={(e) => e.preventDefault()}
                className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px]">{r.label}</span>
                  <span className="block text-[11px] text-[hsl(var(--muted-foreground))]">
                    {RESOURCE_LABEL[r.kind ?? "resource"]}
                    {r.releaseNote ? ` · ${r.releaseNote}` : ""}
                    {!r.url ? " · not up yet" : ""}
                  </span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
              </a>
            )),
        )}
      </div>
    </div>
  );
}

/** The feedback form — two ratings and a box. Deliberately this small. */
function FeedbackForm({ cardId, d }: { cardId: string; d: React.Dispatch<PlayAction> }) {
  const [mentor, setMentor] = useState(0);
  const [content, setContent] = useState(0);
  const [note, setNote] = useState("");

  const stars = (value: number, set: (n: number) => void, label: string) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px]">{label}</span>
      <span className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} of 5`}
            onClick={() => set(n)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[hsl(var(--border))] transition-colors"
            style={n <= value ? { background: "hsl(var(--gold)/0.16)", color: "hsl(var(--gold))" } : undefined}
          >
            <Star className="h-3.5 w-3.5" />
          </button>
        ))}
      </span>
    </div>
  );

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      {stars(mentor, setMentor, "The mentor")}
      {stars(content, setContent, "What you learned")}
      <label className="text-[13px]" htmlFor="fb-note">
        Anything you want to tell us
        <textarea
          id="fb-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional. Say it plainly, we read all of these."
          className="mt-1.5 w-full resize-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--cream)/0.5)]"
        />
      </label>
      <button
        type="button"
        disabled={!mentor || !content}
        onClick={() => d({ type: "submit_feedback", cardId, mentor, content, note })}
        className="rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-[13px] font-semibold text-[hsl(var(--cream-text))] disabled:opacity-40"
      >
        Submit and open the recording
      </button>
      {(!mentor || !content) && (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Both ratings are needed. The note is optional.</p>
      )}
    </div>
  );
}

function LiveSessionCard({ s, d, card, week, dOf, onDone }: { s: PlayState; d: React.Dispatch<PlayAction>; card: TemplateCard; week: TemplateWeek; dOf: (w: number, d: number) => Date; onDone: (c: TemplateCard, w: TemplateWeek) => void }) {
  const fb = s.feedback[card.id];
  const rec = recordingVerdict(card, !!fb);
  const done = s.progress[card.id]?.done;

  return (
    <>
      {card.reviewsWeek !== undefined && (
        <p className="mt-3 rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-[12px]">
          This session reads week {card.reviewsWeek}'s block.
        </p>
      )}
      <Learn items={card.learn} label="What you'll learn" />
      <Resources card={card} />

      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        {/* 🔴 THE BUG HE HIT. This used to read `completed` alone, so pasting a
            recording link changed nothing until someone ALSO pressed "mark
            done" on another screen — and the card meanwhile claimed feedback
            was required while offering no form. A recording that exists is
            reason enough to open the recording door; `completed` only decides
            whether the Zoom door is still up. */}
        {!card.completed && !card.recordingUrl ? (
          card.zoomUrl ? (
            <>
              <a
                href={card.zoomUrl}
                onClick={(e) => e.preventDefault()}
                className="rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-center text-[13px] font-semibold text-[hsl(var(--cream-text))]"
              >
                Join on Zoom
              </a>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Everyone can join, always. Falling behind never closes the room.
              </p>
            </>
          ) : (
            <>
              <span className="rounded-lg border border-dashed border-[hsl(var(--border))] px-4 py-2.5 text-center text-[13px] text-[hsl(var(--muted-foreground))]">
                The Zoom link is not up yet
              </span>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                It appears here the moment an admin adds it. You will not need to go looking anywhere else.
              </p>
            </>
          )
        ) : rec.state === "open" ? (
          <>
            <a
              href={card.recordingUrl}
              onClick={(e) => e.preventDefault()}
              className="rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-center text-[13px] font-semibold text-[hsl(var(--cream-text))]"
            >
              Watch the recording
            </a>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Thanks for the feedback. It goes straight to the mentor.</p>
          </>
        ) : rec.state === "locked" ? (
          <>
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <Lock className="h-3.5 w-3.5" /> {rec.why}
            </div>
            <FeedbackForm cardId={card.id} d={d} />
          </>
        ) : (
          <>
            <span className="rounded-lg border border-dashed border-[hsl(var(--border))] px-4 py-2.5 text-center text-[13px] text-[hsl(var(--muted-foreground))]">
              The recording is not up yet
            </span>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{rec.why}</p>
            {card.gateRecordingOnFeedback && !fb && (
              <>
                <p className="mt-1 text-[12px]">You can leave your feedback now, so the recording opens the moment it lands.</p>
                <FeedbackForm cardId={card.id} d={d} />
              </>
            )}
          </>
        )}
      </div>

      {!done && (
        <button
          type="button"
          onClick={() => { d({ type: "card_done", cardId: card.id }); onDone(card, week); }}
          className="mt-3 w-full rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-[13px]"
        >
          I attended this session
        </button>
      )}
      {done && <p className="mt-3 text-[12px] text-[hsl(var(--success))]">Attendance recorded. +{card.xp} XP</p>}
    </>
  );
}

function CommunityCallCard({ s, d, card, week, onDone }: { s: PlayState; d: React.Dispatch<PlayAction>; card: TemplateCard; week: TemplateWeek; onDone: (c: TemplateCard, w: TemplateWeek) => void }) {
  const done = s.progress[card.id]?.done;
  return (
    <>
      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        {card.zoomUrl ? (
          <a
            href={card.zoomUrl}
            onClick={(e) => e.preventDefault()}
            className="rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-center text-[13px] font-semibold text-[hsl(var(--cream-text))]"
          >
            Join the call
          </a>
        ) : (
          <span className="rounded-lg border border-dashed border-[hsl(var(--border))] px-4 py-2.5 text-center text-[13px] text-[hsl(var(--muted-foreground))]">
            The Zoom link is not up yet
          </span>
        )}
        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
          No work attached, nothing to submit, nothing recorded. Come if it helps.
        </p>
      </div>
      {!done && (
        <button
          type="button"
          onClick={() => { d({ type: "card_done", cardId: card.id }); onDone(card, week); }}
          className="mt-3 w-full rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-[13px]"
        >
          I came to this
        </button>
      )}
      {done && <p className="mt-3 text-[12px] text-[hsl(var(--success))]">Noted. +{card.xp} XP</p>}
    </>
  );
}

function MicroCard({ s, d, card, week, locked, dOf, onDone }: { s: PlayState; d: React.Dispatch<PlayAction>; card: TemplateCard; week: TemplateWeek; locked?: string; dOf: (w: number, dd: number) => Date; onDone: (c: TemplateCard, w: TemplateWeek) => void }) {
  const done = s.progress[card.id]?.done;

  // A drill that collects work behaves exactly like the week's block, because
  // from the student's side it IS the same act. The only thing that separates
  // them is whether it counts toward the thirteen.
  if (card.submit && !locked) return <BlockCard s={s} d={d} card={card} week={week} dOf={dOf} onDone={onDone} />;

  return (
    <>
      <Learn items={card.learn} label="What to do" />
      <Resources card={card} />
      <div className="mt-6">
        {done ? (
          <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--success))]">
            <Check className="h-4 w-4" /> Done. +{card.xp} XP
          </p>
        ) : locked ? (
          <p className="flex items-center gap-2 text-[13px] text-[hsl(var(--muted-foreground))]">
            <Lock className="h-3.5 w-3.5" /> {locked}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => { d({ type: "card_done", cardId: card.id }); onDone(card, week); }}
            className="w-full rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-[13px] font-semibold text-[hsl(var(--cream-text))]"
          >
            Mark this done
          </button>
        )}
      </div>
    </>
  );
}

/** The submission box — the admin's question list, rendered. */
function QuestionField({ q, value, onChange }: { q: Question; value: AnswerValue; onChange: (v: AnswerValue) => void }) {
  const id = `q-${q.id}`;
  const label = (
    <>
      {q.title}
      {!q.required && <span className="text-[hsl(var(--muted-foreground))]"> (optional)</span>}
      {q.helper && <span className="mt-0.5 block text-[11px] text-[hsl(var(--muted-foreground))]">{q.helper}</span>}
    </>
  );
  const box = "mt-1.5 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--cream)/0.5)]";
  const str = typeof value === "string" ? value : "";
  const arr = Array.isArray(value) ? value : [];

  return (
    <label className="mb-4 block text-[13px]" htmlFor={id}>
      {label}
      {q.type === "long_text" ? (
        <textarea id={id} rows={4} value={str} onChange={(e) => onChange(e.target.value)} className={`${box} resize-none`} />
      ) : q.type === "rating" ? (
        <span className="mt-1.5 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${q.title}: ${n} of 5`}
              onClick={() => onChange(String(n))}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[hsl(var(--border))]"
              style={String(n) === str ? { background: "hsl(var(--gold)/0.16)", color: "hsl(var(--gold))" } : undefined}
            >
              <Star className="h-3.5 w-3.5" />
            </button>
          ))}
        </span>
      ) : q.type === "yes_no" ? (
        <span className="mt-1.5 flex gap-2">
          {["Yes", "No"].map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className="rounded-lg border border-[hsl(var(--border))] px-4 py-1.5 text-[12px]"
              style={o === str ? { background: "hsl(var(--cream))", color: "hsl(var(--cream-text))" } : undefined}
            >
              {o}
            </button>
          ))}
        </span>
      ) : q.type === "choice_one" || q.type === "choice_many" ? (
        <span className="mt-1.5 flex flex-col gap-1.5">
          {(q.options ?? []).map((o) => {
            const on = q.type === "choice_one" ? str === o : arr.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() =>
                  q.type === "choice_one" ? onChange(o) : onChange(on ? arr.filter((x) => x !== o) : [...arr, o])
                }
                className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-left text-[12.5px]"
                style={on ? { borderColor: "hsl(var(--cream)/0.6)", background: "hsl(var(--secondary))" } : undefined}
              >
                <span
                  className="grid h-4 w-4 shrink-0 place-items-center border border-[hsl(var(--border))]"
                  style={{ borderRadius: q.type === "choice_one" ? "50%" : "4px", background: on ? "hsl(var(--cream))" : "transparent" }}
                >
                  {on && <Check className="h-2.5 w-2.5 text-[hsl(var(--cream-text))]" strokeWidth={4} />}
                </span>
                {o}
              </button>
            );
          })}
        </span>
      ) : (
        <input
          id={id}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.type === "link" ? "https://…" : q.type === "file" ? "voice-note-01.m4a" : ""}
          className={box}
        />
      )}
    </label>
  );
}

/**
 * Someone else's work, opened from the room.
 *
 * 🔴 WHY THIS IS THE POINT, not a nice-to-have (founder): "everyone should be
 * able to see others' assignments and learn from it — that is more important."
 * A leaderboard you cannot open is a scoreboard; a leaderboard you CAN open is
 * a library. The names were already there; the work being one tap behind them
 * is what turns envy into a reference.
 */
function PeerWork({ name, answers, questions, onClose }: { name: string; answers: Record<string, AnswerValue>; questions: Question[]; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-label={`${name}'s submission`}
    >
      <motion.div
        className="max-h-[80vh] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"
        initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[15px] font-semibold">{name}</div>
          <button type="button" onClick={onClose} className="text-[12px] text-[hsl(var(--muted-foreground))] underline underline-offset-4">
            Close
          </button>
        </div>
        {questions.map((q) => {
          const v = answers[q.id];
          const text = Array.isArray(v) ? v.join(", ") : String(v ?? "");
          if (!text.trim()) return null;
          return (
            <div key={q.id} className="mb-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{q.title}</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{text}</div>
            </div>
          );
        })}
        <p className="mt-4 border-t border-[hsl(var(--border))] pt-3 text-[11px] text-[hsl(var(--muted-foreground))]">
          Shared with the room because they submitted it. Read it, steal the good bits, do it your way.
        </p>
      </motion.div>
    </motion.div>
  );
}

/** The room — who moved, in the order they moved. */
function Room({ cardId, mine, dueReached, onOpen }: { cardId: string; mine?: { stage: ActivityStage; label: string }; dueReached: boolean; onOpen?: (id: string, name: string) => void }) {
  const others = roomFor(cardId);
  const rows = [
    ...others.map((a) => ({ id: a.student.id, name: a.student.name, initials: a.student.initials, when: sinceOpen(a.startedMin), stage: a.stage, me: false })),
    ...(mine ? [{ id: "you", name: "You", initials: "YO", when: mine.label, stage: mine.stage, me: true }] : []),
  ];
  const started = rows.length;
  const drafted = rows.filter((r) => r.stage === "drafted").length;
  const submitted = rows.filter((r) => r.stage === "submitted").length;

  return (
    <div className="mt-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[14px] font-bold">
          <Flame className="h-4 w-4 text-[hsl(var(--gold))]" /> The room
        </span>
        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
          {started} started{dueReached ? ` · ${drafted} drafting · ${submitted} submitted` : ""}
        </span>
      </div>

      <div className="flex flex-col">
        {rows.map((r, i) => (
          <div key={r.id} className={`flex items-center gap-3 py-2 ${i ? "border-t border-[hsl(var(--border))]" : ""}`}>
            <span className="w-4 text-[11px] text-[hsl(var(--muted-foreground))]">{i + 1}</span>
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold"
              style={r.me
                ? { background: "hsl(var(--cream))", color: "hsl(var(--cream-text))" }
                : { background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}
            >
              {r.initials}
            </span>
            <button
              type="button"
              onClick={() => !r.me && onOpen?.(r.id, r.name)}
              disabled={r.me || r.stage === "started"}
              className={`min-w-0 flex-1 truncate text-left text-[13px] ${r.me ? "font-bold" : ""} ${!r.me && r.stage !== "started" ? "underline decoration-[hsl(var(--border-hover))] underline-offset-4" : ""}`}
            >
              {r.name}
            </button>
            <span
              className="shrink-0 text-[11px]"
              style={{ color: r.stage === "submitted" ? "hsl(var(--success))" : "hsl(var(--muted-foreground))" }}
            >
              {r.stage} · {r.when}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
        Ordered by who moved first. Tap anyone who has submitted to read their work. Only people who have started appear here — nobody is listed for being behind.
      </p>
    </div>
  );
}

function BlockCard({ s, d, card, week, locked, dOf, onDone }: { s: PlayState; d: React.Dispatch<PlayAction>; card: TemplateCard; week: TemplateWeek; locked?: string; dOf: (w: number, d: number) => Date; onDone: (c: TemplateCard, w: TemplateWeek) => void }) {
  const existing = s.submissions.find((x) => x.cardId === card.id);
  const prog = s.progress[card.id];
  const [peer, setPeer] = useState<{ id: string; name: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(existing?.answers ?? s.drafts[card.id] ?? {});
  const box = card.submit;

  const opensOn = dOf(week.no, card.opensDayOffset ?? card.dayOffset);
  const dueOn = dOf(week.no, card.dayOffset);
  const today = new Date(`${TODAY_ISO}T00:00:00`);
  const isOpen = today >= opensOn;
  const dueReached = today >= dueOn;
  const spans = (card.opensDayOffset ?? card.dayOffset) !== card.dayOffset;

  const missing = (box?.questions ?? []).filter((q) => {
    if (!q.required) return false;
    const v = answers[q.id];
    return Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
  });

  const mine = existing
    ? { stage: "submitted" as ActivityStage, label: existing.when }
    : prog?.draftedOn
      ? { stage: "drafted" as ActivityStage, label: prog.draftedOn }
      : prog?.startedOn
        ? { stage: "started" as ActivityStage, label: prog.startedOn }
        : undefined;

  return (
    <>
      {spans && (
        <p className="mt-3 rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-[12px]">
          Open from {dayName(opensOn)} {fmtDate(opensOn).replace(/^\w+,?\s*/, "")} · due {dayName(dueOn)} {card.time}
        </p>
      )}
      <Learn items={card.learn} label="What good looks like" />
      <Resources card={card} />

      {locked ? (
        <p className="mt-6 flex items-center gap-2 text-[13px] text-[hsl(var(--muted-foreground))]">
          <Lock className="h-3.5 w-3.5" /> {locked}
        </p>
      ) : !isOpen ? (
        <p className="mt-6 flex items-center gap-2 text-[13px] text-[hsl(var(--muted-foreground))]">
          <Lock className="h-3.5 w-3.5" /> Opens {dayName(opensOn)} {fmtDate(opensOn).replace(/^\w+,?\s*/, "")}.
        </p>
      ) : !box ? null : (
        <>
          {!mine && (
            <button
              type="button"
              onClick={() => d({ type: "start_work", cardId: card.id })}
              className="mt-6 w-full rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-[13px] font-semibold text-[hsl(var(--cream-text))]"
            >
              I'm starting this
            </button>
          )}
          {!mine && (
            <p className="mt-2 text-center text-[11px] text-[hsl(var(--muted-foreground))]">
              Puts you in the room and starts your clock. Nothing is submitted yet.
            </p>
          )}

          {mine && (
            <div className="mt-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="mb-4 text-[14px] font-bold">{box.prompt}</div>
              {box.questions.length === 0 && (
                <p className="mb-3 text-[12px] text-[hsl(var(--muted-foreground))]">No questions yet. An admin builds them on this card.</p>
              )}
              {box.questions.map((q) => (
                <QuestionField key={q.id} q={q} value={answers[q.id] ?? (q.type === "choice_many" ? [] : "")} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} />
              ))}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={missing.length > 0 || box.questions.length === 0}
                  onClick={() => { d({ type: "submit_work", cardId: card.id, answers }); if (!existing) onDone(card, week); }}
                  className="flex-1 rounded-lg bg-[hsl(var(--cream))] px-4 py-2.5 text-[13px] font-semibold text-[hsl(var(--cream-text))] disabled:opacity-40"
                >
                  {existing ? "Update my submission" : "Submit my week"}
                </button>
                {!existing && (
                  <button
                    type="button"
                    onClick={() => d({ type: "save_draft", cardId: card.id, answers })}
                    className="rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-[13px]"
                  >
                    Save a draft
                  </button>
                )}
              </div>
              {missing.length > 0 && (
                <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">Still needed: {missing.map((q) => q.title).join(", ")}.</p>
              )}

              {existing && (
                <div className="mt-4 border-t border-[hsl(var(--border))] pt-3 text-[12px]">
                  <p className="text-[hsl(var(--success))]">Submitted {existing.when}. Your mentor sees this in their desk.</p>
                  {existing.verdict && (
                    <p className="mt-1.5">
                      Verdict: <span className="font-bold uppercase">{existing.verdict}</span>
                      {existing.mentorNote ? ` — ${existing.mentorNote}` : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <Room cardId={card.id} mine={mine} dueReached={dueReached} onOpen={(id, name) => setPeer({ id, name })} />

          <AnimatePresence>
            {peer && (
              <PeerWork
                name={peer.name}
                answers={answersFor(card.id, peer.id, box.questions)}
                questions={box.questions}
                onClose={() => setPeer(null)}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </>
  );
}

export function ProgramCardScreen({ s, d, go, cardId }: { s: PlayState; d: React.Dispatch<PlayAction>; go: (k: string) => void; cardId: string }) {
  const u = useUnlock(s);
  const dOf = makeDOf(activeProgram(s));
  const [party, setParty] = useState<Celebration | null>(null);

  /**
   * Celebrate the CONSEQUENCE, not the click. "Done" is a receipt; "week 1 is
   * open" is a reward. So the overlay names whatever the action just unlocked
   * — the next drill by title, or the whole next week — and falls back to the
   * XP only when nothing opened.
   */
  const celebrate = (card: TemplateCard, week: TemplateWeek) => {
    const after: UnlockInput = {
      ...u,
      progress: { ...u.progress, [card.id]: { done: true } },
      submittedCardIds: card.kind === "block" ? [...u.submittedCardIds, card.id] : u.submittedCardIds,
    };
    if (card.kind === "block") {
      const nextWeek = activeProgram(s).weeks.find((w) => w.no === week.no + 1);
      if (nextWeek && weekOpen(activeProgram(s), nextWeek.no, after, dOf).state === "open") {
        setParty({ title: `Week ${nextWeek.no} is open`, sub: nextWeek.title });
        return;
      }
      setParty({ title: "Block submitted", sub: `Your mentor has it. +${card.xp} XP` });
      return;
    }
    const nextDrill = orderedCards(week).find(
      (c) => c.id !== card.id && cardState(activeProgram(s), week, c, u, dOf).state === "locked" && cardState(activeProgram(s), week, c, after, dOf).state === "open",
    );
    setParty(
      nextDrill
        ? { title: "Unlocked", sub: nextDrill.title }
        : { title: `+${card.xp} XP`, sub: "Banked. Nothing you finish ever locks again." },
    );
  };
  const found = findCard(activeProgram(s), cardId);
  if (!found) {
    return (
      <div className="mx-auto max-w-[680px]">
        <button type="button" onClick={() => go("path")} className="text-[13px] underline">
          Back to the Path
        </button>
      </div>
    );
  }
  const card = resolve(s, found.card);
  const v = cardState(activeProgram(s), found.week, card, u, dOf);
  const locked = v.state === "locked" ? v.why : undefined;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <CelebrationOverlay show={party} onDone={() => setParty(null)} />
      <Shell go={go} week={found.week} card={card} dOf={dOf}>
        {card.needsAuthoring && (
          <p className="mt-3 rounded-lg border border-dashed border-[hsl(var(--border))] px-3 py-2 text-[12px] text-[hsl(var(--muted-foreground))]">
            This week is on the calendar but not authored yet. Weeks 0 and 1 are the finished examples.
          </p>
        )}
        {card.kind === "live_session" && <LiveSessionCard s={s} d={d} card={card} week={found.week} dOf={dOf} onDone={celebrate} />}
        {card.kind === "community_call" && <CommunityCallCard s={s} d={d} card={card} week={found.week} onDone={celebrate} />}
        {card.kind === "micro" && <MicroCard s={s} d={d} card={card} week={found.week} locked={locked} dOf={dOf} onDone={celebrate} />}
        {card.kind === "block" && <BlockCard s={s} d={d} card={card} week={found.week} locked={locked} dOf={dOf} onDone={celebrate} />}
      </Shell>
    </motion.div>
  );
}


/* ─────────────────────────────────────────────────────────────────────────
   HOME — composed, not a list
   ─────────────────────────────────────────────────────────────────────────

   Locked decision #9: home leads with the ONE next action, stats are chips in
   the header, and every lock is explained in plain words. The composition —
   glow-backed hero, a scannable week strip, an upcoming-live card — is the one
   the founder signed off in round 1. What changed underneath is that all three
   now read the real template instead of hand-written prose, so Home can never
   drift from the Path.
   ───────────────────────────────────────────────────────────────────────── */

export function ProgramHomeScreen({ s, go }: { s: PlayState; go: (k: string) => void }) {
  const [board, setBoard] = useState(false);
  const [rules, setRules] = useState(false);
  const [who, setWho] = useState<Standing | null>(null);
  const u = useUnlock(s);
  const dOf = makeDOf(activeProgram(s));
  const nodes = useMemo(() => buildTrail(s, u), [s, u]);
  const blocks = blocksDone(activeProgram(s), u.submittedCardIds);

  const current = nodes.find((n) => n.state === "current") ?? nodes.find((n) => n.state === "info");

  // Where the CALENDAR is today, regardless of where the student got to.
  const today = new Date(`${TODAY_ISO}T00:00:00`);
  const dated = nodes.filter((n) => !n.card.needsAuthoring);
  const todayCard = [...dated].reverse().find((n) => n.when <= today) ?? dated[0];
  const behind =
    current && todayCard
      ? Math.max(0, dated.indexOf(todayCard) - dated.indexOf(current))
      : 0;
  const tone = toneForPhase(current?.week.phase ?? activeProgram(s).weeks[0].phase);

  // "This week" = the week the current step lives in, not a hard-coded 0.
  const week = current?.week ?? activeProgram(s).weeks[0];
  const weekNodes = nodes.filter((n) => n.week.no === week.no);
  const doneThisWeek = weekNodes.filter((n) => n.state === "done").length;

  // The next live thing you could walk into, anywhere ahead on the trail.
  const upcoming = nodes.find(
    (n) => (n.card.kind === "live_session" || n.card.kind === "community_call") && n.state !== "done" && !n.card.needsAuthoring,
  );

  const nextWeek = activeProgram(s).weeks.find((w) => w.no === week.no + 1);
  const nextWeekVerdict = nextWeek ? weekOpen(activeProgram(s), nextWeek.no, u, dOf) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Week ${week.no} of ${activeProgram(s).weeks.length - 1} · ${week.title} · ${doneThisWeek}/${weekNodes.length} steps done`}
        title={<>Creator <Serif>Studio</Serif></>}
        subtitle="One project — your Distribution Engine, built block by block."
      />

      {/* 🔴 THE CATCH-UP STATE (founder): "if they open it two days after
          orientation, they should still be able to record five voice notes.
          Tell them technically today is this, but you're stuck here."
          Two facts, not one — where the cohort is, and where YOU are. Showing
          only the date shames; showing only your step hides that you are
          behind. Both together is an instruction. */}
      {current && behind > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-[12px]">
          <span className="text-[hsl(var(--muted-foreground))]">
            The cohort is on {fmtDate(todayCard.when)} — {todayCard.card.title}.
          </span>
          <span className="text-[hsl(var(--foreground))]">
            You are {behind} step{behind > 1 ? "s" : ""} back, and nothing has closed.
          </span>
        </div>
      )}

      {current && (
        <SurfaceCard variant="static" padding="lg" className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full opacity-25 blur-3xl"
            style={{ background: tone.c }}
          />
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.c }}>
            {KIND_LABEL[current.card.kind]} · {dayName(current.when)}
            {current.card.time ? ` ${current.card.time}` : ""}
          </div>
          <div className="mt-1.5 text-[19px] font-bold tracking-[-0.01em]">{current.card.title}</div>
          {current.card.blurb && (
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[hsl(var(--muted-foreground))]">{current.card.blurb}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="champagne" onClick={() => go(`card/${current.card.id}`)}>
              {current.card.kind === "block" ? "Open the submission box" : current.card.kind === "micro" ? "Start it" : "Open the session"}{" "}
              <ArrowRight />
            </Button>
            <button
              type="button"
              onClick={() => go("path")}
              className="text-[12.5px] font-semibold text-[hsl(var(--muted-foreground))] underline underline-offset-4 hover:text-[hsl(var(--foreground))]"
            >
              See the whole trail
            </button>
          </div>
        </SurfaceCard>
      )}

      <Section
        title="This week"
        description={`Week ${week.no} · ${week.blurb ?? week.title}`}
      >
        <SurfaceCard variant="static" padding="lg">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {weekNodes.map((n) => (
              <button
                key={n.card.id}
                type="button"
                onClick={() => go(`card/${n.card.id}`)}
                className="group flex items-center gap-2"
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-extrabold transition-transform group-hover:scale-110"
                  style={{
                    background:
                      n.state === "done" ? "hsl(var(--success))" : n.state === "current" ? tone.c : "hsl(var(--secondary))",
                    color: n.state === "locked" || n.state === "info" ? "hsl(var(--muted-foreground))" : "hsl(var(--cream-text))",
                  }}
                >
                  {n.state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n.state === "locked" ? <Lock className="h-3 w-3" /> : "→"}
                </span>
                <span className="text-left leading-tight">
                  <span
                    className={`block text-[10px] font-bold uppercase tracking-wide ${n.state === "current" ? "" : "text-[hsl(var(--muted-foreground))]"}`}
                    style={n.state === "current" ? { color: tone.c } : undefined}
                  >
                    {dayName(n.when)}{n.card.time ? ` ${n.card.time}` : ""}
                  </span>
                  <span className="block max-w-[160px] truncate text-[11px] text-[hsl(var(--muted-foreground))]">
                    {n.card.title.replace(/^Week \d+ block — /, "")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </SurfaceCard>
      </Section>

      <Section title="Upcoming" description="Live sessions are for everyone in the cohort — attendance earns XP, and falling behind never shuts the room.">
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          {upcoming && (
            <SurfaceCard variant="interactive" padding="none" className="overflow-hidden" onClick={() => go(`card/${upcoming.card.id}`)}>
              <div className="relative grid h-36 place-items-center bg-gradient-to-br from-[#221a10] via-[#120e08] to-[#0a0a0a]">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-[hsl(var(--champagne-from))] to-[hsl(var(--champagne-to))]">
                  <Radio className="h-4 w-4 text-[hsl(var(--cream-text))]" />
                </div>
                <div className="absolute left-4 top-4 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--gold))]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">
                    Live · {fmtDate(upcoming.when)}{upcoming.card.time ? ` ${upcoming.card.time}` : ""}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{upcoming.card.title}</div>
                  <div className="text-[12px] text-[hsl(var(--muted-foreground))]">
                    {upcoming.card.mentor ? `Hosted by ${upcoming.card.mentor} · ` : ""}
                    {upcoming.card.zoomUrl ? "Zoom link inside" : "Zoom link not up yet"}
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[hsl(var(--gold))]">
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </SurfaceCard>
          )}

          {nextWeek && nextWeekVerdict && (
            <SurfaceCard variant="static" padding="lg">
              <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
                {nextWeekVerdict.state === "open" ? (
                  <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                <span className="text-[11px] font-bold uppercase tracking-[0.12em]">
                  Week {nextWeek.no} · {nextWeek.title}
                </span>
              </div>
              <div className={`mt-2 text-[14px] font-semibold ${nextWeekVerdict.state === "open" ? "" : "text-[hsl(var(--muted-foreground))]"}`}>
                {nextWeekVerdict.state === "open" ? "Open — drills and block included" : nextWeekVerdict.why}
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                {nextWeekVerdict.state === "open"
                  ? "It opened the moment your block landed. Nothing you have finished ever locks again."
                  : "You can still join its live session — only the drills and the block wait. Everything you have finished stays open."}
              </p>
            </SurfaceCard>
          )}
        </div>
      </Section>

      <Section title="The room" description="Ranked on work done, not on being early. Tap anyone to see what got them there.">
        <Podium s={s} onOpen={setWho} onFull={() => setBoard(true)} />
      </Section>

      <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-[hsl(var(--muted-foreground))]">
        <span>{blocks.done} of {blocks.total} blocks in · Demo Day Sat 14 Nov</span>
        <button type="button" onClick={() => setRules(true)} className="underline underline-offset-4">
          How XP and streaks work
        </button>
      </div>

      <BoardSheet s={s} open={board} onClose={() => setBoard(false)} onOpen={(st) => { setBoard(false); setWho(st); }} />
      <StandingSheet s={s} standing={who} onClose={() => setWho(null)} />
      <RulesSheet open={rules} onClose={() => setRules(false)} />
    </div>
  );
}
