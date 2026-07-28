import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildUnsubscribeUrl,
  canonicalUnsubscribeIssuedAt,
  deriveUnsubscribeCredential,
  deriveUnsubscribeTag,
  deriveUnsubscribeToken,
  hashUnsubscribeToken,
  isUnsubscribeTokenExpired,
  isUsableUnsubscribeSecret,
  isWellFormedUnsubscribeCredential,
  isWellFormedUnsubscribeToken,
  MIN_UNSUBSCRIBE_SECRET_LENGTH,
  normalizeUnsubscribeEmail,
  parseUnsubscribeCredential,
  UNSUBSCRIBE_CREDENTIAL_RE,
  UNSUBSCRIBE_FUNCTION_PATH,
  UNSUBSCRIBE_QUERY_PARAM,
  UNSUBSCRIBE_TAG_LENGTH,
  UNSUBSCRIBE_TOKEN_LENGTH,
  UNSUBSCRIBE_TOKEN_RE,
  UNSUBSCRIBE_TOKEN_VERSION,
  UNSUBSCRIBE_TTL_MS,
  unsubscribeSecretCandidates,
  unsubscribeTagMessage,
  unsubscribeTokenMatchesStoredHash,
  unsubscribeTokenMessage,
  verifyUnsubscribeCredential,
} from "@shared/unsubscribe";

/**
 * The unsubscribe token (PHASE RE, U-1).
 *
 * `_shared/unsubscribe.ts` takes its secret, its row and its clock as
 * arguments and touches no network and no database, so generate, verify and
 * expiry are ordinary function calls here with ZERO mocking — the same
 * arrangement as `_shared/ladder.ts` and `_shared/phone.ts`.
 *
 * The wiring block at the foot is not padding. Four couplings in this feature
 * fail SILENTLY and in opposite directions: a template variable missing from
 * the cron's map burns a ledger rung and sends nothing, a URL variable missing
 * from `URL_VARIABLES` is deleted from the body by `sanitizeVar` so the mail
 * promises an opt-out it does not contain, copy that still says "reply to this
 * email" is the thing this whole task exists to replace, and an opt-out written
 * into `suppressed_emails` would quietly kill the same person's payment
 * receipts. Each is asserted against the source that actually ships.
 */

const SECRET = "test-secret-that-is-long-enough-0123456789";
const ROW_ID = "11111111-2222-3333-4444-555555555555";
const ISSUED_AT = "2026-07-28T10:00:00.000Z";

/**
 * THE SAME INSTANTS, SPELLED THE WAY POSTGRES HANDS THEM BACK.
 *
 * `issued_at` is written as a JS `toISOString()` string and read back on every
 * later send as PostgREST's rendering of a `timestamptz`: `+00:00` instead of
 * `Z`, trailing fraction zeros dropped, no fraction at all when it is zero, and
 * microseconds where the column DEFAULT filled it. A derivation keyed on the
 * SPELLING gives a different token on the read path than on the write path, so
 * every rung after the first ships a link that resolves to no row.
 */
const PG_SPELLINGS: Array<[js: string, postgres: string]> = [
  ["2026-07-28T10:00:00.000Z", "2026-07-28T10:00:00+00:00"],
  ["2026-07-28T10:00:00.123Z", "2026-07-28T10:00:00.123+00:00"],
  ["2026-07-28T10:00:00.100Z", "2026-07-28T10:00:00.1+00:00"],
  ["2026-07-28T10:00:00.120Z", "2026-07-28T10:00:00.12+00:00"],
];

/** The pinned vectors, computed independently with node:crypto. */
const TOKEN = "7ig5Hm8DKecWhiAwvgo0np2P_5_g4860MJJgm8NP9Q4";
const TAG = "RUHv8mihqnyx5Vhi7y7Hhw";
const CREDENTIAL = `${TOKEN}.${TAG}`;

/** Repo root. `process.cwd()` rather than import.meta.url: under jsdom the
 *  latter is an http: URL that `readFileSync` refuses (same note as ladder.test.ts). */
const root = (rel: string) => resolve(process.cwd(), rel);

describe("isUsableUnsubscribeSecret", () => {
  it("requires at least MIN_UNSUBSCRIBE_SECRET_LENGTH characters", () => {
    expect(MIN_UNSUBSCRIBE_SECRET_LENGTH).toBe(32);
    expect(isUsableUnsubscribeSecret("a".repeat(MIN_UNSUBSCRIBE_SECRET_LENGTH))).toBe(true);
    expect(isUsableUnsubscribeSecret("a".repeat(MIN_UNSUBSCRIBE_SECRET_LENGTH - 1))).toBe(false);
  });

  it("rejects the shapes an unset environment variable actually takes", () => {
    expect(isUsableUnsubscribeSecret("")).toBe(false);
    expect(isUsableUnsubscribeSecret(undefined)).toBe(false);
    expect(isUsableUnsubscribeSecret(null)).toBe(false);
    // Whitespace is not entropy.
    expect(isUsableUnsubscribeSecret(" ".repeat(64))).toBe(false);
  });
});

describe("canonicalUnsubscribeIssuedAt — the timestamp trap", () => {
  it("leaves a JS toISOString() value alone, so the pinned vectors still hold", () => {
    expect(canonicalUnsubscribeIssuedAt(ISSUED_AT)).toBe(ISSUED_AT);
  });

  it("collapses every Postgres rendering onto the JS spelling of the same instant", () => {
    for (const [js, postgres] of PG_SPELLINGS) {
      // The strings differ; the instants do not. Only the instant may reach the HMAC.
      expect(postgres).not.toBe(js);
      expect(canonicalUnsubscribeIssuedAt(postgres)).toBe(js);
      expect(canonicalUnsubscribeIssuedAt(js)).toBe(js);
    }
  });

  it("normalises a non-UTC offset to the same instant", () => {
    expect(canonicalUnsubscribeIssuedAt("2026-07-28T15:30:00.123+05:30")).toBe("2026-07-28T10:00:00.123Z");
  });

  it("truncates sub-millisecond precision, which is JS Date's whole resolution", () => {
    // A row that took `now()` from the column DEFAULT can carry microseconds.
    // They cannot round-trip, which is exactly why the sender ALSO re-hashes
    // and compares before mailing a link (see unsubscribeTokenMatchesStoredHash).
    expect(canonicalUnsubscribeIssuedAt("2026-07-28T10:00:00.123456+00:00")).toBe("2026-07-28T10:00:00.123Z");
  });

  it("is idempotent, so canonicalising a canonical value is a no-op", () => {
    for (const [, postgres] of PG_SPELLINGS) {
      const once = canonicalUnsubscribeIssuedAt(postgres);
      expect(canonicalUnsubscribeIssuedAt(once)).toBe(once);
    }
  });

  it("throws rather than falling back to a raw string nobody can reproduce", () => {
    for (const bad of ["", "   ", "not a timestamp", null, undefined]) {
      expect(() => canonicalUnsubscribeIssuedAt(bad)).toThrow(/issue time/);
    }
  });
});

describe("the HMAC message spaces", () => {
  it("pin the token wire format — changing it invalidates every delivered link", () => {
    expect(unsubscribeTokenMessage(ROW_ID, ISSUED_AT)).toBe(`v1:${ROW_ID}:${ISSUED_AT}`);
    expect(UNSUBSCRIBE_TOKEN_VERSION).toBe("v1");
  });

  it("pin the tag wire format, and keep it disjoint from the token's", () => {
    expect(unsubscribeTagMessage(TOKEN)).toBe(`v1:tag:${TOKEN}`);
    // The token message's middle field is a UUID, so ':tag:' can never collide
    // with it. Domain separation is what lets one key drive both HMACs.
    expect(unsubscribeTokenMessage(ROW_ID, ISSUED_AT)).not.toContain(":tag:");
  });
});

describe("deriveUnsubscribeToken", () => {
  it("matches a pinned HMAC-SHA256 vector", async () => {
    // Computed independently (node:crypto HMAC-SHA256, base64 -> base64url,
    // padding stripped). This is the contract every link in an inbox depends on.
    await expect(deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT)).resolves.toBe(TOKEN);
  });

  it("is 256 bits, base64url, and URL-safe as-is", async () => {
    const token = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    expect(token).toHaveLength(UNSUBSCRIBE_TOKEN_LENGTH);
    expect(token).toMatch(UNSUBSCRIBE_TOKEN_RE);
    // 43 unpadded base64url characters = 32 bytes = 256 bits.
    expect(UNSUBSCRIBE_TOKEN_LENGTH).toBe(43);
    expect(token).not.toMatch(/[+/=]/);
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("is DETERMINISTIC — the same row and issue time always give the same token", async () => {
    // This is the property that lets four separate emails carry a link that
    // works, while the database holds only a hash.
    const a = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    const b = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    expect(a).toBe(b);
  });

  it("changes when the row changes, so one address's token cannot open another's", async () => {
    const a = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    const b = await deriveUnsubscribeToken(SECRET, "99999999-2222-3333-4444-555555555555", ISSUED_AT);
    expect(a).not.toBe(b);
  });

  it("REGRESSION: is the same token whether the issue time came from JS or from Postgres", async () => {
    // The mint derives from `now.toISOString()`; every send after that derives
    // from what PostgREST returned for the same `timestamptz`. Before
    // canonicalisation these produced different tokens, so rungs 2, 3 and 4 of
    // every ladder carried a link that matched no row, and the endpoint answered
    // it with the same "you are unsubscribed" page it gives a total stranger.
    for (const [js, postgres] of PG_SPELLINGS) {
      const minted = await deriveUnsubscribeToken(SECRET, ROW_ID, js);
      const reused = await deriveUnsubscribeToken(SECRET, ROW_ID, postgres);
      expect(reused).toBe(minted);
      // And the row lookup agrees, because that is what actually has to match.
      expect(await hashUnsubscribeToken(reused)).toBe(await hashUnsubscribeToken(minted));
    }
  });

  it("changes when the issue time moves, which is how rotation retires a token", async () => {
    const a = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    const b = await deriveUnsubscribeToken(SECRET, ROW_ID, "2026-07-28T10:00:00.001Z");
    expect(a).not.toBe(b);
  });

  it("changes with the secret, so a leaked token cannot be reproduced without it", async () => {
    const a = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    const b = await deriveUnsubscribeToken(`${SECRET}x`, ROW_ID, ISSUED_AT);
    expect(a).not.toBe(b);
  });

  it("refuses a weak secret rather than emitting a guessable token", async () => {
    await expect(deriveUnsubscribeToken("short", ROW_ID, ISSUED_AT)).rejects.toThrow(/at least 32/);
    await expect(deriveUnsubscribeToken("", ROW_ID, ISSUED_AT)).rejects.toThrow(/at least 32/);
  });

  it("refuses incomplete derivation inputs", async () => {
    await expect(deriveUnsubscribeToken(SECRET, "", ISSUED_AT)).rejects.toThrow(/row id/);
    await expect(deriveUnsubscribeToken(SECRET, ROW_ID, "")).rejects.toThrow(/issue time/);
  });
});

describe("deriveUnsubscribeTag — the gate in front of the database", () => {
  it("matches a pinned vector and is 22 base64url characters", async () => {
    await expect(deriveUnsubscribeTag(SECRET, TOKEN)).resolves.toBe(TAG);
    expect(TAG).toHaveLength(UNSUBSCRIBE_TAG_LENGTH);
    expect(UNSUBSCRIBE_TAG_LENGTH).toBe(22);
    expect(TAG).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("is a function of the token ALONE, which is what makes a pre-DB check possible", async () => {
    // No row id, no issue time: the endpoint can check this knowing nothing
    // about which address (or whether any address) the token belongs to.
    const a = await deriveUnsubscribeTag(SECRET, TOKEN);
    const b = await deriveUnsubscribeTag(SECRET, TOKEN);
    expect(a).toBe(b);
  });

  it("is not the token, and not a prefix of it", async () => {
    const tag = await deriveUnsubscribeTag(SECRET, TOKEN);
    expect(TOKEN.startsWith(tag)).toBe(false);
    expect(TOKEN).not.toContain(tag);
  });

  it("changes with the token and with the secret", async () => {
    const other = await deriveUnsubscribeToken(SECRET, ROW_ID, "2026-07-28T10:00:00.001Z");
    expect(await deriveUnsubscribeTag(SECRET, other)).not.toBe(TAG);
    expect(await deriveUnsubscribeTag(`${SECRET}x`, TOKEN)).not.toBe(TAG);
  });

  it("refuses a weak secret or a token that is not one of ours", async () => {
    await expect(deriveUnsubscribeTag("short", TOKEN)).rejects.toThrow(/at least 32/);
    await expect(deriveUnsubscribeTag(SECRET, "nope")).rejects.toThrow(/well-formed token/);
  });
});

describe("deriveUnsubscribeCredential", () => {
  it("is the token and its tag, joined — and matches the pinned vector", async () => {
    const { token, credential } = await deriveUnsubscribeCredential(SECRET, ROW_ID, ISSUED_AT);
    expect(token).toBe(TOKEN);
    expect(credential).toBe(CREDENTIAL);
    expect(credential).toMatch(UNSUBSCRIBE_CREDENTIAL_RE);
    expect(credential).toHaveLength(UNSUBSCRIBE_TOKEN_LENGTH + 1 + UNSUBSCRIBE_TAG_LENGTH);
  });

  it("stays URL-safe with no escaping, dot included", async () => {
    const { credential } = await deriveUnsubscribeCredential(SECRET, ROW_ID, ISSUED_AT);
    expect(encodeURIComponent(credential)).toBe(credential);
  });

  it("hands back the TOKEN half separately, because that is what gets hashed", async () => {
    const { token, credential } = await deriveUnsubscribeCredential(SECRET, ROW_ID, ISSUED_AT);
    // The row stores sha256(token), not sha256(credential): storing the latter
    // would make the tag load-bearing for identification as well as for the
    // gate, and rotating the gate would then orphan every delivered link.
    expect(credential.startsWith(token)).toBe(true);
    expect(await hashUnsubscribeToken(token)).not.toBe(await hashUnsubscribeToken(credential));
  });
});

describe("parseUnsubscribeCredential / isWellFormedUnsubscribeCredential", () => {
  it("splits a well-formed credential", () => {
    expect(parseUnsubscribeCredential(CREDENTIAL)).toEqual({ token: TOKEN, tag: TAG });
    expect(isWellFormedUnsubscribeCredential(CREDENTIAL)).toBe(true);
  });

  it("rejects a bare token, a bare tag, and the wrong separator", () => {
    expect(parseUnsubscribeCredential(TOKEN)).toBeNull();
    expect(parseUnsubscribeCredential(TAG)).toBeNull();
    expect(parseUnsubscribeCredential(`${TOKEN}:${TAG}`)).toBeNull();
    expect(parseUnsubscribeCredential(`${TOKEN}.${TAG}.${TAG}`)).toBeNull();
  });

  it("rejects wrong lengths on either half", () => {
    expect(parseUnsubscribeCredential(`${TOKEN.slice(1)}.${TAG}`)).toBeNull();
    expect(parseUnsubscribeCredential(`${TOKEN}.${TAG.slice(1)}`)).toBeNull();
    expect(parseUnsubscribeCredential(`${TOKEN}.${TAG}x`)).toBeNull();
  });

  it("rejects non-strings, so a parsed body cannot smuggle an object into the gate", () => {
    for (const bad of [null, undefined, 43, [CREDENTIAL], {}]) {
      expect(parseUnsubscribeCredential(bad)).toBeNull();
      expect(isWellFormedUnsubscribeCredential(bad)).toBe(false);
    }
  });
});

describe("verifyUnsubscribeCredential — no secret, no database round trip", () => {
  it("returns the token for a credential this secret produced", async () => {
    await expect(verifyUnsubscribeCredential(SECRET, CREDENTIAL)).resolves.toBe(TOKEN);
  });

  it("returns null for a tag forged without the secret", async () => {
    await expect(verifyUnsubscribeCredential(SECRET, `${TOKEN}.${"A".repeat(22)}`)).resolves.toBeNull();
  });

  it("returns null for a credential signed with a different key", async () => {
    const { credential } = await deriveUnsubscribeCredential(`${SECRET}x`, ROW_ID, ISSUED_AT);
    await expect(verifyUnsubscribeCredential(SECRET, credential)).resolves.toBeNull();
  });

  it("returns null for a tag that is right for a DIFFERENT token", async () => {
    // The tag is bound to its own token, so tags cannot be transplanted.
    const other = await deriveUnsubscribeToken(SECRET, "99999999-2222-3333-4444-555555555555", ISSUED_AT);
    const otherTag = await deriveUnsubscribeTag(SECRET, other);
    await expect(verifyUnsubscribeCredential(SECRET, `${TOKEN}.${otherTag}`)).resolves.toBeNull();
  });

  it("returns null for every malformed shape, without throwing", async () => {
    for (const bad of ["", TOKEN, "' OR 1=1 --", null, undefined, 43, {}]) {
      await expect(verifyUnsubscribeCredential(SECRET, bad)).resolves.toBeNull();
    }
  });

  it("throws on an unusable secret rather than waving everything through", async () => {
    // A misconfigured endpoint must fail loudly. Returning null would look
    // exactly like "nobody's credential verifies", which is a silent outage.
    await expect(verifyUnsubscribeCredential("short", CREDENTIAL)).rejects.toThrow(/at least 32/);
  });
});

describe("hashUnsubscribeToken", () => {
  it("matches a pinned SHA-256 vector, as 64 lowercase hex characters", async () => {
    const token = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    const hash = await hashUnsubscribeToken(token);
    expect(hash).toBe("2ef0eab56c3c63434a4b1f75e9a388dfdceaf280107ce0b749d99480821e2ba4");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — verification is a lookup, not a comparison loop", async () => {
    const token = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    expect(await hashUnsubscribeToken(token)).toBe(await hashUnsubscribeToken(token));
  });

  it("is not the token, which is the point of storing it", async () => {
    const token = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    const hash = await hashUnsubscribeToken(token);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
  });

  it("separates tokens that differ by one character", async () => {
    const a = await hashUnsubscribeToken("a".repeat(43));
    const b = await hashUnsubscribeToken(`${"a".repeat(42)}b`);
    expect(a).not.toBe(b);
  });
});

describe("unsubscribeTokenMatchesStoredHash — the sender checking its own work", () => {
  it("accepts the token that produced the stored hash", async () => {
    const token = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    expect(await unsubscribeTokenMatchesStoredHash(token, await hashUnsubscribeToken(token))).toBe(true);
  });

  it("catches a token derived under a DIFFERENT secret, which is what a key rotation is", async () => {
    // Rotating UNSUBSCRIBE_TOKEN_SECRET re-keys the token as well as the tag,
    // so the row on file stops matching. Without this check the sender would
    // mail that dead link for the full 180-day TTL and nothing would complain.
    const onFile = await hashUnsubscribeToken(await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT));
    const rotated = await deriveUnsubscribeToken(`${SECRET}-rotated`, ROW_ID, ISSUED_AT);
    expect(await unsubscribeTokenMatchesStoredHash(rotated, onFile)).toBe(false);
  });

  it("catches a token derived from a different instant, hence any derivation divergence", async () => {
    const onFile = await hashUnsubscribeToken(await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT));
    const drifted = await deriveUnsubscribeToken(SECRET, ROW_ID, "2026-07-28T10:00:00.001Z");
    expect(await unsubscribeTokenMatchesStoredHash(drifted, onFile)).toBe(false);
  });

  it("funnels every unusable stored value into the same 'rotate' answer", async () => {
    const token = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    for (const bad of [null, undefined, "", "not-a-hash", "ABC", (await hashUnsubscribeToken(token)).toUpperCase()]) {
      expect(await unsubscribeTokenMatchesStoredHash(token, bad)).toBe(false);
    }
  });

  it("rejects a token that is not one of ours before hashing it", async () => {
    const token = await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT);
    expect(await unsubscribeTokenMatchesStoredHash("nope", await hashUnsubscribeToken(token))).toBe(false);
  });
});

describe("unsubscribeSecretCandidates — surviving a key rotation", () => {
  const PREVIOUS = `${SECRET}-previous-key`;

  it("keeps the current key first and drops anything unusable", () => {
    expect(unsubscribeSecretCandidates(SECRET, PREVIOUS)).toEqual([SECRET, PREVIOUS]);
    expect(unsubscribeSecretCandidates(SECRET, undefined)).toEqual([SECRET]);
    expect(unsubscribeSecretCandidates(SECRET, "")).toEqual([SECRET]);
    expect(unsubscribeSecretCandidates(SECRET, "short")).toEqual([SECRET]);
    expect(unsubscribeSecretCandidates(undefined, null, "")).toEqual([]);
  });

  it("collapses a duplicate, so an unrotated PREVIOUS costs no second HMAC", () => {
    expect(unsubscribeSecretCandidates(SECRET, SECRET)).toEqual([SECRET]);
  });

  it("lets the endpoint verify a link signed with the OUTGOING key", async () => {
    // A rotation without this is an outage: every link already in an inbox was
    // tagged with the old key and would fail the gate the moment the new one lands.
    const { credential } = await deriveUnsubscribeCredential(PREVIOUS, ROW_ID, ISSUED_AT);
    const candidates = unsubscribeSecretCandidates(SECRET, PREVIOUS);
    await expect(verifyUnsubscribeCredential(candidates, credential)).resolves.toMatch(UNSUBSCRIBE_TOKEN_RE);
    // And it stops verifying once PREVIOUS is dropped, which is the point of dropping it.
    await expect(verifyUnsubscribeCredential([SECRET], credential)).resolves.toBeNull();
  });

  it("still verifies the current key's own credential, and still rejects a stranger's", async () => {
    const candidates = unsubscribeSecretCandidates(SECRET, PREVIOUS);
    await expect(verifyUnsubscribeCredential(candidates, CREDENTIAL)).resolves.toBe(TOKEN);
    const { credential } = await deriveUnsubscribeCredential(`${SECRET}-third`, ROW_ID, ISSUED_AT);
    await expect(verifyUnsubscribeCredential(candidates, credential)).resolves.toBeNull();
  });

  it("throws when not one candidate is usable, because that is a silent outage", async () => {
    await expect(verifyUnsubscribeCredential([], CREDENTIAL)).rejects.toThrow(/at least 32/);
    await expect(verifyUnsubscribeCredential(["short"], CREDENTIAL)).rejects.toThrow(/at least 32/);
  });
});

describe("isWellFormedUnsubscribeToken", () => {
  it("accepts a derived token", async () => {
    expect(isWellFormedUnsubscribeToken(await deriveUnsubscribeToken(SECRET, ROW_ID, ISSUED_AT))).toBe(true);
  });

  it("rejects wrong lengths at the boundary", () => {
    expect(isWellFormedUnsubscribeToken("A".repeat(42))).toBe(false);
    expect(isWellFormedUnsubscribeToken("A".repeat(43))).toBe(true);
    expect(isWellFormedUnsubscribeToken("A".repeat(44))).toBe(false);
  });

  it("rejects characters outside base64url, including padded base64", () => {
    expect(isWellFormedUnsubscribeToken(`${"A".repeat(42)}+`)).toBe(false);
    expect(isWellFormedUnsubscribeToken(`${"A".repeat(42)}/`)).toBe(false);
    expect(isWellFormedUnsubscribeToken(`${"A".repeat(42)}=`)).toBe(false);
    // A query string a scanner might mangle, and an injection attempt.
    expect(isWellFormedUnsubscribeToken(`${"A".repeat(40)}%20a`)).toBe(false);
    expect(isWellFormedUnsubscribeToken("' OR 1=1 --")).toBe(false);
  });

  it("rejects non-strings, so a parsed body cannot smuggle an object into the lookup", () => {
    expect(isWellFormedUnsubscribeToken(null)).toBe(false);
    expect(isWellFormedUnsubscribeToken(undefined)).toBe(false);
    expect(isWellFormedUnsubscribeToken(43)).toBe(false);
    expect(isWellFormedUnsubscribeToken(["A".repeat(43)])).toBe(false);
    expect(isWellFormedUnsubscribeToken({})).toBe(false);
  });
});

describe("isUnsubscribeTokenExpired", () => {
  const issued = new Date("2026-01-01T00:00:00.000Z");
  const at = (ms: number) => new Date(issued.getTime() + ms);

  it("is 180 days, comfortably beyond the ladder's 14-day window", () => {
    expect(UNSUBSCRIBE_TTL_MS).toBe(180 * 24 * 60 * 60 * 1000);
  });

  it("is false inside the window and true from the boundary millisecond on", () => {
    expect(isUnsubscribeTokenExpired(issued.toISOString(), issued)).toBe(false);
    expect(isUnsubscribeTokenExpired(issued.toISOString(), at(UNSUBSCRIBE_TTL_MS - 1))).toBe(false);
    // The boundary itself expires: >= ttl, not > ttl.
    expect(isUnsubscribeTokenExpired(issued.toISOString(), at(UNSUBSCRIBE_TTL_MS))).toBe(true);
    expect(isUnsubscribeTokenExpired(issued.toISOString(), at(UNSUBSCRIBE_TTL_MS + 1))).toBe(true);
  });

  it("honours an explicit ttl", () => {
    expect(isUnsubscribeTokenExpired(issued.toISOString(), at(999), 1000)).toBe(false);
    expect(isUnsubscribeTokenExpired(issued.toISOString(), at(1000), 1000)).toBe(true);
  });

  it("treats an absent or unparseable issue time as expired, so the next send re-mints", () => {
    expect(isUnsubscribeTokenExpired(null, issued)).toBe(true);
    expect(isUnsubscribeTokenExpired(undefined, issued)).toBe(true);
    expect(isUnsubscribeTokenExpired("", issued)).toBe(true);
    expect(isUnsubscribeTokenExpired("not a timestamp", issued)).toBe(true);
  });

  it("does not expire a clock-skewed future issue time", () => {
    expect(isUnsubscribeTokenExpired(at(60_000).toISOString(), issued)).toBe(false);
  });
});

describe("normalizeUnsubscribeEmail", () => {
  it("is the one canonical spelling the token table is keyed on", () => {
    expect(normalizeUnsubscribeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
    expect(normalizeUnsubscribeEmail("foo@bar.com")).toBe("foo@bar.com");
  });

  it("is idempotent, so a re-read of a stored address matches what was written", () => {
    const once = normalizeUnsubscribeEmail(" Foo@Bar.com ");
    expect(normalizeUnsubscribeEmail(once)).toBe(once);
  });

  it("agrees with the key the cron looks addresses up by", () => {
    // `decide` is handed `row.email.trim().toLowerCase()`; the two must be the
    // same string or a page-level opt-out silently misses.
    const raw = "  Foo@Bar.com ";
    expect(normalizeUnsubscribeEmail(raw)).toBe(raw.trim().toLowerCase());
  });
});

describe("buildUnsubscribeUrl", () => {
  it("points at the public edge function and carries only the credential", () => {
    expect(buildUnsubscribeUrl("https://ref.supabase.co", CREDENTIAL)).toBe(
      `https://ref.supabase.co${UNSUBSCRIBE_FUNCTION_PATH}?${UNSUBSCRIBE_QUERY_PARAM}=${CREDENTIAL}`,
    );
  });

  it("NEVER puts an address in the query string", () => {
    // The project rule, asserted rather than trusted: the credential is opaque
    // and unguessable, and the endpoint never reads the address at all.
    const url = buildUnsubscribeUrl("https://ref.supabase.co", CREDENTIAL);
    expect(url).not.toContain("@");
    expect(url.toLowerCase()).not.toContain("%40");
    expect(new URL(url).searchParams.get(UNSUBSCRIBE_QUERY_PARAM)).toBe(CREDENTIAL);
    expect([...new URL(url).searchParams.keys()]).toEqual([UNSUBSCRIBE_QUERY_PARAM]);
  });

  it("normalises a trailing slash rather than emitting a doubled path", () => {
    expect(buildUnsubscribeUrl("https://ref.supabase.co/", CREDENTIAL)).toBe(
      buildUnsubscribeUrl("https://ref.supabase.co", CREDENTIAL),
    );
  });
});

describe("the module stays pure", () => {
  it("imports only the shared crypto helpers and reads no ambient clock", () => {
    const src = readFileSync(root("supabase/functions/_shared/unsubscribe.ts"), "utf8");
    const imports = src
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line))
      .map((line) => line.trim());
    expect(imports).toEqual(['import { hmacSha256Base64, timingSafeEqual } from "./crypto.ts";']);
    // Comments are stripped first: the header EXPLAINS that the module reaches
    // for no Deno global and no ambient clock, and naming a thing is not using
    // it. Only executable lines are searched.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*\/\//.test(line))
      .join("\n");
    expect(code).not.toMatch(/\bDeno\./);
    expect(code).not.toMatch(/\bDate\.now\s*\(/);
    expect(code).not.toMatch(/\brequire\s*\(/);
  });
});

describe("the wiring the ladder cannot survive without", () => {
  const cron = readFileSync(root("supabase/functions/cohort-reentry-cron/index.ts"), "utf8");
  const migration = readFileSync(root("supabase/migrations/20260730110000_unsubscribe_tokens.sql"), "utf8");
  const endpoint = readFileSync(root("supabase/functions/email-unsubscribe/index.ts"), "utf8");
  const config = readFileSync(root("supabase/config.toml"), "utf8");

  const TEMPLATE_KEYS = [
    "reentry_fee_nudge_1",
    "reentry_fee_nudge_2",
    "reentry_fee_nudge_3",
    "reentry_interview_nudge_1",
    "reentry_interview_nudge_2",
    "reentry_interview_nudge_3",
  ];

  /**
   * The dollar-quoted literals only — subject, html_body and text_body for each
   * of the six rows, three apiece. Asserting against the whole file would let a
   * SQL comment satisfy a claim about what lands in somebody's inbox, which is
   * exactly the mistake worth not making in a copy test.
   */
  const insertSection = migration.split("INSERT INTO public.email_templates")[1] ?? "";
  const literals = [...insertSection.matchAll(/\$\$([\s\S]*?)\$\$/g)].map((m) => m[1]);
  const bodies = literals.filter((lit) => lit.includes("LevelUp Learning"));

  it("re-states all six rung templates", () => {
    for (const key of TEMPLATE_KEYS) expect(migration).toContain(`'${key}'`);
    expect(migration).toContain("ON CONFLICT (template_key) DO UPDATE SET");
    // 6 rows x (subject + html_body + text_body).
    expect(literals.length).toBe(TEMPLATE_KEYS.length * 3);
    expect(bodies.length).toBe(TEMPLATE_KEYS.length * 2);
  });

  it("replaces the reply-to-us opt-out with a link in every body, HTML and text alike", () => {
    expect(migration).not.toContain("Reply to this email and we will stop these reminders");
    for (const body of bodies) expect(body).toContain("{{unsubscribe_url}}");
  });

  it("promises only what the mechanism delivers: the reminders, not all email", () => {
    // The copy is the contract. `used_at` on one token row stops this ladder and
    // nothing else, so no body may imply a global opt-out.
    for (const body of bodies) expect(body).toMatch(/these reminders|this step/);
  });

  it("keeps the consent sentence, because the consent position has not changed", () => {
    for (const body of bodies) {
      expect(body).toMatch(/You are getting (this|it) because you applied to \{\{cohort_name\}\}/);
    }
  });

  it("carries no em dash in the copy (LevelUp copy rule)", () => {
    for (const lit of literals) expect(lit).not.toContain("—");
  });

  it("fills {{unsubscribe_url}} from templateVariables — an unfilled one burns the rung", () => {
    expect(cron).toMatch(/unsubscribe_url:\s*unsubscribeUrl/);
  });

  it("lists unsubscribe_url in URL_VARIABLES — sanitizeVar deletes any URL that is not", () => {
    const block = cron.match(/const URL_VARIABLES[\s\S]*?\]\);/)?.[0] ?? "";
    expect(block).toContain('"unsubscribe_url"');
  });

  it("passes the credential to enqueueEmail, which is the field process-email-queue forwards", () => {
    expect(cron).toContain("unsubscribeToken: unsubscribeCredential");
    const email = readFileSync(root("supabase/functions/_shared/email.ts"), "utf8");
    expect(email).toContain("unsubscribeToken?: string");
    // Set only when present, so every other producer queues what it always did.
    expect(email).toContain("...(opts.unsubscribeToken ? { unsubscribe_token: opts.unsubscribeToken } : {})");
  });

  it("declares the endpoint public, because it is a link in an email", () => {
    expect(config).toMatch(/\[functions\.email-unsubscribe\]\s*\n\s*verify_jwt = false/);
  });

  it("writes nothing on GET, so a mail scanner cannot unsubscribe anyone", () => {
    // The only mutations live past the POST guard.
    const beforePost = endpoint.split("// ── POST: THE ONLY PATH THAT WRITES")[0];
    expect(beforePost).toContain('if (req.method !== "POST") {');
    expect(beforePost).not.toMatch(/await recordOptOut\(/);
  });

  it("verifies the tag BEFORE it builds a client, so a guess buys no database read", () => {
    const body = endpoint.split("Deno.serve(")[1] ?? "";
    const gateAt = body.indexOf("verifyUnsubscribeCredential(");
    const clientAt = body.indexOf("createAdminClient()");
    expect(gateAt).toBeGreaterThan(-1);
    expect(clientAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(clientAt);
  });

  it("bounds what it reads from a POST body instead of buffering it whole", () => {
    expect(endpoint).toContain("MAX_BODY_BYTES");
    // The whole-body read the bounded reader replaced.
    expect(endpoint).not.toContain("await req.text()");
  });

  it("does NOT write suppressed_emails, which would kill the same person's receipts", () => {
    // `suppressed_emails` has no category column and gates EVERY transactional
    // send, append-only with no DELETE or UPDATE policy. An unsubscribe there is
    // an irreversible global kill switch, which is not what the copy promises.
    expect(endpoint).not.toContain('.from("suppressed_emails")');
    expect(endpoint).toContain('.from("email_unsubscribe_tokens")');
  });

  it("tells the reader what the button does NOT stop, because bulk email is a separate list", () => {
    // `send-bulk-email` reads only `suppressed_emails`, so this opt-out does not
    // reach it. A page headed "You are unsubscribed" that let somebody believe
    // otherwise would be the real defect, so both pages name the limit and give
    // the one path that does stop everything.
    // The rendered copy only: every line of the page bodies, and no comment,
    // so a prose explanation cannot satisfy a claim about what a human reads.
    const copy = (endpoint.split("function confirmPage")[1] ?? "")
      .split("\n")
      // A leading backtick is the template literal's first line, not prose.
      .filter((line) => /^`?<(p|h1)\b/.test(line.trim()))
      .join("\n");
    expect(copy).toContain("support@leveluplearning.in");
    expect(copy.match(/separate list/g)?.length).toBe(2);
    // LevelUp copy rule, asserted against the copy rather than the file.
    expect(copy).not.toContain("—");
  });

  it("records the opt-out where the ladder reads it, and reads it in both places", () => {
    expect(endpoint).toMatch(/\.update\(\{ used_at: new Date\(\)\.toISOString\(\) \}\)/);
    // Pre-claim (page) and last-moment (dispatch).
    expect(cron).toContain("loadOptedOutEmails");
    expect(cron).toMatch(/\.not\("used_at", "is", null\)/);
    expect(cron).toMatch(/unsubscribe\.optedOut/);
  });

  it("VERIFIES a reused token against the stored hash before mailing it", () => {
    // The check that makes a derivation divergence detectable at all. Rungs 2-4
    // re-derive from a timestamp Postgres rendered, so "the same token" has to
    // be proven, not assumed. Without this the endpoint answers a dead link with
    // "you are unsubscribed" and nothing anywhere notices.
    expect(cron).toContain("unsubscribeTokenMatchesStoredHash");
    const reuse = cron.match(/async function reusableUnsubscribeCredential[\s\S]*?\n}/)?.[0] ?? "";
    expect(reuse).toContain("await unsubscribeTokenMatchesStoredHash(token, row.token_hash)");
    // A mismatch must ROTATE, never reuse: both callers fall through to the
    // rotate helper when this returns null.
    expect(cron).toMatch(/if \(reused\) return \{ credential: reused/);
    expect(cron).toContain("rotateUnsubscribeCredential(admin, existing.id, now)");
    // The race-adoption path gets the same scrutiny as the ordinary one.
    expect(cron).toContain("rotateUnsubscribeCredential(admin, winner.id, now)");
  });

  it("mints only with the CURRENT secret, while the endpoint also accepts the previous one", () => {
    // One key drives both HMACs, so a rotation would otherwise kill every
    // delivered link at once. Consuming is tolerant; minting is not, because a
    // token derived from a retired key dies when that key is dropped.
    expect(endpoint).toContain("UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS");
    expect(endpoint).toContain("unsubscribeSecretCandidates(");
    expect(cron).not.toContain("UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS");
    expect(config).toContain("UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS");
  });

  it("never clears used_at on rotation, which would resurrect an opt-out", () => {
    expect(cron).not.toMatch(/used_at:\s*null/);
    // The rotate path writes the new derivation inputs and nothing else.
    expect(cron).toContain(".update({ token_hash: tokenHash, issued_at: issuedAt })");
  });

  it("never reads used_at as a gate at the ENDPOINT, so clicking twice still succeeds", () => {
    // A second click finds it set, writes nothing, and still renders the done
    // page. The conditional write is what keeps the first timestamp intact.
    expect(endpoint).not.toMatch(/if\s*\(\s*row\.used_at\s*\)\s*return htmlRes\(errorPage/);
    expect(endpoint).toContain('.is("used_at", null)');
  });

  it("does not rest on an RFC 8058 capability nobody has verified", () => {
    // The premise of the comments in the endpoint, _shared/email.ts, the cron
    // and config.toml: nothing in this repo emits the header, so a provider
    // cannot route one-click here. If that ever changes, this fires and those
    // four comments need revisiting rather than quietly becoming true by luck.
    const queue = readFileSync(root("supabase/functions/process-email-queue/index.ts"), "utf8");
    expect(queue).not.toContain("List-Unsubscribe");
    // And the load-bearing path is the in-body link, which every body carries.
    for (const body of bodies) expect(body).toContain("{{unsubscribe_url}}");
  });

  it("keeps the token-table hashing claim scoped to the token table", () => {
    // The plaintext credential also lives on the pgmq payload, which move_to_dlq
    // retains for a failed message. The COMMENT must not overstate.
    expect(migration).toContain("a read of THIS TABLE cannot forge an unsubscribe");
    expect(migration).toContain("move_to_dlq");
  });
});
