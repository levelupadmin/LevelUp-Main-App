/**
 * tally-fixtures.ts — fixture builders for the Tally POLLER unit tests
 * (TP-2 / FX-1, `design/briefs/cohort-tally-poll-fix.md`). NOT shipped; imported
 * ONLY by `src/lib/__tests__/tally.test.ts` via a RELATIVE path (there is no
 * `@qa` alias — the vitest include glob picks up the test file, and this fixture
 * is pulled in transitively), exactly like `reconcile-fixtures.ts`.
 *
 * THE PRIMARY FIXTURE IS THE REAL FORM, NOT AN INVENTED ONE. Everything below
 * `REAL_QUESTIONS` is derived from `./tally-81dRPA-real-envelope.json` — the
 * genuine 29-question envelope of live form `81dRPA`, probed 2026-07-27, real
 * ids / titles / order. ANSWERS CARRY NO REAL DATA: the 19 visible-question
 * answers are synthetic fixtures, and the 6 HIDDEN attribution fields
 * (utm_source/medium/campaign/content, fbclid, click_ts) are NULLED — the first
 * cut of this file wrongly certified "zero PII" while those six still held a
 * real person's Meta click identifiers. `buildQuestionMap` drops all six
 * (title:null), so nothing here ever depended on them. The JSON is
 * IMPORTED rather than transcribed so a fixture can never drift from ground
 * truth. This matters because the invented labels the first cut of this file
 * used ("Full Name", "Your occupation", "Tell us about yourself") all matched
 * the old parser perfectly while the real ones did not: the real form asks
 * "What is your most recent designation?" and "Write your heart out! (In 100
 * words or more)", and surrounds them with FAQ blocks that a substring matcher
 * happily mistook for data fields.
 *
 * The real envelope also carries, for free, the parts that make the poller's
 * parser non-trivial: answers keyed by `questionId` with labels only in the
 * sibling `questions[]` array; hidden fields with `title: null` that must be
 * dropped; array answers from every multiple-choice; a `questions[]` order that
 * DIFFERS from the `responses[]` order.
 *
 * `SYNTHETIC_QUESTIONS` / `syntheticSubmission` stay for the edge cases the real
 * form happens not to exhibit: HTML-wrapped titles, a title that is HTML but
 * cleans to nothing, and single-object answers.
 *
 * `typedForm` (bottom of this file) builds an ARBITRARY form carrying per-question
 * BLOCK TYPES, for the fix-round-3 type layer. The real envelope proves the live
 * form; `typedForm` proves the forms nobody here has read — the third-party
 * decoys, the prose consent question, the untyped fallback and the
 * `MULTIPLE_CHOICE`-only pathological case — in BOTH question orderings.
 *
 * There is ZERO network here: every builder returns a plain object, so the pure
 * parse/window/map path is fully green without mocking a single fetch. Types
 * come from `@shared/tally` (alias wired in vitest.config.ts + both tsconfigs)
 * so a fixture can't drift from the module it exercises.
 */

import {
  buildQuestionMap,
  buildQuestionTypeMap,
  extractAnswers,
  extractAnswerTypes,
  type IntakeWindowSource,
  type TallyEnvelope,
  type TallyQuestion,
  type TallyResponse,
  type TallySubmission,
} from "@shared/tally";
import realForm from "./tally-81dRPA-real-envelope.json";

export const FORM_ID = "81dRPA";

// ── The REAL form ──

/** The real `questions[]`, in the real order, straight out of the JSON. */
export const REAL_QUESTIONS: TallyQuestion[] = realForm.questions as TallyQuestion[];

/**
 * Real question ids. Named by ROLE so a test reads as intent, and grouped so the
 * decoys — the labels FX-1 exists to keep out of the mapped fields — are
 * impossible to miss.
 */
export const QID = {
  // The six fields the poller maps.
  fullName: "g5zJLP",
  phone: "yl1ox8",
  email: "XeQ8EP",
  city: "5dVeLN",
  occupation: "zKdGZk",
  bio: "kYkNW6",
  // Real questions that are neither mapped nor decoys.
  socialHandle: "8dr6Gl",
  gender: "dYz8lr",
  age: "YZ9JrN",
  // The decoys.
  decoyWhatDoYouDo: "0EkZL9",
  decoyWhatIsAcademy: "Ld6PYG",
  decoyAcademyWork: "pLkDWV",
  decoyMentoredBy: "J2WODJ",
  decoyEndOfProgram: "g5k9ZN",
  decoySelectOne: "BG2xD7",
  // Hidden fields — `title: null`, must never become an answer key.
  hiddenUtmSource: "4kWYXb",
  hiddenFbclid: "zeMWjZ",
  // Not in the form at all (a question deleted since the submission).
  orphan: "q_deleted_since",
} as const;

/**
 * Real question titles keyed by the same role names as `QID`, i.e. the answer
 * keys `extractAnswers` produces for the real form.
 *
 * CLEANED BY `buildQuestionMap` ITSELF, not by a local imitation of it. An
 * earlier cut re-implemented the cleaning as a whitespace collapse, which is
 * only equivalent while no real title carries markup — and the synthetic
 * fixture exists precisely because Tally does emit HTML titles. The day a real
 * title gained a tag, `LABEL` would have silently disagreed with the map the
 * parser builds and the ground-truth assertions would have failed pointing at
 * the wrong thing. Calling the shipped function makes them unable to diverge.
 *
 * This does NOT make the ground truth self-referential: `tally.test.ts` pins
 * every load-bearing label against a hand-written literal, so a form edit (or a
 * regression in the cleaning) still fails there, in one place, by name.
 */
export const LABEL: Record<keyof typeof QID, string> = (() => {
  const byId = buildQuestionMap(REAL_QUESTIONS);
  const labels = {} as Record<keyof typeof QID, string>;
  for (const key of Object.keys(QID) as Array<keyof typeof QID>) {
    labels[key] = byId[QID[key]] ?? "";
  }
  return labels;
})();

/** questionId → the real (anonymised) answer, in the real RESPONSE order. */
const REAL_ANSWERS: Record<string, unknown> = (() => {
  const answers: Record<string, unknown> = {};
  for (const response of realForm.submission.responses) {
    answers[response.questionId] = response.answer;
  }
  return answers;
})();

export const REAL_SUBMISSION_ID = realForm.submission.id;
export const REAL_SUBMITTED_AT = realForm.submission.submittedAt;

/** One `responses[]` entry. */
export function response(questionId: string, answer: unknown): TallyResponse {
  return {
    id: `resp_${questionId}`,
    formId: FORM_ID,
    questionId,
    respondentId: "respondent_1",
    submissionId: REAL_SUBMISSION_ID,
    answer,
  };
}

export interface SubmissionOverrides {
  id?: string;
  submittedAt?: string | null;
  isCompleted?: boolean;
  /** questionId → raw answer. Overrides keep the real response ORDER. */
  answers?: Record<string, unknown>;
}

/**
 * The real submission, overridable per test. Defaults are the anonymised real
 * answers, so a test only has to state the one thing it is actually about — and
 * anything it does not state is exactly what the live form sends.
 */
export function submission(overrides: SubmissionOverrides = {}): TallySubmission {
  const answers: Record<string, unknown> = { ...REAL_ANSWERS, ...(overrides.answers ?? {}) };
  const id = overrides.id ?? REAL_SUBMISSION_ID;
  return {
    id,
    formId: FORM_ID,
    respondentId: "respondent_1",
    isCompleted: overrides.isCompleted ?? true,
    submittedAt: overrides.submittedAt === undefined ? REAL_SUBMITTED_AT : overrides.submittedAt,
    createdAt: "2026-07-26T07:02:11.000Z",
    updatedAt: REAL_SUBMITTED_AT,
    previewUrl: `https://tally.so/forms/${FORM_ID}/submissions/${id}`,
    pdfUrl: `https://tally.so/forms/${FORM_ID}/submissions/${id}.pdf`,
    responses: Object.entries(answers).map(([qid, answer]) => ({
      ...response(qid, answer),
      submissionId: id,
    })),
  };
}

export interface EnvelopeOverrides {
  page?: number;
  hasMore?: boolean;
  questions?: TallyQuestion[];
  submissions?: TallySubmission[];
  partial?: number;
  completed?: number;
}

/** A full `?filter=completed` envelope, newest-first like the live API. */
export function envelope(overrides: EnvelopeOverrides = {}): TallyEnvelope {
  const submissions = overrides.submissions ?? [submission()];
  return {
    page: overrides.page ?? 1,
    limit: 100,
    hasMore: overrides.hasMore ?? false,
    totalNumberOfSubmissionsPerFilter: {
      all: 3927,
      completed: overrides.completed ?? 880,
      partial: overrides.partial ?? 3047,
    },
    questions: overrides.questions ?? REAL_QUESTIONS,
    submissions,
  };
}

/**
 * The Edition-2 cutoff used across the window tests. Form `81dRPA` served
 * Edition 1 too, so everything before this instant is history that must NOT be
 * ingested.
 */
export const EDITION_2_CUTOFF = "2026-07-01T00:00:00.000Z";

/**
 * A newest-first page straddling the cutoff, exactly as Tally returns it: two
 * Edition-2 submissions, then an Edition-1 relic, then more history the scan
 * must never reach.
 */
export function straddlingPage(): TallySubmission[] {
  return [
    submission({ id: "sub_new_1", submittedAt: "2026-07-20T09:15:00.000Z" }),
    submission({ id: "sub_new_2", submittedAt: "2026-07-02T11:00:00.000Z" }),
    submission({
      id: "sub_edition_1",
      submittedAt: "2026-03-14T08:00:00.000Z",
      answers: { [QID.email]: "history@example.invalid" },
    }),
    submission({
      id: "sub_ancient",
      submittedAt: "2025-11-01T08:00:00.000Z",
      answers: { [QID.email]: "ancient@example.invalid" },
    }),
  ];
}

/**
 * The Edition-2 ceiling (FX-2.2), in the exact shape PostgREST hands over a SQL
 * `date` column: `YYYY-MM-DD`, carrying NO time and NO zone. That shape is the
 * whole reason `resolveIntakeWindow` has to choose the instant the day ends —
 * the column cannot say it.
 */
export const EDITION_2_DEADLINE = "2026-07-31";

/**
 * The instant `EDITION_2_DEADLINE` ends: end of that day in Asia/Kolkata.
 *
 * SPELLED OUT BY HAND, NEVER DERIVED. A fixture that recomputed this from the
 * date would agree with the implementation by construction and would keep
 * passing if the ceiling were reverted to a UTC boundary. This literal is the
 * ground truth the test asserts the shipped function against.
 */
export const EDITION_2_WINDOW_END_IST = "2026-07-31T23:59:59.999+05:30";

/**
 * Instants around that ceiling, chosen so a revert to UTC FAILS rather than
 * passing quietly. Both wrong answers are covered:
 *   • `middayIst` — 12:00 IST on the deadline day. UTC MIDNIGHT (what
 *     `PublicOffering.tsx` renders the column with, and the obvious "just parse
 *     the date" reading) lands at 05:30 IST, so a UTC cut would drop this and
 *     with it the entire last-day rush, which on an applications funnel is the
 *     busiest hours it has.
 *   • `nextDayFirstMinuteIst` — 00:01 IST the morning after. END-OF-DAY IN UTC
 *     (`…T23:59:59.999Z`) is 05:29 IST on that morning, so that cut would
 *     wrongly ingest this one.
 * `lastMinuteIst` is the in-window edge; `EDITION_2_WINDOW_END_IST` itself is
 * inclusive and is asserted separately.
 */
export const DEADLINE_BOUNDARY = {
  middayIst: "2026-07-31T12:00:00.000+05:30",
  lastMinuteIst: "2026-07-31T23:59:00.000+05:30",
  nextDayFirstMinuteIst: "2026-08-01T00:01:00.000+05:30",
} as const;

/**
 * A newest-first page from a CLOSED edition: the post-deadline rows arrive
 * FIRST, because that is the real arrival order once an always-on lead form
 * outlives its edition. Every row here is ABOVE the cutoff, so nothing on this
 * page may end the scan — the two in-window rows underneath must still be
 * collected and `stoppedAtCutoff` must stay false.
 *
 * This is the shape that makes treating the ceiling as a stop signal
 * catastrophic rather than merely wrong: it would halt on row 1, ingest
 * NOTHING from the moment an edition closes, and report the same healthy
 * `stoppedAtCutoff: true` while doing it.
 */
export function closedEditionPage(): TallySubmission[] {
  return [
    submission({
      id: "sub_after_deadline_1",
      submittedAt: "2026-08-05T09:00:00.000Z",
      answers: { [QID.email]: "late-1@example.invalid" },
    }),
    submission({
      id: "sub_after_deadline_2",
      submittedAt: "2026-08-01T05:00:00.000Z",
      answers: { [QID.email]: "late-2@example.invalid" },
    }),
    submission({ id: "sub_in_window_1", submittedAt: "2026-07-20T09:15:00.000Z" }),
    submission({ id: "sub_in_window_2", submittedAt: "2026-07-02T11:00:00.000Z" }),
  ];
}

/**
 * The two `offerings` columns `resolveIntakeWindow` reads, snake_cased like the
 * DB row. Defaults are the healthy Edition-2 pair, so a test states only the
 * column it is actually about — a NULL cutoff, an unparseable one, no ceiling.
 */
export function offeringWindow(
  overrides: Partial<IntakeWindowSource> = {},
): IntakeWindowSource {
  return {
    intake_opens_at: EDITION_2_CUTOFF,
    application_deadline: EDITION_2_DEADLINE,
    ...overrides,
  };
}

// ── The synthetic edge-case form ──

/** Question ids for the synthetic form. Deliberately unlike the real base62 ids. */
export const SQID = {
  heading: "q_heading",
  divider: "q_divider",
  fullName: "q_full_name",
  email: "q_email",
  whatsapp: "q_whatsapp",
  city: "q_city",
  occupation: "q_occupation",
  bio: "q_bio",
  platforms: "q_platforms",
  referral: "q_referral",
} as const;

/**
 * A small invented form carrying ONLY what the real envelope cannot show:
 * HTML-wrapped titles, entities, a title that is markup but cleans to nothing,
 * and a single-object (dropdown) answer. Never used to prove field selection —
 * that is the real envelope's job.
 */
export const SYNTHETIC_QUESTIONS: TallyQuestion[] = [
  { id: SQID.heading, type: "TITLE", title: "<h1>  </h1>" },
  { id: SQID.divider, type: "DIVIDER", title: "" },
  { id: SQID.fullName, type: "INPUT_TEXT", title: "<p>Full Name</p>" },
  { id: SQID.email, type: "INPUT_EMAIL", title: "<p>Email&nbsp;address</p>" },
  { id: SQID.whatsapp, type: "INPUT_PHONE_NUMBER", title: "<p><strong>WhatsApp</strong> number</p>" },
  { id: SQID.city, type: "INPUT_TEXT", title: "City" },
  { id: SQID.occupation, type: "INPUT_TEXT", title: "<p>Your occupation</p>" },
  { id: SQID.bio, type: "TEXTAREA", title: "<p>Tell us about yourself</p>" },
  { id: SQID.platforms, type: "CHECKBOXES", title: "<p>Which platforms do you post on?</p>" },
  { id: SQID.referral, type: "DROPDOWN", title: "<p>How did you hear about us?</p>" },
];

/** A completed submission against `SYNTHETIC_QUESTIONS`, overridable per test. */
export function syntheticSubmission(overrides: SubmissionOverrides = {}): TallySubmission {
  const answers: Record<string, unknown> = {
    [SQID.fullName]: "Meera Iyer",
    [SQID.email]: "meera@example.invalid",
    [SQID.whatsapp]: "+919788385577",
    [SQID.city]: "Chennai",
    [SQID.occupation]: "Editor",
    [SQID.bio]: "Six years cutting wedding films, moving into brand work.",
    [SQID.platforms]: [
      { id: "opt_ig", text: "Instagram" },
      { id: "opt_yt", text: "YouTube" },
    ],
    [SQID.referral]: { id: "opt_friend", text: "A friend" },
    ...(overrides.answers ?? {}),
  };

  const id = overrides.id ?? "sub_synthetic_1";
  return {
    id,
    formId: FORM_ID,
    respondentId: "respondent_synthetic",
    isCompleted: overrides.isCompleted ?? true,
    submittedAt:
      overrides.submittedAt === undefined ? "2026-07-20T09:15:00.000Z" : overrides.submittedAt,
    createdAt: "2026-07-20T09:10:00.000Z",
    updatedAt: "2026-07-20T09:15:00.000Z",
    responses: Object.entries(answers).map(([qid, answer]) => ({
      ...response(qid, answer),
      submissionId: id,
    })),
  };
}

// ── Arbitrary forms carrying a BLOCK TYPE ──

/** One question of a `typedForm`: the label, the Tally block type, the answer. */
export interface TypedField {
  title: string;
  /**
   * The Tally block type (`INPUT_EMAIL`, `MULTIPLE_CHOICE`, …). OMIT IT to
   * model a form that states no type at all — that is the fail-soft path, and
   * it has to be expressible here or it cannot be proven.
   */
  type?: string;
  value: string;
}

/** Everything `pickField` / `toApplicationRow` need for one typed form. */
export interface TypedFormFixture {
  questions: TallyQuestion[];
  questionMap: Record<string, string>;
  questionTypeMap: Record<string, string>;
  submission: TallySubmission;
  answers: Record<string, string>;
  types: Record<string, string>;
}

/**
 * An arbitrary form with per-question BLOCK TYPES, built by running the SHIPPED
 * join over invented `questions[]` + `responses[]` rather than by hand-writing
 * the two maps. That matters: a fixture that assembled `{label: type}` directly
 * would keep passing if `buildQuestionTypeMap` started disagreeing with
 * `buildQuestionMap` about which questions exist, which is the one way the type
 * layer can go quietly wrong.
 *
 * Question ORDER is the array order, so a test can assert both orderings by
 * reversing its input — the standard here, because every historical regression
 * in this file was right in one ordering and wrong in the other.
 *
 * PERSONAS ARE SYNTHETIC. No real applicant, address or number appears in any
 * fixture; `example.invalid` is reserved by RFC 6761 and the numbers are made up.
 */
export function typedForm(fields: readonly TypedField[]): TypedFormFixture {
  const questions: TallyQuestion[] = fields.map((field, index) => ({
    id: `q_typed_${index}`,
    type: field.type ?? null,
    title: field.title,
  }));
  const questionMap = buildQuestionMap(questions);
  const questionTypeMap = buildQuestionTypeMap(questions);
  const submission: TallySubmission = {
    id: "sub_typed",
    formId: FORM_ID,
    isCompleted: true,
    submittedAt: "2026-07-20T09:15:00.000Z",
    responses: fields.map((field, index) => response(`q_typed_${index}`, field.value)),
  };
  return {
    questions,
    questionMap,
    questionTypeMap,
    submission,
    answers: extractAnswers(submission, questionMap),
    types: extractAnswerTypes(questionMap, questionTypeMap),
  };
}
