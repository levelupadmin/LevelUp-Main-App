/**
 * Public chapter rows no longer carry video URLs (migration 20261031140000).
 *
 * chapters_read_public_offering gave anon and every signed-in user the whole
 * row of every chapter in a public offering, media_url included. The
 * migration drops it and adds chapters_public, an outline-only view. Pages
 * that show an outline read both through fetchChapterOutline.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown[] | null; error: { message: string } | null };
const results: Record<string, Result> = {};
const calls: { table: string; select: string; ids: string[] }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (select: string) => ({
        in: (_col: string, ids: string[]) => {
          calls.push({ table, select, ids });
          return Promise.resolve(results[table] ?? { data: [], error: null });
        },
      }),
    }),
  },
}));

import { fetchChapterOutline } from "@/lib/chapterOutline";

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "supabase", "migrations"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}
const read = (path: string) => readFileSync(join(repoRoot(), path), "utf8");
const code = (sql: string) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ");

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  calls.length = 0;
});

describe("fetchChapterOutline", () => {
  it("merges the caller's rows with the public outline, once per id, in sort order", async () => {
    results.chapters = { data: [{ id: "a", sort_order: 2 }, { id: "b", sort_order: 1 }], error: null };
    results.chapters_public = { data: [{ id: "b", sort_order: 1 }, { id: "c", sort_order: 0 }], error: null };
    const { data, error } = await fetchChapterOutline<{ id: string; sort_order: number }>(["s1"], ["id", "sort_order"]);
    expect(error).toBeNull();
    expect(data.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(calls.map((c) => c.table).sort()).toEqual(["chapters", "chapters_public"]);
    expect(calls.every((c) => c.select === "id, sort_order" && c.ids[0] === "s1")).toBe(true);
  });

  it("works before the view exists", async () => {
    results.chapters = { data: [{ id: "a" }], error: null };
    results.chapters_public = { data: null, error: { message: 'relation "chapters_public" does not exist' } };
    const { data, error } = await fetchChapterOutline<{ id: string }>(["s1"], ["id"]);
    expect(error).toBeNull();
    expect(data.map((r) => r.id)).toEqual(["a"]);
  });

  it("returns an error on chapters, as the callers expect", async () => {
    results.chapters = { data: null, error: { message: "boom" } };
    const { data, error } = await fetchChapterOutline<{ id: string }>(["s1"], ["id"]);
    expect(error?.message).toBe("boom");
    expect(data).toEqual([]);
  });

  it("skips the network for no sections", async () => {
    const { data } = await fetchChapterOutline<{ id: string }>([], ["id"]);
    expect(data).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("migration 20261031140000", () => {
  const sql = code(read("supabase/migrations/20261031140000_chapters_public_outline.sql"));
  const view = sql.slice(sql.indexOf("create or replace view public.chapters_public"), sql.indexOf("from public.chapters ch"));

  it("drops the policy that handed out whole rows", () => {
    expect(sql).toContain("drop policy if exists chapters_read_public_offering on public.chapters;");
  });

  it("exposes outline columns only", () => {
    for (const col of ["media_url", "embed_url", "vdocipher_video_id", "vdocipher_watermark_text", "article_body", "subtitle_url", "assignment_prompt", "original_filename", "media_provider", "allow_download", "ch.*"]) {
      expect(view).not.toContain(col);
    }
  });

  it("keeps the old policy's row test", () => {
    expect(sql).toContain("where s.id = ch.section_id and o.is_public = true and o.status = 'active'");
  });

  it("grants read only", () => {
    expect(sql).toContain("grant select on public.chapters_public to anon, authenticated;");
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*chapters_public/);
  });
});

describe("outline readers", () => {
  it("the sales page no longer embeds chapter rows", () => {
    const page = read("src/pages/PublicOffering.tsx");
    expect(page).not.toMatch(/\bchapters\(/);
    expect(page).toContain("fetchChapterOutline");
  });

  it("outline-only pages read through the helper", () => {
    for (const path of [
      "src/pages/CourseDetail.tsx",
      "src/pages/ThankYou.tsx",
      "src/pages/MyCoursesPage.tsx",
      "src/hooks/useEnrolledProgress.ts",
      "src/hooks/useRoomCertificate.ts",
    ]) {
      const src = read(path);
      expect(src, path).toContain("fetchChapterOutline");
      expect(src, path).not.toContain('from("chapters")');
    }
  });
});
