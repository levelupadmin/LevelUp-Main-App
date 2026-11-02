import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/*
 * The catalogue the new Home and Explore are built from. Same rules as the
 * round-4 mockup's data layer (15_LMS_Experience_Lab/assets/js/r4-home-data.js):
 * nothing on these screens is written by hand except the format copy.
 *
 * - Formats are offerings.product_tier: masterclass, live_cohort, workshop.
 * - Listed = is_public, status active, and the course not hidden from browse.
 * - Lessons = courses.total_lessons when set, else the video chapters.
 * - Free lessons = chapters.make_free on listed courses the person doesn't own.
 * - A live cohort's price of 0 means "apply first", so no price is shown.
 */

export type Tier = "masterclass" | "live_cohort" | "workshop";
export const TIERS: Tier[] = ["masterclass", "live_cohort", "workshop"];
/** A workshop with no picture of its own shows a real LevelUp live session (a key in the landing bucket). */
export const WORKSHOP_ART = "cohort/l3c/a7bd60764e98.png";

interface OfferingRow {
  id: string; slug: string; title: string; subtitle: string | null; highlights: unknown;
  thumbnail_url: string | null; product_tier: string; instructor_name: string | null;
  price_inr: number | string | null; validity_days: number | null; refund_policy_days: number | null; created_at: string;
}
interface CourseRow {
  id: string; title: string; total_lessons: number | null; duration_minutes: number | null; duration_text: string | null;
  language: string | null; show_on_browse: boolean | null; primary_offering_id: string | null;
}
interface SectionRow { id: string; course_id: string; sort_order: number | null }
interface ChapterRow { id: string; section_id: string; title: string; content_type: string | null; make_free: boolean | null; sort_order: number | null }

export interface CatalogItem {
  offering: OfferingRow & { price: number; highlight: string | null };
  course: CourseRow | null;
  lessons: number;
  videos: number;
  files: number;
  owned: boolean;
}
export interface FormatSummary {
  tier: Tier;
  list: CatalogItem[];
  count: number;
  price: [number, number] | null;
  runtime: [number, number] | null;
  weeks: [number, number] | null;
  refundDays: number | null;
  lifetime: boolean;
  apply: number;
}
export interface FreeLesson { chapter: ChapterRow; course: CourseRow; offering: OfferingRow }
export interface StageCatalog { catalog: CatalogItem[]; formats: FormatSummary[]; free: FreeLesson[] }

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v) || 0);

async function fetchRaw() {
  const [o, c, oc, s, ch] = await Promise.all([
    supabase.from("offerings")
      .select("id, slug, title, subtitle, highlights, thumbnail_url, product_tier, instructor_name, price_inr, validity_days, refund_policy_days, created_at")
      .eq("is_public", true).eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("courses")
      .select("id, title, total_lessons, duration_minutes, duration_text, language, show_on_browse, primary_offering_id"),
    supabase.from("offering_courses").select("offering_id, course_id"),
    supabase.from("sections").select("id, course_id, sort_order"),
    supabase.from("chapters").select("id, section_id, title, content_type, make_free, sort_order"),
  ]);
  const err = o.error || c.error || oc.error || s.error || ch.error;
  if (err) throw err;
  return {
    offerings: (o.data ?? []) as OfferingRow[],
    courses: (c.data ?? []) as CourseRow[],
    links: (oc.data ?? []) as { offering_id: string; course_id: string }[],
    sections: (s.data ?? []) as SectionRow[],
    chapters: (ch.data ?? []) as ChapterRow[],
  };
}

export function buildCatalog(raw: Awaited<ReturnType<typeof fetchRaw>>, ownedIds: Set<string>): StageCatalog {
  const courseById = new Map(raw.courses.map((c) => [c.id, c]));
  const secById = new Map(raw.sections.map((s) => [s.id, s]));
  const chaptersByCourse = new Map<string, ChapterRow[]>();
  for (const ch of raw.chapters) {
    const sec = secById.get(ch.section_id);
    if (!sec) continue;
    const list = chaptersByCourse.get(sec.course_id) ?? [];
    list.push(ch);
    chaptersByCourse.set(sec.course_id, list);
  }
  for (const list of chaptersByCourse.values()) {
    list.sort((a, b) => (num(secById.get(a.section_id)?.sort_order) - num(secById.get(b.section_id)?.sort_order)) || (num(a.sort_order) - num(b.sort_order)));
  }
  const coursesOf = (offeringId: string) =>
    raw.links.filter((l) => l.offering_id === offeringId).map((l) => courseById.get(l.course_id)).filter(Boolean) as CourseRow[];

  const catalog: CatalogItem[] = [];
  for (const o of raw.offerings) {
    if (!TIERS.includes(o.product_tier as Tier)) continue;
    const cs = coursesOf(o.id);
    const c = cs.find((x) => (chaptersByCourse.get(x.id) ?? []).length) ?? cs[0] ?? null;
    if (c && c.show_on_browse === false) continue;
    const chs = c ? chaptersByCourse.get(c.id) ?? [] : [];
    const videos = chs.filter((x) => x.content_type === "video").length;
    const hl = Array.isArray(o.highlights) && typeof o.highlights[0] === "string" ? (o.highlights[0] as string) : null;
    catalog.push({
      offering: { ...o, price: num(o.price_inr), highlight: hl },
      course: c,
      lessons: c && num(c.total_lessons) > 0 ? num(c.total_lessons) : videos,
      videos,
      files: chs.length - videos,
      owned: ownedIds.has(o.id),
    });
  }

  const formats: FormatSummary[] = TIERS.map((tier) => {
    const list = catalog.filter((x) => x.offering.product_tier === tier);
    const prices = list.map((x) => x.offering.price).filter((p) => p > 0);
    const mins = list.map((x) => num(x.course?.duration_minutes)).filter((m) => m > 0);
    const weeks = list.map((x) => Number((x.course?.duration_text ?? "").match(/(\d+)\s*weeks?/)?.[1] ?? 0)).filter((w) => w > 0);
    const refund = list.map((x) => num(x.offering.refund_policy_days)).filter((d) => d > 0);
    return {
      tier, list, count: list.length,
      price: prices.length ? [Math.min(...prices), Math.max(...prices)] : null,
      runtime: mins.length ? [Math.min(...mins), Math.max(...mins)] : null,
      weeks: weeks.length ? [Math.min(...weeks), Math.max(...weeks)] : null,
      refundDays: refund.length ? Math.min(...refund) : null,
      lifetime: list.length > 0 && list.every((x) => x.offering.validity_days == null),
      apply: list.filter((x) => /application-only/i.test(x.course?.duration_text ?? "")).length,
    };
  });

  // Free lessons, in the masterclass shelf's order.
  const offById = new Map(raw.offerings.map((o) => [o.id, o]));
  const order = new Map(catalog.map((x, i) => [x.offering.id, i]));
  const free: FreeLesson[] = raw.chapters
    .filter((ch) => ch.make_free)
    .map((ch) => {
      const course = courseById.get(secById.get(ch.section_id)?.course_id ?? "");
      const offering = course?.primary_offering_id ? offById.get(course.primary_offering_id) : undefined;
      return course && offering ? { chapter: ch, course, offering } : null;
    })
    .filter((x): x is FreeLesson => !!x && x.course.show_on_browse !== false && !ownedIds.has(x.offering.id))
    .sort((a, b) => (order.get(a.offering.id) ?? 99) - (order.get(b.offering.id) ?? 99));

  return { catalog, formats, free };
}

/** Offerings the signed-in person has an active enrolment for, with what the sidebar shows. */
export interface OwnedItem { id: string; slug: string; title: string; thumbnail_url: string | null; product_tier: string | null }
export function useOwnedOfferings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["stage-owned", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<OwnedItem[]> => {
      const { data, error } = await supabase
        .from("enrolments")
        .select("offering_id, offerings(id, slug, title, thumbnail_url, product_tier)")
        .eq("user_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      const rows = (data ?? []) as unknown as { offerings: OwnedItem | null }[];
      const seen = new Set<string>();
      return rows.map((r) => r.offerings).filter((o): o is OwnedItem => !!o && !seen.has(o.id) && !!seen.add(o.id));
    },
  });
}

export function useStageCatalog() {
  const owned = useOwnedOfferings();
  const raw = useQuery({ queryKey: ["stage-catalog"], queryFn: fetchRaw, staleTime: 5 * 60_000 });
  const ownedIds = new Set((owned.data ?? []).map((o) => o.id));
  return {
    isLoading: raw.isLoading || owned.isLoading,
    isError: raw.isError,
    refetch: raw.refetch,
    owned: owned.data ?? [],
    data: raw.data ? buildCatalog(raw.data, ownedIds) : null,
  };
}

/* ---- the format copy: the app's own words, written once from leveluplearning.in ---- */
export const FORMAT_COPY: Record<Tier, { plural: string; word: string; line: string; body: string; fb: string; best: string }> = {
  masterclass: {
    plural: "Masterclasses", word: "Masterclass", line: "Learn from the person who did the work.",
    body: "Recorded lessons from the directors, editors, composers and photographers behind films you know. Watch at your own pace.",
    fb: "No", best: "You want to learn how a master thinks, on your own time",
  },
  live_cohort: {
    plural: "Live cohorts", word: "Live cohort", line: "Make real work, with mentors and a batch.",
    body: "Live classes with mentors and a batch, feedback on your assignments, and work you can show by the end.",
    fb: "Yes, from mentors", best: "You want to make work and get better with feedback",
  },
  workshop: {
    plural: "Workshops", word: "Workshop", line: "One topic, one session.",
    body: "A single session on one part of the craft. You get the session recording and the files that go with it.",
    fb: "No", best: "You want one topic, quickly",
  },
};

export const LANG: Record<string, string> = { ta: "Tamil", kn: "Kannada", en: "English", hi: "Hindi", te: "Telugu", ml: "Malayalam" };
export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const runtime = (m: number) => {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h ? `${h}h ${String(r).padStart(2, "0")}m`.replace(" 0", " ") : `${r}m`;
};

/** The facts a format card states, each computed from the rows. */
export function formatFacts(f: FormatSummary): string[] {
  const out: string[] = [];
  const n = f.count;
  if (f.tier === "masterclass") {
    out.push(`${n} masterclasses`);
    if (f.price) out.push(`${inr(f.price[0])} to ${inr(f.price[1])}, pay once`);
    if (f.runtime) out.push(`${runtime(f.runtime[0])} to ${runtime(f.runtime[1])} each`);
    if (f.lifetime) out.push("Yours to keep");
    if (f.refundDays) out.push(`${f.refundDays}-day refund`);
  } else if (f.tier === "live_cohort") {
    out.push(`${n} programs`);
    if (f.weeks) out.push(f.weeks[0] === f.weeks[1] ? `${f.weeks[0]} weeks` : `${f.weeks[0]} to ${f.weeks[1]} weeks`);
    if (f.apply) out.push(`${f.apply === n ? "All" : `${f.apply} of ${n}`} by application`);
  } else {
    out.push(`${n} workshop${n === 1 ? "" : "s"}`);
    const w = f.list[0];
    if (n === 1 && w && w.videos) out.push(`${w.videos} videos and ${w.files} files`);
  }
  return out;
}
