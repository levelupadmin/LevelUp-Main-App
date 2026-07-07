import { describe, it, expect } from "vitest";
import {
  deriveWeekSummary,
  type DeriveInput,
} from "../yourWeekDerive";

/**
 * The Your Week enrolled-user derivation was 200-odd lines of Supabase-shaped
 * math with zero coverage and no way to demo it live (the dev-bypass user has no
 * enrolments). These tests exercise every branch — zero enrolments, freshly
 * enrolled but never opened, in-progress, and all-complete — against fabricated
 * rows in the exact `.select(...)` shape YourWeek queries.
 */

// A fixed "now" injected into deriveWeekSummary so the consecutiveActiveWeeks
// field (added for P4-T7) is deterministic: every fixture's completions predate
// this by months, so the streak is a stable 0 regardless of the wall clock.
const FIXED_NOW = new Date("2027-01-15T00:00:00Z");

// Two enrolled courses. course-a has 3 chapters across 2 sections (out of order
// so the sort is actually tested); course-b has 2 chapters in 1 section.
const baseRows = (): Pick<DeriveInput, "offeringCourses" | "sections" | "chapters"> => ({
  offeringCourses: [
    { offering_id: "off-1", course_id: "course-a" },
    { offering_id: "off-1", course_id: "course-b" },
  ],
  sections: [
    // deliberately unsorted; section-a2 (sort 2) before section-a1 (sort 1)
    { id: "sec-a2", course_id: "course-a", sort_order: 2 },
    { id: "sec-a1", course_id: "course-a", sort_order: 1 },
    { id: "sec-b1", course_id: "course-b", sort_order: 1 },
  ],
  chapters: [
    { id: "ch-a1", section_id: "sec-a1", sort_order: 1 },
    { id: "ch-a2", section_id: "sec-a1", sort_order: 2 },
    { id: "ch-a3", section_id: "sec-a2", sort_order: 1 },
    { id: "ch-b1", section_id: "sec-b1", sort_order: 1 },
    { id: "ch-b2", section_id: "sec-b1", sort_order: 2 },
  ],
});

describe("deriveWeekSummary — zero enrolments", () => {
  it("returns null when there are no offering_courses rows", () => {
    expect(
      deriveWeekSummary({
        offeringCourses: [],
        sections: [],
        chapters: [],
        progress: [],
      })
    ).toBeNull();
  });

  it("returns null for nullish inputs (query returned nothing)", () => {
    expect(
      deriveWeekSummary({
        offeringCourses: null,
        sections: null,
        chapters: null,
        progress: null,
      })
    ).toBeNull();
  });
});

describe("deriveWeekSummary — freshly enrolled, never opened", () => {
  it("shows the first enrolled course at 0% with lesson 1 as next", () => {
    const summary = deriveWeekSummary({ ...baseRows(), progress: [] });
    expect(summary).not.toBeNull();
    // No last-touched data → falls back to the first courseId (course-a).
    expect(summary).toEqual({
      topPct: 0,
      lessonsDone: 0,
      nextLessonNumber: 1,
      topTotal: 3,
      allComplete: false,
      // next uncompleted is the first chapter in sort order → ch-a1
      resumeTo: "/chapters/ch-a1",
      // no completions at all → no active-week streak
      consecutiveActiveWeeks: 0,
    });
  });
});

describe("deriveWeekSummary — in-progress", () => {
  it("derives pct, next lesson, and most-active course from last-touched", () => {
    // course-b touched most recently → it becomes the most-active course.
    // 1 of course-b's 2 chapters complete. lessonsDone counts BOTH courses.
    const summary = deriveWeekSummary({
      ...baseRows(),
      progress: [
        {
          chapter_id: "ch-a1",
          course_id: "course-a",
          completed_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          chapter_id: "ch-b1",
          course_id: "course-b",
          completed_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-01T00:00:00Z",
        },
      ],
    }, FIXED_NOW);
    expect(summary).toEqual({
      topPct: 50, // 1 of 2 in course-b
      lessonsDone: 2, // ch-a1 + ch-b1 across both courses
      nextLessonNumber: 2, // ch-b2 is the next uncompleted, 1-based position 2
      topTotal: 2,
      allComplete: false,
      resumeTo: "/chapters/ch-b2",
      // completions are months before FIXED_NOW → stale, no live streak
      consecutiveActiveWeeks: 0,
    });
  });

  it("orders chapters by section sort_order then chapter sort_order", () => {
    // Only ch-a3 (in the later section) done; next uncompleted must still be
    // ch-a1 because section sort wins over the raw chapter list order.
    const summary = deriveWeekSummary({
      ...baseRows(),
      progress: [
        {
          chapter_id: "ch-a3",
          course_id: "course-a",
          completed_at: "2026-06-02T00:00:00Z",
          updated_at: "2026-06-02T00:00:00Z",
        },
      ],
    });
    expect(summary?.resumeTo).toBe("/chapters/ch-a1");
    expect(summary?.nextLessonNumber).toBe(1);
    expect(summary?.topTotal).toBe(3);
    expect(summary?.topPct).toBe(33); // 1 of 3 rounded
  });
});

describe("deriveWeekSummary — all-complete", () => {
  it("flags allComplete and routes to the course (review), not a chapter", () => {
    const allCourseAProgress = [
      { chapter_id: "ch-a1", course_id: "course-a" },
      { chapter_id: "ch-a2", course_id: "course-a" },
      { chapter_id: "ch-a3", course_id: "course-a" },
    ].map((p, i) => ({
      ...p,
      completed_at: "2026-06-01T00:00:00Z",
      updated_at: `2026-06-0${i + 1}T00:00:00Z`,
    }));

    const summary = deriveWeekSummary({
      ...baseRows(),
      // course-a is the most-active (latest updated_at) AND fully complete.
      progress: allCourseAProgress,
    }, FIXED_NOW);
    expect(summary).toEqual({
      topPct: 100,
      lessonsDone: 3,
      nextLessonNumber: 3, // points at the last lesson for a re-watch
      topTotal: 3,
      allComplete: true,
      resumeTo: "/courses/course-a", // review affordance, not a chapter deep-link
      // completions are months before FIXED_NOW → stale, no live streak
      consecutiveActiveWeeks: 0,
    });
  });
});

describe("deriveWeekSummary — completed rows with null completed_at don't count", () => {
  it("ignores in-progress (started but not completed) chapters in the count", () => {
    const summary = deriveWeekSummary({
      ...baseRows(),
      progress: [
        // touched course-b most recently but NOT completed
        {
          chapter_id: "ch-b1",
          course_id: "course-b",
          completed_at: null,
          updated_at: "2026-06-10T00:00:00Z",
        },
      ],
    });
    expect(summary?.lessonsDone).toBe(0);
    expect(summary?.topPct).toBe(0);
    // still routes to course-b (most-active) first uncompleted chapter
    expect(summary?.resumeTo).toBe("/chapters/ch-b1");
  });
});
