import { describe, it, expect } from "vitest";
import { hmacSha256Hex, timingSafeEqual } from "@shared/crypto";
import {
  bookingFromEvent,
  eventTypeOf,
  isAllowedEventType,
  isFreshSignature,
  modalityFromEvent,
  parseEventTypeAllowlist,
  parseSignatureHeader,
  signingPayload,
  SIGNATURE_TOLERANCE_SECONDS,
} from "@shared/calendly";

/**
 * V-1 — the proof. The PURE Calendly core (`@shared/calendly`) is driven over the
 * signature header grammar, the §6.2 signing string, the §6.3 location→modality
 * table, and the booking facts of both delivered events — with ZERO network and no
 * mocking. The signing-string test closes the loop by recomputing the HMAC with
 * `@shared/crypto`, the same primitives the receiver uses, so "a bad signature is
 * rejected" is asserted rather than asserted-about.
 *
 * The receiver's I/O layer (`calendly-webhook/index.ts`) is not vitest-importable —
 * it imports esm.sh and has a top-level `Deno.serve` — so its DB writes are covered
 * by `npm run typecheck:functions` plus the deploy-step checks. Every DECISION it
 * makes, however, is one of the pure functions below.
 */

const SIGNING_KEY = "test-signing-key";

/** A realistic `invitee.created` envelope (04-INTEGRATION-CONTRACTS.md §6.3). */
function meetEvent(overrides: Record<string, unknown> = {}) {
  return {
    event: "invitee.created",
    payload: {
      email: "Applicant@Example.com",
      name: "Applicant",
      text_reminder_number: "+919788385577",
      status: "active",
      uri: "https://api.calendly.com/scheduled_events/EVT1/invitees/INV1",
      created_at: "2026-07-28T09:00:00.000000Z",
      old_invitee: null,
      new_invitee: null,
      rescheduled: false,
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/EVT1",
        name: "LevelUp Cohort Interview",
        event_type: "https://api.calendly.com/event_types/ET-INTERVIEW",
        start_time: "2026-07-30T13:00:00.000000Z",
        status: "active",
        location: {
          type: "google_conference",
          join_url: "https://meet.google.com/abc-defg-hij",
        },
      },
      ...overrides,
    },
  };
}

/** Same booking, but Calendly's outbound-call location. */
function phoneEvent() {
  return meetEvent({
    text_reminder_number: null,
    scheduled_event: {
      uri: "https://api.calendly.com/scheduled_events/EVT2",
      start_time: "2026-07-30T13:00:00.000000Z",
      status: "active",
      location: { type: "outbound_call", location: "+91 97883 85577" },
    },
  });
}

describe("parseSignatureHeader — the §6.2 header grammar, fail-closed", () => {
  it("splits t and v1", () => {
    expect(parseSignatureHeader("t=1753600000,v1=deadbeef")).toEqual({
      t: "1753600000",
      v1: "deadbeef",
    });
  });

  it("tolerates whitespace and reversed order", () => {
    expect(parseSignatureHeader(" v1=DEADBEEF , t=1753600000 ")).toEqual({
      t: "1753600000",
      v1: "DEADBEEF",
    });
  });

  it("returns null for an absent, empty or half-formed header", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader(undefined)).toBeNull();
    expect(parseSignatureHeader("")).toBeNull();
    expect(parseSignatureHeader("t=1753600000")).toBeNull();
    expect(parseSignatureHeader("v1=deadbeef")).toBeNull();
    expect(parseSignatureHeader("nonsense")).toBeNull();
  });

  it("rejects a non-numeric t and a non-hex v1 rather than signing them", () => {
    expect(parseSignatureHeader("t=not-a-time,v1=deadbeef")).toBeNull();
    expect(parseSignatureHeader("t=1753600000,v1=zzzz")).toBeNull();
    expect(parseSignatureHeader("t=1753600000,v1=dead beef")).toBeNull();
  });

  it("honours only the FIRST v1, so a rotation header cannot widen the trusted set", () => {
    expect(parseSignatureHeader("t=1753600000,v1=aaaa,v1=bbbb")?.v1).toBe("aaaa");
  });
});

describe("signingPayload + HMAC — a good signature verifies, a bad one does not", () => {
  const t = "1753600000";
  const rawBody = JSON.stringify(meetEvent());

  it("signs exactly `${t}.${rawBody}`", () => {
    expect(signingPayload(t, rawBody)).toBe(`${t}.${rawBody}`);
  });

  it("verifies a correctly-signed delivery end to end", async () => {
    const v1 = await hmacSha256Hex(signingPayload(t, rawBody), SIGNING_KEY);
    const parsed = parseSignatureHeader(`t=${t},v1=${v1}`);
    expect(parsed).not.toBeNull();
    const expected = await hmacSha256Hex(signingPayload(parsed!.t, rawBody), SIGNING_KEY);
    expect(timingSafeEqual(expected, parsed!.v1.toLowerCase())).toBe(true);
  });

  it("rejects a tampered body, a replayed t and a wrong key", async () => {
    const v1 = await hmacSha256Hex(signingPayload(t, rawBody), SIGNING_KEY);

    const tampered = rawBody.replace("13:00:00", "09:00:00");
    expect(
      timingSafeEqual(await hmacSha256Hex(signingPayload(t, tampered), SIGNING_KEY), v1),
    ).toBe(false);

    expect(
      timingSafeEqual(await hmacSha256Hex(signingPayload("1753600001", rawBody), SIGNING_KEY), v1),
    ).toBe(false);

    expect(
      timingSafeEqual(await hmacSha256Hex(signingPayload(t, rawBody), "other-key"), v1),
    ).toBe(false);
  });

  it("accepts a t inside the replay window and refuses one outside it", () => {
    const now = Date.UTC(2026, 6, 28, 9, 0, 0);
    const at = (offsetSeconds: number) => String(Math.floor(now / 1000) + offsetSeconds);

    expect(isFreshSignature(at(0), now)).toBe(true);
    // Calendly's own retry backoff must still verify — the window is a day wide.
    expect(isFreshSignature(at(-6 * 60 * 60), now)).toBe(true);
    expect(isFreshSignature(at(-SIGNATURE_TOLERANCE_SECONDS), now)).toBe(true);
    // A delivery captured and replayed later, and a t implausibly in the future.
    expect(isFreshSignature(at(-SIGNATURE_TOLERANCE_SECONDS - 1), now)).toBe(false);
    expect(isFreshSignature(at(SIGNATURE_TOLERANCE_SECONDS + 1), now)).toBe(false);
    // A non-numeric t never signs and never passes.
    expect(isFreshSignature("not-a-time", now)).toBe(false);
  });

  it("is whitespace-sensitive, which is why the RAW body must be signed", async () => {
    const reserialised = JSON.stringify(JSON.parse(rawBody), null, 2);
    const a = await hmacSha256Hex(signingPayload(t, rawBody), SIGNING_KEY);
    const b = await hmacSha256Hex(signingPayload(t, reserialised), SIGNING_KEY);
    expect(timingSafeEqual(a, b)).toBe(false);
  });
});

describe("modalityFromEvent — the §6.3 table, and null for everything else", () => {
  it("maps google_conference to google_meet", () => {
    expect(modalityFromEvent(meetEvent())).toBe("google_meet");
  });

  it("maps outbound_call to phone", () => {
    expect(modalityFromEvent(phoneEvent())).toBe("phone");
  });

  it("maps a custom location to phone ONLY when it carries a phone number", () => {
    const custom = (location: string) =>
      meetEvent({
        scheduled_event: {
          uri: "https://api.calendly.com/scheduled_events/EVT3",
          start_time: "2026-07-30T13:00:00.000000Z",
          location: { type: "custom", location },
        },
      });
    expect(modalityFromEvent(custom("+91 97883 85577"))).toBe("phone");
    expect(modalityFromEvent(custom("We will call you on 9788385577"))).toBe("phone");
    expect(modalityFromEvent(custom("The LevelUp studio, Chennai"))).toBeNull();
    expect(modalityFromEvent(custom("https://example.com/room/12345678"))).toBeNull();
  });

  it("accepts `kind` as the alias for `type`", () => {
    const aliased = meetEvent({
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/EVT4",
        start_time: "2026-07-30T13:00:00.000000Z",
        location: { kind: "google_conference", join_url: "https://meet.google.com/x" },
      },
    });
    expect(modalityFromEvent(aliased)).toBe("google_meet");
  });

  it("yields null — never a guess — for an unrecognised location", () => {
    const withType = (location: unknown) =>
      meetEvent({
        scheduled_event: {
          uri: "https://api.calendly.com/scheduled_events/EVT5",
          start_time: "2026-07-30T13:00:00.000000Z",
          location,
        },
      });
    // Zoom is NEVER assumed for the interview, even though the cohort room runs on it.
    expect(modalityFromEvent(withType({ type: "zoom", join_url: "https://zoom.us/j/1" }))).toBeNull();
    expect(modalityFromEvent(withType({ type: "microsoft_teams_conference" }))).toBeNull();
    expect(modalityFromEvent(withType({ type: "physical", location: "Office" }))).toBeNull();
    expect(modalityFromEvent(withType({ type: "ask_invitee" }))).toBeNull();
    expect(modalityFromEvent(withType({ type: "some_future_provider" }))).toBeNull();
    expect(modalityFromEvent(withType({}))).toBeNull();
    expect(modalityFromEvent(withType("Google Meet"))).toBeNull();
    expect(modalityFromEvent(withType(null))).toBeNull();
  });

  it("yields null for a structurally absent payload instead of throwing", () => {
    expect(modalityFromEvent(null)).toBeNull();
    expect(modalityFromEvent(undefined)).toBeNull();
    expect(modalityFromEvent({})).toBeNull();
    expect(modalityFromEvent({ payload: {} })).toBeNull();
    expect(modalityFromEvent({ payload: { scheduled_event: {} } })).toBeNull();
    expect(modalityFromEvent("not-an-object")).toBeNull();
  });
});

describe("bookingFromEvent — the booking facts, and nothing derived", () => {
  it("reads the invitee, the start, and the event URI from invitee.created", () => {
    expect(bookingFromEvent(meetEvent())).toEqual({
      inviteeEmail: "Applicant@Example.com",
      inviteePhone: "+919788385577",
      startTime: "2026-07-30T13:00:00.000000Z",
      eventUri: "https://api.calendly.com/scheduled_events/EVT1",
      canceled: false,
      rescheduledFrom: null,
      rescheduled: false,
      rescheduledTo: null,
      bookedAt: "2026-07-28T09:00:00.000000Z",
    });
  });

  it("falls back to the call location for the phone when there is no text reminder number", () => {
    const booking = bookingFromEvent(phoneEvent());
    expect(booking?.inviteePhone).toBe("+91 97883 85577");
    expect(booking?.eventUri).toBe("https://api.calendly.com/scheduled_events/EVT2");
  });

  it("takes a phone from the location ONLY when the location is a call to the invitee", () => {
    const at = (location: unknown) =>
      meetEvent({
        text_reminder_number: null,
        scheduled_event: {
          uri: "https://api.calendly.com/scheduled_events/EVT6",
          start_time: "2026-07-30T13:00:00.000000Z",
          location,
        },
      });

    // Phone is the PRIMARY join key, so a digit-bearing address must never be read
    // as one: the suffix probe would resolve a DIFFERENT applicant's row and the
    // email fallback would never be reached.
    expect(
      bookingFromEvent(at({ type: "physical", location: "4th Floor, 100 Feet Road, Bengaluru 560038" }))
        ?.inviteePhone,
    ).toBeNull();
    expect(
      bookingFromEvent(at({ type: "google_conference", join_url: "https://meet.google.com/a-1234567890" }))
        ?.inviteePhone,
    ).toBeNull();
    expect(bookingFromEvent(at({ type: "zoom", location: "9788385577" }))?.inviteePhone).toBeNull();

    // outbound_call is the ONE location that carries the invitee's own number.
    expect(bookingFromEvent(at({ type: "outbound_call", location: "+91 97883 85577" }))?.inviteePhone)
      .toBe("+91 97883 85577");

    // A `custom` location is a STATIC string the host typed on the event type — the
    // same digits for every invitee — so it may say HOW the interview happens but
    // never WHOSE number it is. Reading it as identity would point every custom
    // booking at whichever row holds those digits.
    const custom = at({ type: "custom", location: "Call me on 9788385577" });
    expect(bookingFromEvent(custom)?.inviteePhone).toBeNull();
    expect(modalityFromEvent(custom)).toBe("phone");
  });

  it("flags cancellation from the event name, the invitee flag or either status", () => {
    expect(bookingFromEvent({ ...meetEvent(), event: "invitee.canceled" })?.canceled).toBe(true);
    expect(bookingFromEvent(meetEvent({ canceled: true }))?.canceled).toBe(true);
    expect(bookingFromEvent(meetEvent({ status: "canceled" }))?.canceled).toBe(true);
    expect(
      bookingFromEvent(
        meetEvent({
          scheduled_event: {
            uri: "https://api.calendly.com/scheduled_events/EVT1",
            start_time: "2026-07-30T13:00:00.000000Z",
            status: "canceled",
            location: { type: "google_conference" },
          },
        }),
      )?.canceled,
    ).toBe(true);
    expect(bookingFromEvent(meetEvent())?.canceled).toBe(false);
  });

  it("surfaces old_invitee, the only signal that a booking replaced another", () => {
    const rebooked = meetEvent({
      old_invitee: "https://api.calendly.com/scheduled_events/EVT0/invitees/INV0",
    });
    expect(bookingFromEvent(rebooked)?.rescheduledFrom).toBe(
      "https://api.calendly.com/scheduled_events/EVT0/invitees/INV0",
    );
    expect(bookingFromEvent(meetEvent())?.rescheduledFrom).toBeNull();
  });

  it("marks a reschedule's CANCEL half, so it is never read as a cancellation", () => {
    // Calendly fires invitee.canceled for the OLD invitee plus invitee.created for
    // the new one on every reschedule; the old half is the one carrying these.
    const rescheduledAway = {
      ...meetEvent({
        rescheduled: true,
        new_invitee: "https://api.calendly.com/scheduled_events/EVT9/invitees/INV9",
      }),
      event: "invitee.canceled",
    };
    const booking = bookingFromEvent(rescheduledAway);
    expect(booking?.canceled).toBe(true);
    expect(booking?.rescheduled).toBe(true);
    expect(booking?.rescheduledTo).toBe(
      "https://api.calendly.com/scheduled_events/EVT9/invitees/INV9",
    );

    // A real cancellation carries neither, which is what makes the two separable.
    const reallyCanceled = { ...meetEvent(), event: "invitee.canceled" };
    expect(bookingFromEvent(reallyCanceled)?.canceled).toBe(true);
    expect(bookingFromEvent(reallyCanceled)?.rescheduled).toBe(false);
    expect(bookingFromEvent(reallyCanceled)?.rescheduledTo).toBeNull();

    // `new_invitee` alone is enough — the boolean flag need not be present.
    expect(
      bookingFromEvent(
        meetEvent({ new_invitee: "https://api.calendly.com/scheduled_events/EVT9/invitees/INV9" }),
      )?.rescheduled,
    ).toBe(true);
  });

  it("carries the invitee's created_at, the only thing that orders two deliveries", () => {
    expect(bookingFromEvent(meetEvent())?.bookedAt).toBe("2026-07-28T09:00:00.000000Z");
    // updated_at is the fallback; absent both, we simply know less.
    expect(
      bookingFromEvent(meetEvent({ created_at: null, updated_at: "2026-07-28T10:00:00.000000Z" }))
        ?.bookedAt,
    ).toBe("2026-07-28T10:00:00.000000Z");
    expect(bookingFromEvent(meetEvent({ created_at: null }))?.bookedAt).toBeNull();
  });

  it("degrades to nulls on a partial payload rather than inventing facts", () => {
    expect(bookingFromEvent({ event: "invitee.created", payload: {} })).toEqual({
      inviteeEmail: null,
      inviteePhone: null,
      startTime: null,
      eventUri: null,
      canceled: false,
      rescheduledFrom: null,
      rescheduled: false,
      rescheduledTo: null,
      bookedAt: null,
    });
    expect(bookingFromEvent(meetEvent({ email: "   " }))?.inviteeEmail).toBeNull();
    expect(bookingFromEvent(null)).toBeNull();
    expect(bookingFromEvent({})).toBeNull();
    expect(bookingFromEvent({ payload: "nope" })).toBeNull();
  });

  it("never substitutes the invitee URI when the scheduled event carries none", () => {
    // The two URIs live in DIFFERENT Calendly namespaces, and this value is stored
    // as the row's idempotency key and compared against later deliveries'
    // SCHEDULED-EVENT uris. An invitee uri would therefore never match again, and
    // the genuine cancellation would be skipped as "not the booking we hold"
    // forever — acked 200, so never retried. Unkeyable is better than mis-keyed:
    // the receiver skips the delivery instead.
    const noEventUri = meetEvent({
      scheduled_event: { start_time: "2026-07-30T13:00:00.000000Z", location: { type: "custom" } },
    });
    expect(bookingFromEvent(noEventUri)?.eventUri).toBeNull();
    expect(bookingFromEvent(meetEvent())?.eventUri).toBe(
      "https://api.calendly.com/scheduled_events/EVT1",
    );
  });
});

describe("event-type scoping — one org-wide subscription, one interview event type", () => {
  const allowlist = parseEventTypeAllowlist("https://api.calendly.com/event_types/ET-INTERVIEW");

  /** The same booking on a DIFFERENT event type of the same org account. */
  const otherEventType = (eventType: unknown) =>
    meetEvent({
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/EVT7",
        name: "Sales call",
        event_type: eventType,
        start_time: "2026-07-30T13:00:00.000000Z",
        location: { type: "google_conference", join_url: "https://meet.google.com/x" },
      },
    });

  it("reads the event type from the scheduled event, as a URI or as an object", () => {
    expect(eventTypeOf(meetEvent())).toBe("https://api.calendly.com/event_types/ET-INTERVIEW");
    expect(eventTypeOf(otherEventType({ uri: "https://api.calendly.com/event_types/ET-SALES" })))
      .toBe("https://api.calendly.com/event_types/ET-SALES");
    // No event type named at all → the scheduled event's own name, for the log line.
    expect(eventTypeOf(otherEventType(null))).toBe("Sales call");
    expect(eventTypeOf(null)).toBeNull();
  });

  it("admits the configured interview event type", () => {
    expect(isAllowedEventType(meetEvent(), allowlist)).toBe(true);
    // The uuid alone, the hosted scheduling link and the event type's name are all
    // usable ways to configure the same type.
    expect(isAllowedEventType(meetEvent(), parseEventTypeAllowlist("ET-INTERVIEW"))).toBe(true);
    expect(
      isAllowedEventType(
        meetEvent({
          scheduled_event: {
            uri: "https://api.calendly.com/scheduled_events/EVT8",
            event_type: { uri: "https://api.calendly.com/event_types/ET-X", slug: "interview-30min" },
            start_time: "2026-07-30T13:00:00.000000Z",
            location: { type: "google_conference" },
          },
        }),
        parseEventTypeAllowlist("https://calendly.com/levelup/interview-30min"),
      ),
    ).toBe(true);
    expect(isAllowedEventType(meetEvent(), parseEventTypeAllowlist("LevelUp Cohort Interview")))
      .toBe(true);
  });

  it("turns away every other booking on the same org account", () => {
    // The subscription is org/user-scoped and cannot be filtered to one event type,
    // so a sales call lands here too. Mirroring it would overwrite the interview of
    // whoever's phone or email matched, and its cancellation would clear a real one.
    expect(isAllowedEventType(otherEventType("https://api.calendly.com/event_types/ET-SALES"), allowlist))
      .toBe(false);
    expect(isAllowedEventType(otherEventType({ slug: "onboarding-call" }), allowlist)).toBe(false);
    expect(isAllowedEventType(otherEventType(null), allowlist)).toBe(false);
  });

  it("matches NOTHING while the allowlist is unset — fail-closed, like the signing key", () => {
    expect(parseEventTypeAllowlist(null)).toEqual([]);
    expect(parseEventTypeAllowlist("")).toEqual([]);
    expect(parseEventTypeAllowlist("   ")).toEqual([]);
    expect(isAllowedEventType(meetEvent(), [])).toBe(false);
  });

  it("parses a comma-separated allowlist, case-insensitively", () => {
    const two = parseEventTypeAllowlist(
      "https://api.calendly.com/event_types/ET-INTERVIEW, ET-INTERVIEW-2",
    );
    expect(two).toContain("et-interview");
    expect(two).toContain("et-interview-2");
    expect(isAllowedEventType(meetEvent(), two)).toBe(true);
    expect(
      isAllowedEventType(
        otherEventType("https://api.calendly.com/event_types/ET-INTERVIEW-2"),
        two,
      ),
    ).toBe(true);
  });
});
