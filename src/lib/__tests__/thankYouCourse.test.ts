import { describe, expect, it } from "vitest";
import { firstLessonId, formatRuntime, measuredRuntimeSeconds, type OutlineChapter } from "@/lib/thankYouCourse";

const ch = (id: string, section_id: string, sort_order: number, duration_seconds: number, content_type = "video"): OutlineChapter => ({
  id,
  section_id,
  sort_order,
  duration_seconds,
  content_type,
});

describe("thankYouCourse", () => {
  it("formats runtime the way the site does", () => {
    expect(formatRuntime(8400)).toBe("2 h 20 min");
    expect(formatRuntime(2700)).toBe("45 min");
    expect(formatRuntime(7200)).toBe("2 h");
    // 119.6 minutes rounds to 2 h, never "1 h 60 min".
    expect(formatRuntime(7176)).toBe("2 h");
  });

  it("sums measured lessons only when every video lesson has a length", () => {
    expect(measuredRuntimeSeconds([ch("a", "s", 1, 600), ch("b", "s", 2, 300)])).toBe(900);
    // One lesson without a length: no runtime rather than an understated one.
    expect(measuredRuntimeSeconds([ch("a", "s", 1, 600), ch("b", "s", 2, 0)])).toBeNull();
    // PDFs do not count.
    expect(measuredRuntimeSeconds([ch("a", "s", 1, 600), ch("p", "s", 2, 0, "pdf")])).toBe(600);
    expect(measuredRuntimeSeconds([])).toBeNull();
  });

  it("finds lesson 1 by section order, then lesson order", () => {
    const sections = [
      { id: "s2", sort_order: 2 },
      { id: "s1", sort_order: 1 },
    ];
    const chapters = [ch("late", "s2", 0, 1), ch("second", "s1", 2, 1), ch("first", "s1", 1, 1)];
    expect(firstLessonId(sections, chapters)).toBe("first");
    expect(firstLessonId([], chapters)).toBeNull();
  });
});
