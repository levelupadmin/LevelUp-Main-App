/**
 * RoomWeekLine.tsx — a cohort's weeks as one row of segments.
 *
 * One slim segment per week: weeks behind you are solid in the room accent,
 * the current week is brand amber, the weeks ahead are faint. It reads at a
 * glance as "week 3 of 12" without numbers, and stays legible from 4 to 16
 * weeks because the segments share the width.
 *
 * Colours ride `--room-accent`, so each room's theme carries through.
 */
import { cn } from "@/lib/utils";

export interface RoomWeekLineProps {
  /** Authored weeks. Nothing renders below two. */
  total: number;
  /** 1-based current week; weeks before it are done. Null before the start. */
  current: number | null;
  /** Every week done (alumni rooms). */
  complete?: boolean;
  className?: string;
}

const RoomWeekLine = ({ total, current, complete = false, className }: RoomWeekLineProps) => {
  if (!Number.isFinite(total) || total < 2) return null;

  const doneThrough = complete ? total : current ? current - 1 : 0;
  const weeks = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div
      data-testid="room-week-line"
      role="img"
      aria-label={
        complete
          ? `All ${total} weeks complete`
          : current
            ? `Week ${current} of ${total}`
            : `${total} weeks`
      }
      className={cn("flex w-full items-center gap-1.5", className)}
    >
      {weeks.map((week) => {
        const state =
          week <= doneThrough ? "done" : !complete && week === current ? "current" : "ahead";
        return (
          <span
            key={week}
            className={cn(
              "h-2 min-w-0 flex-1 rounded-full",
              state === "done" && "bg-room-accent",
              // Brand amber (design system --lu-amber-500); the app has no token for it yet.
              state === "current" && "bg-[#F97015]",
              state === "ahead" && "bg-border",
            )}
          />
        );
      })}
    </div>
  );
};

export default RoomWeekLine;
