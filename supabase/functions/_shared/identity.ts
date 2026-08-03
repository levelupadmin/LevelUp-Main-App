/**
 * Pure identity-provisioning decision logic for the applicant spine (PHASE SP).
 *
 * An applicant who fills the Tally form becomes an app user automatically —
 * one passwordless `auth.users` row carrying BOTH phone and email, so a later
 * OTP on either channel resolves to the same `auth.uid`. This module owns the
 * *decision*: given the join keys and whatever a lookup found, what should the
 * caller do? Collisions never silent-merge; they defer to an interactive claim.
 *
 * Hosted here rather than inside the poller because the intake host has already
 * changed once (webhook -> poller) and will change again.
 *
 * Dependency-free by design: ZERO imports, no network, no Deno/Node globals.
 * The phone/email normalisation below is deliberately duplicated from
 * `_shared/phone.ts` (last-10 subscriber digits, lowercased+trimmed email)
 * instead of imported, so vitest can load this via `@shared/identity` with no
 * mocking at all. It MUST stay byte-equivalent to the SQL in
 * `find_login_identity` (regexp_replace to digits, then right(...,10)) — if the
 * two diverge, lookups and this decision disagree and a collision becomes a
 * silent merge.
 */

export interface IdentityInput {
  email?: string | null;
  phone?: string | null;
}

/** The join keys: lowercased+trimmed email, last-10 subscriber phone digits. */
export interface JoinKeys {
  email: string | null;
  phone: string | null;
}

export type ProvisionOutcome =
  | { status: "created"; userId: string }
  | { status: "existing"; userId: string }
  | { status: "collision"; reason: "email_taken" | "phone_taken" | "cross_linked" }
  | { status: "skipped"; reason: "no_identifier" };

/** Last 10 digits — the subscriber part, stable across "+9197…", "9197…", "97…". */
function phoneKey(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Lowercased + trimmed email, or null when there is nothing usable. */
function emailKey(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalise a raw application/OTP payload into the keys every lookup joins on.
 * Anything unusable (short phone, blank email) collapses to null rather than to
 * an empty string, so `null` consistently means "this channel is not usable as a
 * join key" — note that this deliberately does NOT distinguish "absent" from
 * "present but unparseable". See `decideProvision` for why that matters.
 */
export function identityKeys(input: IdentityInput): JoinKeys {
  return {
    email: emailKey(input?.email),
    phone: phoneKey(input?.phone),
  };
}

/**
 * Pure decision step — NO network. Given what a lookup found, decide what to do.
 *
 * Truth table (exactly the phase brief's, with nothing added):
 *   neither key present                      -> skipped / no_identifier
 *   nothing found                            -> created
 *   both keys resolve to the SAME id         -> existing
 *   email and phone resolve to DIFFERENT ids -> collision / cross_linked
 *   only the email resolved                  -> collision / email_taken
 *   only the phone resolved                  -> collision / phone_taken
 *
 * `existing` is reachable ONLY from the both-sides-agree row. Every partial
 * match is a collision: the row we found already owns one of the applicant's
 * identifiers but not the other, so attaching would bind a second identifier to
 * a stranger's account on nothing more than a form submission. That needs a
 * second OTP from the human (the claim flow), never this function.
 *
 * There is deliberately NO carve-out for "the applicant supplied only one
 * identifier". This function sees only the normalised `JoinKeys`, where `null`
 * is ambiguous between "not supplied" and "supplied but unparseable" —
 * `phoneKey` nulls anything under 10 digits and the intake feeds it raw,
 * unvalidated form text. Keying `existing` off that null would let the
 * applicant PICK their own outcome: a victim's email plus a real phone defers
 * as a collision, while the same email plus "98765" would silently bind the
 * application to the victim's uid. Inviolable rule 3: never a silent merge.
 *
 * FOR S-2 — all THREE collision reasons (`email_taken`, `phone_taken`,
 * `cross_linked`) get the SAME handling: insert with `user_id` NULL and
 * `pending_claim = true`. This is the authoritative statement of that trigger;
 * the `pending_claim` doc on `ApplicationRow` in `_shared/tally.ts` describes
 * only the `cross_linked` case and is narrower than reality.
 *
 * FOR S-2/S-4 — a one-identifier applicant whose single identifier is taken
 * lands in `pending_claim` with only ONE channel on the row, which `canClaim`
 * can never satisfy (it always compares the OTHER channel). Resolving that is
 * intake/claim policy — collect the missing channel during the claim, or route
 * the row to review — NOT a widening of `existing` in this primitive.
 *
 * FOR S-2 — `created` carries `userId: ""`, a PLACEHOLDER, because a pure
 * function cannot know the uid. TypeScript narrows `created` and `existing`
 * together (both are `{ userId: string }`), so the idiomatic
 * `if (o.status === "created" || o.status === "existing") row.user_id = o.userId`
 * type-checks and writes `""` into a uuid column (22P02) — which the mandated
 * fail-soft path then swallows as a silently unprovisioned applicant. Handle
 * `created` on its own branch and stamp the uid returned by
 * `auth.admin.createUser`; never forward `userId` off a `created` outcome.
 *
 * A `userId` of `""` inside `found` is likewise treated as "no row", so a
 * partially populated lookup result can never mint an outcome pointing at an
 * empty uid.
 */
export function decideProvision(
  keys: JoinKeys,
  found: { byEmail?: { id: string } | null; byPhone?: { id: string } | null },
): ProvisionOutcome {
  const hasEmail = !!keys?.email;
  const hasPhone = !!keys?.phone;
  if (!hasEmail && !hasPhone) return { status: "skipped", reason: "no_identifier" };

  // Only trust a hit on a channel we actually searched with.
  const emailId = hasEmail ? found?.byEmail?.id || null : null;
  const phoneId = hasPhone ? found?.byPhone?.id || null : null;

  if (!emailId && !phoneId) return { status: "created", userId: "" };

  if (emailId && phoneId) {
    return emailId === phoneId
      ? { status: "existing", userId: emailId }
      : { status: "collision", reason: "cross_linked" };
  }

  // Exactly one side resolved: the account we found is missing the applicant's
  // other identifier, so binding it is the claim flow's call, never ours.
  return emailId
    ? { status: "collision", reason: "email_taken" }
    : { status: "collision", reason: "phone_taken" };
}

/**
 * Pure claim check: does this second-channel OTP entitle the caller to the
 * pending row? True ONLY when the verified channel's value matches the value
 * the pending row stores for THAT channel. Both sides are normalised through
 * the same helpers, so a claim submitted as "+91 97883 85577" still matches a
 * pending row storing "9788385577", and "Anu@Example.COM " matches
 * "anu@example.com".
 *
 * A verified phone never satisfies a pending row that only carries an email
 * (and vice versa): a missing value on the claimed channel is a rejection, not
 * a wildcard.
 *
 * WARNING FOR S-4 — this function has NO notion of which channel the caller
 * already proved. It answers exactly one question: "is this value the row's
 * value for this channel?" It cannot tell a second-channel proof from a replay
 * of the first, so handing it the signed-in identity's OWN channel makes it
 * return true on a single proven channel and defeats the collision defer
 * entirely. Worked case: a `pending_claim` row of {email: victim@example.com,
 * phone: attackerPhone}; the attacker signs in by phone OTP on attackerPhone;
 * `canClaim(row, { channel: "phone", value: attackerPhone })` is true and would
 * attach a row bearing the victim's email. The caller MUST pass the channel it
 * has NOT yet proven — signed in by phone => claim on "email", signed in by
 * email => claim on "phone" — and MUST require a fresh OTP on that channel
 * before calling. Enforcing that is the caller's job, not this primitive's.
 */
export function canClaim(
  pending: { email: string | null; phone: string | null },
  verified: { channel: "email" | "phone"; value: string },
): boolean {
  if (verified?.channel === "email") {
    const want = emailKey(pending?.email);
    const got = emailKey(verified?.value);
    return want !== null && got !== null && want === got;
  }
  if (verified?.channel === "phone") {
    const want = phoneKey(pending?.phone);
    const got = phoneKey(verified?.value);
    return want !== null && got !== null && want === got;
  }
  return false;
}
