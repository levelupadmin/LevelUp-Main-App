import { describe, it, expect } from "vitest";
import { generateSchedule } from "../previewAdmin";
import { reduce, INITIAL } from "../previewStore";

describe("launch_cohort's engine — dates from a template with no dates in it", () => {
  it("a Dec 5 start dates all 13 weeks, one per week", () => {
    const cal = generateSchedule("2026-12-05", []);
    expect(cal.length).toBe(13);
    expect(cal[0].classISO.slice(0, 10)).toBe("2026-12-05");
    expect(cal[1].classISO.slice(0, 10)).toBe("2026-12-12");
    expect(cal[12].classISO.slice(0, 10)).toBe("2027-02-27");
    expect(cal.every((w) => !w.shifted)).toBe(true);
  });

  it("the block is due 4 days after the class, the review 6", () => {
    const [w0] = generateSchedule("2026-12-05", []);
    expect(w0.blockISO.slice(0, 10)).toBe("2026-12-09");
    expect(w0.reviewISO.slice(0, 10)).toBe("2026-12-11");
  });

  it("a blackout on a class day pushes that class — and everything after — one week", () => {
    // Week 3 would land on Dec 26; blacked out → Dec 26 class moves to Jan 2 and the tail shifts.
    const cal = generateSchedule("2026-12-05", ["2026-12-26"]);
    expect(cal[3].classISO.slice(0, 10)).toBe("2027-01-02");
    expect(cal[3].shifted).toBe(true);
    expect(cal[4].classISO.slice(0, 10)).toBe("2027-01-09");
    expect(cal[2].classISO.slice(0, 10)).toBe("2026-12-19"); // history never moves
    expect(cal[2].shifted).toBe(false);
  });

  it("consecutive blackout weeks cascade until a clear date", () => {
    const cal = generateSchedule("2026-12-05", ["2026-12-12", "2026-12-19"]);
    expect(cal[1].classISO.slice(0, 10)).toBe("2026-12-26");
    expect(cal[1].shifted).toBe(true);
  });
});

describe("the admin demo's store actions", () => {
  it("launch_cohort lands the announced cohort in state", () => {
    const s = reduce(INITIAL, {
      type: "launch_cohort",
      cohort: { name: "Creator Academy · Cohort 03", start: "2026-12-05", blackouts: [], shiftedCount: 0 },
    });
    expect(s.cohort?.name).toBe("Creator Academy · Cohort 03");
  });

  it("admin_edit_card overrides the template and merges partial edits", () => {
    let s = reduce(INITIAL, { type: "admin_edit_card", week: 6, blurb: "New blurb for editing week." });
    s = reduce(s, { type: "admin_edit_card", week: 6, block: "One reel, cut two ways" });
    expect(s.overrides[6]).toEqual({ blurb: "New blurb for editing week.", block: "One reel, cut two ways" });
    // Template stays the default everywhere else — precedence, not mutation.
    expect(s.overrides[7]).toBeUndefined();
  });
});
