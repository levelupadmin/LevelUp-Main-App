import { describe, it, expect } from "vitest";
import {
  buildQuestionMap,
  dedupeBySubmissionId,
  extractAnswers,
  FIELD_ALIASES,
  formIdFromTallyUrl,
  isInIntakeWindow,
  partitionByCutoff,
  pickField,
  toApplicationRow,
} from "@shared/tally";
import {
  CREATOR_ACADEMY_QUESTIONS,
  EDITION_2_CUTOFF,
  envelope,
  QID,
  straddlingPage,
  submission,
} from "../../../qa-harness/tally-fixtures";

/**
 * TP-2 — the proof for the Tally POLLER's pure core (`@shared/tally`), driven
 * with ZERO network and no mocking. Fixtures come from
 * `qa-harness/tally-fixtures` by RELATIVE path (there is no `@qa` alias);
 * vitest's `src/**` include glob pulls this test in and the fixture
 * transitively.
 *
 * The edge function itself (`tally-application-poll/index.ts`) cannot be
 * imported here — it uses Deno globals, a top-level `Deno.serve`, and an esm.sh
 * import, and it sits outside the include glob. That is precisely why the
 * cutoff comparison and the row mapping live in `_shared/tally.ts`: the brief's
 * two load-bearing acceptance criteria — an out-of-window submission is NOT
 * ingested, and the same submission id twice yields ONE row — are only provable
 * if the logic is pure. `index.ts` calls these functions rather than
 * reimplementing them inline.
 */

const QUESTION_MAP = buildQuestionMap(CREATOR_ACADEMY_QUESTIONS);
const OFFERING_ID = "11111111-1111-4111-8111-111111111111";

describe("buildQuestionMap — the label join source", () => {
  it("strips HTML tags and trims titles", () => {
    expect(QUESTION_MAP[QID.fullName]).toBe("Full Name");
    expect(QUESTION_MAP[QID.bio]).toBe("Tell us about yourself");
  });

  it("decodes entities and collapses the whitespace tags leave behind", () => {
    expect(QUESTION_MAP[QID.email]).toBe("Email address");
    expect(QUESTION_MAP[QID.whatsapp]).toBe("WhatsApp number");
  });

  it("keeps a plain-text title untouched", () => {
    expect(QUESTION_MAP[QID.city]).toBe("City");
  });

  it("drops empty layout blocks so they can never become an answer key", () => {
    expect(QUESTION_MAP[QID.heading]).toBeUndefined();
    expect(QUESTION_MAP[QID.divider]).toBeUndefined();
    expect(Object.keys(QUESTION_MAP)).not.toContain("");
  });

  it("tolerates a null/undefined questions array and id-less entries", () => {
    expect(buildQuestionMap(null)).toEqual({});
    expect(buildQuestionMap(undefined)).toEqual({});
    expect(buildQuestionMap([{ title: "No id here" }])).toEqual({});
  });
});

describe("extractAnswers — responses[].questionId → questions[].id → title", () => {
  it("joins answers onto their cleaned labels", () => {
    const answers = extractAnswers(submission(), QUESTION_MAP);
    expect(answers["Full Name"]).toBe("Meera Iyer");
    expect(answers["Email address"]).toBe("meera@example.com");
    expect(answers["WhatsApp number"]).toBe("+919788385577");
  });

  it("joins an array answer with \", \"", () => {
    const answers = extractAnswers(submission(), QUESTION_MAP);
    expect(answers["Which platforms do you post on?"]).toBe("Instagram, YouTube");
  });

  it("picks a sane text field out of an object answer", () => {
    const answers = extractAnswers(submission(), QUESTION_MAP);
    expect(answers["How did you hear about us?"]).toBe("A friend");
    const byLabel = extractAnswers(
      submission({ answers: { [QID.referral]: { id: "x", label: "Instagram ad" } } }),
      QUESTION_MAP,
    );
    expect(byLabel["How did you hear about us?"]).toBe("Instagram ad");
    const byValue = extractAnswers(
      submission({ answers: { [QID.referral]: { value: "Newsletter" } } }),
      QUESTION_MAP,
    );
    expect(byValue["How did you hear about us?"]).toBe("Newsletter");
  });

  it("renders a null/undefined answer as an empty string, never \"null\"", () => {
    const answers = extractAnswers(
      submission({ answers: { [QID.city]: null, [QID.occupation]: undefined } }),
      QUESTION_MAP,
    );
    expect(answers["City"]).toBe("");
    expect(answers["Your occupation"]).toBe("");
  });

  it("stringifies numbers and booleans", () => {
    const answers = extractAnswers(
      submission({ answers: { [QID.city]: 42, [QID.occupation]: false } }),
      QUESTION_MAP,
    );
    expect(answers["City"]).toBe("42");
    expect(answers["Your occupation"]).toBe("false");
  });

  it("drops responses whose questionId is not in the map", () => {
    const answers = extractAnswers(
      submission({ answers: { [QID.orphan]: "deleted question" } }),
      QUESTION_MAP,
    );
    expect(Object.values(answers)).not.toContain("deleted question");
  });

  describe("duplicate labels — the one deliberate divergence from the webhook", () => {
    // Two questions can clean to the SAME title (the field asked again on a
    // later page, a duplicated block). The webhook never sees this shape:
    // `extractField` takes fields.find(...) — the first match unconditionally,
    // "" if it is blank. Here the first NON-EMPTY answer wins instead. That is
    // documented on extractAnswers as intentional, not an accidental mirror.
    const dupMap = buildQuestionMap([
      { id: "q_first", title: "<p>Full Name</p>" },
      { id: "q_second", title: "Full Name" },
    ]);
    const join = (first: unknown, second: unknown) =>
      extractAnswers(
        {
          responses: [
            { questionId: "q_first", answer: first },
            { questionId: "q_second", answer: second },
          ],
        },
        dupMap,
      );

    it("lets a later non-empty answer fill an earlier blank", () => {
      expect(join("", "Meera Iyer")["Full Name"]).toBe("Meera Iyer");
    });

    it("never lets a later blank erase an earlier answer", () => {
      expect(join("Meera Iyer", "")["Full Name"]).toBe("Meera Iyer");
    });

    it("keeps the first of two non-empty answers", () => {
      expect(join("Meera Iyer", "Meera I.")["Full Name"]).toBe("Meera Iyer");
    });
  });
});

describe("pickField — the webhook's alias semantics on joined answers", () => {
  const answers = extractAnswers(submission(), QUESTION_MAP);

  it("matches all six field groups by case-insensitive substring", () => {
    expect(pickField(answers, FIELD_ALIASES.fullName)).toBe("Meera Iyer");
    expect(pickField(answers, FIELD_ALIASES.email)).toBe("meera@example.com");
    expect(pickField(answers, FIELD_ALIASES.phone)).toBe("+919788385577");
    expect(pickField(answers, FIELD_ALIASES.city)).toBe("Chennai");
    expect(pickField(answers, FIELD_ALIASES.occupation)).toBe("Editor");
    expect(pickField(answers, FIELD_ALIASES.bio)).toBe(
      "Six years cutting wedding films, moving into brand work.",
    );
  });

  it("falls through to a later alias when the earlier one is absent", () => {
    expect(pickField({ "Which city do you live in?": "Kochi" }, FIELD_ALIASES.city)).toBe("Kochi");
    expect(pickField({ "Current profession": "DOP" }, FIELD_ALIASES.occupation)).toBe("DOP");
    expect(pickField({ "Mobile no.": "9788385577" }, FIELD_ALIASES.phone)).toBe("9788385577");
  });

  it("falls through to the next ALIAS when the matching label has an empty answer", () => {
    expect(pickField({ "About you": "", "Bio": "Colourist" }, FIELD_ALIASES.bio)).toBe("Colourist");
  });

  it("does not scan past the first label of an alias, so colliding labels can't cross-fill", () => {
    // "about" matches BOTH "Tell us about yourself" and "How did you hear about
    // us?". Continuing the scan under one alias would file the referral answer
    // as the applicant's bio. The webhook doesn't do that, and neither does this.
    const withEmptyBio = extractAnswers(
      submission({ answers: { [QID.bio]: "" } }),
      QUESTION_MAP,
    );
    expect(pickField(withEmptyBio, FIELD_ALIASES.bio)).toBe("");
  });

  it("returns \"\" when nothing matches", () => {
    expect(pickField({ "Anything else?": "nope" }, FIELD_ALIASES.email)).toBe("");
    expect(pickField({}, FIELD_ALIASES.fullName)).toBe("");
  });
});

describe("formIdFromTallyUrl", () => {
  it("parses the /r/{id} short form", () => {
    expect(formIdFromTallyUrl("https://tally.so/r/81dRPA")).toBe("81dRPA");
    expect(formIdFromTallyUrl("https://tally.so/r/81dRPA?ref=app")).toBe("81dRPA");
  });

  it("parses the /forms/{id} form", () => {
    expect(formIdFromTallyUrl("https://tally.so/forms/wA_2b-9")).toBe("wA_2b-9");
  });

  it("returns null for a non-tally.so URL", () => {
    expect(formIdFromTallyUrl("https://forms.gle/r/abc123")).toBeNull();
    expect(formIdFromTallyUrl("https://typeform.com/forms/abc123")).toBeNull();
  });

  it("returns null for empty/absent input and for a tally.so URL with no id", () => {
    expect(formIdFromTallyUrl(null)).toBeNull();
    expect(formIdFromTallyUrl(undefined)).toBeNull();
    expect(formIdFromTallyUrl("")).toBeNull();
    expect(formIdFromTallyUrl("https://tally.so/")).toBeNull();
  });

  it("agrees with reconcile-funnel-stage's extractTallyFormId on every tally.so shape", () => {
    // The duplicate lives at reconcile-funnel-stage/index.ts:516-520. De-duping
    // is out of scope for this phase, so pin the two to the same answer instead.
    const reconcileRegex = (url: string) => {
      const m = url.match(/(?:forms|r)\/([A-Za-z0-9_-]+)/);
      return m ? m[1] : null;
    };
    for (const url of [
      "https://tally.so/r/81dRPA",
      "https://tally.so/forms/81dRPA",
      "https://tally.so/r/wA_2b-9?utm_source=app",
      "https://tally.so/forms/81dRPA/submissions",
    ]) {
      expect(formIdFromTallyUrl(url)).toBe(reconcileRegex(url));
    }
  });
});

describe("isInIntakeWindow — the cutoff, fail-closed", () => {
  it("accepts a submission after the cutoff", () => {
    expect(isInIntakeWindow("2026-07-20T09:15:00.000Z", EDITION_2_CUTOFF)).toBe(true);
  });

  it("rejects a submission before the cutoff", () => {
    expect(isInIntakeWindow("2026-03-14T08:00:00.000Z", EDITION_2_CUTOFF)).toBe(false);
  });

  it("treats the boundary itself as in-window", () => {
    expect(isInIntakeWindow(EDITION_2_CUTOFF, EDITION_2_CUTOFF)).toBe(true);
  });

  it("treats a null/undefined/unparseable submittedAt as OUT of window", () => {
    expect(isInIntakeWindow(null, EDITION_2_CUTOFF)).toBe(false);
    expect(isInIntakeWindow(undefined, EDITION_2_CUTOFF)).toBe(false);
    expect(isInIntakeWindow("", EDITION_2_CUTOFF)).toBe(false);
    expect(isInIntakeWindow("not a date", EDITION_2_CUTOFF)).toBe(false);
  });

  it("ingests NOTHING when the cutoff itself is unusable", () => {
    expect(isInIntakeWindow("2026-07-20T09:15:00.000Z", null)).toBe(false);
    expect(isInIntakeWindow("2026-07-20T09:15:00.000Z", "garbage")).toBe(false);
  });
});

describe("partitionByCutoff — newest-first, stop on the first out-of-window row", () => {
  const { inWindow, stoppedAtCutoff } = partitionByCutoff(straddlingPage(), EDITION_2_CUTOFF);

  it("keeps only the in-window submissions", () => {
    expect(inWindow.map((s) => s.id)).toEqual(["sub_new_1", "sub_new_2"]);
  });

  it("does NOT ingest the Edition-1 relic", () => {
    // The brief's hard requirement: 880 historical completed submissions on the
    // reused form must never become Edition-2 applications.
    expect(inWindow.map((s) => s.id)).not.toContain("sub_edition_1");
    const rows = inWindow.map((s) => toApplicationRow(s, QUESTION_MAP, OFFERING_ID, null));
    expect(rows.map((r) => r?.email)).not.toContain("history@example.com");
  });

  it("reports that it stopped at the cutoff", () => {
    expect(stoppedAtCutoff).toBe(true);
  });

  it("stops at the FIRST out-of-window row rather than filtering the page", () => {
    // A newer row hiding behind an older one is not rescued — the scan halts.
    const outOfOrder = [
      submission({ id: "a", submittedAt: "2026-07-20T09:15:00.000Z" }),
      submission({ id: "old", submittedAt: "2026-01-01T00:00:00.000Z" }),
      submission({ id: "b", submittedAt: "2026-07-19T09:15:00.000Z" }),
    ];
    const result = partitionByCutoff(outOfOrder, EDITION_2_CUTOFF);
    expect(result.inWindow.map((s) => s.id)).toEqual(["a"]);
    expect(result.stoppedAtCutoff).toBe(true);
  });

  it("SKIPS an undated submission instead of halting on it", () => {
    // A null/unparseable submittedAt is out of window, but it carries no
    // ordering information, so it proves nothing about the rows behind it.
    // Halting there would drop every in-window row below it — on this run and
    // every run after — while reporting the healthy-looking stoppedAtCutoff.
    const result = partitionByCutoff(
      [
        submission({ id: "a" }),
        submission({ id: "nulled", submittedAt: null }),
        submission({ id: "garbled", submittedAt: "not a date" }),
        submission({ id: "b", submittedAt: "2026-07-19T09:15:00.000Z" }),
      ],
      EDITION_2_CUTOFF,
    );
    expect(result.inWindow.map((s) => s.id)).toEqual(["a", "b"]);
    expect(result.skippedUndated).toBe(2);
    expect(result.stoppedAtCutoff).toBe(false);
  });

  it("still stops at a genuinely older row that sits behind an undated one", () => {
    const result = partitionByCutoff(
      [
        submission({ id: "a" }),
        submission({ id: "nulled", submittedAt: null }),
        submission({ id: "old", submittedAt: "2026-01-01T00:00:00.000Z" }),
        submission({ id: "unreached", submittedAt: "2026-07-19T09:15:00.000Z" }),
      ],
      EDITION_2_CUTOFF,
    );
    expect(result.inWindow.map((s) => s.id)).toEqual(["a"]);
    expect(result.skippedUndated).toBe(1);
    expect(result.stoppedAtCutoff).toBe(true);
  });

  it("ingests NOTHING when the cutoff itself is unusable", () => {
    for (const badCutoff of [null, undefined, "", "garbage"]) {
      const result = partitionByCutoff(straddlingPage(), badCutoff);
      expect(result.inWindow).toEqual([]);
      expect(result.stoppedAtCutoff).toBe(true);
    }
  });

  it("reports stoppedAtCutoff=false when the whole page is in-window", () => {
    const page = envelope().submissions ?? [];
    const result = partitionByCutoff(page, EDITION_2_CUTOFF);
    expect(result.inWindow).toHaveLength(page.length);
    expect(result.skippedUndated).toBe(0);
    expect(result.stoppedAtCutoff).toBe(false);
  });

  it("tolerates an empty/absent page", () => {
    const empty = { inWindow: [], skippedUndated: 0, stoppedAtCutoff: false };
    expect(partitionByCutoff([], EDITION_2_CUTOFF)).toEqual(empty);
    expect(partitionByCutoff(null, EDITION_2_CUTOFF)).toEqual(empty);
  });
});

describe("toApplicationRow — the exact cohort_applications payload", () => {
  it("maps a full submission", () => {
    const row = toApplicationRow(submission(), QUESTION_MAP, OFFERING_ID, "user-1");
    expect(row).toEqual({
      offering_id: OFFERING_ID,
      user_id: "user-1",
      full_name: "Meera Iyer",
      email: "meera@example.com",
      phone: "+919788385577",
      city: "Chennai",
      occupation: "Editor",
      bio: "Six years cutting wedding films, moving into brand work.",
      status: "submitted",
      tally_response_id: "sub_1",
      tally_data: expect.objectContaining({ id: "sub_1" }),
    });
  });

  it("only ever writes status 'submitted'", () => {
    const statuses = straddlingPage()
      .map((s) => toApplicationRow(s, QUESTION_MAP, OFFERING_ID, null)?.status)
      .filter(Boolean);
    expect(new Set(statuses)).toEqual(new Set(["submitted"]));
  });

  it("returns null when the submission has no email (same skip as the webhook)", () => {
    const row = toApplicationRow(
      submission({ answers: { [QID.email]: "" } }),
      QUESTION_MAP,
      OFFERING_ID,
      null,
    );
    expect(row).toBeNull();
  });

  it("falls back to the email local-part when there is no name", () => {
    const row = toApplicationRow(
      submission({ answers: { [QID.fullName]: "" } }),
      QUESTION_MAP,
      OFFERING_ID,
      null,
    );
    expect(row?.full_name).toBe("meera");
  });

  it("stores unanswered optional fields as null, not \"\"", () => {
    const row = toApplicationRow(
      submission({ answers: { [QID.city]: null, [QID.occupation]: "", [QID.bio]: null } }),
      QUESTION_MAP,
      OFFERING_ID,
      null,
    );
    expect(row?.city).toBeNull();
    expect(row?.occupation).toBeNull();
    expect(row?.bio).toBeNull();
  });

  it("keeps the raw submission in tally_data so a re-parse never needs Tally", () => {
    const sub = submission();
    const row = toApplicationRow(sub, QUESTION_MAP, OFFERING_ID, null);
    expect(row?.tally_data).toBe(sub);
  });
});

describe("idempotency — the same submission twice yields ONE row", () => {
  it("dedupes repeated submission ids within a run", () => {
    const sub = submission({ id: "sub_dupe" });
    const rows = dedupeBySubmissionId([sub, { ...sub }, submission({ id: "sub_other" })])
      .map((s) => toApplicationRow(s, QUESTION_MAP, OFFERING_ID, null))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.tally_response_id === "sub_dupe")).toHaveLength(1);
  });

  it("survives a page boundary repeating the newest row across two polls", () => {
    const page1 = [submission({ id: "s1" }), submission({ id: "s2" })];
    const page2 = [submission({ id: "s2" }), submission({ id: "s3" })];
    const ids = dedupeBySubmissionId([...page1, ...page2]).map((s) => s.id);
    expect(ids).toEqual(["s1", "s2", "s3"]);
  });

  it("keeps id-less submissions rather than collapsing them together", () => {
    const kept = dedupeBySubmissionId([{ id: undefined }, { id: undefined }]);
    expect(kept).toHaveLength(2);
  });

  it("tolerates an empty/absent list", () => {
    expect(dedupeBySubmissionId([])).toEqual([]);
    expect(dedupeBySubmissionId(null)).toEqual([]);
  });
});
