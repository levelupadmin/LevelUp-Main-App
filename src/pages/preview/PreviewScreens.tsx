/**
 * Creator Studio prototype — core screens: Home, Path, Recording, Assignment,
 * Live session. Social surfaces (Album/Feed/Mentor/Admin) live in
 * `PreviewStudioScreens.tsx`.
 *
 * 🔴 THE RULE THIS FILE LIVES BY. Every surface is the app's canonical
 * primitive: `SurfaceCard`, `PageHeader`, `Section`, `StatCard`, and the
 * champagne `Button`. Hand-rolled lookalikes were the "I hate the design"
 * failure — twice. Extend the pattern library if something's missing.
 *
 * v2, after the founder's walkthrough. The organizing principle of this
 * version: **the first thing a student sees is what to DO next** — not their
 * XP. Stats live in the shell header only. Home is: continue → this week →
 * upcoming. The Path is all 13 weeks, browsable, with a jump rail.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Flame, Lock, Check, Play, FileText, ClipboardList, ChevronRight, ChevronLeft,
  Video, CalendarDays, ArrowRight, Instagram, Youtube, HardDrive, Link2, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, SurfaceCard } from "@/components/patterns";
import {
  ENGINE, PHASES, CURRENT_WEEK, OPENS_ON, daysForWeek, RECORDINGS, LIVE_SESSION,
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
      goTo: "live",
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
                  day.id === "d3" && day.state === "current" ? go("recording/4")
                  : day.isBlock && day.state === "current" ? go("assignment/4")
                  : day.state === "current" ? d({ type: "complete_day", id: day.id })
                  : undefined
                }
                className="group flex items-center gap-2 disabled:cursor-not-allowed"
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-extrabold"
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
          <SurfaceCard variant="interactive" padding="none" className="overflow-hidden" onClick={() => go("live")}>
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

/* ── 2 · The Path — all 13 weeks, browsable, with a jump rail ───────────── */

type WeekStatus = "done" | "current" | "open5" | "locked";

function weekStatus(n: number, s: PlayState): WeekStatus {
  if (n < CURRENT_WEEK) return "done";
  if (n === CURRENT_WEEK) return "current";
  if (n === 5 && s.week5Unlocked) return "open5";
  return "locked";
}

export function PathScreen({ s, d, go }: ScreenProps) {
  const refs = useRef<Record<number, HTMLDivElement | null>>({});
  const jump = (n: number) => refs.current[n]?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="The Path"
        title={<>Your Distribution <Serif>Engine</Serif></>}
        subtitle="All 13 blocks. Finished weeks stay open to revisit. A locked week shows you its sessions — its doors open on the date, once the previous block is in."
      />

      {/* Mobile jump rail — sticky chips, no full-page scroll hunting. */}
      <nav
        aria-label="Jump to a week"
        className="sticky top-0 z-10 -mx-4 flex gap-1.5 overflow-x-auto border-b border-[hsl(var(--border))] bg-black/85 px-4 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden"
      >
        {ENGINE.map((e) => {
          const st = weekStatus(e.n, s);
          return (
            <button
              key={e.n}
              type="button"
              onClick={() => jump(e.n)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                st === "current" ? "bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))]"
                : st === "done" ? "text-[hsl(var(--success))]"
                : st === "open5" ? "text-[hsl(var(--cream))]"
                : "text-[hsl(var(--muted-foreground))]"
              }`}
            >
              W{e.n}
            </button>
          );
        })}
      </nav>

      <div className="lg:grid lg:grid-cols-[224px_1fr] lg:gap-8">
        {/* Desktop jump rail — every block, one click, no scrolling through 13 weeks. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-1">
            {ENGINE.map((e) => {
              const st = weekStatus(e.n, s);
              const t = toneForPhase(e.phase);
              return (
                <button
                  key={e.n}
                  type="button"
                  onClick={() => jump(e.n)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    st === "current" ? "border-[hsl(var(--border))] bg-[hsl(var(--secondary))]" : "border-transparent hover:bg-[hsl(var(--secondary))]/60"
                  }`}
                >
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-extrabold"
                    style={{
                      background: st === "done" ? "hsl(var(--success))" : st === "current" || st === "open5" ? t.c : "hsl(var(--secondary))",
                      color: st === "locked" ? "hsl(var(--muted-foreground))" : "hsl(var(--cream-text))",
                    }}
                  >
                    {st === "done" ? <Check className="h-3 w-3" strokeWidth={3.5} /> : st === "locked" ? <Lock className="h-2.5 w-2.5" /> : e.n}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className={`block truncate text-[11.5px] font-medium ${st === "locked" ? "text-[hsl(var(--muted-foreground))]" : ""}`}>
                      W{e.n} · {e.title}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* The board — every week, winding, in phase colour. */}
        <div className="min-w-0 space-y-10">
          {ENGINE.map((e) => (
            <WeekOnPath key={e.n} n={e.n} s={s} d={d} go={go} refCb={(el) => { refs.current[e.n] = el; }} />
          ))}

          <SurfaceCard variant="static" padding="lg" className="text-center">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">Demo Day</div>
            <div className="mt-1 text-[15px] font-semibold">Sat 19 Sep — your engine, on stage</div>
            <p className="mt-1 text-[12px] text-[hsl(var(--muted-foreground))]">Thirteen blocks stack into one working Distribution Engine. That's the whole game.</p>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}

function WeekOnPath({ n, s, d, go, refCb }: { n: number; s: PlayState; d: Dispatch; go: (k: string) => void; refCb: (el: HTMLDivElement | null) => void }) {
  const e = ENGINE[n];
  const t = toneForPhase(e.phase);
  const st = weekStatus(n, s);
  const phaseStart = PHASES.find((p) => ENGINE.find((x) => x.phase === p.name)?.n === n);

  // Current week plays from the store; every other week renders its template.
  const days = n === CURRENT_WEEK
    ? s.days.map((day) => ({ id: day.id, label: day.label, title: day.title, state: day.state, isBlock: day.isBlock, kind: day.isBlock ? "block" : day.id === "d1" ? "class" : "drill" }))
    : daysForWeek(n).map((day) => ({
        id: day.id, label: day.label, title: day.title, isBlock: day.kind === "block", kind: day.kind,
        state: st === "done" ? ("done" as const) : st === "open5" && day.kind === "class" ? ("current" as const) : ("locked" as const),
      }));

  return (
    <div ref={refCb} className="scroll-mt-16 lg:scroll-mt-24">
      {phaseStart && (
        <div className="mb-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-[hsl(var(--border))]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: t.c }}>
            Phase · {phaseStart.name} ({phaseStart.weeks})
          </span>
          <span className="h-px flex-1 bg-[hsl(var(--border))]" />
        </div>
      )}

      {/* Week banner — state in plain words, never just a lock icon. */}
      <div className="rounded-2xl border p-4" style={{ borderColor: st === "current" ? `${t.c}` : "hsl(var(--border))", background: st === "current" ? "hsl(var(--secondary))" : "transparent" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: t.c }}>
              Week {n} · {e.phase}
            </div>
            <div className={`mt-0.5 text-[15px] font-bold tracking-[-0.01em] ${st === "locked" ? "text-[hsl(var(--muted-foreground))]" : ""}`}>{e.title}</div>
            <div className="mt-0.5 text-[12px] text-[hsl(var(--muted-foreground))]">The block: {e.block}</div>
          </div>
          <div className="shrink-0 text-right">
            {st === "done" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--success)/0.4)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--success))]">
                <Check className="h-3 w-3" /> Done — open to revisit
              </span>
            )}
            {st === "current" && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide" style={{ background: t.c, color: "hsl(var(--cream-text))" }}>
                You are here
              </span>
            )}
            {st === "open5" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--cream)/0.35)] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--cream))]">
                Just opened
              </span>
            )}
            {st === "locked" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border-hover))] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">
                <Lock className="h-3 w-3" /> {OPENS_ON[n] ?? "Later"}{n === 5 ? " + Week 4 block" : ` + Week ${n - 1} block`}
              </span>
            )}
          </div>
        </div>

        {/* The days — visible for every week (that's the ask), openable only when earned. */}
        <div className="mt-5 flex flex-col items-center gap-5 py-1">
          {days.map((day, i) => {
            const done = day.state === "done";
            const current = day.state === "current";
            const locked = day.state === "locked";
            const revisitable = st === "done" && day.kind === "class";
            const clickable =
              (current && n === CURRENT_WEEK) || revisitable || (st === "open5" && day.kind === "class");
            const off = snakeOffset(i, false) * 0.55;
            const onTap = () => {
              if (revisitable) return go(`recording/${n}`);
              if (st === "open5" && day.kind === "class") return go("live");
              if (n !== CURRENT_WEEK) return;
              if (day.id === "d3" && current) return go("recording/4");
              if (day.isBlock && current) return go("assignment/4");
              if (current) return d({ type: "complete_day", id: day.id });
            };
            return (
              <div key={day.id} className="relative flex flex-col items-center" style={{ transform: `translateX(${off}px)` }}>
                {current && n === CURRENT_WEEK && (
                  <div className="absolute -top-8 z-10 animate-bounce" style={{ animationDuration: "1.6s" }}>
                    <div className="rounded-lg bg-[hsl(var(--cream))] px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide text-[hsl(var(--cream-text))] shadow-lg">
                      {day.isBlock ? "SUBMIT" : day.id === "d3" ? "WATCH" : "START"}
                    </div>
                  </div>
                )}
                <motion.button
                  type="button"
                  disabled={!clickable && !done}
                  onClick={onTap}
                  aria-label={`${day.label} — ${day.title}`}
                  whileTap={clickable ? { scale: 0.92, y: 3 } : undefined}
                  className={`grid h-12 w-12 place-items-center rounded-full text-[15px] font-extrabold ${!clickable && locked ? "opacity-70" : ""}`}
                  style={{
                    background: done ? "hsl(var(--success))" : current ? t.c : "hsl(var(--secondary))",
                    color: done || current ? "hsl(var(--cream-text))" : "hsl(var(--muted-foreground))",
                    boxShadow: locked ? "none" : `0 5px 0 ${done ? "hsl(156 77% 22%)" : current ? t.d : "hsl(0 0% 5%)"}`,
                  }}
                >
                  {done ? (revisitable ? <Play className="h-4 w-4 fill-current" /> : <Check className="h-4 w-4" strokeWidth={3} />) : locked ? <Lock className="h-3.5 w-3.5" /> : day.kind === "class" ? <Radio className="h-4 w-4" /> : i + 1}
                </motion.button>
                <div className="mt-2 text-center">
                  <div className="text-[10px] font-extrabold tracking-wide" style={{ color: done ? "hsl(var(--success))" : current ? t.c : "hsl(var(--muted-foreground))" }}>
                    {day.label.toUpperCase()}
                  </div>
                  <div className="max-w-[170px] text-[10.5px] leading-tight text-[hsl(var(--muted-foreground))]">
                    {day.title}
                    {revisitable && <span className="block text-[9.5px] font-semibold text-[hsl(var(--success))]">Tap to rewatch</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── 3 · Recording — a real video, then straight to the work ────────────── */

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
      <BackRow label="The Path" onClick={() => go("path")} />
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

/* ── 4 · Assignment — the block, submit it, watch the gate open ─────────── */

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

/* ── 5 · Live session — the Zoom door ───────────────────────────────────── */

export function LiveScreen({ s, go }: Pick<ScreenProps, "s" | "go">) {
  return (
    <div className="space-y-6">
      <BackRow label="Home" onClick={() => go("home")} />
      <PageHeader
        eyebrow={`Week ${LIVE_SESSION.week} · Live class`}
        title={<>On-Camera <Serif>Confidence</Serif></>}
        subtitle={`${LIVE_SESSION.when} · hosted by ${LIVE_SESSION.host} · live for everyone in the cohort.`}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <SurfaceCard variant="static" padding="none" className="overflow-hidden">
          <div className="relative grid h-48 place-items-center bg-gradient-to-br from-[#221a10] via-[#120e08] to-[#0a0a0a]">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-[hsl(var(--champagne-from))] to-[hsl(var(--champagne-to))]">
              <Radio className="h-4 w-4 text-[hsl(var(--cream-text))]" />
            </div>
            <div className="absolute left-4 top-4 flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--gold))]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--gold))]">Goes live · {LIVE_SESSION.when}</span>
            </div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">On the call</div>
            <ul className="mt-2.5 space-y-2">
              {LIVE_SESSION.agenda.map((line, i) => (
                <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[10px] font-bold text-[hsl(var(--gold))]">{i + 1}</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </SurfaceCard>

        <div className="space-y-4 lg:sticky lg:top-24">
          <SurfaceCard variant="static" padding="lg">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--gold))]">Your seat</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              Personal join link — attendance is tracked automatically and earns XP. Recording lands here after the call{s.week5Unlocked ? "." : " — it unlocks with your Week 4 block."}
            </p>
            <div className="mt-3">
              <Button variant="champagne" className="w-full" asChild>
                <a href={LIVE_SESSION.zoomUrl} target="_blank" rel="noreferrer">
                  <Video /> Join on Zoom
                </a>
              </Button>
            </div>
            <div className="mt-2 text-center text-[10.5px] text-[hsl(var(--muted-foreground))]">zoom.us · opens in the Zoom app</div>
          </SurfaceCard>
          <SurfaceCard variant="static" padding="lg">
            <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <Flame className="h-4 w-4 text-[hsl(var(--accent-amber))]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Come with</span>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              Your three Week 4 reels{s.blockStatus === "none" ? " — submit the block first so Rahul can pull yours up live." : " — already in. You might get the live re-direct."}
            </p>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
