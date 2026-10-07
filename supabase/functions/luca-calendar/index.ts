/**
 * luca-calendar — a learner's private LUCA calendar, as an iCalendar feed.
 *
 * GET /functions/v1/luca-calendar?t=<cal_token>
 *
 * Google, Apple and Outlook subscribe to this URL and re-fetch it on their own
 * schedule, so a moved session moves in the learner's calendar too. The token
 * is the only credential: it is a per-member random UUID (luca_members.
 * cal_token), rotatable from the You screen, and the feed carries no personal
 * data beyond the cohort's own schedule.
 *
 * `verify_jwt = false` (config.toml): calendar apps cannot send a Supabase JWT.
 * The token is resolved by `luca_calendar_feed`, which is executable by
 * service_role only and returns NULL for an unknown token, a ghost member, a
 * member who has lost their seat, or a hidden program. Every NULL answers the
 * same 404, so the endpoint does not reveal which tokens exist.
 *
 * No CORS: calendar clients fetch server-side, and the browser never reads it.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://app.leveluplearning.in";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Feed {
  program: { slug: string; name: string; cohort_label: string; timezone: string; breaks: { start: string; end: string; label: string }[] | null };
  sessions: { id: string; kind: string; title: string; starts_at: string; ends_at: string; updated_at: string }[];
  assignments: { id: string; week_n: number; title: string; due_at: string; updated_at: string }[];
}

const KIND: Record<string, string> = {
  orientation: "Orientation", review: "Review", class: "Class", double: "Double session",
  standup: "Sprint standup", demo: "Demo Day", plan: "Class",
};

/** 20261024T124500Z */
export function stamp(iso: string | Date): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
/** 20261106 (all-day dates) */
function dateStamp(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}
/** RFC 5545 text escaping. */
export function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
}
/** RFC 5545 line folding at 75 octets. */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (curLen + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; curLen = 0; }
    cur += ch; curLen += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(f: Feed, now = new Date()): string {
  const p = f.program;
  const cal = `${p.name}${p.cohort_label ? ` · ${p.cohort_label}` : ""}`;
  const base = `${SITE_URL}/luca/${p.slug}`;
  const L: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LevelUp Learning//LUCA//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(cal)}`, `X-WR-TIMEZONE:${p.timezone || "Asia/Kolkata"}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
  ];
  const dt = stamp(now);
  for (const s of f.sessions) {
    L.push(
      "BEGIN:VEVENT", `UID:luca-session-${s.id}@leveluplearning.in`, `DTSTAMP:${dt}`, `LAST-MODIFIED:${stamp(s.updated_at)}`,
      `DTSTART:${stamp(s.starts_at)}`, `DTEND:${stamp(s.ends_at)}`,
      `SUMMARY:${esc(`${s.title} · ${KIND[s.kind] ?? "Session"}`)}`,
      `DESCRIPTION:${esc(`${cal}. Join from the app so you're marked present: ${base}/session/${s.id}`)}`,
      `URL:${base}/session/${s.id}`, `LOCATION:${esc("Zoom (join from the LevelUp app)")}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(s.title)}`, "TRIGGER:-PT10M", "END:VALARM",
      "END:VEVENT",
    );
  }
  for (const a of f.assignments) {
    const due = new Date(a.due_at);
    L.push(
      "BEGIN:VEVENT", `UID:luca-due-${a.id}@leveluplearning.in`, `DTSTAMP:${dt}`, `LAST-MODIFIED:${stamp(a.updated_at)}`,
      `DTSTART:${stamp(new Date(due.getTime() - 30 * 60_000))}`, `DTEND:${stamp(due)}`,
      `SUMMARY:${esc(`Due: ${a.title} (Week ${a.week_n})`)}`,
      `DESCRIPTION:${esc(`Paste your links in the app before the deadline: ${base}/assign/${a.id}`)}`,
      `URL:${base}/assign/${a.id}`, "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(`Due soon: ${a.title}`)}`, "TRIGGER:-PT6H", "END:VALARM",
      "END:VEVENT",
    );
  }
  for (const [i, b] of (p.breaks ?? []).entries()) {
    if (!b?.start || !b?.end) continue;
    const endDay = new Date(Date.parse(b.end.slice(0, 10)) + 86_400_000).toISOString();
    L.push(
      "BEGIN:VEVENT", `UID:luca-break-${p.slug}-${i}@leveluplearning.in`, `DTSTAMP:${dt}`,
      `DTSTART;VALUE=DATE:${dateStamp(b.start)}`, `DTEND;VALUE=DATE:${dateStamp(endDay)}`,
      `SUMMARY:${esc(b.label.split(".")[0] || "Break")}`, "TRANSP:TRANSPARENT", "END:VEVENT",
    );
  }
  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const t = new URL(req.url).searchParams.get("t") ?? "";
    if (!UUID.test(t)) return notFound();
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("luca_calendar_feed", { p_token: t });
    if (error) {
      console.error("luca-calendar: feed lookup failed", error.code);
      return new Response("Try again later", { status: 503, headers: { "Retry-After": "300" } });
    }
    if (!data) return notFound();
    const ics = buildIcs(data as Feed);
    return new Response(req.method === "HEAD" ? null : ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${(data as Feed).program.slug}.ics"`,
        "Cache-Control": "private, max-age=900",
      },
    });
  });
}
