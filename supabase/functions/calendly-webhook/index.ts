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
 * THE START INSTANT HAS EXACTLY ONE HOME: `cohort_applications.interview_date`, the
 * column that already existed (`20260413100000`). §6.1 scopes this work as the new
 * `interview_modality` column "plus REUSE of the existing `interview_date` column",
 * and §6.3 maps `scheduled_event.start_time` straight onto it. A second,
 * Calendly-owned start column would let the admin surface and the interview UI hold
 * different instants for the same interview with no rule saying which wins, so this
 * function writes `interview_date` and nothing beside it.
 *
 * REUSING A SHARED COLUMN NEEDS A PRECEDENCE RULE, and this is it: while the booking
 * this row holds is LIVE, Calendly is authoritative on its start, so a redelivery
 * re-asserts `start_time`. Once that booking is cancelled this function stops writing
 * `interview_date` entirely — a human may then schedule into it and nothing here will
 * take it back. Which is also why the cancellation signal is a column of its own; see
 * the tombstone below.
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
 * the FACT columns (`interview_date`, `interview_modality`), RAISES the cancellation
 * flag, and KEEPS the identity and the delivery watermark: `calendly_canceled_at` =
 * when we recorded it, `calendly_event_uri` = the cancelled event,
 * `calendly_booked_at` = the newest delivery instant seen. So:
 *   - `calendly_event_uri IS NULL`                        → no delivery ever landed
 *   - uri set + `calendly_canceled_at IS NULL`            → a LIVE booking
 *   - uri set + `calendly_canceled_at` set                → that booking was cancelled
 * Nulling the watermark instead would disarm the ordering guard the moment a
 * booking is cancelled: a late Calendly retry of the create half would look brand
 * new, resurrect the cancelled interview and burn a second reschedule. The
 * tombstone is also what lets an out-of-order cancel (cancel delivered before its
 * own create) refuse the create that follows it.
 *
 * THE FLAG IS A COLUMN BECAUSE AN ABSENT START IS NOT PROOF OF ANYTHING. Reading the
 * tombstone off "`interview_date IS NULL`" would be sound only if this function were
 * that column's sole writer, and reusing the shared column (above) is precisely the
 * decision that it is not: an admin or a backfill putting a date back would silently
 * disarm the refusal, and the next Calendly retry of the cancelled create would
 * resurrect the interview ON TOP of their date. `calendly_canceled_at` is written by
 * this function under the service role and by nothing else, so a writer that knows
 * nothing about Calendly cannot forge or clear it.
 *
 * RESCHEDULE IS NOT CANCELLATION. Calendly has no "rescheduled" event: it fires
 * `invitee.canceled` for the OLD invitee and `invitee.created` for the new one, in
 * no guaranteed order, and both resolve to the same application row. A cancel half
 * that carries `rescheduled` / `new_invitee` is therefore SKIPPED outright — the
 * create half owns the booking fact. Missing this is how a reschedule ends as a row
 * with no interview and a consumed reschedule budget.
 *
 * THE HOST HALF OF THE PAYLOAD IS NOW READ TOO (REQ-INT-2). V-1 parsed the invitee
 * and nothing else, which left the product unable to NAME the person taking the
 * interview — the reason `InterviewerCard` had no honest caller. `scheduled_event.
 * event_memberships[].user_name` is that name, mirrored onto
 * `cohort_applications.interview_interviewer_name` (migration `20260728130000`).
 * It is a booking fact like the rest: cleared on cancellation, replaced wholesale by
 * a different booking, and NULL — deliberately, not defectively — whenever the
 * delivery does not name exactly one host. The host's EMAIL is never read or stored;
 * nothing renders it, and deriving a name from an address would be a guess.
 *
 * IDENTITY IS PHONE-PRIMARY AND BOTH SIDES ARE NORMALISED (INTEG-KEY-1). The intake
 * chain stores the phone verbatim as the applicant typed it into Tally, so the
 * column holds "+91 98765 43210" as readily as "9876543210"; a raw-text suffix probe
 * against it matches only the clean spelling, which made phone-primary INERT against
 * most real rows while looking correct. `_shared/phone.ts` `phoneLikePatterns`
 * supplies separator-tolerant probes and `last10` re-checks each candidate exactly,
 * on both sides. EVERY probe runs and their exact matches are UNIONED (deduped by
 * row id): stopping at the first probe that hit would show the ambiguity guard only
 * the tidily-spelled row when one applicant holds two differently-spelled ones, and
 * a candidate set of one binds without argument. The email fallback cannot carry this
 * on its own: a phone-only account's stored address is the synthetic
 * `<digits>@phone.leveluplearning.in` placeholder, which no invitee will ever type —
 * so when a delivery DOES carry that placeholder it is read back as a phone, never
 * joined as an address.
 *
 * AND AMBIGUITY REFUSES. When more than one application answers to the delivered
 * identity, the receiver binds only on EVIDENCE — one candidate already holding this
 * `calendly_event_uri`, or exactly one carrying the invitee's own email — and
 * otherwise writes nothing and logs at error level. "Newest application first" reads
 * like a tie-break but is a guess: a Calendly delivery names no cohort, so nothing in
 * it says which of a repeat applicant's interviews this is. A missed mirror is
 * recoverable and loud; an interview written onto a stranger's row is neither.
 * An ambiguous PHONE probe does not short-circuit the email fallback, though — it is
 * remembered while the fallback runs, because the delivered number is a reminder
 * number the invitee may have set to someone else's, and refusing before trying the
 * key the contract calls the fallback would make phone-primary/email-fallback into
 * phone-only. Only if the fallback also fails does the ambiguity stand.
 *
 * `reschedule_count` is the only counter here. It advances when Calendly says this
 * booking replaced a previous invitee (`old_invitee`) AND the delivered event is
 * not the one already held, so neither a redelivery nor a late retry can
 * double-count.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { hmacSha256Hex, timingSafeEqual } from "../_shared/crypto.ts";
import {
  isSyntheticEmail,
  last10,
  phoneFromSyntheticEmail,
  phoneLikePatterns,
} from "../_shared/phone.ts";
import {
  bookingFromEvent,
  eventTypeOf,
  eventTypeTokensOf,
  interviewerNameFromEvent,
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
// not a credential: the API URI `https://api.calendly.com/event_types/<uuid>`, the
// bare uuid, or the event type's NAME exactly as Calendly spells it,
// comma-separated. NOT the hosted scheduling link — a v2 delivery carries the event
// type as an API URI and no slug, so a link-shaped value matches nothing and every
// booking is dropped (see `_shared/calendly.ts` `identityTokens`, and config.toml).
// Unset → this receiver mirrors NOTHING (see the header): every other booking on
// that account reaches this function too, and attributing one of them to an
// applicant is unrecoverable.
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
  /**
   * The host Calendly named on the booking this row holds (REQ-INT-2), or NULL when
   * the delivery named no single host. See the create branch for why a redelivery
   * that carries no name does not clear it.
   */
  interview_interviewer_name: string | null;
  /** The one start column (§6.1 reuse, §6.3 mapping) — see the header. */
  interview_date: string | null;
  reschedule_count: number | null;
  /**
   * Identity of the LAST booking this row processed — the idempotency key. Paired
   * with a non-NULL `calendly_canceled_at` it is a tombstone: that booking was
   * cancelled.
   */
  calendly_event_uri: string | null;
  /**
   * Calendly's `created_at` for that booking's invitee — how deliveries are ordered.
   * Monotonic: it survives a cancellation so late retries stay orderable.
   */
  calendly_booked_at: string | null;
  /**
   * When we recorded the cancellation of the held booking; NULL while it is live.
   * The tombstone's own signal — see the header for why it is not `interview_date`.
   */
  calendly_canceled_at: string | null;
}

/** The booking-fact columns this receiver writes. `status` is absent BY DESIGN (SOR-1). */
interface BookingWrite {
  interview_modality: string | null;
  interview_interviewer_name: string | null;
  interview_date: string | null;
  calendly_event_uri: string | null;
  calendly_booked_at: string | null;
  calendly_canceled_at: string | null;
  reschedule_count?: number;
}

const SELECT_COLUMNS =
  "id, email, phone, created_at, interview_modality, interview_interviewer_name, interview_date, reschedule_count, calendly_event_uri, calendly_booked_at, calendly_canceled_at";

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

/** How many rows a single identity probe may consider before it is truncated. */
const CANDIDATE_LIMIT = 25;

/**
 * The outcome of resolving one delivery to one application row.
 *
 * `ambiguous` is a THIRD state, distinct from "matched" and "orphan", and it exists
 * because the two are not the only answers: a probe can find several applications
 * and have no evidence which one this booking belongs to. Binding to any of them is
 * a misbinding — the worst failure available here, since it writes an interview onto
 * a stranger's row and the reconciler then reads it as truth.
 */
interface Resolution {
  row: ApplicationRow | null;
  key: "token" | "phone" | "email" | null;
  ambiguous: boolean;
  /** How many candidates the deciding probe saw. For the log only. */
  candidates: number;
  /** Did the deciding probe hit the page limit, i.e. could it have hidden a rival? */
  truncated: boolean;
}

/**
 * Pick THE ONE application among candidates that all match the delivered identity,
 * or refuse.
 *
 * Two disambiguators, both EVIDENCE rather than preference:
 *   1. Exactly one candidate already holds this very `calendly_event_uri`. That is
 *      identity, not a guess — it is the row this booking was previously mirrored
 *      onto, so a reschedule or a cancellation lands where its create half did.
 *   2. Exactly one candidate carries the invitee's own email address. The delivery
 *      names that address; a row carrying it is the applicant who booked.
 *
 * Anything else REFUSES. Note what this replaces: "newest application first" reads
 * like a tie-break but is a guess — a Calendly delivery names no cohort and no
 * offering, so when one person holds two live applications nothing in the payload
 * says which interview this is. Refusing costs a mirrored booking (recoverable, and
 * logged); guessing costs a correct row (not recoverable, and silent).
 *
 * `requireEvidence` HAS TWO CALLERS AND TWO DIFFERENT REASONS.
 *
 * 1. THE TRUNCATED-PAGE CASE (email branch). "Exactly one candidate" is only a
 *    safe reason to bind when the probe could SEE every candidate; a page that
 *    came back full may have left a rival application on the next page, so
 *    uniqueness is then an artefact of the limit rather than a fact about the
 *    data.
 *
 * 2. THE UNVERIFIED-KEY CASE (phone branch, always on). The phone probe runs on
 *    `text_reminder_number`, which an invitee types into a public booking form
 *    and never proves they own. Bare uniqueness there means one typed string
 *    names somebody else's application row, so the phone branch passes `true`
 *    unconditionally. See the comment at its call site in `resolveApplication`.
 *
 * Under either, the two evidence tests still bind (they name a specific row by
 * making two independent identifiers agree), and bare uniqueness refuses.
 */
function chooseOne(
  candidates: ApplicationRow[],
  eventUri: string,
  email: string | null,
  requireEvidence = false,
): { row: ApplicationRow | null; ambiguous: boolean } {
  if (candidates.length === 0) return { row: null, ambiguous: false };

  const holdingThisBooking = candidates.filter((r) => r.calendly_event_uri === eventUri);
  if (holdingThisBooking.length === 1) return { row: holdingThisBooking[0], ambiguous: false };

  const wanted = (email ?? "").trim().toLowerCase();
  if (wanted !== "" && !isSyntheticEmail(wanted)) {
    const byEmail = candidates.filter((r) => (r.email ?? "").trim().toLowerCase() === wanted);
    if (byEmail.length === 1) return { row: byEmail[0], ambiguous: false };
  }

  if (candidates.length === 1 && !requireEvidence) return { row: candidates[0], ambiguous: false };

  return { row: null, ambiguous: true };
}

/**
 * Every application whose stored phone IS this subscriber number, however the
 * intake chain happened to spell it.
 *
 * BOTH SIDES OF THE COMPARISON ARE NORMALISED, which is the whole point. The stored
 * column is dirty by design — `tally-application-webhook` writes the phone verbatim
 * as the applicant typed it, so "+91 98765 43210" is what a row really holds — and
 * the previous probe was a raw-text suffix `LIKE '%9876543210'` against it. That
 * matches only the unseparated spelling, so phone-PRIMARY (INTEG-KEY-1) was inert
 * against the majority of real rows while looking correct: every delivery fell
 * through to the email fallback, which is itself broken for phone-only accounts
 * whose stored address is the synthetic `<digits>@phone.leveluplearning.in`
 * placeholder. The two failures together are a receiver that resolves almost
 * nothing.
 *
 * `phoneLikePatterns` (the SHARED `_shared/phone.ts` helper — there is no second
 * normaliser in this file) supplies a tight probe and a separator-tolerant one; each
 * candidate is then re-checked EXACTLY with `last10` on both sides, so the wide SQL
 * net can only offer candidates for that check to reject.
 *
 * EVERY PATTERN RUNS AND THE EXACT MATCHES ARE UNIONED — the probe does NOT stop at
 * the first pattern that hits, and that is the whole reason this dedupes by row id.
 * The tight pattern (`%9876543210`) matches a strict SUBSET of the tolerant one
 * (`%9%8%7%…%0%`): a row storing "9876543210" satisfies both, while the SAME
 * subscriber number stored as "+91 98765 43210" satisfies only the tolerant one. So
 * returning early on the tight pattern would hand the ambiguity guard a candidate
 * set of one whenever a repeat applicant's two rows are spelled differently — the
 * exact dirty-column case this probe exists for — and `chooseOne` would bind
 * unconditionally, silently selecting an application by phone-FORMATTING tidiness.
 * That is the same class of guess as the "newest application first" rule this
 * receiver removed, and it lands the interview on the wrong row. The union puts both
 * spellings in front of the guard, where a genuine ambiguity refuses.
 *
 * Running the tight probe as well as the tolerant one is not redundant even though
 * its matches are a subset: the two pages are drawn separately, so the tight probe
 * still surfaces a row that a truncated tolerant page would have cut off.
 *
 * `truncated` reports that some page came back FULL, i.e. a rival candidate may sit
 * unseen on the next page. It is what makes bare uniqueness insufficient in
 * `chooseOne` — see `requireEvidence` there.
 */
async function candidatesByPhone(
  // deno-lint-ignore no-explicit-any
  admin: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  phone: string,
): Promise<{ rows: ApplicationRow[]; truncated: boolean }> {
  const subscriber = last10(phone);
  if (subscriber === "") return { rows: [], truncated: false };

  // Keyed by row id so a row matched by BOTH patterns is one candidate, not two —
  // duplicates would otherwise read as ambiguity and refuse a perfectly good bind.
  const byId = new Map<string, ApplicationRow>();
  let truncated = false;

  for (const pattern of phoneLikePatterns(phone)) {
    const { data, error } = await admin
      .from("cohort_applications")
      .select(SELECT_COLUMNS)
      .like("phone", pattern)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_LIMIT);
    if (error) {
      console.error("[calendly-webhook] phone lookup failed:", error.message);
      continue;
    }
    const rows = (data ?? []) as ApplicationRow[];
    if (rows.length >= CANDIDATE_LIMIT) {
      // The wide pattern can out-run the page. Say so, and remember it: a truncated
      // probe could hide the true row, and that must neither look like "no such
      // applicant" nor let a lone survivor be treated as the only candidate.
      truncated = true;
      console.warn(
        `[calendly-webhook] phone probe hit the ${CANDIDATE_LIMIT}-row candidate limit; a match may have been truncated`,
      );
    }
    for (const candidate of rows) {
      if (last10(candidate.phone ?? "") !== subscriber) continue;
      if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
    }
  }

  return { rows: [...byId.values()], truncated };
}

/**
 * Resolve the application row by phone (primary) → email (fallback) — INTEG-KEY-1.
 *
 * A synthetic placeholder address is fed back into the PHONE probe rather than used
 * as an email: `919788385577@phone.leveluplearning.in` is a phone wearing an
 * address's clothes (our own login path mints it for phone-only accounts), so
 * joining on it as an email can only ever fail while looking like a real attempt.
 *
 * AN AMBIGUOUS PHONE PROBE DOES NOT END THE RESOLUTION — it is REMEMBERED, and the
 * email fallback still runs. INTEG-KEY-1 says phone-primary/email-FALLBACK, and
 * returning on phone ambiguity quietly turned that into phone-only in exactly the
 * case the fallback exists for. It is reachable: the delivered phone comes from
 * Calendly's `text_reminder_number`, which an invitee may legitimately set to a
 * parent's or a colleague's number — if THAT number matches two unrelated
 * applications, the old code refused even though the invitee's own email named a
 * third row exactly and uniquely. `chooseOne` could not rescue it either, because
 * its email test filters only the phone candidates and never the table.
 *
 * The fallback binds on the SAME evidence it always did — one row whose stored
 * address exactly equals the address the invitee themselves typed — so this widens
 * what resolves, never how confidently. If the email probe is itself ambiguous or
 * finds nothing, the remembered phone ambiguity is what the caller sees, and the
 * receiver still refuses. Ambiguity is never resolved by preference here.
 */
async function resolveApplication(
  // deno-lint-ignore no-explicit-any
  admin: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  applicationToken: string | null,
  phone: string | null,
  email: string | null,
  eventUri: string,
): Promise<Resolution> {
  // The app-minted token is the only key on this delivery obtained after an
  // authenticated ownership check rather than derived from a public form field.
  // It therefore wins before INTEG-KEY-1's phone/email fallback. The mapping
  // table is unreadable to anon/authenticated roles and the token is an
  // unguessable random UUID, never the application id. A holder can remove it or
  // share the capability-bearing link, but cannot mint a victim's value. A token miss is ordinary (hosted or
  // legacy link); an exact hit names one row and must never be overridden by an
  // invitee typing somebody else's email into the form.
  if (applicationToken) {
    const { data: binding, error: bindingError } = await admin
      .from("cohort_calendly_bindings")
      .select("application_id")
      .eq("token", applicationToken)
      .maybeSingle();
    if (bindingError) {
      console.error("[calendly-webhook] application-token lookup failed:", bindingError.message);
    } else if (binding?.application_id) {
      const { data: tokenRow, error: tokenRowError } = await admin
        .from("cohort_applications")
        .select(SELECT_COLUMNS)
        .eq("id", binding.application_id)
        .maybeSingle();
      if (tokenRowError) {
        console.error("[calendly-webhook] token-bound application read failed:", tokenRowError.message);
      }
      return {
        row: (tokenRow as ApplicationRow | null) ?? null,
        key: "token",
        ambiguous: false,
        candidates: tokenRow ? 1 : 0,
        truncated: false,
      };
    }
  }

  const syntheticPhone = email ? phoneFromSyntheticEmail(email) : null;
  const phoneKey = phone ?? syntheticPhone;
  const emailKey = email && !isSyntheticEmail(email) ? email : null;

  /** A phone ambiguity the email fallback did not manage to resolve. */
  let phoneAmbiguity: Resolution | null = null;

  if (phoneKey) {
    const { rows, truncated } = await candidatesByPhone(admin, phoneKey);
    // `requireEvidence` IS UNCONDITIONALLY TRUE HERE, AND IT IS A SECURITY GATE,
    // NOT THE TRUNCATION HEURISTIC IT IS IN THE EMAIL BRANCH.
    //
    // The phone this probe ran on is `text_reminder_number` — a FREE-TEXT FIELD
    // the invitee types into a PUBLIC booking form. Nobody proves they own it.
    // With bare uniqueness allowed, an attacker who books the public event type
    // and types a victim's mobile gets a candidate set of exactly one — the
    // victim's application — and `chooseOne`'s third branch binds their booking
    // onto that row. One unverified string, typed by a stranger, silently
    // rewrites whose interview this is. That is an account-takeover shape, not a
    // matching bug.
    //
    // Requiring evidence leaves the two branches that make TWO INDEPENDENT
    // identifiers agree: the row already holding this exact `event_uri`, or a
    // single candidate whose stored email equals the invitee's delivered
    // address. A phone alone can no longer name a row.
    //
    // THIS COSTS ALMOST NOTHING ON THE REAL PATH. The slot deep-links this
    // product hands out carry `?name=&email=` prefill, so an applicant arriving
    // through the app books with the address already on their row and binds by
    // email exactly as before. What stops binding is a booking made outside our
    // flow that shares no email with any application — and for that, the file's
    // own rule applies: refusing costs a mirrored booking, which is recoverable
    // and logged, while guessing costs a correct row, which is neither.
    //
    // THE DURABLE APP PATH IS A SECRET WE MINT, NOT A FIELD THEY TYPE. The slot
    // function now appends an opaque, owner-gated token to `scheduling_url` in
    // Calendly's supported `utm_content` carrier; the shared parser reads it and
    // this handler resolves it before reaching this fallback. This phone branch
    // remains for hosted/guest and pre-token bookings, so its evidence gate is
    // still load-bearing.
    const { row, ambiguous } = chooseOne(rows, eventUri, emailKey, true);
    if (row) return { row, key: "phone", ambiguous: false, candidates: rows.length, truncated };
    if (ambiguous) {
      phoneAmbiguity = { row: null, key: "phone", ambiguous: true, candidates: rows.length, truncated };
    }
  }

  if (emailKey) {
    // .eq (not .ilike) on purpose: `_` is legal and common in an address but is a
    // single-character wildcard to LIKE, so an ilike probe could resolve a DIFFERENT
    // person's application. Two exact probes instead — as sent, then lowercased.
    for (const candidate of [...new Set([emailKey, emailKey.toLowerCase()])]) {
      const { data, error } = await admin
        .from("cohort_applications")
        .select(SELECT_COLUMNS)
        .eq("email", candidate)
        .order("created_at", { ascending: false })
        .limit(CANDIDATE_LIMIT);
      if (error) {
        console.error("[calendly-webhook] email lookup failed:", error.message);
        continue;
      }
      const rows = (data ?? []) as ApplicationRow[];
      if (rows.length === 0) continue;
      // Same rule as the phone probe: a full page may hide a rival, so uniqueness
      // alone stops being evidence and only a named row binds.
      const truncated = rows.length >= CANDIDATE_LIMIT;
      const { row, ambiguous } = chooseOne(rows, eventUri, emailKey, truncated);
      if (row) return { row, key: "email", ambiguous: false, candidates: rows.length, truncated };
      if (ambiguous) {
        return { row: null, key: "email", ambiguous: true, candidates: rows.length, truncated };
      }
    }
  }

  // The phone probe found several candidates and the email fallback named none of
  // them. REFUSE — this is the ambiguity the caller logs and declines to bind.
  if (phoneAmbiguity) return phoneAmbiguity;

  return { row: null, key: null, ambiguous: false, candidates: 0, truncated: false };
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
    // A DROP IS LOUD, AND IT NAMES ITS OWN FIX. A misconfigured allowlist drops
    // every real booking with a healthy-looking 200, so at `log` level a receiver
    // that mirrors nothing is indistinguishable from an account with no traffic —
    // which is exactly how a total no-op survives review. Printing BOTH the tokens
    // this delivery answers to and the tokens configured turns the fix into
    // copy-and-paste. The delivered tokens are also echoed in the 200 body, where
    // Calendly's own webhook delivery log shows them without anyone opening
    // Supabase. No PII: these are event-type identities, never the invitee.
    //
    // EVERY DROP IS ONE WARN, AND THERE IS NO ERROR TIER HERE — deliberately, and
    // this is the second attempt at it. The first tried to spend ERROR on "this
    // instance has dropped a delivery and matched nothing", which cannot work: the
    // flag backing it is per-ISOLATE state that resets on every cold start, the
    // subscription is org-wide so most drops are CORRECT, and therefore a healthy
    // deployment raises that same ERROR on most cold isolates' first delivery. A
    // signal a correct deployment emits as readily as a broken one is not a signal,
    // and shipping it in the runbook as "an ERROR here is worth reading" would
    // teach the next operator to ignore the feed. What actually distinguishes a
    // wrong allowlist is the CONTENT of these lines — delivered-vs-configured, on
    // every drop — not their level. ERROR stays reserved for the two conditions
    // that are unambiguous whatever the traffic: an unset allowlist, and an
    // ambiguous identity.
    const delivered = eventTypeTokensOf(payload);
    console.warn(
      `[calendly-webhook] DROPPED ${String(eventName)} — event type not in ` +
        `CALENDLY_INTERVIEW_EVENT_TYPE. delivered=[${delivered.join(" | ")}] ` +
        `configured=[${interviewEventTypes.join(" | ")}]. If this IS the interview ` +
        `event type, set CALENDLY_INTERVIEW_EVENT_TYPE to one of the delivered values; ` +
        `if it is not, this drop is the allowlist working.`,
    );
    return jsonRes({
      ok: true,
      skipped: "not_the_interview_event_type",
      eventType: eventTypeOf(payload),
      delivered,
    });
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

  const { row, key, ambiguous, candidates, truncated } = await resolveApplication(
    admin,
    booking.applicationToken,
    booking.inviteePhone,
    booking.inviteeEmail,
    booking.eventUri,
  );
  if (ambiguous) {
    // REFUSE, DO NOT GUESS. Several applications answer to this identity and nothing
    // in the delivery says which one booked. Writing the interview onto the wrong
    // applicant's row is the worst outcome available to this receiver — silent,
    // cross-applicant, and read back by the reconciler as truth — so the booking
    // stays unmirrored and a human resolves it from this line. 200, because a retry
    // cannot disambiguate what a retry will carry identically.
    console.error(
      `[calendly-webhook] AMBIGUOUS identity: ${candidates} candidate applications matched by ${key}, ` +
        `and no evidence chooses between them — refusing to bind (canceled=${booking.canceled}, ` +
        `truncatedProbe=${truncated})`,
    );
    return jsonRes({ ok: true, matched: false, ambiguous: true });
  }
  if (!row) {
    // Park the orphan LOUDLY but without PII, and still answer 200: a retry cannot
    // conjure the missing application, and a 5xx would only make Calendly redeliver
    // forever. The orphan rate is the health metric that surfaces this (§7).
    console.warn(
      `[calendly-webhook] orphan booking: no cohort_applications row resolved (canceled=${booking.canceled}, ` +
        `hadPhone=${booking.inviteePhone !== null}, hadEmail=${booking.inviteeEmail !== null}, ` +
        `truncatedProbe=${truncated}) — ` +
        `identity keys are logged as presence only, never as values`,
    );
    return jsonRes({ ok: true, matched: false });
  }

  // ── The booking fact, and NOTHING else. No `status` key appears below (SOR-1). ──
  let update: BookingWrite;

  // Identity first: is the delivered event the booking this row is holding? Every
  // decision below turns on this, not on value equality (§6.5).
  const heldEventUri = row.calendly_event_uri;
  const sameEvent = heldEventUri !== null && heldEventUri === booking.eventUri;
  // The tombstone: the event this row holds, flagged cancelled by a previous
  // delivery. Read off `calendly_canceled_at` and never off an empty
  // `interview_date` — that column is shared with manual/admin scheduling, so an
  // absent start proves nothing about Calendly (see the header).
  const isTombstoned = sameEvent && row.calendly_canceled_at !== null;

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
    // a redelivered cancellation writes nothing. Returning here also means a second
    // delivery cannot re-clear an `interview_date` a human has since scheduled into
    // the cancelled row: this function is done with that booking.
    if (isTombstoned) {
      return jsonRes({ ok: true, matched: true, key, idempotent: true });
    }

    // Cancellation clears the booking FACTS but leaves a tombstone: the cancellation
    // flag, the identity of the cancelled event, and the delivery watermark (see the
    // header). Nulling the latter two as well would let a late retry of this
    // booking's create half look brand new — resurrecting the interview and burning
    // a reschedule. `interview_date` going NULL is what the reconciler will see as
    // "no longer scheduled"; it derives the stage from that, we do not assert one.
    // `reschedule_count` is deliberately untouched — a cancel is not by itself a
    // reschedule, and the replacement booking is what counts.
    update = {
      interview_modality: null,
      // The host of a cancelled booking is not this applicant's interviewer, so the
      // name goes with the rest of the booking facts. Same rule as the modality:
      // cleared here, re-asserted by whatever booking lands next.
      interview_interviewer_name: null,
      interview_date: null,
      calendly_event_uri: booking.eventUri,
      calendly_booked_at: laterInstant(row.calendly_booked_at, booking.bookedAt),
      // Our own clock: Calendly's cancel payload carries the invitee's `created_at`,
      // not a cancellation instant. What this records is when the mirror learned.
      calendly_canceled_at: new Date().toISOString(),
    };
  } else {
    const modality = modalityFromEvent(payload);
    const startTime = booking.startTime;

    // WHO IS TAKING IT (REQ-INT-2). `interviewerNameFromEvent` reads the HOST half
    // of the payload — `scheduled_event.event_memberships[].user_name` — and yields
    // null unless the delivery names exactly one host; it never reads the host's
    // email and never derives a name from one.
    //
    // The `sameEvent` fallback is the one nuance: Calendly's older published webhook
    // schema documents a membership as `user` + `user_email` only, so a leaner
    // envelope for a booking we ALREADY hold is not evidence the host changed, and
    // letting it null the stored name would lose a true fact for nothing. For a
    // DIFFERENT event there is no fallback on purpose — a new booking's facts
    // replace the old ones wholesale, and carrying a previous host's name onto
    // another booking would be exactly the invention this column exists to avoid.
    const deliveredInterviewer = interviewerNameFromEvent(payload);
    const interviewerName = sameEvent
      ? (deliveredInterviewer ?? row.interview_interviewer_name)
      : deliveredInterviewer;

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
      sameEvent && sameInstant(row.interview_date, startTime) &&
      row.interview_modality === modality &&
      row.interview_interviewer_name === interviewerName
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
      interview_interviewer_name: interviewerName,
      // The one start column: the pre-existing `interview_date` §6.1 reuses and §6.3
      // maps `scheduled_event.start_time` onto. One fact, one home — nothing else
      // here mirrors the start instant (see the header).
      interview_date: startTime,
      calendly_event_uri: booking.eventUri,
      // The watermark only ever moves FORWARD. This delivery is not older than the
      // stored one (the guard above proved it), but it may carry no `created_at` at
      // all — and letting that null out the watermark would disarm the ordering for
      // every delivery after it.
      calendly_booked_at: laterInstant(row.calendly_booked_at, booking.bookedAt),
      // A live booking is on the row again, so the tombstone comes down. Only a
      // DIFFERENT event can reach this line — the held event's own tombstone is
      // refused above — so this never un-cancels the booking it belongs to.
      calendly_canceled_at: null,
    };

    // Calendly says this invitee replaced an earlier one AND it is not the booking
    // we already hold → one reschedule consumed. Both halves of that guard matter:
    // the first keeps a first booking from counting, the second keeps a redelivery
    // (and, with the superseded check above, a late retry) from counting twice.
    // Storage only; Task V-3's reschedule control owns what the count MEANS.
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
