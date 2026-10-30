/**
 * RoomWeekLine.tsx — a cohort's weeks drawn as the line from the LevelUp mark.
 *
 * The logo's chart is four hollow rings joined by short bars, climbing
 * up, down, up. This draws one ring per week on that same rhythm, so a
 * 12-week cohort reads as the mark stretched out: weeks behind you are solid,
 * the current week is a ring with a centre, the weeks ahead are faint.
 *
 * Geometry is taken from `levelup-logo-white.svg` (in logo units): bar width
 * 1.2, ring radius 2.73 measured to the stroke centre, rings 13.2 apart, a rise
 * of 10.4 followed by a fall of 8.3. Bars stop at the ring's edge, as they do
 * in the logo, so a ring is never crossed by its own line.
 *
 * Colours ride `--room-accent`, so each room's theme carries through.
 */
import { cn } from "@/lib/utils";

const STEP_X = 13.2;
const RISE = 10.4;
const FALL = 8.3;
const RING_R = 2.73;
const STROKE = 1.2;
const PAD = RING_R + STROKE;

export interface RoomWeekLineProps {
  /** Authored weeks. Nothing renders below two. */
  total: number;
  /** 1-based current week; weeks before it are done. Null before the start. */
  current: number | null;
  /** Every week done (alumni rooms). */
  complete?: boolean;
  className?: string;
}

/** Node centres on the logo's up-down-up rhythm, normalised to start at y = 0. */
export function weekLinePoints(total: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let y = 0;
  for (let i = 0; i < total; i += 1) {
    if (i > 0) y += i % 2 === 1 ? -RISE : FALL;
    points.push([i * STEP_X, y]);
  }
  return points;
}

const RoomWeekLine = ({ total, current, complete = false, className }: RoomWeekLineProps) => {
  if (!Number.isFinite(total) || total < 2) return null;

  const points = weekLinePoints(total);
  const ys = points.map(([, y]) => y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = (total - 1) * STEP_X + PAD * 2;
  const height = maxY - minY + PAD * 2;
  const at = ([x, y]: [number, number]): [number, number] => [x + PAD, y - minY + PAD];

  // A week is done when the cohort is past it; the current week is the ring
  // the student is standing on.
  const doneThrough = complete ? total : current ? current - 1 : 0;
  const state = (week: number) =>
    week <= doneThrough ? "done" : !complete && week === current ? "current" : "ahead";

  const bars = points.slice(1).map((point, i) => {
    const [x1, y1] = at(points[i]);
    const [x2, y2] = at(point);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const gap = RING_R + STROKE / 2;
    // The bar into week i+2 is lit once week i+1 is done.
    const lit = i + 1 <= doneThrough;
    return (
      <line
        key={`bar-${i}`}
        x1={x1 + ux * gap}
        y1={y1 + uy * gap}
        x2={x2 - ux * gap}
        y2={y2 - uy * gap}
        className={lit ? "stroke-room-accent" : "stroke-border"}
        strokeWidth={STROKE}
        strokeLinecap="butt"
      />
    );
  });

  const rings = points.map((point, i) => {
    const [cx, cy] = at(point);
    const s = state(i + 1);
    return (
      <g key={`ring-${i}`}>
        <circle
          cx={cx}
          cy={cy}
          r={RING_R}
          fill="none"
          className={s === "ahead" ? "stroke-border" : "stroke-room-accent"}
          strokeWidth={STROKE}
        />
        {s === "done" && <circle cx={cx} cy={cy} r={RING_R - STROKE} className="fill-room-accent/80" />}
        {s === "current" && <circle cx={cx} cy={cy} r={1.1} className="fill-room-accent" />}
      </g>
    );
  });

  return (
    <svg
      data-testid="room-week-line"
      viewBox={`0 0 ${width.toFixed(2)} ${height.toFixed(2)}`}
      className={cn("block h-auto w-full overflow-visible", className)}
      role="img"
      aria-label={
        complete
          ? `All ${total} weeks complete`
          : current
            ? `Week ${current} of ${total}`
            : `${total} weeks`
      }
    >
      {bars}
      {rings}
    </svg>
  );
};

export default RoomWeekLine;
