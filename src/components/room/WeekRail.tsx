import { useEffect, useRef } from "react";
import { Check, Lock } from "lucide-react";

import { useMotionSafe } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { RoomWeekRow } from "@/hooks/useCohortRooms";
import {
  STATUS_TONE_CLASS,
  episodeCode,
  formatIstDayMonth,
  parseMs,
  weekStatusTone,
} from "./ThisWeekCard";

/**
 * WeekRail — the season as an episode rail, plus the progress strip above it.
 *
 * ── Why a rail and not a list ─────────────────────────────────────────────
 * The old dashboard stacked every week as a full-width row, which is fine at
 * eight weeks and a scroll marathon at twenty. A rail keeps the whole season
 * one gesture away and puts the week the student is IN on screen without them
 * hunting for it: the strip is the map, the rail is the shelf.
 *
 * ── Over twelve weeks ─────────────────────────────────────────────────────
 * The tiles NEVER squeeze. Each is `shrink-0` at a fixed width, the track is
 * `overflow-x-auto` with `snap-x`, and the horizontal scroll is contained to
 * the rail itself (the same `-mx-4 px-4` bleed the shell's tab rail uses), so a
 * twenty-week cohort scrolls the shelf and not the page. The strip above it
 * stays a fixed-height row of flexible segments, which is the one place a week
 * IS allowed to get narrower, because a segment carries no text.
 *
 * ── Motion ────────────────────────────────────────────────────────────────
 * Nothing here animates layout. The only movement is the rail's own scroll
 * position, set once when the selected week changes, and it is written as
 * `scrollLeft` on the track rather than `scrollIntoView` so it can never drag
 * the PAGE along with it. Reduced motion drops the smooth behaviour.
 */

export interface WeekRailProps {
  /** Every week row, in the RPC's own order (week_number ascending). */
  weeks: RoomWeekRow[];
  /** `week_id` of the week the module is showing. */
  activeWeekId: string | null;
  onSelect: (week: RoomWeekRow) => void;
  className?: string;
}

/** Fixed tile width: two-and-a-bit tiles at 360px, so the rail reads scrollable. */
const TILE_WIDTH = "w-[13.5rem]";

export function WeekRail({ weeks, activeWeekId, onSelect, className }: WeekRailProps) {
  const motionSafe = useMotionSafe();
  const trackRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  // Centre the selected tile in the track. Horizontal only, and a no-op when
  // the rail is not overflowing.
  useEffect(() => {
    const track = trackRef.current;
    const tile = activeRef.current;
    if (!track || !tile) return;
    const left = Math.max(0, tile.offsetLeft - (track.clientWidth - tile.clientWidth) / 2);
    // `scrollTo` is not universally present on ELEMENTS (older WebViews, and
    // jsdom under test); the assignment is the same scroll without the easing.
    if (typeof track.scrollTo === "function") {
      track.scrollTo({ left, behavior: motionSafe.reduced ? "auto" : "smooth" });
    } else {
      track.scrollLeft = left;
    }
  }, [activeWeekId, motionSafe.reduced]);

  if (weeks.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {/* ── The progress strip ──
          One segment per week, in the room's own accent: filled for the weeks
          that are done, half-lit for the week in progress, muted for what is
          still ahead. It is a control as well as a map, so every segment is a
          ≥44px-tall tap target with the visible bar centred inside it. */}
      <div className="flex gap-1" role="group" aria-label="Season progress">
        {weeks.map((week) => {
          const tone = weekStatusTone(week.week_status);
          const selected = week.week_id === activeWeekId;
          return (
            <button
              key={week.week_id}
              type="button"
              onClick={() => onSelect(week)}
              aria-current={selected ? "true" : undefined}
              aria-label={`Week ${week.week_number}${week.theme ? `: ${week.theme}` : ""}`}
              className="focus-ring group flex h-11 flex-1 items-center px-0.5"
            >
              <span
                className={cn(
                  "block h-1.5 w-full rounded-full transition-colors",
                  tone === "positive"
                    ? "bg-room-accent"
                    : tone === "accent"
                      ? "bg-room-accent/50"
                      : "bg-muted",
                  selected && "ring-1 ring-room-accent ring-offset-2 ring-offset-canvas",
                )}
              />
            </button>
          );
        })}
      </div>

      {/* ── The rail ── */}
      <ul
        ref={trackRef}
        aria-label="Weeks"
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
      >
        {weeks.map((week) => {
          const selected = week.week_id === activeWeekId;
          const done = week.week_status === "completed" || week.week_status === "archived";
          const startsMs = parseMs(week.starts_on);
          const endsMs = parseMs(week.ends_on);
          const locked =
            week.week_status === "upcoming" && Number.isFinite(startsMs) && startsMs > Date.now();

          return (
            <li
              key={week.week_id}
              ref={selected ? activeRef : undefined}
              className={cn("snap-start", TILE_WIDTH, "shrink-0")}
            >
              <button
                type="button"
                onClick={() => onSelect(week)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "focus-ring flex h-full w-full flex-col items-start rounded-xl border p-4 text-left transition-colors",
                  selected
                    ? "border-room-accent/40 bg-surface-2"
                    : "border-border bg-surface hover:border-border-hover",
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    {episodeCode(week.week_number)}
                  </span>
                  {done && (
                    <Check
                      size={13}
                      strokeWidth={2}
                      className="shrink-0 text-room-accent"
                      aria-hidden="true"
                    />
                  )}
                  {locked && (
                    <Lock
                      size={11}
                      strokeWidth={1.5}
                      className="shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  {week.attended && (
                    <span className={cn("ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", STATUS_TONE_CLASS.positive)}>
                      Attended
                    </span>
                  )}
                </span>

                {/* The theme, as the episode title. */}
                <span className="mt-2 line-clamp-2 font-serif text-lg leading-snug text-foreground">
                  {week.theme ?? `Week ${week.week_number}`}
                </span>

                {Number.isFinite(startsMs) && (
                  <span className="body-muted mt-auto pt-3 font-mono text-[11px]">
                    {formatIstDayMonth(startsMs)}
                    {Number.isFinite(endsMs) ? ` to ${formatIstDayMonth(endsMs)}` : ""}
                  </span>
                )}

                {week.submission_id && (
                  <span
                    className={cn(
                      "mt-2 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                      STATUS_TONE_CLASS.info,
                    )}
                  >
                    Submitted
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default WeekRail;
