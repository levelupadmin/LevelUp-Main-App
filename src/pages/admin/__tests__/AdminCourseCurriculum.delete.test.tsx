import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Deleting a chapter must actually DELETE it.
 *
 * The bug this pins: `handleSave` walked `sections` and INSERTed (`_isNew`) or
 * UPDATEd every row still in state. A chapter the admin removed was simply
 * absent from that walk, so nothing ever touched its DB row — and the `load()`
 * that runs on save success pulled it straight back. To the admin the delete
 * button did nothing at all: remove, Save Curriculum, chapter reappears. Two
 * duplicate decks sat in the live Creator Academy Cohort 02 curriculum because
 * of it.
 *
 * So the assertions here are about the WRITE, not the local list: removing a
 * row from React state was never the broken half. What matters is that a
 * DELETE carrying that row's id reaches the `chapters` table on save, and —
 * just as importantly — that nothing else does.
 */

const COURSE = { title: "Test Course", default_video_type: "standard" };
const SECTIONS = [{ id: "sec-1", title: "Section One", sort_order: 0 }];
const chapterRow = (id: string, title: string, sort: number) => ({
  id,
  title,
  content_type: "article",
  description: "",
  media_url: null,
  media_provider: null,
  embed_url: null,
  article_body: "",
  duration_seconds: 0,
  make_free: false,
  allow_download: false,
  sort_order: sort,
  section_id: "sec-1",
  video_type: "standard",
  vdocipher_video_id: null,
  vdocipher_watermark_text: null,
  thumbnail_url: null,
  vdocipher_thumbnail_url: null,
});
const CHAPTERS = [chapterRow("ch-keep", "Keep Me", 0), chapterRow("ch-drop", "Delete Me", 1)];

/** Every write the component issued, in order. */
const writes: { table: string; op: string; ids?: string[]; id?: string }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const build = (table: string) => {
    const st: { op: string | null } = { op: null };
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      order: () => b,
      insert: () => {
        st.op = "insert";
        writes.push({ table, op: "insert" });
        return b;
      },
      update: () => {
        st.op = "update";
        return b;
      },
      delete: () => {
        st.op = "delete";
        return b;
      },
      eq: (_col: string, val: string) => {
        if (st.op === "update") writes.push({ table, op: "update", id: val });
        if (st.op === "delete") writes.push({ table, op: "delete", ids: [val] });
        return b;
      },
      in: (_col: string, vals: string[]) => {
        if (st.op === "delete") writes.push({ table, op: "delete", ids: vals });
        return b;
      },
      single: () => Promise.resolve({ data: COURSE, error: null }),
      // Makes the builder awaitable for the read/write calls that don't
      // terminate in .single().
      then: (resolve: (v: unknown) => unknown) => {
        if (st.op) return Promise.resolve({ data: null, error: null }).then(resolve);
        const data = table === "sections" ? SECTIONS : table === "chapters" ? CHAPTERS : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    });
    return b;
  };
  return { supabase: { from: (t: string) => build(t), functions: { invoke: vi.fn() } } };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import AdminCourseCurriculum from "@/pages/admin/AdminCourseCurriculum";

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/admin/courses/course-1/curriculum"]}>
      <Routes>
        <Route path="/admin/courses/:courseId/curriculum" element={<AdminCourseCurriculum />} />
      </Routes>
    </MemoryRouter>,
  );

describe("AdminCourseCurriculum — removing a chapter persists", () => {
  beforeEach(() => {
    writes.length = 0;
  });
  afterEach(cleanup);

  it("issues a DELETE for the removed chapter on Save Curriculum", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText("Delete chapter: Delete Me")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Delete chapter: Delete Me"));
    fireEvent.click(screen.getByRole("button", { name: /save curriculum/i }));

    await waitFor(() => {
      const del = writes.find((w) => w.table === "chapters" && w.op === "delete");
      expect(del, "no DELETE reached the chapters table").toBeTruthy();
      expect(del!.ids).toContain("ch-drop");
    });

    // The surviving chapter must be updated, never deleted.
    const deletedIds = writes.filter((w) => w.op === "delete").flatMap((w) => w.ids ?? []);
    expect(deletedIds).not.toContain("ch-keep");
    expect(writes.some((w) => w.table === "chapters" && w.op === "update" && w.id === "ch-keep")).toBe(true);
  });

  it("deletes nothing when the admin removes nothing", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText("Delete chapter: Delete Me")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /save curriculum/i }));

    await waitFor(() =>
      expect(writes.some((w) => w.table === "chapters" && w.op === "update")).toBe(true),
    );
    expect(writes.filter((w) => w.op === "delete")).toHaveLength(0);
  });
});
