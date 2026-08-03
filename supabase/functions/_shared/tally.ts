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
 * the form's informational blocks (`DENIED_LABEL`), an anchored demotion for a
 * NAMED third party's name / email / phone (`THIRD_PARTY_LABEL`), then
 * word-boundary scoring (`pickField`). The two paths can now legitimately
 * disagree on a pathological form, and when they do the poller is the one that
 * is right.
 *
 * AND ABOVE ALL OF THAT ENGLISH SITS THE ONE FACT THE ENVELOPE STATES: the
 * block TYPE. `questions[].type` says outright that "Your Email ID" is an
 * `INPUT_EMAIL` and that every FAQ decoy is a `MULTIPLE_CHOICE`, and the parser
 * used to throw it away and then try to re-derive it from word order. Three fix
 * rounds each closed one direction and opened another, because no alias
 * ordering can both beat a prose decoy ("Can we add your email to the
 * newsletter?" → "Yes") and lose to a bare "Name" against "Full name of my
 * mentor". `buildQuestionTypeMap` + `extractAnswerTypes` preserve the type,
 * `TYPE_ALLOWLIST` states each field's preference, and `pickField` ranks by type
 * BEFORE any English signal. The vocabulary below is not obsolete — type cannot
 * separate an `INPUT_EMAIL` "Your Email ID" from an `INPUT_EMAIL` "Referrer
 * email", and that is precisely what the vocabulary is for.
 *
 * NOTHING HERE MAY BE TUNED TO ONE FORM. The poller walks EVERY staged offering
 * carrying a `tally_form_url` — one form per offering — so every rule in this
 * file also governs cohort forms nobody has read. A rule that is merely
 * belt-and-braces on `81dRPA` can be the thing that NULLs a real column
 * elsewhere, or, if it silences the email label, drops the whole submission
 * (`toApplicationRow` returns null without an email). That is why the deny-list
 * is anchored to whole labels instead of loose substrings, why the
 * personalisation token is normalised away rather than deny-listed, why a
 * referrer's field is scored LAST rather than refused outright, and why the
 * only vocabulary in this file that can move a label names THIRD PARTIES —
 * never applicants — so that everything it fails to recognise keeps exactly the
 * ranking it had before the rule existed.
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

/**
 * An entry of the envelope's `questions[]`. `title` may contain HTML or be empty.
 *
 * `type` IS THE BLOCK TYPE TALLY AUTHORED, and it is the one signal on this
 * wire that is a FACT rather than an inference: `INPUT_EMAIL`, `INPUT_NUMBER`,
 * `INPUT_PHONE_NUMBER`, `INPUT_TEXT`, `TEXTAREA`, `DROPDOWN`,
 * `MULTIPLE_CHOICE`, `CHECKBOXES`, `HIDDEN_FIELDS`, plus the layout blocks
 * (`TITLE`, `DIVIDER`, …). It is deliberately typed as a bare string, not a
 * union: Tally can add a block type without asking us, and an unknown type must
 * degrade to "no preference" rather than fail to compile or throw.
 * `buildQuestionTypeMap` is the reader; `TYPE_ALLOWLIST` is what it buys.
 */
export interface TallyQuestion {
  id?: string;
  title?: string | null;
  type?: string | null;
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
  /**
   * Set true ONLY by the intake's identity-provisioning step (phase SP), and
   * for ALL THREE collision shapes — the email belongs to an existing account
   * (`email_taken`), the phone does (`phone_taken`), or the two belong to
   * DIFFERENT accounts (`cross_linked`). Intake proves neither identifier, so
   * every one of them would be a merge on the strength of a form answer. The
   * row is inserted with `user_id` NULL and waits for an interactive
   * second-channel OTP claim; nothing is minted and nothing is joined.
   *
   * Optional because `toApplicationRow` never sets it: the column defaults to
   * false, so an ordinary row omits it entirely. That keeps ORDINARY inserts
   * working against a database where the column has not landed — a collision
   * row does name it, so the migration must precede the function deploy.
   */
  pending_claim?: boolean;
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
 *   - `fullName` / `email` / `phone` now LEAD WITH THE APPLICANT'S OWN
 *     POSSESSIVE FORM, ahead of the bare noun (fix round 2, finding 1). A
 *     third-party label — "Name of referrer", "Email ID of the person who
 *     referred you", "Phone number of your reference" — STARTS with the generic
 *     alias and so scores `TIER_PREFIX`, whereas the applicant's own "Your
 *     Email ID" can only ever score `TIER_WORD`. Tier outranks position, so the
 *     referrer's answer won in BOTH question orderings, deterministically — a
 *     regression against the old `includes()` matcher, which was at least right
 *     whenever the applicant's field came first. ALIAS PRIORITY IS THE ONLY
 *     LEVER IN THESE LISTS THAT CAN OUTRANK A `TIER_PREFIX` THIRD-PARTY LABEL:
 *     it is scored ABOVE tier, so the specific alias settles the group before
 *     the tier comparison is ever reached (the same reason `designation` leads
 *     `what do you do`). It matters most on `email`, which is the
 *     `(offering_id, email)` dedupe key, the users-join key and the reminder
 *     recipient — and the poller never UPDATEs a row, so one wrong pick is
 *     permanent and hides the application from the person who filed it.
 *     Every real `81dRPA` label is a `TIER_WORD` hit, so the defect was inert
 *     there and the real-envelope fixture could not see it. That is precisely
 *     the failure mode "NOTHING HERE MAY BE TUNED TO ONE FORM" exists to catch.
 *   - THE POSSESSIVE FORM IS THE ONLY THING PROMOTED, and the rest of each
 *     group stays in bare-noun-first order. Promoting an alias the applicant's
 *     own label does NOT contain hands the group to whatever third-party label
 *     does contain it, before tier or position is ever consulted — the same
 *     mechanism, pointed the wrong way. Two earlier cuts of this very fix
 *     proved it: `full name` ahead of `name` filed "Full name of <someone
 *     else>" as the applicant on any form asking a bare "Name", and `phone
 *     number` ahead of `phone` filed "<someone else>'s phone number" over a
 *     bare "Phone" — both order-independent, both the exact defect the
 *     possessive lead exists to close. `full name` and `phone number` therefore
 *     sit AFTER their bare nouns, where they are still reachable as the floor
 *     when the bare-noun candidate is present but blank. This ordering is what
 *     protects the forms `THIRD_PARTY_LABEL` does NOT recognise — "Full name of
 *     my mentor", "Alternate phone number" — which is most of them.
 *   - ALIAS ORDER CANNOT DO THE WHOLE JOB, and what it cannot do is bounded and
 *     known. It needs the applicant's label to CONTAIN the possessive, so an
 *     applicant who is asked a bare "Email Address" gives it nothing to lead
 *     with, and against "Email ID of the person who referred you" that ties at
 *     `TIER_PREFIX` and is then settled by question position — the referrer's
 *     way, on the usual form, because the referral block is usually asked
 *     first. It is equally powerless over a third party worded as a bare
 *     compound ("Referrer email"), which ties a mid-label applicant hit
 *     ("Contact email") and wins the same way. `THIRD_PARTY_LABEL` exists for
 *     that residual and for nothing else, and only for the roles it can name.
 *     It scores a NAMED third party's field LAST instead of denying it, so no
 *     label is ever removed: the cost of a deny that over-matches on `email` is
 *     not a NULL column but a DROPPED submission (`toApplicationRow` returns
 *     null without an email), on every cohort form the poller scans including
 *     the ones nobody has read.
 * `city` is deliberately NOT led with "your city". It has no observed
 * third-party twin, and the group's pinned behaviour is the opposite one:
 * "City of residence" is meant to beat a bare "Your city" on tier.
 */
export const FIELD_ALIASES = {
  // BARE NOUN AHEAD OF ITS COMPOUND — deliberately, and pinned by test. Putting
  // "full name"/"phone number" first hands the group to a third party's compound
  // ("Full name of my mentor", "Alternate phone number") over a plainly-worded
  // "Name"/"Phone". The mirror defect — an FAQ or prose label tying with the
  // real field on the bare noun — is closed structurally by the question TYPE,
  // not by alias order: see TYPE_MULTIPLE_CHOICE, which EXCLUDES that whole
  // class rather than out-ranking it. Reordering this list trades one defect for
  // the other and is not the lever.
  fullName: ["your name", "name", "full name"],
  email: ["your email", "email"],
  phone: ["your whatsapp", "your phone", "phone", "phone number", "mobile", "whatsapp"],
  city: ["city", "location"],
  occupation: ["occupation", "profession", "designation", "what do you do"],
  bio: ["write your heart", "100 words", "about you", "bio", "tell us"],
} as const;

/** Every group in `FIELD_ALIASES`, i.e. the six identity fields the poller maps. */
export type FieldKey = keyof typeof FIELD_ALIASES;

/**
 * THE ONE BLOCK TYPE THAT CAN NEVER BE AN IDENTITY FIELD.
 *
 * A `MULTIPLE_CHOICE` block is a question the form OWNER wrote the answers to.
 * Nobody's name, email, phone, city, job title or 100-word essay is ever one, on
 * any form — the applicant picks from a list somebody else authored. Every decoy
 * that cost this file three fix rounds is one of these: the FAQ blocks ("How
 * does the academy work week to week?"), the curriculum blurb, the grant opt-in
 * ("Select one"), and the prose consent question whose answer is "Yes" ("Can we
 * add your email to the newsletter?"). Excluding the type kills the whole class
 * structurally, in every question ordering, without one word of English — which
 * is what no alias ordering could do, because the alias ordering that beats the
 * prose decoy is the same one that hands "Name" to "Full name of my mentor".
 */
const TYPE_MULTIPLE_CHOICE = "MULTIPLE_CHOICE";

/**
 * PREFERRED BLOCK TYPES PER FIELD GROUP, best first — a TIE-BREAK, not a filter
 * and not a rank above the English signals. Every type here is a real Tally
 * block type; anything Tally invents later, or omits, simply sorts last.
 *
 * WHERE IT SITS IN THE KEY, AND WHY THAT IS THE ONLY SAFE PLACE. A block type
 * states what a question COLLECTS. It says nothing whatever about WHOSE answer
 * it holds — so the moment it is allowed to outrank alias priority or match
 * tier, it starts handing identity fields to other people. Measured, in BOTH
 * question orderings, on the cut of this file that ranked type first:
 *   - `INPUT_EMAIL` "Email of my mentor" beat `INPUT_TEXT` "Your Email ID";
 *   - `INPUT_EMAIL` "Colleague email" beat `INPUT_TEXT` "Email Address";
 *   - `INPUT_EMAIL` "Alternate email address" beat `INPUT_TEXT` "Your Email ID";
 *   - `INPUT_TEXT` "Full name of my mentor" beat `DROPDOWN` "Name";
 *   - `INPUT_TEXT` "Shoot location preference" beat the `DROPDOWN` that was
 *     literally the city question.
 * The pre-type English key got every one of those RIGHT, in both orderings, and
 * the first three are on `email` — the permanent `(offering_id, email)` dedupe
 * key, where a wrong pick hides the real applicant under RLS forever. None of
 * the roles involved is one `THIRD_PARTY_LABEL` names, and no vocabulary can
 * name them all, so this is not fixable by extending that list. The fix is to
 * consult the type only where the English signals are SILENT.
 *
 * A DELIBERATE DEVIATION FROM THE BRIEF, RECORDED SO IT IS NOT RE-INHERITED.
 * The brief specifies `(typeRank, ownFieldFirst, aliasIndex, matchTier,
 * questionOrder)`, "type outranks every English signal". That literal ordering
 * is what produced the five regressions above; the shipped key applies the
 * preference one step ABOVE question order instead. What the brief actually
 * needed from the type channel — retiring the FAQ / prose / "Yes" decoy class in
 * every ordering — is delivered in full by `TYPE_MULTIPLE_CHOICE`, which is an
 * EXCLUSION and answers to no ranking at all.
 *
 * WHAT THE PREFERENCE STILL BUYS, WHICH IS REAL. Where two labels tie under the
 * same alias at the same tier, the winner used to be whichever question the form
 * asked first: a coin toss, and historically the single largest source of "right
 * in one ordering, wrong in the other". The block type now settles those, so the
 * two orderings of a form agree — "Occupation category" (`DROPDOWN`) loses to
 * "Occupation (as printed on your card)" (`INPUT_TEXT`), "Tell us your website"
 * (`INPUT_TEXT`) loses to "Tell us your story" (`TEXTAREA`).
 *
 * KEYED OFF THE FIELD GROUP, NOT GLOBAL, AND THAT IS LOAD-BEARING. `DROPDOWN` is
 * simultaneously `city`'s second preference (forms do ask for a city from a
 * list) and `occupation`'s demoted decoy type — the live form's
 * "@Your name, What do you do?" is a coarse `DROPDOWN` bucket while the real
 * "What is your most recent designation?" is `INPUT_TEXT`. One global type
 * ranking cannot say both things at once, so the preference is per group.
 *
 * `phone` LISTS THREE TYPES, DEDICATED BLOCK FIRST. `INPUT_PHONE_NUMBER` is what
 * a Tally author gets when they pick "Phone number", `INPUT_PHONE` is carried as
 * a defensive alias for the same idea, and `INPUT_NUMBER` is the GENERIC number
 * block — which is what the live form happens to use, but also what a room count
 * or a year of experience uses. Where a form offers both, the dedicated block is
 * the better statement, so the generic one sorts last of the three. Listing only
 * one would leave every phone-typed form with no tie-break at all. The live form
 * is unmoved either way: its only number question is won on the alias
 * "your whatsapp" long before any tie-break is reached.
 *
 * WHAT THIS DOES NOT DO: it cannot separate two candidates of the SAME type —
 * an `INPUT_EMAIL` "Your Email ID" against an `INPUT_EMAIL` "Referrer email" is
 * a tie here by construction. That is exactly what `THIRD_PARTY_LABEL`, the
 * deny-list and the possessive rule are still for, and why none of them was
 * deleted when this arrived.
 */
export const TYPE_ALLOWLIST: Record<FieldKey, readonly string[]> = {
  fullName: ["INPUT_TEXT"],
  email: ["INPUT_EMAIL"],
  // Tally's dedicated phone blocks first; the generic number block last.
  phone: ["INPUT_PHONE_NUMBER", "INPUT_PHONE", "INPUT_NUMBER"],
  city: ["INPUT_TEXT", "DROPDOWN"],
  // A tie between the free-text designation and the coarse "What do you do?"
  // bucket goes to the free text. On the live form alias order settles it first
  // ("designation" is declared ahead of "what do you do"), so this is the floor,
  // not the defence.
  occupation: ["INPUT_TEXT", "DROPDOWN"],
  bio: ["TEXTAREA", "INPUT_TEXT"],
};

/** Types are compared case-insensitively and trimmed; anything else is "unknown". */
function normalizeType(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

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
 * `questions[]` → `{questionId: BLOCK_TYPE}`, the sibling of `buildQuestionMap`.
 *
 * ADDITIVE ON PURPOSE. `buildQuestionMap` keeps returning `Record<id,label>` and
 * every existing caller and test keeps working unchanged; the type arrives
 * beside it, so a caller that does not care never has to know. That also makes
 * the fail-soft path free: a caller that passes no type map gets exactly the
 * pre-type behaviour.
 *
 * IT MUST HAVE THE IDENTICAL KEY SET TO `buildQuestionMap`, and both drops are
 * repeated verbatim to keep it so: no string `id` → dropped, and a `title` that
 * cleans to nothing → dropped. Those two are what remove the real form's ten
 * `HIDDEN_FIELDS` rows (the attribution fields, `title: null`) and Tally's
 * layout blocks. If this map kept a row the label map dropped, a hidden field
 * would regain a type entry and the two maps would disagree about what the form
 * even asked — pinned by test in both directions.
 *
 * A QUESTION WITH NO USABLE TYPE STORES `""`, NOT NOTHING. Same reason: the key
 * sets must match. `""` reads downstream as "unknown type", which is the
 * fail-soft rank, so an envelope from a Tally that has stopped sending `type`
 * degrades to the old behaviour instead of losing the question.
 */
export function buildQuestionTypeMap(
  questions: TallyQuestion[] | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const q of questions ?? []) {
    const id = typeof q?.id === "string" ? q.id : "";
    if (!id) continue;
    const title = stripHtml(q?.title);
    if (!title) continue;
    map[id] = normalizeType(q?.type);
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
 * THE TYPE SIDE OF THE JOIN: `{cleanLabel: BLOCK_TYPE}`, keyed EXACTLY like
 * `extractAnswers`' result, so `pickField` can read a candidate's type with the
 * same key it reads its value with. This is what "carry a type alongside each
 * `{label, value}` candidate" means here — a sibling map rather than a widened
 * return, for the same reason `buildQuestionTypeMap` is a sibling: ~90 existing
 * call sites read `answers[label]` as a plain string.
 *
 * IT NEEDS NO SUBMISSION. A question's type is a property of the FORM, not of
 * one response, so this is a pure re-key of the two question maps. Emitting a
 * type for a label that this submission happens not to answer is harmless:
 * `pickField` only ever looks up labels that are present in `answers`.
 *
 * A DUPLICATED LABEL WITH TWO DIFFERENT TYPES YIELDS "UNKNOWN", NOT THE FIRST
 * ONE. Two questions can clean to the same title (the same field asked again on
 * a later page), and `extractAnswers` collapses them to one entry whose value is
 * the first NON-EMPTY answer — which may well have come from the second
 * question. Taking the first type would then be a guess, and a guess in the
 * wrong direction is expensive in one specific way: if the first were a
 * `MULTIPLE_CHOICE` the label would be struck out entirely and a real email
 * could be lost, dropping the whole submission. Ambiguity therefore resolves to
 * `""` — "this form did not tell us" — which is the fail-soft rank, i.e. exactly
 * the ranking the label would have had before any of this existed.
 */
export function extractAnswerTypes(
  questionMap: Record<string, string>,
  questionTypeMap: Record<string, string> | null | undefined,
): Record<string, string> {
  const types: Record<string, string> = Object.create(null);
  if (!questionTypeMap) return types;
  for (const [qid, label] of Object.entries(questionMap)) {
    if (!label) continue;
    const type = hasOwn(questionTypeMap, qid) ? normalizeType(questionTypeMap[qid]) : "";
    const existing = types[label];
    if (existing === undefined) types[label] = type;
    else if (existing !== type) types[label] = "";
  }
  return types;
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
 * A NAMED THIRD PARTY'S NAME / EMAIL / PHONE — scored LAST rather than denied.
 *
 * A cohort form that asks for a referrer, a reference or a guardian asks for
 * the SAME nouns as the applicant's own fields: "Name of referrer", "Email ID
 * of the person who referred you", "Phone number of your reference",
 * "Guardian's name". Those all START with, or contain, the generic alias, so
 * they compete directly with the applicant's own label and can beat it on tier
 * or on question position. Leading the alias lists with the applicant's
 * possessive form settles the pairs where the applicant's own label says
 * "your"; it can do nothing at all when the applicant is asked a bare "Email
 * Address", which is what this pass is for.
 *
 * THE VOCABULARY NAMES THIRD PARTIES, NEVER APPLICANTS, AND THAT DIRECTION IS
 * THE WHOLE POINT. An earlier cut of this rule matched `^<noun> of` and then
 * carved out an APPLICANT vocabulary (`applicant|candidate|participant|
 * student|you`). Any such list is incomplete, and its incompleteness DEMOTED
 * REAL APPLICANTS: "Email of the filmmaker", "Name of the delegate", "Email ID
 * of the person applying" all fell out of the first sweep and lost — in both
 * question orderings — to a genuine "Referrer email" the rule never recognised.
 * That was a fresh regression on the `(offering_id, email)` dedupe key, and it
 * was the same "tuned to one form" defect the rule was written to fix, pointed
 * the other way. Naming the third party instead inverts the failure mode: a
 * role this list has never heard of is simply not demoted, and the form ranks
 * exactly as it would if this rule did not exist — literally so: when nothing
 * on a form matches, `ownFields` IS `candidates` and `pickField` reduces to the
 * single sweep it was before. Under-reach therefore costs nothing that was not
 * already there; over-reach is what has to be guarded, and is.
 *
 * A DEMOTION, NOT A DENY. `pickField` runs its alias search over the
 * non-third-party labels FIRST and repeats it over every label only when that
 * sweep matched no label at all, so a matched label is never removed — it is
 * simply the last thing anyone asks. Over-reach therefore costs a re-rank on a
 * form that has another candidate, instead of a NULL column, or a DROPPED
 * submission outright when the label silenced is the email one
 * (`toApplicationRow` returns null without an email). That matters because this
 * runs against every cohort form the poller scans, including the ones nobody
 * here has read.
 *
 * ANCHORED, AND SELF-SCOPING TO NAME / EMAIL / PHONE. Both patterns are pinned
 * to the start of the label and both require an identity noun, so they can only
 * ever describe a label those three groups could match: `city`, `occupation`
 * and `bio` are untouched by construction, including the pinned "City of
 * residence" and the "Tell us who referred you" essay decoy — a loose
 * `\breferr(er|ed)\b` would have taken both of those with it.
 *
 * WHAT IT DOES NOT CATCH, AND WHO LOSES WHEN IT DOES NOT. Only the roles below,
 * in only two shapes. An unlisted role ("Name of your mentor", "Colleague
 * email") or an unlisted shape ("Name — reference") is decided by alias, then
 * tier, then block type, then question order, essentially as it was before this
 * rule existed. BE CLEAR THAT THIS IS NOT ALWAYS HARMLESS: when the applicant's
 * own label is a mid-label hit ("Legal name") and the unrecognised third-party
 * label is a prefix hit ("Name of my mentor"), the third party still wins, in
 * both orderings. There is no rule that separates those two by structure
 * alone — only a vocabulary, and every vocabulary is incomplete — so the
 * guarantee this file makes is deliberately narrow: a RECOGNISED third-party
 * label cannot outrank the applicant's own field, and an unrecognised one is
 * decided by the same key as everything else.
 *
 * STATE THE TYPE LAYER'S EFFECT ON THAT SENTENCE EXACTLY, BECAUSE AN EARLIER
 * ROUND OVERSTATED IT. Block type is consulted only where alias and tier tie
 * (see `TYPE_ALLOWLIST`), so it can never PROMOTE an unrecognised third party
 * over an applicant label that matched an earlier alias or a better tier — the
 * defect that ranking type first shipped, on `email`, in both orderings. What it
 * can still do is settle a genuine tie: an `INPUT_EMAIL` "Mentor email" against
 * an `INPUT_TEXT` "Contact email" both match `email` mid-label, and the type now
 * decides it for the mentor in BOTH orderings where question order used to
 * decide it either way depending on which was asked first. That is a coin toss
 * replaced by a signal that is right on the average form and wrong on that one,
 * traded for an answer that no longer depends on the order the form asks its
 * questions in. It is the residual, it is bounded to exact ties, and it is the
 * whole of what the type channel costs here.
 *
 * Matched against the CLEANED, normalised, mention-stripped label, exactly like
 * `DENIED_LABEL` — never the raw title.
 */
const IDENTITY_NOUN =
  "(?:full name|name|e-?mail(?: id| address)?|phone(?: number)?|mobile(?: number)?|whatsapp(?: number)?|contact number)";
/**
 * Roles that CANNOT be the applicant. `nominee`, `delegate`, `candidate` and
 * friends are deliberately absent: on a nomination or institutional form those
 * name the person the application is FOR.
 */
const THIRD_PARTY_ROLE =
  "(?:referrers?|referees?|references?|person who referred you|guardians?|parents?|father|mother|spouse|emergency(?: contact)?|next of kin)";
/** Leading determiners, so "of your reference" reads the same as "of reference". */
const ROLE_DETERMINER = "(?:the |your |a |an |their |his |her )*";

const THIRD_PARTY_LABEL: readonly RegExp[] = [
  // "Email ID of the person who referred you", "Phone number of your reference"
  new RegExp(`^${IDENTITY_NOUN} of ${ROLE_DETERMINER}${THIRD_PARTY_ROLE}\\b`),
  // "Referrer email", "Guardian's full name", "Emergency contact number"
  new RegExp(`^${ROLE_DETERMINER}${THIRD_PARTY_ROLE}(?:['’]s|s['’])? ${IDENTITY_NOUN}\\b`),
];

function isThirdPartyLabel(label: string): boolean {
  for (const pattern of THIRD_PARTY_LABEL) {
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
 * One label/value pair that survived the deny-list and the `MULTIPLE_CHOICE`
 * exclusion, carrying the one thing the envelope states about it: where its
 * block type sits in this field group's `TYPE_ALLOWLIST` (`prefer.length`, the
 * fail-soft rank, when the type is unknown, absent, unpreferred — or when the
 * answer is blank, which is never promoted by its type; see `pickField`).
 */
interface Candidate {
  label: string;
  value: string;
  typeRank: number;
}

/**
 * One full alias sweep over a candidate set — see the score key on `pickField`,
 * which owns the two sweeps and the rationale.
 *
 * `matched` IS NOT `!!value`. It says whether any label in this set answered
 * for any alias in the group AT ALL, blank answer included, which is the only
 * way `pickField` can tell "this form never asked the applicant for an email"
 * from "it asked and they left it empty". The two must not lead to the same
 * place: only the first may fall through to somebody else's field.
 */
function selectByAlias(
  candidates: readonly Candidate[],
  aliases: readonly string[],
): { value: string; matched: boolean } {
  let matched = false;
  for (const alias of aliases) {
    const needle = normalizeLabel(alias);
    /**
     * A POSSESSIVE ALIAS MAY ONLY WIN WHERE THE LABEL ACTUALLY STARTS WITH IT.
     *
     * Aliases are iterated OUTERMOST, so alias index outranks tier by
     * construction: the first alias to match anything returns. That is right for
     * "your email" vs "email" when the possessive identifies the applicant's own
     * field ("Your Email ID" — TIER_PREFIX) — and catastrophically wrong when the
     * possessive merely appears mid-prose. "Can we add your email to the
     * newsletter?" is a TIER_WORD hit for "your email", so it beat the
     * applicant's bare "Email" (TIER_PREFIX) and filed the answer — "Yes" — as
     * the email. That is the PERMANENT WRONG IDENTITY class: email is the
     * `(offering_id,email)` dedupe key and the users-join key, and this poller
     * never updates a row, so the real applicant is hidden under RLS forever.
     *
     * Restricting possessives to TIER_EXACT/TIER_PREFIX means a possessive can
     * only ever speak for a label that LEADS with it. When it appears mid-prose
     * the sweep falls through to the bare alias — i.e. exactly the behaviour
     * before possessives were introduced — so no new ordering is representable.
     * Every live `81dRPA` label is unaffected: all three possessive hits there
     * ("Your name", "Your Email ID", "Your Whatsapp Number") are at index 0.
     */
    const possessiveOnly = needle.startsWith("your ");
    let bestTier = TIER_NONE;
    let bestTypeRank = Number.POSITIVE_INFINITY;
    let bestValue = "";
    for (const candidate of candidates) {
      const tier = aliasMatchTier(candidate.label, needle);
      if (tier === TIER_NONE) continue;
      if (possessiveOnly && tier === TIER_WORD) continue;
      /**
       * THE BLOCK TYPE IS THE LAST THING ASKED BEFORE QUESTION ORDER, and only
       * that. Tier first, so a better English match always wins; then the
       * `TYPE_ALLOWLIST` rank, which turns what used to be "whichever question
       * the form asked first" into a decision both orderings agree on; then, on
       * a full tie, the earlier question, exactly as before. Ranking the type
       * any higher than this hands `email` to "Colleague email" (see
       * `TYPE_ALLOWLIST`), so the comparison is deliberately lexicographic on
       * `(tier, typeRank)` and strictly-better-only in both components.
       */
      if (tier > bestTier) continue;
      if (tier === bestTier && candidate.typeRank >= bestTypeRank) continue;
      bestTier = tier;
      bestTypeRank = candidate.typeRank;
      bestValue = candidate.value;
    }
    if (bestTier !== TIER_NONE) matched = true;
    if (bestValue) return { value: bestValue, matched: true };
  }
  return { value: "", matched };
}

/**
 * The QUESTION-TYPE channel for `pickField`, supplied as an OPTIONAL third
 * argument so the two load-bearing positions never move: ~90 existing call sites
 * pass a plain object literal and nothing else, and each of them is also the
 * proof that an UNTYPED form still resolves by the pre-type rules.
 */
export interface FieldTypePreference {
  /** label → block type, exactly as `extractAnswerTypes` keys it. */
  types?: Record<string, string> | null;
  /** Preferred types, best first — one `TYPE_ALLOWLIST` entry. */
  prefer?: readonly string[] | null;
}

/**
 * Scored alias match over joined answers. "" when nothing matches.
 *
 * THE SCORE KEY IS `(ownFieldFirst, aliasIndex, matchTier, typeRank,
 * questionOrder)`. The third-party demotion is asked first, then the English
 * signals in the order they have always run, then — where those TIE — the Tally
 * block type, and only then the position of the question on the form.
 *
 * WHY `typeRank` SITS THERE AND NOT AT THE TOP, WHICH IS A DELIBERATE DEVIATION
 * FROM THE BRIEF. The brief specifies `(typeRank, ownFieldFirst, aliasIndex,
 * matchTier, questionOrder)`, "type outranks every English signal". Shipped that
 * way, an `INPUT_EMAIL` question belonging to somebody else beat the applicant's
 * own `INPUT_TEXT` email question in BOTH orderings for every role
 * `THIRD_PARTY_ROLE` does not name — "Email of my mentor", "Colleague email",
 * "Alternate email address" — each of which the pre-type code got right, and
 * each of which is the permanent `(offering_id, email)` dedupe key. The same
 * shape broke the brief's own pinned counter-case as soon as the types differed
 * (`INPUT_TEXT` "Full name of my mentor" over `DROPDOWN` "Name") and demoted a
 * `DROPDOWN` city under any `INPUT_TEXT` that merely says "location". A block
 * type states what a question COLLECTS and nothing about WHOSE answer it holds,
 * so it cannot be allowed to overrule a signal that does. See `TYPE_ALLOWLIST`
 * for the full measured list.
 *
 * WHAT THE BRIEF WANTED FROM THE TYPE IS DELIVERED BY THE EXCLUSION, NOT BY THE
 * RANK. `MULTIPLE_CHOICE` is dropped outright alongside the deny-list, before
 * any ranking, and stays dropped on every path — which is what actually retires
 * all three historical decoy classes in every ordering (see
 * `TYPE_MULTIPLE_CHOICE`). The preference below is the residual: a tie-break
 * that replaces "whichever question the form happened to ask first" with a
 * statement the form made.
 *
 * A BLANK ANSWER IS NEVER PROMOTED BY ITS TYPE. A candidate with no answer takes
 * the fail-soft rank whatever its block type, so it can only win where the
 * pre-type English key would have let it win anyway. Without that rule an
 * optional "Work email" (`INPUT_EMAIL`, left empty) outranks the applicant's
 * filled "Email Address" (`INPUT_TEXT`) on a tie, `pickField` returns "", and
 * `toApplicationRow` DROPS a submission the pre-type code ingested correctly.
 * The type layer exists to rank answers the form actually collected; an empty
 * one carries no evidence to rank.
 *
 * FAIL-SOFT IS THE DEFAULT, NOT AN EXCEPTION. Every candidate whose type is
 * unknown, absent, or simply not one this group prefers takes the LAST rank, so
 * a form that sends no types at all has every candidate at one rank and the key
 * collapses to exactly the pre-type one. The poller walks forms nobody here has
 * read; it must not return empty because a form is shaped oddly.
 *
 * The whole ranked sweep runs over the applicant's own labels first
 * and is repeated over every label only when that sweep matched NO label at all
 * (see `THIRD_PARTY_LABEL`), so a RECOGNISED third-party label — "Email ID of
 * the person who referred you", "Referrer email" — cannot beat the applicant's
 * own field however well it scores, in either question ordering AND at any block
 * type, while still answering for a form where it is the only email on offer.
 *
 * STATE THAT GUARANTEE EXACTLY, BECAUSE IT IS NARROWER THAN IT SOUNDS. It holds
 * for the wordings `THIRD_PARTY_LABEL` recognises, and no vocabulary is
 * complete; an unrecognised one ("Name of my mentor") competes on alias, tier,
 * type and position like any other label, and can win — including on the type
 * tie-break, which is the one place this layer can move an unrecognised third
 * party (`THIRD_PARTY_LABEL` records that residual in full). What the two sweeps
 * do buy
 * unconditionally is that a recognised third-party label never wins by
 * DEFAULT — including when the applicant's own question exists but was left
 * blank. Sweep 2 is gated on "the applicant's labels said nothing for this
 * group", not on "sweep 1 produced no value", so a non-required "Your Email ID"
 * submitted empty yields "" and the submission is skipped
 * (`toApplicationRow` returns null without an email) rather than being filed
 * under the referrer's address. That trade is deliberate: a skipped submission
 * is visible and re-pollable, whereas a wrong email is the permanent
 * `(offering_id, email)` dedupe key, the users-join key and the reminder
 * recipient, and the poller never UPDATEs a row it has already written.
 *
 * Within one sweep, alias priority outranks match quality, which outranks the
 * block type, which outranks position:
 *   1. aliases are tried in their declared order, and the first alias that
 *      yields a non-empty answer wins outright;
 *   2. within one alias, the best TIER wins — exact label, then label starts
 *      with the alias (at a word boundary), then the alias appears as a whole
 *      word anywhere in the label;
 *   3. within one alias AND one tier, the best `TYPE_ALLOWLIST` rank wins —
 *      the only thing the type channel decides, and the reason two orderings of
 *      the same form now agree where they used to disagree;
 *   4. within one alias, one tier AND one type rank, the EARLIEST question wins
 *      (see the ordering note on `extractAnswers` — key order is question order).
 * Alias priority has to come first, and the live form proves it: "@Your name,
 * What do you do?" (question 13) and "What is your most recent designation?"
 * (question 14) are both whole-word hits for the occupation group. Scoring tier
 * first and breaking the tie by position would pick the coarse dropdown bucket
 * ("Entrepreneur/Founder") over the applicant's actual job title purely because
 * the form asks it one question earlier.
 *
 * AN EMPTY ANSWER FALLS THROUGH TO THE NEXT ALIAS, NOT THE NEXT LABEL, AND NOT
 * TO THE NEXT SWEEP. Exactly one label — the alias's best-scoring candidate —
 * ever answers for a given alias. If that candidate's answer is blank, the
 * search moves on to the next ALIAS and the runner-up is never consulted, in
 * either direction; and when the whole group is exhausted that way, the result
 * is "", never a demoted label's answer.
 *
 * BE CLEAR ABOUT WHAT THAT DOES NOT BUY. It bounds the damage of a collision
 * (only one label per alias can ever speak) but it does not RESOLVE one: when
 * two labels score identically under the same alias, the winner is the better
 * block type and then the earlier question, and the loser is ignored whether it
 * is blank or not. So "tell us" prefix-matches both "Tell us about yourself" and
 * "Tell us who referred you", and which of them answers for `bio` comes down to
 * their block types, or to which the form asks first when those agree too. The
 * defences against that are alias tuning, the deny-list and the
 * third-party sweep, not this rule — which is why the bio group leads with
 * "write your heart" and "100 words", the labels the live form actually uses,
 * and why the name / email / phone groups lead with the applicant's own
 * possessive form rather than the bare noun a third-party label would
 * prefix-match.
 *
 * Before any of this runs each label is normalised, has any piped
 * personalisation prefix removed (`MENTION_PREFIX`), is dropped outright if it
 * is an informational block (`DENIED_LABEL`), and is flagged as a named third
 * party's field if it reads as one (`THIRD_PARTY_LABEL`).
 *
 * This is NOT the webhook's matcher — see the divergence note in the file
 * header for why the poller has to be stricter than `tally-application-webhook`.
 */
export function pickField(
  answers: Record<string, string>,
  aliases: readonly string[],
  preference?: FieldTypePreference | null,
): string {
  const types = preference?.types ?? null;
  const prefer = (preference?.prefer ?? []).map(normalizeType).filter(Boolean);

  // The fail-soft rank sits one past the last preferred type and holds
  // everything else — unknown types, absent types, types this group has no
  // opinion on, and every blank answer. With no types at all every candidate
  // takes it, the tie-break is a constant, and the key collapses to the pre-type
  // one. Both sweeps rank identically; only their membership differs.
  const failSoftRank = prefer.length;
  const everyField: Candidate[] = [];
  const ownFields: Candidate[] = [];
  let hasThirdParty = false;

  for (const [rawLabel, value] of Object.entries(answers)) {
    const label = normalizeQuestionLabel(rawLabel);
    if (!label || isDeniedLabel(label)) continue;
    // The caller's `types` is a plain object like the question map, so the same
    // own-property rule applies: a label of "toString" must read as unknown.
    const type = types && hasOwn(types, rawLabel) ? normalizeType(types[rawLabel]) : "";
    if (type === TYPE_MULTIPLE_CHOICE) continue;
    // A blank answer is never promoted by its type (see the score key above).
    const preferredRank = value && type ? prefer.indexOf(type) : -1;
    const candidate: Candidate = {
      label,
      value,
      typeRank: preferredRank < 0 ? failSoftRank : preferredRank,
    };
    everyField.push(candidate);
    if (isThirdPartyLabel(label)) hasThirdParty = true;
    else ownFields.push(candidate);
  }

  // Sweep 1 — the applicant's own labels. Sweep 2 only happens on a form that
  // carries a recognised third-party label AND never asked the applicant this
  // group at all; an asked-but-blank answer stays blank rather than falling
  // through to somebody else's (see the score key).
  const own = selectByAlias(ownFields, aliases);
  if (own.matched) return own.value;
  if (!hasThirdParty) return "";
  return selectByAlias(everyField, aliases).value;
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
 *
 * `questionTypeMap` IS OPTIONAL AND LAST, deliberately. The first four
 * parameters are the ones every caller and ~12 test call sites already pass, so
 * they do not move; a caller that omits the type map gets the pre-type
 * behaviour verbatim. `tally-application-poll/index.ts` builds it from the same
 * envelope, merged across pages exactly like the label map.
 */
export function toApplicationRow(
  submission: TallySubmission,
  questionMap: Record<string, string>,
  offeringId: string,
  userId: string | null,
  questionTypeMap?: Record<string, string> | null,
): CohortApplicationRow | null {
  const answers = extractAnswers(submission, questionMap);
  const types = extractAnswerTypes(questionMap, questionTypeMap);
  const pick = (field: FieldKey) =>
    pickField(answers, FIELD_ALIASES[field], { types, prefer: TYPE_ALLOWLIST[field] });

  const email = pick("email");
  if (!email) return null;

  const fullName = pick("fullName");
  return {
    offering_id: offeringId,
    user_id: userId,
    full_name: fullName || email.split("@")[0],
    email,
    phone: nullIfEmpty(pick("phone")),
    city: nullIfEmpty(pick("city")),
    occupation: nullIfEmpty(pick("occupation")),
    bio: nullIfEmpty(pick("bio")),
    status: "submitted",
    tally_response_id: typeof submission?.id === "string" ? submission.id : "",
    tally_data: submission,
  };
}
