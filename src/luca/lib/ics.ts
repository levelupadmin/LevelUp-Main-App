/** A one-off .ics for "Add to calendar" on a single event (no server needed). */
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

export function downloadIcs(o: { title: string; start: Date | string; end?: Date | string; description?: string; url?: string }) {
  const start = new Date(o.start);
  const end = o.end ? new Date(o.end) : new Date(start.getTime() + 30 * 6e4);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LevelUp Learning//LUCA//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${stamp(start)}-${Math.random().toString(36).slice(2)}@leveluplearning.in`,
    `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(o.title)}`,
    o.description ? `DESCRIPTION:${esc(o.description)}` : "",
    o.url ? `URL:${o.url}` : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${o.title.replace(/[^\w]+/g, "-").toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
