/**
 * tally-fixtures.ts — PURE fixture builders for the Tally POLLER unit tests
 * (TP-2, `design/briefs/cohort-tally-poll.md`). NOT shipped; imported ONLY by
 * `src/lib/__tests__/tally.test.ts` via a RELATIVE path (there is no `@qa`
 * alias — the vitest include glob picks up the test file, and this fixture is
 * pulled in transitively), exactly like `reconcile-fixtures.ts`.
 *
 * These reproduce the envelope shape VERIFIED live against
 * `GET https://api.tally.so/forms/{id}/submissions?filter=completed` on
 * 2026-07-22, including the parts that make the poller's parser non-trivial:
 *   - answers keyed by `questionId`, with labels only in the sibling
 *     `questions[]` array (the join the webhook's `extractField` can't do);
 *   - question titles carrying HTML;
 *   - empty layout-block questions that must be dropped;
 *   - polymorphic answers (string, array of options, single option object,
 *     null for a skipped question).
 *
 * There is ZERO network here: every builder returns a plain object, so the pure
 * parse/window/map path is fully green without mocking a single fetch. Types
 * come from `@shared/tally` (alias wired in vitest.config.ts + both tsconfigs)
 * so a fixture can't drift from the module it exercises.
 */

import type {
  TallyEnvelope,
  TallyQuestion,
  TallyResponse,
  TallySubmission,
} from "@shared/tally";

/** Stable question ids for the Creator Academy intake form (`81dRPA`-shaped). */
export const QID = {
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
  orphan: "q_deleted_since",
} as const;

/**
 * The envelope's `questions[]`. Two are layout blocks with no usable title —
 * Tally really does emit these, and they must never become answer keys.
 */
export const CREATOR_ACADEMY_QUESTIONS: TallyQuestion[] = [
  { id: QID.heading, type: "TITLE", title: "<h1>  </h1>" },
  { id: QID.divider, type: "DIVIDER", title: "" },
  { id: QID.fullName, type: "INPUT_TEXT", title: "<p>Full Name</p>" },
  { id: QID.email, type: "INPUT_EMAIL", title: "<p>Email&nbsp;address</p>" },
  { id: QID.whatsapp, type: "INPUT_PHONE_NUMBER", title: "<p><strong>WhatsApp</strong> number</p>" },
  { id: QID.city, type: "INPUT_TEXT", title: "City" },
  { id: QID.occupation, type: "INPUT_TEXT", title: "<p>Your occupation</p>" },
  { id: QID.bio, type: "TEXTAREA", title: "<p>Tell us about yourself</p>" },
  { id: QID.platforms, type: "CHECKBOXES", title: "<p>Which platforms do you post on?</p>" },
  { id: QID.referral, type: "DROPDOWN", title: "<p>How did you hear about us?</p>" },
];

/** One `responses[]` entry. */
export function response(questionId: string, answer: unknown): TallyResponse {
  return {
    id: `resp_${questionId}`,
    formId: "81dRPA",
    questionId,
    respondentId: "respondent_1",
    submissionId: "sub_1",
    answer,
  };
}

export interface SubmissionOverrides {
  id?: string;
  submittedAt?: string | null;
  isCompleted?: boolean;
  /** questionId → raw answer. Omit a key to model a skipped question. */
  answers?: Record<string, unknown>;
}

/**
 * A completed submission with the full set of answers, overridable per test.
 * Defaults produce a well-formed applicant so a test only has to state the one
 * thing it is actually about.
 */
export function submission(overrides: SubmissionOverrides = {}): TallySubmission {
  const answers: Record<string, unknown> = {
    [QID.fullName]: "Meera Iyer",
    [QID.email]: "meera@example.com",
    [QID.whatsapp]: "+919788385577",
    [QID.city]: "Chennai",
    [QID.occupation]: "Editor",
    [QID.bio]: "Six years cutting wedding films, moving into brand work.",
    [QID.platforms]: [
      { id: "opt_ig", text: "Instagram" },
      { id: "opt_yt", text: "YouTube" },
    ],
    [QID.referral]: { id: "opt_friend", text: "A friend" },
    ...(overrides.answers ?? {}),
  };

  const id = overrides.id ?? "sub_1";
  return {
    id,
    formId: "81dRPA",
    respondentId: "respondent_1",
    isCompleted: overrides.isCompleted ?? true,
    submittedAt: overrides.submittedAt === undefined ? "2026-07-20T09:15:00.000Z" : overrides.submittedAt,
    createdAt: "2026-07-20T09:10:00.000Z",
    updatedAt: "2026-07-20T09:15:00.000Z",
    previewUrl: `https://tally.so/forms/81dRPA/submissions/${id}`,
    pdfUrl: `https://tally.so/forms/81dRPA/submissions/${id}.pdf`,
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
    questions: overrides.questions ?? CREATOR_ACADEMY_QUESTIONS,
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
      answers: { [QID.email]: "history@example.com" },
    }),
    submission({
      id: "sub_ancient",
      submittedAt: "2025-11-01T08:00:00.000Z",
      answers: { [QID.email]: "ancient@example.com" },
    }),
  ];
}
