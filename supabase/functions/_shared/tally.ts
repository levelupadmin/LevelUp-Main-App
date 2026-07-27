/**
 * tally.ts — the PURE parsing + windowing core of the Tally intake POLLER
 * (`design/briefs/cohort-tally-poll.md` TP-2). Everything the poller decides —
 * which label an answer belongs to, which submissions are inside the intake
 * window, and the exact `cohort_applications` row a submission becomes — is
 * defined here so it can be proven by unit test without a network or a DB.
 *
 * WHY THE WEBHOOK'S PARSER CANNOT BE REUSED. The Tally *webhook* delivers
 * `data.fields[{label, value}]` — label and value in the same object. The Tally
 * *API* does not: `submissions[].responses[]` is keyed by `questionId`, and the
 * human label lives in the envelope's sibling `questions[]` array
 * (`{id, title}`, where `title` may carry HTML and some entries are empty
 * layout blocks). So the poller must JOIN
 * `responses[].questionId` → `questions[].id` → `title` before any
 * label-matching can happen. `buildQuestionMap` + `extractAnswers` are that
 * join; `pickField` then selects a field from the joined result.
 *
 * THE POLLER'S MATCHER DELIBERATELY DIVERGES FROM THE WEBHOOK'S (FX-1). It used
 * to be a deliberate mirror — case-insensitive `includes()` over the same alias
 * lists — on the theory that both intake paths should pick the same answers.
 * Running that mirror against the REAL live form (`81dRPA`, 29 questions, probed
 * 2026-07-27 and committed as `qa-harness/tally-81dRPA-real-envelope.json`)
 * showed the mirror is the bug, because a bare substring test cannot tell a
 * question from a paragraph of marketing copy:
 *   - the alias `"work"` matched the FAQ block "How does the academy *work*
 *     week to week?", so `occupation` captured a sentence of course marketing;
 *   - `about | bio | tell us` matched nothing at all, so `bio` — the 100-word
 *     essay, the funnel's core qualification signal — was silently NULL.
 * A webhook payload only carries the fields the form owner mapped, so it never
 * sees the FAQ blocks or an unresolved personalisation token; the API envelope
 * carries EVERY question exactly as authored, so the poller needs a stricter
 * matcher than the webhook. Hence, in the order they run: alias lists retuned
 * against the real labels, Tally's piped-personalisation prefix normalised off
 * a label before it is matched (`MENTION_PREFIX`), an anchored deny-list for
 * the form's informational blocks (`DENIED_LABEL`), then word-boundary scoring
 * (`pickField`). The two paths can now legitimately disagree on a pathological
 * form, and when they do the poller is the one that is right.
 *
 * NOTHING HERE MAY BE TUNED TO ONE FORM. The poller walks EVERY staged offering
 * carrying a `tally_form_url` — one form per offering — so every rule in this
 * file also governs cohort forms nobody has read. A rule that is merely
 * belt-and-braces on `81dRPA` can be the thing that NULLs a real column
 * elsewhere, or, if it silences the email label, drops the whole submission
 * (`toApplicationRow` returns null without an email). That is why the deny-list
 * is anchored to whole labels instead of loose substrings, and why the
 * personalisation token is normalised away rather than deny-listed.
 *
 * Dependency-free: no imports, and only globals that exist in every target
 * (Deno, Node, jsdom) — Date, JSON, RegExp, Object. Imported by the edge fn as
 * `../_shared/tally.ts` and by vitest as `@shared/tally`, so an import that
 * exists in only one runtime would break the other.
 *
 * SOR-1: nothing here talks to Tally, and nothing here writes. These are pure
 * functions of an already-fetched envelope.
 */

// ── Wire shapes (the VERIFIED live API envelope, probed 2026-07-22) ──

/** An entry of the envelope's `questions[]`. `title` may contain HTML or be empty. */
export interface TallyQuestion {
  id?: string;
  title?: string | null;
  [key: string]: unknown;
}

/** An entry of `submissions[].responses[]`. Keyed by `questionId`, never by label. */
export interface TallyResponse {
  questionId?: string;
  answer?: unknown;
  [key: string]: unknown;
}

/** One row of `submissions[]`. */
export interface TallySubmission {
  id?: string;
  submittedAt?: string | null;
  isCompleted?: boolean;
  responses?: TallyResponse[];
  [key: string]: unknown;
}

/** The full `GET /forms/{id}/submissions` envelope. */
export interface TallyEnvelope {
  page?: number;
  limit?: number;
  hasMore?: boolean;
  totalNumberOfSubmissionsPerFilter?: {
    all?: number;
    completed?: number;
    partial?: number;
  };
  questions?: TallyQuestion[];
  submissions?: TallySubmission[];
}

/** The exact `cohort_applications` insert payload the poller writes. */
export interface CohortApplicationRow {
  offering_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  occupation: string | null;
  bio: string | null;
  /**
   * ALWAYS the literal `'submitted'`. Every other value in the CHECK
   * constraint is TeleCRM-owned or human-owned; the poller must never author
   * one (brief, inviolable rule 3).
   */
  status: "submitted";
  tally_response_id: string;
  tally_data: unknown;
}

/**
 * The alias groups `pickField` matches on, EACH LIST IN PRIORITY ORDER — an
 * earlier alias beats a later one outright (see `pickField`).
 *
 * Retuned against the real `81dRPA` labels (FX-1). What changed and why:
 *   - `occupation` lost `"work"`. It matched the FAQ block "How does the
 *     academy work week to week?" and filed marketing copy as the applicant's
 *     job. `designation` (the real label: "What is your most recent
 *     designation?") is listed BEFORE `what do you do` because a designation is
 *     a job title whereas "What do you do?" tends to hold a coarse bucket — and
 *     the live form asks the coarse one FIRST ("@Your name, What do you do?",
 *     question 13, against question 14), so alias priority is the ONLY thing
 *     that can outrank position here. If the designation is left blank,
 *     `what do you do` does then answer for occupation. That is the intended
 *     floor, not a hole: a bucket the applicant picked is a poorer answer than
 *     the title they typed, but it is still their own answer, and it is the
 *     last alias in the group.
 *   - `bio` gained `write your heart` / `100 words`. The real essay label is
 *     "Write your heart out! (In 100 words or more)", which `about | bio |
 *     tell us` missed entirely, and `about` alone is too greedy — it matches
 *     "How did you hear about us?" — so it is now `about you`.
 * name / email / phone / city are unchanged: they already resolve correctly on
 * the real form, and the real-envelope tests re-verify that under the new
 * matcher.
 */
export const FIELD_ALIASES = {
  fullName: ["name", "full name"],
  email: ["email"],
  phone: ["phone", "mobile", "whatsapp"],
  city: ["city", "location"],
  occupation: ["occupation", "profession", "designation", "what do you do"],
  bio: ["write your heart", "100 words", "about you", "bio", "tell us"],
} as const;

// ── Label join ──

/** A handful of entities Tally emits inside question titles. */
const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/** Strip HTML tags + basic entities out of a question title and collapse whitespace. */
function stripHtml(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `questions[]` → `{questionId: cleanTitle}`. Titles are HTML-stripped and
 * trimmed; entries that reduce to an empty string (Tally's layout blocks —
 * headings, dividers, page breaks) are DROPPED, so they can never become a
 * `{"": value}` answer key that alias matching would then match on.
 */
export function buildQuestionMap(
  questions: TallyQuestion[] | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const q of questions ?? []) {
    const id = typeof q?.id === "string" ? q.id : "";
    if (!id) continue;
    const title = stripHtml(q?.title);
    if (!title) continue;
    map[id] = title;
  }
  return map;
}

/**
 * Own-property test, for the ONE data-keyed lookup that needs it: the question
 * map `extractAnswers` receives belongs to the caller and is a plain `{}` (that
 * is what `buildQuestionMap` returns), so a response with `questionId:
 * "toString"` would find an inherited function there, pass a bare truthiness
 * guard, and go on to be used as a label. The maps this file builds itself —
 * the answer map, the per-question buckets, the whole-word cache — are
 * `Object.create(null)`, so they have no inherited members to confuse and their
 * lookups are deliberately plain reads.
 */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/** Which keys of an object answer are likely to hold its human text, in order. */
const TEXT_KEYS = ["text", "label", "value", "title", "name"];

/**
 * Turn one `responses[].answer` into a string. Tally answers are polymorphic:
 * plain strings, numbers, booleans, arrays of option objects (multi-select),
 * a single option object (dropdown), or null for a skipped question.
 */
function stringifyAnswer(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(stringifyAnswer).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of TEXT_KEYS) {
      const inner = obj[key];
      if (inner === null || inner === undefined) continue;
      const text = stringifyAnswer(inner);
      if (text) return text;
    }
    return "";
  }
  return "";
}

/**
 * THE JOIN: `submission.responses[]` → `{cleanLabel: stringValue}` using the
 * question map. Responses whose `questionId` isn't in the map (layout blocks,
 * hidden fields, questions deleted since) are dropped.
 *
 * THE RESULT IS ORDERED BY QUESTION, NOT BY RESPONSE. It is built by walking
 * `questionMap` (which `buildQuestionMap` fills in `questions[]` order) and
 * looking each question's answers up by id, rather than by walking
 * `responses[]`. That matters because `pickField` breaks scoring ties by
 * "earliest question", and the two orders genuinely differ on the live form:
 * `81dRPA` lists "Your Whatsapp Number" before "Your Email ID" in `questions[]`
 * but returns the email response first. Reading key order as question order
 * therefore has to be made true here, not assumed.
 *
 * IT IS A BEST EFFORT, NOT A GUARANTEE, and the hole is worth naming. JS object
 * key order is insertion order only for keys that are NOT canonical array
 * indices: an all-digit key such as `"123456"` is hoisted ahead of every string
 * key, in ascending numeric order. Tally ids are 6-char base62, so an all-digit
 * id is possible — merely unobserved on `81dRPA` — and one would silently sort
 * its question to the front. Nothing load-bearing rests on the order: the one
 * real label a reordering could have damaged, the piped "@Your name, What do
 * you do?", no longer competes for `name` at all once `MENTION_PREFIX` is
 * stripped, and `pickField` weighs alias priority and match tier ABOVE
 * position, so question order only ever breaks a tie between two same-tier
 * labels under one alias.
 *
 * IDS ARE READ WITH AN OWN-PROPERTY CHECK. A response whose `questionId` is
 * `"toString"` would otherwise find an inherited `Object.prototype` member on
 * the caller's plain question map, pass a truthiness guard, and then throw on
 * the bucket — aborting the whole form's ingest inside the poller's per-form
 * try. The buckets and the returned map are null-prototype for the same reason,
 * which also means a question literally titled `__proto__` stores a normal key
 * instead of hitting the prototype setter.
 *
 * ONE DELIBERATE DIVERGENCE FROM THE WEBHOOK — duplicate labels. Two questions
 * can clean to the SAME title (the same field asked again on a later page, a
 * duplicated block). The webhook never sees this: its payload carries
 * `{label, value}` pairs and `extractField` takes `fields.find(...)`, i.e. the
 * first matching field unconditionally, returning "" if that first one is
 * blank. Here the first NON-EMPTY answer wins instead, so a later blank cannot
 * erase an earlier answer and an earlier blank cannot suppress a real one.
 * That is a divergence, not a mirror, and it is intentional: on the API side
 * the duplicate is a same-label collision rather than a caller-chosen alias, so
 * there is no answer the operator "meant" to lose.
 */
export function extractAnswers(
  submission: TallySubmission | null | undefined,
  questionMap: Record<string, string>,
): Record<string, string> {
  // Pass 1 — bucket the stringified answers by question id, in response order.
  const byQuestionId: Record<string, string[]> = Object.create(null);
  for (const response of submission?.responses ?? []) {
    const qid = typeof response?.questionId === "string" ? response.questionId : "";
    if (!qid || !hasOwn(questionMap, qid) || !questionMap[qid]) continue;
    const value = stringifyAnswer(response?.answer);
    const bucket = byQuestionId[qid];
    if (bucket) bucket.push(value);
    else byQuestionId[qid] = [value];
  }

  // Pass 2 — emit in QUESTION order; first non-empty answer wins per label.
  const answers: Record<string, string> = Object.create(null);
  for (const [qid, label] of Object.entries(questionMap)) {
    const values = byQuestionId[qid];
    if (!values) continue;
    for (const value of values) {
      const existing = answers[label];
      if (existing === undefined) answers[label] = value;
      else if (!existing && value) answers[label] = value;
    }
  }
  return answers;
}

/**
 * THE DENY-LIST — the live form's INFORMATIONAL BLOCKS, which must never be
 * selected as a data field however well they score. Checked BEFORE scoring, so
 * a denied label cannot win a tie and cannot be reached by a lower-priority
 * alias when the field it should have come from is blank. All five are authored
 * as MULTIPLE_CHOICE questions, but they are FAQ answers, curriculum blurbs and
 * the grant opt-in: "How does the academy work week to week?" holds a sentence
 * about the course, not anything the applicant wrote about themselves.
 *
 * BE HONEST ABOUT WHAT IT BUYS. After the alias retune, none of these labels
 * matches any alias in `FIELD_ALIASES` — dropping `"work"` from `occupation`
 * closed the only one that did. The brief requires the guard and it is a real
 * second line of defence against a future alias, but it is not the fix.
 *
 * WHICH IS PRECISELY WHY EVERY PATTERN IS ANCHORED TO A WHOLE STATEMENT. This
 * list runs against every cohort form the poller scans, so a loose substring
 * costs far more than it can save: an unanchored /select one/ would refuse a
 * perfectly good "Which city are you from? (select one)", and an unanchored
 * /by the end of the program/ would refuse "By the end of the program, what
 * city will you be in?". The downside of over-matching is a NULL column, or a
 * dropped submission outright if the label it silences is the email one.
 *
 * Matched against the CLEANED, normalised, mention-stripped label, never the
 * raw title: the real "How does the academy work week to week?\n" carries a
 * trailing newline, and other titles arrive wrapped in HTML.
 */
const DENIED_LABEL: readonly RegExp[] = [
  /^how does the academy\b/,
  /^what is the levelup\b/,
  /\byou are mentored by\b/,
  /^by the end of the program, you will leave\b/,
  /^select one$/,
];

function isDeniedLabel(label: string): boolean {
  for (const pattern of DENIED_LABEL) {
    if (pattern.test(label)) return true;
  }
  return false;
}

/**
 * TALLY'S PIPED-PERSONALISATION PREFIX, normalised off a label before matching.
 * A form author can splice an earlier answer into a later question's title, and
 * the API returns the token UNRESOLVED, as `@<the referenced question's title>,
 * <the question actually being asked>`. The live form's question 13 is exactly
 * that: "@Your name, What do you do?".
 *
 * The token is not part of this question — it is a verbatim copy of ANOTHER
 * question's label — so leaving it in makes the label answer for that other
 * question's aliases. Here it made a coarse job dropdown a whole-word `name`
 * hit, one tie-break away from filing "Entrepreneur/Founder" as `full_name`.
 *
 * IT IS STRIPPED RATHER THAN DENY-LISTED, and the difference matters on every
 * form but this one. An earlier cut denied any label containing `@your name`,
 * which was wrong in both directions at once: it made EVERY piped label
 * unselectable poller-wide (a piped "@Your name, Your Email ID" loses the
 * email, and a row with no email is not ingested at all), while still missing
 * the identical decoy piped from a differently-titled question ("@Full Name,
 * What do you do?" — which would then have filed the job bucket as `full_name`,
 * the exact failure the deny entry existed to prevent). Stripping fixes both:
 * what is left is the question the author actually asked, matched on its own
 * terms and on no one else's.
 *
 * Only a LEADING token is removed, and only up to its first comma. The token
 * has no closing delimiter, so a mention placed mid-title cannot be located
 * without guessing; a leading one is the observed shape on `81dRPA` and what
 * Tally produces when a mention opens a title.
 */
const MENTION_PREFIX = /^@[^,]*,\s*/;

/** Match tiers, best (lowest) first. `TIER_NONE` means "not a candidate". */
const TIER_EXACT = 0;
const TIER_PREFIX = 1;
const TIER_WORD = 2;
const TIER_NONE = 3;

/** Lowercase + collapse whitespace, so matching never depends on title layout. */
function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A question label, normalised and with any piped-personalisation prefix
 * removed (see `MENTION_PREFIX`). Aliases go through `normalizeLabel` alone —
 * an alias is authored here, never piped.
 */
function normalizeQuestionLabel(value: string): string {
  return normalizeLabel(value).replace(MENTION_PREFIX, "");
}

/** Aliases are plain words today; escape anyway so one can't become a pattern. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `\balias\b` per alias, memoised — `pickField` runs six alias groups over every
 * label of every submission on a page, so recompiling would be the hot path.
 * Null-prototype, so an alias like "constructor" reads as a cache MISS rather
 * than as an inherited function that is not a RegExp.
 */
const WHOLE_WORD_CACHE: Record<string, RegExp> = Object.create(null);
function wholeWordMatcher(alias: string): RegExp {
  const cached = WHOLE_WORD_CACHE[alias];
  if (cached) return cached;
  // No /g: `exec` must not carry lastIndex between calls.
  const matcher = new RegExp(`\\b${escapeRegExp(alias)}\\b`);
  WHOLE_WORD_CACHE[alias] = matcher;
  return matcher;
}

/**
 * How well a normalised label matches a normalised alias.
 *
 * ONE REGEX DECIDES BOTH SUB-EXACT TIERS, deliberately: `\balias\b` is run
 * against the label, a hit at index 0 is TIER_PREFIX ("the label starts with
 * the alias"), and a hit anywhere else is TIER_WORD. An earlier cut gave the
 * prefix tier its own hand-rolled boundary test (`!/[a-z0-9]/` on the next
 * character), which disagreed with `\b` about `_`: "Name_of_referrer" scored
 * TIER_PREFIX for "name" and so OUT-RANKED a correct TIER_WORD hit on "Your
 * name", even though `\bname\b` rejects it outright. Deriving both tiers from
 * one boundary definition makes that class of hole unrepresentable.
 *
 * There is deliberately NO bare-substring tier: "name" must not match
 * "Filename convention", and "bio" must not match "Biology teacher".
 */
function aliasMatchTier(label: string, alias: string): number {
  if (label === alias) return TIER_EXACT;
  const match = wholeWordMatcher(alias).exec(label);
  if (!match) return TIER_NONE;
  return match.index === 0 ? TIER_PREFIX : TIER_WORD;
}

/**
 * Scored alias match over joined answers. "" when nothing matches.
 *
 * THE SCORE KEY IS `(aliasIndex, matchTier, questionOrder)` — IN THAT ORDER.
 * Alias priority outranks match quality, which outranks position:
 *   1. aliases are tried in their declared order, and the first alias that
 *      yields a non-empty answer wins outright;
 *   2. within one alias, the best TIER wins — exact label, then label starts
 *      with the alias (at a word boundary), then the alias appears as a whole
 *      word anywhere in the label;
 *   3. within one alias AND one tier, the EARLIEST question wins (see the
 *      ordering note on `extractAnswers` — key order is question order).
 * Alias priority has to come first, and the live form proves it: "@Your name,
 * What do you do?" (question 13) and "What is your most recent designation?"
 * (question 14) are both whole-word hits for the occupation group. Scoring tier
 * first and breaking the tie by position would pick the coarse dropdown bucket
 * ("Entrepreneur/Founder") over the applicant's actual job title purely because
 * the form asks it one question earlier.
 *
 * AN EMPTY ANSWER FALLS THROUGH TO THE NEXT ALIAS, NOT THE NEXT LABEL. Exactly
 * one label — the alias's best-scoring candidate — ever answers for a given
 * alias. If that candidate's answer is blank, the search moves on to the next
 * ALIAS and the runner-up is never consulted, in either direction.
 *
 * BE CLEAR ABOUT WHAT THAT DOES NOT BUY. It bounds the damage of a collision
 * (only one label per alias can ever speak) but it does not RESOLVE one: when
 * two labels score identically under the same alias, the winner is simply the
 * earlier question and the loser is ignored whether it is blank or not. So
 * "tell us" prefix-matches both "Tell us about yourself" and "Tell us who
 * referred you", and which of them answers for `bio` depends on which the form
 * asks first. The defences against that are alias tuning and the deny-list, not
 * this rule — which is why the bio group leads with "write your heart" and
 * "100 words", the labels the live form actually uses.
 *
 * Before any of this runs each label is normalised, has any piped
 * personalisation prefix removed (`MENTION_PREFIX`), and is dropped outright if
 * it is an informational block (`DENIED_LABEL`).
 *
 * This is NOT the webhook's matcher — see the divergence note in the file
 * header for why the poller has to be stricter than `tally-application-webhook`.
 */
export function pickField(
  answers: Record<string, string>,
  aliases: readonly string[],
): string {
  const candidates: Array<{ label: string; value: string }> = [];
  for (const [rawLabel, value] of Object.entries(answers)) {
    const label = normalizeQuestionLabel(rawLabel);
    if (!label || isDeniedLabel(label)) continue;
    candidates.push({ label, value });
  }

  for (const alias of aliases) {
    const needle = normalizeLabel(alias);
    let bestTier = TIER_NONE;
    let bestValue = "";
    for (const candidate of candidates) {
      const tier = aliasMatchTier(candidate.label, needle);
      // Strictly better only, so an equal tier leaves the earlier question in place.
      if (tier < bestTier) {
        bestTier = tier;
        bestValue = candidate.value;
      }
    }
    if (bestValue) return bestValue;
  }
  return "";
}

// ── Form id ──

/**
 * The form id out of a stored `offerings.tally_form_url`
 * (`https://tally.so/r/{id}` or `https://tally.so/forms/{id}`), or null when
 * the URL isn't a tally.so URL at all (the poller skips + logs those).
 *
 * The id regex is deliberately IDENTICAL to `extractTallyFormId` in
 * `reconcile-funnel-stage/index.ts:516-520`, so for a tally.so URL the two
 * readers can never resolve different form ids. The host gate is the only
 * difference, and it exists because the poller — unlike the reconciler — would
 * otherwise fire an authenticated API call at a form id parsed out of a
 * non-Tally URL.
 */
export function formIdFromTallyUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const host = url
    .trim()
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
  if (host !== "tally.so" && !host.endsWith(".tally.so")) return null;
  const match = url.match(/(?:forms|r)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

// ── The intake window (the hard requirement) ──

/** Milliseconds for an ISO instant, or null when it isn't parseable. */
function parseInstant(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** The two offering columns that define the window. Snake_case = the DB row. */
export interface IntakeWindowSource {
  /** `offerings.intake_opens_at` (timestamptz). REQUIRED — no fallback. */
  intake_opens_at?: string | null;
  /** `offerings.application_deadline` (SQL `date`). Optional ceiling. */
  application_deadline?: string | null;
}

/** What `resolveIntakeWindow` decided. `skipReason` non-null ⇒ do not scan. */
export interface IntakeWindow {
  windowStart: string | null;
  windowEnd: string | null;
  skipReason: "no_cutoff" | null;
}

/**
 * END OF THE DEADLINE DAY, IN Asia/Kolkata — and the zone is the whole point.
 *
 * `offerings.application_deadline` is a SQL `date`
 * (`20260610090000_design_overhaul_wave2.sql:30`), so it carries no time and no
 * zone: PostgREST hands it over as `"YYYY-MM-DD"` and "the deadline is the 15th"
 * is all it says. Something has to choose the instant that ends, and choosing
 * UTC would end intake at 05:30 IST on the closing day — silently dropping the
 * entire last-day rush, which on an applications funnel is the busiest hours it
 * has. This business runs on IST and the sibling cutoff is authored in IST too
 * (`20260722140000_offering_intake_opens_at.sql:56` seeds `+05:30`), so the
 * ceiling is 23:59:59.999+05:30 on the deadline date.
 *
 * IT ALSO HAS TO BE AT LEAST AS GENEROUS AS WHAT THE APPLICANT WAS SHOWN.
 * `PublicOffering.tsx:1427-1428` renders this same column with
 * `new Date("YYYY-MM-DD")`, i.e. UTC midnight, and shows it as the close date.
 * A server bound tighter than the advertised one would reject a form the page
 * still says is open. IST end-of-day is ~18.5h AFTER that UTC midnight, so the
 * server is strictly the more generous of the two — the right direction.
 */
const IST_END_OF_DAY = "T23:59:59.999+05:30";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function endOfDeadlineDayIst(deadline: string | null | undefined): string | null {
  const raw = typeof deadline === "string" ? deadline.trim() : "";
  if (!raw) return null;
  if (DATE_ONLY.test(raw)) {
    const iso = `${raw}${IST_END_OF_DAY}`;
    return parseInstant(iso) === null ? null : iso;
  }
  // Not the shape a `date` column can produce. Kept so that widening the column
  // to timestamptz later honours the stored instant verbatim instead of
  // re-deriving a day boundary the author did not ask for; an unusable value
  // yields NO ceiling rather than a zero-length window, because the caller
  // reports `windowEnd` and a null there is visible, whereas a window that
  // silently ingests nothing reads exactly like a quiet form.
  return parseInstant(raw) === null ? null : raw;
}

/**
 * The offering row's two window columns → the instants the scan runs on.
 *
 * THE LOWER BOUND IS OPT-IN AND FAILS CLOSED (FX-2.1). `intake_opens_at` is
 * REQUIRED: an offering that has not got one is not polled at all, reported by
 * the caller and never scanned. There is deliberately NO `created_at` fallback
 * any more. The old fallback looked conservative and was the opposite — nothing
 * sets `intake_opens_at` for a new offering (the 20260722140000 migration seeds
 * exactly one slug and there is no admin surface for it), so NULL is the
 * PERMANENT default, and a cloned Edition 3 whose row predates its form's
 * traffic would have back-filled up to the poller's 2000-row scan cap of
 * Edition 1 history on its first tick, reported only as a large `created`
 * count. Requiring the column inverts that: the failure mode of a forgotten
 * cutoff is an offering that ingests nothing and says so.
 *
 * THE UPPER BOUND IS OPTIONAL AND FAILS OPEN, ON PURPOSE. `application_deadline`
 * is the date already advertised to applicants, so honouring it stops an
 * always-on lead form minting applications into a closed edition forever. A
 * NULL deadline means no ceiling — the caller surfaces `windowEnd: null` so the
 * unbounded state is visible rather than assumed.
 *
 * An `intake_opens_at` that is non-null but unparseable is treated as no cutoff
 * for the same fail-closed reason. The column is timestamptz so PostgREST
 * cannot actually produce one; the branch exists so a schema change cannot turn
 * a bad value into an unbounded scan.
 */
export function resolveIntakeWindow(
  offering: IntakeWindowSource | null | undefined,
): IntakeWindow {
  const start = typeof offering?.intake_opens_at === "string" ? offering.intake_opens_at.trim() : "";
  if (!start || parseInstant(start) === null) {
    return { windowStart: null, windowEnd: null, skipReason: "no_cutoff" };
  }
  return {
    windowStart: start,
    windowEnd: endOfDeadlineDayIst(offering?.application_deadline),
    skipReason: null,
  };
}

/**
 * MAY THIS SUBMISSION BECOME A ROW AT ALL? Today that asks exactly one thing:
 * did the applicant FINISH the form?
 *
 * `cohort_applications.status` has no honest value for a half-filled form, so a
 * partial must never be inserted. Until FX-2 the only thing standing between a
 * partial and an insert was the `&filter=completed` query string on the Tally
 * URL — one character of a string literal, in a different file, unreachable by
 * any test — while `isCompleted` rode along on every submission object and was
 * never read. Anything that widened that URL (a debug edit, a copied fetch, a
 * Tally default change) would have ingested partials silently and correctly by
 * every check that existed. This is the code-side twin of that filter: it is
 * checked against the payload, so the guarantee no longer depends on a URL.
 *
 * It is `=== true`, not `!== false`: an absent flag is not a completion.
 */
export function isIngestableSubmission(
  submission: TallySubmission | null | undefined,
): boolean {
  return submission?.isCompleted === true;
}

/**
 * Is this submission inside the offering's intake window?
 *
 * FAIL-CLOSED AT THE LOWER BOUND BY DESIGN. One Tally form is reused across
 * editions — form `81dRPA` alone carries 880 historical completed submissions —
 * so a wrong "yes" fabricates hundreds of bogus applications. Therefore a
 * missing or unparseable `submittedAt` is OUT of window, and an unparseable
 * cutoff puts EVERYTHING out of window rather than ingesting history.
 *
 * Both boundaries are INCLUSIVE: `submittedAt === cutoff` and
 * `submittedAt === windowEnd` are in-window. Omitting `windowEndIso` (or
 * passing null) means no ceiling — see `resolveIntakeWindow` for why the two
 * ends fail in opposite directions, and for where `windowEnd` comes from.
 *
 * This is the single-row predicate: "may this row be ingested?", one answer for
 * every out-of-window cause. `partitionByCutoff` deliberately separates them,
 * because only an OLDER-than-cutoff row proves anything about the rows behind
 * it — see its note.
 */
export function isInIntakeWindow(
  submittedAt: string | null | undefined,
  cutoffIso: string | null | undefined,
  windowEndIso?: string | null,
): boolean {
  const submitted = parseInstant(submittedAt);
  if (submitted === null) return false;
  const cutoff = parseInstant(cutoffIso);
  if (cutoff === null) return false;
  if (submitted < cutoff) return false;
  const end = parseInstant(windowEndIso);
  if (end === null) return true;
  return submitted <= end;
}

/**
 * The newest-first, stop-on-first-out-of-window scan. Tally returns
 * submissions ordered newest-first (verified live), so the first submission
 * whose `submittedAt` is OLDER than the cutoff means every remaining one is
 * older too: collect what came before it and stop. `stoppedAtCutoff` tells the
 * caller it crossed the boundary and must not request another page.
 *
 * ONLY THE LOWER BOUND MAY EVER STOP THE SCAN. Two other kinds of row are out
 * of window here, and BOTH are skipped-and-counted instead, for the same
 * reason: neither proves anything about the rows behind it.
 *
 *   • AN UNDATED ROW. A missing or unparseable `submittedAt` is out of window
 *     (the brief: "treat as out-of-window, skip"), but it carries NO ordering
 *     information. Halting there would silently drop every genuinely in-window
 *     submission below it — on this run and every run after, with
 *     `stoppedAtCutoff` reading as the normal healthy value. Counted in
 *     `skippedUndated`.
 *   • A ROW ABOVE THE CEILING (FX-2.2), i.e. submitted AFTER
 *     `application_deadline`. Ordering makes this one worse, not better: the
 *     page is newest-FIRST, so post-deadline rows are the ones that arrive
 *     first. Treating the ceiling as a stop signal would halt on row 1 of page
 *     1 the moment an edition closes, ingest NOTHING from then on, and report
 *     the same healthy-looking `stoppedAtCutoff: true` while doing it — the
 *     undated hole, but reached on every closed edition rather than by a rare
 *     malformed row. Counted in `skippedAfterDeadline`, and the scan carries on
 *     down the page to the genuinely in-window rows underneath.
 *
 * So: only a row that PARSES and falls BEFORE the cutoff ends the scan. An
 * unusable cutoff stops everything up front rather than ingesting history —
 * same fail-closed direction as `isInIntakeWindow`. An unusable/absent
 * `windowEndIso` means no ceiling; `resolveIntakeWindow` reports that as
 * `windowEnd: null` so the unbounded state is visible to the caller.
 */
export function partitionByCutoff<T extends { submittedAt?: string | null }>(
  submissions: readonly T[] | null | undefined,
  cutoffIso: string | null | undefined,
  windowEndIso?: string | null,
): {
  inWindow: T[];
  skippedUndated: number;
  skippedAfterDeadline: number;
  stoppedAtCutoff: boolean;
} {
  const inWindow: T[] = [];
  let skippedUndated = 0;
  let skippedAfterDeadline = 0;

  const cutoff = parseInstant(cutoffIso);
  if (cutoff === null) {
    return { inWindow, skippedUndated, skippedAfterDeadline, stoppedAtCutoff: true };
  }
  const end = parseInstant(windowEndIso);

  for (const submission of submissions ?? []) {
    const submitted = parseInstant(submission?.submittedAt);
    if (submitted === null) {
      skippedUndated++;
      continue;
    }
    if (submitted < cutoff) {
      return { inWindow, skippedUndated, skippedAfterDeadline, stoppedAtCutoff: true };
    }
    if (end !== null && submitted > end) {
      skippedAfterDeadline++;
      continue;
    }
    inWindow.push(submission);
  }
  return { inWindow, skippedUndated, skippedAfterDeadline, stoppedAtCutoff: false };
}

// ── Row mapping + idempotency ──

/**
 * Keep the FIRST occurrence of each submission id. The poller re-scans the same
 * window every 15 minutes and a page boundary can repeat a row while the form
 * takes live traffic, so the same submission must never map to two rows within
 * one run. Submissions with no usable id are kept as-is (nothing to key on);
 * the DB's unique partial index on `tally_response_id` is the second line of
 * defence across runs.
 */
export function dedupeBySubmissionId<T extends { id?: string }>(
  submissions: readonly T[] | null | undefined,
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const submission of submissions ?? []) {
    const id = typeof submission?.id === "string" ? submission.id : "";
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    unique.push(submission);
  }
  return unique;
}

/** "" → null, so an unanswered optional question stores NULL rather than ''. */
function nullIfEmpty(value: string): string | null {
  return value ? value : null;
}

/**
 * One in-window submission → the exact `cohort_applications` insert payload,
 * or null when the submission carries no email (the webhook skips those too —
 * email is the join key for everything downstream).
 *
 * `status` is hard-coded to `'submitted'`; `full_name` falls back to the email
 * local-part exactly like `tally-application-webhook/index.ts:148`; the raw
 * submission is preserved in `tally_data` so a re-parse never needs Tally.
 */
export function toApplicationRow(
  submission: TallySubmission,
  questionMap: Record<string, string>,
  offeringId: string,
  userId: string | null,
): CohortApplicationRow | null {
  const answers = extractAnswers(submission, questionMap);
  const email = pickField(answers, FIELD_ALIASES.email);
  if (!email) return null;

  const fullName = pickField(answers, FIELD_ALIASES.fullName);
  return {
    offering_id: offeringId,
    user_id: userId,
    full_name: fullName || email.split("@")[0],
    email,
    phone: nullIfEmpty(pickField(answers, FIELD_ALIASES.phone)),
    city: nullIfEmpty(pickField(answers, FIELD_ALIASES.city)),
    occupation: nullIfEmpty(pickField(answers, FIELD_ALIASES.occupation)),
    bio: nullIfEmpty(pickField(answers, FIELD_ALIASES.bio)),
    status: "submitted",
    tally_response_id: typeof submission?.id === "string" ? submission.id : "",
    tally_data: submission,
  };
}
