/**
 * The scheduling engine of the ARCHITECTURE doc, demo-sized and pure.
 *
 * This is `launch_cohort()` from CREATOR_STUDIO_SYSTEM_ARCHITECTURE §4, run in
 * the browser on template data: a start date plus blackout dates in, a fully
 * dated 13-week calendar out. When this graduates, this exact logic becomes
 * the SECURITY DEFINER RPC — same rule, same tests, different runtime.
 *
 * Rule (deliberately simple for v1): the chosen start date is Week 0's class.
 * Each next class is +7 days. A class landing on a blackout date pushes that
 * class — and everything after it — a further week. History never moves.
 */
import { ENGINE } from "./previewData";

export interface ScheduledWeek {
  week: number;
  title: string;
  phase: string;
  classISO: string;   // the live session
  blockISO: string;   // Thu-equivalent: class + 4 days, 9 PM
  reviewISO: string;  // Sat-equivalent: class + 6 days, 6 PM
  shifted: boolean;   // true if a blackout pushed this class
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Local calendar date, NOT `toISOString()`. Blackouts are calendar days an
 * admin picked and the cursor is a local midnight. In any timezone east of
 * UTC — IST, where every user is — `toISOString()` rolls local midnight back
 * to the previous day, so a blackout would silently never match and the
 * cohort would be scheduled straight through a holiday. Format from the local
 * parts instead, which is also what this becomes as a SQL `date` in the RPC.
 */
function iso(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function at(d: Date, hours: number, minutes = 0): Date {
  const x = new Date(d);
  x.setHours(hours, minutes, 0, 0);
  return x;
}

/** Generate the full cohort calendar. `blackouts` are 'YYYY-MM-DD' strings. */
export function generateSchedule(startISO: string, blackouts: string[]): ScheduledWeek[] {
  const black = new Set(blackouts);
  const out: ScheduledWeek[] = [];
  let cursor = new Date(`${startISO}T00:00:00`);
  for (const e of ENGINE) {
    let shifted = false;
    while (black.has(iso(cursor))) {
      cursor = new Date(cursor.getTime() + 7 * DAY);
      shifted = true;
    }
    const classAt = at(cursor, 15);
    out.push({
      week: e.n,
      title: e.title,
      phase: e.phase,
      classISO: classAt.toISOString(),
      blockISO: at(new Date(cursor.getTime() + 4 * DAY), 21).toISOString(),
      reviewISO: at(new Date(cursor.getTime() + 6 * DAY), 18).toISOString(),
      shifted,
    });
    cursor = new Date(cursor.getTime() + 7 * DAY);
  }
  return out;
}

const FMT: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

export function fmtDay(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("en-IN", FMT);
}

export function fmtTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
