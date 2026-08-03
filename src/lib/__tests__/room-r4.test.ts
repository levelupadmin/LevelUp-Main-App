import { describe, expect, it } from "vitest";

import { alumniRevisionOpen, roomModuleEnabled } from "@/lib/room";

describe("R4 phase-aware room contracts", () => {
  it("opens demo day by default only for wrap and alumni", () => {
    expect(roomModuleEnabled(null, "demo_day", "live")).toBe(false);
    expect(roomModuleEnabled(null, "demo_day", "wrap")).toBe(true);
    expect(roomModuleEnabled(null, "demo_day", "alumni")).toBe(true);
  });

  it("honours an explicit demo-day override in every phase", () => {
    expect(roomModuleEnabled({ modules: { demo_day: false } }, "demo_day", "wrap")).toBe(false);
    expect(roomModuleEnabled({ modules: { demo_day: true } }, "demo_day", "live")).toBe(true);
  });

  it("keeps only needs-revision work open for fourteen days after the alumni flip", () => {
    const alumniSince = "2026-08-01T00:00:00.000Z";
    const inside = Date.parse("2026-08-14T23:59:59.000Z");
    const outside = Date.parse("2026-08-15T00:00:01.000Z");

    expect(alumniRevisionOpen("alumni", alumniSince, "needs_revision", inside)).toBe(true);
    expect(alumniRevisionOpen("alumni", alumniSince, "submitted", inside)).toBe(false);
    expect(alumniRevisionOpen("alumni", alumniSince, "needs_revision", outside)).toBe(false);
    expect(alumniRevisionOpen("wrap", null, null, outside)).toBe(true);
  });
});
