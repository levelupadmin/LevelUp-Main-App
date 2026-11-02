import { beforeEach, describe, expect, it, vi } from "vitest";

// buyer.ts reads through the Supabase client and the auth context; the pure
// builders below need neither, and fetchBuyer gets a scripted client.
const db = vi.hoisted(() => ({
  responses: {} as Record<string, { data: unknown; error: unknown }>,
  calls: [] as string[],
}));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const result = () => db.responses[table] ?? { data: [], error: null };
    const b: unknown = new Proxy({}, {
      get(_t, key) {
        if (key === "then") return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
        return () => b;
      },
    });
    return b;
  };
  return { supabase: { from: (table: string) => { db.calls.push(table); return builder(table); }, rpc: vi.fn() } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

import {
  buildAgenda, buildBuyerHome, fetchBuyer, pastRecordings, pickLoud, recordingHref, sessionPath, sessionWho,
  type BuyerRows, type CohortItem, type CourseItem, type OwnedThing,
} from "../buyer";

const NOW = Date.parse("2026-11-02T06:30:00Z"); // 12:00 IST
const H = 36e5, D = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();

type Offering = NonNullable<BuyerRows["enrolments"][number]["offerings"]>;
const offering = (id: string, tier: string | null, title = `Offering ${id}`): Offering => ({ id, slug: `slug-${id}`, title, thumbnail_url: `https://img/${id}.jpg`, product_tier: tier });

function rows(over: Partial<BuyerRows> = {}): BuyerRows {
  return {
    enrolments: [], links: [], workshops: [], progress: [], submissions: [], courses: [],
    sections: [], chapters: [], batches: [], weeks: [], sessions: [], ...over,
  };
}

/** A course with `n` video lessons in one section. */
function course(id: string, n: number, title = `Course ${id}`) {
  return {
    course: { id, title, total_lessons: null, thumbnail_url: `https://img/course-${id}.jpg` },
    section: { id: `sec-${id}`, course_id: id, sort_order: 1 },
    chapters: Array.from({ length: n }, (_, k) => ({ id: `${id}-ch${k + 1}`, section_id: `sec-${id}`, title: `Lesson ${k + 1}`, content_type: "video", sort_order: k + 1 })),
  };
}
function withCourses(cs: ReturnType<typeof course>[], over: Partial<BuyerRows>): BuyerRows {
  return rows({
    courses: cs.map((c) => c.course),
    sections: cs.filter((c) => c.chapters.length).map((c) => c.section),
    chapters: cs.flatMap((c) => c.chapters),
    ...over,
  });
}
const session = (id: string, courseId: string, at: number, over: Partial<BuyerRows["sessions"][number]> = {}) => ({
  id, course_id: courseId, week_id: null, title: `Session ${id}`, scheduled_at: iso(at), duration_minutes: 60, status: "scheduled", recording_url: null, ...over,
});
const courseCards = (items: OwnedThing[]) => items.filter((i): i is CourseItem => i.kind === "masterclass" || i.kind === "course" || i.kind === "workshop");

describe("buildBuyerHome: one card per course", () => {
  it("gives every course of a bundle its own card, with its own progress", () => {
    const a = course("a", 4), b = course("b", 2), empty = course("e", 0);
    const home = buildBuyerHome(withCourses([a, b, empty], {
      enrolments: [{ id: "en1", offering_id: "bundle", offerings: offering("bundle", "masterclass", "The Bundle") }],
      links: [{ offering_id: "bundle", course_id: "a" }, { offering_id: "bundle", course_id: "b" }, { offering_id: "bundle", course_id: "e" }],
      progress: [
        { chapter_id: "a-ch1", course_id: "a", completed_at: iso(NOW - D), last_position_seconds: 0, updated_at: iso(NOW - D) },
        { chapter_id: "b-ch1", course_id: "b", completed_at: iso(NOW - H), last_position_seconds: 0, updated_at: iso(NOW - H) },
        { chapter_id: "b-ch2", course_id: "b", completed_at: iso(NOW - H), last_position_seconds: 0, updated_at: iso(NOW - H) },
      ],
    }), NOW);

    const cards = courseCards(home.items);
    expect(cards.map((c) => c.courseId)).toEqual(["b", "a"]); // most recently touched first; the lesson-less course has no card
    const [cb, ca] = cards;
    expect([ca.done, ca.total, ca.next?.id]).toEqual([1, 4, "a-ch2"]);
    expect([cb.done, cb.total, cb.next]).toEqual([2, 2, null]);
    expect(cards.every((c) => c.kind === "masterclass" && c.partOf === "The Bundle")).toBe(true);
    expect(ca.art).toBe("https://img/course-a.jpg");
    expect(home.ownedIds).toEqual(new Set(["bundle"]));
  });

  it("keeps a single-course offering as one plain card with the offering's picture", () => {
    const a = course("a", 3);
    const home = buildBuyerHome(withCourses([a], {
      enrolments: [{ id: "en1", offering_id: "mc", offerings: offering("mc", "masterclass") }],
      links: [{ offering_id: "mc", course_id: "a" }],
    }), NOW);
    const [card] = courseCards(home.items);
    expect(home.items).toHaveLength(1);
    expect(card.partOf).toBeNull();
    expect(card.art).toBe("https://img/mc.jpg");
  });

  it("shows a course two offerings share once", () => {
    const a = course("a", 3), b = course("b", 3);
    const home = buildBuyerHome(withCourses([a, b], {
      enrolments: [
        { id: "en1", offering_id: "mc", offerings: offering("mc", "masterclass") },
        { id: "en2", offering_id: "bundle", offerings: offering("bundle", "masterclass") },
      ],
      links: [{ offering_id: "mc", course_id: "a" }, { offering_id: "bundle", course_id: "a" }, { offering_id: "bundle", course_id: "b" }],
    }), NOW);
    expect(courseCards(home.items).map((c) => c.courseId).sort()).toEqual(["a", "b"]);
  });

  it("still gives an offering whose courses have no lessons one card", () => {
    const e = course("e", 0);
    const home = buildBuyerHome(withCourses([e], {
      enrolments: [{ id: "en1", offering_id: "o", offerings: offering("o", "other") }],
      links: [{ offering_id: "o", course_id: "e" }],
    }), NOW);
    expect(courseCards(home.items).map((c) => [c.courseId, c.kind])).toEqual([["e", "course"]]);
  });

  it("keeps an enrolment whose offering row cannot be read, named after its course", () => {
    const a = course("a", 2, "Hidden Course");
    const home = buildBuyerHome(withCourses([a], {
      enrolments: [{ id: "en1", offering_id: "draft", offerings: null }],
      links: [{ offering_id: "draft", course_id: "a" }],
    }), NOW);
    const [card] = courseCards(home.items);
    expect(card.courseTitle).toBe("Hidden Course");
    expect(card.art).toBe("https://img/course-a.jpg");
    expect(home.ownedIds).toEqual(new Set(["draft"]));
  });

  it("returns nothing for no enrolments", () => {
    expect(buildBuyerHome(rows(), NOW).items).toEqual([]);
  });
});

describe("buildBuyerHome: cohorts", () => {
  const cohortRows = () => {
    const room = course("room", 1, "Cohort Course"), extra = course("x", 5, "Bonus Workshop");
    return withCourses([room, extra], {
      enrolments: [{ id: "en1", offering_id: "co", offerings: offering("co", "live_cohort", "The Cohort") }],
      links: [{ offering_id: "co", course_id: "room" }, { offering_id: "co", course_id: "x" }],
      batches: [{ id: "b1", name: "Batch 25", offering_id: "co" }],
      weeks: [{ id: "w1", cohort_batch_id: "b1", week_number: 1, theme: null, starts_on: "2026-10-30", ends_on: null, assignment_due_at: null, assignment_prompt: null }],
      sessions: [
        session("s-past", "room", NOW - 3 * D, { week_id: "w1", recording_url: "https://rec/past.mp4" }),
        session("s-next", "room", NOW + D, { week_id: "w1" }),
        session("s-other-batch", "room", NOW + 2 * D, { week_id: "w-other" }),
      ],
    });
  };

  it("links the cohort to /cohort/<offering id>, whatever room config exists", () => {
    const home = buildBuyerHome(cohortRows(), NOW);
    const cohort = home.items.find((i): i is CohortItem => i.kind === "cohort")!;
    expect(cohort.roomPath).toBe("/cohort/co");
    expect(sessionPath(cohort)).toBe("/cohort/co");
    expect(cohort.batchName).toBe("Batch 25");
    expect(cohort.sessions.map((s) => s.id)).toEqual(["s-past", "s-next"]);
    expect(home.inCohort).toBe(true);
  });

  it("adds a card for each course with lessons that comes with the cohort, holding none of its classes", () => {
    const home = buildBuyerHome(cohortRows(), NOW);
    expect(home.items[0].kind).toBe("cohort");
    const cards = courseCards(home.items);
    expect(cards.map((c) => [c.courseId, c.kind, c.partOf])).toEqual([["room", "course", "The Cohort"], ["x", "course", "The Cohort"]]);
    expect(cards.map((c) => c.courseTitle)).toEqual(["Cohort Course", "Bonus Workshop"]);
    expect(cards.every((c) => c.sessions.length === 0)).toBe(true);
  });

  it("drops the 'from' label when the course has the offering's own name", () => {
    const own = course("own", 2, "The Cohort");
    const home = buildBuyerHome(withCourses([own], {
      enrolments: [{ id: "en1", offering_id: "co", offerings: offering("co", "live_cohort", "The Cohort") }],
      links: [{ offering_id: "co", course_id: "own" }],
    }), NOW);
    expect(courseCards(home.items).map((c) => [c.courseId, c.partOf])).toEqual([["own", null]]);
  });
});

describe("live sessions on courses that are not cohorts", () => {
  const qaRows = () => {
    const a = course("a", 3, "Masterclass"), qa = course("qa", 0, "Q&A");
    return withCourses([a, qa], {
      enrolments: [{ id: "en1", offering_id: "mc", offerings: offering("mc", "masterclass") }],
      links: [{ offering_id: "mc", course_id: "a" }, { offering_id: "mc", course_id: "qa" }],
      sessions: [
        session("live", "a", NOW - 10 * 60_000),
        session("qa-tomorrow", "qa", NOW + D),
        session("qa-old", "qa", NOW - 90 * D, { recording_url: "https://rec/old.mp4" }),
      ],
    });
  };

  it("puts them on the course's card, or the offering's first card for a course with no lessons", () => {
    const home = buildBuyerHome(qaRows(), NOW);
    const [card] = courseCards(home.items);
    expect(home.items).toHaveLength(1);
    expect(card.sessions.map((s) => s.id)).toEqual(["live", "qa-tomorrow", "qa-old"]);
    expect(sessionWho(card)).toBe("Masterclass");
    expect(sessionPath(card)).toBe("/courses/a");
  });

  it("reaches the agenda and the loud card", () => {
    const home = buildBuyerHome(qaRows(), NOW);
    const loud = pickLoud(home.items, NOW);
    expect(loud?.s.id).toBe("live");
    expect(loud?.state).toBe("live");
    expect(buildAgenda(home.items, NOW, loud).map((r) => r.key)).toEqual(["qa-tomorrow"]);
  });

  it("leaves a cohort's class on the cohort card when another offering holds the same course", () => {
    const shared = course("shared", 2);
    const home = buildBuyerHome(withCourses([shared], {
      enrolments: [
        { id: "en1", offering_id: "mc", offerings: offering("mc", "masterclass") },
        { id: "en2", offering_id: "co", offerings: offering("co", "live_cohort") },
      ],
      links: [{ offering_id: "mc", course_id: "shared" }, { offering_id: "co", course_id: "shared" }],
      sessions: [session("c1", "shared", NOW + D)],
    }), NOW);
    const cohort = home.items.find((i): i is CohortItem => i.kind === "cohort")!;
    expect(cohort.sessions.map((s) => s.id)).toEqual(["c1"]);
    expect(courseCards(home.items).flatMap((c) => c.sessions)).toEqual([]);
    expect(buildAgenda(home.items, NOW, null).map((r) => r.key)).toEqual(["c1"]);
  });
});

describe("pastRecordings", () => {
  it("lists every past class with a recording, newest first, from cohorts and courses", () => {
    const room = course("room", 0), a = course("a", 2);
    const home = buildBuyerHome(withCourses([room, a], {
      enrolments: [
        { id: "en1", offering_id: "co", offerings: offering("co", "live_cohort") },
        { id: "en2", offering_id: "mc", offerings: offering("mc", "masterclass") },
      ],
      links: [{ offering_id: "co", course_id: "room" }, { offering_id: "mc", course_id: "a" }],
      sessions: [
        session("old", "room", NOW - 120 * D, { recording_url: "https://rec/old" }),
        session("recent", "room", NOW - 2 * D, { recording_url: " https://rec/recent " }),
        session("qa", "a", NOW - 40 * D, { recording_url: "http://rec/qa" }),
        session("no-rec", "room", NOW - D),
        session("bad-url", "room", NOW - D, { recording_url: "javascript:alert(1)" }),
        session("future", "room", NOW + D, { recording_url: "https://rec/future" }),
      ],
    }), NOW);
    const recs = pastRecordings(home.items, NOW);
    expect(recs.map((r) => r.key)).toEqual(["recent", "qa", "old"]);
    expect(recs[0].href).toBe("https://rec/recent");
    expect(recs.map((r) => r.item.kind)).toEqual(["cohort", "masterclass", "cohort"]);
  });

  it("counts a class marked completed as past", () => {
    const room = course("room", 0);
    const home = buildBuyerHome(withCourses([room], {
      enrolments: [{ id: "en1", offering_id: "co", offerings: offering("co", "live_cohort") }],
      links: [{ offering_id: "co", course_id: "room" }],
      sessions: [session("early", "room", NOW + H, { status: "completed", recording_url: "https://rec/early" })],
    }), NOW);
    expect(pastRecordings(home.items, NOW).map((r) => r.key)).toEqual(["early"]);
  });
});

describe("recordingHref", () => {
  it("opens only http(s) links", () => {
    expect(recordingHref("https://a.b/c")).toBe("https://a.b/c");
    expect(recordingHref("HTTP://a.b")).toBe("HTTP://a.b");
    expect(recordingHref("javascript:alert(1)")).toBeNull();
    expect(recordingHref("  ")).toBeNull();
    expect(recordingHref(null)).toBeNull();
  });
});

describe("fetchBuyer", () => {
  beforeEach(() => {
    db.calls.length = 0;
    for (const k of Object.keys(db.responses)) delete db.responses[k];
  });

  it("throws when a read fails, instead of answering with no cards", async () => {
    db.responses.enrolments = { data: [{ id: "en1", offering_id: "mc", offerings: offering("mc", "masterclass") }], error: null };
    db.responses.offering_courses = { data: null, error: { message: "network down" } };
    await expect(fetchBuyer("u1")).rejects.toEqual({ message: "network down" });
  });

  it("throws when a later read fails", async () => {
    db.responses.enrolments = { data: [{ id: "en1", offering_id: "mc", offerings: offering("mc", "masterclass") }], error: null };
    db.responses.offering_courses = { data: [{ offering_id: "mc", course_id: "a" }], error: null };
    db.responses.live_sessions = { data: null, error: { message: "timeout" } };
    await expect(fetchBuyer("u1")).rejects.toEqual({ message: "timeout" });
  });

  it("builds the cards from the reads and never asks for room configs", async () => {
    const a = course("a", 2);
    db.responses.enrolments = { data: [{ id: "en1", offering_id: "mc", offerings: offering("mc", "masterclass") }], error: null };
    db.responses.offering_courses = { data: [{ offering_id: "mc", course_id: "a" }], error: null };
    db.responses.courses = { data: [a.course], error: null };
    db.responses.sections = { data: [a.section], error: null };
    db.responses.chapters = { data: a.chapters, error: null };
    const home = await fetchBuyer("u1");
    expect(courseCards(home.items).map((c) => [c.courseId, c.total])).toEqual([["a", 2]]);
    expect(db.calls).not.toContain("cohort_room_configs");
  });
});
