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
 * There is ZERO network here: every builder returns a plain object, so the pure
 * parse/window/map path is fully green without mocking a single fetch. Types
 * come from `@shared/tally` (alias wired in vitest.config.ts + both tsconfigs)
 * so a fixture can't drift from the module it exercises.
 */

import {
  buildQuestionMap,
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
