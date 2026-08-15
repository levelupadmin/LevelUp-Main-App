/**
 * The room's rules. A leaderboard that reshuffles on refresh teaches nobody
 * anything, so determinism is the property worth pinning.
 */
import { describe, it, expect } from "vitest";
import { CLASSMATES, roomFor, sinceOpen } from "../previewCohort";
import { PEOPLE } from "../previewData";

describe("the cohort", () => {
  it("is the SAME invented cohort the Feed shows — one roster, not two", () => {
    const feedNames = PEOPLE.filter((p) => !p.isMentor).map((p) => p.name).sort();
    expect(CLASSMATES.map((c) => c.name).sort()).toEqual(feedNames);
  });

  it("excludes the mentor from the student room", () => {
    expect(CLASSMATES.some((c) => c.name === "Rahul")).toBe(false);
  });
});

describe("the room", () => {
  it("is deterministic — the same card gives the same room every time", () => {
    const a = roomFor("w0-block").map((x) => `${x.student.id}:${x.startedMin}:${x.stage}`);
    const b = roomFor("w0-block").map((x) => `${x.student.id}:${x.startedMin}:${x.stage}`);
    expect(a).toEqual(b);
  });

  it("differs between cards — week 1 is not a copy of week 0", () => {
    expect(roomFor("w0-block").map((x) => x.student.id)).not.toEqual(roomFor("w1-block").map((x) => x.student.id));
  });

  it("is ordered by who moved first, which is the whole point", () => {
    const mins = roomFor("w0-block").map((x) => x.startedMin);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it("never lists the same person twice", () => {
    const ids = roomFor("w1-block").map((x) => x.student.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is always partial — a cohort where everyone has started is not a cohort", () => {
    for (const id of ["w0-block", "w1-block", "w4-block", "w9-block"]) {
      expect(roomFor(id).length).toBeLessThan(CLASSMATES.length);
      expect(roomFor(id).length).toBeGreaterThan(0);
    }
  });

  it("reads time as distance from the opening, not a wall clock", () => {
    expect(sinceOpen(45)).toBe("45m in");
    expect(sinceOpen(150)).toBe("2h 30m in");
    expect(sinceOpen(60 * 30)).toBe("day 2");
  });
});
