import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { WeekSummary } from "../yourWeekDerive";

/**
 * Render coverage for the Your Week strip (AC#6). yourWeekDerive.test.ts already
 * proves the pure enrolled-user math across every branch; this file proves the
 * OTHER half — that YourWeek actually wires that derived summary onto the screen:
 * the ProgressRing shows the right %, the lessons-completed CountUp number is
 * present, and a zero-enrolment (null) derivation renders nothing at all.
 *
 * We mock at the two data boundaries so there is no live DB and no dependence on
 * the derivation internals:
 *   - `deriveWeekSummary` is stubbed to return a fixed WeekSummary (or null),
 *     which is the exact value the component branches on.
 *   - the Supabase client is a chainable stub returning non-empty rows, so the
 *     load effect walks past every early `return` and reaches the derive call.
 */

// Mock the derivation — the component consumes its return value verbatim, so a
// stub here lets each test dictate exactly what YourWeek should render.
const deriveWeekSummary = vi.fn();
vi.mock("../yourWeekDerive", () => ({
  deriveWeekSummary: (...args: unknown[]) => deriveWeekSummary(...args),
}));

// Signed-in user so the effect doesn't bail at `if (!user) return`.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

// After the P6-T1 migration YourWeek reads the shared enrolment tree via
// `useEnrolledProgress` (react-query) instead of hitting Supabase directly. Stub
// the hook to hand back a NON-NULL tree so `summary = tree ? deriveWeekSummary()`
// runs and reaches the (separately stubbed) derivation. The tree's row contents
// don't matter here — deriveWeekSummary is mocked — only that it's truthy and
// not loading.
vi.mock("@/hooks/useEnrolledProgress", () => ({
  useEnrolledProgress: () => ({
    data: {
      hasEnrolments: true,
      courseIds: ["course-1"],
      offeringCourses: [{ offering_id: "off-1", course_id: "course-1" }],
      courses: [],
      sections: [],
      chapters: [],
      progress: [],
    },
    isLoading: false,
  }),
}));

// Imported AFTER the mocks are registered.
import YourWeek from "../YourWeek";

const renderYourWeek = () =>
  render(
    <MemoryRouter>
      <YourWeek />
    </MemoryRouter>,
  );

const inProgressSummary: WeekSummary = {
  topPct: 50,
  lessonsDone: 7,
  nextLessonNumber: 2,
  topTotal: 2,
  allComplete: false,
  resumeTo: "/chapters/ch-b2",
  consecutiveActiveWeeks: 0,
};

beforeEach(() => {
  deriveWeekSummary.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("YourWeek — enrolled render (AC#6)", () => {
  it("renders the ProgressRing at the derived percentage", async () => {
    deriveWeekSummary.mockReturnValue(inProgressSummary);
    renderYourWeek();

    // The ring exposes its target completion immediately via aria-label (the
    // visible % text animates, but the label is the stable, asserted contract).
    const ring = await screen.findByRole("img", { name: "50% complete" });
    expect(ring).toBeInTheDocument();
  });

  it("renders the lessons-completed CountUp number and label", async () => {
    deriveWeekSummary.mockReturnValue(inProgressSummary);
    renderYourWeek();

    // CountUp animates 0 → value; assert the final number is present once settled.
    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });
    expect(screen.getByText(/lessons completed/i)).toBeInTheDocument();
  });

  it("links to the resume target and shows the Resume affordance", async () => {
    deriveWeekSummary.mockReturnValue(inProgressSummary);
    renderYourWeek();

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "/chapters/ch-b2");
    expect(screen.getByText("Resume")).toBeInTheDocument();
    // Lesson N of N affordance derived from the summary.
    expect(screen.getByText("Lesson 2 of 2")).toBeInTheDocument();
  });

  it("keeps the Resume card keyboard-reachable (tabIndex must not resolve to -1)", async () => {
    deriveWeekSummary.mockReturnValue(inProgressSummary);
    renderYourWeek();

    // MotionCard without onClick resolves tabIndex=-1 and Slot merges it onto
    // the anchor, silently dropping the highest-intent CTA from the tab order.
    // The explicit tabIndex={0} in YourWeek.tsx is the guard; pin it here.
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("tabindex", "0");
  });

  it("shows the review affordance and course-level link when all complete", async () => {
    deriveWeekSummary.mockReturnValue({
      topPct: 100,
      lessonsDone: 3,
      nextLessonNumber: 3,
      topTotal: 3,
      allComplete: true,
      resumeTo: "/courses/course-a",
      consecutiveActiveWeeks: 0,
    } satisfies WeekSummary);
    renderYourWeek();

    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "/courses/course-a");
    expect(await screen.findByRole("img", { name: "100% complete" })).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Course complete · Review")).toBeInTheDocument();
  });

  it("uses the singular 'lesson' label when exactly one is done", async () => {
    deriveWeekSummary.mockReturnValue({ ...inProgressSummary, lessonsDone: 1 });
    renderYourWeek();

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
    expect(screen.getByText(/lesson completed/i)).toBeInTheDocument();
    expect(screen.queryByText(/lessons completed/i)).not.toBeInTheDocument();
  });
});

describe("YourWeek — zero enrolments render null (AC#6)", () => {
  it("renders nothing when the derivation returns null", async () => {
    deriveWeekSummary.mockReturnValue(null);
    const { container } = renderYourWeek();

    // The effect runs and derives null → the guard `if (!summary) return null`
    // means no ring, no link, no strip at all.
    await waitFor(() => {
      expect(deriveWeekSummary).toHaveBeenCalled();
    });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Weekly consistency (P4-T7) — derivation unit tests.
 *
 * The module-level `vi.mock("../yourWeekDerive")` above stubs deriveWeekSummary
 * for the render tests; here we reach past that mock via `vi.importActual` to
 * exercise the REAL pure `deriveConsecutiveActiveWeeks` against timestamp
 * fixtures with a pinned clock, so the Mon-start / grace / gap-reset rules are
 * proven without a live DB (spec: "unit tests on the derivation").
 *
 * Clock is pinned to Wed 2026-07-08 (local noon). Its Monday-start week is
 * 2026-07-06; the preceding weeks start 2026-06-29 and 2026-06-22.
 */
describe("deriveConsecutiveActiveWeeks — weekly consistency derivation (P4-T7)", () => {
  let deriveConsecutiveActiveWeeks: typeof import("../yourWeekDerive").deriveConsecutiveActiveWeeks;

  beforeAll(async () => {
    ({ deriveConsecutiveActiveWeeks } = await vi.importActual<
      typeof import("../yourWeekDerive")
    >("../yourWeekDerive"));
  });

  // Wednesday, local noon — noon keeps the local calendar date stable across any
  // realistic tz offset, so the fixtures land in the intended Mon-start weeks.
  const now = new Date(2026, 6, 8, 12, 0, 0);

  // A completed-lesson row on the given local date (noon). Only completed_at
  // matters to the derivation; the other columns are filled to satisfy the type.
  const done = (y: number, m: number, d: number) => ({
    chapter_id: `ch-${y}-${m}-${d}`,
    course_id: "course-1",
    completed_at: new Date(y, m, d, 12, 0, 0).toISOString(),
    updated_at: null,
  });

  it("returns 0 for no progress at all", () => {
    expect(deriveConsecutiveActiveWeeks([], now)).toBe(0);
    expect(deriveConsecutiveActiveWeeks(null, now)).toBe(0);
    expect(deriveConsecutiveActiveWeeks(undefined, now)).toBe(0);
  });

  it("ignores rows with no completed_at (an opened-but-unfinished lesson is not an active week)", () => {
    const opened = { chapter_id: "ch-x", course_id: "course-1", completed_at: null, updated_at: now.toISOString() };
    expect(deriveConsecutiveActiveWeeks([opened], now)).toBe(0);
  });

  it("counts a single active current week as 1", () => {
    expect(deriveConsecutiveActiveWeeks([done(2026, 6, 8)], now)).toBe(1);
  });

  it("counts three consecutive active weeks back from the current week", () => {
    const rows = [
      done(2026, 6, 8), // current week (Jul 6–12)
      done(2026, 5, 30), // prev week (Jun 29–Jul 5)
      done(2026, 5, 24), // prev-prev week (Jun 22–28)
    ];
    expect(deriveConsecutiveActiveWeeks(rows, now)).toBe(3);
  });

  it("dedupes multiple completions within the same week (still counts as one active week)", () => {
    const rows = [done(2026, 6, 6), done(2026, 6, 8), done(2026, 6, 10)]; // all current week
    expect(deriveConsecutiveActiveWeeks(rows, now)).toBe(1);
  });

  it("resets to the current run on a gap — a hole between active weeks stops the count", () => {
    const rows = [
      done(2026, 6, 8), // current week active
      // prev week (Jun 29–Jul 5) has NO completion → gap
      done(2026, 5, 24), // older active week does not extend the run
    ];
    expect(deriveConsecutiveActiveWeeks(rows, now)).toBe(1);
  });

  it("applies the one-week grace: an unopened current week anchors on the previous active week", () => {
    const rows = [
      // no current-week (Jul 6–12) completion
      done(2026, 5, 30), // prev week (Jun 29–Jul 5)
      done(2026, 5, 24), // prev-prev week (Jun 22–28)
    ];
    // Anchor slides back one week; both weeks are active → 2.
    expect(deriveConsecutiveActiveWeeks(rows, now)).toBe(2);
  });

  it("returns 0 for a stale streak (neither the current nor the previous week is active)", () => {
    const rows = [done(2026, 5, 24)]; // only an old week, two+ weeks ago
    expect(deriveConsecutiveActiveWeeks(rows, now)).toBe(0);
  });
});

/**
 * Weekly consistency (P4-T7) — flag gating (AC#7).
 *
 * The line is a Rahul-decision not yet granted: it must NOT render in any
 * default build and only appears under VITE_FEATURE_WEEKLY_CONSISTENCY=true.
 * These stay in this file (render half) alongside the derivation tests.
 */
describe("YourWeek — weekly consistency flag gating (P4-T7 / AC#7)", () => {
  const streakSummary: WeekSummary = { ...inProgressSummary, consecutiveActiveWeeks: 4 };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does NOT render the consistency line by default (flag off)", async () => {
    deriveWeekSummary.mockReturnValue(streakSummary);
    renderYourWeek();

    // Wait until the strip is on screen, then assert the line is absent.
    await screen.findByRole("link");
    expect(screen.queryByText(/weeks of showing up/i)).not.toBeInTheDocument();
  });

  it("renders the serif-italic consistency line for n≥2 when the flag is on", async () => {
    vi.stubEnv("VITE_FEATURE_WEEKLY_CONSISTENCY", "true");
    deriveWeekSummary.mockReturnValue(streakSummary);
    renderYourWeek();

    expect(await screen.findByText("4 weeks of showing up")).toBeInTheDocument();
  });

  it("stays hidden for n<2 even when the flag is on (no guilt/zero state, ever)", async () => {
    vi.stubEnv("VITE_FEATURE_WEEKLY_CONSISTENCY", "true");
    deriveWeekSummary.mockReturnValue({ ...inProgressSummary, consecutiveActiveWeeks: 1 });
    renderYourWeek();

    await screen.findByRole("link");
    expect(screen.queryByText(/weeks of showing up/i)).not.toBeInTheDocument();
  });
});
