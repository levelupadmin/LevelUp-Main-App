/**
 * Calendar helpers: turn a session/event into either a downloadable .ics file
 * (works with Apple Calendar, Outlook, most native calendars) or a Google
 * Calendar "add event" URL (web fallback / Android quick-add).
 *
 * Times are emitted in UTC (the trailing `Z` form) so the event lands at the
 * correct local wall-clock for whoever opens it, regardless of their timezone.
 */

export interface CalendarEvent {
  title: string;
  /** Event start. ISO string or Date. */
  startsAt: string | Date;
  /** Duration in minutes (defaults to 60 if missing/invalid). */
  durationMin?: number | null;
  /** Optional join/details URL appended to the description + location. */
  url?: string | null;
  /** Optional longer description shown in the calendar entry. */
  description?: string | null;
}

const FALLBACK_DURATION_MIN = 60;

const toDate = (d: string | Date): Date => (typeof d === "string" ? new Date(d) : d);

/** Format a Date as the iCalendar/Google compact UTC stamp: YYYYMMDDTHHMMSSZ. */
const toICSDate = (d: Date): string =>
  d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545 text escaping for SUMMARY/DESCRIPTION/LOCATION values. */
const escapeICSText = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

const resolveDuration = (durationMin?: number | null): number =>
  durationMin && durationMin > 0 ? durationMin : FALLBACK_DURATION_MIN;

const slugForFilename = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "event";

/**
 * Build a Google Calendar "create event" URL. Opens a pre-filled event the
 * user just has to save, the most reliable cross-platform path on the web and
 * inside an Android WebView.
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const start = toDate(event.startsAt);
  const end = new Date(start.getTime() + resolveDuration(event.durationMin) * 60 * 1000);

  const detailsParts: string[] = [];
  if (event.description) detailsParts.push(event.description);
  if (event.url) detailsParts.push(event.url);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toICSDate(start)}/${toICSDate(end)}`,
  });
  if (detailsParts.length) params.set("details", detailsParts.join("\n\n"));
  if (event.url) params.set("location", event.url);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Build the raw .ics file contents for a single event. */
export function buildICS(event: CalendarEvent): string {
  const start = toDate(event.startsAt);
  const end = new Date(start.getTime() + resolveDuration(event.durationMin) * 60 * 1000);

  const descriptionParts: string[] = [];
  if (event.description) descriptionParts.push(event.description);
  if (event.url) descriptionParts.push(event.url);

  // Deterministic-ish UID from title + start so re-downloads de-dupe in calendars.
  const uid = `${toICSDate(start)}-${slugForFilename(event.title)}@leveluplearning.in`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LevelUp Learning//Sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${escapeICSText(event.title)}`,
  ];
  if (descriptionParts.length) {
    lines.push(`DESCRIPTION:${escapeICSText(descriptionParts.join("\n\n"))}`);
  }
  if (event.url) {
    lines.push(`LOCATION:${escapeICSText(event.url)}`);
    lines.push(`URL:${escapeICSText(event.url)}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}

/**
 * Trigger a download of a single-event .ics file. Returns false if the DOM
 * isn't available (SSR safety) so callers can fall back to the Google URL.
 */
export function downloadICS(event: CalendarEvent): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;

  const blob = new Blob([buildICS(event)], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${slugForFilename(event.title)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so the download has a chance to start in all browsers.
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return true;
}

/**
 * One-call "Add to calendar". Downloads an .ics on platforms that support blob
 * downloads (web + iOS/Android WebView), otherwise opens Google Calendar. The
 * .ics route is the most universal (Apple Calendar, Outlook and Google all
 * import it) so it's preferred, with the hosted Google URL as the fallback.
 */
export function addToCalendar(
  title: string,
  startsAt: string | Date,
  durationMin?: number | null,
  url?: string | null,
  description?: string | null,
): void {
  const event: CalendarEvent = { title, startsAt, durationMin, url, description };
  const downloaded = downloadICS(event);
  if (!downloaded) {
    const gUrl = googleCalendarUrl(event);
    if (typeof window !== "undefined") {
      window.open(gUrl, "_blank", "noopener,noreferrer");
    }
  }
}
