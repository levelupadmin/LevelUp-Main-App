/**
 * Cohort time. Every date a learner sees is in the program's timezone
 * (Asia/Kolkata by default), never the device's, so "Sat 6 PM" means the same
 * moment for everyone in the cohort. `now()` follows the server clock (the
 * envelope carries `server_now`), so countdowns agree with what the server
 * will accept.
 */

export const HOUR = 36e5;
export const DAYMS = 864e5;
export const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAYL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let skewMs = 0;
let zone = "Asia/Kolkata";

/** Align the client clock with the server's (called whenever an envelope arrives). */
export function syncClock(serverNow: string | null | undefined): void {
  if (!serverNow) return;
  const t = Date.parse(serverNow);
  if (Number.isFinite(t)) skewMs = t - Date.now();
}
export function setZone(tz: string | null | undefined): void {
  if (tz) zone = tz;
}
export const now = (): Date => new Date(Date.now() + skewMs);
export const toDate = (d: Date | string | number): Date => (d instanceof Date ? d : new Date(d));

type Parts = { y: number; mo: number; d: number; wd: number; h: number; mi: number };
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendar parts of an instant in the cohort's timezone. */
export function parts(d: Date | string | number): Parts {
  const p: Record<string, string> = {};
  for (const x of fmt(zone).formatToParts(toDate(d))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month - 1, d: +p.day, wd: WD[p.weekday] ?? 0, h: +p.hour % 24, mi: +p.minute };
}

/** Start of the cohort-local day containing `d`, as an instant. */
export function sod(d: Date | string | number): Date {
  const x = toDate(d);
  const p = parts(x);
  const guess = Date.UTC(p.y, p.mo, p.d);
  // offset = local wall clock − UTC for this instant
  const off = Date.UTC(p.y, p.mo, p.d, p.h, p.mi) - Math.floor(x.getTime() / 6e4) * 6e4;
  return new Date(guess - off);
}
export const add = (d: Date | string | number, days: number): Date => new Date(toDate(d).getTime() + days * DAYMS);
export const same = (a: Date | string | number, b: Date | string | number): boolean => sod(a).getTime() === sod(b).getTime();
export const diffDays = (a: Date | string | number, b: Date | string | number): number =>
  Math.round((sod(a).getTime() - sod(b).getTime()) / DAYMS);

const pad2 = (n: number) => String(n).padStart(2, "0");
export const day = (d: Date | string | number) => { const p = parts(d); return `${DAY[p.wd]} ${p.d} ${MON[p.mo]}`; };
export const dayLong = (d: Date | string | number) => { const p = parts(d); return `${DAYL[p.wd]}, ${p.d} ${MON[p.mo]}`; };
export const dm = (d: Date | string | number) => { const p = parts(d); return `${p.d} ${MON[p.mo]}`; };
export const wd = (d: Date | string | number) => DAY[parts(d).wd];
export const wdLong = (d: Date | string | number) => DAYL[parts(d).wd];
export function time(d: Date | string | number): string {
  const p = parts(d);
  const ap = p.h < 12 ? "AM" : "PM";
  const h = p.h % 12 || 12;
  return `${p.mi ? `${h}:${pad2(p.mi)}` : h} ${ap}`;
}
export const clock = (d: Date | string | number) => { const p = parts(d); return `${p.h % 12 || 12}:${pad2(p.mi)}`; };
export function range(a: Date | string | number, b: Date | string | number): string {
  const pa = parts(a), pb = parts(b);
  const sameHalf = (pa.h < 12) === (pb.h < 12);
  const s = time(a);
  return `${sameHalf ? s.replace(/ (AM|PM)$/, "") : s} to ${time(b)}`;
}
export function rel(d: Date | string | number): string {
  const n = diffDays(d, now());
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return day(d);
}
export function left(ms: number): string {
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 6e4);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${pad2(m % 60)}m`;
  return `${Math.floor(h / 24)} days`;
}
export const hour = () => parts(now()).h;
export const year = (d: Date | string | number) => parts(d).y;

/** "2026-11-06" → the cohort-local midnight of that date. */
export function dateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  return sod(noonUtc);
}

/** h:mm:ss / m:ss for media */
export function fmtT(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h ? `${h}:${pad2(m)}` : m}:${pad2(x)}`;
}
export const parseT = (s: string) => s.split(":").reduce((a, b) => a * 60 + Number(b), 0);
