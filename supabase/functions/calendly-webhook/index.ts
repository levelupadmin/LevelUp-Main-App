/**
 * calendly-webhook — the net-new Calendly receiver (PHASE IV V-1,
 * `04-INTEGRATION-CONTRACTS.md` §6). Calendly is the largest external→app surface
 * in the funnel that has never been joined to our own tables: today the app knows
 * only `offerings.calendly_url`, so "did this applicant actually book?" is a
 * question nothing in the product can answer.
 *
 * THE THREE INVIOLABLE RULES (a violation is a failed task):
 *   1. IT RECORDS THE BOOKING FACT ONLY (SOR-1). This function NEVER writes
 *      `cohort_applications.status`, and never writes any other funnel-stage
 *      column. TeleCRM is the master; the reconciler (`reconcile-funnel-stage`)
 *      DERIVES the stage from what this function mirrors. Grep this file: there is
 *      no `status:` in any update payload, on purpose.
 *   2. FAIL-CLOSED on the signature. Bad, absent, malformed, or unverifiable →
 *      401 with NO detail, exactly like `tally-application-webhook`. An unset
 *      `CALENDLY_SIGNING_KEY` rejects everything rather than degrading to "trust
 *      the caller".
 *   3. Secrets by name only; nothing inlined.
 *
 * NO CORS — deliberately. Calendly delivers server-to-server, so a browser never
 * hits this function with credentialed CORS. We do NOT import `corsHeadersFor` and
 * do NOT echo `Access-Control-Allow-Origin`, which would let any cross-origin page
 * POST here and read the response. This mirrors `razorpay-webhook/index.ts:4-10`;
 * leaving CORS off entirely is the correct posture for a webhook.
 *
 * ONLY THE INTERVIEW EVENT TYPE IS MIRRORED. A Calendly webhook subscription is
 * scoped to an organization or a user and cannot be narrowed to one event type,
 * and INTEG-CAL-1 puts every interviewer on ONE org-level account — so every other
 * booking on that account (a sales call, an onboarding call, the second Calendly
 * account merged in later) is delivered here too. `CALENDLY_INTERVIEW_EVENT_TYPE`
 * is the allowlist that keeps them out, and it is FAIL-CLOSED: unset → nothing is
 * mirrored, loudly logged. Mirroring a stranger's call onto an applicant's row —
 * or letting its cancellation clear a real interview — is silent corruption the
 * reconciler would then read as truth.
 *
 * IDEMPOTENCY IS KEYED ON THE CALENDLY EVENT URI, which is why
 * `cohort_applications.calendly_event_uri` exists: it is the identity of the LAST
 * booking this row processed. Value equality alone cannot do this job — two
 * different bookings can share a start time, and one booking's cancel half and
 * another's create half both resolve to the same row.
 *   - Redelivery of the event we hold → identical identity AND identical fact →
 *     no write at all.
 *   - `invitee.canceled` for an event we are NOT holding → ignored. Only the
 *     booking we actually hold can be cleared.
 *   - A retry that crosses a later booking → `calendly_booked_at` (Calendly's own
 *     `created_at` for the invitee) orders the two, and the older one is dropped
 *     rather than dragging the row back to a superseded slot.
 *
 * A CANCELLATION LEAVES A TOMBSTONE, NOT A BLANK ROW. Clearing the booking clears
 * the FACT columns (`interview_starts_at`, `interview_modality`, `interview_date`)
 * but KEEPS the identity and the delivery watermark: `calendly_event_uri` = the
 * cancelled event, `calendly_booked_at` = the newest delivery instant seen. So:
 *   - `calendly_event_uri IS NULL`                        → no delivery ever landed
 *   - uri set + `interview_starts_at` set                 → a LIVE booking
 *   - uri set + `interview_starts_at IS NULL`             → that booking was cancelled
 * Nulling the watermark instead would disarm the ordering guard the moment a
 * booking is cancelled: a late Calendly retry of the create half would look brand
 * new, resurrect the cancelled interview and burn a second reschedule. The
 * tombstone is also what lets an out-of-order cancel (cancel delivered before its
 * own create) refuse the create that follows it.
 *
 * RESCHEDULE IS NOT CANCELLATION. Calendly has no "rescheduled" event: it fires
 * `invitee.canceled` for the OLD invitee and `invitee.created` for the new one, in
 * no guaranteed order, and both resolve to the same application row. A cancel half
 * that carries `rescheduled` / `new_invitee` is therefore SKIPPED outright — the
 * create half owns the booking fact. Missing this is how a reschedule ends as a row
 * with no interview and a consumed reschedule budget.
 *
 * `reschedule_count` is the only counter here. It advances when Calendly says this
 * booking replaced a previous invitee (`old_invitee`) AND the delivered event is
 * not the one already held, so neither a redelivery nor a late retry can
 * double-count.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { hmacSha256Hex, timingSafeEqual } from "../_shared/crypto.ts";
import { last10 } from "../_shared/phone.ts";
import {
  bookingFromEvent,
  eventTypeOf,
  isAllowedEventType,
  isFreshSignature,
  modalityFromEvent,
  parseEventTypeAllowlist,
  parseSignatureHeader,
  signingPayload,
} from "../_shared/calendly.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Env name per §6.2. The vault variable is CALENDLY_WEBHOOK_SIGNING_KEY; the
// orchestrator maps it to this name at deploy time.
const signingKey = Deno.env.get("CALENDLY_SIGNING_KEY") ?? "";
// The interview event type(s) on the one org-level account (INTEG-CAL-1). Config,
// not a credential: an API URI, a bare uuid, a hosted scheduling link or the event
// type's name, comma-separated. Unset → this receiver mirrors NOTHING (see the
// header): every other booking on that account reaches this function too, and
// attributing one of them to an applicant is unrecoverable.
const interviewEventTypes = parseEventTypeAllowlist(
  Deno.env.get("CALENDLY_INTERVIEW_EVENT_TYPE"),
);

/** The `cohort_applications` columns this receiver reads. Explicit, so the row is typed. */
interface ApplicationRow {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  interview_modality: string | null;
  interview_starts_at: string | null;
  reschedule_count: number | null;
  /**
   * Identity of the LAST booking this row processed — the idempotency key. Paired
   * with a NULL `interview_starts_at` it is a tombstone: that booking was cancelled.
   */
  calendly_event_uri: string | null;
  /**
   * Calendly's `created_at` for that booking's invitee — how deliveries are ordered.
   * Monotonic: it survives a cancellation so late retries stay orderable.
   */
  calendly_booked_at: string | null;
}

/** The booking-fact columns this receiver writes. `status` is absent BY DESIGN (SOR-1). */
interface BookingWrite {
  interview_modality: string | null;
  interview_starts_at: string | null;
  interview_date: string | null;
  calendly_event_uri: string | null;
  calendly_booked_at: string | null;
  reschedule_count?: number;
}

const SELECT_COLUMNS =
  "id, email, phone, created_at, interview_modality, interview_starts_at, reschedule_count, calendly_event_uri, calendly_booked_at";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The ONLY rejection shape. No reason, no echo — a probe learns nothing from it. */
function unauthorized(): Response {
  return jsonRes({ error: "Invalid signature" }, 401);
}

/** Same instant? Compares as timestamps so "…Z" and "…+00:00" are not a spurious change. */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return ta === tb;
}

/**
 * Does this delivery describe a booking OLDER than the one the row already holds?
 *
 * Calendly retries a delivery whose 2xx it did not see, and that retry can land
 * AFTER a later booking has already been mirrored. Without this, the retry looks
 * like a brand-new booking: it would write the superseded slot back over the live
 * one and consume another reschedule. Ordering is by Calendly's own invitee
 * `created_at`, never by the start time — a reschedule may legitimately move a
 * booking earlier. Unknown on either side → false, i.e. we do not block a write we
 * cannot prove is stale.
 */
function isSupersededDelivery(storedBookedAt: string | null, deliveredBookedAt: string | null): boolean {
  if (storedBookedAt === null || deliveredBookedAt === null) return false;
  const stored = Date.parse(storedBookedAt);
  const delivered = Date.parse(deliveredBookedAt);
  if (Number.isNaN(stored) || Number.isNaN(delivered)) return false;
  return delivered < stored;
}

/**
 * The later of two delivery instants — the watermark a cancellation must CARRY
 * FORWARD rather than clear. Ordering is the only defence against a Calendly retry
 * that lands after the booking it describes is gone, so the watermark must be
 * monotonic across a cancel; a stale cancel delivery can never lower it. An
 * unparseable side loses to the parseable one.
 */
function laterInstant(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return tb > ta ? b : a;
}

/**
 * Verify `HMAC-SHA256(`${t}.${rawBody}`, CALENDLY_SIGNING_KEY)` in hex, constant-time
 * (§6.2) — the same primitives `razorpay-webhook` uses, against a DIFFERENT secret
 * and a DIFFERENT signed string. Confusing any two of the three webhook schemes is a
 * security defect, which is why the signed string is built by `signingPayload` and
 * never re-derived inline.
 */
async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  if (signingKey === "") {
    console.error("[calendly-webhook] CALENDLY_SIGNING_KEY is not configured, rejecting delivery");
    return false;
  }
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  // §6.2's optional replay window, taken. A day-wide horizon so Calendly's own
  // retry backoff still verifies (see SIGNATURE_TOLERANCE_SECONDS) while a delivery
  // captured and kept for later does not.
  if (!isFreshSignature(parsed.t, Date.now())) {
    console.warn("[calendly-webhook] signature timestamp outside the replay window, rejecting");
    return false;
  }
  const expected = await hmacSha256Hex(signingPayload(parsed.t, rawBody), signingKey);
  return timingSafeEqual(expected, parsed.v1.toLowerCase());
}

/**
 * Resolve the application row by phone (primary) → email (fallback) — INTEG-KEY-1.
 *
 * The phone probe is a SUFFIX match on the 10-digit subscriber number, because the
 * same person is stored as "+919788385577", "919788385577" or "9788385577" across
 * the four systems; the suffix is narrowed again in code so a `LIKE` can't widen the
 * match. Newest application first: a person who applied to several cohorts is being
 * interviewed for the one they most recently applied to.
 */
async function resolveApplication(
  // deno-lint-ignore no-explicit-any
  admin: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  phone: string | null,
  email: string | null,
): Promise<{ row: ApplicationRow | null; key: "phone" | "email" | null }> {
  const subscriber = phone ? last10(phone) : "";
  if (subscriber !== "") {
    const { data, error } = await admin
      .from("cohort_applications")
      .select(SELECT_COLUMNS)
      .like("phone", `%${subscriber}`)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) console.error("[calendly-webhook] phone lookup failed:", error.message);
    const match = ((data ?? []) as ApplicationRow[]).find(
      (r) => last10(r.phone ?? "") === subscriber,
    );
    if (match) return { row: match, key: "phone" };
  }

  if (email) {
    // .eq (not .ilike) on purpose: `_` is legal and common in an address but is a
    // single-character wildcard to LIKE, so an ilike probe could resolve a DIFFERENT
    // person's application. Two exact probes instead — as sent, then lowercased.
    for (const candidate of [email, email.toLowerCase()]) {
      const { data, error } = await admin
        .from("cohort_applications")
        .select(SELECT_COLUMNS)
        .eq("email", candidate)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) console.error("[calendly-webhook] email lookup failed:", error.message);
      const row = ((data ?? []) as ApplicationRow[])[0];
      if (row) return { row, key: "email" };
    }
  }

  return { row: null, key: null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // The RAW body, read once. Signature verification must run over exactly these
  // bytes — parsing first and re-serialising would break the digest.
  const rawBody = await req.text();

  if (!(await verifySignature(rawBody, req.headers.get("Calendly-Webhook-Signature")))) {
    return unauthorized();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonRes({ error: "Invalid payload" }, 400);
  }

  const eventName = (payload as { event?: unknown } | null)?.event;
  if (eventName !== "invitee.created" && eventName !== "invitee.canceled") {
    return jsonRes({ ok: true, skipped: "unhandled_event" });
  }

  // EVENT-TYPE SCOPING, before any DB work. The subscription is org-wide, so this is
  // the only place a non-interview booking can be turned away (see the header).
  if (interviewEventTypes.length === 0) {
    console.error(
      `[calendly-webhook] CALENDLY_INTERVIEW_EVENT_TYPE is not configured — refusing to mirror ${eventTypeOf(payload) ?? "an unnamed event type"} as an interview`,
    );
    return jsonRes({ ok: true, skipped: "event_type_not_configured" });
  }
  if (!isAllowedEventType(payload, interviewEventTypes)) {
    console.log(
      `[calendly-webhook] not the interview event type, skipping: ${eventTypeOf(payload) ?? "unnamed"}`,
    );
    return jsonRes({ ok: true, skipped: "not_the_interview_event_type" });
  }

  const booking = bookingFromEvent(payload);
  if (!booking || !booking.eventUri) {
    // No scheduled-event URI → nothing to key the row on. `bookingFromEvent` will
    // NOT substitute the invitee URI: a row keyed on one could never match a later
    // delivery, so the genuine cancellation would be skipped forever.
    console.error("[calendly-webhook] delivery carried no scheduled event URI, skipping");
    return jsonRes({ ok: true, skipped: "unparseable_payload" });
  }

  if (supabaseUrl === "" || serviceKey === "") {
    console.error("[calendly-webhook] Supabase service credentials are not configured");
    return jsonRes({ error: "Not configured" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  const { row, key } = await resolveApplication(admin, booking.inviteePhone, booking.inviteeEmail);
  if (!row) {
    // Park the orphan LOUDLY but without PII, and still answer 200: a retry cannot
    // conjure the missing application, and a 5xx would only make Calendly redeliver
    // forever. The orphan rate is the health metric that surfaces this (§7).
    console.warn(
      `[calendly-webhook] orphan booking: no cohort_applications row resolved by phone or email (canceled=${booking.canceled})`,
    );
    return jsonRes({ ok: true, matched: false });
  }

  // ── The booking fact, and NOTHING else. No `status` key appears below (SOR-1). ──
  let update: BookingWrite;

  // Identity first: is the delivered event the booking this row is holding? Every
  // decision below turns on this, not on value equality (§6.5).
  const heldEventUri = row.calendly_event_uri;
  const sameEvent = heldEventUri !== null && heldEventUri === booking.eventUri;
  // A create ALWAYS writes a start (a delivery without one is refused below), so a
  // known event with no start is precisely a cancelled one — the tombstone.
  const isTombstoned = sameEvent && row.interview_starts_at === null;

  if (booking.canceled) {
    // A RESCHEDULE'S CANCEL HALF IS NOT A CANCELLATION. Calendly cancels the old
    // invitee and creates the new one on every reschedule, in no guaranteed order,
    // and both halves resolve to this same row. Clearing here would wipe a live
    // booking (and, when the create half already landed, leave a consumed
    // reschedule with nothing to show for it). The create half owns the fact.
    if (booking.rescheduled) {
      return jsonRes({ ok: true, matched: true, key, skipped: "reschedule_cancellation" });
    }

    // Only the booking this row is on can be cleared. A cancellation for some other
    // event — a late retry, or the tail of a rebooking whose create half already
    // landed — leaves the live booking alone. The row carries ONE booking identity,
    // so such a cancellation is not tombstoned either; ordering by
    // `calendly_booked_at` is what still guards the row against its stale create.
    if (heldEventUri !== null && !sameEvent) {
      return jsonRes({ ok: true, matched: true, key, skipped: "not_the_held_booking" });
    }

    // Already cleared — the tombstone for this very event is already on the row, so
    // a redelivered cancellation writes nothing.
    if (isTombstoned && row.interview_modality === null) {
      return jsonRes({ ok: true, matched: true, key, idempotent: true });
    }

    // Cancellation clears the booking FACTS but leaves a tombstone: the identity of
    // the cancelled event plus the delivery watermark (see the header). Nulling
    // those two as well would let a late retry of this booking's create half look
    // brand new — resurrecting the interview and burning a reschedule.
    // `interview_starts_at` going NULL is what the reconciler will see as "no longer
    // scheduled"; it derives the stage from that, we do not assert one.
    // `reschedule_count` is deliberately untouched — a cancel is not by itself a
    // reschedule, and the replacement booking is what counts.
    update = {
      interview_modality: null,
      interview_starts_at: null,
      interview_date: null,
      calendly_event_uri: booking.eventUri,
      calendly_booked_at: laterInstant(row.calendly_booked_at, booking.bookedAt),
    };
  } else {
    const modality = modalityFromEvent(payload);
    const startTime = booking.startTime;

    // A booking with no start time is not a booking fact — and writing one would
    // forge a tombstone (uri set, start NULL), i.e. make a live booking look
    // cancelled. Refuse it instead.
    if (startTime === null) {
      console.error("[calendly-webhook] invitee.created carried no start_time, skipping");
      return jsonRes({ ok: true, matched: true, key, skipped: "booking_without_start" });
    }

    // A create for the event this row has ALREADY CANCELLED. This is the late retry
    // Calendly sends when it never saw our 2xx for the create half, and it must
    // never resurrect the booking (nor advance `reschedule_count`).
    if (isTombstoned) {
      return jsonRes({ ok: true, matched: true, key, skipped: "already_canceled" });
    }

    // Redelivery of the very event we hold, carrying the same fact: write nothing.
    if (
      sameEvent && sameInstant(row.interview_starts_at, startTime) &&
      row.interview_modality === modality
    ) {
      return jsonRes({ ok: true, matched: true, key, idempotent: true });
    }

    // A retry that crossed a later booking. Older than the newest delivery this row
    // has seen — live or cancelled — → drop it, rather than write a superseded slot
    // back and consume another reschedule.
    if (!sameEvent && isSupersededDelivery(row.calendly_booked_at, booking.bookedAt)) {
      return jsonRes({ ok: true, matched: true, key, skipped: "superseded_delivery" });
    }

    update = {
      interview_modality: modality,
      // interview_starts_at is the Calendly-OWNED fact and the authoritative column
      // for a Calendly-sourced booking (V-3 reads this one). interview_date is the
      // pre-existing column §6.1 says to reuse, written in lockstep so anything
      // built on it later reads the same instant. Nothing reads it today.
      interview_starts_at: startTime,
      interview_date: startTime,
      calendly_event_uri: booking.eventUri,
      // The watermark only ever moves FORWARD. This delivery is not older than the
      // stored one (the guard above proved it), but it may carry no `created_at` at
      // all — and letting that null out the watermark would disarm the ordering for
      // every delivery after it.
      calendly_booked_at: laterInstant(row.calendly_booked_at, booking.bookedAt),
    };

    // Calendly says this invitee replaced an earlier one AND it is not the booking
    // we already hold → one reschedule consumed. Both halves of that guard matter:
    // the first keeps a first booking from counting, the second keeps a redelivery
    // (and, with the superseded check above, a late retry) from counting twice.
    // Storage only; V-3 owns the guardrail's meaning.
    if (booking.rescheduledFrom !== null && !sameEvent) {
      update.reschedule_count = (row.reschedule_count ?? 0) + 1;
    }
  }

  const { error: updateError } = await admin
    .from("cohort_applications")
    .update(update)
    .eq("id", row.id);

  if (updateError) {
    console.error("[calendly-webhook] booking write failed:", updateError.message);
    return jsonRes({ error: "Write failed" }, 500);
  }

  console.log(
    `[calendly-webhook] ${eventName} mirrored (key=${key}, modality=${update.interview_modality ?? "null"})`,
  );
  return jsonRes({ ok: true, matched: true, key });
});
