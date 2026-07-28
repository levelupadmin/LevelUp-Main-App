/**
 * calendly.ts — the PURE signature-input + payload-parsing core of the Calendly
 * interview-booking receiver (PHASE IV V-1; `04-INTEGRATION-CONTRACTS.md` §6).
 *
 * Everything the receiver DECIDES lives here: how the `Calendly-Webhook-Signature`
 * header splits into `{t, v1}`, what exact string gets HMAC'd, whether the signed
 * timestamp is still inside the replay window, whether the delivery is even the
 * INTERVIEW event type, which modality a Calendly location object means, whether the
 * delivery names ONE host we may call the interviewer, and which booking facts a
 * delivery carries — including the three that tell a RESCHEDULE
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
 *     what makes `cohort_applications.reschedule_count` live storage for Task V-3's
 *     one-reschedule guardrail.
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
  /**
   * ISO-8601 start of the scheduled event, as Calendly sent it. §6.3 maps it onto
   * the ONE start column, `cohort_applications.interview_date`.
   */
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
 * Normalise ONE identity token so the two sides of the allowlist comparison are
 * spelled the same way: lowercased, scheme-stripped, `www.`-stripped, no trailing
 * slash. Both the configured value and the delivered value go through this, so the
 * normalisation can only make a match MORE forgiving, never narrower — an operator
 * who pastes `https://api.calendly.com/…` and a payload that carries the same URI
 * must not miss each other over a scheme.
 */
function normalizeToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/**
 * The identity tokens a single event-type reference yields: the normalised value
 * itself, its last URL/path segment, and — when Calendly sent an OBJECT rather than
 * a bare URI — its `uri`, `slug`, `name` and `scheduling_url`.
 *
 * WHAT A REAL v2 DELIVERY ACTUALLY CARRIES, because this is the trap that made the
 * receiver drop every booking: `payload.scheduled_event.event_type` is a bare API
 * URI STRING (`https://api.calendly.com/event_types/<uuid>`). It yields exactly two
 * tokens — the URI and the uuid — and NO SLUG. So an allowlist configured with the
 * hosted scheduling link (`https://calendly.com/levelup/interview-30min`, whose last
 * segment is the slug) matches nothing at all: the delivered side has no `slug` to
 * compare against, and a uuid cannot be derived from a slug without an API call this
 * module is not allowed to make. The slug and `scheduling_url` tokens below are still
 * read because the OBJECT form (legacy envelopes, and the v2 event-type resource when
 * an integration inlines it) does carry them — but they are a bonus, not the
 * contract. `config.toml` therefore instructs the operator to configure the API URI,
 * the bare uuid, or the event type's NAME, and the receiver logs the tokens a
 * delivery actually offered whenever it drops one.
 */
function identityTokens(value: unknown): string[] {
  const tokens: string[] = [];
  const push = (raw: string | null) => {
    if (!raw) return;
    const token = normalizeToken(raw);
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
    push(asString(record.scheduling_url));
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
 * EVERY identity token this delivery answers to, from EVERY place Calendly can name
 * the event type — `payload.scheduled_event.event_type` (the v2 home),
 * `payload.event_type` (the legacy invitee-level one) and
 * `payload.scheduled_event.name`.
 *
 * All three are read, not just the first non-null. `eventTypeRefOf` deliberately
 * stops at the first one it finds because it answers "what do I PRINT for this
 * delivery"; matching must be the union, or a payload that carries a URI at the
 * scheduled-event level and an object with a slug at the invitee level would be
 * matchable by only one of the two forms an operator might reasonably have
 * configured.
 *
 * The NAME is weaker than a URI (two event types could share one), but it is the
 * only identity an operator can read off the Calendly UI without an API call, so
 * configuring by name has to work even when the payload also carries a URI.
 *
 * Exported because the receiver LOGS these tokens whenever it drops a delivery: a
 * misconfigured allowlist otherwise looks exactly like an account with no traffic,
 * and the fix is "copy one of these strings into CALENDLY_INTERVIEW_EVENT_TYPE".
 */
export function eventTypeTokensOf(payload: unknown): string[] {
  const scheduled = scheduledEventOf(payload);
  const invitee = inviteeOf(payload);
  const tokens: string[] = [];
  for (const ref of [scheduled?.event_type, invitee?.event_type, scheduled?.name]) {
    for (const token of identityTokens(ref)) {
      if (!tokens.includes(token)) tokens.push(token);
    }
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
 * tokens, separated by commas or newlines — NOT by spaces, because an event type's
 * name legitimately contains them ("LevelUp Cohort Interview").
 *
 * THE FORMS THAT ACTUALLY MATCH a v2 delivery are the API URI
 * (`https://api.calendly.com/event_types/<uuid>`), the bare uuid, and the event
 * type's NAME. A hosted scheduling link is accepted here (it yields its slug) but
 * matches only the legacy/object envelopes that carry a slug of their own — see
 * `identityTokens` for why, and `config.toml` for the operator-facing version of
 * the same warning.
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
 * would overwrite `interview_date` / `interview_modality` for whoever's phone or
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
  return eventTypeTokensOf(payload).some((token) => allowlist.includes(token));
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
 * Courtesy titles that precede a name. Stripped, never rendered: "Dr. Kavya Rao"
 * must yield the given name "Kavya", and taking the first whitespace token
 * unconditionally yields "Dr." — a card reading "Dr. / Admissions Interviewer" is
 * a fabricated first name attributed to a real colleague.
 */
const HONORIFICS = [
  "dr", "mr", "mrs", "ms", "miss", "mx", "prof", "professor", "sir", "madam",
  "shri", "sri", "smt", "capt", "rev", "fr", "adv",
  // "Md." / "Mohd." — the abbreviated prefix a very large share of South Asian
  // names carry. Without it "Md. Imran" rendered nothing at all (the token fails
  // every shape check below), and a permanent blank for one of the commonest name
  // forms in this product's own market is not a safe default, it is a bug.
  // Neither abbreviation is plausibly a standalone given name, which is the bar
  // for entry to this list.
  "md", "mohd",
];

/**
 * Nobiliary / patronymic PARTICLES — the connective parts of a surname that are
 * never what a person is called. "de Souza Silva" rendered the given name "de" and
 * "Van Der Berg" rendered "Van": both are the same defect as rendering "Dr.", so
 * they are skipped exactly like an honorific and the next real token is used.
 *
 * Curated the same way as the lists above: only particles that are NEVER a
 * standalone given name in the populations this product serves. "Al", "El", "Le",
 * "La" and "Abu" are deliberately ABSENT — each is plausibly someone's actual name
 * or the head of one, and skipping a real name's first token would render the
 * wrong part of it.
 */
const NAME_PARTICLES = [
  "de", "del", "dela", "della", "di", "da", "dos", "das", "du",
  "van", "von", "der", "den", "ter", "ten", "bin", "ibn",
];

/**
 * Tokens that mean the value names an ORGANISATION, a role inbox or a function
 * rather than a person. INTEG-CAL-1 puts every interviewer on ONE org-level
 * Calendly account, which is exactly the configuration most likely to carry the
 * ORGANISATION'S name on its membership — "LevelUp Learning", "Admissions Team" —
 * and `user_name` is a free-text field nobody validates.
 *
 * Curated to be UNAMBIGUOUS: no entry here is plausibly someone's given name or
 * surname. Words that are both ("Meet", "Tech", "Co") are deliberately absent —
 * this list rejects the whole value, and rejecting a real person's name is a
 * silent, permanent blank on the one surface that names them.
 */
const ORGANISATION_WORDS = [
  "learning", "academy", "institute", "institution", "school", "college",
  "university", "education", "team", "admissions", "admission", "support",
  "helpdesk", "careers", "recruitment", "recruiting", "labs", "foundation",
  "solutions", "technologies", "enterprises", "company", "corp", "corporation",
  "inc", "llc", "llp", "ltd", "limited", "pvt", "private", "gmbh", "plc",
  "consulting", "consultants", "associates", "ventures", "holdings",
  "productions", "office", "department", "dept", "operations", "noreply",
  "no-reply", "info", "contact", "admin", "booking", "bookings", "scheduling",
  "cohort", "cohorts", "programme", "batch",
  // The FUNCTION a shared org-level account is most often named for. INTEG-CAL-1
  // means one membership serves every interviewer, so "Interview", "Reception",
  // "Front Desk", "Hiring", "Talent" and "Sales" are as likely a `user_name` as
  // anyone's actual name — and each of them reaches the card as the person the
  // applicant is about to meet. None is plausibly a given name or a surname,
  // which is the bar for entry to this list.
  "interview", "interviews", "interviewer", "reception", "desk", "hiring",
  "talent", "sales", "calendly",
];

/**
 * The offering/brand names this product ships under, as SINGLE tokens. A
 * membership named for the BRAND is the single most likely non-person value on a
 * shared org account, and "LevelUp Learning" rendering as the interviewer
 * "LevelUp" is the failure this guard exists for. Kept as a constant here — in the
 * PURE parser — so the guard needs no prop, no page edit and no second copy in the
 * component.
 */
const BRAND_WORDS = ["levelup", "leveluplearning", "forge", "theforge", "millennial"];

/**
 * The same brands as WHOLE VALUES, whitespace-collapsed and lowercased.
 *
 * A per-token list cannot catch a brand that is SPELLED WITH A SPACE: "Level Up"
 * has the tokens "level" and "up", neither of which is a word this file may
 * reject on its own (both are ordinary English words and "Up" is not an
 * organisation), so the token pass let the brand's own spaced spelling through and
 * rendered the given name "Level". The whole-value pass closes that without
 * widening the token list, because it only ever rejects a value that IS the brand
 * end to end — a real person whose name merely contains one of these words is
 * untouched.
 *
 * `personNameOf` also compares the letters-only squash of the whole value against
 * `BRAND_WORDS`, so "Level Up", "Level-Up" and "LevelUp" collapse to one check and
 * a new spacing of an existing brand needs no new entry here.
 */
const BRAND_PHRASES = [
  "level up",
  "level up learning",
  "levelup learning",
  "level up edu",
  "levelup edu",
  "the forge",
  "forge by levelup",
  "forge by level up",
  "millennial labs",
];

/** A token with its surrounding punctuation removed — "Dr." → "Dr", "Ravi." → "Ravi". */
function cleanNameToken(token: string): string {
  return token.replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}]+$/u, "");
}

/**
 * Split a name into its cleaned tokens.
 *
 * A DOT THAT RUNS STRAIGHT INTO THE NEXT LETTER IS A SEPARATOR. An SSO- or
 * directory-derived `user_name` legitimately arrives as "Ravi.Kumar", and as one
 * unsplit token it fails every shape check below — i.e. a real person renders as a
 * permanent blank. Splitting there costs nothing: no name form spells a single
 * given name with an internal dot.
 */
function splitNameTokens(raw: string): string[] {
  return raw
    .replace(/\.(?=\p{L})/gu, ". ")
    .split(/\s+/)
    .map(cleanNameToken)
    .filter((token) => token !== "");
}

/**
 * The GIVEN NAME among a person's cleaned tokens — the first token that is a name
 * rather than a piece of scaffolding around one — or `null`.
 *
 * THREE THINGS ARE SKIPPED RATHER THAN RENDERED, all for the same reason: none of
 * them is what anybody is called, and rendering one attributes an invented given
 * name to a real colleague.
 *   - a BARE INITIAL — "S. Kumar" is called Kumar, "Prof. R Iyer" is called Iyer.
 *     (Initial-plus-name is the standard South Indian form, so rejecting it
 *     outright — which is what the ≥2-letter rule used to do — blanks the card for
 *     a whole naming convention.)
 *   - a PARTICLE — "de", "Van Der" (see `NAME_PARTICLES`).
 *   - a token that is not name-SHAPED at all: letters plus the marks, apostrophes
 *     and hyphens real names carry, and nothing else. A handle like "ravi_kumar"
 *     is not a name.
 * If nothing qualifies, the answer is `null` and no card renders — the honest
 * outcome, and the one this whole guard exists to reach instead of a guess.
 */
function givenTokenOf(tokens: readonly string[]): string | null {
  for (const token of tokens) {
    if ((token.match(/\p{L}/gu) ?? []).length < 2) continue;
    if (NAME_PARTICLES.includes(token.toLowerCase())) continue;
    if (!/^\p{L}[\p{L}\p{M}'’-]*$/u.test(token)) continue;
    return token;
  }
  return null;
}

/**
 * The cleaned, honorific-stripped tokens of a value that is confidently ONE
 * PERSON'S NAME, or `null`. The shared core of `personNameOf` and `givenNameOf`, so
 * the two can never disagree about whether a value names a person.
 *
 * Deliberately narrow, because the value ends up on a card that tells an applicant
 * who they are about to meet. An address is not a name, a URL is not a name, a token
 * carrying no letter is not a name — and, the reason this guard was widened, NEITHER
 * IS AN ORGANISATION. `user_name` is free text on an org-level account, so
 * "LevelUp Learning" and "Admissions Team" arrive here as readily as "Kavya Rao";
 * rendering their first token invents a colleague who does not exist.
 *
 * Anything rejected degrades to `null` — no stored name, no card — rather than to a
 * stand-in. Showing nothing is the honest outcome; showing a guess is the one
 * failure `InterviewerCard` exists to prevent, the same class as the selectivity
 * rate we refused to render.
 *
 * REJECTION IS BOTH PER-TOKEN AND WHOLE-VALUE. The token pass catches "Admissions
 * Team" and "LevelUp Learning"; the whole-value pass catches the brand spelled with
 * a space ("Level Up"), whose individual tokens are ordinary words no list may
 * reject on their own. Whole-value equality is deliberately the narrower of the two
 * tests, so widening it cannot start rejecting real people.
 */
function personTokensOf(value: unknown): string[] | null {
  const raw = asString(value);
  if (!raw) return null;
  if (raw.includes("@")) return null;
  if (/https?:\/\//i.test(raw)) return null;
  if (!/\p{L}/u.test(raw)) return null;
  // Digits belong to a room name, an address or a handle, never to a given name.
  if (/\d/.test(raw)) return null;
  // A list of people is not "your interviewer" — the same ambiguity two named hosts
  // are refused for, arriving inside one string instead of two memberships.
  if (/[&/+,;|]/.test(raw) || /\s(and|und|y)\s/i.test(raw)) return null;

  const tokens = splitNameTokens(raw);
  while (tokens.length > 0 && HONORIFICS.includes(tokens[0].toLowerCase())) tokens.shift();
  if (tokens.length === 0) return null;

  for (const token of tokens) {
    const key = token.toLowerCase();
    if (ORGANISATION_WORDS.includes(key)) return null;
    if (BRAND_WORDS.includes(key)) return null;
  }

  // THE WHOLE VALUE, not just its tokens. A brand spelled with a space ("Level
  // Up") has no token this file may reject on its own, so the token pass above
  // passed it and the card rendered the invented interviewer "Level". Both checks
  // are whole-value equality, so they can only reject a value that IS the brand —
  // never a person whose name happens to contain one of these words.
  const collapsed = tokens.map((token) => token.toLowerCase()).join(" ");
  if (BRAND_PHRASES.includes(collapsed)) return null;
  if (BRAND_WORDS.includes(collapsed.replace(/[^\p{L}]/gu, ""))) return null;

  // A value none of whose tokens is a renderable given name names nobody — an
  // all-initials value ("A. B."), a bare particle, a handle. Deciding it HERE keeps
  // `personNameOf` and `givenNameOf` on one answer: there is never a stored full
  // name whose given name the card then refuses to show.
  if (givenTokenOf(tokens) === null) return null;

  return tokens;
}

/**
 * Is this string confidently ONE PERSON'S NAME? Returns it with honorifics stripped
 * and whitespace collapsed, or `null`. See `personTokensOf` for the rules.
 */
export function personNameOf(value: unknown): string | null {
  return personTokensOf(value)?.join(" ") ?? null;
}

/**
 * The GIVEN NAME alone — the only part REQ-INT-2 ever renders — or `null` when the
 * value is not confidently a person's name.
 *
 * Exported so the ONE rule has ONE implementation: the parser applies it before a
 * name is ever stored, and `InterviewerCard` applies it again at the render boundary
 * as the defensive gate for rows written before the guard existed.
 *
 * It is NOT `personNameOf(value).split(" ")[0]`. The first token of a real name is
 * routinely not the given name — an initial ("S. Kumar"), a particle ("de Souza
 * Silva") — and rendering it is the same fabrication as rendering "Dr.".
 * `givenTokenOf` picks the first token that is actually a name.
 */
export function givenNameOf(value: unknown): string | null {
  const tokens = personTokensOf(value);
  return tokens === null ? null : givenTokenOf(tokens);
}

/**
 * The event's HOST — the person who will actually take the interview — read from
 * `scheduled_event.event_memberships[].user_name`, or `null`.
 *
 * WHY THIS EXISTS: REQ-INT-2 presents the interviewer by real first name, and until
 * this function nothing in the repo could NAME one. `offerings.instructor_name` is
 * the TEACHING instructor and reaching for it here would be exactly the conflation
 * REQ-INT-2 forbids; no column on `cohort_applications` held an interviewer; and the
 * reconciler's TeleCRM read (`reconcile-funnel-stage`) returns no such field. The
 * webhook payload we already receive is the one real source, and this is the whole
 * of how we read it. The host half of that payload was simply never parsed before.
 *
 * ONLY `user_name` IS READ, AND THE HOST'S EMAIL DELIBERATELY IS NOT. The name is
 * the only thing any surface renders, so the address would be colleague PII stored
 * for nothing; and deriving a name from an address ("admissions@…", "r.s@…") is a
 * guess wearing a fact's clothes, which is the one move this module never makes.
 *
 * A NON-PERSON `user_name` IS TREATED AS NO NAME AT ALL (`personNameOf`). The one
 * org-level account INTEG-CAL-1 mandates is precisely the setup whose membership is
 * most likely to be named for the ORGANISATION — "LevelUp Learning", "Admissions
 * Team" — and storing that would put the fabricated first name "LevelUp" on a card
 * that says an applicant is about to meet him. Honorifics are stripped for the same
 * reason: "Dr. Kavya Rao" must render "Kavya", never "Dr.".
 *
 * `user_name` IS NOT GUARANTEED TO BE THERE. Calendly's older published webhook
 * schema documents a membership as `user` + `user_email` only, while the live
 * scheduled-event resource also carries `user_name`. Absent, blank, or not
 * name-shaped → `null`, and the card simply does not render. That is the designed
 * outcome, not a degraded one.
 *
 * MORE THAN ONE NAMED HOST ALSO YIELDS `null`, ON PURPOSE. A one-on-one event type
 * carries exactly one membership; two or more DISTINCT names means a collective
 * event, where "your interviewer" is not one person. Calendly documents no ordering
 * for the array, so taking the first of several would be an arbitrary pick — and an
 * arbitrary pick shown to an applicant as the person they are about to meet is
 * precisely the invention REQ-INT-2 exists to rule out. Repeats of the SAME name are
 * not ambiguity and collapse to that name.
 *
 * SOR-1: this is a booking fact Calendly delivered, not a stage and not a claim
 * about anyone's role in the funnel.
 */
export function interviewerNameFromEvent(payload: unknown): string | null {
  const memberships = scheduledEventOf(payload)?.event_memberships;
  if (!Array.isArray(memberships)) return null;

  const names: string[] = [];
  const seen: string[] = [];
  for (const entry of memberships) {
    const name = personNameOf(asRecord(entry)?.user_name);
    if (!name) continue;
    // Case- and whitespace-insensitive identity, so "Arundhati  Menon" delivered
    // twice is one host rather than two and does not read as ambiguity.
    const key = name.toLowerCase().replace(/\s+/g, " ");
    if (seen.includes(key)) continue;
    seen.push(key);
    names.push(name);
  }

  return names.length === 1 ? names[0] : null;
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

/* ════════════════════════════════════════════════════════════════════════════
   AVAILABILITY — the pure core of `calendly-slots` (PHASE IV Q-1)

   RULED — REQ-INT-0 is BACK ON (Rahul, 2026-07-28), reversing the §6.4 park.
   The app offers the three soonest slots as one-tap buttons; Calendly still
   CONFIRMS every one of them on its own surface, because the availability API
   cannot create a booking. That constraint is the safety property, not a
   limitation: we never hold a booking, so we can never double-book, and
   `calendly-webhook` above still records the fact.

   Everything the slots function DECIDES lives here — which window is legal,
   which event type an offering's link names, which returned items are real
   slots, and how a UTC instant reads to a student in India. The handler
   (`calendly-slots/index.ts`) is then only I/O: fetch, cache, respond. Same
   split, and same reason, as the receiver above: this is provable by unit test
   with zero network and no mocking (`src/lib/__tests__/calendly.test.ts`).

   STILL DEPENDENCY-FREE. No imports, and no Deno/Node/DOM-only globals — `URL`
   is deliberately NOT used (it is universal in practice, but the file's contract
   is stricter than "in practice"), so link parsing below is a small regex.
   `Intl` and `Date` are ECMA-402/262 core and are available in all three
   runtimes this file is compiled by.

   SOR-1 still holds: nothing here names a funnel stage. A slot is an offer,
   not a state.
   ════════════════════════════════════════════════════════════════════════════ */

/** How many slots the surface offers. Three: the brief's "three soonest". */
export const CALENDLY_SLOT_COUNT = 3;

/**
 * Calendly's own ceiling on `event_type_available_times`: the window must be at
 * most SEVEN DAYS and must START IN THE FUTURE, or the call is rejected outright
 * (verified against the live account, 2026-07-28). Both are encoded in
 * `availabilityWindow` rather than trusted to a caller's arithmetic, because
 * getting either wrong turns the whole surface into its fallback with no
 * user-visible symptom beyond "no slots".
 */
export const CALENDLY_MAX_WINDOW_DAYS = 7;

/**
 * How far ahead of "now" a window starts. Guards the FUTURE constraint against
 * clock skew between our isolate and Calendly, and it is also honest product
 * behaviour: a slot 30 seconds away is not bookable by a human.
 */
export const CALENDLY_WINDOW_LEAD_MS = 2 * 60_000;

const DAY_MS = 24 * 60 * 60_000;

/** One legal availability window, in the ISO shape the query string wants. */
export interface CalendlyWindow {
  startTime: string;
  endTime: string;
}

/**
 * A single bookable slot, as the surface consumes it.
 *
 * `bookingUrl` is Calendly's own `scheduling_url` for THAT EXACT SLOT — a deep
 * link that lands on the confirmation step with the time already chosen. It is
 * what makes a one-tap button possible without the app ever holding a booking.
 */
export interface CalendlySlot {
  /** ISO-8601 start instant, exactly as Calendly sent it. */
  startTime: string;
  /** Calendly's per-slot deep link. Always on calendly.com; see `parseHttpsUrl`. */
  bookingUrl: string;
}

/**
 * Build a legal window from `now`.
 *
 * `offsetDays` walks the window forward for the second look — an interviewer
 * whose next opening is nine days out has NO slots in the first seven, which is
 * a perfectly normal calendar and not an outage. `days` is clamped to Calendly's
 * ceiling so a caller cannot ask for a window the API will refuse.
 */
export function availabilityWindow(
  now: number | Date,
  options: { offsetDays?: number; days?: number } = {},
): CalendlyWindow {
  const base = typeof now === "number" ? now : now.getTime();
  const days = Math.min(
    CALENDLY_MAX_WINDOW_DAYS,
    Math.max(1, Math.floor(options.days ?? CALENDLY_MAX_WINDOW_DAYS)),
  );
  const offset = Math.max(0, Math.floor(options.offsetDays ?? 0));
  const start = base + CALENDLY_WINDOW_LEAD_MS + offset * DAY_MS;
  return {
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + days * DAY_MS).toISOString(),
  };
}

/** The two halves of an https link, without reaching for `URL`. */
interface ParsedHttpsUrl {
  /** Lowercased hostname, no port. */
  host: string;
  /** Path with a single leading slash and no trailing one. May be "". */
  path: string;
}

/**
 * Parse an https link into host + path, or null.
 *
 * Deliberately refuses anything that is not `https:` — every Calendly link this
 * codebase hands a browser is pinned to https on calendly.com, for the same
 * reason `isCalendlyUrl` on the client is: an admin-authored or tampered link
 * arrives PREFILLED with the applicant's name and email, so a lookalike host is
 * a phishing hop rather than a cosmetic error.
 */
function parseHttpsUrl(raw: unknown): ParsedHttpsUrl | null {
  const value = asString(raw);
  if (!value) return null;
  const match = /^https:\/\/([^/?#\s]+)([^?#\s]*)/i.exec(value);
  if (!match) return null;
  const host = match[1].toLowerCase().split("@").pop() ?? "";
  const bare = host.split(":")[0];
  if (!bare) return null;
  let path = match[2] ?? "";
  if (!path.startsWith("/")) path = `/${path}`;
  while (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return { host: bare, path: path === "/" ? "" : path };
}

/** Is this a link on calendly.com (or a subdomain of it) over https? */
export function isCalendlySchedulingUrl(raw: unknown): boolean {
  const parsed = parseHttpsUrl(raw);
  if (!parsed) return false;
  return parsed.host === "calendly.com" || parsed.host.endsWith(".calendly.com");
}

/**
 * The comparable identity of a Calendly scheduling link: host + path, lowercased,
 * query and fragment discarded.
 *
 * Query is discarded ON PURPOSE. `offerings.calendly_url` routinely carries
 * `?utm_source=…` or a prefill an admin pasted, and the event type's own
 * `scheduling_url` never does; comparing raw strings would fail to match the very
 * link the offering is configured with.
 */
export function normalizeSchedulingUrl(raw: unknown): string | null {
  const parsed = parseHttpsUrl(raw);
  if (!parsed) return null;
  if (!(parsed.host === "calendly.com" || parsed.host.endsWith(".calendly.com"))) {
    return null;
  }
  return `${parsed.host}${parsed.path.toLowerCase()}`;
}

/**
 * Does an event type's `scheduling_url` name the same booking page as the
 * offering's configured link?
 *
 * Exact after normalisation, OR the offering link sits UNDER the event type's
 * path — which is how a slot deep link
 * (`…/executive-presence-cohort-interview/2026-07-29T09:30:00Z`) and an admin who
 * pasted one still resolve to their event type. A bare prefix match without the
 * separator would let `…/interview` claim `…/interview-2`, so the separator is
 * required.
 */
export function matchesSchedulingUrl(eventTypeUrl: unknown, offeringUrl: unknown): boolean {
  const a = normalizeSchedulingUrl(eventTypeUrl);
  const b = normalizeSchedulingUrl(offeringUrl);
  if (!a || !b) return false;
  if (a === b) return true;
  return b.startsWith(`${a}/`);
}

/**
 * Resolve the event-type URI for an offering out of a `GET /event_types`
 * collection.
 *
 * NEVER HARDCODED. The account runs several live interview event types
 * (`executive-presence-cohort-interview`, `the-forge-ai-residency-interview`,
 * `the-forge-creators-residency-interview`), one cohort each, and the offering
 * row already says which one it is. A pinned URI would silently offer one
 * cohort's calendar to another's applicants — the same class of error as
 * mirroring a stranger's booking onto an applicant's row.
 *
 * Inactive event types are skipped: they still appear in the collection and
 * still carry a `scheduling_url`, but they have no availability, so matching one
 * would render "no slots" forever on an offering that is fine.
 */
export function eventTypeUriFor(payload: unknown, offeringUrl: unknown): string | null {
  const collection = asRecord(payload)?.collection;
  if (!Array.isArray(collection)) return null;
  let prefixMatch: string | null = null;
  for (const item of collection) {
    const row = asRecord(item);
    if (!row) continue;
    if (row.active === false) continue;
    const uri = asString(row.uri);
    if (!uri) continue;
    const scheduling = row.scheduling_url;
    if (normalizeSchedulingUrl(scheduling) === normalizeSchedulingUrl(offeringUrl)) {
      return uri;
    }
    if (!prefixMatch && matchesSchedulingUrl(scheduling, offeringUrl)) prefixMatch = uri;
  }
  return prefixMatch;
}

/**
 * The bookable slots in a `GET /event_type_available_times` response, soonest
 * first.
 *
 * EVERY FILTER HERE IS A REFUSAL TO GUESS, in the same spirit as
 * `modalityFromEvent`:
 *   - `status` must be exactly `available`. Calendly returns other statuses in
 *     the same collection, and offering one as a button sends a student to a
 *     confirmation page that cannot confirm.
 *   - `scheduling_url` must be a real calendly.com link, because it is what the
 *     tap opens. A slot without one is not tappable, and inventing the link from
 *     the start time is exactly the kind of construction that goes stale.
 *   - `start_time` must parse to a finite instant, and (when `now` is given) must
 *     still be in the future — a cached response outliving its earliest slot is
 *     the ordinary case, not an edge case.
 *   - a malformed item is SKIPPED, never fatal. One bad row must not cost the
 *     other 42.
 * Duplicate start instants collapse to the first: the surface offers three
 * distinct TIMES, and a student cannot tell two buttons reading "3:00 pm" apart.
 */
export function parseAvailableTimes(
  payload: unknown,
  options: { limit?: number; now?: number } = {},
): CalendlySlot[] {
  const collection = asRecord(payload)?.collection;
  if (!Array.isArray(collection)) return [];

  const limit = Math.max(0, Math.floor(options.limit ?? CALENDLY_SLOT_COUNT));
  const floor = typeof options.now === "number" ? options.now : null;

  const found: Array<{ at: number; slot: CalendlySlot }> = [];
  for (const item of collection) {
    const row = asRecord(item);
    if (!row) continue;
    if (asString(row.status)?.toLowerCase() !== "available") continue;

    const startTime = asString(row.start_time);
    if (!startTime) continue;
    const at = Date.parse(startTime);
    if (!Number.isFinite(at)) continue;
    if (floor !== null && at <= floor) continue;

    const bookingUrl = asString(row.scheduling_url);
    if (!bookingUrl || !isCalendlySchedulingUrl(bookingUrl)) continue;

    found.push({ at, slot: { startTime, bookingUrl } });
  }

  found.sort((a, b) => a.at - b.at);

  const out: CalendlySlot[] = [];
  const seen = new Set<number>();
  for (const entry of found) {
    if (seen.has(entry.at)) continue;
    seen.add(entry.at);
    out.push(entry.slot);
    if (out.length >= limit) break;
  }
  return out;
}

/* ── Rendering a UTC instant to a student in India ───────────────────────────
   Calendly speaks UTC and every applicant reads IST, so the conversion is not a
   nicety: "09:30" on a button that means 15:00 is a missed interview. It lives
   here, beside the parser, so the ONE place that decides what a slot IS also
   decides what it SAYS, and both are unit-tested against a fixed instant.

   Built from `formatToParts` rather than `format` because the assembled string
   is not stable across ICU builds (locale-dependent separators, U+202F before
   the day period, upper vs lower case). Parts are.
   ──────────────────────────────────────────────────────────────────────────── */

/** The one timezone this product renders interview times in. */
export const INTERVIEW_TIME_ZONE = "Asia/Kolkata";

/** A slot's start, said three ways. */
export interface CalendlySlotLabel {
  /** "Today" · "Tomorrow" · "Wed, 29 Jul" */
  day: string;
  /** "3:00 pm" */
  time: string;
  /** The unabbreviated line for screen readers: "Wednesday, 29 July at 3:00 pm". */
  aria: string;
}

function istParts(at: number, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INTERVIEW_TIME_ZONE,
    ...options,
  }).formatToParts(new Date(at));
  const out: Record<string, string> = {};
  for (const part of parts) out[part.type] = part.value;
  return out;
}

/** The IST calendar date of an instant, as `YYYY-MM-DD`. */
function istDayKey(at: number): string {
  const p = istParts(at, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * How a slot reads on the button. Returns null for an unparseable instant, so a
 * bad row renders nothing rather than "Invalid Date".
 *
 * "Today" and "Tomorrow" are computed on the IST CALENDAR, not by subtracting
 * milliseconds: 23:00 UTC is already tomorrow in India, and a slot the student
 * would call "tomorrow morning" must not read as "today" because 24 hours have
 * not elapsed.
 */
export function formatSlotLabel(
  startTime: string,
  now: number | Date = Date.now(),
): CalendlySlotLabel | null {
  const at = Date.parse(startTime);
  if (!Number.isFinite(at)) return null;
  const base = typeof now === "number" ? now : now.getTime();

  const t = istParts(at, { hour: "numeric", minute: "2-digit", hour12: true });
  const time = `${t.hour}:${t.minute} ${(t.dayPeriod ?? "").toLowerCase()}`.trim();

  const d = istParts(at, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const long = istParts(at, { weekday: "long", day: "numeric", month: "long" });

  const key = istDayKey(at);
  let day = `${d.weekday}, ${d.day} ${d.month}`;
  if (key === istDayKey(base)) day = "Today";
  else if (key === istDayKey(base + DAY_MS)) day = "Tomorrow";

  return {
    day,
    time,
    aria: `${long.weekday}, ${long.day} ${long.month} at ${time}`,
  };
}
