import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import SessionSlot from "@/components/room/SessionSlot";
import RoomClockProvider from "@/components/room/RoomClockProvider";
import type { RoomSession } from "@/hooks/useCohortRooms";

/**
 * R2-T2 — the doors-open choreography, walked on a mocked clock.
 *
 * The four things this file is here to prove, because each of them fails
 * silently in production:
 *   · ONE session reaches all SIX states as the clock moves, and the copy for
 *     each is the copy the brief promised;
 *   · a null `zoom_link` (the SERVER gate, not a client guess) renders a
 *     sentence, never a button that goes nowhere;
 *   · the room runs exactly ONE interval however many slots are on screen, it
 *     runs at 1s only inside T-60, and it stops entirely when the document is
 *     hidden;
 *   · the countdown cannot drift, because it re-reads the clock instead of
 *     counting down — proven by feeding it LATE ticks for ten minutes.
 */

const tapTick = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const addToCalendar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/haptics", () => ({ tapTick }));
vi.mock("@/lib/calendar", () => ({ addToCalendar }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/** 8:00 PM IST on 14 Aug 2026, running 90 minutes (so it ends at 21:30 IST). */
const STARTS_AT = "2026-08-14T20:00:00+05:30";

const session = (overrides: Partial<RoomSession> = {}): RoomSession => ({
  id: "session-1",
  title: "The edit",
  scheduled_at: STARTS_AT,
  duration_minutes: 90,
  status: "scheduled",
  session_type: "live",
  zoom_link: null,
  recording_url: null,
  ...overrides,
});

const renderSlot = (props: Partial<ComponentProps<typeof SessionSlot>> = {}) =>
  render(
    <MemoryRouter>
      <RoomClockProvider>
        <SessionSlot session={session()} {...props} />
      </RoomClockProvider>
    </MemoryRouter>,
  );

/** Move the wall clock to `iso`, then let the room's timer notice. */
const moveClockTo = async (iso: string) => {
  await act(async () => {
    vi.setSystemTime(new Date(iso));
    // One slow tick is enough for any state change; inside T-60 the clock is on
    // 1s, so this fires it sixty times, which is exactly what the room does.
    vi.advanceTimersByTime(60_000);
  });
};

const slot = () => screen.getByRole("article");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-11T20:00:00+05:30"));
  tapTick.mockClear();
  addToCalendar.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ── The six states, one session ──────────────────────────────────────────── */

describe("SessionSlot — the six-state walk", () => {
  it("carries one session from scheduled through to recorded", async () => {
    const { rerender } = renderSlot({ calendarNote: "Filmmaking cohort" });

    // 1 · scheduled — three days out: a date and a way to keep it.
    expect(slot()).toHaveAttribute("data-session-state", "scheduled");
    expect(screen.getByRole("button", { name: /add to calendar/i })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    // IST, whatever the device is set to.
    expect(slot().textContent).toContain("8:00 PM IST");

    // 2 · tonight — six hours out, same IST day.
    await moveClockTo("2026-08-14T14:00:00+05:30");
    expect(slot()).toHaveAttribute("data-session-state", "tonight");
    expect(screen.getByRole("button", { name: /add to calendar/i })).toBeInTheDocument();

    // 3 · soon — inside T-60: the countdown, to the second.
    await moveClockTo("2026-08-14T19:29:00+05:30");
    expect(slot()).toHaveAttribute("data-session-state", "soon");
    expect(screen.getByRole("timer")).toHaveTextContent("30:00");
    expect(screen.queryByRole("button", { name: /add to calendar/i })).not.toBeInTheDocument();

    // 4 · live — crimson, and the countdown is gone.
    await moveClockTo("2026-08-14T20:05:00+05:30");
    expect(slot()).toHaveAttribute("data-session-state", "live");
    expect(screen.getByLabelText("Live now")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();

    // 5 · ended — the quiet promise the notification email already made.
    await moveClockTo("2026-08-14T21:35:00+05:30");
    expect(slot()).toHaveAttribute("data-session-state", "ended");
    expect(screen.getByText("Recording lands within 24 hours.")).toBeInTheDocument();

    // 6 · recorded — the recording lands and the slot hands off to the shelf.
    rerender(
      <MemoryRouter>
        <RoomClockProvider>
          <SessionSlot
            session={session({ recording_url: "https://vimeo.com/1" })}
            recordingHref="screenings"
          />
        </RoomClockProvider>
      </MemoryRouter>,
    );
    expect(slot()).toHaveAttribute("data-session-state", "recorded");
    expect(screen.getByRole("link", { name: /watch the recording/i })).toBeInTheDocument();
  });

  it("renders the recorded state without a link when the shelf route is not supplied", async () => {
    renderSlot({ session: session({ recording_url: "https://vimeo.com/1" }) });
    await moveClockTo("2026-08-15T10:00:00+05:30");

    expect(slot()).toHaveAttribute("data-session-state", "recorded");
    expect(screen.getByText("The recording is on the shelf.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

/* ── The server gate, and what a slot renders in its shadow ───────────────── */

describe("SessionSlot — the join link", () => {
  it("says where the link will appear instead of rendering a dead button at T-30", async () => {
    renderSlot();
    await moveClockTo("2026-08-14T19:30:00+05:30");

    expect(slot()).toHaveAttribute("data-session-state", "soon");
    expect(screen.getByText("Link drops here 1 hour before.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /join/i })).not.toBeInTheDocument();
  });

  it("opens the champagne Join once the server hands the link over, and taps", async () => {
    renderSlot({ session: session({ zoom_link: "https://zoom.us/j/123" }) });
    await moveClockTo("2026-08-14T19:30:00+05:30");

    const join = screen.getByRole("link", { name: /join/i });
    expect(join).toHaveAttribute("href", "https://zoom.us/j/123");
    expect(join).toHaveAttribute("target", "_blank");
    expect(join).toHaveAttribute("rel", "noopener noreferrer");
    // The one champagne moment on the screen.
    expect(join.className).toContain("btn-champagne");

    fireEvent.click(join);
    expect(tapTick).toHaveBeenCalledTimes(1);
  });

  it("declines to render a non-http join link at all", async () => {
    renderSlot({ session: session({ zoom_link: "javascript:alert(1)" }) });
    await moveClockTo("2026-08-14T20:05:00+05:30");

    expect(slot()).toHaveAttribute("data-session-state", "live");
    expect(screen.getByText("The join link is not up yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the champagne singular when a caller opts a second slot out", async () => {
    renderSlot({ session: session({ zoom_link: "https://zoom.us/j/123" }), champagne: false });
    await moveClockTo("2026-08-14T19:30:00+05:30");

    expect(screen.getByRole("link", { name: /join/i }).className).not.toContain("btn-champagne");
  });
});

/* ── Cancelled ────────────────────────────────────────────────────────────── */

describe("SessionSlot — a cancelled session", () => {
  it("strikes the title and runs no countdown, even inside T-60", async () => {
    renderSlot({
      session: session({ status: "cancelled", zoom_link: "https://zoom.us/j/123" }),
    });
    await moveClockTo("2026-08-14T19:30:00+05:30");

    expect(slot()).toHaveAttribute("data-session-state", "cancelled");
    expect(screen.getByRole("heading", { name: "The edit" }).className).toContain("line-through");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /join/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add to calendar/i })).not.toBeInTheDocument();
  });
});

/* ── Add to calendar ──────────────────────────────────────────────────────── */

describe("SessionSlot — add to calendar", () => {
  it("hands the session straight to the shipped calendar builder", () => {
    renderSlot({ calendarNote: "Filmmaking cohort" });

    fireEvent.click(screen.getByRole("button", { name: /add to calendar/i }));

    expect(addToCalendar).toHaveBeenCalledWith(
      "The edit",
      STARTS_AT,
      90,
      null,
      "Filmmaking cohort",
    );
    expect(tapTick).toHaveBeenCalledTimes(1);
  });
});

/* ── One interval per room ────────────────────────────────────────────────── */

describe("RoomClockProvider — one timer for the whole room", () => {
  const threeSlots = (
    <MemoryRouter>
      <RoomClockProvider>
        <SessionSlot session={session({ id: "a" })} />
        <SessionSlot session={session({ id: "b" })} />
        <SessionSlot session={session({ id: "c" })} />
      </RoomClockProvider>
    </MemoryRouter>
  );

  it("runs exactly one interval for three slots, in both cadences", async () => {
    const setInterval = vi.spyOn(window, "setInterval");
    render(threeSlots);

    // Three slots, one timer — and the resting cadence is a minute.
    expect(vi.getTimerCount()).toBe(1);
    expect(setInterval).toHaveBeenCalledTimes(1);
    expect(setInterval.mock.calls[0][1]).toBe(60_000);

    // Inside T-60 the SAME single timer speeds up to 1s.
    await act(async () => {
      vi.setSystemTime(new Date("2026-08-14T19:30:00+05:30"));
      vi.advanceTimersByTime(60_000);
    });
    expect(vi.getTimerCount()).toBe(1);
    expect(setInterval.mock.calls[setInterval.mock.calls.length - 1][1]).toBe(1_000);

    // And gives the second back once the doors are open.
    await act(async () => {
      vi.setSystemTime(new Date("2026-08-14T20:05:00+05:30"));
      vi.advanceTimersByTime(1_000);
    });
    expect(vi.getTimerCount()).toBe(1);
    expect(setInterval.mock.calls[setInterval.mock.calls.length - 1][1]).toBe(60_000);

    setInterval.mockRestore();
  });

  it("stops ticking entirely while the document is hidden, and catches up on return", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    render(threeSlots);

    await act(async () => {
      vi.setSystemTime(new Date("2026-08-14T19:29:00+05:30"));
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getAllByRole("timer")[0]).toHaveTextContent("30:00");

    // Backgrounded: no interval at all. A 1s tick in a hidden Android WebView is
    // battery the student did not agree to spend.
    await act(async () => {
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(vi.getTimerCount()).toBe(0);

    // Ten minutes pass with the app in the background and nothing ticking.
    await act(async () => {
      vi.setSystemTime(new Date("2026-08-14T19:40:00+05:30"));
    });
    expect(screen.getAllByRole("timer")[0]).toHaveTextContent("30:00");

    // Back to the foreground: correct on the FIRST frame, not one tick later.
    await act(async () => {
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getAllByRole("timer")[0]).toHaveTextContent("20:00");
    expect(vi.getTimerCount()).toBe(1);

    visibility.mockRestore();
  });

  it("tears the timer down when the room unmounts", () => {
    const { unmount } = render(threeSlots);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

/* ── Drift ────────────────────────────────────────────────────────────────── */

describe("DoorsOpenCountdown — drift", () => {
  it("stays exact over ten minutes of LATE ticks", async () => {
    renderSlot();
    await moveClockTo("2026-08-14T19:29:00+05:30");
    expect(screen.getByRole("timer")).toHaveTextContent("30:00");

    // 400 ticks that each arrive 500ms late: ten minutes of wall clock, and a
    // counter that DECREMENTED would now be 200 seconds wrong.
    await act(async () => {
      for (let i = 0; i < 400; i += 1) vi.advanceTimersByTime(1_500);
    });

    // 19:40 IST → exactly twenty minutes left. Drift: zero.
    expect(screen.getByRole("timer")).toHaveTextContent("20:00");
    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "Doors open in 20 minutes 0 seconds",
    );
  });
});
