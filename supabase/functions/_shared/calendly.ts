/**
 * calendly.ts — the PURE signature-input + payload-parsing core of the Calendly
 * interview-booking receiver (PHASE IV V-1; `04-INTEGRATION-CONTRACTS.md` §6).
 *
 * Everything the receiver DECIDES lives here: how the `Calendly-Webhook-Signature`
 * header splits into `{t, v1}`, what exact string gets HMAC'd, whether the signed
 * timestamp is still inside the replay window, whether the delivery is even the
 * INTERVIEW event type, which modality a Calendly location object means, and which
 * booking facts a delivery carries — including the three that tell a RESCHEDULE
 * apart from a cancellation and order two deliveries. The handler
 * (`calendly-webhook/index.ts`) is then only I/O — read the body, verify, resolve
 * the row, write. That split is what lets the security-critical parsing be proven by
 * unit test with ZERO network and no mocking (`src/lib/__tests__/calendly.test.ts`).
 *
 * IMPORTANT — keep this file DEPENDENCY-FREE (no imports; no Deno/Node/DOM-only
 * globals), exactly like `_shared/phone.ts`, `_shared/pricing.ts` and
 * `_shared/reconcile.ts`. It is imported by the Deno edge fn
 * (`../_shared/calendly.ts`) AND bundled into vitest via the `@shared` alias, so an
 * import that exists in only one runtime would break the other.
 *
 * SOR-1: nothing here derives or names a funnel stage. These helpers report the
 * BOOKING FACT Calendly delivered; the reconciler alone derives the stage.
 *
 * NEVER GUESS THE MODALITY. `modalityFromEvent` maps only the location types the
 * contract (§6.3) actually pins down, and returns `null` for everything else. A
 * wrong modality sends a student to the wrong place at the wrong time; an absent
 * one just renders no variant. Zoom is never assumed for the interview (the
 * delivered cohort-room session legitimately runs on Zoom — that rule binds the
 * interview only).
 */

/** The two interview modalities the student can pick at booking (PRD REQ-INT-1). */
export type InterviewModality = "google_meet" | "phone";

/**
 * How far from "now" a signed `t` may sit before the delivery is refused (§6.2's
 * optional replay window). Deliberately GENEROUS — a day, not a minute. Calendly
 * re-delivers a webhook whose 2xx it never saw, over a long backoff horizon, and a
 * tight window would turn its retries into permanent 401s: a lost booking fact,
 * which nothing else in the funnel can recover. What this window is actually for is
 * the captured-and-kept delivery replayed weeks later; a replay INSIDE the window
 * is already a no-op because the receiver is idempotent on the event URI.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 24 * 60 * 60;

/** The two halves of `Calendly-Webhook-Signature: t=<unix>,v1=<hex>` (§6.2). */
export interface CalendlySignature {
  /** The unix-seconds timestamp Calendly signed with. */
  t: string;
  /** The lowercase-hex HMAC-SHA256 digest, as delivered. */
  v1: string;
}

/**
 * The booking facts a single delivery carries. Every field is nullable because a
 * malformed or partial payload must degrade to "we know less", never to a guess.
 *
 * THE RESCHEDULE TRIAD is why three of these fields exist. Calendly does not have a
 * "rescheduled" event: every reschedule is `invitee.canceled` for the OLD invitee
 * PLUS `invitee.created` for the new one, in no guaranteed order, and both resolve
 * to the same application row. Reading only `old_invitee` therefore makes a
 * reschedule indistinguishable from a real cancellation, and the cancel half wipes
 * the booking the create half just wrote.
 *   - `rescheduledFrom` (`old_invitee`) — set on the NEW invitee: this booking
 *     replaced an earlier one. The one signal that a rebooking is a rebooking, and
 *     what makes `cohort_applications.reschedule_count` live storage for V-3.
 *   - `rescheduled` / `rescheduledTo` (`rescheduled`, `new_invitee`) — set on the
 *     OLD invitee: this cancellation is HALF A RESCHEDULE, not a cancellation. The
 *     receiver must leave the booking alone when it sees them.
 *   - `bookedAt` (`created_at`) — when Calendly created this invitee. The receiver
 *     orders deliveries by it, so a retry that crosses a later booking is ignored
 *     instead of dragging the row back to a superseded slot.
 */
export interface CalendlyBooking {
  inviteeEmail: string | null;
  inviteePhone: string | null;
  /** ISO-8601 start of the scheduled event, as Calendly sent it. */
  startTime: string | null;
  /**
   * The SCHEDULED-EVENT URI — the idempotency key for a delivery, and never the
   * invitee URI (mixing the two namespaces makes the key unmatchable, see below).
   */
  eventUri: string | null;
  canceled: boolean;
  /** `old_invitee`: the invitee THIS booking replaced (set on the new invitee). */
  rescheduledFrom: string | null;
  /** `rescheduled`: this invitee was rescheduled away (set on the cancelled one). */
  rescheduled: boolean;
  /** `new_invitee`: the invitee that REPLACED this one (set on the cancelled one). */
  rescheduledTo: string | null;
  /** ISO-8601 `created_at` of the invitee — the delivery's place in time. */
  bookedAt: string | null;
}

/** Narrow an unknown to a plain object, so payload walking never throws. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Narrow an unknown to a non-blank trimmed string, else null. */
function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The invitee object — the webhook envelope's `payload`. */
function inviteeOf(payload: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(payload)?.payload);
}

/** The `scheduled_event` object hanging off the invitee. */
function scheduledEventOf(payload: unknown): Record<string, unknown> | null {
  return asRecord(inviteeOf(payload)?.scheduled_event);
}

/**
 * Calendly reports the location as an OBJECT, not a string (§6.3). Its
 * discriminator is `type` on the v2 payload; `kind` is accepted as the alias some
 * envelopes still carry.
 */
function locationOf(payload: unknown): Record<string, unknown> | null {
  return asRecord(scheduledEventOf(payload)?.location);
}

/** The location's discriminator, lowercased: `type` on v2, `kind` on older envelopes. */
function locationKindOf(location: Record<string, unknown> | null): string {
  if (!location) return "";
  return (asString(location.type) ?? asString(location.kind) ?? "").toLowerCase();
}

/**
 * Is this text a phone number rather than a link or a room name? Used to read the
 * number off a call location — the invitee's on an `outbound_call`, the host's on a
 * `custom` one. Deliberately conservative: a URL is never a phone number, and a
 * plausible international subscriber number is 7–15 digits (E.164 caps at 15).
 */
function looksLikePhoneNumber(value: string | null): boolean {
  if (!value) return false;
  if (/https?:\/\//i.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** The location's free-text value — the number on a call, the address on a `physical`. */
function locationTextOf(location: Record<string, unknown> | null): string | null {
  return asString(location?.location);
}

/**
 * The INVITEE'S OWN number, and only from the one location kind where the location
 * IS that number: `outbound_call`, the call Calendly says we place to the number the
 * invitee gave. It is non-null only where `modalityFromEvent` says `phone` — an
 * `outbound_call` whose location Calendly did not spell out is still `phone`, just
 * without a number.
 *
 * `custom` IS DELIBERATELY EXCLUDED HERE while still counting for the modality. A
 * custom location is a STATIC string the host typed on the event type, identical for
 * every invitee of that event type ("We will call you on 98xxxxxxxx" is the office
 * line, not the applicant's). Phone is the PRIMARY join key (INTEG-KEY-1, tried
 * before email, first match wins), so reading a custom location as an identity would
 * point EVERY booking of that event type at whichever application row happens to
 * hold those digits — and the correct email fallback would never be reached.
 *
 * THE GATE ON KIND IS LOAD-BEARING for the same reason a `physical` address is
 * excluded: "4th Floor, 100 Feet Road, Bengaluru 560038" carries ten digits.
 */
function inviteePhoneFromLocation(location: Record<string, unknown> | null): string | null {
  if (locationKindOf(location) !== "outbound_call") return null;
  const value = locationTextOf(location);
  return looksLikePhoneNumber(value) ? value : null;
}

/**
 * The identity tokens a single event-type reference yields, lowercased: the value
 * itself, its last URL/path segment, and — when Calendly sent an object rather than
 * a URI — its `uri`, `slug` and `name`.
 *
 * The last-segment token is what lets an operator configure the allowlist with
 * either the API URI (`https://api.calendly.com/event_types/<uuid>`), the bare uuid,
 * or the hosted scheduling link (`https://calendly.com/levelup/interview-30min`,
 * whose last segment IS the event type's slug).
 */
function identityTokens(value: unknown): string[] {
  const tokens: string[] = [];
  const push = (raw: string | null) => {
    if (!raw) return;
    const token = raw.toLowerCase().replace(/\/+$/, "");
    if (token !== "" && !tokens.includes(token)) tokens.push(token);
    const segment = (token.split("/").pop() ?? "").trim();
    if (segment !== "" && !tokens.includes(segment)) tokens.push(segment);
  };

  const direct = asString(value);
  if (direct) push(direct);

  const record = asRecord(value);
  if (record) {
    push(asString(record.uri));
    push(asString(record.slug));
    push(asString(record.name));
  }
  return tokens;
}

/** Where Calendly can name the event type: on the scheduled event (v2) or the invitee (legacy). */
function eventTypeRefOf(payload: unknown): unknown {
  const scheduled = scheduledEventOf(payload);
  const fromScheduled = scheduled?.event_type;
  if (fromScheduled !== undefined && fromScheduled !== null) return fromScheduled;
  const invitee = inviteeOf(payload);
  const fromInvitee = invitee?.event_type;
  if (fromInvitee !== undefined && fromInvitee !== null) return fromInvitee;
  // Last resort: the event type's NAME, which the scheduled event carries even when
  // it names no event-type URI.
  return scheduled?.name ?? null;
}

/**
 * Every identity token this delivery answers to: the event-type reference above,
 * PLUS the scheduled event's name — a name is weaker than a URI (two event types
 * could share one), but it is the only identity an operator can read off the
 * Calendly UI without an API call, so configuring by name has to work even when the
 * payload also carries a URI.
 */
function deliveredEventTypeTokens(payload: unknown): string[] {
  const tokens = identityTokens(eventTypeRefOf(payload));
  for (const token of identityTokens(scheduledEventOf(payload)?.name)) {
    if (!tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

/**
 * Split `t=1700000000,v1=deadbeef…` into its parts, or return null when the header
 * is absent or does not parse. Null is the FAIL-CLOSED answer: the caller rejects
 * with 401 and never reaches the HMAC.
 *
 * Both halves are shape-checked here (`t` all digits, `v1` all hex) so a header
 * crafted to smuggle punctuation into the signed string can't get as far as the
 * comparison. Only the FIRST `t`/`v1` pair is honoured — during a Calendly key
 * rotation the header can carry several `v1` values, and accepting "any one of
 * them verifies" would widen the trusted key set silently.
 */
export function parseSignatureHeader(header: string | null | undefined): CalendlySignature | null {
  if (!header) return null;
  let t = "";
  let v1 = "";
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && t === "") t = value;
    else if (key === "v1" && v1 === "") v1 = value;
  }
  if (t === "" || v1 === "") return null;
  if (!/^\d+$/.test(t)) return null;
  if (!/^[0-9a-fA-F]+$/.test(v1)) return null;
  return { t, v1 };
}

/**
 * The exact string Calendly signs: `` `${t}.${rawBody}` `` (§6.2). It MUST be built
 * from the raw, unparsed body — a re-serialised `JSON.stringify(JSON.parse(body))`
 * reorders nothing but does normalise whitespace, and any such normalisation breaks
 * the digest.
 */
export function signingPayload(t: string, rawBody: string): string {
  return `${t}.${rawBody}`;
}

/**
 * Is the signed timestamp inside the replay window (§6.2)? Pure, so "now" is passed
 * in and the check is unit-testable with zero clock mocking.
 *
 * Both directions are bounded: a `t` far in the FUTURE is as much a forgery signal
 * as a stale one, and an unbounded future would defeat the window entirely. See
 * `SIGNATURE_TOLERANCE_SECONDS` for why the default horizon is a day rather than
 * the minutes a payment provider would use.
 */
export function isFreshSignature(
  t: string,
  nowMs: number,
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  if (!/^\d+$/.test(t)) return false;
  const signedAtMs = Number(t) * 1000;
  if (!Number.isFinite(signedAtMs) || !Number.isFinite(nowMs)) return false;
  return Math.abs(nowMs - signedAtMs) <= toleranceSeconds * 1000;
}

/**
 * The event type this delivery belongs to, as one printable identity — the URI when
 * Calendly sent one, else the slug, else the name. For LOGS and for nothing else;
 * matching goes through `isAllowedEventType`, which compares every token.
 */
export function eventTypeOf(payload: unknown): string | null {
  const ref = eventTypeRefOf(payload);
  const direct = asString(ref);
  if (direct) return direct;
  const record = asRecord(ref);
  if (!record) return null;
  return asString(record.uri) ?? asString(record.slug) ?? asString(record.name);
}

/**
 * Split the configured allowlist (`CALENDLY_INTERVIEW_EVENT_TYPE`) into identity
 * tokens. Entries may be API URIs, bare uuids, slugs, hosted scheduling links, or
 * event-type names, separated by commas or newlines — NOT by spaces, because an
 * event type's name legitimately contains them ("LevelUp Cohort Interview").
 */
export function parseEventTypeAllowlist(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const tokens: string[] = [];
  for (const entry of raw.split(/[,\n\r]+/)) {
    for (const token of identityTokens(entry)) {
      if (!tokens.includes(token)) tokens.push(token);
    }
  }
  return tokens;
}

/**
 * Is this delivery the INTERVIEW event type?
 *
 * WHY THIS EXISTS: a Calendly webhook subscription is scoped to an organization or a
 * user and CANNOT be filtered to one event type (INTEG-CAL-1 puts every interviewer
 * on one org-level account), so the filter has to live in the receiver. Without it a
 * sales call, an onboarding call, or the second Calendly account merged in later
 * would overwrite `interview_starts_at` / `interview_modality` for whoever's phone or
 * email matched — and its `invitee.canceled` would clear a real interview.
 *
 * AN EMPTY ALLOWLIST MATCHES NOTHING — deliberately fail-closed, the same posture as
 * an unset signing key. Mirroring a stranger's sales call onto an applicant's row (or
 * clearing a live interview) is silent, cross-applicant corruption that the reconciler
 * then reads as a real booking; an unconfigured allowlist is a deploy-time miss that
 * announces itself in the receiver's logs on the very first delivery.
 */
export function isAllowedEventType(payload: unknown, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return false;
  return deliveredEventTypeTokens(payload).some((token) => allowlist.includes(token));
}

/**
 * Map the Calendly location object to the interview modality, or `null`.
 *
 * The mapping is the contract's (§6.3) and NOTHING else:
 *   - `google_conference`         → `google_meet` (the Meet link lands T−15)
 *   - `outbound_call`             → `phone` (we call the invitee's number)
 *   - `custom` + a phone-like value → `phone`
 * Every other type — `zoom`, `physical`, `ask_invitee`, `inbound_call`,
 * `microsoft_teams_conference`, an unknown future one, a legacy string location —
 * yields `null`. `inbound_call` is deliberately NOT mapped: it is not in the
 * contract's table, and widening the map is a contract change, not a code change.
 */
export function modalityFromEvent(payload: unknown): InterviewModality | null {
  const location = locationOf(payload);
  if (!location) return null;

  const kind = locationKindOf(location);
  if (kind === "") return null;

  if (kind === "google_conference") return "google_meet";
  if (kind === "outbound_call") return "phone";
  // A `custom` location that reads as a phone number tells us HOW the interview
  // happens; it never tells us WHOSE number it is (see `inviteePhoneFromLocation`).
  if (kind === "custom") return looksLikePhoneNumber(locationTextOf(location)) ? "phone" : null;
  return null;
}

/**
 * Read the booking facts out of an `invitee.created` / `invitee.canceled` envelope.
 * Returns null only when the envelope has no invitee object at all.
 *
 * Identity follows INTEG-KEY-1 — phone primary, email fallback — so the phone is
 * taken from `text_reminder_number` first, then from the location itself ONLY for an
 * `outbound_call`, where the number IS the invitee's (`inviteePhoneFromLocation`; a
 * `custom` location is host-typed boilerplate and never an identity).
 *
 * `eventUri` IS THE SCHEDULED-EVENT URI OR NOTHING. It is stored as the row's
 * idempotency key and later compared against the scheduled-event URI of every
 * subsequent delivery, so falling back to the INVITEE uri would mix two Calendly
 * namespaces: every invitee has its own uri, so a row that stored one could never
 * match again, and the genuine cancellation would be skipped as "not the booking we
 * hold" forever — acked 200, never retried. A delivery with no scheduled-event uri
 * is unkeyable, and the receiver skips it rather than key the row on a value that
 * can never be matched.
 *
 * `canceled` is true if ANY of the four places Calendly can say so says so: the
 * event name, the invitee's `canceled` flag, the invitee status, or the scheduled
 * event status. Over-reading cancellation is safe HERE because the receiver
 * separately refuses to clear a booking on the strength of a reschedule's cancel
 * half (`rescheduled` / `rescheduledTo`) or of an event it is not holding.
 */
export function bookingFromEvent(payload: unknown): CalendlyBooking | null {
  const root = asRecord(payload);
  const invitee = inviteeOf(payload);
  if (!invitee) return null;

  const scheduledEvent = asRecord(invitee.scheduled_event);
  const locationPhone = inviteePhoneFromLocation(locationOf(payload));

  const eventName = asString(root?.event)?.toLowerCase() ?? "";
  const canceled = eventName === "invitee.canceled" ||
    invitee.canceled === true ||
    asString(invitee.status)?.toLowerCase() === "canceled" ||
    asString(scheduledEvent?.status)?.toLowerCase() === "canceled";

  const rescheduledTo = asString(invitee.new_invitee);

  return {
    inviteeEmail: asString(invitee.email),
    inviteePhone: asString(invitee.text_reminder_number) ?? locationPhone,
    startTime: asString(scheduledEvent?.start_time),
    eventUri: asString(scheduledEvent?.uri),
    canceled,
    rescheduledFrom: asString(invitee.old_invitee),
    rescheduled: invitee.rescheduled === true || rescheduledTo !== null,
    rescheduledTo,
    bookedAt: asString(invitee.created_at) ?? asString(invitee.updated_at),
  };
}
