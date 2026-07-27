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
 * join; `pickField` then reproduces the webhook's substring/lowercase alias
 * semantics on the joined result, so both intake paths pick the same answers.
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
 * The alias groups the webhook matches on, in its exact priority order
 * (`tally-application-webhook/index.ts:57-62`). Shared so the poller and its
 * tests can never drift from the webhook's field selection.
 */
export const FIELD_ALIASES = {
  fullName: ["name", "full name"],
  email: ["email"],
  phone: ["phone", "mobile", "whatsapp"],
  city: ["city", "location"],
  occupation: ["occupation", "profession", "work"],
  bio: ["about", "bio", "tell us"],
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
 * questions deleted since) are dropped.
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
 * there is no answer the operator "meant" to lose. Everything ABOVE this
 * function (the alias priority in `pickField`) still mirrors the webhook.
 */
export function extractAnswers(
  submission: TallySubmission | null | undefined,
  questionMap: Record<string, string>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const response of submission?.responses ?? []) {
    const qid = typeof response?.questionId === "string" ? response.questionId : "";
    const label = qid ? questionMap[qid] : undefined;
    if (!label) continue;
    const value = stringifyAnswer(response?.answer);
    const existing = answers[label];
    if (existing === undefined) answers[label] = value;
    else if (!existing && value) answers[label] = value;
  }
  return answers;
}

/**
 * Alias fuzzy-match over joined answers, mirroring the webhook's ALIAS
 * semantics: case-insensitive SUBSTRING match on the label, aliases tried in
 * priority order, and the FIRST label matching an alias wins — if its answer is
 * empty the search moves to the next ALIAS, not to the next label. That is what
 * the webhook does (`extractField` takes `fields.find(...)`, and the caller's
 * `||` chain advances the alias), and it matters: the aliases collide. "about"
 * matches both "Tell us about yourself" and "How did you hear about us?", so
 * scanning further labels under the same alias would file a referral answer as
 * the applicant's bio. "" when nothing matches.
 *
 * The alias layer is an exact mirror. The ONE place the poller diverges is
 * duplicate-label resolution one layer down, inside `extractAnswers` — see the
 * "ONE DELIBERATE DIVERGENCE" note there.
 */
export function pickField(
  answers: Record<string, string>,
  aliases: readonly string[],
): string {
  const entries = Object.entries(answers);
  for (const alias of aliases) {
    const needle = alias.toLowerCase();
    const hit = entries.find(([label]) => label.toLowerCase().includes(needle));
    if (hit && hit[1]) return hit[1];
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

// ── The intake cutoff (the hard requirement) ──

/** Milliseconds for an ISO instant, or null when it isn't parseable. */
function parseInstant(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Is this submission on/after the offering's intake-open cutoff?
 *
 * FAIL-CLOSED BY DESIGN. One Tally form is reused across editions — form
 * `81dRPA` alone carries 880 historical completed submissions — so a wrong
 * "yes" fabricates hundreds of bogus applications. Therefore a missing or
 * unparseable `submittedAt` is OUT of window, and an unparseable cutoff puts
 * EVERYTHING out of window rather than ingesting history.
 *
 * The boundary is inclusive: `submittedAt === cutoff` is in-window.
 *
 * This is the single-row predicate: "may this row be ingested?", one answer for
 * both out-of-window causes. `partitionByCutoff` deliberately separates them,
 * because only an OLDER-than-cutoff row proves anything about the rows behind
 * it — see its note.
 */
export function isInIntakeWindow(
  submittedAt: string | null | undefined,
  cutoffIso: string | null | undefined,
): boolean {
  const submitted = parseInstant(submittedAt);
  if (submitted === null) return false;
  const cutoff = parseInstant(cutoffIso);
  if (cutoff === null) return false;
  return submitted >= cutoff;
}

/**
 * The newest-first, stop-on-first-out-of-window scan. Tally returns
 * submissions ordered newest-first (verified live), so the first submission
 * whose `submittedAt` is OLDER than the cutoff means every remaining one is
 * older too: collect what came before it and stop. `stoppedAtCutoff` tells the
 * caller it crossed the boundary and must not request another page.
 *
 * AN UNDATED ROW IS SKIPPED, NOT A STOP SIGN. A missing or unparseable
 * `submittedAt` is out of window (the brief: "treat as out-of-window, skip"),
 * but it carries NO ordering information, so it cannot prove anything about the
 * rows behind it. Halting there would silently drop every genuinely in-window
 * submission below it — on this run and every run after, with `stoppedAtCutoff`
 * reading as the normal healthy value. So the scan counts it in
 * `skippedUndated` and continues; only a row that PARSES and falls before the
 * cutoff ends the scan.
 *
 * An unusable cutoff stops everything up front rather than ingesting history —
 * same fail-closed direction as `isInIntakeWindow`.
 */
export function partitionByCutoff<T extends { submittedAt?: string | null }>(
  submissions: readonly T[] | null | undefined,
  cutoffIso: string | null | undefined,
): { inWindow: T[]; skippedUndated: number; stoppedAtCutoff: boolean } {
  const inWindow: T[] = [];
  let skippedUndated = 0;

  const cutoff = parseInstant(cutoffIso);
  if (cutoff === null) return { inWindow, skippedUndated, stoppedAtCutoff: true };

  for (const submission of submissions ?? []) {
    const submitted = parseInstant(submission?.submittedAt);
    if (submitted === null) {
      skippedUndated++;
      continue;
    }
    if (submitted < cutoff) return { inWindow, skippedUndated, stoppedAtCutoff: true };
    inWindow.push(submission);
  }
  return { inWindow, skippedUndated, stoppedAtCutoff: false };
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
