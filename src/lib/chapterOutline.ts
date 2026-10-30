import { supabase } from "@/integrations/supabase/client";

/**
 * The columns a course outline may show. `chapters_public` (migration
 * 20261031140000) exposes exactly these, and no video URLs.
 */
export type OutlineColumn =
  | "id"
  | "section_id"
  | "title"
  | "description"
  | "duration_seconds"
  | "make_free"
  | "sort_order"
  | "content_type"
  | "thumbnail_url"
  | "vdocipher_thumbnail_url";

/**
 * Chapter outline rows for these sections, sorted by sort_order.
 *
 * Two reads, merged by id:
 *  - `chapters`: the rows this caller may open (bought, free, admin).
 *  - `chapters_public`: the outline of every chapter in a public, active
 *    offering, for visitors and signed-in non-buyers.
 *
 * Together they return the same rows `chapters` alone returned before the
 * `chapters_read_public_offering` policy was dropped; that policy also handed
 * out `media_url` and `embed_url`, which for HLS, Vimeo and YouTube lessons is
 * the paid video itself.
 *
 * An error on `chapters_public` is ignored, so this works before the view
 * exists. An error on `chapters` is returned, as the callers expect.
 */
export async function fetchChapterOutline<T extends { id: string }>(
  sectionIds: string[],
  columns: readonly OutlineColumn[],
): Promise<{ data: T[]; error: { message: string } | null }> {
  if (sectionIds.length === 0) return { data: [], error: null };
  const select = columns.includes("id") ? columns.join(", ") : ["id", ...columns].join(", ");
  const [own, outline] = await Promise.all([
    supabase.from("chapters").select(select).in("section_id", sectionIds),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- view not in generated types yet
    supabase.from("chapters_public" as any).select(select).in("section_id", sectionIds),
  ]);
  if (own.error) return { data: [], error: own.error };
  const byId = new Map<string, T>();
  for (const row of (own.data ?? []) as unknown as T[]) byId.set(row.id, row);
  if (!outline.error) {
    for (const row of (outline.data ?? []) as unknown as T[]) if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const rows = [...byId.values()];
  const order = (r: T) => Number((r as { sort_order?: number | null }).sort_order ?? 0);
  rows.sort((a, b) => order(a) - order(b));
  return { data: rows, error: null };
}
