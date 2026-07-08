import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Progress rows the once-per-set fetch resolves to; overridden per test.
let progressRows: Array<{ chapter_id: string; completed_at: string | null; last_position_seconds: number }> = [];
vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = () => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order"]) {
      query[method] = vi.fn(() => query);
    }
    query.then = (resolve: (value: { data: unknown[] }) => unknown) =>
      resolve({ data: progressRows });
    return query;
  };
  return { supabase: { from: vi.fn(() => makeQuery()) } };
});

vi.mock("@/contexts/AuthContext", () => {
  // A STABLE value — a fresh object each call would change the `user` identity
  // every render and re-fire UpNextList's `[user, siblings]` fetch effect forever.
  const value = { user: { id: "u1" } };
  return { useAuth: () => value };
});

import UpNextList from "../UpNextList";
import type { ChapterSibling } from "../types";

const sib = (id: string, title: string): ChapterSibling => ({
  id,
  title,
  duration_seconds: 600,
  content_type: "video",
  thumbnail_url: null,
  vdocipher_thumbnail_url: null,
  description: null,
});

const siblings = [sib("c1", "Lesson One"), sib("c2", "Lesson Two")];

function renderList(currentCompleted = false) {
  return render(
    <MemoryRouter>
      <UpNextList
        siblings={siblings}
        currentIndex={0}
        currentChapterId="c1"
        courseId="course-1"
        currentCompleted={currentCompleted}
      />
    </MemoryRouter>,
  );
}

describe("UpNextList — STEAL-4 row fill", () => {
  it("renders the course-momentum readout from the fetched progress", async () => {
    progressRows = [{ chapter_id: "c1", completed_at: "2026-01-01", last_position_seconds: 0 }];
    const { getByText } = renderList();
    await waitFor(() => expect(getByText("1/2")).toBeInTheDocument());
  });

  it("draws a background fill on the current row once it has watched progress", async () => {
    // Current lesson partway through → the row gets its origin-left scaleX fill.
    progressRows = [{ chapter_id: "c1", completed_at: null, last_position_seconds: 300 }];
    const { container } = renderList();
    await waitFor(() => expect(container.querySelector(".origin-left")).not.toBeNull());
  });

  it("omits the fill on a fresh current row with no watched progress", async () => {
    progressRows = [];
    const { container } = renderList();
    // Let the (empty) fetch settle, then confirm no fill layer was drawn.
    await waitFor(() => expect(container.textContent).toContain("Lesson Two"));
    expect(container.querySelector(".origin-left")).toBeNull();
  });

  it("fills the current row immediately when the lesson is marked complete", async () => {
    progressRows = [];
    const { container } = renderList(true);
    await waitFor(() => expect(container.querySelector(".origin-left")).not.toBeNull());
  });
});
