import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * PHASE IV / Q-1 — the interview booking surface, pinned on the things that
 * decide whether a student can book at all, and whether they can book twice.
 *
 * (The FILE NAME is a leftover from when this surface was an embed. Since the
 * 2026-07-28 reversal that reinstated REQ-INT-0 the primary path is three
 * one-tap slot buttons and the embed is the FALLBACK — the path is kept so the
 * task touches no file it does not own.)
 *
 * 1. THE SLOTS MUST BE REAL, AND THEY MUST OPEN CALENDLY'S OWN PAGE. The app
 *    cannot book: Calendly's API has no create call, so a button that does not
 *    open `scheduling_url` books nothing at all. The deep link must also carry
 *    the SAME two prefill fields as every other route to Calendly, or the
 *    receiver reconciles the booking on a different join key (INTEG-KEY-1).
 * 2. A TAP MUST RE-CHECK. A slot can be taken between render and tap; sending
 *    somebody to a dead slot at the exact moment they finally decided to book is
 *    the worst outcome available on this surface. And a re-check that FAILS must
 *    not block the tap, or the safety check becomes the thing that breaks
 *    booking.
 * 3. IT MUST NEVER DEAD-END. No slots, a throttled API, an outage — every one of
 *    them falls back to the hosted calendar that shipped before this task. The
 *    only state that renders nothing is "this offering has no booking step",
 *    which is the marketing gate's own behaviour (ENTRY-PARITY-1).
 * 4. THE BOOKED STATE MUST SURVIVE A RELOAD, AND MUST NOT BECOME A CAGE. The
 *    webhook is the durable record but it lags, and the UI must not invite a
 *    second booking in that gap — while a marker held too long, or against the
 *    wrong person, strands somebody: a student whose slot was cancelled taps
 *    "Rebook" (the parent mounts this component for that path too), and a
 *    device-durable marker keyed by offering alone withdraws the calendar from
 *    the next person on a shared handset. Both are the
 *    fee-paid-but-never-scheduled loss this phase exists to close, caused by the
 *    fix for it.
 *
 * Plus the NFR-COPY-4 / REQ-INT-2 copy grep, which `interview-surfaces.test.tsx`
 * runs over the other three interview components and which this surface — the one
 * every applicant actually reaches — had no guard for.
 */

/* ── Web Storage, which this jsdom build does not ship. Node 22 defines a
      `localStorage` global that stays `undefined` without `--localstorage-file`,
      and it shadows jsdom's, so `window.localStorage` and `window.sessionStorage`
      are both undefined under vitest. The production surfaces (every browser and
      both WebViews) have them; the marker's own fallbacks are what keep it from
      throwing where they are missing. Install a real Map-backed Storage so the
      durability rules can be asserted. ─────────────────────────────────────── */

function installStorage(name: "localStorage" | "sessionStorage") {
  const map = new Map<string, string>();
  const store: Storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
  Object.defineProperty(window, name, { configurable: true, value: store });
}

installStorage("localStorage");
installStorage("sessionStorage");

/* ── Boundaries. The component reads one `offerings` row through react-query,
      calls ONE edge function for availability, and taps a haptic. The edge
      function is the seam: the Calendly API token lives behind it and nothing in `src/`
      may ever hold it, which is why availability is a function call here and not
      a fetch. ──────────────────────────────────────────────────────────────── */

const offeringRow = vi.hoisted(() => ({
  current: {
    data: {
      calendly_url: "https://calendly.com/levelup/interview",
      thankyou_show_calendly: true,
    } as { calendly_url: string | null; thankyou_show_calendly: boolean } | null,
    error: null as unknown,
  },
}));

/**
 * The availability responses, in order. A tap re-checks, so the second call must
 * be able to answer differently from the first — that IS the stale-slot case.
 */
const slotsResponses = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: unknown }>,
  calls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve(offeringRow.current));
  return {
    supabase: {
      from: vi.fn(() => builder),
      functions: {
        invoke: vi.fn((_name: string, options?: { body?: Record<string, unknown> }) => {
          slotsResponses.calls.push(options?.body ?? {});
          const next =
            slotsResponses.queue.length > 1
              ? (slotsResponses.queue.shift() as { data: unknown; error: unknown })
              : slotsResponses.queue[0];
          return Promise.resolve(next ?? { data: null, error: { message: "boom" } });
        }),
      },
    },
  };
});

vi.mock("@/lib/haptics", () => ({
  tapTick: vi.fn(() => Promise.resolve()),
  hapticNotification: vi.fn(() => Promise.resolve()),
  hapticImpact: vi.fn(() => Promise.resolve()),
  hapticSelection: vi.fn(() => Promise.resolve()),
}));

/**
 * The shell this file renders in, SWITCHABLE — it used to be pinned to web for
 * the whole file, which is precisely how a slot tap that opens nothing on either
 * native shell shipped green. Defaults to web in `beforeEach` (the fallback frame
 * only renders there, and most of this file asserts against it); the native tap
 * flips it deliberately, and states which shell it is standing in.
 */
const platform = vi.hoisted(() => ({ native: false }));

vi.mock("@/lib/platform", () => ({
  isNative: () => platform.native,
  isAndroid: () => platform.native,
  isIOS: () => false,
  isWeb: () => !platform.native,
}));

import { InterviewSlots } from "@/components/interview/SlotButtons";
import {
  CALENDLY_BOOKED_TTL_MS,
  CALENDLY_EMBED_TYPE,
  calendlyBookedKey,
  calendlyBookingUrl,
  calendlyEmbedUrl,
  forgetCalendlyBooked,
  isCalendlyBookedMessage,
  parseSlotsResponse,
  readCalendlyBooked,
  rememberCalendlyBooked,
} from "@/hooks/useInterviewSlots";

const OFFERING_ID = "off_interview_1";
const CALENDLY_ORIGIN = "https://calendly.com";
/** The marker is scoped to the invitee email the booking link is prefilled with. */
const IDENTITY = "asha@example.com";
const OTHER_IDENTITY = "bhavna@example.com";

/**
 * Three slots on a fixed UTC instant. Only the TIME is asserted in this file —
 * 09:30Z is 3:00 pm IST — because "Today"/"Tomorrow" depend on the wall clock and
 * are pinned against an explicit `now` in `src/lib/__tests__/calendly.test.ts`.
 */
const SLOT_A = "2026-12-25T09:30:00.000000Z";
const SLOT_B = "2026-12-25T10:30:00.000000Z";
const SLOT_C = "2026-12-26T04:00:00.000000Z";

const slotUrl = (iso: string) =>
  `https://calendly.com/levelup/interview/${iso.slice(0, 19)}Z`;

const slot = (iso: string) => ({ startTime: iso, bookingUrl: slotUrl(iso) });

const THREE_SLOTS = {
  data: { slots: [slot(SLOT_A), slot(SLOT_B), slot(SLOT_C)], reason: null },
  error: null,
};

/** REQ-INT-2 / NFR-COPY-4 — the words no interview surface may ever render. */
const FORBIDDEN = [/mentor/i, /counsell?or/i, /free/i, /zoom/i];

function expectCleanCopy(text: string | null | undefined) {
  for (const pattern of FORBIDDEN) {
    expect(text ?? "", `copy matched ${pattern}`).not.toMatch(pattern);
  }
}

/**
 * A fresh client per render so one test's cache never answers another's query.
 * The client is HANDED BACK because the background refetch is a first-class case
 * on this surface, not an implementation detail: `refetchOnWindowFocus` fires the
 * moment a student returns from Calendly, and what the surface does with that
 * answer is the difference between a booked student and a double-booked one.
 */
function renderSurface(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    client,
    ...render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(InterviewSlots, {
          offeringId: OFFERING_ID,
          name: "Asha Iyer",
          email: IDENTITY,
          ...props,
        } as never),
      ),
    ),
  };
}

/** What `refetchOnWindowFocus` does when the student comes back from Calendly. */
async function backgroundRefetch(client: QueryClient) {
  await act(async () => {
    await client.refetchQueries({ queryKey: ["interview", "slots", OFFERING_ID] });
  });
}

const embedFrame = () => screen.findByTitle("Schedule your interview");
const slotButtons = () => screen.findAllByRole("button", { name: /^Book / });

/** The tab a tap opens, stubbed: jsdom's `window.open` is not implemented. */
let openedTab: {
  closed: boolean;
  opener: unknown;
  close: ReturnType<typeof vi.fn>;
  location: { replace: ReturnType<typeof vi.fn> };
};
let openSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  platform.native = false;
  offeringRow.current = {
    data: { calendly_url: "https://calendly.com/levelup/interview", thankyou_show_calendly: true },
    error: null,
  };
  slotsResponses.queue = [THREE_SLOTS];
  slotsResponses.calls = [];
  localStorage.clear();
  sessionStorage.clear();

  openedTab = {
    closed: false,
    opener: {},
    close: vi.fn(function close(this: typeof openedTab) {
      openedTab.closed = true;
    }),
    location: { replace: vi.fn() },
  };
  openSpy = vi.fn(() => openedTab);
  Object.defineProperty(window, "open", { configurable: true, value: openSpy });
});

afterEach(() => {
  cleanup();
});

/* ────────────────────────────────────────────────────────────────────────────
   1. The builders — the prefill field set neither path may quietly change, and
      the embed contract the FALLBACK still depends on.
   ──────────────────────────────────────────────────────────────────────────── */

describe("calendlyEmbedUrl — the params that make the fallback embed signal at all", () => {
  it("carries embed_domain and embed_type", () => {
    const url = new URL(calendlyEmbedUrl("https://calendly.com/levelup/interview"));
    expect(url.searchParams.get("embed_domain")).toBe(window.location.host);
    expect(url.searchParams.get("embed_type")).toBe(CALENDLY_EMBED_TYPE);
  });

  it("takes the embed domain from the live document, not a constant", () => {
    // A hardcoded production host would kill the signal on every preview deploy
    // and on localhost — the two places a regression would be caught.
    const url = new URL(
      calendlyEmbedUrl("https://calendly.com/levelup/interview", {}, {
        embedDomain: "preview.leveluplearning.in",
      }),
    );
    expect(url.searchParams.get("embed_domain")).toBe("preview.leveluplearning.in");
  });

  it("prefills name and email, and NOTHING else (INTEG-KEY-1's join key)", () => {
    const url = new URL(
      calendlyEmbedUrl("https://calendly.com/levelup/interview", {
        name: "Asha Iyer",
        email: "asha@example.com",
      }),
    );
    expect(url.searchParams.get("name")).toBe("Asha Iyer");
    expect(url.searchParams.get("email")).toBe("asha@example.com");
    // A phone prefill would reconcile on a different key than the identical
    // booking made from the other entry point. The field set is a contract.
    expect([...url.searchParams.keys()].sort()).toEqual([
      "email",
      "embed_domain",
      "embed_type",
      "name",
    ]);
  });

  it("preserves query params the admin already put on the link", () => {
    const url = new URL(
      calendlyEmbedUrl("https://calendly.com/levelup/interview?utm_source=app"),
    );
    expect(url.searchParams.get("utm_source")).toBe("app");
    expect(url.searchParams.get("embed_type")).toBe(CALENDLY_EMBED_TYPE);
  });

  it("falls back to the raw link rather than blocking a booking", () => {
    expect(calendlyEmbedUrl("not a url", { name: "Asha" })).toBe("not a url");
  });
});

describe("calendlyBookingUrl — the top-level link is NOT an embed", () => {
  it("prefills but sets no embed params", () => {
    const url = new URL(
      calendlyBookingUrl("https://calendly.com/levelup/interview", {
        name: "Asha Iyer",
        email: "asha@example.com",
      }),
    );
    expect(url.searchParams.get("name")).toBe("Asha Iyer");
    expect(url.searchParams.get("embed_domain")).toBeNull();
    expect(url.searchParams.get("embed_type")).toBeNull();
  });
});

describe("parseSlotsResponse — the client pins every link it is handed", () => {
  it("keeps well-formed slots", () => {
    expect(parseSlotsResponse({ slots: [slot(SLOT_A)], reason: null })).toEqual({
      slots: [slot(SLOT_A)],
      reason: null,
    });
  });

  it("drops a slot whose link is not on calendly.com", () => {
    // These URLs are opened in a browser carrying the applicant's name and
    // email. A client that trusts whatever it is handed is one compromised
    // dependency away from a prefilled phishing hop.
    const payload = parseSlotsResponse({
      slots: [
        { startTime: SLOT_A, bookingUrl: "https://calendly.com.evil.io/levelup/x" },
        { startTime: SLOT_B, bookingUrl: "http://calendly.com/levelup/x" },
        slot(SLOT_C),
      ],
      reason: null,
    });
    expect(payload.slots).toEqual([slot(SLOT_C)]);
  });

  it("reads an unreadable answer as unavailable, not as an empty calendar", () => {
    // "No slots" sends the student to the hosted calendar with a straight face;
    // "we could not read the response" must not be reported as the calendar
    // being empty, because it is not a fact about the calendar at all.
    expect(parseSlotsResponse(null).reason).toBe("unavailable");
    expect(parseSlotsResponse({ slots: [], reason: "nonsense" }).reason).toBe("unavailable");
    expect(parseSlotsResponse({ slots: [], reason: "no_slots" }).reason).toBe("no_slots");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   2. ENTRY-PARITY-1 — both surfaces are now literally the same surface.
   ──────────────────────────────────────────────────────────────────────────── */

describe("ENTRY-PARITY-1 — both entry points render one component off one row", () => {
  async function readSource(file: string) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    return fs.readFile(path.resolve(process.cwd(), file), "utf8");
  }

  it("the marketing path mounts the shared surface instead of building its own", async () => {
    // Read as source rather than rendered, because the assertion IS structural:
    // the divergence this guards is `ThankYou.tsx` going back to hand-rolling a
    // Calendly iframe — which would still render a working calendar while
    // silently diverging on prefill, on the booked marker, and now on whether the
    // buyer is offered slots at all.
    const src = await readSource("src/pages/ThankYou.tsx");
    expect(src).toContain('from "@/components/interview/SlotButtons"');
    expect(src).toContain("<InterviewSlots");
    // No private surface of its own, in any of the shapes it has had.
    expect(src).not.toMatch(/<iframe/);
    expect(src).not.toMatch(/calendlyEmbedUrl\(/);
    expect(src).not.toMatch(/calendly_url\}\$\{/);
    expect(src).not.toMatch(/includes\("\?"\)/);
  });

  it("the app path mounts the same component", async () => {
    const src = await readSource("src/pages/ApplicationStatus.tsx");
    expect(src).toContain('from "@/components/interview/SlotButtons"');
    expect(src).toContain("<InterviewSlots");
  });

  it("both resolve the buyer's identity with the SAME session fallback", async () => {
    // The `email` prop is two things: Calendly's prefill AND the scope the booked
    // marker is keyed to. A null identity falls to the anonymous scope, which is
    // sessionStorage-only — so a signed-in buyer whose `payment_orders` row has a
    // null `guest_email` (allowed, and what `isGuest` branches on) would lose the
    // marker on reopening `/thank-you` in a new tab and be offered a second
    // booking with the first still in flight. Each path may read its own FIRST
    // source; neither may drop the session behind it.
    const thankYou = await readSource("src/pages/ThankYou.tsx");
    expect(thankYou).toMatch(/email=\{order\.guest_email \?\? session\?\.user\?\.email/);
    const status = await readSource("src/pages/ApplicationStatus.tsx");
    expect(status).toMatch(/email=\{profile\?\.email \?\? user\?\.email\}/);
  });

  it("the availability function reports an outage as an outage, not as an empty calendar", async () => {
    // `no_slots` is documented client-side as "the calendar is genuinely empty for
    // the next fortnight". A Calendly 5xx filed under it makes the one field the
    // client and every future alert branch on untrustworthy — and caching it would
    // hold a recovered Calendly behind a stale outage. The handler is not
    // vitest-importable (esm.sh + a top-level `Deno.serve`), so this is asserted
    // structurally, like the token grep above.
    const fn = await readSource("supabase/functions/calendly-slots/index.ts");
    expect(fn).toMatch(/if \(failed && slots\.length === 0\) return soft\(req, "unavailable"\)/);
    // `soft` is the one builder that writes nothing to `slotCache`.
    expect(fn).toMatch(/function soft\([\s\S]*?\n\}/);
    expect(fn.match(/function soft\([\s\S]*?\n\}/)?.[0]).not.toContain("cacheSet");
  });

  it("both are gated on the same two offering columns", async () => {
    // The marketing gate is `thankyou_show_calendly && isCalendlyUrl(...)`; the
    // component re-derives the identical conjunction from its own read of the
    // row (`INTERVIEW_BOOKING_SILENT_REASONS`), so neither path can start
    // offering a booking step the other withholds.
    const src = await readSource("src/pages/ThankYou.tsx");
    expect(src).toMatch(/thankyou_show_calendly &&\s*\n?\s*isCalendlyUrl\(/);
  });

  it("no client file can READ the Calendly token", async () => {
    // The token is the reason availability is an edge function at all: it can
    // read AND cancel bookings across the whole org account, and anything a
    // client file can read is in the bundle and in every student's devtools.
    //
    // Asserted on the READ, not on the name — the name appears in prose above
    // and in this file, and a grep that fails on a comment teaches people to
    // stop writing the comment. What must not exist is an accessor: no
    // `import.meta.env` var naming Calendly, and no `Deno.env` under `src/` at
    // all (that global does not exist in the browser, so its presence would mean
    // server code had been pasted into the client).
    const { execSync } = await import("node:child_process");
    const accessors = execSync(
      'grep -rnE "import\\.meta\\.env[^;]*CALENDLY|process\\.env[^;]*CALENDLY|Deno\\.env\\.get\\(" src || true',
      { encoding: "utf8" },
    ).trim();
    expect(accessors).toBe("");

    // And availability arrives the one way that keeps it that way.
    const hook = await readSource("src/hooks/useInterviewSlots.ts");
    expect(hook).toContain('supabase.functions.invoke("calendly-slots"');
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   3. The slots themselves.
   ──────────────────────────────────────────────────────────────────────────── */

describe("the three soonest slots", () => {
  it("renders one button per slot, in IST", async () => {
    renderSurface();
    const buttons = await slotButtons();
    expect(buttons).toHaveLength(3);
    // 09:30 UTC is 15:00 in Kolkata. A button that renders the UTC hour is a
    // missed interview, not a formatting nit.
    expect(buttons[0].textContent).toMatch(/3:00 pm/);
    expect(buttons[1].textContent).toMatch(/4:00 pm/);
    expect(screen.queryByTitle("Schedule your interview")).toBeNull();
  });

  it("opens Calendly's own deep link for that slot, prefilled", async () => {
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });

    await waitFor(() => {
      expect(openedTab.location.replace).toHaveBeenCalled();
    });
    const href = new URL(openedTab.location.replace.mock.calls[0][0] as string);
    // The per-slot URL, not the event type's front page: the whole point is that
    // the applicant lands on the confirmation step with the time already chosen.
    expect(href.pathname).toContain("2026-12-25T09:30:00Z");
    expect(href.searchParams.get("name")).toBe("Asha Iyer");
    expect(href.searchParams.get("email")).toBe(IDENTITY);
    // Same field set as every other route to Calendly (INTEG-KEY-1).
    expect([...href.searchParams.keys()].sort()).toEqual(["email", "name"]);
    // The tab is opened INSIDE the gesture and navigated after the re-check; a
    // window opened after an await is a popup and is blocked.
    expect(openSpy).toHaveBeenCalledWith("", "_blank");
    expect(openedTab.opener).toBeNull();
  });

  it("re-checks availability before it opens anything", async () => {
    renderSurface();
    const buttons = await slotButtons();
    slotsResponses.calls = [];
    act(() => {
      buttons[0].click();
    });
    await waitFor(() => {
      expect(openedTab.location.replace).toHaveBeenCalled();
    });
    // The re-check is the whole reason a self-rendered list is safe.
    expect(slotsResponses.calls[0]).toMatchObject({ offeringId: OFFERING_ID, fresh: true });
  });

  it("re-offers rather than dead-ends when the slot went in the meantime", async () => {
    const laterSlot = "2026-12-27T09:30:00.000000Z";
    slotsResponses.queue = [
      THREE_SLOTS,
      { data: { slots: [slot(SLOT_B), slot(SLOT_C), slot(laterSlot)], reason: null }, error: null },
    ];
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });

    await screen.findByText(/that time was just taken/i);
    // No navigation to a slot that cannot be confirmed, and the tab we opened
    // inside the gesture is closed rather than left on about:blank.
    expect(openedTab.location.replace).not.toHaveBeenCalled();
    expect(openedTab.close).toHaveBeenCalled();
    // And the replacement three are on screen, so the student is one tap from
    // booking rather than back at the start.
    const after = await slotButtons();
    expect(after).toHaveLength(3);
    expect(after[0].textContent).toMatch(/4:00 pm/);
  });

  it("still opens the slot when the re-check itself fails", async () => {
    // Refusing on a network hiccup would invent a dead end out of a working
    // booking: Calendly's own page is the authority and says so gracefully.
    slotsResponses.queue = [THREE_SLOTS, { data: null, error: { message: "offline" } }];
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    await waitFor(() => {
      expect(openedTab.location.replace).toHaveBeenCalled();
    });
    expect(screen.queryByText(/that time was just taken/i)).toBeNull();
  });

  it("offers the full calendar beside the three", async () => {
    renderSurface();
    await slotButtons();
    const more = screen.getByRole("link", { name: /see all available times/i });
    expect(more.getAttribute("href")).toContain("calendly.com");
  });

  it("asks after a tap instead of claiming the booking it cannot see", async () => {
    // A slot opens Calendly as a top-level page in another tab, which posts to
    // nobody. Claiming "booked" would be a lie; leaving the list open invites a
    // second slot. So it asks, and the answer is guarded.
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    const confirm = await screen.findByRole("button", { name: /i confirmed my time/i });
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(false);

    act(() => {
      confirm.click();
    });
    const yes = await screen.findByRole("button", { name: /yes, i have my time/i });
    act(() => {
      yes.click();
    });

    await screen.findByText(/your interview time is booked/i);
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(true);
  });

  it("explains itself when the re-check leaves NOTHING to re-offer", async () => {
    // The interviewer cleared the fortnight, or that was the last opening. The
    // answer is trustworthy, so it overwrites the list — three buttons become the
    // hosted calendar under the applicant's thumb. The notice used to live inside
    // the slot branch, which is the one branch this case cannot reach, so the swap
    // happened in total silence.
    slotsResponses.queue = [
      THREE_SLOTS,
      { data: { slots: [], reason: "no_slots" }, error: null },
    ];
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });

    const notice = await screen.findByText(/that time was just taken/i);
    expect(notice.textContent).toMatch(/nothing else is open/i);
    // Still bookable: the fallback is the full calendar, not an error.
    expect(await embedFrame()).toBeTruthy();
    // And nothing opened, so nothing may be confirmed.
    expect(openedTab.location.replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /i confirmed my time/i })).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   3b. The hand-off itself — the one step this surface does not control, on the
       three shells it ships to. `window.open` is not one mechanism, and a tap
       that opens nothing must never be reported as a tap that opened something.
   ──────────────────────────────────────────────────────────────────────────── */

describe("the hand-off — what a tap actually does, per shell", () => {
  it("navigates the CURRENT window on native, where a _blank open opens nothing", async () => {
    // Android: the shell never calls `setSupportMultipleWindows(true)` and
    // implements no `onCreateWindow`, so a `_blank` open is dropped. iOS:
    // `javaScriptCanOpenWindowsAutomatically` is never set, so WKWebView is never
    // asked. A top-level navigation is what BOTH shells intercept
    // (`Bridge.launchIntent` / `decidePolicyFor`) and turn into a system-browser
    // hand-off, leaving the app where it was.
    platform.native = true;
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
    });
    const [href, target] = openSpy.mock.calls.at(-1) as [string, string];
    expect(target).toBe("_self");
    expect(new URL(href).pathname).toContain("2026-12-25T09:30:00Z");
    expect(new URL(href).searchParams.get("email")).toBe(IDENTITY);
    // No blank pre-open on native: there is no tab to pre-open.
    expect(openSpy.mock.calls.some(([, t]) => t === "_blank")).toBe(false);
    // The re-check still gates it.
    expect(slotsResponses.calls.at(-1)).toMatchObject({ fresh: true });
  });

  it("never claims a tab the browser refused, and withholds the booked control", async () => {
    // Popups blocked. Both opens answer null. Saying "Calendly opened" here, and
    // then offering "I confirmed my time", marks somebody booked for an interview
    // that was never even offered to them.
    openSpy.mockReturnValue(null);
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });

    await screen.findByText(/your browser blocked the new tab/i);
    expect(screen.queryByText(/confirm it there/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /i confirmed my time/i })).toBeNull();
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(false);

    // The way through is a real anchor on a real tap, which no popup blocker and
    // no WebView refuses — pointed at the SAME slot, still prefilled.
    const link = screen.getByRole("link", { name: /open your time on calendly/i });
    const href = new URL(link.getAttribute("href") as string);
    expect(href.pathname).toContain("2026-12-25T09:30:00Z");
    expect(href.searchParams.get("email")).toBe(IDENTITY);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");

    // Using it IS the hand-off, so the confirmation it was withholding appears.
    act(() => {
      link.click();
    });
    expect(await screen.findByRole("button", { name: /i confirmed my time/i })).toBeTruthy();
  });

  it("believes a named open the browser DID allow after refusing the blank one", async () => {
    // The in-gesture blank pre-open is refused (a content blocker, a strict popup
    // setting), the named retry is allowed. This tap OPENED Calendly.
    //
    // It could not be reported as such while the retry passed `"noopener,
    // noreferrer"`: `window.open` returns NULL BY SPECIFICATION whenever the
    // features include `noopener`, so the `!!` of it was false for every tab that
    // ever opened this way. The student read "nothing opened, so nothing is booked
    // yet" with their slot sitting in the next tab, and the control that records
    // the booking was withheld from them.
    openSpy.mockImplementationOnce(() => null);
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });

    await screen.findByText(/finish on calendly/i);
    expect(screen.queryByText(/blocked the new tab/i)).toBeNull();
    expect(await screen.findByRole("button", { name: /i confirmed my time/i })).toBeTruthy();

    const lastCall = openSpy.mock.calls.at(-1) as unknown[];
    expect(lastCall[1]).toBe("_blank");
    // NO features string, asserted as the ABSENCE OF A THIRD ARGUMENT rather than
    // through the return value — deliberately. `window.open`'s null-on-`noopener`
    // rule lives in the browser, and a `vi.fn` stub hands back whatever it was told
    // to regardless of what it is passed, so a spy can never reproduce the bug.
    // The argument list is the only part of it this harness can see, and it is
    // sufficient: the rule is triggered by the features string alone.
    expect(lastCall).toHaveLength(2);
    expect(new URL(lastCall[0] as string).pathname).toContain("2026-12-25T09:30:00Z");
    // Disowned by hand, since `noopener` is no longer doing it for us.
    expect(openedTab.opener).toBeNull();
  });

  it("still puts a panel up when the hand-off itself THROWS", async () => {
    // A disowned popup, or a blocker's stub: `location.replace` raises
    // SecurityError. The throw used to propagate out of `setTapped(...)`'s own
    // argument list, so `setTapped` never ran — no panel, no confirmation control,
    // no blocked copy, and an unhandled rejection — while the applicant's tab had
    // in some cases already gone to Calendly. The fall-through is tried first, and
    // the panel is raised before the hand-off either way.
    openedTab.location.replace = vi.fn(() => {
      throw new DOMException("denied", "SecurityError");
    });
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });

    // The named open is the next mechanism, and it worked.
    await screen.findByText(/finish on calendly/i);
    expect((openSpy.mock.calls.at(-1) as unknown[])[1]).toBe("_blank");
  });

  it("falls back to the blocked panel when EVERY mechanism refuses", async () => {
    openedTab.location.replace = vi.fn(() => {
      throw new DOMException("denied", "SecurityError");
    });
    openSpy.mockImplementation((url: string) => (url === "" ? openedTab : null));
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });

    // Something is always said, and it is the honest face: no confirmation
    // control, and the anchor that needs no platform reasoning.
    await screen.findByText(/your browser blocked the new tab/i);
    expect(screen.queryByRole("button", { name: /i confirmed my time/i })).toBeNull();
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(false);
    expect(
      screen.getByRole("link", { name: /open your time on calendly/i }),
    ).toBeTruthy();
  });

  it("offers the same slot again after a hand-off that DID happen", async () => {
    // The belt to the braces: nothing in this document can see a Calendly tab, so
    // the panel that says one opened also carries the link that reopens it.
    renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });

    const again = await screen.findByRole("link", { name: /open that time again/i });
    expect(new URL(again.getAttribute("href") as string).pathname).toContain(
      "2026-12-25T09:30:00Z",
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   3c. THE TAP MUST SURVIVE THE NEXT ANSWER FROM THE AVAILABILITY API.

       `refetchOnWindowFocus` fires exactly when the student comes back from
       Calendly — which is the one moment on this surface where being wrong costs
       a second held slot. Two ways the answer can be empty, and neither of them
       may take away the panel that records the booking:

         • the call did not go through (a mobile blip, an edge cold start, a
           Calendly 429) — the list is not the calendar's answer at all and must
           not overwrite three good buttons;
         • the call DID go through and the calendar is now empty, because the
           student just took the last opening — an honest answer, so the list goes
           and the hosted calendar takes its place, but the panel stays.
   ──────────────────────────────────────────────────────────────────────────── */

describe("a background refetch after the tap", () => {
  it("does not blank a good list because the call failed", async () => {
    slotsResponses.queue = [THREE_SLOTS, THREE_SLOTS, { data: null, error: { message: "network" } }];
    const { client } = renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    await screen.findByRole("button", { name: /i confirmed my time/i });

    await backgroundRefetch(client);

    // The slots are still there — an answer we did not get is not an empty
    // calendar — and so is the panel that can record what the student just did.
    expect(await slotButtons()).toHaveLength(3);
    expect(screen.getByRole("button", { name: /i confirmed my time/i })).toBeTruthy();
    expect(screen.queryByTitle("Schedule your interview")).toBeNull();
  });

  it("keeps the hand-off panel when the student took the LAST opening", async () => {
    // The honest empty answer. The list legitimately goes and the hosted calendar
    // replaces it — but the panel is built outside the slot branch precisely so
    // that this does not delete the student's own confirmation control and serve
    // them a fresh open calendar seconds after they booked.
    slotsResponses.queue = [
      THREE_SLOTS,
      THREE_SLOTS,
      { data: { slots: [], reason: "no_slots" }, error: null },
    ];
    const { client } = renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    await screen.findByRole("button", { name: /i confirmed my time/i });

    await backgroundRefetch(client);

    // The fallback is up, as it should be...
    expect(await embedFrame()).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Book / })).toBeNull();
    // ...and the panel came with it, still pointed at the same slot.
    expect(screen.getByText(/finish on calendly/i)).toBeTruthy();
    const again = screen.getByRole("link", { name: /open that time again/i });
    expect(new URL(again.getAttribute("href") as string).pathname).toContain(
      "2026-12-25T09:30:00Z",
    );

    // And the marker can still be written, which is the whole point: without it
    // the next render invites a second booking that carries no `old_invitee`.
    const confirm = screen.getByRole("button", { name: /i confirmed my time/i });
    act(() => {
      confirm.click();
    });
    act(() => {
      screen.getByRole("button", { name: /yes, i have my time/i }).click();
    });
    await screen.findByText(/your interview time is booked/i);
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(true);
  });

  it("carries the panel onto the NATIVE fallback too", async () => {
    platform.native = true;
    slotsResponses.queue = [
      THREE_SLOTS,
      THREE_SLOTS,
      { data: { slots: [], reason: "no_slots" }, error: null },
    ];
    const { client } = renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    await screen.findByRole("button", { name: /i confirmed my time/i });

    await backgroundRefetch(client);

    // The hosted hand-off is the native fallback, so waiting on it is waiting on
    // the branch swap itself.
    expect(await screen.findByRole("link", { name: /open your calendar/i })).toBeTruthy();
    expect(screen.getByText(/finish on calendly/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /i confirmed my time/i })).toBeTruthy();
  });

  it("keeps every control on the carried panel at the 44px floor", async () => {
    // jsdom lays nothing out, so this asserts the TOKEN that carries the target
    // size rather than a measured box — which is the honest thing it can check and
    // is what a regression would actually break. The panel is the same markup on
    // every branch; what changed is which branches render it, so the floor is
    // re-asserted on the branch it is newly reachable from.
    slotsResponses.queue = [
      THREE_SLOTS,
      THREE_SLOTS,
      { data: { slots: [], reason: "no_slots" }, error: null },
    ];
    const { client } = renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    await screen.findByRole("button", { name: /i confirmed my time/i });
    await backgroundRefetch(client);
    await embedFrame();

    for (const name of [
      /i confirmed my time/i,
      /pick a different time/i,
    ] as const) {
      expect(screen.getByRole("button", { name }).className).toContain("min-h-[44px]");
    }
    expect(
      screen.getByRole("link", { name: /open that time again/i }).className,
    ).toContain("min-h-[44px]");
  });

  it("lets go of a list it held through an outage once those times have passed", async () => {
    // Holding a list is a claim that it is still bookable. If the outage outlives
    // the openings, the claim stops being true and the hosted calendar is the
    // honest surface.
    const past = "2020-01-01T09:30:00.000000Z";
    slotsResponses.queue = [
      { data: { slots: [slot(past)], reason: null }, error: null },
      { data: null, error: { message: "network" } },
    ];
    const { client } = renderSurface();
    await slotButtons();

    await backgroundRefetch(client);

    expect(await embedFrame()).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Book / })).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   4. Never a dead end — every failure lands on the hosted calendar.
   ──────────────────────────────────────────────────────────────────────────── */

describe("the fallback ladder", () => {
  it("falls back to the hosted calendar when there are no slots", async () => {
    slotsResponses.queue = [{ data: { slots: [], reason: "no_slots" }, error: null }];
    renderSurface();
    expect(await embedFrame()).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Book / })).toBeNull();
  });

  it("falls back when Calendly throttles us", async () => {
    slotsResponses.queue = [{ data: { slots: [], reason: "rate_limited" }, error: null }];
    renderSurface();
    expect(await embedFrame()).toBeTruthy();
  });

  it("falls back when the availability call fails outright", async () => {
    slotsResponses.queue = [{ data: null, error: { message: "boom" } }];
    renderSurface();
    expect(await embedFrame()).toBeTruthy();
  });

  it("renders NOTHING when the offering has no booking step at all", async () => {
    // The admin's switch is off. The marketing gate renders nothing here, so the
    // app path must too — copy on a pure misconfiguration is a promise about a
    // state the applicant cannot influence, and a retry that can never succeed is
    // a permanent fake outage.
    offeringRow.current = {
      data: { calendly_url: "https://calendly.com/levelup/interview", thankyou_show_calendly: false },
      error: null,
    };
    const { container } = renderSurface();
    await waitFor(() => {
      expect(container.querySelector("[aria-busy='true']")).toBeNull();
    });
    expect(container.textContent).toBe("");
  });

  it("says so, retryably, when the offering row could not be READ", async () => {
    offeringRow.current = { data: null, error: { message: "network" } };
    renderSurface();
    expect(await screen.findByText(/could not load your interview calendar/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /check again/i })).toBeTruthy();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   5. The booked signal — origin-pinned, on the fallback frame.
   ──────────────────────────────────────────────────────────────────────────── */

describe("the booked signal — origin-pinned", () => {
  beforeEach(() => {
    // The message channel only exists where a frame does: the fallback.
    slotsResponses.queue = [{ data: { slots: [], reason: "no_slots" }, error: null }];
  });

  it("accepts calendly.com and rejects everything else", () => {
    const scheduled = { event: "calendly.event_scheduled" };
    expect(
      isCalendlyBookedMessage(
        new MessageEvent("message", { data: scheduled, origin: CALENDLY_ORIGIN }),
      ),
    ).toBe(true);
    expect(
      isCalendlyBookedMessage(
        new MessageEvent("message", { data: scheduled, origin: "https://evil.example.com" }),
      ),
    ).toBe(false);
    // Lookalike hosts must not pass the suffix check.
    expect(
      isCalendlyBookedMessage(
        new MessageEvent("message", { data: scheduled, origin: "https://calendly.com.evil.io" }),
      ),
    ).toBe(false);
    // Right origin, wrong message.
    expect(
      isCalendlyBookedMessage(
        new MessageEvent("message", {
          data: { event: "calendly.event_type_viewed" },
          origin: CALENDLY_ORIGIN,
        }),
      ),
    ).toBe(false);
    // Right origin, no payload at all.
    expect(
      isCalendlyBookedMessage(new MessageEvent("message", { data: null, origin: CALENDLY_ORIGIN })),
    ).toBe(false);
  });

  it("does not withdraw the calendar for a message from a foreign origin", async () => {
    renderSurface();
    await embedFrame();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { event: "calendly.event_scheduled" },
          origin: "https://evil.example.com",
        }),
      );
    });

    expect(await embedFrame()).toBeTruthy();
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(false);
  });

  it("withdraws the calendar and records the booking on a genuine message", async () => {
    renderSurface();
    await embedFrame();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { event: "calendly.event_scheduled" },
          origin: CALENDLY_ORIGIN,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/your interview time is booked/i)).toBeTruthy();
    });
    expect(screen.queryByTitle("Schedule your interview")).toBeNull();
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   6. The marker survives a reload, and does not become a cage.
   ──────────────────────────────────────────────────────────────────────────── */

describe("the booked marker — durable, bounded, scoped, and escapable", () => {
  it("is written to persistent storage, not just to the tab's session", () => {
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    // sessionStorage dies with the tab and with an evicted WebView; a booking
    // that a reload can forget is not a booking record.
    expect(localStorage.getItem(calendlyBookedKey(OFFERING_ID, IDENTITY))).toBeTruthy();
  });

  it("outlives the webhook lag but NOT a same-day cancellation", () => {
    const now = Date.now();
    rememberCalendlyBooked(OFFERING_ID, IDENTITY, now);
    // Far more than the receiver needs…
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY, now + 10 * 60_000)).toBe(true);
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY, now + CALENDLY_BOOKED_TTL_MS - 1_000)).toBe(true);
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY, now + CALENDLY_BOOKED_TTL_MS + 1_000)).toBe(false);
    // …and gone long before a cancellation could plausibly arrive. The parent
    // mounts this component for the REBOOK path, so a marker that survives to
    // day 3 answers "Rebook" with "your interview time is booked".
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY, now + 24 * 60 * 60 * 1000)).toBe(false);
    expect(CALENDLY_BOOKED_TTL_MS).toBeLessThan(6 * 60 * 60 * 1000);
  });

  it("is scoped per offering — one cohort's booking never hides another's", () => {
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    expect(readCalendlyBooked("off_other", IDENTITY)).toBe(false);
  });

  it("is scoped per applicant — a shared handset never withdraws B's calendar", () => {
    // A telecaller or a family member books for A on this phone; B opens the
    // same offering on the same device. Keyed by offering alone, B is told their
    // interview is booked and the calendar is taken away — the exact
    // fee-paid-but-never-scheduled loss this phase exists to close.
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    expect(readCalendlyBooked(OFFERING_ID, OTHER_IDENTITY)).toBe(false);
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(true);
  });

  it("stores no readable identifier and treats the email case-insensitively", () => {
    rememberCalendlyBooked(OFFERING_ID, "  Asha@Example.com ");
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(true);
    // The key is a shared-device artefact; it must not spell out who booked.
    expect(calendlyBookedKey(OFFERING_ID, IDENTITY)).not.toContain("asha");
    expect(calendlyBookedKey(OFFERING_ID, IDENTITY)).not.toContain("@");
  });

  it("keeps an UNOWNED marker out of device-durable storage", () => {
    // A guest order with no email cannot be scoped to anybody, so it must not be
    // written where the next person to pick up the phone will read it. The
    // tab-scoped copy still survives the reload this mechanism is about.
    rememberCalendlyBooked(OFFERING_ID, null);
    expect(localStorage.getItem(calendlyBookedKey(OFFERING_ID, null))).toBeNull();
    expect(sessionStorage.getItem(calendlyBookedKey(OFFERING_ID, null))).toBeTruthy();
    expect(readCalendlyBooked(OFFERING_ID, null)).toBe(true);
  });

  it("ignores a value it cannot date instead of withdrawing the calendar", () => {
    // Reading an unshaped value as "booked" strands whoever it belongs to, and
    // there is no reconciled record behind it to argue from. Sweep and offer.
    localStorage.setItem(calendlyBookedKey(OFFERING_ID, IDENTITY), "1");
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(false);
    expect(localStorage.getItem(calendlyBookedKey(OFFERING_ID, IDENTITY))).toBeNull();
  });

  it("survives a full remount: the slots are not re-offered", async () => {
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    const first = renderSurface();
    await screen.findByText(/your interview time is booked/i);
    first.unmount();

    renderSurface();
    await waitFor(() => {
      expect(screen.getByText(/your interview time is booked/i)).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: /^Book / })).toBeNull();
  });

  it("paints no slot skeleton on the way into the booked panel", () => {
    // `booked` comes from storage synchronously; the two queries are pending for
    // the whole round trip on every cold reload. Checking the skeleton first
    // reserves space for a surface that will never render and then collapses,
    // shoving the reschedule card and the entire timeline on a 360×740 screen.
    // Asserted on FIRST PAINT, synchronously — the only moment it is pending.
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    const { container } = renderSurface();
    expect(container.querySelector("[aria-busy='true']")).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.getByText(/your interview time is booked/i)).toBeTruthy();
  });

  it("gives a way back that is true for a CANCELLED booking, not just a failed one", async () => {
    // The parent mounts this component for the rebook path, so this panel is
    // reachable by somebody whose booking did go through and was then cancelled.
    // An exit reading "my booking did not go through" is false for them and
    // argues against the one tap they need.
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    renderSurface();
    const reopen = await screen.findByRole("button", { name: /reopen the calendar/i });
    expect(reopen.textContent ?? "").toMatch(/cancell?ed/i);
    act(() => {
      reopen.click();
    });

    // Guarded, and the guard names the cost rather than merely asking twice: a
    // second held slot carries no `old_invitee` for the receiver to reconcile
    // against (§6.4).
    const confirm = await screen.findByRole("button", { name: /yes, pick a new time/i });
    act(() => {
      confirm.click();
    });

    await waitFor(() => {
      expect(screen.queryByText(/your interview time is booked/i)).toBeNull();
    });
    // Cleared for good, or the next mount would restore the withdrawn panel.
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(false);
    expect(await slotButtons()).toHaveLength(3);
  });

  it("forgetCalendlyBooked clears every store it was written to", () => {
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    forgetCalendlyBooked(OFFERING_ID, IDENTITY);
    expect(localStorage.getItem(calendlyBookedKey(OFFERING_ID, IDENTITY))).toBeNull();
    expect(sessionStorage.getItem(calendlyBookedKey(OFFERING_ID, IDENTITY))).toBeNull();
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   7. NFR-COPY-4 / REQ-INT-2 over the surface every applicant reaches.
   ──────────────────────────────────────────────────────────────────────────── */

describe("copy — the words this surface may never render", () => {
  it("is clean in the slots state", async () => {
    const { container } = renderSurface();
    await slotButtons();
    expectCleanCopy(container.textContent);
  });

  it("is clean after a tap, while Calendly is confirming", async () => {
    const { container } = renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    await screen.findByRole("button", { name: /i confirmed my time/i });
    expectCleanCopy(container.textContent);
  });

  it("is clean when the browser blocked the tab", async () => {
    openSpy.mockReturnValue(null);
    const { container } = renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    await screen.findByText(/your browser blocked the new tab/i);
    expectCleanCopy(container.textContent);
  });

  it("is clean when the panel is carried onto the hosted-calendar fallback", async () => {
    slotsResponses.queue = [
      THREE_SLOTS,
      THREE_SLOTS,
      { data: { slots: [], reason: "no_slots" }, error: null },
    ];
    const { container, client } = renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    await screen.findByRole("button", { name: /i confirmed my time/i });
    await backgroundRefetch(client);
    await embedFrame();
    expectCleanCopy(container.textContent);
  });

  it("is clean in the guarded confirmation, which both panels ask", async () => {
    const { container } = renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    const confirm = await screen.findByRole("button", { name: /i confirmed my time/i });
    act(() => {
      confirm.click();
    });
    await screen.findByRole("button", { name: /yes, i have my time/i });
    expectCleanCopy(container.textContent);
  });

  it("is clean when a re-check leaves nothing to re-offer", async () => {
    slotsResponses.queue = [
      THREE_SLOTS,
      { data: { slots: [], reason: "no_slots" }, error: null },
    ];
    const { container } = renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    await screen.findByText(/nothing else is open/i);
    expectCleanCopy(container.textContent);
  });

  it("is clean in the re-offered state", async () => {
    slotsResponses.queue = [
      THREE_SLOTS,
      { data: { slots: [slot(SLOT_B), slot(SLOT_C)], reason: null }, error: null },
    ];
    const { container } = renderSurface();
    const buttons = await slotButtons();
    act(() => {
      buttons[0].click();
    });
    await screen.findByText(/that time was just taken/i);
    expectCleanCopy(container.textContent);
  });

  it("is clean on the hosted-calendar fallback", async () => {
    slotsResponses.queue = [{ data: { slots: [], reason: "no_slots" }, error: null }];
    const { container } = renderSurface();
    await embedFrame();
    expectCleanCopy(container.textContent);
  });

  it("is clean in the booked state, including the reopen control", async () => {
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    const { container } = renderSurface();
    await screen.findByText(/your interview time is booked/i);
    expectCleanCopy(container.textContent);
  });

  it("is clean in the could-not-load state", async () => {
    offeringRow.current = { data: null, error: { message: "network" } };
    const { container } = renderSurface();
    await screen.findByText(/could not load your interview calendar/i);
    expectCleanCopy(container.textContent);
  });
});
