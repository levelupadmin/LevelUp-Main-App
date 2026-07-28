import { describe, it, expect } from "vitest";
import { hmacSha256Hex, timingSafeEqual } from "@shared/crypto";
import {
  availabilityWindow,
  bookingFromEvent,
  eventTypeUriFor,
  formatSlotLabel,
  matchesSchedulingUrl,
  parseAvailableTimes,
  eventTypeOf,
  eventTypeTokensOf,
  givenNameOf,
  interviewerNameFromEvent,
  isAllowedEventType,
  isFreshSignature,
  modalityFromEvent,
  parseEventTypeAllowlist,
  parseSignatureHeader,
  personNameOf,
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

describe("interviewerNameFromEvent — one named host, or nothing (REQ-INT-2)", () => {
  /** `meetEvent`, with the host half of the payload spelled out. */
  const withMemberships = (event_memberships: unknown) =>
    meetEvent({
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/EVT1",
        name: "LevelUp Cohort Interview",
        event_type: "https://api.calendly.com/event_types/ET-INTERVIEW",
        start_time: "2026-07-30T13:00:00.000000Z",
        status: "active",
        location: { type: "google_conference" },
        event_memberships,
      },
    });

  it("reads the single host's display name", () => {
    expect(
      interviewerNameFromEvent(
        withMemberships([
          {
            user: "https://api.calendly.com/users/USR1",
            user_email: "arundhati@leveluplearning.in",
            user_name: "Arundhati Menon",
          },
        ]),
      ),
    ).toBe("Arundhati Menon");
  });

  it("accepts a single-word name — a mononym is a real name, not a partial one", () => {
    expect(interviewerNameFromEvent(withMemberships([{ user_name: "Arundhati" }]))).toBe(
      "Arundhati",
    );
  });

  it("returns null when TWO OR MORE distinct hosts are named", () => {
    // A collective event type carries every host. "Your interviewer" is then not one
    // person, and Calendly documents no ordering for the array — so taking the first
    // would be an arbitrary pick shown to the applicant as the person they are about
    // to meet. That is the invention REQ-INT-2 rules out; null is the honest answer.
    expect(
      interviewerNameFromEvent(
        withMemberships([{ user_name: "Arundhati Menon" }, { user_name: "Kavya Rao" }]),
      ),
    ).toBeNull();
  });

  it("collapses repeats of the SAME host rather than reading them as ambiguity", () => {
    expect(
      interviewerNameFromEvent(
        withMemberships([
          { user_name: "Arundhati Menon" },
          { user_name: "  arundhati   menon " },
        ]),
      ),
    ).toBe("Arundhati Menon");
  });

  it("ignores memberships that name nobody, and reads the one that does", () => {
    expect(
      interviewerNameFromEvent(
        withMemberships([
          // The shape Calendly's older published webhook schema documents: a URI and
          // an email, no name at all.
          { user: "https://api.calendly.com/users/USR9", user_email: "ops@leveluplearning.in" },
          { user_name: "   " },
          { user_name: null },
          "not-an-object",
          { user_name: "Arundhati Menon" },
        ]),
      ),
    ).toBe("Arundhati Menon");
  });

  it("returns null for a missing or empty event_memberships", () => {
    // Not a defect to be filled in: a delivery that names no host is a delivery we
    // know less from, and the card simply does not render.
    expect(interviewerNameFromEvent(meetEvent())).toBeNull();
    expect(interviewerNameFromEvent(withMemberships([]))).toBeNull();
    expect(interviewerNameFromEvent(withMemberships(null))).toBeNull();
    expect(interviewerNameFromEvent(withMemberships({}))).toBeNull();
    expect(interviewerNameFromEvent(withMemberships("USR1"))).toBeNull();
  });

  it("never derives a name from the host's email, and never reads the address", () => {
    // The email is deliberately not a fallback: "admissions@…" or "r.s@…" is an
    // address, not the name of the person the applicant is about to meet, and the
    // column exists to hold a real name or nothing.
    expect(
      interviewerNameFromEvent(
        withMemberships([
          { user: "https://api.calendly.com/users/USR1", user_email: "arundhati@leveluplearning.in" },
        ]),
      ),
    ).toBeNull();
    // Nor is an address accepted when it arrives IN the name field.
    expect(
      interviewerNameFromEvent(withMemberships([{ user_name: "arundhati@leveluplearning.in" }])),
    ).toBeNull();
    // A URL and a nameless token are not names either.
    expect(
      interviewerNameFromEvent(withMemberships([{ user_name: "https://calendly.com/levelup" }])),
    ).toBeNull();
    expect(interviewerNameFromEvent(withMemberships([{ user_name: "98765" }]))).toBeNull();
  });

  it("yields null for a payload shape that does not match at all, instead of throwing", () => {
    expect(interviewerNameFromEvent(null)).toBeNull();
    expect(interviewerNameFromEvent(undefined)).toBeNull();
    expect(interviewerNameFromEvent({})).toBeNull();
    expect(interviewerNameFromEvent({ payload: {} })).toBeNull();
    expect(interviewerNameFromEvent({ payload: { scheduled_event: {} } })).toBeNull();
    expect(interviewerNameFromEvent({ payload: "nope" })).toBeNull();
    expect(interviewerNameFromEvent("not-an-object")).toBeNull();
    expect(interviewerNameFromEvent([{ user_name: "Arundhati Menon" }])).toBeNull();
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

  it("matches a REAL v2 delivery by API URI, by uuid and by name", () => {
    // The shape Calendly actually sends: `scheduled_event.event_type` is a bare API
    // URI string. These three are the only forms that can match it, which is what
    // config.toml now tells the operator to configure.
    for (const configured of [
      "https://api.calendly.com/event_types/ET-INTERVIEW",
      "ET-INTERVIEW",
      "LevelUp Cohort Interview",
    ]) {
      expect(
        isAllowedEventType(meetEvent(), parseEventTypeAllowlist(configured)),
        `configured as ${configured}`,
      ).toBe(true);
    }
  });

  it("is scheme- and trailing-slash-insensitive on BOTH sides", () => {
    // Both sides normalise identically, so pasting the URI with or without the
    // scheme (or with a trailing slash) is the same configuration, never a silent
    // total drop.
    for (const configured of [
      "api.calendly.com/event_types/ET-INTERVIEW",
      "https://api.calendly.com/event_types/ET-INTERVIEW/",
      "HTTPS://API.CALENDLY.COM/EVENT_TYPES/ET-INTERVIEW",
    ]) {
      expect(isAllowedEventType(meetEvent(), parseEventTypeAllowlist(configured)), configured)
        .toBe(true);
    }
  });

  it("does NOT match a v2 delivery from the hosted scheduling link alone — the drop this receiver was built on", () => {
    // THE OUTAGE, pinned. `https://calendly.com/levelup/interview-30min` yields the
    // slug `interview-30min`; a v2 payload names the event type as an API URI and
    // carries no slug ANYWHERE, so the two can never meet and every real delivery
    // is dropped with a healthy-looking 200. The honest answer is false — and the
    // receiver logs `eventTypeTokensOf` so the operator can see what to paste
    // instead. (The object form below still works, which is why the slug token is
    // read at all.)
    const hostedLink = parseEventTypeAllowlist("https://calendly.com/levelup/interview-30min");
    expect(isAllowedEventType(meetEvent(), hostedLink)).toBe(false);
    expect(eventTypeTokensOf(meetEvent())).toContain(
      "api.calendly.com/event_types/et-interview",
    );
    expect(eventTypeTokensOf(meetEvent())).toContain("et-interview");
    expect(eventTypeTokensOf(meetEvent())).toContain("levelup cohort interview");
    expect(eventTypeTokensOf(meetEvent())).not.toContain("interview-30min");
  });

  it("reads EVERY place the event type can be named, not just the first", () => {
    // A URI at the scheduled-event level and an object at the invitee level are both
    // identities of the same delivery. Matching only the first found would make one
    // of two reasonable configurations dead.
    const both = {
      ...meetEvent(),
      payload: {
        ...meetEvent().payload,
        event_type: { uri: "https://api.calendly.com/event_types/ET-LEGACY", slug: "interview-30min" },
      },
    };
    expect(eventTypeTokensOf(both)).toContain("et-interview");
    expect(eventTypeTokensOf(both)).toContain("et-legacy");
    expect(eventTypeTokensOf(both)).toContain("interview-30min");
    expect(isAllowedEventType(both, allowlist)).toBe(true);
    expect(
      isAllowedEventType(both, parseEventTypeAllowlist("https://calendly.com/levelup/interview-30min")),
    ).toBe(true);
  });

  it("yields no tokens at all for a payload that names nothing", () => {
    expect(eventTypeTokensOf(null)).toEqual([]);
    expect(eventTypeTokensOf({})).toEqual([]);
    expect(eventTypeTokensOf({ payload: { scheduled_event: {} } })).toEqual([]);
  });
});

describe("personNameOf / givenNameOf — a person, or nothing (REQ-INT-2)", () => {
  it("strips an honorific instead of rendering it as the first name", () => {
    // "Dr. Kavya Rao" → "Dr." is a fabricated first name for a real colleague, and
    // it is what an unguarded first-whitespace-token rule produces.
    expect(personNameOf("Dr. Kavya Rao")).toBe("Kavya Rao");
    expect(givenNameOf("Dr. Kavya Rao")).toBe("Kavya");
    expect(givenNameOf("Prof Arundhati Menon")).toBe("Arundhati");
    expect(givenNameOf("Ms. Meera")).toBe("Meera");
    // An honorific with nothing behind it names nobody.
    expect(givenNameOf("Dr.")).toBeNull();
  });

  it("refuses the ORGANISATION, which is what a shared org account is likeliest to be called", () => {
    // INTEG-CAL-1 puts every interviewer on ONE org-level Calendly account, whose
    // membership `user_name` is free text. "LevelUp Learning" rendering as the
    // person "LevelUp" is the exact failure the card exists to prevent.
    expect(personNameOf("LevelUp Learning")).toBeNull();
    expect(givenNameOf("LevelUp Learning")).toBeNull();
    expect(givenNameOf("LevelUp Learning Pvt Ltd")).toBeNull();
    expect(givenNameOf("Admissions Team")).toBeNull();
    expect(givenNameOf("The Forge Admissions")).toBeNull();
    expect(givenNameOf("Cohort Bookings")).toBeNull();
    expect(givenNameOf("LevelUp")).toBeNull();
  });

  it("refuses the brand however it is SPACED, not only when it is concatenated", () => {
    // A per-token list cannot reject "Level Up": neither "level" nor "up" is a word
    // this guard may reject on its own, so the token pass let the brand's own spaced
    // spelling through and the card rendered the invented interviewer "Level". The
    // whole-value check is what closes it, and it is deliberately equality — a real
    // person is untouched.
    for (const brand of [
      "Level Up",
      "level up",
      "Level-Up",
      "Level Up Learning",
      "The Forge",
      "Millennial Labs",
    ]) {
      expect(givenNameOf(brand), `rendered a name for ${brand}`).toBeNull();
    }
  });

  it("refuses the FUNCTION a shared account is named for, not just the company", () => {
    // INTEG-CAL-1's one org-level account is as likely to be called after the job it
    // does as after the company doing it, and each of these otherwise reaches the
    // card as the person the applicant is about to meet.
    for (const role of [
      "Interview",
      "Interviews",
      "Front Desk",
      "Reception",
      "Hiring",
      "Talent",
      "Sales",
      "Calendly",
      "Interview Team",
    ]) {
      expect(givenNameOf(role), `rendered a name for ${role}`).toBeNull();
    }
  });

  it("still keeps real names that merely sit near those words", () => {
    // The cost of a wrong rejection is a permanent blank on the one surface that
    // names a colleague, so the guard must not creep into ordinary names.
    expect(givenNameOf("Kavya Rao")).toBe("Kavya");
    expect(givenNameOf("Arundhati Menon")).toBe("Arundhati");
    expect(givenNameOf("Aditi Upadhyay")).toBe("Aditi");
    expect(givenNameOf("Salil Deshpande")).toBe("Salil");
  });

  it("keeps a single-word personal name — a mononym is a real name", () => {
    expect(personNameOf("Arundhati")).toBe("Arundhati");
    expect(givenNameOf("Arundhati")).toBe("Arundhati");
    expect(givenNameOf("  Kavya   Rao  ")).toBe("Kavya");
  });

  it("keeps the punctuation real names carry", () => {
    expect(givenNameOf("D'Souza Fernandes")).toBe("D'Souza");
    expect(givenNameOf("Jean-Pierre Aravind")).toBe("Jean-Pierre");
  });

  it("refuses anything that is not a name at all", () => {
    expect(givenNameOf(null)).toBeNull();
    expect(givenNameOf(undefined)).toBeNull();
    expect(givenNameOf("   ")).toBeNull();
    expect(givenNameOf(42)).toBeNull();
    expect(givenNameOf("arundhati@leveluplearning.in")).toBeNull();
    expect(givenNameOf("https://calendly.com/levelup")).toBeNull();
    expect(givenNameOf("98765")).toBeNull();
    expect(givenNameOf("Room 4")).toBeNull();
    // Two people in one string is the same ambiguity two memberships are refused for.
    expect(givenNameOf("Kavya & Arjun")).toBeNull();
    expect(givenNameOf("Kavya and Arjun")).toBeNull();
    // A bare initial is not a given name — but "K. Rao" is still a PERSON, so the
    // initial is skipped rather than the whole value rejected (see below).
    expect(givenNameOf("K.")).toBeNull();
    expect(givenNameOf("A. B.")).toBeNull();
    // A handle is not a name, and no token of it is one either.
    expect(givenNameOf("ravi_kumar")).toBeNull();
  });

  it("skips an INITIAL instead of blanking the card — initial-plus-name is a whole naming convention", () => {
    // "S. Kumar" is called Kumar and "Prof. R Iyer" is called Iyer. The old rule
    // (first token must carry ≥2 letters) rejected the value outright, which is a
    // permanent blank on the one surface that names a colleague — for one of the
    // commonest name forms in this product's own market. Rendering the next real
    // token is not a fabrication: every character of it is the person's own name.
    expect(givenNameOf("S. Kumar")).toBe("Kumar");
    expect(givenNameOf("K. Rao")).toBe("Rao");
    expect(givenNameOf("Prof. R Iyer")).toBe("Iyer");
    expect(personNameOf("S. Kumar")).toBe("S Kumar");
  });

  it("strips the abbreviated prefix 'Md.' the way it strips 'Dr.'", () => {
    // Not in the honorific list, "Md. Imran" rendered nothing at all.
    expect(givenNameOf("Md. Imran")).toBe("Imran");
    expect(givenNameOf("Mohd Rizwan")).toBe("Rizwan");
    expect(givenNameOf("Md.")).toBeNull();
  });

  it("splits a dot-joined SSO name instead of rejecting it", () => {
    // "Ravi.Kumar" is one token to a whitespace split, and one token that shape
    // check can never pass — another silent blank for a real person.
    expect(givenNameOf("Ravi.Kumar")).toBe("Ravi");
    expect(personNameOf("Ravi.Kumar")).toBe("Ravi Kumar");
    expect(givenNameOf("Dr.Kavya Rao")).toBe("Kavya");
  });

  it("never renders a nobiliary PARTICLE as the person's first name", () => {
    // "de" and "Van" are not what anyone is called — the same defect as "Dr.".
    expect(givenNameOf("de Souza Silva")).toBe("Souza");
    expect(givenNameOf("Van Der Berg")).toBe("Berg");
    expect(givenNameOf("von Neumann")).toBe("Neumann");
    // …but a particle is only ever SKIPPED, never used to reject a real name that
    // merely contains one.
    expect(givenNameOf("Kavya de Souza")).toBe("Kavya");
    // A value that is nothing but particles names nobody.
    expect(givenNameOf("Van Der")).toBeNull();
  });

  it("is the SAME guard the host parser applies, so nothing non-person is ever stored", () => {
    const withHost = (user_name: unknown) => ({
      event: "invitee.created",
      payload: {
        scheduled_event: {
          uri: "https://api.calendly.com/scheduled_events/EVT1",
          start_time: "2026-07-30T13:00:00.000000Z",
          location: { type: "google_conference" },
          event_memberships: [{ user_name }],
        },
      },
    });
    expect(interviewerNameFromEvent(withHost("LevelUp Learning"))).toBeNull();
    expect(interviewerNameFromEvent(withHost("Admissions Team"))).toBeNull();
    expect(interviewerNameFromEvent(withHost("Dr. Kavya Rao"))).toBe("Kavya Rao");
    expect(interviewerNameFromEvent(withHost("Arundhati"))).toBe("Arundhati");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   Q-1 — the AVAILABILITY core (`@shared/calendly`), driven with zero network.

   RULED — REQ-INT-0 is back on (Rahul, 2026-07-28), reversing §6.4's park of
   app-native slot buttons. `calendly-slots` reads availability server-side and
   the surface renders three one-tap buttons; every DECISION in that path is one
   of the pure functions below, so this is where it is proven.

   Verified against the live account on 2026-07-28, and these tests encode those
   facts rather than re-deriving them: the window must be ≤7 days and must START
   IN THE FUTURE, and each returned item carries `start_time`, `status` and
   `scheduling_url` — the per-slot deep link that makes a one-tap button possible
   without the app ever holding a booking.
   ════════════════════════════════════════════════════════════════════════════ */

/** A realistic `event_type_available_times` item. */
function availableTime(overrides: Record<string, unknown> = {}) {
  return {
    status: "available",
    start_time: "2026-07-29T09:30:00.000000Z",
    invitees_remaining: 1,
    scheduling_url:
      "https://calendly.com/leveluplearningindia/executive-presence-cohort-interview/2026-07-29T09:30:00Z",
    ...overrides,
  };
}

describe("availabilityWindow — Calendly's two hard constraints, encoded", () => {
  const NOW = Date.parse("2026-07-28T12:00:00.000Z");

  it("starts in the FUTURE, because a window starting at `now` is rejected", () => {
    const w = availabilityWindow(NOW);
    expect(Date.parse(w.startTime)).toBeGreaterThan(NOW);
    // And by enough to survive clock skew between our isolate and Calendly.
    expect(Date.parse(w.startTime) - NOW).toBeGreaterThanOrEqual(60_000);
  });

  it("never exceeds seven days, however wide a caller asks", () => {
    const seven = 7 * 24 * 60 * 60_000;
    expect(Date.parse(availabilityWindow(NOW).endTime) - Date.parse(availabilityWindow(NOW).startTime))
      .toBe(seven);
    const greedy = availabilityWindow(NOW, { days: 30 });
    expect(Date.parse(greedy.endTime) - Date.parse(greedy.startTime)).toBe(seven);
  });

  it("walks forward for the second look, so a fortnight is two legal windows", () => {
    // An interviewer whose next opening is nine days out has NO slots in the
    // first seven — an ordinary calendar, not an empty one.
    const first = availabilityWindow(NOW);
    const second = availabilityWindow(NOW, { offsetDays: 7 });
    expect(Date.parse(second.startTime)).toBe(Date.parse(first.endTime));
  });

  it("emits ISO instants, which is the only shape the query string accepts", () => {
    expect(availabilityWindow(NOW).startTime).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });
});

describe("event-type resolution — never hardcoded, matched off the offering's link", () => {
  const collection = {
    collection: [
      {
        uri: "https://api.calendly.com/event_types/ET-FORGE-AI",
        active: true,
        scheduling_url: "https://calendly.com/leveluplearningindia/the-forge-ai-residency-interview",
      },
      {
        uri: "https://api.calendly.com/event_types/ET-EP",
        active: true,
        scheduling_url:
          "https://calendly.com/leveluplearningindia/executive-presence-cohort-interview",
      },
    ],
  };

  it("resolves the event type the offering's own URL names", () => {
    // The account runs one interview event type per cohort. A pinned URI would
    // offer one cohort's calendar to another cohort's applicants.
    expect(
      eventTypeUriFor(
        collection,
        "https://calendly.com/leveluplearningindia/executive-presence-cohort-interview",
      ),
    ).toBe("https://api.calendly.com/event_types/ET-EP");
  });

  it("ignores the query string an admin pasted onto the link", () => {
    expect(
      eventTypeUriFor(
        collection,
        "https://calendly.com/leveluplearningindia/executive-presence-cohort-interview?utm_source=app",
      ),
    ).toBe("https://api.calendly.com/event_types/ET-EP");
  });

  it("resolves a link that already points at one slot under the event type", () => {
    expect(
      eventTypeUriFor(
        collection,
        "https://calendly.com/leveluplearningindia/executive-presence-cohort-interview/2026-07-29T09:30:00Z",
      ),
    ).toBe("https://api.calendly.com/event_types/ET-EP");
  });

  it("does not let one slug claim another that merely starts with it", () => {
    expect(
      matchesSchedulingUrl(
        "https://calendly.com/levelup/interview",
        "https://calendly.com/levelup/interview-2",
      ),
    ).toBe(false);
  });

  it("matches nothing when the link is not on Calendly at all", () => {
    expect(eventTypeUriFor(collection, "https://evil.example.com/levelup/interview")).toBeNull();
    expect(eventTypeUriFor(collection, "http://calendly.com/levelup/interview")).toBeNull();
    expect(eventTypeUriFor({}, "https://calendly.com/levelup/interview")).toBeNull();
  });

  it("skips an INACTIVE event type that still carries the same URL", () => {
    // It still appears in the collection and still has a scheduling_url, but it
    // has no availability — matching it renders "no slots" forever on an
    // offering that is fine.
    expect(
      eventTypeUriFor(
        {
          collection: [
            {
              uri: "https://api.calendly.com/event_types/ET-OLD",
              active: false,
              scheduling_url: "https://calendly.com/levelup/interview",
            },
          ],
        },
        "https://calendly.com/levelup/interview",
      ),
    ).toBeNull();
  });
});

describe("parseAvailableTimes — every filter is a refusal to guess", () => {
  it("returns the three soonest, soonest first", () => {
    const slots = parseAvailableTimes({
      collection: [
        availableTime({
          start_time: "2026-07-30T09:30:00.000000Z",
          scheduling_url: "https://calendly.com/levelup/interview/2026-07-30T09:30:00Z",
        }),
        availableTime(),
        availableTime({
          start_time: "2026-07-29T11:30:00.000000Z",
          scheduling_url: "https://calendly.com/levelup/interview/2026-07-29T11:30:00Z",
        }),
        availableTime({
          start_time: "2026-07-31T09:30:00.000000Z",
          scheduling_url: "https://calendly.com/levelup/interview/2026-07-31T09:30:00Z",
        }),
      ],
    });
    expect(slots.map((s) => s.startTime)).toEqual([
      "2026-07-29T09:30:00.000000Z",
      "2026-07-29T11:30:00.000000Z",
      "2026-07-30T09:30:00.000000Z",
    ]);
    // The deep link is what makes the button one-tap; it is carried through
    // verbatim rather than reconstructed from the start time.
    expect(slots[0].bookingUrl).toContain("2026-07-29T09:30:00Z");
  });

  it("returns nothing for an EMPTY collection", () => {
    expect(parseAvailableTimes({ collection: [] })).toEqual([]);
  });

  it("returns nothing for a window that answered with no collection at all", () => {
    // A legal window over a fortnight the interviewer has blocked out. Not an
    // outage, and not an error — the caller falls back to the hosted calendar.
    expect(parseAvailableTimes({})).toEqual([]);
    expect(parseAvailableTimes(null)).toEqual([]);
    expect(parseAvailableTimes({ collection: "nope" })).toEqual([]);
  });

  it("skips a MALFORMED item instead of losing the whole response", () => {
    // One bad row must not cost the other 42.
    const slots = parseAvailableTimes({
      collection: [
        null,
        "not an object",
        { status: "available" },
        availableTime({ start_time: "not a date" }),
        availableTime({ scheduling_url: null }),
        availableTime(),
      ],
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].startTime).toBe("2026-07-29T09:30:00.000000Z");
  });

  it("offers ONLY items whose status is available", () => {
    // Offering any other status as a button sends a student to a confirmation
    // page that cannot confirm.
    const slots = parseAvailableTimes({
      collection: [
        availableTime({ status: "unavailable" }),
        availableTime({ status: "booked" }),
        availableTime({ status: null }),
      ],
    });
    expect(slots).toEqual([]);
  });

  it("refuses a scheduling_url that is not on calendly.com", () => {
    // The link is opened in a browser carrying the applicant's name and email.
    expect(
      parseAvailableTimes({
        collection: [
          availableTime({ scheduling_url: "https://calendly.com.evil.io/levelup/x" }),
          availableTime({ scheduling_url: "http://calendly.com/levelup/x" }),
        ],
      }),
    ).toEqual([]);
  });

  it("drops slots that have gone past while the answer sat in a cache", () => {
    const now = Date.parse("2026-07-29T10:00:00.000Z");
    const slots = parseAvailableTimes(
      {
        collection: [
          availableTime(),
          availableTime({
            start_time: "2026-07-29T11:30:00.000000Z",
            scheduling_url: "https://calendly.com/levelup/interview/2026-07-29T11:30:00Z",
          }),
        ],
      },
      { now },
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].startTime).toBe("2026-07-29T11:30:00.000000Z");
  });

  it("collapses duplicate start instants — a student cannot tell two apart", () => {
    const slots = parseAvailableTimes({
      collection: [availableTime(), availableTime()],
    });
    expect(slots).toHaveLength(1);
  });
});

describe("formatSlotLabel — a UTC instant as a student in India reads it", () => {
  it("renders a UTC start_time in IST, not in UTC", () => {
    // 09:30Z is 15:00 in Kolkata. A button that renders the UTC hour is a missed
    // interview, not a formatting nit.
    const label = formatSlotLabel(
      "2026-07-29T09:30:00.000000Z",
      Date.parse("2026-07-20T00:00:00.000Z"),
    );
    expect(label?.time).toBe("3:00 pm");
    expect(label?.day).toBe("Wed, 29 Jul");
    expect(label?.aria).toBe("Wednesday, 29 July at 3:00 pm");
  });

  it("crosses midnight IST correctly — 20:00Z is already the next morning", () => {
    const label = formatSlotLabel(
      "2026-07-29T20:00:00.000000Z",
      Date.parse("2026-07-20T00:00:00.000Z"),
    );
    expect(label?.time).toBe("1:30 am");
    expect(label?.day).toBe("Thu, 30 Jul");
  });

  it("says Today and Tomorrow on the IST CALENDAR, not by elapsed hours", () => {
    // 23:00 UTC is already tomorrow in India; a slot the student would call
    // "tomorrow morning" must not read as "today" because 24 hours have not
    // elapsed.
    const now = Date.parse("2026-07-28T17:00:00.000Z"); // 22:30 IST, 28 Jul
    expect(formatSlotLabel("2026-07-28T17:30:00.000Z", now)?.day).toBe("Today");
    expect(formatSlotLabel("2026-07-28T19:00:00.000Z", now)?.day).toBe("Tomorrow");
    expect(formatSlotLabel("2026-07-30T04:00:00.000Z", now)?.day).toBe("Thu, 30 Jul");
  });

  it("renders nothing at all for an instant it cannot parse", () => {
    // A button reading "Invalid Date" is worse than one fewer button.
    expect(formatSlotLabel("not a date")).toBeNull();
    expect(formatSlotLabel("")).toBeNull();
  });
});
