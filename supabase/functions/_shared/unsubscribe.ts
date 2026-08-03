/**
 * Unsubscribe tokens — the PURE half (PHASE RE, U-1).
 *
 * Everything here is a function of its arguments: no `Deno.`, no client, no
 * clock of its own. `src/lib/__tests__/unsubscribe.test.ts` imports it through
 * `@shared/unsubscribe` and exercises the generate / verify / expiry paths with
 * zero mocking, exactly like `_shared/ladder.ts` and `_shared/phone.ts`. The
 * two imports are from `./crypto.ts`, which is itself pure, dependency-free and
 * already covered by `src/lib/__tests__/crypto.test.ts` — reusing the single
 * audited HMAC home beats a second copy of the `crypto.subtle` dance.
 *
 * ── WHAT AN UNSUBSCRIBE ACTUALLY STOPS ──────────────────────────────────────
 * The re-entry reminder ladder, and only that. It is NOT a global email kill
 * switch: `email-unsubscribe` stamps `email_unsubscribe_tokens.used_at`, which
 * `cohort-reentry-cron` reads as "stop", and it deliberately does NOT insert
 * into `public.suppressed_emails`. That table is a single undifferentiated list
 * with no category column, `queue-transactional-email` hard-gates EVERY
 * transactional send on it, and it is append-only by DDL (no DELETE, no UPDATE
 * policy). Writing an unsubscribe there would mean one click on a reminder also
 * silently and permanently killed the same person's payment receipt and their
 * cohort notifications, which is neither what the copy promises ("stop these
 * reminders") nor anything they could undo. Scoping the opt-out to the ladder
 * keeps the mechanism honest about its own copy and leaves it reversible: the
 * token table carries a service-role UPDATE policy, so support really can clear
 * `used_at` when somebody clicked by mistake.
 *
 * THE COST OF THAT SCOPING, NAMED RATHER THAN IMPLIED: `send-bulk-email` is a
 * SECOND, INDEPENDENT producer, and the only opt-out list it consults is
 * `fetchSuppressedSet` over `suppressed_emails`. So a person who clicks this
 * link stops the ladder and DOES NOT stop a future bulk campaign. Both pages
 * `email-unsubscribe` renders therefore say so in as many words, and both offer
 * the one path that does stop everything (write to support, a human adds a
 * `suppressed_emails` row). Whether a reminder opt-out SHOULD also suppress
 * marketing is a product decision, not a code one; until it is taken, the copy
 * and the mechanism agree, which is the property worth holding.
 *
 * ── WHY THE TOKEN IS DERIVED AND NOT DRAWN FROM `getRandomValues` ───────────
 * The requirement is three things at once, and only one construction satisfies
 * all three:
 *   1. UNGUESSABLE — 256 bits an attacker cannot search.
 *   2. NOT PLAINTEXT AT REST IN THE TOKEN TABLE — a read of
 *      `email_unsubscribe_tokens` must not yield a working token, so it stores
 *      only `sha256(token)`.
 *   3. STABLE ACROSS SENDS — `email_unsubscribe_tokens` is one row per address,
 *      and the ladder mails the same person up to four times. Every one of
 *      those links has to keep working.
 *
 * (2) and (3) together rule out a per-send random token: once only the hash is
 * stored, the plaintext cannot be recovered for the next email, so a random
 * token would have to be re-minted per send — and re-minting invalidates the
 * link in every message already delivered. A person clicking last week's email
 * would be told "you are unsubscribed" and would not be. That is the one
 * failure this endpoint exists to prevent, so it decides the design.
 *
 * A token that is REPRODUCIBLE without being STORED must therefore be keyed on
 * something outside the database. Hence:
 *
 *     token = base64url( HMAC-SHA256( UNSUBSCRIBE_TOKEN_SECRET,
 *                                     "v1:<row id>:<issued_at ISO>" ) )
 *
 * 256 bits of output, computationally unguessable without the secret (which is
 * why `isUsableUnsubscribeSecret` refuses anything under 32 characters), the
 * same for every email sent to that address, and reproducible by the sender
 * without ever storing it.
 *
 * ── THE TIMESTAMP TRAP, AND WHY THE DERIVATION CANONICALISES ────────────────
 * `issued_at` is a STRING inside the HMAC message, and it makes two round trips
 * through different formatters. The mint has a JS `Date` and writes
 * `now.toISOString()` (`2026-07-28T10:00:00.123Z`). Every send AFTER that reads
 * the column back through PostgREST, and Postgres `to_json` on a `timestamptz`
 * emits `2026-07-28T10:00:00.123+00:00`: a numeric offset instead of `Z`,
 * trailing zeros dropped from the fraction (`.100` comes back as `.1`), no
 * fraction at all when it is zero, and microseconds where a row got its value
 * from `now()` rather than from us.
 *
 * Those are the SAME INSTANT and DIFFERENT STRINGS, so a raw interpolation
 * gives a different HMAC on every send after the first — a link that resolves
 * to no row, in an endpoint that cannot say so without becoming an enumeration
 * oracle, which is precisely the "you are unsubscribed, and you are not"
 * failure this whole design exists to prevent. It would be invisible: rungs 2,
 * 3 and 4 would each ship a link that lies, and the endpoint's log line for it
 * is indistinguishable from a genuine stranger's.
 *
 * So the instant, not its spelling, is what the HMAC covers.
 * `canonicalUnsubscribeIssuedAt` parses whatever it is handed and re-emits the
 * one JS-ISO form, and `unsubscribeTokenMessage` runs every input through it.
 * Both spellings above canonicalise to the same string, so mint and reuse agree
 * by construction rather than by both happening to hold a JS `Date`.
 *
 * Canonicalisation is necessary and NOT sufficient, because it is only as good
 * as the formats it anticipates (millisecond truncation, for one: a genuinely
 * sub-millisecond `issued_at` cannot round-trip). So the sender ALSO checks its
 * work: `unsubscribeTokenMatchesStoredHash` re-hashes the token it just derived
 * and compares it to the `token_hash` on file, and a mismatch rotates the row
 * instead of mailing a link that cannot resolve. A divergence that slips past
 * the canonicaliser costs one rotation, not a dead link.
 *
 * ── ROTATING THE SECRET IS A BREAKING OPERATION. SAY IT OUT LOUD. ───────────
 * One key drives BOTH HMACs, so a new `UNSUBSCRIBE_TOKEN_SECRET` changes the
 * tag AND the token. Every link already sitting in an inbox was signed with the
 * old key, and every row on file holds the hash of an old-key token. Nothing
 * about that is graceful, and the two mitigations are deliberately modest:
 *   • CONSUMING accepts a PREVIOUS key. `email-unsubscribe` passes
 *     `unsubscribeSecretCandidates(UNSUBSCRIBE_TOKEN_SECRET,
 *     UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS)`, so a delivered link keeps verifying
 *     while the old key is still configured.
 *   • MINTING only ever uses the current key, and the hash re-check above turns
 *     the resulting mismatch into a ROTATION. The next email to that address
 *     therefore carries a working link, so the ladder self-heals rather than
 *     going quietly dead for the full 180-day TTL.
 * WHAT IS STILL BROKEN, and an operator has to know it: once an address is
 * rotated onto the new key, links in messages ALREADY delivered to it stop
 * resolving, and the endpoint answers them with the same "you are
 * unsubscribed" page it answers everything else with, because telling them
 * apart is the enumeration oracle. The safe procedure is therefore: set
 * `UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS` to the outgoing key in the same change
 * that sets the new `UNSUBSCRIBE_TOKEN_SECRET`, and keep it there for at least
 * one full ladder window (14 days) before dropping it. Rotate only for an
 * actual compromise; there is no routine reason to.
 *
 * ── THE LIMIT OF THE HASHING CLAIM, STATED RATHER THAN GLOSSED ──────────────
 * Hashing removes `email_unsubscribe_tokens` as a source of working tokens. It
 * does NOT make the plaintext absent from the database, and pretending
 * otherwise would be the more dangerous half-truth:
 *   • `_shared/email.ts` puts the fully rendered `html` and `text` — which
 *     contain the complete unsubscribe URL — plus the credential itself on the
 *     pgmq `transactional_emails` payload. That is transient for a message that
 *     sends.
 *   • It is NOT transient for one that does not: `move_to_dlq` retains the
 *     failed payload verbatim and indefinitely, so a service-role read of the
 *     DLQ yields working credentials until those rows are pruned.
 *   • The provider receives the same URL inside the body of every message.
 * So the accurate claim is the narrow one: a read of the TOKEN TABLE cannot
 * forge an unsubscribe. Anything holding a rendered body already holds the
 * link, and the blast radius of that link is "this address stops receiving
 * cohort reminders, reversibly".
 *
 * ── THE TAG: A CRYPTOGRAPHIC GATE IN FRONT OF THE DATABASE ──────────────────
 * `email-unsubscribe` runs with `verify_jwt = false`, so anybody on the
 * internet can call it. Verifying by "hash the string and look it up" would
 * mean any well-formed 43-character guess bought an unauthenticated
 * service-role SELECT. The other public endpoints in this repo
 * (`razorpay-webhook`, `tally-application-webhook`) all verify an HMAC BEFORE
 * touching the database, and this one now does too. What travels in the link is
 * a CREDENTIAL, not a bare token:
 *
 *     tag        = base64url( HMAC-SHA256( secret, "v1:tag:<token>" ) )[0..21]
 *     credential = "<token>.<tag>"
 *
 * The tag is a function of the token alone, so the endpoint can check it with
 * nothing but the secret and a constant-time compare — no row, no issue time,
 * no round trip. A guessed or malformed credential is rejected before any
 * client is built. Only a credential that could not have been produced without
 * the secret reaches a query.
 *
 * The cost is that the endpoint now needs `UNSUBSCRIBE_TOKEN_SECRET` as well as
 * the sender. That is a real cost and it is worth it: it is the difference
 * between an unauthenticated database probe and none.
 *
 * VERIFYING THE TOKEN AGAINST A ROW still needs no secret — the consumer hashes
 * what it was handed and looks the hash up. The secret buys the pre-DB gate,
 * not the identification.
 *
 * ── EXPIRY IS A MINT-SIDE ROTATION TRIGGER, NOT A CONSUME-SIDE GATE ─────────
 * `isUnsubscribeTokenExpired` is one of TWO mint-side rotation triggers, the
 * other being the hash mismatch above. It is asked by the SENDER: "is the token
 * on file for this address older than the TTL, and should this send rotate it?"
 * It is
 * deliberately NOT asked by the endpoint. Rejecting an old-but-current token at
 * consume time would silently fail a genuine unsubscribe, and because an
 * unknown token and a known one must be indistinguishable (no enumeration
 * oracle), that failure would be invisible to the person. Rotation gets the
 * same protection with none of that: a superseded token no longer hashes to
 * anything on file, so it stops working by simply not matching, and a token
 * that was never superseded is still the address's current one and must keep
 * working however old it is.
 *
 * The accepted cost, stated plainly: a link older than the TTL *in an address
 * that has since been mailed again* stops working, and the endpoint cannot say
 * so without becoming an oracle. The TTL is 180 days against a ladder window of
 * 14 days, so that is roughly 13 campaign lengths of headroom.
 */
import { hmacSha256Base64, timingSafeEqual } from "./crypto.ts";

/**
 * Bumped only if the derivation inputs change. It is inside both HMAC messages,
 * so a bump rotates every token by construction rather than by remembering to.
 */
export const UNSUBSCRIBE_TOKEN_VERSION = "v1";

/**
 * How long a minted token stays the address's current one before the next send
 * rotates it. 180 days, against `LADDER_WINDOW_MS` of 14 days — a token
 * comfortably outlives every campaign that could have carried it.
 */
export const UNSUBSCRIBE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/** base64url of 32 bytes, unpadded. 43 characters, 256 bits. */
export const UNSUBSCRIBE_TOKEN_LENGTH = 43;

/**
 * Characters of the pre-DB tag. 22 base64url characters ≈ 132 bits of a
 * separate HMAC over the token: far past forgeable, and short enough that the
 * whole credential still fits comfortably on one line of an email.
 */
export const UNSUBSCRIBE_TAG_LENGTH = 22;

/** Separates the token from its tag inside the credential. URL-safe unreserved. */
export const UNSUBSCRIBE_CREDENTIAL_SEPARATOR = ".";

/**
 * The shape a token must have before it is worth hashing. Format validity is
 * computable offline by anybody, so rejecting a malformed token early leaks
 * nothing about which addresses exist.
 */
export const UNSUBSCRIBE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** The shape of the whole thing that travels in the link: `<token>.<tag>`. */
export const UNSUBSCRIBE_CREDENTIAL_RE = /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{22}$/;

/**
 * The shortest secret that keeps the 256-bit claim honest. A short secret is
 * searchable, and both the token's unguessability and the tag's unforgeability
 * rest on it.
 */
export const MIN_UNSUBSCRIBE_SECRET_LENGTH = 32;

/** Path of the public edge function that consumes a credential. */
export const UNSUBSCRIBE_FUNCTION_PATH = "/functions/v1/email-unsubscribe";

/**
 * The query parameter carrying the credential. Opaque and unguessable: it is
 * NOT personal data, which is what keeps the link inside the project rule
 * against putting personal data in query strings. The address never appears in
 * the URL, and — since the endpoint no longer needs it — is never read back out
 * of the row either.
 */
export const UNSUBSCRIBE_QUERY_PARAM = "t";

/** Standard base64 -> base64url, unpadded, so the token is URL-safe as-is. */
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Is this secret long enough to stand behind the 256-bit claim? */
export function isUsableUnsubscribeSecret(secret: string | undefined | null): boolean {
  return typeof secret === "string" && secret.trim().length >= MIN_UNSUBSCRIBE_SECRET_LENGTH;
}

/**
 * The one spelling of an issue time the HMAC is allowed to see.
 *
 * The mint holds a JS `Date` and writes `toISOString()`; every send after that
 * reads the same instant back as PostgREST's rendering of a `timestamptz`,
 * which differs in the offset (`+00:00`, not `Z`), in trailing fraction zeros
 * and in precision. Interpolating either verbatim would key the token on the
 * SPELLING rather than on the instant, and the two never agree, so every link
 * after the first would resolve to nothing.
 *
 * Throws rather than falling back to the raw input: a token derived from an
 * issue time nobody can reproduce is worse than a send that fails loudly, and
 * the only caller reaches this behind `isUnsubscribeTokenExpired`, which
 * already treats an unparseable timestamp as "rotate".
 *
 * Truncates to milliseconds, which is JS `Date`'s whole resolution. Every value
 * this system writes has millisecond precision to begin with, and anything
 * finer that reached the column (a row that took `now()` from the DEFAULT, say)
 * fails the sender's hash re-check and is rotated onto a value that round-trips.
 */
export function canonicalUnsubscribeIssuedAt(issuedAt: string | null | undefined): string {
  const ms = Date.parse(issuedAt ?? "");
  if (!Number.isFinite(ms)) throw new Error("unsubscribe token needs a parseable issue time");
  return new Date(ms).toISOString();
}

/**
 * The exact bytes the token HMAC covers. Separated out so a test can pin it:
 * the derivation is a wire format, and changing it silently invalidates every
 * token already in somebody's inbox.
 */
export function unsubscribeTokenMessage(tokenRowId: string, issuedAtIso: string): string {
  return `${UNSUBSCRIBE_TOKEN_VERSION}:${tokenRowId}:${canonicalUnsubscribeIssuedAt(issuedAtIso)}`;
}

/**
 * The bytes the TAG HMAC covers. A different message space from the token's
 * (`:tag:` can never appear in the token message, whose middle field is a UUID),
 * so the two outputs are independent even under the same key.
 */
export function unsubscribeTagMessage(token: string): string {
  return `${UNSUBSCRIBE_TOKEN_VERSION}:tag:${token}`;
}

/**
 * The token for one row of `email_unsubscribe_tokens`. Deterministic: the same
 * row and the same issue time always produce the same token, which is what lets
 * four separate emails carry a working link while the database holds only a
 * hash. Throws on an unusable secret rather than emitting a weak token.
 */
export async function deriveUnsubscribeToken(
  secret: string,
  tokenRowId: string,
  issuedAtIso: string,
): Promise<string> {
  if (!isUsableUnsubscribeSecret(secret)) {
    throw new Error(`unsubscribe secret must be at least ${MIN_UNSUBSCRIBE_SECRET_LENGTH} characters`);
  }
  if (!tokenRowId || !issuedAtIso) throw new Error("unsubscribe token needs a row id and an issue time");
  return toBase64Url(await hmacSha256Base64(unsubscribeTokenMessage(tokenRowId, issuedAtIso), secret));
}

/**
 * The pre-DB tag for a token. Keyed on the same secret, computed from the token
 * alone, which is precisely what lets the endpoint check it before it knows
 * which row (or whether any row) the token belongs to.
 */
export async function deriveUnsubscribeTag(secret: string, token: string): Promise<string> {
  if (!isUsableUnsubscribeSecret(secret)) {
    throw new Error(`unsubscribe secret must be at least ${MIN_UNSUBSCRIBE_SECRET_LENGTH} characters`);
  }
  if (!isWellFormedUnsubscribeToken(token)) throw new Error("unsubscribe tag needs a well-formed token");
  return toBase64Url(await hmacSha256Base64(unsubscribeTagMessage(token), secret)).slice(
    0,
    UNSUBSCRIBE_TAG_LENGTH,
  );
}

/**
 * What actually travels in the link: the token, plus the tag that gets it past
 * the endpoint's gate. The SENDER builds this; the token half is what gets
 * hashed into the row.
 */
export async function deriveUnsubscribeCredential(
  secret: string,
  tokenRowId: string,
  issuedAtIso: string,
): Promise<{ token: string; credential: string }> {
  const token = await deriveUnsubscribeToken(secret, tokenRowId, issuedAtIso);
  const tag = await deriveUnsubscribeTag(secret, token);
  return { token, credential: `${token}${UNSUBSCRIBE_CREDENTIAL_SEPARATOR}${tag}` };
}

/**
 * What is stored, and the only thing ever compared against a row. SHA-256 of
 * the token as lowercase hex — a plain digest and not a keyed one on purpose,
 * because identification must not need the signing secret. Pre-image resistance
 * is what stops a read of this table from forging; the token's own 256 bits are
 * what stop a hash from being brute-forced back.
 */
export async function hashUnsubscribeToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The shape `token_hash` has when it was written by this design. */
export const UNSUBSCRIBE_TOKEN_HASH_RE = /^[0-9a-f]{64}$/;

/**
 * THE SENDER CHECKING ITS OWN WORK, and the reason a derivation divergence can
 * no longer hide.
 *
 * Re-deriving a token from a stored row is only correct if the inputs come back
 * exactly as they went in, and the one input that does not is the timestamp
 * (see the header). `canonicalUnsubscribeIssuedAt` closes the formats we know
 * about; this closes the ones we do not. The sender re-hashes what it derived
 * and compares it to the `token_hash` on file, so a token that would NOT open
 * its own row is caught before it goes in an email, and the caller rotates
 * instead of mailing a link that resolves to nothing.
 *
 * `false` for a missing, malformed or superseded hash, so every "cannot verify"
 * reason funnels into the same "rotate" answer. Compared in constant time out of
 * habit rather than need: both sides are ours here, but this function is one
 * copy-paste away from a context where they are not.
 */
export async function unsubscribeTokenMatchesStoredHash(
  token: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (typeof storedHash !== "string" || !UNSUBSCRIBE_TOKEN_HASH_RE.test(storedHash)) return false;
  if (!isWellFormedUnsubscribeToken(token)) return false;
  return timingSafeEqual(await hashUnsubscribeToken(token), storedHash);
}

/** Does this look like one of our tokens at all? */
export function isWellFormedUnsubscribeToken(token: unknown): token is string {
  return typeof token === "string" && UNSUBSCRIBE_TOKEN_RE.test(token);
}

/** Does this look like a whole credential — token, separator and tag? */
export function isWellFormedUnsubscribeCredential(value: unknown): value is string {
  return typeof value === "string" && UNSUBSCRIBE_CREDENTIAL_RE.test(value);
}

/**
 * Split a credential into its halves, or `null` if it is not one. Pure shape
 * work: it authenticates nothing, which is why `verifyUnsubscribeCredential`
 * exists and is the function the endpoint calls.
 */
export function parseUnsubscribeCredential(value: unknown): { token: string; tag: string } | null {
  if (!isWellFormedUnsubscribeCredential(value)) return null;
  const [token, tag] = value.split(UNSUBSCRIBE_CREDENTIAL_SEPARATOR);
  return { token, tag };
}

/**
 * The keys a CONSUMER will accept, current first, unusable ones dropped and
 * duplicates collapsed.
 *
 * Rotating `UNSUBSCRIBE_TOKEN_SECRET` re-keys both HMACs at once, so every link
 * already delivered stops verifying the moment the new key lands. Accepting the
 * outgoing key for a while is what turns that from an outage into a handover:
 * set `UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS` to the old value in the same change,
 * and drop it after a ladder window. See the header for what a rotation still
 * costs even so; this is a mitigation, not a fix.
 *
 * MINTING NEVER USES THIS. A token derived from a retired key would be a link
 * that dies the moment the key is dropped, so `cohort-reentry-cron` derives
 * from the current key alone and rotates any row that disagrees.
 */
export function unsubscribeSecretCandidates(
  ...secrets: Array<string | null | undefined>
): string[] {
  const usable: string[] = [];
  for (const secret of secrets) {
    if (!isUsableUnsubscribeSecret(secret)) continue;
    const value = secret as string;
    if (!usable.includes(value)) usable.push(value);
  }
  return usable;
}

/**
 * THE GATE. Returns the token when the tag is one of the given secrets could
 * have produced, and `null` for everything else — malformed, truncated, guessed,
 * or signed with a key nobody offered. Constant-time compare, because the tag is
 * a MAC and a byte-at-a-time comparison is a byte-at-a-time forgery oracle.
 *
 * Takes one secret or a list (see `unsubscribeSecretCandidates`) and tries ALL
 * of them without short-circuiting, so the work does not depend on WHICH key
 * signed a credential. Throws when not one candidate is usable: that is a
 * misconfigured endpoint, and returning `null` would make it look exactly like
 * "nobody's credential verifies", which is a silent outage.
 *
 * `null` here means "do not touch the database", and the endpoint treats it
 * identically to "no such token" so the two remain indistinguishable from
 * outside.
 */
export async function verifyUnsubscribeCredential(
  secrets: string | readonly string[],
  value: unknown,
): Promise<string | null> {
  const candidates = unsubscribeSecretCandidates(...(typeof secrets === "string" ? [secrets] : secrets));
  if (candidates.length === 0) {
    throw new Error(`unsubscribe secret must be at least ${MIN_UNSUBSCRIBE_SECRET_LENGTH} characters`);
  }
  const parts = parseUnsubscribeCredential(value);
  if (!parts) return null;
  let matched = false;
  for (const secret of candidates) {
    const expected = await deriveUnsubscribeTag(secret, parts.token);
    if (timingSafeEqual(parts.tag, expected)) matched = true;
  }
  return matched ? parts.token : null;
}

/**
 * MINT-SIDE ONLY (see the header): should the next send rotate the token on
 * file? True once the issue time is at least `ttlMs` old, and true for a
 * timestamp that will not parse — an unreadable issue time cannot be shown to
 * be inside the window, and rotating is harmless where refusing to send would
 * not be.
 */
export function isUnsubscribeTokenExpired(
  issuedAtIso: string | null | undefined,
  now: Date,
  ttlMs: number = UNSUBSCRIBE_TTL_MS,
): boolean {
  const issued = Date.parse(issuedAtIso ?? "");
  if (!Number.isFinite(issued)) return true;
  return now.getTime() - issued >= ttlMs;
}

/**
 * The one canonical spelling of an address in `email_unsubscribe_tokens`.
 *
 * The table has `UNIQUE(email)` and exactly one producer (`cohort-reentry-cron`),
 * so unlike `suppressed_emails` — which is written by humans and by bounce
 * handling, and therefore has to be read case-INSENSITIVELY with `ilike` — this
 * one can simply be kept canonical at the door. That buys an exact `.in()`
 * lookup that uses the unique index, and it stops one person from acquiring two
 * token rows (and two opt-out states) because two application forms spelled
 * their address differently.
 */
export function normalizeUnsubscribeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The link that goes in the email. Built against the FUNCTIONS host
 * (`SUPABASE_URL`), not the app origin, because the consumer is an edge
 * function and this repo has no client route for it — inventing one would mean
 * shipping a page whose only job is to call the endpoint anyway.
 */
export function buildUnsubscribeUrl(supabaseUrl: string, credential: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}${UNSUBSCRIBE_FUNCTION_PATH}?${UNSUBSCRIBE_QUERY_PARAM}=${encodeURIComponent(credential)}`;
}
