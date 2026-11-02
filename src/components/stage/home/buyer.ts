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
 *  2. Where is each thing I own?  one card per thing, by format (one
 *                                 per course for a bundle)
 *  3. What is coming up?          one timeline for the next 7 days
 *
 * Every read throws on error (useQuery then reports isError), so a failed
 * read is never mistaken for owning nothing.
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
  /** The offering's title when this card is one of several courses it holds (a
   *  bundle, or a course that comes with a live cohort); null for its only card. */
  partOf: string | null;
  /** The card's picture: the course's own for one course of several, else the offering's. */
  art: string | null;
  total: number; done: number; videos: number; others: number; next: ChapterLite | null; nextIndex: number; position: number; started: boolean; lastTouched: number;
  /** Live sessions on this course (a masterclass Q&A, say). A cohort's classes stay on its cohort card. */
  sessions: Session[];
}
export type OwnedThing = CohortItem | LiveWorkshopItem | CourseItem;
export interface Loud { item: OwnedThing; s: Session; state: SessionTimeState }
export interface AgendaRow { at: number; kind: "class" | "due"; title: string; item: OwnedThing; key: string }
export interface BuyerHome { items: OwnedThing[]; ownedIds: Set<string>; inCohort: boolean }

interface WorkshopRow { id: string; offering_id: string; title: string; scheduled_at: string; duration_minutes: number | null; status: string | null }
interface ProgressRow { chapter_id: string; course_id: string; completed_at: string | null; last_position_seconds: number | null; updated_at: string | null }
interface CourseRow { id: string; title: string; total_lessons: number | null; thumbnail_url: string | null }
interface SectionRow { id: string; course_id: string; sort_order: number | null }
type ChapterRow = ChapterLite & { section_id: string; sort_order: number | null };

/** Every row fetchBuyer reads, as read. buildBuyerHome turns them into the cards. */
export interface BuyerRows {
  enrolments: { id: string; offering_id: string; offerings: OfferingLite | null }[];
  links: { offering_id: string; course_id: string }[];
  workshops: WorkshopRow[];
  progress: ProgressRow[];
  submissions: { cohort_week_id: string; status: string }[];
  courses: CourseRow[];
  sections: SectionRow[];
  chapters: ChapterRow[];
  batches: { id: string; name: string; offering_id: string }[];
  weeks: Week[];
  sessions: Omit<Session, "kind">[];
}

const ids = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter(Boolean) as string[]));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const EMPTY: BuyerHome = { items: [], ownedIds: new Set(), inCohort: false };

/** Throws the first failed read, so a network error reaches the screen as an
 *  error with Retry, never as an empty "you own nothing". */
function check(results: { error: unknown }[]) {
  for (const r of results) if (r.error) throw r.error;
}

export async function fetchBuyer(userId: string): Promise<BuyerHome> {
  const { data: en, error: enErr } = await supabase
    .from("enrolments")
    .select("id, offering_id, offerings(id, slug, title, thumbnail_url, product_tier)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (enErr) throw enErr;
  const enrolments = (en ?? []) as unknown as BuyerRows["enrolments"];
  const offeringIds = ids(enrolments.map((e) => e.offering_id));
  if (!offeringIds.length) return EMPTY;
  const enrolmentIds = enrolments.map((e) => e.id);

  const [ocRes, memRes, wsRes, progRes, subRes] = await Promise.all([
    supabase.from("offering_courses").select("offering_id, course_id").in("offering_id", offeringIds),
    supabase.from("cohort_batch_members").select("batch_id, enrolment_id").in("enrolment_id", enrolmentIds),
    supabase.from("workshops").select("id, offering_id, title, scheduled_at, duration_minutes, status").in("offering_id", offeringIds).or("status.is.null,status.neq.cancelled"),
    supabase.from("chapter_progress").select("chapter_id, course_id, completed_at, last_position_seconds, updated_at").eq("user_id", userId),
    supabase.from("cohort_week_submissions").select("cohort_week_id, status").eq("user_id", userId),
  ]);
  check([ocRes, memRes, wsRes, progRes, subRes]);
  const links = (ocRes.data ?? []) as BuyerRows["links"];
  const courseIds = ids(links.map((l) => l.course_id));
  const batchIds = ids(((memRes.data ?? []) as { batch_id: string }[]).map((m) => m.batch_id));
  const none = Promise.resolve({ data: [], error: null });

  const [coursesRes, sectionsRes, batchesRes, weeksRes, sessRes] = await Promise.all([
    courseIds.length ? supabase.from("courses").select("id, title, total_lessons, thumbnail_url").in("id", courseIds) : none,
    courseIds.length ? supabase.from("sections").select("id, course_id, sort_order").in("course_id", courseIds) : none,
    batchIds.length ? supabase.from("cohort_batches").select("id, name, offering_id").in("id", batchIds) : none,
    batchIds.length ? supabase.from("cohort_weeks").select("id, cohort_batch_id, week_number, theme, starts_on, ends_on, assignment_due_at, assignment_prompt").in("cohort_batch_id", batchIds) : none,
    courseIds.length ? supabase.from("live_sessions").select("id, course_id, week_id, title, scheduled_at, duration_minutes, status, recording_url").in("course_id", courseIds).or("status.is.null,status.neq.cancelled").order("scheduled_at") : none,
  ]);
  check([coursesRes, sectionsRes, batchesRes, weeksRes, sessRes]);
  const sections = (sectionsRes.data ?? []) as SectionRow[];
  const chaptersRes = sections.length
    ? await supabase.from("chapters").select("id, section_id, title, content_type, sort_order").in("section_id", sections.map((s) => s.id))
    : { data: [], error: null };
  check([chaptersRes]);

  return buildBuyerHome({
    enrolments,
    links,
    workshops: (wsRes.data ?? []) as WorkshopRow[],
    progress: (progRes.data ?? []) as ProgressRow[],
    submissions: (subRes.data ?? []) as BuyerRows["submissions"],
    courses: (coursesRes.data ?? []) as CourseRow[],
    sections,
    chapters: (chaptersRes.data ?? []) as ChapterRow[],
    batches: (batchesRes.data ?? []) as BuyerRows["batches"],
    weeks: (weeksRes.data ?? []) as Week[],
    sessions: (sessRes.data ?? []) as Omit<Session, "kind">[],
  }, Date.now());
}

/**
 * The rows -> one card per thing owned. Pure, so the rules are testable:
 *  - a live cohort is one cohort card, linked to /cohort/<offering id> (that
 *    route forwards into the room when rooms are on). Each course that comes
 *    with it and has lessons also gets a course card, since the cohort page
 *    shows classes, not lessons;
 *  - a live workshop is one workshop card;
 *  - anything else gets one card per course that has lessons (a bundle of
 *    seven is seven cards, each with its own progress), or one card for its
 *    first course when none has any. A course two offerings share is one card;
 *  - live sessions on a non-cohort course (a masterclass Q&A) sit on that
 *    course's card, so they reach the agenda, the loud card and recordings.
 */
export function buildBuyerHome(rows: BuyerRows, nowMs: number): BuyerHome {
  const courses = new Map(rows.courses.map((c) => [c.id, c]));
  const linksOf = (offeringId: string) => ids(rows.links.filter((l) => l.offering_id === offeringId).map((l) => l.course_id));

  // One entry per offering, even when there are two enrolments for it. An
  // offering row the person cannot read (a draft one) still counts: its courses
  // are readable through the enrolment, as the classic My courses lists them.
  const byOffering = new Map<string, OfferingLite>();
  const unread = new Set<string>();
  for (const e of rows.enrolments) {
    if (e.offerings) { byOffering.set(e.offering_id, e.offerings); unread.delete(e.offering_id); continue; }
    if (byOffering.has(e.offering_id)) continue;
    const first = courses.get(linksOf(e.offering_id)[0] ?? "");
    byOffering.set(e.offering_id, { id: e.offering_id, slug: "", title: first?.title ?? "", thumbnail_url: first?.thumbnail_url ?? null, product_tier: null });
    unread.add(e.offering_id);
  }
  const offeringIds = Array.from(byOffering.keys());
  if (!offeringIds.length) return EMPTY;

  const secById = new Map(rows.sections.map((s) => [s.id, s]));
  const chaptersByCourse = new Map<string, ChapterRow[]>();
  for (const ch of rows.chapters) {
    const sec = secById.get(ch.section_id);
    if (!sec) continue;
    const list = chaptersByCourse.get(sec.course_id) ?? [];
    list.push(ch);
    chaptersByCourse.set(sec.course_id, list);
  }
  for (const list of chaptersByCourse.values()) {
    list.sort((a, b) => (num(secById.get(a.section_id)?.sort_order) - num(secById.get(b.section_id)?.sort_order)) || (num(a.sort_order) - num(b.sort_order)));
  }
  const hasLessons = (courseId: string) => (chaptersByCourse.get(courseId) ?? []).length > 0;
  const submitted = new Set(rows.submissions.filter((s) => s.status !== "draft").map((s) => s.cohort_week_id));
  const sessions: Session[] = rows.sessions.map((s) => ({ ...s, kind: "class" as const }));
  const todayIst = new Date(nowMs + IST).toISOString().slice(0, 10);

  const courseCard = (offering: OfferingLite, courseId: string | null, partOf: string | null): CourseItem => {
    const tier = offering.product_tier;
    const chs = courseId ? chaptersByCourse.get(courseId) ?? [] : [];
    const vids = chs.filter((c) => c.content_type === "video");
    const prog = rows.progress.filter((p) => p.course_id === courseId);
    const done = new Set(prog.filter((p) => p.completed_at).map((p) => p.chapter_id));
    const nextVid = vids.find((c) => !done.has(c.id)) ?? null;
    const course = courseId ? courses.get(courseId) : undefined;
    const total = course && num(course.total_lessons) > 0 ? num(course.total_lessons) : vids.length;
    const courseTitle = course?.title?.replace(/\s*-\s*$/, "") || offering.title;
    // "From <offering>" only says something when the names differ.
    const from = partOf && partOf.trim() !== courseTitle.trim() ? partOf : null;
    return {
      kind: tier === "workshop" ? "workshop" : tier === "masterclass" ? "masterclass" : "course",
      offering,
      courseId,
      courseTitle,
      partOf: from,
      art: (partOf ? course?.thumbnail_url || offering.thumbnail_url : offering.thumbnail_url || course?.thumbnail_url) ?? null,
      total,
      done: Math.min(total, vids.filter((c) => done.has(c.id)).length),
      videos: vids.length,
      others: chs.length - vids.length,
      next: nextVid,
      nextIndex: nextVid ? vids.indexOf(nextVid) + 1 : vids.length,
      position: nextVid ? prog.find((p) => p.chapter_id === nextVid.id)?.last_position_seconds ?? 0 : 0,
      started: prog.length > 0,
      lastTouched: prog.reduce((mx, p) => Math.max(mx, p.updated_at ? Date.parse(p.updated_at) : 0), 0),
      sessions: [],
    };
  };

  const items: OwnedThing[] = [];
  const carded = new Map<string, CourseItem>(); // course id -> its one card
  const claimed = new Set<string>(); // session ids already on a card
  const batchOf = (offeringId: string) => rows.batches.find((b) => b.offering_id === offeringId);
  const isCohort = (o: OfferingLite) => o.product_tier === "live_cohort" || !!batchOf(o.id);
  const all = Array.from(byOffering.values());
  const cohorts = all.filter(isCohort);

  // 1. Cohorts, first, so a class on a course a cohort shares with another
  //    offering stays on the cohort card.
  for (const offering of cohorts) {
    const cIds = linksOf(offering.id);
    const batch = batchOf(offering.id);
    const bw = batch ? rows.weeks.filter((w) => w.cohort_batch_id === batch.id).sort((a, b) => a.week_number - b.week_number) : [];
    const weekIds = new Set(bw.map((w) => w.id));
    const ss = sessions.filter((s) => !claimed.has(s.id) && cIds.includes(s.course_id) && (!s.week_id || !bw.length || weekIds.has(s.week_id)));
    for (const s of ss) claimed.add(s.id);
    items.push({
      kind: "cohort",
      offering,
      roomPath: `/cohort/${offering.id}`,
      batchName: batch?.name ?? offering.title,
      weeks: bw,
      week: bw.filter((w) => (w.starts_on ?? "") <= todayIst).pop() ?? bw[0] ?? null,
      weekCount: bw.length ? bw[bw.length - 1].week_number : 0,
      sessions: ss,
      next: ss.find((s) => Date.parse(s.scheduled_at) > nowMs) ?? null,
      live: ss.find((s) => sessionTimeState(s, nowMs) === "live") ?? null,
      due: bw.find((w) => w.assignment_due_at && Date.parse(w.assignment_due_at) > nowMs && !submitted.has(w.id)) ?? null,
    });
  }

  // 2. Everything else.
  for (const offering of all) {
    if (isCohort(offering)) continue;
    const oid = offering.id;
    const cIds = linksOf(oid);
    const ws = rows.workshops
      .filter((w) => w.offering_id === oid && w.scheduled_at)
      .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
    if (offering.product_tier === "workshop" && ws.length) {
      const upcoming = ws.find((w) => endOf(w) > nowMs) ?? ws[ws.length - 1];
      const session: Session = { ...upcoming, course_id: cIds[0] ?? "", week_id: null, recording_url: null, kind: "workshop" };
      items.push({ kind: "liveworkshop", offering, session, state: sessionTimeState(session, nowMs), path: cIds[0] ? `/courses/${cIds[0]}` : `/p/${offering.slug}` });
      continue;
    }
    const withLessons = cIds.filter(hasLessons);
    const shown: (string | null)[] = withLessons.length ? withLessons : cIds.length ? [cIds[0]] : unread.has(oid) ? [] : [null];
    const partOf = shown.length > 1 && offering.title ? offering.title : null;
    const mine: CourseItem[] = [];
    for (const id of shown) {
      if (id && carded.has(id)) continue;
      const card = courseCard(offering, id, partOf);
      if (id) carded.set(id, card);
      mine.push(card);
      items.push(card);
    }
    // Live sessions on any of this offering's courses go on that course's
    // card, else on this offering's first card (a course with sessions and no
    // lessons has no card of its own).
    const fallback = mine[0] ?? carded.get(shown[0] ?? "");
    for (const s of sessions) {
      if (claimed.has(s.id) || !cIds.includes(s.course_id)) continue;
      const home = carded.get(s.course_id) ?? fallback;
      if (!home) continue;
      home.sessions.push(s);
      claimed.add(s.id);
    }
  }

  // 3. The courses with lessons that come with a cohort, unless a card above
  //    already holds them.
  for (const offering of cohorts) {
    for (const id of linksOf(offering.id).filter(hasLessons)) {
      if (carded.has(id)) continue;
      const card = courseCard(offering, id, offering.title || null);
      carded.set(id, card);
      items.push(card);
    }
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

/** The sessions a card holds: a cohort's classes, a live workshop's one
 *  session, a course's live sessions (a masterclass Q&A). */
export const sessionsOf = (i: OwnedThing): Session[] => (i.kind === "liveworkshop" ? [i.session] : i.sessions);

/** Where a card's sessions live: the cohort page, the workshop, or the course. */
export function sessionPath(i: OwnedThing): string {
  if (i.kind === "cohort") return i.roomPath;
  if (i.kind === "liveworkshop") return i.path;
  return i.courseId ? `/courses/${i.courseId}` : `/p/${i.offering.slug}`;
}

/** Who a session belongs to, in a line: the batch, "Workshop", or the course. */
export const sessionWho = (i: OwnedThing): string => (i.kind === "cohort" ? i.batchName : i.kind === "liveworkshop" ? "Workshop" : i.courseTitle);

/** A recording link we will open: http(s) only. recording_url is typed in by
 *  an admin, so anything else (a javascript: URL) is no link at all. */
export function recordingHref(url: string | null | undefined): string | null {
  const v = typeof url === "string" ? url.trim() : "";
  return /^https?:\/\//i.test(v) ? v : null;
}

export interface Recording { key: string; title: string; at: number; href: string; item: OwnedThing }

/** Every past class with a recording, newest first: the old Live tab's Watch
 *  list, from cohorts and from live sessions on courses. */
export function pastRecordings(items: OwnedThing[], nowMs: number): Recording[] {
  const out: Recording[] = [];
  for (const i of items) {
    for (const s of sessionsOf(i)) {
      const href = recordingHref(s.recording_url);
      const at = Date.parse(s.scheduled_at);
      if (href && (at <= nowMs || s.status === "completed")) out.push({ key: s.id, title: s.title, at, href, item: i });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** The one loud card: live > soon > tonight > ended or recorded today. */
export function pickLoud(items: OwnedThing[], nowMs: number): Loud | null {
  const prio: Partial<Record<SessionTimeState, number>> = { live: 0, soon: 1, tonight: 2, ended: 3, recorded: 4 };
  const cands: Loud[] = [];
  for (const i of items) {
    for (const s of sessionsOf(i)) {
      const state = sessionTimeState(s, nowMs);
      const sameDay = istDay(Date.parse(s.scheduled_at)) === istDay(nowMs);
      if (state === "live" || state === "soon" || state === "tonight" || ((state === "ended" || state === "recorded") && sameDay)) {
        cands.push({ item: i, s, state });
      }
    }
  }
  cands.sort((a, b) => ((prio[a.state] ?? 9) - (prio[b.state] ?? 9)) || (Date.parse(a.s.scheduled_at) - Date.parse(b.s.scheduled_at)));
  return cands[0] ?? null;
}

/** From now to IST midnight `days` days on; the loud card's own session is left out. */
export function buildAgenda(items: OwnedThing[], nowMs: number, loud: Loud | null, days = 7): AgendaRow[] {
  const end = (istDay(nowMs) + days) * DAY - IST;
  const rows: AgendaRow[] = [];
  for (const i of items) {
    for (const s of sessionsOf(i)) {
      const st = Date.parse(s.scheduled_at);
      if (st >= nowMs && st < end && loud?.s.id !== s.id) rows.push({ at: st, kind: "class", title: s.title, item: i, key: s.id });
    }
    if (i.kind === "cohort") {
      for (const w of i.weeks) {
        const d = w.assignment_due_at ? Date.parse(w.assignment_due_at) : 0;
        if (d && d >= nowMs && d < end && i.due && w.id === i.due.id) rows.push({ at: d, kind: "due", title: w.assignment_prompt ?? `Week ${w.week_number} assignment`, item: i, key: `due-${w.id}` });
      }
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
