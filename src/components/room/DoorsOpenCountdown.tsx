import { cn } from "@/lib/utils";
import { useRoomClock, useRoomClockFastTick } from "./RoomClockProvider";

/**
 * DoorsOpenCountdown — the last hour before a live session, counted in seconds.
 *
 * This is the emotional peak of the weekly rhythm and the screen's ONE
 * champagne moment: cream numerals, nothing else on the slot competing for the
 * eye. It renders only inside the `soon` window (T-60 → T-0), so `mm:ss` is the
 * whole vocabulary it needs — sixty minutes is its ceiling by construction.
 *
 * ── Time ─────────────────────────────────────────────────────────────────
 * The value is `target - now` recomputed from the room clock's own
 * `Date.now()` read on every tick, never a decremented counter. A late tick,
 * a throttled WebView or a backgrounded app therefore cost accuracy of exactly
 * zero: the next frame shows the true remaining time, so drift cannot
 * accumulate over a ten minute wait.
 *
 * The 1s cadence is BORROWED, not owned — `useRoomClockFastTick` asks the
 * room's single timer to speed up while this is mounted and hands it back on
 * unmount. There is no `setInterval` in this file, on purpose.
 *
 * ── Announcement ─────────────────────────────────────────────────────────
 * `role="timer"` with `aria-live="off"`: a screen reader that announced every
 * second for an hour would be unusable. The label carries the human phrasing
 * for anyone who moves focus to it.
 */

export interface DoorsOpenCountdownProps {
  /** When the doors open (the session's `scheduled_at`): ISO string or epoch ms. */
  startsAt: string | number;
  /** Mono eyebrow above the numerals. Pass null to render the numerals alone. */
  label?: string | null;
  className?: string;
}

const pad = (value: number): string => String(value).padStart(2, "0");

export function DoorsOpenCountdown({
  startsAt,
  label = "Doors open in",
  className,
}: DoorsOpenCountdownProps) {
  const nowMs = useRoomClock();
  useRoomClockFastTick();

  const startMs = typeof startsAt === "number" ? startsAt : Date.parse(startsAt);
  const remainingMs = Number.isFinite(startMs) ? Math.max(0, startMs - nowMs) : 0;

  // Rounded UP so the clock reads 00:00 at the instant the doors open and not a
  // second before it. Counting down through "00:00" while the join button is
  // still dark is the one thing this component must never do.
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          {label}
        </p>
      )}
      <span
        role="timer"
        aria-live="off"
        aria-label={`Doors open in ${minutes} minutes ${seconds} seconds`}
        // The room's own scale (tailwind.config.ts:20-28 tops out at 3xl/48px),
        // so this is 32px on a phone and 48px from `sm` up — the same step the
        // pre-start countdown takes. `text-4xl` would SHRINK it on this scale.
        className="mt-1 inline-flex items-baseline gap-px font-mono text-2xl leading-none tracking-tight text-cream tabular-nums sm:text-3xl"
      >
        <span>{pad(minutes)}</span>
        <span className="opacity-50">:</span>
        <span>{pad(seconds)}</span>
      </span>
    </div>
  );
}

export default DoorsOpenCountdown;
