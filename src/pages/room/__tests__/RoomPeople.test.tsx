import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * R3-T2 — the roster.
 *
 * What this file exists to prove, in order of how badly it would hurt to get
 * wrong:
 *
 *  1. **The column list.** The page renders exactly what `get_room_roster`
 *     returns and nothing else. The SERVER-side half of that acceptance is the
 *     adversarial suite's C1 ("roster ships the safe column set only, no phone,
 *     no email", `npm run test:room-access`); the CLIENT-side half is here: a
 *     row carrying a phone and an email alongside the six real columns must
 *     paint neither of them.
 *  2. **Absence is silence.** A missing city or occupation removes the line
 *     rather than leaving an empty one behind.
 *  3. **The alumni derivation.** An `alumni` room marks every member ALUMNI,
 *     whatever their membership row still says.
 *  4. **The 200+ room.** 60 cards, then a reveal control, and no scroll
 *     container anywhere near the document root.
 *  5. **The lobby.** A `pre_member` never fires the RPC, and is told so in words
 *     rather than with a number the server cannot give them.
 *
 * 🔴 EVERYTHING IS MOUNTED UNDER THE REAL ROUTE SHAPE (`/room/:slug/people`
 * nested in `/room/:slug`), never under a bare `<MemoryRouter>`. Relative links
 * resolve against the matched route, so a bare router collapses every relative
 * `to` to `/` and silently passes a link that would dead-end in the app: `to="."`
 * inside the nested route resolves to `/room/the-season/people`, i.e. back to
 * the page you are trying to leave. That is exactly what shipped here once.
 *
 * The two boundaries are mocked: the shell's outlet context (the envelope) and
 * the roster hook. There is no live DB, and the page fires no query of its own
 * beyond `useRoomRoster`.
 */

/* ── The shell's outlet context ─────────────────────────────────────────── */

const outlet = {
  room: {
    offering_id: "off-1",
    offering_title: "The Season",
    total_weeks: 12,
    phase: "live" as string,
  },
  envelope: {
    offering_id: "off-1",
    access: "member" as string,
    config: { phase: "live", modules: {} as Record<string, boolean> },
    roster_count: 3,
    sessions: [],
    announcements: [],
  },
};

/** What `useRoomRoster` hands back this render. */
const rosterResult = {
  data: [] as RoomRosterEntry[],
  isPending: false,
  isError: false,
  denied: false,
  error: null as Error | null,
  refetch: vi.fn(),
};

/** Every `useRoomRoster(offeringId, options)` call, so `enabled` is assertable. */
const rosterCalls: Array<{ offeringId: unknown; options: unknown }> = [];

vi.mock("@/hooks/useCohortRooms", () => ({
  useRoomOutlet: () => outlet,
  isLobbyEnvelope: (envelope: { access?: string } | null) => envelope?.access === "pre_member",
  useRoomRoster: (offeringId: unknown, options: unknown) => {
    rosterCalls.push({ offeringId, options });
    return rosterResult;
  },
}));

// Imported AFTER the mocks are registered.
import RoomPeople from "../RoomPeople";
import {
  dedupeRosterEntries,
  memberWordmark,
  rosterCountLine,
  rosterDisplayName,
  rosterOneLiner,
  isRoomStaff,
  staffWordmark,
  ROSTER_PAGE_SIZE,
} from "@/components/room/RosterGrid";
import type { RoomRosterEntry } from "@/hooks/useCohortRooms";

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const entry = (over: Partial<RoomRosterEntry> & { user_id: string }): RoomRosterEntry => ({
  full_name: "A Member",
  avatar_url: null,
  occupation: null,
  city: null,
  role: "member",
  ...over,
});

const MENTOR = entry({
  user_id: "u-mentor",
  full_name: "Nelson Dilipkumar",
  occupation: "Cinematographer",
  city: "Chennai",
  role: "mentor",
});

const HOST = entry({
  user_id: "u-host",
  full_name: "Priya Raman",
  occupation: "Programme host",
  role: "host",
});

const FULL_MEMBER = entry({
  user_id: "u-full",
  full_name: "Arun Kumar",
  city: "Bengaluru",
  occupation: "Editor",
});

/** No city. The occupation line must survive; nothing may stand in for the city. */
const NO_CITY = entry({
  user_id: "u-nocity",
  full_name: "Meera Nair",
  occupation: "Colourist",
  city: null,
});

/** No occupation. Mirror image of the above. */
const NO_OCCUPATION = entry({
  user_id: "u-nojob",
  full_name: "Sanjay Iyer",
  city: "Kochi",
  occupation: null,
});

/** Neither. The card is a name and a face, and nothing hangs off it. */
const BARE = entry({ user_id: "u-bare", full_name: "Kavya Menon" });

function setRoster(
  entries: RoomRosterEntry[],
  state: Partial<Omit<typeof rosterResult, "data">> = {},
) {
  rosterResult.data = entries;
  rosterResult.isPending = state.isPending ?? false;
  rosterResult.isError = state.isError ?? false;
  rosterResult.denied = state.denied ?? false;
  rosterResult.error = state.error ?? null;
}

function setRoom(options: { phase?: string; access?: string; modules?: Record<string, boolean>; rosterCount?: number } = {}) {
  outlet.room.phase = options.phase ?? "live";
  outlet.envelope.access = options.access ?? "member";
  outlet.envelope.config = {
    phase: options.phase ?? "live",
    modules: options.modules ?? {},
  };
  outlet.envelope.roster_count = options.rosterCount ?? 3;
}

/** The room's slug in the URL under test, so link assertions can name it. */
const SLUG = "the-season";

const renderPeople = () =>
  render(
    <MemoryRouter initialEntries={[`/room/${SLUG}/people`]}>
      <Routes>
        <Route path="/room/:slug">
          <Route index element={<p>ROOM HOME</p>} />
          <Route path="people" element={<RoomPeople />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const memberCards = (container: HTMLElement) =>
  container.querySelectorAll('[data-testid="roster-member"]');

/** The card whose name line reads `name`. Keeps assertions from crossing cards. */
const cardFor = (container: HTMLElement, name: string): HTMLElement => {
  const card = [...memberCards(container)].find((node) => node.textContent?.includes(name));
  return card as HTMLElement;
};

beforeEach(() => {
  rosterCalls.length = 0;
  rosterResult.refetch.mockClear();
  setRoom();
  setRoster([MENTOR, FULL_MEMBER]);
});

afterEach(() => {
  cleanup();
});

/* ────────────────────────────────────────────────────────────────────────── */

describe("RoomPeople — the six columns and nothing else", () => {
  it("renders name, city and occupation, and never a phone or an email", () => {
    // A hostile row: the six real columns plus the two the RPC deliberately does
    // not return. Even if a future migration widened the projection, nothing on
    // this page has anywhere to put them.
    const leaky = {
      ...FULL_MEMBER,
      phone: "+919812345678",
      email: "arun@example.com",
    } as RoomRosterEntry;
    setRoster([leaky]);

    const { container } = renderPeople();

    const card = cardFor(container, "Arun Kumar");
    expect(within(card).getByText("Bengaluru")).toBeInTheDocument();
    expect(within(card).getByText("Editor")).toBeInTheDocument();

    expect(container.textContent).not.toContain("+919812345678");
    expect(container.textContent).not.toContain("arun@example.com");
    expect(container.querySelectorAll('a[href^="tel:"]')).toHaveLength(0);
    expect(container.querySelectorAll('a[href^="mailto:"]')).toHaveLength(0);
  });

  it("hides a missing city line instead of rendering an empty separator", () => {
    setRoster([NO_CITY]);
    const { container } = renderPeople();

    const card = cardFor(container, "Meera Nair");
    expect(within(card).getByText("Colourist")).toBeInTheDocument();
    // Three lines would mean a blank one was drawn where the city belongs.
    expect(card.querySelectorAll("p")).toHaveLength(2);
    expect(card.textContent).toBe("MNMeera NairColourist");
  });

  it("hides a missing occupation line the same way", () => {
    setRoster([NO_OCCUPATION]);
    const { container } = renderPeople();

    const card = cardFor(container, "Sanjay Iyer");
    expect(within(card).getByText("Kochi")).toBeInTheDocument();
    expect(card.querySelectorAll("p")).toHaveLength(2);
    expect(card.textContent).toBe("SISanjay IyerKochi");
  });

  it("renders a card with neither as a name alone, with nothing hanging off it", () => {
    setRoster([BARE]);
    const { container } = renderPeople();

    const card = cardFor(container, "Kavya Menon");
    expect(card.querySelectorAll("p")).toHaveLength(1);
    expect(card.textContent).toBe("KMKavya Menon");
  });
});

describe("RoomPeople — mentors and hosts on top", () => {
  it("lifts staff out of the grid and gives each one a wordmark and a serif line", () => {
    setRoster([MENTOR, HOST, FULL_MEMBER]);
    const { container } = renderPeople();

    const cards = container.querySelectorAll('[data-testid="mentor-card"]');
    expect(cards).toHaveLength(2);
    expect(within(cards[0] as HTMLElement).getByText("MENTOR")).toBeInTheDocument();
    expect(within(cards[0] as HTMLElement).getByText("Nelson Dilipkumar")).toBeInTheDocument();
    // The one-liner is the occupation, not a joined string of every field.
    expect(within(cards[0] as HTMLElement).getByText("Cinematographer")).toBeInTheDocument();
    expect(within(cards[1] as HTMLElement).getByText("HOST")).toBeInTheDocument();

    // …and they are not counted as cohort-mates, matching `roster_count`.
    expect(memberCards(container)).toHaveLength(1);
    expect(screen.getByTestId("roster-count")).toHaveTextContent("1 in this room");
  });

  it("falls back to the city when a mentor has no occupation, and to nothing when neither", () => {
    setRoster([
      entry({ user_id: "u-m2", full_name: "Lokesh R", city: "Chennai", role: "mentor" }),
      entry({ user_id: "u-m3", full_name: "Ravi B", role: "mentor" }),
    ]);
    const { container } = renderPeople();

    const cards = container.querySelectorAll('[data-testid="mentor-card"]');
    expect(within(cards[0] as HTMLElement).getByText("Chennai")).toBeInTheDocument();
    // Wordmark + name, and no third line invented for the missing one.
    expect((cards[1] as HTMLElement).querySelectorAll("p")).toHaveLength(2);
  });
});

describe("RoomPeople — one row per person", () => {
  it("shows a mentor who is also a batch member once, on their mentor card", () => {
    // Legal in the schema: `cohort_room_members` is unique across two PARTIAL
    // indexes, one for NULL-batch rows and one for batch rows, so this person
    // holds an offering-wide mentor grant AND a seat in the batch. Both arms of
    // `cohort_room_roster_ids` match and it has no DISTINCT.
    const both = [
      entry({ user_id: "u-dual", full_name: "Nelson Dilipkumar", role: "mentor" }),
      entry({ user_id: "u-dual", full_name: "Nelson Dilipkumar", role: "member" }),
      FULL_MEMBER,
    ];
    setRoster(both);
    const { container } = renderPeople();

    expect(container.querySelectorAll('[data-testid="mentor-card"]')).toHaveLength(1);
    expect(memberCards(container)).toHaveLength(1);
    expect(cardFor(container, "Nelson Dilipkumar")).toBeUndefined();
    // …and they are not counted as a cohort-mate on top of running the room.
    expect(screen.getByTestId("roster-count")).toHaveTextContent("1 in this room");
  });

  it("keeps the staff row whichever order the server returns the pair in", () => {
    const member = entry({ user_id: "u-dual", full_name: "Priya Raman", role: "member" });
    const staff = entry({ user_id: "u-dual", full_name: "Priya Raman", role: "host" });

    expect(dedupeRosterEntries([staff, member])).toEqual([staff]);
    expect(dedupeRosterEntries([member, staff])).toEqual([staff]);
  });

  it("leaves a roster with no duplicate untouched, array identity included", () => {
    const rows = [MENTOR, FULL_MEMBER, NO_CITY];
    expect(dedupeRosterEntries(rows)).toBe(rows);
    expect(dedupeRosterEntries([])).toEqual([]);
  });
});

describe("RoomPeople — the count line", () => {
  it("counts cohort-mates in mono, so it cannot disagree with the room's home card", () => {
    setRoster([MENTOR, HOST, FULL_MEMBER, NO_CITY, BARE]);
    renderPeople();

    // 5 rows, 2 of them staff — `get_cohort_room.roster_count` narrows the same
    // predicate to non-staff, and this line has to land on the same number.
    expect(screen.getByTestId("roster-count")).toHaveTextContent("3 in this room");
    expect(screen.getByTestId("roster-count").className).toContain("font-mono");
  });
});

describe("RoomPeople — the alumni room", () => {
  it("marks every derived member ALUMNI when the room's phase is alumni", () => {
    // Membership rows still say `member`: a season ending flips the phase on the
    // config row, not 200 membership rows.
    setRoom({ phase: "alumni" });
    setRoster([MENTOR, FULL_MEMBER, NO_CITY]);
    const { container } = renderPeople();

    expect(screen.getAllByText("ALUMNI")).toHaveLength(2);
    // The mentor keeps their own wordmark; they run the room, they did not sit in it.
    expect(within(container.querySelector('[data-testid="mentor-card"]') as HTMLElement)
      .getByText("MENTOR")).toBeInTheDocument();
  });

  it("marks an individual alumni row even in a live room", () => {
    setRoster([entry({ user_id: "u-alum", full_name: "Old Hand", role: "alumni" }), FULL_MEMBER]);
    renderPeople();

    expect(screen.getAllByText("ALUMNI")).toHaveLength(1);
  });

  it("puts no wordmark on a plain member of a live room", () => {
    setRoster([FULL_MEMBER]);
    renderPeople();

    expect(screen.queryByText("ALUMNI")).toBeNull();
    expect(screen.queryByText("MEMBER")).toBeNull();
  });
});

describe("RoomPeople — a 200+ member room", () => {
  const many = (count: number, role = "member") =>
    Array.from({ length: count }, (_, i) =>
      entry({
        user_id: `u-${i}`,
        full_name: `Member ${String(i).padStart(3, "0")}`,
        city: "Chennai",
        occupation: "Filmmaker",
        role,
      }),
    );

  it("paints one page of cards, then a reveal control, for a 240-member room", () => {
    setRoster(many(240));
    const { container } = renderPeople();

    expect(memberCards(container)).toHaveLength(ROSTER_PAGE_SIZE);
    expect(screen.getByTestId("roster-count")).toHaveTextContent("240 in this room");
    expect(screen.getByTestId("roster-show-more")).toHaveTextContent("Show 60 more");
  });

  it("reveals another page per press, and drops the control on the last one", () => {
    setRoster(many(130));
    const { container } = renderPeople();

    fireEvent.click(screen.getByTestId("roster-show-more"));
    expect(memberCards(container)).toHaveLength(120);
    expect(screen.getByTestId("roster-show-more")).toHaveTextContent("Show 10 more");

    fireEvent.click(screen.getByTestId("roster-show-more"));
    expect(memberCards(container)).toHaveLength(130);
    expect(screen.queryByTestId("roster-show-more")).toBeNull();
  });

  it("shows every member of a room under one page with no control at all", () => {
    setRoster(many(12));
    const { container } = renderPeople();

    expect(memberCards(container)).toHaveLength(12);
    expect(screen.queryByTestId("roster-show-more")).toBeNull();
  });

  it("introduces no scroll container of its own (the 2026-06-14 lesson)", () => {
    setRoster(many(240));
    const { container } = renderPeople();

    expect(container.querySelectorAll("[style*='overflow']")).toHaveLength(0);
    for (const node of container.querySelectorAll("*")) {
      expect(node.className.toString()).not.toMatch(/overflow-(y|x)?-?(auto|scroll)/);
    }
  });

  it("makes no member card a link or a button (ROSTER-SCOPE-1)", () => {
    setRoster([...many(3), MENTOR]);
    const { container } = renderPeople();

    for (const card of [
      ...memberCards(container),
      ...container.querySelectorAll('[data-testid="mentor-card"]'),
    ]) {
      expect(card.querySelectorAll("a, button")).toHaveLength(0);
    }
  });
});

describe("RoomPeople — the lobby, the gate and the failures", () => {
  it("never fires the RPC for a pre_member, and prints no count it cannot stand behind", () => {
    // `rosterCount: 0` is not a convenience: `get_cohort_room.roster_count`
    // counts `cohort_room_roster_ids` narrowed to member/alumni, that predicate
    // never lists a `pre_member` row, and a lobby row carries no batch — so 0 is
    // the ONLY value a lobby envelope can arrive with. A fixture with 41 in it
    // would be testing a server state that cannot happen.
    setRoom({ access: "pre_member", rosterCount: 0 });
    setRoster([], { isPending: true });
    const { container } = renderPeople();

    expect(rosterCalls.at(-1)?.options).toEqual({ enabled: false });
    expect(screen.getByText(/when the doors open/i)).toBeInTheDocument();
    expect(memberCards(container)).toHaveLength(0);
    // Never "0 in this room", which is a wrong count rather than an absent one.
    expect(screen.queryByTestId("roster-count")).toBeNull();
    expect(container.textContent).not.toMatch(/in this room/);
  });

  it("tells a denied member their access ended, and quotes no count at them", () => {
    // A cached `member` envelope whose roster call now 42501s: their membership
    // went away mid-session. They are not in a lobby, so they must not be told
    // to wait for doors that already opened for them.
    setRoster([], { isError: true, denied: true, error: new Error("42501") });
    setRoom({ rosterCount: 41 });
    renderPeople();

    expect(screen.getByText(/access to this room's roster has ended/i)).toBeInTheDocument();
    expect(screen.queryByText(/when the doors open/i)).toBeNull();
    // The envelope still holds 41. Printing it would quote a number the server
    // just refused them.
    expect(screen.queryByText("41 in this room")).toBeNull();
    expect(screen.queryByText(/didn't load/i)).toBeNull();
  });

  it("offers a retry for a transport failure, which is not an answer about access", () => {
    setRoster([], { isError: true, denied: false, error: new Error("network") });
    renderPeople();

    expect(screen.getByText("The roster didn't load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(rosterResult.refetch).toHaveBeenCalledTimes(1);
  });

  it("renders nothing but a way back when the cohort has the module off", () => {
    setRoom({ modules: { roster: false } });
    setRoster([MENTOR, FULL_MEMBER]);
    const { container } = renderPeople();

    expect(screen.getByText(/doesn't use people/i)).toBeInTheDocument();
    expect(memberCards(container)).toHaveLength(0);
    // …and it does not spend a round trip on a module it will not draw.
    expect(rosterCalls.at(-1)?.options).toEqual({ enabled: false });
  });

  it("makes that way back leave the page, instead of reloading it", () => {
    // The whole point of the off-note. `to="."` resolves to the CURRENT path
    // inside a nested route, so the only affordance on a dead-end page would
    // land the reader straight back on it.
    setRoom({ modules: { roster: false } });
    renderPeople();

    const back = screen.getByRole("link", { name: /back to the room/i });
    expect(back).toHaveAttribute("href", `/room/${SLUG}`);
    fireEvent.click(back);
    expect(screen.getByText("ROOM HOME")).toBeInTheDocument();
  });

  it("says so plainly when the room is genuinely empty", () => {
    setRoster([]);
    renderPeople();

    expect(screen.getByText("The room is still filling up.")).toBeInTheDocument();
    expect(screen.queryByTestId("roster-count")).toBeNull();
  });

  it("says so plainly when the roster is nothing but staff, and counts nobody", () => {
    // Reachable before the first enrolment lands: a NULL-batch mentor resolves
    // `offering_wide`, so `cohort_room_roster_ids` returns every active member
    // of the offering, which at that point is the mentor themselves.
    setRoster([MENTOR, HOST]);
    const { container } = renderPeople();

    expect(container.querySelectorAll('[data-testid="mentor-card"]')).toHaveLength(2);
    expect(screen.getByText("The room is still filling up.")).toBeInTheDocument();
    // The bug this replaces: "0 in this room" over an empty grid.
    expect(screen.queryByTestId("roster-count")).toBeNull();
    expect(container.textContent).not.toContain("0 in this room");
  });

  it("shows a skeleton, not an empty room, while the roster is in flight", () => {
    setRoster([], { isPending: true });
    renderPeople();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("The room is still filling up.")).toBeNull();
  });
});

/* ── The pure pieces the roster is built on ────────────────────────────── */

describe("roster derivations", () => {
  it("treats mentor and host as staff, and nothing else", () => {
    expect(isRoomStaff("mentor")).toBe(true);
    expect(isRoomStaff("host")).toBe(true);
    expect(isRoomStaff("member")).toBe(false);
    expect(isRoomStaff("alumni")).toBe(false);
    expect(isRoomStaff(null)).toBe(false);
  });

  it("wordmarks staff by role and members by role OR room phase", () => {
    expect(staffWordmark("mentor")).toBe("MENTOR");
    expect(staffWordmark("host")).toBe("HOST");
    expect(staffWordmark("member")).toBeNull();

    expect(memberWordmark("member", "live")).toBeNull();
    expect(memberWordmark("member", "alumni")).toBe("ALUMNI");
    expect(memberWordmark("alumni", "live")).toBe("ALUMNI");
    expect(memberWordmark("member", null)).toBeNull();
  });

  it("falls back to the role for a nameless row rather than inventing a name", () => {
    expect(rosterDisplayName(FULL_MEMBER)).toBe("Arun Kumar");
    expect(rosterDisplayName(entry({ user_id: "x", full_name: null }))).toBe("Member");
    expect(rosterDisplayName(entry({ user_id: "x", full_name: "   " }))).toBe("Member");
    expect(rosterDisplayName(entry({ user_id: "x", full_name: null, role: "mentor" }))).toBe(
      "Mentor",
    );
    expect(rosterDisplayName(entry({ user_id: "x", full_name: null, role: "host" }))).toBe("Host");
  });

  it("prefers the occupation for the one-liner, then the city, then nothing", () => {
    expect(rosterOneLiner(MENTOR)).toBe("Cinematographer");
    expect(rosterOneLiner(NO_OCCUPATION)).toBe("Kochi");
    expect(rosterOneLiner(BARE)).toBeNull();
    expect(rosterOneLiner(entry({ user_id: "x", occupation: "  ", city: "  " }))).toBeNull();
  });

  it("words the count line once, for both the room and the lobby", () => {
    expect(rosterCountLine(41)).toBe("41 in this room");
    expect(rosterCountLine(1)).toBe("1 in this room");
    expect(rosterCountLine(0)).toBe("0 in this room");
  });

  it("keeps the page size at the brief's 60", () => {
    expect(ROSTER_PAGE_SIZE).toBe(60);
  });
});
