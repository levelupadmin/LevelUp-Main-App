import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * PHASE IV / P-2 — the Calendly embed, pinned on the three things that decide
 * whether a student can double-book.
 *
 * 1. THE EMBED MUST SIGNAL THAT IT IS EMBEDDED. Calendly only posts
 *    `calendly.event_scheduled` to a parent frame when the booking URL carries
 *    `embed_domain` and `embed_type`. Without them the listener below is dead
 *    code, the surface never learns a booking happened, and it serves a fresh
 *    open calendar under "This is the last step". Both entry points build that
 *    URL — the app path here and the marketing path in `pages/ThankYou.tsx` —
 *    off the SAME `offerings.calendly_url`, so both are asserted
 *    (ENTRY-PARITY-1: fixing one is the divergence the rule forbids).
 * 2. THE LISTENER MUST STAY ORIGIN-PINNED. A surface that can be blanked by any
 *    frame posting at the window is worse than no surface.
 * 3. THE BOOKED STATE MUST SURVIVE A RELOAD. A signal that only exists until
 *    refresh is not a booking record. The webhook is the durable record but it
 *    lags, and the UI must not invite a second booking in that gap.
 * 4. AND IT MUST NOT BECOME A CAGE. The same marker, held too long or held
 *    against the wrong person, strands somebody: a student whose slot was
 *    cancelled taps "Rebook" (the parent mounts this component for that path
 *    too) and a stale marker greets them with "your interview time is booked",
 *    and a device-durable marker keyed by offering alone withdraws the calendar
 *    from the next person to sign in on a shared handset. Both are the
 *    fee-paid-but-never-scheduled loss this phase exists to close, caused by the
 *    fix for it — so the bound and the identity scope are pinned here.
 *
 * Plus the NFR-COPY-4 / REQ-INT-2 copy grep, which `interview-surfaces.test.tsx`
 * runs over the other three interview components and which this surface — the
 * one every applicant actually reaches — had no guard for.
 */

/* ── Web Storage, which this jsdom build does not ship. Node 22 defines a
      `localStorage` global that stays `undefined` without `--localstorage-file`,
      and it shadows jsdom's, so `window.localStorage` and `window.sessionStorage`
      are both undefined under vitest. The production surfaces (every browser and
      both WebViews) have them; the marker's own fallbacks are what keep it from
      throwing where they are missing, and those are exercised by the fact that
      the component renders at all before this is installed. Install a real
      Map-backed Storage so the durability rules can be asserted. ───────────── */

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

/* ── Boundaries. The component reads one `offerings` row through react-query and
      taps a haptic; neither is what this spec is about. ────────────────────── */

const offeringRow = vi.hoisted(() => ({
  current: {
    data: {
      calendly_url: "https://calendly.com/levelup/interview",
      thankyou_show_calendly: true,
    } as { calendly_url: string | null; thankyou_show_calendly: boolean } | null,
    error: null as unknown,
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve(offeringRow.current));
  return { supabase: { from: vi.fn(() => builder) } };
});

vi.mock("@/lib/haptics", () => ({
  tapTick: vi.fn(() => Promise.resolve()),
  hapticNotification: vi.fn(() => Promise.resolve()),
  hapticImpact: vi.fn(() => Promise.resolve()),
  hapticSelection: vi.fn(() => Promise.resolve()),
}));

// Web, so the inline frame renders. Native is the hosted hand-off and has no
// frame to listen to.
vi.mock("@/lib/platform", () => ({
  isNative: () => false,
  isAndroid: () => false,
  isIOS: () => false,
  isWeb: () => true,
}));

import { InterviewEmbed } from "@/components/interview/SlotButtons";
import {
  CALENDLY_BOOKED_TTL_MS,
  CALENDLY_EMBED_TYPE,
  calendlyBookedKey,
  calendlyBookingUrl,
  calendlyEmbedUrl,
  forgetCalendlyBooked,
  isCalendlyBookedMessage,
  readCalendlyBooked,
  rememberCalendlyBooked,
} from "@/hooks/useInterviewSlots";

const OFFERING_ID = "off_interview_1";
const CALENDLY_ORIGIN = "https://calendly.com";
/** The marker is scoped to the invitee email the frame is prefilled with. */
const IDENTITY = "asha@example.com";
const OTHER_IDENTITY = "bhavna@example.com";

/** REQ-INT-2 / NFR-COPY-4 — the words no interview surface may ever render. */
const FORBIDDEN = [/mentor/i, /counsell?or/i, /free/i, /zoom/i];

function expectCleanCopy(text: string | null | undefined) {
  for (const pattern of FORBIDDEN) {
    expect(text ?? "", `copy matched ${pattern}`).not.toMatch(pattern);
  }
}

/** A fresh client per render so one test's cache never answers another's query. */
function renderEmbed(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(InterviewEmbed, {
        offeringId: OFFERING_ID,
        name: "Asha Iyer",
        email: IDENTITY,
        ...props,
      } as never),
    ),
  );
}

const embedFrame = () => screen.findByTitle("Schedule your interview");

beforeEach(() => {
  offeringRow.current = {
    data: { calendly_url: "https://calendly.com/levelup/interview", thankyou_show_calendly: true },
    error: null,
  };
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

/* ────────────────────────────────────────────────────────────────────────────
   1. The builder — the embed contract, and the prefill field set it must not
      quietly change.
   ──────────────────────────────────────────────────────────────────────────── */

describe("calendlyEmbedUrl — the params that make the embed signal at all", () => {
  it("carries embed_domain and embed_type", () => {
    const url = new URL(calendlyEmbedUrl("https://calendly.com/levelup/interview"));
    expect(url.searchParams.get("embed_domain")).toBe(window.location.host);
    expect(url.searchParams.get("embed_type")).toBe(CALENDLY_EMBED_TYPE);
  });

  it("takes the embed domain from the live document, not a constant", () => {
    // A hardcoded production host would kill the signal on every preview
    // deploy and on localhost — the two places a regression would be caught.
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

/* ────────────────────────────────────────────────────────────────────────────
   2. Both entry points, off one builder.
   ──────────────────────────────────────────────────────────────────────────── */

describe("ENTRY-PARITY-1 — both surfaces build the same signalling URL", () => {
  it("the app path's iframe src carries both embed params and the prefill", async () => {
    renderEmbed();
    const frame = (await embedFrame()) as HTMLIFrameElement;
    const url = new URL(frame.src);
    expect(url.origin).toBe(CALENDLY_ORIGIN);
    expect(url.searchParams.get("embed_domain")).toBe(window.location.host);
    expect(url.searchParams.get("embed_type")).toBe(CALENDLY_EMBED_TYPE);
    expect(url.searchParams.get("email")).toBe("asha@example.com");
  });

  it("the marketing path (ThankYou) builds its src through the same helper", async () => {
    // Read as source rather than rendered, because the assertion IS structural:
    // the divergence this guards is `ThankYou.tsx` going back to hand-rolling
    // `?name=&email=`, which would still render a working calendar while
    // silently failing to signal that it is embedded.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(process.cwd(), "src/pages/ThankYou.tsx"),
      "utf8",
    );
    expect(src).toContain("calendlyEmbedUrl(");
    // The old hand-concatenated src, in the shape that would reintroduce the bug.
    expect(src).not.toMatch(/calendly_url\}\$\{/);
    expect(src).not.toMatch(/includes\("\?"\)/);
  });

  it("the marketing path listens for the message it now asks Calendly to send", async () => {
    // ENTRY-PARITY-1 is about the same FLOW, not only the same URL. With
    // `embed_domain` set, Calendly posts `calendly.event_scheduled` at
    // /thank-you too; a page that asks for the message and drops it re-serves
    // an open calendar under "Book Your Interview" on the next reload, which is
    // the double-booking invitation this task exists to close — and it reaches
    // guests through the payment-receipt link, days later.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(process.cwd(), "src/pages/ThankYou.tsx"),
      "utf8",
    );
    expect(src).toContain("useCalendlyBookedSignal(");
    // And it must actually branch on it rather than merely call it.
    expect(src).toMatch(/interviewBooked\.booked/);
  });

  it("the marketing path's built src carries both embed params", () => {
    // The exact call ThankYou makes, with its own field sources (guest_name /
    // guest_email), proven against the same builder the app path uses.
    const url = new URL(
      calendlyEmbedUrl("https://calendly.com/levelup/interview", {
        name: "Guest Buyer",
        email: "guest@example.com",
      }),
    );
    expect(url.searchParams.get("embed_domain")).toBe(window.location.host);
    expect(url.searchParams.get("embed_type")).toBe(CALENDLY_EMBED_TYPE);
    expect(url.searchParams.get("name")).toBe("Guest Buyer");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   3. The listener stays pinned to calendly.com.
   ──────────────────────────────────────────────────────────────────────────── */

describe("the booked signal — origin-pinned", () => {
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
    renderEmbed();
    await embedFrame();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { event: "calendly.event_scheduled" },
          origin: "https://evil.example.com",
        }),
      );
    });

    // Still the calendar, and nothing was written down.
    expect(await embedFrame()).toBeTruthy();
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(false);
  });

  it("withdraws the calendar and records the booking on a genuine message", async () => {
    renderEmbed();
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
   4. The state survives a reload.
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
    // same offering on the same device. Keyed by offering alone, B is told
    // their interview is booked and the calendar is taken away — the exact
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
    // A guest order with no email cannot be scoped to anybody, so it must not
    // be written where the next person to pick up the phone will read it. The
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

  it("survives a full remount: the calendar is not re-offered", async () => {
    // Book, then throw the whole tree away and mount it fresh, which is what a
    // reload does to component state. Storage is the only thing that carries
    // over — exactly the point.
    const first = renderEmbed();
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
    first.unmount();

    renderEmbed();
    await waitFor(() => {
      expect(screen.getByText(/your interview time is booked/i)).toBeTruthy();
    });
    expect(screen.queryByTitle("Schedule your interview")).toBeNull();
  });

  it("mounts straight into the booked state when storage already says so", async () => {
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    renderEmbed();
    await waitFor(() => {
      expect(screen.getByText(/your interview time is booked/i)).toBeTruthy();
    });
    // Never a flash of open calendar on the way there.
    expect(screen.queryByTitle("Schedule your interview")).toBeNull();
  });

  it("paints no 700px calendar skeleton on the way into the booked panel", () => {
    // `booked` comes from storage synchronously; `isWaiting` is true for the
    // whole `offerings` round trip on every cold reload. Checking the skeleton
    // first reserves 700px for a frame that will never render and then collapses
    // to the ~200px panel, shoving the reschedule card and the entire timeline
    // up by ~500px on a 360×740 screen. Asserted on FIRST PAINT, synchronously,
    // because that is the only moment the query is still pending.
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    const { container } = renderEmbed();
    expect(container.querySelector("[aria-busy='true']")).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.getByText(/your interview time is booked/i)).toBeTruthy();
  });

  it("gives a way back that is true for a CANCELLED booking, not just a failed one", async () => {
    // The parent mounts this component for the rebook path, so this panel is
    // reachable by somebody whose booking did go through and was then
    // cancelled. An exit reading "my booking did not go through" is false for
    // them and argues against the one tap they need.
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    renderEmbed();
    const reopen = await screen.findByRole("button", { name: /reopen the calendar/i });
    expect(reopen.textContent ?? "").toMatch(/cancell?ed/i);
    act(() => {
      reopen.click();
    });
    await waitFor(() => {
      expect(screen.getByTitle("Schedule your interview")).toBeTruthy();
    });
    // Cleared for good, or the next mount would restore the withdrawn panel.
    expect(readCalendlyBooked(OFFERING_ID, IDENTITY)).toBe(false);
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
   5. NFR-COPY-4 / REQ-INT-2 over the surface every applicant reaches.
   ──────────────────────────────────────────────────────────────────────────── */

describe("copy — the words this surface may never render", () => {
  it("is clean in the open-calendar state", async () => {
    const { container } = renderEmbed();
    await embedFrame();
    expectCleanCopy(container.textContent);
  });

  it("is clean in the booked state, including the reopen control", async () => {
    rememberCalendlyBooked(OFFERING_ID, IDENTITY);
    const { container } = renderEmbed();
    await screen.findByText(/your interview time is booked/i);
    expectCleanCopy(container.textContent);
  });

  it("is clean in the could-not-load state", async () => {
    offeringRow.current = { data: null, error: { message: "network" } };
    const { container } = renderEmbed();
    await screen.findByText(/could not load your interview calendar/i);
    expectCleanCopy(container.textContent);
  });
});
