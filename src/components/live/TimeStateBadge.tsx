import { useEffect, useState } from "react";
import {
  differenceInMinutes,
  format,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";
import { cn } from "@/lib/utils";

interface TimeStateBadgeProps {
  /** The session/event start. ISO string or Date. */
  date: string | Date;
  /**
   * How long the session runs, in minutes, used to keep the badge in the
   * "LIVE" state for the full duration rather than flipping to "Past" the
   * instant the clock passes the start time. Defaults to 60.
   */
  durationMin?: number | null;
  className?: string;
}

type State =
  | { kind: "live" }
  | { kind: "soon"; label: string }
  | { kind: "today"; label: string }
  | { kind: "tomorrow" }
  | { kind: "relative"; label: string }
  | { kind: "past"; label: string };

const FALLBACK_DURATION_MIN = 60;

const computeState = (target: Date, durationMin: number): State => {
  const now = new Date();
  const minsUntil = differenceInMinutes(target, now);
  const minsSinceStart = differenceInMinutes(now, target);

  // Live window: from start until start + duration.
  if (minsUntil <= 0 && minsSinceStart < durationMin) {
    return { kind: "live" };
  }

  // Already over.
  if (minsUntil < 0) {
    if (isToday(target)) return { kind: "past", label: `Today · ${format(target, "h:mm a")}` };
    if (isYesterday(target)) return { kind: "past", label: "Yesterday" };
    return { kind: "past", label: format(target, "EEE d MMM") };
  }

  // Imminent: within the hour, show the minute countdown label.
  if (minsUntil < 60) {
    return { kind: "soon", label: `In ${Math.max(1, minsUntil)} min` };
  }

  // Later today.
  if (isToday(target)) {
    return { kind: "today", label: `Today · ${format(target, "h:mm a")}` };
  }

  if (isTomorrow(target)) {
    return { kind: "tomorrow" };
  }

  // Further out, "Sat 14 Jun".
  return { kind: "relative", label: format(target, "EEE d MMM") };
};

/**
 * Relative-time badge for live sessions / events.
 *
 * Renders a compact pill whose copy + colour reflect how close the session is:
 *   • LIVE ●     : pulsing red dot, while the session is in its run window
 *   • IN 43 MIN  : amber, when under an hour away
 *   • TODAY · 6:00 PM / TOMORROW : cream, near-term
 *   • SAT 14 JUN : muted, further out
 *   • TODAY · 6:00 PM / SAT 14 JUN : muted, already finished
 *
 * The badge self-updates every 30s so a card left open transitions through the
 * states (e.g. "IN 2 MIN" → "LIVE ●") without a reload.
 */
export const TimeStateBadge = ({ date, durationMin, className }: TimeStateBadgeProps) => {
  const target = typeof date === "string" ? new Date(date) : date;
  const duration = durationMin && durationMin > 0 ? durationMin : FALLBACK_DURATION_MIN;

  const [state, setState] = useState<State>(() => computeState(target, duration));

  useEffect(() => {
    const tick = () => setState(computeState(target, duration));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [target.getTime(), duration]);

  const base =
    "inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded whitespace-nowrap";

  if (state.kind === "live") {
    return (
      <span
        className={cn(base, "bg-[hsl(var(--accent-crimson)/0.15)] text-[hsl(var(--accent-crimson-text))] font-semibold", className)}
        aria-label="Live now"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--accent-crimson))] opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--accent-crimson))]" />
        </span>
        Live
      </span>
    );
  }

  if (state.kind === "soon") {
    return (
      <span className={cn(base, "bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]", className)}>
        {state.label}
      </span>
    );
  }

  if (state.kind === "today") {
    return (
      <span className={cn(base, "bg-cream/12 text-cream", className)}>
        {state.label}
      </span>
    );
  }

  if (state.kind === "tomorrow") {
    return (
      <span className={cn(base, "bg-cream/12 text-cream", className)}>
        Tomorrow
      </span>
    );
  }

  if (state.kind === "relative") {
    return (
      <span className={cn(base, "bg-surface-2 text-muted-foreground", className)}>
        {state.label}
      </span>
    );
  }

  // past
  return (
    <span className={cn(base, "bg-muted text-muted-foreground", className)}>
      {state.label}
    </span>
  );
};

export default TimeStateBadge;
