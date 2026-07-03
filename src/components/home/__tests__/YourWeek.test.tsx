import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

// Chainable Supabase stub. Every builder method returns `this`; the object is
// awaitable (thenable) and resolves to one non-empty row so none of the
// `if (!data?.length) return` guards short-circuit before deriveWeekSummary runs.
vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = () => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order"]) {
      query[method] = vi.fn(() => query);
    }
    // Thenable: `await supabase.from(...).select(...)....` resolves here.
    query.then = (resolve: (value: { data: unknown[] }) => unknown) =>
      resolve({ data: [{ id: "row-1", offering_id: "off-1", course_id: "course-1" }] });
    return query;
  };
  return { supabase: { from: vi.fn(() => makeQuery()) } };
});

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

  it("shows the review affordance and course-level link when all complete", async () => {
    deriveWeekSummary.mockReturnValue({
      topPct: 100,
      lessonsDone: 3,
      nextLessonNumber: 3,
      topTotal: 3,
      allComplete: true,
      resumeTo: "/courses/course-a",
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
