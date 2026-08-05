/**
 * The Path — a direct port of the Creator OS board mechanics into this app's
 * palette. See `previewTheme.ts` for what is being copied and why.
 *
 * Responsive intent, stated because the first cut got this wrong: this is NOT
 * one column that happens to stretch. On a phone the board is the whole screen.
 * From `lg` up the board keeps its natural ~620px reading width and a sticky
 * context panel takes the space beside it, so a wide monitor gains a second
 * pane instead of a wider line length.
 */
import { useEffect, useState } from "react";
import { Check, Lock, Flame, Zap, Trophy, Gift, Target } from "lucide-react";
import { Eyebrow, Card, Chip } from "./PreviewUI";
import { WEEKS, STATS, ENGINE, PHASES, type PreviewWeek, type PreviewDay } from "./previewData";
import { toneForPhase, snakeOffset } from "./previewTheme";

/** Below this the snake amplitude is damped so nodes stay on screen. */
const COMPACT_BREAKPOINT = 640;

function useCompact() {
  const [compact, setCompact] = useState(
    typeof window === "undefined" ? false : window.innerWidth < COMPACT_BREAKPOINT,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`);
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return compact;
}

function Node({
  day, tone, index, compact, onOpen,
}: {
  day: PreviewDay;
  tone: { c: string; d: string };
  index: number;
  compact: boolean;
  onOpen: () => void;
}) {
  const done = day.state === "done";
  const current = day.state === "current";
  const locked = day.state === "locked";

  const bg = done ? "hsl(var(--success))" : current ? tone.c : locked ? "hsl(var(--secondary))" : "transparent";
  const lip = done ? "hsl(156 77% 22%)" : current ? tone.d : locked ? "hsl(0 0% 6%)" : "transparent";
  const ink = done ? "hsl(156 77% 10%)" : current ? "hsl(var(--cream-text))" : "hsl(var(--muted-foreground))";

  return (
    <div className="relative flex flex-col items-center" style={{ transform: `translateX(${snakeOffset(index, compact)}px)` }}>
      {current && (
        <div className="absolute -top-9 z-10 animate-bounce" style={{ animationDuration: "1.6s" }}>
          <div className="rounded-lg bg-[hsl(var(--cream))] px-3 py-1 text-[11px] font-extrabold tracking-wide text-[hsl(var(--cream-text))] shadow-lg">
            START
          </div>
          <div className="mx-auto -mt-1 h-2 w-2 rotate-45 bg-[hsl(var(--cream))]" />
        </div>
      )}
      <button
        type="button"
        onClick={onOpen}
        title={day.title}
        disabled={locked}
        aria-label={`${day.label} — ${day.title}${locked ? " (locked)" : ""}`}
        className="grid h-[58px] w-[58px] place-items-center rounded-full text-[19px] font-extrabold transition-transform hover:-translate-y-px active:translate-y-[3px] disabled:hover:translate-y-0"
        style={{ background: bg, color: ink, boxShadow: bg === "transparent" ? "none" : `0 5px 0 ${lip}` }}
      >
        {done ? <Check className="h-5 w-5" strokeWidth={3} /> : locked ? <Lock className="h-4 w-4" /> : index + 1}
      </button>
      <div className="mt-2 text-center">
        <div
          className="text-[10px] font-extrabold tracking-wide"
          style={{ color: done ? "hsl(var(--success))" : current ? tone.c : "hsl(var(--muted-foreground))" }}
        >
          {day.label.toUpperCase()}
        </div>
        <div className="mx-auto max-w-[128px] truncate text-[10px] text-[hsl(var(--muted-foreground))]">{day.title}</div>
      </div>
    </div>
  );
}

/** Opens each week — the tinted "you are entering this unit" banner. */
function UnitBanner({ week, tone }: { week: PreviewWeek; tone: { c: string; d: string } }) {
  return (
    <div
      className="mb-3 flex items-center gap-3.5 rounded-xl px-4 py-3.5"
      style={{ background: `linear-gradient(110deg, ${tone.c}1f, ${tone.c}08)`, border: `1px solid ${tone.c}40` }}
    >
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[13px] font-extrabold"
        style={{ background: tone.c, color: "hsl(var(--cream-text))" }}
      >
        W{week.n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.c }}>
          Unit · {week.phase}
        </div>
        <div className="truncate text-[14px] font-bold tracking-[-0.01em]">{week.theme}</div>
        <div className="mt-0.5 flex items-start gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
          <Target className="mt-px h-3 w-3 shrink-0" />
          <span className="min-w-0">{week.block}</span>
        </div>
      </div>
    </div>
  );
}

/** Closes each phase with its payoff — the reward, not another task. */
function PhaseChest({ payoff, tone, reached }: { payoff: string; tone: { c: string; d: string }; reached: boolean }) {
  return (
    <div className="my-6 flex flex-col items-center">
      <div
        className="grid h-16 w-16 place-items-center rounded-2xl"
        style={{ background: `${tone.c}1a`, border: `2px dashed ${tone.c}66`, boxShadow: `0 5px 0 ${tone.d}55` }}
      >
        {reached ? <Trophy className="h-6 w-6" style={{ color: tone.c }} /> : <Gift className="h-6 w-6" style={{ color: tone.c }} />}
      </div>
      <p className="mt-2 max-w-xs text-center text-[12px] text-[hsl(var(--muted-foreground))]">
        <span className="font-bold" style={{ color: tone.c }}>{reached ? "Reached" : "Phase reward"}: </span>
        {payoff}
      </p>
    </div>
  );
}

const PHASE_PAYOFF: Record<string, string> = {
  Position: "your story, on camera, and a niche you can defend",
  Produce: "a set, a bank and a batch day — you can make three reels in one sitting",
  Multiply: "one recording becomes seven assets, on two platforms",
  "Convert & Systemize": "leads, a scorecard, and a 12-month engine that runs without us",
};

export default function PathwayBoard({ onOpenDay }: { onOpenDay: () => void }) {
  const compact = useCompact();
  const pct = Math.round((STATS.week / (ENGINE.length - 1)) * 100);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:items-start">
      {/* ── the board ───────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-[620px]">
        <Card className="mb-6 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between">
              <Eyebrow>Your Distribution Engine</Eyebrow>
              <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                block {STATS.week} of {ENGINE.length - 1}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--champagne-to))] to-[hsl(var(--champagne-from))]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            <Chip tone="gold"><Zap className="mr-1 h-3 w-3" />{STATS.xp}</Chip>
            <Chip tone="success"><Flame className="mr-1 h-3 w-3" />{STATS.streak}</Chip>
          </div>
        </Card>

        {PHASES.map((phase) => {
          const tone = toneForPhase(phase.name);
          const weeks = WEEKS.filter((w) => w.phase === phase.name);
          if (!weeks.length) return null;
          const reached = weeks.every((w) => w.state === "done");
          return (
            <div key={phase.name}>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1" style={{ background: `${tone.c}33` }} />
                <span
                  className="rounded-full px-3 py-1 text-[11px] font-extrabold tracking-[0.18em]"
                  style={{ background: `${tone.c}1a`, color: tone.c }}
                >
                  {phase.name.toUpperCase()} · {phase.weeks}
                </span>
                <div className="h-px flex-1" style={{ background: `${tone.c}33` }} />
              </div>

              {weeks.map((w) => (
                <div key={w.n} className="mb-2">
                  <UnitBanner week={w} tone={tone} />
                  {w.state === "locked" ? (
                    <Card tone="locked" className="text-center">
                      <Lock className="mx-auto h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                      <p className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">{w.lockReason}</p>
                      <button
                        type="button"
                        onClick={onOpenDay}
                        className="mt-2.5 text-[12px] font-semibold underline underline-offset-4"
                        style={{ color: tone.c }}
                      >
                        See what's missing
                      </button>
                    </Card>
                  ) : (
                    <div className="flex flex-col items-center gap-5 py-3">
                      {w.days.map((d, i) => (
                        <Node key={d.label} day={d} tone={tone} index={i} compact={compact} onOpen={onOpenDay} />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <PhaseChest payoff={PHASE_PAYOFF[phase.name] ?? ""} tone={tone} reached={reached} />
            </div>
          );
        })}
      </div>

      {/* ── desktop-only context pane. On a phone this content is reachable
             from the day screen, so it is dropped rather than stacked. ──── */}
      <aside className="hidden lg:block lg:sticky lg:top-4 space-y-4">
        <Card tone="lit">
          <Eyebrow>This week</Eyebrow>
          <div className="mt-1.5 text-[14px] font-bold tracking-[-0.01em]">W{STATS.week} · Advanced Production</div>
          <div className="mt-2 flex items-start gap-1.5 text-[12px] text-[hsl(var(--muted-foreground))]">
            <Target className="mt-0.5 h-3 w-3 shrink-0" />
            <span>B-roll bank + 3 reels from one sitting</span>
          </div>
          <div className="mt-3 space-y-1.5 border-t border-[hsl(var(--border))] pt-3 text-[11.5px]">
            {[["Live class", "Sun 3 PM"], ["Block due", "Thu 9 PM"], ["Ship / Fix / Hold", "Sat 6 PM"]].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">{k}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Eyebrow>The engine · 13 blocks</Eyebrow>
          <div className="mt-2.5 space-y-0.5">
            {ENGINE.map((e) => {
              const t = toneForPhase(e.phase);
              const done = e.n < STATS.week;
              const now = e.n === STATS.week;
              return (
                <div key={e.n} className={`flex items-center gap-2 rounded px-1.5 py-1 ${now ? "bg-[hsl(var(--cream)/0.07)]" : ""}`}>
                  <span
                    className="w-6 shrink-0 text-[10px] font-bold"
                    style={{ color: done ? "hsl(var(--success))" : now ? t.c : "hsl(var(--muted-foreground))" }}
                  >
                    W{e.n}
                  </span>
                  <span className={`truncate text-[11.5px] ${!done && !now ? "text-[hsl(var(--muted-foreground))]" : ""}`}>
                    {e.title}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card tone="locked">
          <p className="text-[11.5px] leading-relaxed text-[hsl(var(--muted-foreground))]">
            <span className="font-semibold text-[hsl(var(--foreground))]">How unlocking works. </span>
            A week opens on its date <i>and</i> once the previous week&apos;s block is in. Days inside a week open in order.
          </p>
        </Card>
      </aside>
    </div>
  );
}

