import { useEffect, useRef } from "react";
import { Check, Lock } from "lucide-react";
import { Link } from "react-router-dom";

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
 * Nothing here animates layout, and nothing here animates at all. The only
 * movement is the rail's own scroll position, set once when the selected week
 * changes, and it is written on the TRACK rather than through `scrollIntoView`
 * so it can never drag the page along with it. It is deliberately un-eased;
 * see the measurement in the effect below.
 */

export interface WeekRailProps {
  /** Every week row, in the RPC's own order (week_number ascending). */
  weeks: RoomWeekRow[];
  /** `week_id` of the week the module is showing. */
  activeWeekId: string | null;
  onSelect: (week: RoomWeekRow) => void;
  /** The authored Demo Day date. The finale tile renders even while this is null. */
  finaleAt?: string | null;
  /** Set only once the room is in wrap/alumni and Demo Day is enabled. */
  finaleHref?: string | null;
  className?: string;
}

/** Fixed tile width: two-and-a-bit tiles at 360px, so the rail reads scrollable. */
const TILE_WIDTH = "w-[13.5rem]";

export function WeekRail({ weeks, activeWeekId, onSelect, finaleAt, finaleHref, className }: WeekRailProps) {
  const trackRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  // Centre the selected tile in the track. Horizontal only, and a no-op when
  // the rail is not overflowing.
  //
  // ⚠️ NOT `behavior: "smooth"`. Measured in Chromium at 360x740: a smooth
  // programmatic scroll on a track with `scroll-snap-type: … mandatory` is
  // ABANDONED mid-flight and the track lands back on the first snap point
  // (scrollLeft 16 instead of 1840 for week 9 of 20). The same call with
  // `auto` lands exactly on the snapped position. Since the room ships to the
  // Android System WebView, which is that same engine, an eased version of
  // this would simply never reveal the current week. It is also the cheaper
  // frame: the rail's position is set once, off the compositor, with no
  // animation to keep alive.
  useEffect(() => {
    const track = trackRef.current;
    const tile = activeRef.current;
    if (!track || !tile) return;
    const left = Math.max(0, tile.offsetLeft - (track.clientWidth - tile.clientWidth) / 2);
    // `scrollTo` is not universally present on ELEMENTS (older WebViews, and
    // jsdom under test); the assignment is the same scroll.
    if (typeof track.scrollTo === "function") track.scrollTo({ left, behavior: "auto" });
    else track.scrollLeft = left;
  }, [activeWeekId]);

  if (weeks.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {/* ── The progress strip ──
          One segment per week, in the room's own accent: filled for the weeks
          that are done, half-lit for the week in progress, muted for what is
          still ahead.

          DECORATIVE, NOT A CONTROL. It was a row of buttons first, and the
          measurement killed that: twenty segments across a 375px screen give a
          13px-wide hit box, under the 24px WCAG 2.5.8 floor, and no amount of
          padding fixes it while the season can be twenty weeks long. Every
          week it points at is one tap away on the rail directly below at a full
          216x100 target, and the footer states the same fact in words ("Week 9
          of 20 · 8 done"), so the bar is the only thing lost by hiding it from
          the accessibility tree. */}
      <div className="flex gap-1" aria-hidden="true">
        {weeks.map((week) => {
          const tone = weekStatusTone(week.week_status);
          return (
            <span
              key={week.week_id}
              data-week={week.week_number}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                tone === "positive"
                  ? "bg-room-accent"
                  : tone === "accent"
                    ? "bg-room-accent/50"
                    : "bg-muted",
                week.week_id === activeWeekId && "ring-1 ring-room-accent ring-offset-2 ring-offset-canvas",
              )}
            />
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
        <li className={cn("snap-start", TILE_WIDTH, "shrink-0")}>
          {finaleHref ? (
            <Link
              to={finaleHref}
              className="focus-ring flex h-full min-h-[116px] w-full flex-col items-start rounded-xl border border-room-accent/35 bg-room-accent/[0.06] p-4 text-left transition-colors hover:bg-room-accent/10"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-room-accent-text">
                The finale
              </span>
              <span className="mt-2 font-serif text-lg leading-snug text-foreground">Demo Day</span>
              <span className="body-muted mt-auto pt-3 font-mono text-[11px]">
                {finaleAt && Number.isFinite(parseMs(finaleAt))
                  ? formatIstDayMonth(parseMs(finaleAt))
                  : "Date coming soon"}
              </span>
            </Link>
          ) : (
            <div className="flex h-full min-h-[116px] w-full flex-col items-start rounded-xl border border-room-accent/25 bg-room-accent/[0.04] p-4 text-left">
              <span className="flex w-full items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-room-accent-text">
                The finale <Lock size={11} strokeWidth={1.5} className="ml-auto" aria-hidden />
              </span>
              <span className="mt-2 font-serif text-lg leading-snug text-foreground">Demo Day</span>
              <span className="body-muted mt-auto pt-3 font-mono text-[11px]">
                {finaleAt && Number.isFinite(parseMs(finaleAt))
                  ? formatIstDayMonth(parseMs(finaleAt))
                  : "Date coming soon"}
              </span>
            </div>
          )}
        </li>
      </ul>
    </div>
  );
}

export default WeekRail;
