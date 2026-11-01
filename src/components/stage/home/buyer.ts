import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sessionTimeState, type SessionTimeState } from "@/lib/room";

/*
 * Home for people who own something: the round-4 mockup's data rules
 * (15_LMS_Experience_Lab/assets/js/r4-home-data.js), run on the real tables
 * under the signed-in person's own row-level security.
 *
 *  1. What do I do next?          the one loud card, only if something of
 *                                 theirs starts (or ran) today
 *  2. Where is each thing I own?  one card per thing, by format
 *  3. What is coming up?          one timeline for the next 7 days
 *
 * Session timing is the app's own sessionTimeState() (src/lib/room.ts). The
 * Zoom link is never read here: get_live_session_zoom_link() hands it out
 * inside the join window, when someone taps Join.
 */

const HOUR = 36e5, DAY = 864e5, IST = 5.5 * HOUR;
const istDay = (ms: number) => Math.floor((ms + IST) / DAY);
const minutes = (m: number | null | undefined) => (m && m > 0 ? m : 60);
export const endOf = (s: { scheduled_at: string; duration_minutes: number | null }) => Date.parse(s.scheduled_at) + minutes(s.duration_minutes) * 60_000;
/** get_live_session_zoom_link(): from 1 h before the start to 1 h after the end. */
export const joinWindow = (s: { scheduled_at: string; duration_minutes: number | null }) => ({ opens: Date.parse(s.scheduled_at) - HOUR, closes: endOf(s) + HOUR });

interface OfferingLite { id: string; slug: string; title: string; thumbnail_url: string | null; product_tier: string | null }
interface Week { id: string; cohort_batch_id: string; week_number: number; theme: string | null; starts_on: string | null; ends_on: string | null; assignment_due_at: string | null; assignment_prompt: string | null }
export interface Session { id: string; course_id: string; week_id: string | null; title: string; scheduled_at: string; duration_minutes: number | null; status: string | null; recording_url: string | null; kind: "class" | "workshop" }
interface ChapterLite { id: string; title: string; content_type: string | null }

export type ItemKind = "cohort" | "liveworkshop" | "masterclass" | "workshop" | "course";
export interface CohortItem {
  kind: "cohort"; offering: OfferingLite; roomPath: string; batchName: string;
  week: Week | null; weekCount: number; next: Session | null; live: Session | null; due: Week | null; sessions: Session[]; weeks: Week[];
}
export interface LiveWorkshopItem { kind: "liveworkshop"; offering: OfferingLite; session: Session; state: SessionTimeState; path: string }
export interface CourseItem {
  kind: "masterclass" | "workshop" | "course"; offering: OfferingLite; courseId: string | null; courseTitle: string;
  total: number; done: number; videos: number; others: number; next: ChapterLite | null; nextIndex: number; position: number; started: boolean; lastTouched: number;
}
export type OwnedThing = CohortItem | LiveWorkshopItem | CourseItem;
export interface Loud { item: CohortItem | LiveWorkshopItem; s: Session; state: SessionTimeState }
export interface AgendaRow { at: number; kind: "class" | "due"; title: string; item: CohortItem | LiveWorkshopItem; key: string }
export interface BuyerHome { items: OwnedThing[]; ownedIds: Set<string>; inCohort: boolean }

const ids = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter(Boolean) as string[]));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

async function fetchBuyer(userId: string): Promise<BuyerHome> {
  const { data: en, error: enErr } = await supabase
    .from("enrolments")
    .select("id, offering_id, offerings(id, slug, title, thumbnail_url, product_tier)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (enErr) throw enErr;
  const enrolments = ((en ?? []) as unknown as { id: string; offering_id: string; offerings: OfferingLite | null }[]).filter((e) => e.offerings);
  // One card per offering, even when there are two enrolments for it.
  const byOffering = new Map<string, { ids: string[]; offering: OfferingLite }>();
  for (const e of enrolments) {
    const cur = byOffering.get(e.offering_id) ?? { ids: [], offering: e.offerings as OfferingLite };
    cur.ids.push(e.id);
    byOffering.set(e.offering_id, cur);
  }
  const offeringIds = Array.from(byOffering.keys());
  if (!offeringIds.length) return { items: [], ownedIds: new Set(), inCohort: false };
  const enrolmentIds = enrolments.map((e) => e.id);

  const [ocRes, memRes, wsRes, roomRes, progRes, subRes] = await Promise.all([
    supabase.from("offering_courses").select("offering_id, course_id").in("offering_id", offeringIds),
    supabase.from("cohort_batch_members").select("batch_id, enrolment_id").in("enrolment_id", enrolmentIds),
    supabase.from("workshops").select("id, offering_id, title, scheduled_at, duration_minutes, status").in("offering_id", offeringIds).or("status.is.null,status.neq.cancelled"),
    supabase.from("cohort_room_configs").select("offering_id, slug").in("offering_id", offeringIds),
    supabase.from("chapter_progress").select("chapter_id, course_id, completed_at, last_position_seconds, updated_at").eq("user_id", userId),
    supabase.from("cohort_week_submissions").select("cohort_week_id, status").eq("user_id", userId),
  ]);
  for (const r of [ocRes, memRes, wsRes, progRes, subRes]) if (r.error) throw r.error;
  const links = (ocRes.data ?? []) as { offering_id: string; course_id: string }[];
  const courseIds = ids(links.map((l) => l.course_id));
  const batchIds = ids(((memRes.data ?? []) as { batch_id: string }[]).map((m) => m.batch_id));
  const rooms = new Map(((roomRes.data ?? []) as { offering_id: string; slug: string }[]).map((r) => [r.offering_id, r.slug]));

  const [coursesRes, sectionsRes, batchesRes, weeksRes, sessRes] = await Promise.all([
    courseIds.length ? supabase.from("courses").select("id, title, total_lessons").in("id", courseIds) : Promise.resolve({ data: [], error: null }),
    courseIds.length ? supabase.from("sections").select("id, course_id, sort_order").in("course_id", courseIds) : Promise.resolve({ data: [], error: null }),
    batchIds.length ? supabase.from("cohort_batches").select("id, name, offering_id").in("id", batchIds) : Promise.resolve({ data: [], error: null }),
    batchIds.length ? supabase.from("cohort_weeks").select("id, cohort_batch_id, week_number, theme, starts_on, ends_on, assignment_due_at, assignment_prompt").in("cohort_batch_id", batchIds) : Promise.resolve({ data: [], error: null }),
    courseIds.length ? supabase.from("live_sessions").select("id, course_id, week_id, title, scheduled_at, duration_minutes, status, recording_url").in("course_id", courseIds).or("status.is.null,status.neq.cancelled").order("scheduled_at") : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [coursesRes, sectionsRes, batchesRes, weeksRes, sessRes]) if (r.error) throw r.error;
  const courses = new Map(((coursesRes.data ?? []) as { id: string; title: string; total_lessons: number | null }[]).map((c) => [c.id, c]));
  const sections = (sectionsRes.data ?? []) as { id: string; course_id: string; sort_order: number | null }[];
  const secById = new Map(sections.map((s) => [s.id, s]));
  const chaptersRes = sections.length
    ? await supabase.from("chapters").select("id, section_id, title, content_type, sort_order").in("section_id", sections.map((s) => s.id))
    : { data: [], error: null };
  if (chaptersRes.error) throw chaptersRes.error;
  const chaptersByCourse = new Map<string, (ChapterLite & { section_id: string; sort_order: number | null })[]>();
  for (const ch of (chaptersRes.data ?? []) as (ChapterLite & { section_id: string; sort_order: number | null })[]) {
    const sec = secById.get(ch.section_id);
    if (!sec) continue;
    const list = chaptersByCourse.get(sec.course_id) ?? [];
    list.push(ch);
    chaptersByCourse.set(sec.course_id, list);
  }
  for (const list of chaptersByCourse.values()) {
    list.sort((a, b) => (num(secById.get(a.section_id)?.sort_order) - num(secById.get(b.section_id)?.sort_order)) || (num(a.sort_order) - num(b.sort_order)));
  }
  const progress = (progRes.data ?? []) as { chapter_id: string; course_id: string; completed_at: string | null; last_position_seconds: number | null; updated_at: string | null }[];
  const submitted = new Set(((subRes.data ?? []) as { cohort_week_id: string; status: string }[]).filter((s) => s.status !== "draft").map((s) => s.cohort_week_id));
  const batches = (batchesRes.data ?? []) as { id: string; name: string; offering_id: string }[];
  const weeks = (weeksRes.data ?? []) as Week[];
  const sessions = ((sessRes.data ?? []) as Omit<Session, "kind">[]).map((s) => ({ ...s, kind: "class" as const }));
  const nowMs = Date.now();
  const todayIst = new Date(nowMs + IST).toISOString().slice(0, 10);

  const items: OwnedThing[] = [];
  for (const [offeringId, { offering }] of byOffering) {
    const tier = offering.product_tier;
    const cIds = links.filter((l) => l.offering_id === offeringId).map((l) => l.course_id);
    const batch = batches.find((b) => b.offering_id === offeringId);
    if (tier === "live_cohort" || batch) {
      const bw = batch ? weeks.filter((w) => w.cohort_batch_id === batch.id).sort((a, b) => a.week_number - b.week_number) : [];
      const weekIds = new Set(bw.map((w) => w.id));
      const ss = sessions.filter((s) => cIds.includes(s.course_id) && (!s.week_id || !bw.length || weekIds.has(s.week_id)));
      items.push({
        kind: "cohort",
        offering,
        roomPath: rooms.get(offeringId) ? `/room/${rooms.get(offeringId)}` : `/cohort/${offeringId}`,
        batchName: batch?.name ?? offering.title,
        weeks: bw,
        week: bw.filter((w) => (w.starts_on ?? "") <= todayIst).pop() ?? bw[0] ?? null,
        weekCount: bw.length ? bw[bw.length - 1].week_number : 0,
        sessions: ss,
        next: ss.find((s) => Date.parse(s.scheduled_at) > nowMs) ?? null,
        live: ss.find((s) => sessionTimeState(s, nowMs) === "live") ?? null,
        due: bw.find((w) => w.assignment_due_at && Date.parse(w.assignment_due_at) > nowMs && !submitted.has(w.id)) ?? null,
      });
      continue;
    }
    const ws = ((wsRes.data ?? []) as { id: string; offering_id: string; title: string; scheduled_at: string; duration_minutes: number | null; status: string | null }[])
      .filter((w) => w.offering_id === offeringId && w.scheduled_at)
      .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
    if (tier === "workshop" && ws.length) {
      const upcoming = ws.find((w) => endOf(w) > nowMs) ?? ws[ws.length - 1];
      const session: Session = { ...upcoming, course_id: cIds[0] ?? "", week_id: null, recording_url: null, kind: "workshop" };
      items.push({ kind: "liveworkshop", offering, session, state: sessionTimeState(session, nowMs), path: cIds[0] ? `/courses/${cIds[0]}` : `/p/${offering.slug}` });
      continue;
    }
    const courseId = cIds.find((id) => (chaptersByCourse.get(id) ?? []).length) ?? cIds[0] ?? null;
    const chs = courseId ? chaptersByCourse.get(courseId) ?? [] : [];
    const vids = chs.filter((c) => c.content_type === "video");
    const prog = progress.filter((p) => p.course_id === courseId);
    const done = new Set(prog.filter((p) => p.completed_at).map((p) => p.chapter_id));
    const nextVid = vids.find((c) => !done.has(c.id)) ?? null;
    const course = courseId ? courses.get(courseId) : undefined;
    const total = course && num(course.total_lessons) > 0 ? num(course.total_lessons) : vids.length;
    items.push({
      kind: tier === "workshop" ? "workshop" : tier === "masterclass" ? "masterclass" : "course",
      offering,
      courseId,
      courseTitle: course?.title?.replace(/\s*-\s*$/, "") || offering.title,
      total,
      done: Math.min(total, vids.filter((c) => done.has(c.id)).length),
      videos: vids.length,
      others: chs.length - vids.length,
      next: nextVid,
      nextIndex: nextVid ? vids.indexOf(nextVid) + 1 : vids.length,
      position: nextVid ? prog.find((p) => p.chapter_id === nextVid.id)?.last_position_seconds ?? 0 : 0,
      started: prog.length > 0,
      lastTouched: prog.reduce((mx, p) => Math.max(mx, p.updated_at ? Date.parse(p.updated_at) : 0), 0),
    });
  }
  const order: Record<ItemKind, number> = { cohort: 0, liveworkshop: 1, masterclass: 2, workshop: 2, course: 2 };
  items.sort((a, b) => (order[a.kind] - order[b.kind]) || ((b as CourseItem).lastTouched ?? 0) - ((a as CourseItem).lastTouched ?? 0));
  return { items, ownedIds: new Set(offeringIds), inCohort: items.some((i) => i.kind === "cohort") };
}

export function useBuyerHome() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["stage-buyer-home", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () => fetchBuyer(user!.id),
  });
}

/** The one loud card: live > soon > tonight > ended or recorded today. */
export function pickLoud(items: OwnedThing[], nowMs: number): Loud | null {
  const prio: Partial<Record<SessionTimeState, number>> = { live: 0, soon: 1, tonight: 2, ended: 3, recorded: 4 };
  const cands: Loud[] = [];
  for (const i of items) {
    const list = i.kind === "cohort" ? i.sessions : i.kind === "liveworkshop" ? [i.session] : [];
    for (const s of list) {
      const state = sessionTimeState(s, nowMs);
      const sameDay = istDay(Date.parse(s.scheduled_at)) === istDay(nowMs);
      if (state === "live" || state === "soon" || state === "tonight" || ((state === "ended" || state === "recorded") && sameDay)) {
        cands.push({ item: i as CohortItem | LiveWorkshopItem, s, state });
      }
    }
  }
  cands.sort((a, b) => ((prio[a.state] ?? 9) - (prio[b.state] ?? 9)) || (Date.parse(a.s.scheduled_at) - Date.parse(b.s.scheduled_at)));
  return cands[0] ?? null;
}

/** From now to IST midnight seven days on; the loud card's own session is left out. */
export function buildAgenda(items: OwnedThing[], nowMs: number, loud: Loud | null): AgendaRow[] {
  const end = (istDay(nowMs) + 7) * DAY - IST;
  const rows: AgendaRow[] = [];
  for (const i of items) {
    if (i.kind === "cohort") {
      for (const s of i.sessions) {
        const st = Date.parse(s.scheduled_at);
        if (st >= nowMs && st < end && loud?.s.id !== s.id) rows.push({ at: st, kind: "class", title: s.title, item: i, key: s.id });
      }
      for (const w of i.weeks) {
        const d = w.assignment_due_at ? Date.parse(w.assignment_due_at) : 0;
        if (d && d >= nowMs && d < end && i.due && w.id === i.due.id) rows.push({ at: d, kind: "due", title: w.assignment_prompt ?? `Week ${w.week_number} assignment`, item: i, key: `due-${w.id}` });
      }
    }
    if (i.kind === "liveworkshop") {
      const st = Date.parse(i.session.scheduled_at);
      if (st >= nowMs && st < end && loud?.s.id !== i.session.id) rows.push({ at: st, kind: "class", title: i.session.title, item: i, key: i.session.id });
    }
  }
  return rows.sort((a, b) => a.at - b.at);
}

/** The Zoom link: classes ask get_live_session_zoom_link(), which answers only
 *  inside the join window; a live workshop's link is on its own row (readable
 *  only by people enrolled in it). */
export async function zoomLinkFor(s: Session): Promise<string | null> {
  if (s.kind === "workshop") {
    const { data, error } = await supabase.from("workshops").select("zoom_link").eq("id", s.id).maybeSingle();
    return error ? null : ((data as { zoom_link: string | null } | null)?.zoom_link ?? null);
  }
  const { data, error } = await supabase.rpc("get_live_session_zoom_link", { p_session_id: s.id });
  if (error) return null;
  return typeof data === "string" && data ? data : null;
}

/** A one-event calendar file for "Add to calendar". */
export function downloadIcs(s: Session, where: string) {
  const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = Date.parse(s.scheduled_at);
  const esc = (v: string) => v.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LevelUp Learning//Home//EN", "BEGIN:VEVENT",
    `UID:${s.id}@leveluplearning.in`, `DTSTAMP:${fmt(Date.now())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(endOf(s))}`,
    `SUMMARY:${esc(s.title)}`, `DESCRIPTION:${esc(`${where}. The Zoom link opens in the LevelUp app 1 hour before the start.`)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${s.title.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "class"}.ics`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
