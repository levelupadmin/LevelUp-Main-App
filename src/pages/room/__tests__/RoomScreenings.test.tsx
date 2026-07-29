import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * R2-T3 — the Screening Shelf.
 *
 * The one acceptance that cannot be claimed by inspection is RESUME: a position
 * that survives an app restart. So the centre of this file is a simulated
 * restart — play, tick, flush, UNMOUNT, then remount against the envelope the
 * server would now return — asserted on the embed's own start offset, which is
 * the only thing that actually resumes playback.
 *
 * The other half of the shelf is deliberately proved NOT to resume: a link-out
 * cannot report a position, so its row records `completed` on open, shows no
 * resume bar, and never reaches the Continue watching rail.
 *
 * Everything is mocked at the two boundaries this page has — the shell's outlet
 * context (the envelope) and the Supabase write — so there is no live DB and no
 * second query anywhere in the page.
 */

/* ── The shell's outlet context ─────────────────────────────────────────── */

interface TestSession {
  id: string;
  title: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status?: string | null;
  week_id?: string | null;
  recording_url?: string | null;
  my_position?: number | null;
}

const outlet = {
  room: { offering_id: "off-1", offering_title: "The Season", total_weeks: 3, phase: "live" },
  envelope: {
    offering_id: "off-1",
    access: "member",
    config: { phase: "live", modules: {} as Record<string, boolean> },
    sessions: [] as TestSession[],
    announcements: [],
    roster_count: 4,
  },
};

vi.mock("@/hooks/useCohortRooms", () => ({
  useRoomOutlet: () => outlet,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/haptics", () => ({
  tapTick: vi.fn(() => Promise.resolve()),
}));

/* ── The one server call this page makes ────────────────────────────────── */

const upsert = vi.fn(() => Promise.resolve({ error: null }));
const from = vi.fn(() => ({ upsert }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => from(table) },
}));

// Imported AFTER the mocks are registered.
import RoomScreenings, {
  clockLabel,
  deriveWeekNumbers,
  watchedPct,
  RESUME_MAX_PCT,
  RESUME_MIN_PCT,
} from "../RoomScreenings";
import { embedSrc, parseEmbeddableRecording } from "@/components/room/RecordingPlayer";

/* ── Fixtures ───────────────────────────────────────────────────────────── */

/** A YouTube URL — the embeddable path, the only one that can resume. */
const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
/** A Zoom share link — the link-out path. Nothing here can report a position. */
const ZOOM_URL = "https://zoom.us/rec/share/abc123";

/** 60-minute session, 12:30 in. 750 / 3600 = 20.83%. */
const EMBED_SESSION: TestSession = {
  id: "sess-embed",
  title: "The cut that carries",
  scheduled_at: "2026-06-01T14:30:00.000Z",
  duration_minutes: 60,
  status: "completed",
  week_id: "week-1",
  recording_url: YOUTUBE_URL,
  my_position: 750,
};

const LINK_SESSION: TestSession = {
  id: "sess-link",
  title: "Sound, and the room it happens in",
  scheduled_at: "2026-06-08T14:30:00.000Z",
  duration_minutes: 90,
  status: "completed",
  week_id: "week-2",
  recording_url: ZOOM_URL,
  my_position: null,
};

/** No recording — this one must never reach the shelf. */
const UPCOMING_SESSION: TestSession = {
  id: "sess-upcoming",
  title: "Demo day",
  scheduled_at: "2026-06-15T14:30:00.000Z",
  duration_minutes: 60,
  status: "scheduled",
  week_id: "week-3",
  recording_url: null,
  my_position: null,
};

function setEnvelope(
  sessions: TestSession[],
  options: { phase?: string; modules?: Record<string, boolean>; totalWeeks?: number } = {},
) {
  outlet.envelope.sessions = sessions;
  outlet.envelope.config = {
    phase: options.phase ?? "live",
    modules: options.modules ?? {},
  };
  outlet.room.phase = options.phase ?? "live";
  outlet.room.total_weeks = options.totalWeeks ?? 3;
}

const renderShelf = () =>
  render(
    <MemoryRouter>
      <RoomScreenings />
    </MemoryRouter>,
  );

/** The row element for a session, so assertions never cross rows. */
const rowFor = (container: HTMLElement, sessionId: string) =>
  container.querySelector<HTMLElement>(`[data-session-id="${sessionId}"]`) as HTMLElement;

/** How full a row's hairline is drawn, as a percentage. */
const hairlinePct = (container: HTMLElement, sessionId: string) =>
  Number(
    rowFor(container, sessionId)
      .querySelector('[data-testid="recording-hairline"]')
      ?.getAttribute("data-fill-pct"),
  );

/**
 * A YouTube `infoDelivery` frame, as the real player posts it: a JSON STRING,
 * sourced from the embed's own window. `event.source` identity is the player's
 * whole trust check, so the fixture has to satisfy it honestly.
 */
function postPlayerTick(frame: HTMLIFrameElement, currentTime: number, duration: number) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame.contentWindow,
        data: JSON.stringify({
          event: "infoDelivery",
          id: 1,
          channel: "widget",
          info: { currentTime, duration, playerState: 1 },
        }),
      }),
    );
  });
}

/** The app going to the background — what forces the buffered write out. */
const backgroundApp = () => {
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
};

beforeEach(() => {
  upsert.mockClear();
  from.mockClear();
  // This jsdom environment provides no Storage at all, which is itself the
  // WebView-in-private-mode case: the page must open regardless, and the
  // measured-length cache falls back to the scheduled duration.
  globalThis.localStorage?.clear();
  setEnvelope([EMBED_SESSION, LINK_SESSION, UPCOMING_SESSION]);
});

afterEach(() => {
  cleanup();
});

/* ────────────────────────────────────────────────────────────────────────── */

describe("RoomScreenings — the shelf", () => {
  it("renders one row per recording, newest first, and nothing for a session without one", () => {
    const { container } = renderShelf();

    const rows = container.querySelectorAll("[data-session-id]");
    expect(rows).toHaveLength(2);
    // Newest first: week 2's recording sits above week 1's.
    expect(rows[0].getAttribute("data-session-id")).toBe("sess-link");
    expect(rows[1].getAttribute("data-session-id")).toBe("sess-embed");

    expect(screen.queryByText("Demo day")).not.toBeInTheDocument();
    // Twice: once on the shelf, once on the Continue watching rail above it.
    expect(screen.getAllByText("The cut that carries")).toHaveLength(2);
  });

  it("labels each row with its week eyebrow and duration", () => {
    const { container } = renderShelf();

    const embedRow = within(rowFor(container, "sess-embed"));
    expect(embedRow.getByText("Week 01")).toBeInTheDocument();
    expect(embedRow.getByText("1h")).toBeInTheDocument();

    const linkRow = within(rowFor(container, "sess-link"));
    expect(linkRow.getByText("Week 02")).toBeInTheDocument();
    expect(linkRow.getByText("1h 30m")).toBeInTheDocument();
  });

  it("falls back to the session date when the week numbering cannot be trusted", () => {
    // Four weeks in the season but only three hold a session: a break week would
    // shift every derived number, so no week number is claimed at all.
    setEnvelope([EMBED_SESSION, LINK_SESSION, UPCOMING_SESSION], { totalWeeks: 4 });
    const { container } = renderShelf();

    expect(within(rowFor(container, "sess-embed")).queryByText("Week 01")).toBeNull();
    // 1 June 2026 in IST — the calendar the room is written in.
    expect(within(rowFor(container, "sess-embed")).getByText(/1 Jun/)).toBeInTheDocument();
  });

  it("shows the serif empty state when nothing has been recorded yet", () => {
    setEnvelope([UPCOMING_SESSION]);
    const { container } = renderShelf();

    expect(screen.getByText("Recordings land here after each session.")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-session-id]")).toHaveLength(0);
  });

  it("stays fully available in the alumni phase (R-D7)", () => {
    setEnvelope([EMBED_SESSION, LINK_SESSION, UPCOMING_SESSION], { phase: "alumni" });
    const { container } = renderShelf();

    expect(container.querySelectorAll("[data-session-id]")).toHaveLength(2);
    expect(screen.getByText("Continue watching")).toBeInTheDocument();
  });

  it("renders nothing but a way back when the cohort has the module off", () => {
    setEnvelope([EMBED_SESSION], { modules: { recordings: false } });
    const { container } = renderShelf();

    expect(screen.getByText(/doesn't use screenings/i)).toBeInTheDocument();
    expect(container.querySelectorAll("[data-session-id]")).toHaveLength(0);
  });
});

describe("RoomScreenings — the hairline", () => {
  it("draws the watched fraction within ±5% of the true position", () => {
    const { container } = renderShelf();

    // 750s of a 3600s recording = 20.83%.
    expect(Math.abs(hairlinePct(container, "sess-embed") - 20.83)).toBeLessThanOrEqual(5);
  });

  it("leaves a link-out's hairline empty — it has no position to report", () => {
    const { container } = renderShelf();

    expect(hairlinePct(container, "sess-link")).toBe(0);
    expect(within(rowFor(container, "sess-link")).queryByText(/Resume at/)).toBeNull();
  });

  it("re-draws against the length the player reports, not the length that was scheduled", () => {
    // A 60-minute slot that produced a 25-minute file: 750s is half of it, not a fifth.
    const { container } = renderShelf();

    fireEvent.click(within(rowFor(container, "sess-embed")).getByRole("button"));
    const frame = rowFor(container, "sess-embed").querySelector("iframe") as HTMLIFrameElement;
    postPlayerTick(frame, 750, 1500);

    expect(Math.abs(hairlinePct(container, "sess-embed") - 50)).toBeLessThanOrEqual(5);
  });
});

describe("RoomScreenings — Continue watching", () => {
  it("lifts a part-watched recording onto the rail with its resume point", () => {
    renderShelf();

    expect(screen.getByText("Continue watching")).toBeInTheDocument();
    expect(screen.getAllByText("Resume at 12:30").length).toBeGreaterThan(0);
  });

  it("drops a recording that is under 5% or over 95% watched", () => {
    setEnvelope([{ ...EMBED_SESSION, my_position: 30 }, LINK_SESSION]);
    const { rerender } = renderShelf();
    expect(screen.queryByText("Continue watching")).toBeNull();

    setEnvelope([{ ...EMBED_SESSION, my_position: 3540 }, LINK_SESSION]);
    rerender(
      <MemoryRouter>
        <RoomScreenings />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Continue watching")).toBeNull();
    expect(screen.getByText("Watched")).toBeInTheDocument();
  });
});

describe("RoomScreenings — the link-out path", () => {
  it("opens in a new tab and records completed, with no resume bar", () => {
    const { container } = renderShelf();

    const link = within(rowFor(container, "sess-link")).getByRole("link");
    expect(link).toHaveAttribute("href", ZOOM_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.click(link);
    backgroundApp();

    expect(from).toHaveBeenCalledWith("cohort_recording_progress");
    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = upsert.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
      { onConflict: string },
    ];
    expect(options).toEqual({ onConflict: "user_id,live_session_id" });
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      live_session_id: "sess-link",
      position_seconds: 0,
      completed: true,
    });

    // Marked as opened, never as resumable.
    expect(within(rowFor(container, "sess-link")).getByText("Opened")).toBeInTheDocument();
    expect(hairlinePct(container, "sess-link")).toBe(0);
  });

  it("never mounts a player for a URL it cannot embed", () => {
    const { container } = renderShelf();
    fireEvent.click(within(rowFor(container, "sess-link")).getByRole("link"));

    expect(container.querySelectorAll("iframe")).toHaveLength(0);
  });
});

describe("RoomScreenings — a position that survives a restart", () => {
  it("plays from the saved position, writes the new one, and resumes there after a remount", () => {
    const first = renderShelf();

    // ── Open the embeddable row. It resumes from the envelope's saved position.
    fireEvent.click(within(rowFor(first.container, "sess-embed")).getByRole("button"));
    const frame = rowFor(first.container, "sess-embed").querySelector(
      "iframe",
    ) as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute("src")).toContain("start=750");

    // ── The player reports real playback further in.
    postPlayerTick(frame, 1500, 3600);
    expect(
      within(rowFor(first.container, "sess-embed")).getByText("Resume at 25:00"),
    ).toBeInTheDocument();

    // ── Backgrounding the app flushes the buffered position.
    backgroundApp();
    const rows = upsert.mock.calls[0]?.[0] as unknown as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      live_session_id: "sess-embed",
      position_seconds: 1500,
      completed: false,
    });

    // ── The restart. Everything in memory goes; the server keeps the position,
    //    so the next envelope carries it as `my_position`.
    first.unmount();
    setEnvelope([{ ...EMBED_SESSION, my_position: 1500 }, LINK_SESSION, UPCOMING_SESSION]);
    const second = renderShelf();

    expect(
      within(rowFor(second.container, "sess-embed")).getByText("Resume at 25:00"),
    ).toBeInTheDocument();

    fireEvent.click(within(rowFor(second.container, "sess-embed")).getByRole("button"));
    const resumedFrame = rowFor(second.container, "sess-embed").querySelector(
      "iframe",
    ) as HTMLIFrameElement;
    expect(resumedFrame.getAttribute("src")).toContain("start=1500");
  });

  it("flushes on visibility-change as well as on unmount", () => {
    const { container, unmount } = renderShelf();
    fireEvent.click(within(rowFor(container, "sess-embed")).getByRole("button"));
    const frame = rowFor(container, "sess-embed").querySelector("iframe") as HTMLIFrameElement;

    postPlayerTick(frame, 900, 3600);
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden" as DocumentVisibilityState);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    visibility.mockRestore();

    // A second tick, flushed by the unmount alone.
    postPlayerTick(frame, 1200, 3600);
    unmount();
    expect(upsert).toHaveBeenCalledTimes(2);
    const rows = upsert.mock.calls[1]?.[0] as unknown as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ position_seconds: 1200 });
  });

  it("marks a recording completed once it passes the 95% mark", () => {
    const { container, unmount } = renderShelf();
    fireEvent.click(within(rowFor(container, "sess-embed")).getByRole("button"));
    const frame = rowFor(container, "sess-embed").querySelector("iframe") as HTMLIFrameElement;

    postPlayerTick(frame, 3500, 3600);
    unmount();

    const rows = upsert.mock.calls[0]?.[0] as unknown as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ position_seconds: 3500, completed: true });
  });
});

/* ── The pure pieces the shelf is built on ─────────────────────────────── */

describe("parseEmbeddableRecording", () => {
  it("recognises the YouTube shapes a session URL actually arrives in", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=90s",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
    ]) {
      expect(parseEmbeddableRecording(url)).toEqual({
        provider: "youtube",
        id: "dQw4w9WgXcQ",
        hash: null,
      });
    }
  });

  it("recognises Vimeo, including the unlisted-link hash", () => {
    expect(parseEmbeddableRecording("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      id: "76979871",
      hash: null,
    });
    expect(parseEmbeddableRecording("https://vimeo.com/76979871/a1b2c3d4e5")).toEqual({
      provider: "vimeo",
      id: "76979871",
      hash: "a1b2c3d4e5",
    });
    expect(parseEmbeddableRecording("https://player.vimeo.com/video/76979871?h=a1b2c3d4e5")).toEqual(
      { provider: "vimeo", id: "76979871", hash: "a1b2c3d4e5" },
    );
  });

  it("refuses anything it cannot honestly play", () => {
    for (const url of [
      null,
      "",
      "   ",
      "not a url",
      // eslint-disable-next-line no-script-url
      "javascript:alert(1)",
      "https://zoom.us/rec/share/abc123",
      "https://drive.google.com/file/d/abc/view",
      "https://www.youtube.com/watch?v=tooshort",
    ]) {
      expect(parseEmbeddableRecording(url)).toBeNull();
    }
  });
});

describe("embedSrc", () => {
  it("bakes the resume offset in, and omits it at zero", () => {
    const youtube = { provider: "youtube" as const, id: "dQw4w9WgXcQ", hash: null };
    expect(embedSrc(youtube, 750, "https://app.leveluplearning.in")).toContain("start=750");
    expect(embedSrc(youtube, 0, "https://app.leveluplearning.in")).not.toContain("start=");
    expect(embedSrc({ provider: "vimeo", id: "76979871", hash: "abc123" }, 90)).toBe(
      "https://player.vimeo.com/video/76979871?dnt=1&playsinline=1&h=abc123#t=90s",
    );
  });

  it("sends an origin only when the page has an http one (never capacitor://)", () => {
    const youtube = { provider: "youtube" as const, id: "dQw4w9WgXcQ", hash: null };
    expect(embedSrc(youtube, 0, "https://app.leveluplearning.in")).toContain(
      "origin=https%3A%2F%2Fapp.leveluplearning.in",
    );
    expect(embedSrc(youtube, 0, "capacitor://app.leveluplearning.in")).not.toContain("origin=");
  });
});

describe("derivations", () => {
  it("numbers weeks from the schedule, and abandons the attempt on a mismatch", () => {
    const sessions = [EMBED_SESSION, LINK_SESSION, UPCOMING_SESSION];
    expect(deriveWeekNumbers(sessions, 3).get("week-2")).toBe(2);
    // Four weeks in the season, three with sessions — the mapping is unusable.
    expect(deriveWeekNumbers(sessions, 4).size).toBe(0);
    // No week count to check against: the ordinal is the best available answer.
    expect(deriveWeekNumbers(sessions, null).get("week-3")).toBe(3);
  });

  it("clamps the watched fraction and never invents one from a zero length", () => {
    expect(watchedPct(750, 3600)).toBeCloseTo(20.83, 1);
    expect(watchedPct(4000, 3600)).toBe(100);
    expect(watchedPct(750, 0)).toBe(0);
    expect(watchedPct(-10, 3600)).toBe(0);
  });

  it("formats a resume point the way a player does", () => {
    expect(clockLabel(750)).toBe("12:30");
    expect(clockLabel(3750)).toBe("1:02:30");
    expect(clockLabel(0)).toBe("0:00");
  });

  it("keeps the resume window at 5–95%", () => {
    expect(RESUME_MIN_PCT).toBe(5);
    expect(RESUME_MAX_PCT).toBe(95);
  });
});
