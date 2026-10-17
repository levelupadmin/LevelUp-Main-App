/**
 * Course facts for the Thank-you page, from the course's own lessons.
 *
 * The page used to print `courses.duration_minutes` rounded up ("15+ hrs").
 * That column holds lessons x 30 placeholders for the masterclasses, so buyers
 * read hours the course does not have. The runtime now comes only from
 * measured lesson lengths (`chapters.duration_seconds`, filled from VdoCipher
 * by vdocipher-metadata-backfill-all), and only when every video lesson has
 * one: a partial sum would understate the course just as the placeholder
 * overstated it. No measured runtime, no runtime line.
 */

export type OutlineSection = { id: string; sort_order: number | null };
export type OutlineChapter = {
  id: string;
  section_id: string;
  sort_order: number | null;
  content_type: string | null;
  duration_seconds: number | null;
};

/** 8400 -> "2 h 20 min", 2700 -> "45 min", 7200 -> "2 h". Same shape the site prints. */
export function formatRuntime(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/**
 * Total measured runtime in seconds, or null unless every video lesson has a
 * positive length. Non-video lessons (PDFs, quizzes) do not count.
 */
export function measuredRuntimeSeconds(chapters: OutlineChapter[]): number | null {
  const videos = chapters.filter((c) => (c.content_type ?? "video") === "video");
  if (videos.length === 0) return null;
  let total = 0;
  for (const c of videos) {
    const s = Number(c.duration_seconds ?? 0);
    if (!Number.isFinite(s) || s <= 0) return null;
    total += s;
  }
  return total;
}

/** Lesson 1: the first lesson of the first section, in course order. */
export function firstLessonId(sections: OutlineSection[], chapters: OutlineChapter[]): string | null {
  const order = (n: number | null) => (typeof n === "number" ? n : Number.MAX_SAFE_INTEGER);
  const sectionRank = new Map(
    [...sections].sort((a, b) => order(a.sort_order) - order(b.sort_order)).map((s, i) => [s.id, i]),
  );
  const ranked = chapters
    .filter((c) => sectionRank.has(c.section_id))
    .sort(
      (a, b) =>
        (sectionRank.get(a.section_id)! - sectionRank.get(b.section_id)!) ||
        order(a.sort_order) - order(b.sort_order),
    );
  return ranked[0]?.id ?? null;
}
