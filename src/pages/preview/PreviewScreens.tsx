/**
 * Creator Studio prototype — core screens: Home, Path, Recording, Assignment,
 * Session detail. Social surfaces (Album/Feed/Mentor/Admin) live in
 * `PreviewStudioScreens.tsx`.
 *
 * 🔴 THE RULE THIS FILE LIVES BY. Every surface is the app's canonical
 * primitive: `SurfaceCard`, `PageHeader`, `Section`, the champagne `Button`,
 * and the shadcn `HoverCard`/`Sheet` where floating layers are needed.
 * Hand-rolled lookalikes were the "I hate the design" failure — twice.
 *
 * v3, after founder walkthrough round 2. The Path is ONE continuous Duolingo
 * trail (no boxed weeks): phase unit banners → week dividers → a winding line
 * of nodes with hover previews, a scroll-spy rail, an "All sessions" overview
 * sheet, and a session detail page for every week — future ones included,
 * because "if there is a week 9 that has not happened, I need to know the
 * details". Info is never locked; only doing is.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Flame, Lock, Check, Play, FileText, ClipboardList, ChevronRight, ChevronLeft,
  Video, CalendarDays, ArrowRight, Instagram, Youtube, HardDrive, Link2, Radio,
  Zap, ListTree, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PageHeader, Section, SurfaceCard } from "@/components/patterns";
import {
  ENGINE, PHASES, CURRENT_WEEK, OPENS_ON, daysForWeek, RECORDINGS, LIVE_SESSION,
  SESSION_DATES, SESSION_INFO,
} from "./previewData";
import { toneForPhase, snakeOffset } from "./previewTheme";
import { linkKind, type PlayState, type PlayAction } from "./previewStore";

type Dispatch = React.Dispatch<PlayAction>;
export interface ScreenProps { s: PlayState; d: Dispatch; go: (k: string) => void }

export const Serif = ({ children }: { children: React.ReactNode }) => (
  <span className="font-serif italic text-[hsl(var(--cream))]">{children}</span>
);

/** In-prototype back button (PageHeader's `back` is a router Link — wrong tool here). */
export function BackRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 inline-flex min-h-[36px] items-center gap-1 rounded-md px-1 text-[13px] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
    >
      <ChevronLeft className="h-4 w-4" /> {label}
    </button>
  );
}

/* ── link preview card (feed + album + mentor) ──────────────────────────── */

const LINK_LOOKS = {
  youtube: { Icon: Youtube, tint: "hsl(var(--accent-crimson))", art: "from-[#2a1414] to-[#0d0b0b]" },
  instagram: { Icon: Instagram, tint: "hsl(var(--accent-violet))", art: "from-[#241a2e] to-[#0d0b10]" },
  drive: { Icon: HardDrive, tint: "hsl(var(--accent-emerald))", art: "from-[#12241d] to-[#0b100e]" },
  generic: { Icon: Link2, tint: "hsl(var(--muted-foreground))", art: "from-[#17171c] to-[#0b0b0d]" },
} as const;

export function LinkCard({ url, title, compact }: { url: string; title?: string; compact?: boolean }) {
  const kind = linkKind(url);
  const { Icon, tint, art } = LINK_LOOKS[kind];
  const isVideo = kind === "youtube" || kind === "instagram";
  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
      {!compact && (
        <div className={`relative grid h-32 place-items-center bg-gradient-to-br ${art}`}>
          {isVideo ? (
            <div className="grid h-10 w-10 place-items-center rounded-full bg-black/55 backdrop-blur-sm">
              <Play className="h-3.5 w-3.5 fill-white text-white" />
            </div>
          ) : (
            <Icon className="h-6 w-6" style={{ color: tint }} />
          )}
        </div>
      )}
      <div className="flex items-center gap-2 bg-[hsl(var(--secondary))] px-3 py-2">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: tint }} />
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-medium">{title ?? url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}</div>
          <div className="text-[10.5px] capitalize text-[hsl(var(--muted-foreground))]">{kind}</div>
        </div>
      </div>
    </div>
  );
}

/* ── shared: where is the student, what's next ──────────────────────────── */

interface NextAction {
  eyebrow: string;
  title: string;
  sub: string;
  cta: string;
  goTo: string;
}

export function nextActionFor(s: PlayState): NextAction {
  const current = s.days.find((x) => x.state === "current");
  if (current?.id === "d3")
    return {
      eyebrow: "Continue where you left off",
      title: "Watch the Week 4 recording",
      sub: "Advanced Production · 62 min · finishing it hands you straight to this week's block.",
      cta: "Resume watching",
      goTo: "recording/4",
    };
  if (current?.isBlock || (s.blockStatus === "none" && s.days.find((x) => x.isBlock)?.state !== "locked"))
    return {
      eyebrow: "One thing left this week",
      title: "Submit the block — 3 reels from one sitting",
      sub: "Due Thu 9 PM. Submitting it is exactly what opens Week 5 and its recording.",
      cta: "Open the assignment",
      goTo: "assignment/4",
    };
  if (s.blockStatus !== "none")
    return {
      eyebrow: "Week 4 wrapped",
      title: "Week 5 is open — On-Camera Confidence",
      sub: "Your block is in. Sunday's live class briefs the take-1 vs take-10 drill.",
      cta: "See the live session",
      goTo: "session/5",
    };
  return {
    eyebrow: "Continue where you left off",
    title: "Pick up the Path",
    sub: "Week 4 · Advanced Production.",
    cta: "Open the Path",
    goTo: "path",
  };
}

/* ── 1 · Home ───────────────────────────────────────────────────────────── */

export function HomeScreen({ s, d, go }: ScreenProps) {
  const tone = toneForPhase("Produce");
  const next = nextActionFor(s);
  const doneCount = s.days.filter((x) => x.state === "done").length;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Week 4 of 13 · Advanced Production · ${doneCount}/${s.days.length} days done`}
        title={<>Creator <Serif>Studio</Serif></>}
        subtitle="One project — your Distribution Engine, built block by block."
      />

      {/* THE first thing: what to do next. Big, one CTA, nothing competing. */}
      <SurfaceCard variant="static" padding="lg" className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full opacity-25 blur-3xl"
          style={{ background: tone.c }}
        />
        <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.c }}>
          {next.eyebrow}
        </div>
        <div className="mt-1.5 text-[19px] font-bold tracking-[-0.01em]">{next.title}</div>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[hsl(var(--muted-foreground))]">{next.sub}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="champagne" onClick={() => go(next.goTo)}>
            {next.cta} <ArrowRight />
          </Button>
          <button
            type="button"
            onClick={() => go("path")}
            className="text-[12.5px] font-semibold text-[hsl(var(--muted-foreground))] underline underline-offset-4 hover:text-[hsl(var(--foreground))]"
          >
            See the whole week
          </button>
        </div>
      </SurfaceCard>

      {/* This week, at a glance — small, scannable, no scroll needed. */}
      <Section title="This week" description="Week 4 · the block: B-roll bank + 3 reels from one sitting · due Thu 9 PM">
        <SurfaceCard variant="static" padding="lg">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {s.days.map((day) => (
              <button
                key={day.id}
                type="button"
                disabled={day.state === "locked"}
                onClick={() =>
                  day.id === "d1" ? go("session/4")
                  : day.id === "d3" && day.state === "current" ? go("recording/4")
                  : day.isBlock && day.state === "current" ? go("assignment/4")
                  : day.state === "current" ? d({ type: "complete_day", id: day.id })
                  : undefined
                }
                className="group flex items-center gap-2 disabled:cursor-not-allowed"
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-extrabold transition-transform group-hover:scale-110"
                  style={{
                    background: day.state === "done" ? "hsl(var(--success))" : day.state === "current" ? tone.c : "hsl(var(--secondary))",
                    color: day.state === "locked" ? "hsl(var(--muted-foreground))" : "hsl(var(--cream-text))",
                  }}
                >
                  {day.state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : day.state === "locked" ? <Lock className="h-3 w-3" /> : "→"}
                </span>
                <span className="text-left leading-tight">
                  <span className={`block text-[10px] font-bold uppercase tracking-wide ${day.state === "current" ? "" : "text-[hsl(var(--muted-foreground))]"}`} style={day.state === "current" ? { color: tone.c } : undefined}>
                    {day.label}
                  </span>
                  <span className="block max-w-[150px] truncate text-[11px] text-[hsl(var(--muted-foreground))]">{day.title.replace(/^The block — /, "")}</span>
                </span>
              </button>
            ))}
          </div>
        </SurfaceCard>
      </Section>

      {/* Upcoming — the live session, joinable, with the gate explained in words. */}
      <Section title="Upcoming" description="Live classes are for everyone in the cohort — attendance earns XP.">
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <SurfaceCard variant="interactive" padding="none" className="overflow-hidden" onClick={() => go("session/5")}>
            <div className="relative grid h-36 place-items-center bg-gradient-to-br from-[#221a10] via-[#120e08] to-[#0a0a0a]">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-[hsl(var(--champagne-from))] to-[hsl(var(--champagne-to))]">
                <Radio className="h-4 w-4 text-[hsl(var(--cream-text))]" />
              </div>
              <div className="absolute left-4 top-4 flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--gold))]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">Live · {LIVE_SESSION.when}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold">{LIVE_SESSION.title}</div>
                <div className="text-[12px] text-[hsl(var(--muted-foreground))]">Hosted by {LIVE_SESSION.host} · Zoom link inside</div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[hsl(var(--gold))]">
                Open <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </SurfaceCard>

          <SurfaceCard variant="static" padding="lg">
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              {s.week5Unlocked ? <Check className="h-4 w-4 text-[hsl(var(--success))]" /> : <Lock className="h-4 w-4" />}
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Week 5 · On-Camera Confidence</span>
            </div>
            <div className={`mt-2 text-[14px] font-semibold ${s.week5Unlocked ? "" : "text-[hsl(var(--muted-foreground))]"}`}>
              {s.week5Unlocked ? "Open — drills and recording included" : "Locked until your Week 4 block is in"}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              {s.week5Unlocked
                ? "It opened the moment you submitted. Nothing you've finished ever locks again."
                : "You can still join Sunday's live class — only Week 5's drills and recording wait for the block. Everything you've finished stays open."}
            </p>
            {!s.week5Unlocked && (
              <button type="button" onClick={() => go("assignment/4")} className="mt-3 text-[12px] font-semibold text-[hsl(var(--gold))] underline underline-offset-4">
                Go submit the block
              </button>
            )}
          </SurfaceCard>
        </div>
      </Section>
    </div>
  );
}

/* ── 2 · The Path — one continuous Duolingo trail ───────────────────────── */

type WeekStatus = "done" | "current" | "open5" | "locked";

function weekStatus(n: number, s: PlayState): WeekStatus {
  if (n < CURRENT_WEEK) return "done";
  if (n === CURRENT_WEEK) return "current";
  if (n === 5 && s.week5Unlocked) return "open5";
  return "locked";
}

interface TrailNodeModel {
  id: string;
  week: number;
  label: string;
  title: string;
  kind: "class" | "drill" | "block" | "review";
  state: "done" | "current" | "info" | "locked";
  xp: number;
  action?: () => void;
  hint: string;
}

/** Build every node on the trail — the class node is NEVER dead: past = rewatch, future = details. */
function buildTrail(s: PlayState, go: (k: string) => void, d: Dispatch): TrailNodeModel[] {
  const nodes: TrailNodeModel[] = [];
  for (const e of ENGINE) {
    const st = weekStatus(e.n, s);
    if (e.n === CURRENT_WEEK) {
      for (const day of s.days) {
        const kind = day.isBlock ? "block" : day.id === "d1" ? "class" : day.id === "d5" ? "review" : "drill";
        nodes.push({
          id: day.id, week: e.n, label: day.label, title: day.title, kind, xp: day.xp,
          state: day.state === "done" && kind === "class" ? "done" : day.state,
          action:
            kind === "class" ? () => go("session/4")
            : day.id === "d3" && day.state === "current" ? () => go("recording/4")
            : day.isBlock && day.state === "current" ? () => go("assignment/4")
            : day.state === "current" ? () => d({ type: "complete_day", id: day.id })
            : undefined,
          hint:
            kind === "class" ? "Open the session — details, recording, resources"
            : day.state === "done" ? "Done — XP banked"
            : day.state === "current" ? (day.isBlock ? "Open the assignment" : "Tap to do this now")
            : "Opens when the day before it is done",
        });
      }
      continue;
    }
    for (const day of daysForWeek(e.n)) {
      const isClass = day.kind === "class";
      const state: TrailNodeModel["state"] =
        st === "done" ? "done"
        : isClass ? "info"
        : st === "open5" && day.kind === "drill" ? "current"
        : "locked";
      nodes.push({
        id: day.id, week: e.n, label: day.label, title: day.title, kind: day.kind, xp: day.xp,
        state,
        action: isClass ? () => go(`session/${e.n}`) : st === "done" ? () => go(`session/${e.n}`) : undefined,
        hint:
          isClass ? (st === "done" ? "Rewatch the class — nothing re-locks" : st === "locked" ? `Details open now · class ${SESSION_DATES[e.n]}` : "Session details + Zoom link")
          : st === "done" ? "Done — revisit via the session page"
          : st === "open5" ? "Opens after Sunday's class"
          : e.n === 5 ? "Unlocks with your Week 4 block"
          : `Unlocks ${OPENS_ON[e.n] ?? "later"} + Week ${e.n - 1}'s block`,
      });
    }
  }
  return nodes;
}

/** The pulsing halo on the current node — isolated so the loop never re-renders the trail. */
function CurrentHalo({ tint }: { tint: string }) {
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

const NODE_STYLE = {
  done: { bg: "hsl(var(--success))", fg: "hsl(var(--cream-text))", lip: "hsl(156 77% 22%)" },
  locked: { bg: "hsl(var(--secondary))", fg: "hsl(var(--muted-foreground))", lip: "hsl(0 0% 5%)" },
} as const;

function TrailNode({ node, tone, index }: { node: TrailNodeModel; tone: { c: string; d: string }; index: number }) {
  const off = snakeOffset(index, false) * 0.75;
  const isCurrent = node.state === "current";
  const isInfo = node.state === "info";
  const clickable = Boolean(node.action);
  const palette =
    node.state === "done" ? NODE_STYLE.done
    : isCurrent ? { bg: tone.c, fg: "hsl(var(--cream-text))", lip: tone.d }
    : isInfo ? { bg: "hsl(var(--card))", fg: tone.c, lip: "hsl(0 0% 5%)" }
    : NODE_STYLE.locked;

  const face =
    node.state === "done" ? (node.kind === "class" ? <Play className="h-4 w-4 fill-current" /> : <Check className="h-4 w-4" strokeWidth={3} />)
    : isInfo ? <Radio className="h-4 w-4" />
    : node.state === "locked" ? <Lock className="h-3.5 w-3.5" />
    : node.kind === "class" ? <Radio className="h-4 w-4" />
    : node.kind === "block" ? <Zap className="h-4 w-4" />
    : <Play className="h-4 w-4 fill-current" />;

  return (
    <div className="relative flex flex-col items-center" style={{ transform: `translateX(${off}px)` }}>
      {isCurrent && (
        <div className="absolute -top-8 z-10 animate-bounce" style={{ animationDuration: "1.6s" }}>
          <div className="rounded-lg bg-[hsl(var(--cream))] px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide text-[hsl(var(--cream-text))] shadow-lg">
            {node.kind === "block" ? "SUBMIT" : node.id === "d3" ? "WATCH" : "START"}
          </div>
        </div>
      )}
      <HoverCard openDelay={120} closeDelay={60}>
        <HoverCardTrigger asChild>
          <motion.button
            type="button"
            disabled={!clickable}
            onClick={node.action}
            aria-label={`${node.label} — ${node.title}`}
            whileHover={clickable ? { scale: 1.08, y: -2 } : undefined}
            whileTap={clickable ? { scale: 0.92, y: 3 } : undefined}
            transition={{ type: "spring", stiffness: 340, damping: 18 }}
            className={`relative grid h-12 w-12 place-items-center rounded-full text-[15px] font-extrabold ${node.state === "locked" ? "opacity-70" : ""} ${isInfo ? "border" : ""}`}
            style={{
              background: palette.bg,
              color: palette.fg,
              borderColor: isInfo ? `${tone.c}` : undefined,
              boxShadow: node.state === "locked" ? "none" : `0 5px 0 ${palette.lip}`,
            }}
          >
            {isCurrent && <CurrentHalo tint={tone.c} />}
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
                Week {node.week} · {node.label}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--gold)/0.35)] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--gold))]">
                <Zap className="h-3 w-3" /> {node.xp} XP
              </span>
            </div>
            <div className="mt-1.5 text-[13.5px] font-semibold leading-snug">{node.title}</div>
            {node.kind === "class" && (
              <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                {SESSION_INFO[node.week]?.blurb}
              </p>
            )}
            <div className={`mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold ${clickable ? "" : "text-[hsl(var(--muted-foreground))]"}`}
              style={clickable ? { color: tone.c } : undefined}>
              {clickable ? <ChevronRight className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {node.hint}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
      <div className="mt-2 text-center">
        <div className="text-[10px] font-extrabold tracking-wide" style={{ color: node.state === "done" ? "hsl(var(--success))" : isCurrent || isInfo ? tone.c : "hsl(var(--muted-foreground))" }}>
          {node.label.toUpperCase()}
        </div>
        <div className="max-w-[180px] text-[10.5px] leading-tight text-[hsl(var(--muted-foreground))]">{node.title}</div>
      </div>
    </div>
  );
}

function WeekDivider({ n, s, tone }: { n: number; s: PlayState; tone: { c: string } }) {
  const st = weekStatus(n, s);
  const e = ENGINE[n];
  return (
    <div className="flex w-full items-center gap-3 py-1">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[hsl(var(--border))]" />
      <div className="text-center">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: st === "locked" ? "hsl(var(--muted-foreground))" : tone.c }}>
          Week {n} · {SESSION_DATES[n]}
        </div>
        <div className={`text-[12.5px] font-bold tracking-[-0.01em] ${st === "locked" ? "text-[hsl(var(--muted-foreground))]" : ""}`}>{e.title}</div>
        <div className="mt-0.5 text-[10.5px] text-[hsl(var(--muted-foreground))]">
          {st === "done" ? "Done — open to revisit"
            : st === "current" ? `The block: ${e.block}`
            : st === "open5" ? "Just opened"
            : n === 5 ? "Doors open with your Week 4 block"
            : `Doors open ${OPENS_ON[n]} + Week ${n - 1}'s block · session details already open`}
        </div>
      </div>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[hsl(var(--border))]" />
    </div>
  );
}

function PhaseBanner({ name, weeks, tone }: { name: string; weeks: string; tone: { c: string; d: string } }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border px-5 py-4"
      style={{ borderColor: `${tone.c}40`, background: `linear-gradient(120deg, ${tone.c}1f, transparent 65%)` }}
    >
      <div className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: tone.c }}>Phase · {weeks}</div>
      <div className="mt-0.5 text-[16px] font-bold tracking-[-0.01em]">{name}</div>
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl"
        style={{ background: tone.c }}
      />
    </div>
  );
}

export function PathScreen({ s, d, go }: ScreenProps) {
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [activeWeek, setActiveWeek] = useState(CURRENT_WEEK);
  const weekRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const nodes = useMemo(() => buildTrail(s, go, d), [s, go, d]);
  const doneSteps = nodes.filter((n) => n.state === "done").length;

  const jump = (n: number) => weekRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Scroll-spy: the rail follows the trail. Guarded — jsdom has no IntersectionObserver.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            const n = Number((en.target as HTMLElement).dataset.week);
            if (!Number.isNaN(n)) setActiveWeek(n);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    Object.values(weekRefs.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const openSession = (n: number) => { setOverviewOpen(false); go(`session/${n}`); };

  const progressBar = (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
      <motion.div
        className="h-full rounded-full"
        style={{ background: "linear-gradient(90deg, hsl(var(--gold)), hsl(var(--champagne-from)))" }}
        initial={false}
        animate={{ width: `${Math.round((doneSteps / nodes.length) * 100)}%` }}
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
          <Button variant="outline" size="sm" onClick={() => setOverviewOpen(true)}>
            <ListTree /> All sessions
          </Button>
        }
      />

      {/* Mobile sticky bar: progress + overview. */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-[hsl(var(--border))] bg-black/85 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex-1">{progressBar}</div>
          <span className="shrink-0 text-[10.5px] font-bold text-[hsl(var(--muted-foreground))]">{doneSteps}/{nodes.length}</span>
          <button
            type="button"
            onClick={() => setOverviewOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[hsl(var(--border))] px-2 py-1 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]"
          >
            <ListTree className="h-3.5 w-3.5" /> W{activeWeek}
          </button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[236px_1fr] lg:gap-10">
        {/* Desktop rail — scroll-spy follows you down the trail. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-bold text-[hsl(var(--muted-foreground))]">
                <span>PROGRESS</span><span>{doneSteps} of {nodes.length} steps</span>
              </div>
              {progressBar}
            </div>
            <nav aria-label="Jump to a week" className="space-y-0.5">
              {PHASES.map((p) => {
                const t = toneForPhase(p.name);
                return (
                  <div key={p.name} className="pt-2 first:pt-0">
                    <div className="px-2 pb-1 text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color: t.c }}>{p.name}</div>
                    {ENGINE.filter((e) => e.phase === p.name).map((e) => {
                      const st = weekStatus(e.n, s);
                      const on = activeWeek === e.n;
                      return (
                        <button
                          key={e.n}
                          type="button"
                          onClick={() => jump(e.n)}
                          className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                            on ? "border-[hsl(var(--border))] bg-[hsl(var(--secondary))]" : "border-transparent hover:bg-[hsl(var(--secondary))]/60"
                          }`}
                        >
                          <span
                            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-extrabold"
                            style={{
                              background: st === "done" ? "hsl(var(--success))" : st === "current" || st === "open5" ? t.c : "hsl(var(--secondary))",
                              color: st === "locked" ? "hsl(var(--muted-foreground))" : "hsl(var(--cream-text))",
                            }}
                          >
                            {st === "done" ? <Check className="h-3 w-3" strokeWidth={3.5} /> : e.n}
                          </span>
                          <span className={`min-w-0 truncate text-[11.5px] font-medium ${st === "locked" && !on ? "text-[hsl(var(--muted-foreground))]" : ""}`}>
                            {e.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* THE TRAIL — continuous, winding, phase-tinted. No boxes. */}
        <div className="min-w-0">
          <div className="mx-auto flex max-w-md flex-col items-center gap-6 lg:max-w-lg">
            {PHASES.map((p) => {
              const t = toneForPhase(p.name);
              const phaseWeeks = ENGINE.filter((e) => e.phase === p.name);
              return (
                <div key={p.name} className="flex w-full flex-col items-center gap-6">
                  <PhaseBanner name={p.name} weeks={p.weeks} tone={t} />
                  {phaseWeeks.map((e) => (
                    <div
                      key={e.n}
                      ref={(el) => { weekRefs.current[e.n] = el; }}
                      data-week={e.n}
                      className="flex w-full scroll-mt-16 flex-col items-center gap-6 lg:scroll-mt-24"
                    >
                      <WeekDivider n={e.n} s={s} tone={t} />
                      {nodes.filter((nd) => nd.week === e.n).map((nd) => (
                        <TrailNode key={nd.id} node={nd} tone={t} index={nodes.findIndex((x) => x.id === nd.id)} />
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}

            <div className="w-full pt-2">
              <SurfaceCard variant="static" padding="lg" className="text-center">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">Demo Day</div>
                <div className="mt-1 text-[15px] font-semibold">Sat 19 Sep — your engine, on stage</div>
                <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))]">Thirteen blocks stack into one working Distribution Engine. That's the whole game.</p>
              </SurfaceCard>
            </div>
          </div>
        </div>
      </div>

      {/* The overview — every session, one sheet, jump anywhere. */}
      <Sheet open={overviewOpen} onOpenChange={setOverviewOpen}>
        <SheetContent className="w-full overflow-y-auto border-[hsl(var(--border))] bg-black/90 backdrop-blur-xl sm:max-w-md">
          <SheetHeader className="text-left">
            <SheetTitle>All sessions</SheetTitle>
            <SheetDescription>Cohort 01 · Sundays 3 PM. Tap a session for details — every one is open to read.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {PHASES.map((p) => {
              const t = toneForPhase(p.name);
              return (
                <div key={p.name}>
                  <div className="pb-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.18em]" style={{ color: t.c }}>
                    {p.name} · {p.weeks}
                  </div>
                  <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                    {ENGINE.filter((e) => e.phase === p.name).map((e) => {
                      const st = weekStatus(e.n, s);
                      return (
                        <div key={e.n} className="flex items-center gap-2 bg-[hsl(var(--card))] px-3 py-2.5 transition-colors hover:bg-[hsl(var(--secondary))]">
                          <button type="button" onClick={() => openSession(e.n)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                            <span
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-extrabold"
                              style={{
                                background: st === "done" ? "hsl(var(--success))" : st === "current" || st === "open5" ? t.c : "hsl(var(--secondary))",
                                color: st === "locked" ? "hsl(var(--muted-foreground))" : "hsl(var(--cream-text))",
                              }}
                            >
                              {st === "done" ? <Check className="h-3 w-3" strokeWidth={3.5} /> : e.n}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[12.5px] font-semibold">{e.title}</span>
                              <span className="block text-[10.5px] text-[hsl(var(--muted-foreground))]">
                                {SESSION_DATES[e.n]} · {st === "done" ? "done" : st === "current" ? "this week" : st === "open5" ? "open" : "upcoming"}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            title="Show on the trail"
                            aria-label={`Show Week ${e.n} on the trail`}
                            onClick={() => { setOverviewOpen(false); window.setTimeout(() => jump(e.n), 250); }}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-black/40 hover:text-[hsl(var(--foreground))]"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ── 3 · Session detail — EVERY week has one, locked or not ─────────────── */

export function SessionDetailScreen({ s, go, week }: Pick<ScreenProps, "s" | "go"> & { week: number }) {
  const e = ENGINE[week] ?? ENGINE[4];
  const n = e.n;
  const t = toneForPhase(e.phase);
  const info = SESSION_INFO[n];
  const st = weekStatus(n, s);
  const isPastOrCurrent = n <= CURRENT_WEEK;
  const isNextLive = n === LIVE_SESSION.week;

  return (
    <div className="space-y-6">
      <BackRow label="The Path" onClick={() => go("path")} />
      <PageHeader
        eyebrow={`Week ${n} · ${e.phase} · ${SESSION_DATES[n]} 3:00 PM`}
        title={e.title}
        subtitle={info?.blurb}
        meta={
          <>
            <span className="inline-flex items-center gap-1.5"><Radio className="h-3.5 w-3.5" style={{ color: t.c }} /> Live class · hosted by Rahul</span>
            <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-[hsl(var(--gold))]" /> Attendance earns 20 XP</span>
            {st === "done" && <span className="inline-flex items-center gap-1.5 text-[hsl(var(--success))]"><Check className="h-3.5 w-3.5" /> You attended</span>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="space-y-4">
          <SurfaceCard variant="static" padding="lg">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">On the call</div>
            <ul className="mt-2.5 space-y-2">
              {(info?.agenda ?? []).map((line, i) => (
                <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[10px] font-bold" style={{ color: t.c }}>{i + 1}</span>
                  {line}
                </li>
              ))}
            </ul>
          </SurfaceCard>

          <SurfaceCard variant="static" padding="lg">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">The week it opens</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              The block: <span className="text-[hsl(var(--foreground))]">{e.block}</span>. Tue drill → Thu 9 PM block → Sat 6 PM Ship / Fix / Hold.
              {!isPastOrCurrent && " Those unlock in order once the week's doors open — this page never locks."}
            </p>
          </SurfaceCard>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24">
          {st === "done" || n === CURRENT_WEEK ? (
            <SurfaceCard variant="static" padding="lg">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--gold))]">Recording</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                {RECORDINGS[n] ? `Full class · ${RECORDINGS[n].duration}. ${s.watched.includes(`rec-w${n}`) ? "You've watched this — rewatch any time." : "Nothing you've opened ever re-locks."}` : "The recording lands here after the call."}
              </p>
              {RECORDINGS[n] && (
                <div className="mt-3">
                  <Button variant="champagne" className="w-full" onClick={() => go(`recording/${n}`)}>
                    <Play /> {s.watched.includes(`rec-w${n}`) ? "Rewatch the class" : "Watch the recording"}
                  </Button>
                </div>
              )}
            </SurfaceCard>
          ) : (
            <SurfaceCard variant="static" padding="lg">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--gold))]">Your seat</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                {isNextLive
                  ? "Personal join link — attendance is tracked automatically and earns XP. The recording lands here after the call."
                  : `Live ${SESSION_DATES[n]} at 3 PM. Your personal Zoom link appears here 30 minutes before the class — the session page is always open, only the drills wait.`}
              </p>
              <div className="mt-3">
                {isNextLive ? (
                  <Button variant="champagne" className="w-full" asChild>
                    <a href={LIVE_SESSION.zoomUrl} target="_blank" rel="noreferrer">
                      <Video /> Join on Zoom
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    <Video /> Zoom link drops {SESSION_DATES[n]}
                  </Button>
                )}
              </div>
              {isNextLive && <div className="mt-2 text-center text-[10.5px] text-[hsl(var(--muted-foreground))]">zoom.us · opens in the Zoom app</div>}
            </SurfaceCard>
          )}

          <SurfaceCard variant="static" padding="lg">
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <Flame className="h-4 w-4 text-[hsl(var(--accent-amber))]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Come with</span>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              {n === 5
                ? s.blockStatus === "none"
                  ? "Your three Week 4 reels — submit the block first so Rahul can pull yours up live."
                  : "Your three Week 4 reels — already in. You might get the live re-direct."
                : n <= CURRENT_WEEK
                  ? "This one's behind you — the resources stay on this page."
                  : `Week ${n - 1}'s block, shipped. That's the door in.`}
            </p>
          </SurfaceCard>

          <div className="flex gap-2">
            {[{ I: FileText, t: "Transcript" }, { I: ClipboardList, t: "Cheat sheet" }, { I: CalendarDays, t: "Add to calendar" }].map(({ I, t: label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                <I className="h-3.5 w-3.5 text-[hsl(var(--cream))]" /> {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 4 · Recording — a real video, then straight to the work ────────────── */

export function RecordingScreen({ s, d, go, week }: ScreenProps & { week: number }) {
  const rec = RECORDINGS[week] ?? RECORDINGS[4];
  const watched = s.watched.includes(`rec-w${rec.week}`);
  const isCurrent = rec.week === CURRENT_WEEK;
  const willRedirect = isCurrent && s.blockStatus === "none";
  const [redirecting, setRedirecting] = useState(false);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const markWatched = () => {
    d({ type: "watch_recording", week: rec.week });
    if (willRedirect) {
      setRedirecting(true);
      // The founder's flow: finish the recording → land on the unfinished assignment.
      timer.current = window.setTimeout(() => go("assignment/4"), 900);
    }
  };

  return (
    <div className="space-y-6">
      <BackRow label="Session details" onClick={() => go(`session/${rec.week}`)} />
      <PageHeader
        eyebrow={`Week ${rec.week} · Recording`}
        title={ENGINE[rec.week].title}
        subtitle={isCurrent ? "Watch it through — when you're done, the block is next." : "Finished weeks stay open. Rewatch anything, any time."}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <SurfaceCard variant="static" padding="none" className="overflow-hidden">
          {/* A REAL playable video (public sample film as the dummy). */}
          <video
            key={rec.videoUrl}
            src={rec.videoUrl}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-black"
            onEnded={markWatched}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold">{rec.title}</div>
              <div className="text-[11.5px] text-[hsl(var(--muted-foreground))]">{rec.duration} · dummy footage, real flow</div>
            </div>
            <div className="flex gap-2">
              {[{ I: FileText, t: "Transcript" }, { I: ClipboardList, t: "Cheat sheet" }].map(({ I, t }) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--secondary))] px-2.5 py-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                  <I className="h-3.5 w-3.5 text-[hsl(var(--cream))]" /> {t}
                </span>
              ))}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard variant="static" padding="lg" className="lg:sticky lg:top-24">
          {!watched ? (
            <>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--gold))]">When you've watched it</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                {willRedirect
                  ? "Mark it done and I'll take you straight to the one thing left this week — the block."
                  : "Mark it watched to log the rewatch. Nothing re-locks, ever."}
              </p>
              <div className="mt-3">
                <Button variant="champagne" className="w-full" onClick={markWatched}>
                  <Check /> I've finished the recording
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[hsl(var(--success))]">
                <Check className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Watched</span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                {redirecting
                  ? "Taking you to the assignment…"
                  : isCurrent && s.blockStatus === "none"
                    ? "One thing left this week: the block."
                    : "Logged. Revisit any time."}
              </p>
              {isCurrent && s.blockStatus === "none" && (
                <div className="mt-3">
                  <Button variant="champagne" className="w-full" onClick={() => go("assignment/4")}>
                    Go to the assignment <ArrowRight />
                  </Button>
                </div>
              )}
              {!isCurrent && (
                <div className="mt-3">
                  <Button variant="outline" className="w-full" onClick={() => go("path")}>Back to the Path</Button>
                </div>
              )}
            </>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}

/* ── 5 · Assignment — the block, submit it, watch the gate open ─────────── */

export function AssignmentScreen({ s, d, go }: ScreenProps) {
  const [text, setText] = useState(s.blockText);
  return (
    <div className="space-y-6">
      <BackRow label="The Path" onClick={() => go("path")} />
      <PageHeader
        eyebrow="Week 4 · The block · due Thu 9 PM"
        title="3 reels from one sitting"
        subtitle="One batch day, three finished reels. This is the deliverable that opens Week 5."
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr] lg:items-start">
        <div className="space-y-4">
          <SurfaceCard variant="static" padding="lg">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">The brief</div>
            <ul className="mt-2.5 space-y-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              {[
                "Batch-shoot in ONE sitting — teleprompter + your B-roll bank.",
                "Three reels, each under 60 seconds, hooks first.",
                "Post links below (Instagram, YouTube or Drive).",
              ].map((line) => (
                <li key={line} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" /> {line}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => go("recording/4")}
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[hsl(var(--gold))] underline underline-offset-4"
            >
              <Video className="h-3.5 w-3.5" /> Rewatch the class first
            </button>
          </SurfaceCard>
          <SurfaceCard variant="static" padding="lg">
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <CalendarDays className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Why it gates Week 5</span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              Week 5 is on-camera work built on this batch. Submitting the block — not watching, not attending — is what opens it. Your mentor reviews it on Saturday's Ship / Fix / Hold call.
            </p>
          </SurfaceCard>
        </div>

        <SurfaceCard variant="static" padding="lg" className="lg:sticky lg:top-24">
          {s.blockStatus === "none" ? (
            <>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--gold))]">Submit the block</div>
              <label htmlFor="block-input" className="mt-2 block text-[13px] font-semibold">
                Your 3 reels — links or notes
              </label>
              <textarea
                id="block-input"
                value={text}
                onChange={(ev) => setText(ev.target.value)}
                rows={6}
                placeholder="Reel 1: … &#10;Reel 2: … &#10;Reel 3: …"
                className="mt-2 w-full resize-none rounded-xl border border-[hsl(var(--input))] bg-black/40 p-3 text-[13px] leading-relaxed outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-hover))]"
              />
              <div className="mt-3">
                <Button variant="champagne" className="w-full" disabled={!text.trim()} onClick={() => d({ type: "submit_block", text })}>
                  Submit · unlocks Week 5
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[hsl(var(--success))]">
                <Check className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-[0.12em]">
                  {s.blockStatus === "accepted" ? "Accepted by Rahul" : "Submitted — Week 5 is open"}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[hsl(var(--secondary))] p-3 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">{s.blockText}</p>
              <p className="mt-3 text-[12px] text-[hsl(var(--muted-foreground))]">
                {s.blockStatus === "accepted"
                  ? "Approved work can go on your profile — open Creator OS."
                  : "Now play the mentor: open the Mentor desk and accept it."}
              </p>
              <div className="mt-3">
                <Button variant="outline" className="w-full" onClick={() => go(s.blockStatus === "accepted" ? "album" : "mentor")}>
                  {s.blockStatus === "accepted" ? "Open Creator OS" : "Open the Mentor desk"} <ChevronRight />
                </Button>
              </div>
            </>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}
