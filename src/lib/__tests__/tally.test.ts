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
  EDITION_2_CUTOFF,
  envelope,
  LABEL,
  QID,
  REAL_QUESTIONS,
  REAL_SUBMISSION_ID,
  SQID,
  straddlingPage,
  submission,
  SYNTHETIC_QUESTIONS,
  syntheticSubmission,
} from "../../../qa-harness/tally-fixtures";

/**
 * TP-2 + FX-1 — the proof for the Tally POLLER's pure core (`@shared/tally`),
 * driven with ZERO network and no mocking. Fixtures come from
 * `qa-harness/tally-fixtures` by RELATIVE path (there is no `@qa` alias);
 * vitest's `src/**` include glob pulls this test in and the fixture
 * transitively.
 *
 * FIELD SELECTION IS PROVEN AGAINST THE REAL FORM. The default `submission()` /
 * `REAL_QUESTIONS` fixtures are the genuine `81dRPA` envelope (real ids, real
 * titles, real order, anonymised answers). The previous cut of this suite used
 * invented labels, which is exactly how the two shipped parser defects survived
 * a green suite: "Your occupation" matched, "What is your most recent
 * designation?" did not. Anything asserted below about which label wins is a
 * statement about the live form, not about a fixture someone wrote to pass.
 * `syntheticSubmission()` covers only what the real envelope cannot exhibit —
 * HTML titles, entities, empty markup titles, single-object answers.
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

const QUESTION_MAP = buildQuestionMap(REAL_QUESTIONS);
const SYNTHETIC_MAP = buildQuestionMap(SYNTHETIC_QUESTIONS);
const OFFERING_ID = "11111111-1111-4111-8111-111111111111";

/** The anonymised answers the real decoy questions carry. */
const DECOY_ANSWERS = {
  whatDoYouDo: "Entrepreneur/Founder",
  academyWork: "Learn live on weekends. Execute during the week. Improve with feedback and community.",
  whatIsAcademy: "A recorded course you watch at your pace",
  mentoredBy: "Established Creators themselves",
} as const;

describe("the real 81dRPA form — ground truth", () => {
  // The one place the real labels are written out. Everything else derives them
  // from the committed envelope, so a form edit surfaces here and nowhere else.
  // `LABEL` is `buildQuestionMap`'s own output over the real questions (see
  // tally-fixtures), so these literals pin the raw envelope AND the join that
  // reads it — a regression in the cleaning fails here, by name.
  it("carries the labels FX-1 was written against", () => {
    expect(LABEL.fullName).toBe("Your name");
    expect(LABEL.email).toBe("Your Email ID");
    expect(LABEL.phone).toBe("Your Whatsapp Number");
    expect(LABEL.city).toBe("Which City are you from?");
    expect(LABEL.occupation).toBe("What is your most recent designation?");
    expect(LABEL.bio).toBe("Write your heart out! (In 100 words or more)");
  });

  it("carries the decoy labels the matcher must refuse", () => {
    expect(LABEL.decoyWhatDoYouDo).toBe("@Your name, What do you do?");
    expect(LABEL.decoyAcademyWork).toBe("How does the academy work week to week?");
    expect(LABEL.decoyWhatIsAcademy).toBe("What is the LevelUp Creator Academy?");
    expect(LABEL.decoyMentoredBy).toBe("At the Academy, you are mentored by:");
  });

  it("asks the coarse 'What do you do?' dropdown BEFORE the real designation", () => {
    // Position alone would hand occupation to the dropdown, which is why the
    // scoring key ranks alias priority above question order.
    const ids = REAL_QUESTIONS.map((q) => q.id);
    expect(ids.indexOf(QID.decoyWhatDoYouDo)).toBeLessThan(ids.indexOf(QID.occupation));
  });
});

describe("buildQuestionMap — the label join source", () => {
  it("keeps every titled question and only those", () => {
    // 29 questions in the real envelope, 10 of them hidden fields with a null
    // title. The titles themselves are pinned as literals in the ground-truth
    // block above (LABEL is this map's output), so what is left to prove here
    // is that the join neither drops a real question nor keeps a hidden one.
    expect(REAL_QUESTIONS).toHaveLength(29);
    expect(Object.keys(QUESTION_MAP)).toHaveLength(19);
    for (const id of [QID.fullName, QID.email, QID.phone, QID.city, QID.occupation, QID.bio]) {
      expect(QUESTION_MAP[id]).toBeTruthy();
    }
  });

  it("collapses the trailing newline the real FAQ title carries", () => {
    // "How does the academy work week to week?\n" — the deny-list has to be
    // checked against the CLEANED title, not the raw one.
    const raw = REAL_QUESTIONS.find((q) => q.id === QID.decoyAcademyWork)?.title;
    expect(raw).toContain("\n");
    expect(QUESTION_MAP[QID.decoyAcademyWork]).toBe("How does the academy work week to week?");
  });

  it("drops the real hidden fields, whose titles are null", () => {
    expect(QUESTION_MAP[QID.hiddenUtmSource]).toBeUndefined();
    expect(QUESTION_MAP[QID.hiddenFbclid]).toBeUndefined();
    expect(Object.keys(QUESTION_MAP)).not.toContain("");
  });

  it("strips HTML tags, decodes entities and drops empty layout blocks", () => {
    expect(SYNTHETIC_MAP[SQID.fullName]).toBe("Full Name");
    expect(SYNTHETIC_MAP[SQID.email]).toBe("Email address");
    expect(SYNTHETIC_MAP[SQID.whatsapp]).toBe("WhatsApp number");
    expect(SYNTHETIC_MAP[SQID.city]).toBe("City");
    expect(SYNTHETIC_MAP[SQID.heading]).toBeUndefined();
    expect(SYNTHETIC_MAP[SQID.divider]).toBeUndefined();
  });

  it("tolerates a null/undefined questions array and id-less entries", () => {
    expect(buildQuestionMap(null)).toEqual({});
    expect(buildQuestionMap(undefined)).toEqual({});
    expect(buildQuestionMap([{ title: "No id here" }])).toEqual({});
  });
});

describe("extractAnswers — responses[].questionId → questions[].id → title", () => {
  const answers = extractAnswers(submission(), QUESTION_MAP);

  it("joins the real answers onto their real labels", () => {
    expect(answers[LABEL.fullName]).toBe("Test Applicant");
    expect(answers[LABEL.email]).toBe("applicant@example.invalid");
    expect(answers[LABEL.phone]).toBe("9000000001");
    expect(answers[LABEL.city]).toBe("Chennai");
    expect(answers[LABEL.occupation]).toBe("Freelance Video Editor");
    expect(answers[LABEL.bio]).toBe("REDACTED_ESSAY_TEXT_100_WORDS");
  });

  it("joins a real multiple-choice array answer", () => {
    expect(answers[LABEL.decoyWhatDoYouDo]).toBe(DECOY_ANSWERS.whatDoYouDo);
    expect(answers[LABEL.gender]).toBe("Male");
  });

  it("drops the hidden fields entirely, object answers and all", () => {
    // utm_source / fbclid / click_ts are TeleCRM attribution, never applicant data.
    expect(Object.values(answers)).not.toContain("ig");
    expect(Object.values(answers).join(" ")).not.toContain("PAZXh0bgNhZW0");
  });

  it("emits keys in QUESTION order even when the response order differs", () => {
    // The live envelope lists "Your Whatsapp Number" before "Your Email ID" in
    // questions[], but returns the email RESPONSE first. pickField breaks
    // scoring ties by earliest question, so key order has to be question order.
    const responseIds = (submission().responses ?? []).map((r) => r.questionId);
    expect(responseIds.indexOf(QID.email)).toBeLessThan(responseIds.indexOf(QID.phone));

    const keys = Object.keys(answers);
    expect(keys.indexOf(LABEL.phone)).toBeLessThan(keys.indexOf(LABEL.email));
  });

  it("picks a sane text field out of an object answer", () => {
    const byText = extractAnswers(syntheticSubmission(), SYNTHETIC_MAP);
    expect(byText["How did you hear about us?"]).toBe("A friend");
    const byLabel = extractAnswers(
      syntheticSubmission({ answers: { [SQID.referral]: { id: "x", label: "Instagram ad" } } }),
      SYNTHETIC_MAP,
    );
    expect(byLabel["How did you hear about us?"]).toBe("Instagram ad");
    const byValue = extractAnswers(
      syntheticSubmission({ answers: { [SQID.referral]: { value: "Newsletter" } } }),
      SYNTHETIC_MAP,
    );
    expect(byValue["How did you hear about us?"]).toBe("Newsletter");
  });

  it("joins an array of option objects with \", \"", () => {
    const synthetic = extractAnswers(syntheticSubmission(), SYNTHETIC_MAP);
    expect(synthetic["Which platforms do you post on?"]).toBe("Instagram, YouTube");
  });

  it("renders a null/undefined answer as an empty string, never \"null\"", () => {
    const sparse = extractAnswers(
      submission({ answers: { [QID.city]: null, [QID.occupation]: undefined } }),
      QUESTION_MAP,
    );
    expect(sparse[LABEL.city]).toBe("");
    expect(sparse[LABEL.occupation]).toBe("");
  });

  it("stringifies numbers and booleans", () => {
    const coerced = extractAnswers(
      submission({ answers: { [QID.city]: 42, [QID.occupation]: false } }),
      QUESTION_MAP,
    );
    expect(coerced[LABEL.city]).toBe("42");
    expect(coerced[LABEL.occupation]).toBe("false");
  });

  it("drops responses whose questionId is not in the map", () => {
    const withOrphan = extractAnswers(
      submission({ answers: { [QID.orphan]: "deleted question" } }),
      QUESTION_MAP,
    );
    expect(Object.values(withOrphan)).not.toContain("deleted question");
  });

  it("does not mistake an Object.prototype member for a question id", () => {
    // A bare `questionMap[qid]` truthiness guard lets qid="toString" through on
    // an inherited function and then throws on the bucket, which would abort
    // the ENTIRE form's ingest inside the poller's per-form try.
    for (const qid of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      const joined = extractAnswers(
        { responses: [{ questionId: qid, answer: "x" }, { questionId: QID.fullName, answer: "Real" }] },
        QUESTION_MAP,
      );
      expect(joined[LABEL.fullName]).toBe("Real");
      expect(Object.values(joined)).not.toContain("x");
    }
  });

  it("stores a question titled __proto__ as a plain key", () => {
    const oddMap = buildQuestionMap([{ id: "q_odd", title: "__proto__" }]);
    const joined = extractAnswers(
      { responses: [{ questionId: "q_odd", answer: "not a prototype" }] },
      oddMap,
    );
    expect(joined["__proto__"]).toBe("not a prototype");
    expect(Object.keys(joined)).toEqual(["__proto__"]);
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

describe("FIELD_ALIASES — retuned against the real labels", () => {
  it("no longer carries the generic 'work' alias that captured FAQ copy", () => {
    expect(FIELD_ALIASES.occupation).not.toContain("work");
  });

  it("ranks 'designation' above 'what do you do'", () => {
    // Alias priority is the ONLY thing that beats the earlier-asked dropdown.
    const occupation: readonly string[] = FIELD_ALIASES.occupation;
    expect(occupation.indexOf("designation")).toBeLessThan(occupation.indexOf("what do you do"));
  });

  it("reaches the real 100-word essay label", () => {
    const bio: readonly string[] = FIELD_ALIASES.bio;
    expect(bio).toContain("write your heart");
    expect(bio).toContain("100 words");
  });
});

describe("pickField — scored word-boundary matching on the REAL form", () => {
  const answers = extractAnswers(submission(), QUESTION_MAP);

  it("resolves all six fields from the real envelope", () => {
    expect(pickField(answers, FIELD_ALIASES.fullName)).toBe("Test Applicant");
    expect(pickField(answers, FIELD_ALIASES.email)).toBe("applicant@example.invalid");
    expect(pickField(answers, FIELD_ALIASES.phone)).toBe("9000000001");
    expect(pickField(answers, FIELD_ALIASES.city)).toBe("Chennai");
    expect(pickField(answers, FIELD_ALIASES.occupation)).toBe("Freelance Video Editor");
    expect(pickField(answers, FIELD_ALIASES.bio)).toBe("REDACTED_ESSAY_TEXT_100_WORDS");
  });

  describe("the decoys", () => {
    const picked = Object.values(FIELD_ALIASES).map((aliases) => pickField(answers, aliases));

    it("never selects '@Your name, What do you do?'", () => {
      expect(answers[LABEL.decoyWhatDoYouDo]).toBe(DECOY_ANSWERS.whatDoYouDo);
      expect(picked).not.toContain(DECOY_ANSWERS.whatDoYouDo);
    });

    it("never selects 'How does the academy work week to week?'", () => {
      expect(answers[LABEL.decoyAcademyWork]).toBe(DECOY_ANSWERS.academyWork);
      expect(picked).not.toContain(DECOY_ANSWERS.academyWork);
    });

    it("never selects 'What is the LevelUp Creator Academy?'", () => {
      expect(answers[LABEL.decoyWhatIsAcademy]).toBe(DECOY_ANSWERS.whatIsAcademy);
      expect(picked).not.toContain(DECOY_ANSWERS.whatIsAcademy);
    });

    it("never selects 'At the Academy, you are mentored by:'", () => {
      expect(answers[LABEL.decoyMentoredBy]).toBe(DECOY_ANSWERS.mentoredBy);
      expect(picked).not.toContain(DECOY_ANSWERS.mentoredBy);
    });

    it("never competes for 'name' at all, even with the real name blank", () => {
      // Stripping the piped "@Your name," prefix leaves "what do you do?",
      // which carries no 'name' to match — so the decoy is not a full_name
      // candidate in ANY ordering, blank real name included. That is stronger
      // than out-ranking it: a blank name yields "" and the email local-part
      // fallback, never somebody's job bucket in the full_name column.
      const blanked = extractAnswers(
        submission({ answers: { [QID.fullName]: "" } }),
        QUESTION_MAP,
      );
      expect(blanked[LABEL.decoyWhatDoYouDo]).toBe(DECOY_ANSWERS.whatDoYouDo);
      expect(pickField(blanked, FIELD_ALIASES.fullName)).toBe("");
    });

    it("loses occupation to the real designation, and only floors it when blank", () => {
      // Alias priority is the sanctioned defence: 'designation' is declared
      // before 'what do you do', so the answered designation wins outright
      // however early the form asks the dropdown.
      expect(pickField(answers, FIELD_ALIASES.occupation)).toBe("Freelance Video Editor");

      // With the designation blank the last alias in the group does reach the
      // dropdown, and that is the intended floor rather than a hole: the
      // designation is an optional free-text input, and "Entrepreneur/Founder"
      // is an answer this applicant actually chose — unlike the FAQ copy the
      // deny-list refuses, which nobody wrote about themselves.
      const blanked = extractAnswers(
        submission({ answers: { [QID.occupation]: "" } }),
        QUESTION_MAP,
      );
      expect(pickField(blanked, FIELD_ALIASES.occupation)).toBe(DECOY_ANSWERS.whatDoYouDo);
      expect(
        toApplicationRow(
          submission({ answers: { [QID.occupation]: "", [QID.decoyWhatDoYouDo]: "" } }),
          QUESTION_MAP,
          OFFERING_ID,
          null,
        )?.occupation,
      ).toBeNull();
    });

    it("survives an all-digit question id reordering the map keys", () => {
      // Tally ids are 6-char base62, so an all-digit id is possible — and JS
      // hoists a canonical-array-index key ahead of every string key, which
      // would put the decoy first and let it win a same-tier 'name' tie on
      // position. The mention strip is what makes that harmless, so prove it.
      const shuffled = buildQuestionMap([
        { id: "g5zJLP", title: LABEL.fullName },
        { id: "123456", title: LABEL.decoyWhatDoYouDo },
      ]);
      expect(Object.keys(shuffled)[0]).toBe("123456");
      const joined = extractAnswers(
        {
          responses: [
            { questionId: "g5zJLP", answer: "Test Applicant" },
            { questionId: "123456", answer: DECOY_ANSWERS.whatDoYouDo },
          ],
        },
        shuffled,
      );
      expect(pickField(joined, FIELD_ALIASES.fullName)).toBe("Test Applicant");
    });
  });

  describe("the scoring key is (aliasIndex, matchTier, questionOrder)", () => {
    it("lets an earlier ALIAS beat a better-placed later one", () => {
      // Both are whole-word hits; 'designation' is declared before
      // 'what do you do', so position never gets a vote.
      expect(
        pickField(
          { "What do you do?": "Entrepreneur/Founder", "Your designation": "Video Editor" },
          FIELD_ALIASES.occupation,
        ),
      ).toBe("Video Editor");
    });

    it("prefers a better TIER over an earlier question, within one alias", () => {
      expect(
        pickField({ "Which city are you from?": "Kochi", "City": "Chennai" }, FIELD_ALIASES.city),
      ).toBe("Chennai");
    });

    it("breaks a same-tier tie by earliest question", () => {
      // Two genuine whole-word 'name' hits, neither denied nor stripped, so the
      // ONLY thing separating them is question order. Reversing the form's
      // question order therefore has to reverse the answer — a test whose
      // second label cannot win proves nothing about the tie-break.
      const first = { "Your name": "Test Applicant", "Referrer name": "Someone Else" };
      const reversed = { "Referrer name": "Someone Else", "Your name": "Test Applicant" };
      expect(pickField(first, FIELD_ALIASES.fullName)).toBe("Test Applicant");
      expect(pickField(reversed, FIELD_ALIASES.fullName)).toBe("Someone Else");
    });
  });

  describe("no bare-substring fallback", () => {
    it("does not match an alias buried inside a longer word", () => {
      expect(pickField({ "Filename convention": "kebab" }, FIELD_ALIASES.fullName)).toBe("");
      expect(pickField({ "Biology teacher": "yes" }, FIELD_ALIASES.bio)).toBe("");
      expect(pickField({ "Emails per week": "12" }, FIELD_ALIASES.email)).toBe("");
    });

    it("applies the SAME boundary at the front of a label as anywhere else", () => {
      // The prefix tier outranks the whole-word tier, so a looser boundary
      // there would be worse than useless: "Name_of_referrer" would score
      // TIER_PREFIX and beat a correct "Your name". Both tiers come off one
      // \b regex, so an underscore blocks the match at either position.
      expect(pickField({ "Name_of_referrer": "Someone Else" }, FIELD_ALIASES.fullName)).toBe("");
      expect(
        pickField(
          { "Your name": "Real Person", "Name_of_referrer": "Someone Else" },
          FIELD_ALIASES.fullName,
        ),
      ).toBe("Real Person");
      expect(pickField({ "Bio_of_mentor": "x" }, FIELD_ALIASES.bio)).toBe("");
    });

    it("still ranks a real prefix match above a mid-label one", () => {
      expect(
        pickField({ "Your city": "Kochi", "City of residence": "Chennai" }, FIELD_ALIASES.city),
      ).toBe("Chennai");
    });

    it("no longer treats any question containing 'work' as an occupation", () => {
      expect(pickField({ "Where do you work from?": "Home" }, FIELD_ALIASES.occupation)).toBe("");
    });
  });

  describe("the deny-list", () => {
    it("outranks even an exact alias match", () => {
      expect(pickField({ "Select one": "a grant, please" }, ["select one"])).toBe("");
      expect(pickField({ "At the Academy, you are mentored by:": "x" }, ["mentored"])).toBe("");
    });

    it("refuses every informational block on the real form", () => {
      for (const label of [
        LABEL.decoyAcademyWork,
        LABEL.decoyWhatIsAcademy,
        LABEL.decoyMentoredBy,
        LABEL.decoyEndOfProgram,
        LABEL.decoySelectOne,
      ]) {
        expect(label).toBeTruthy();
        // Aliased on the label's own leading words, so only the deny-list can
        // be what keeps it out.
        const alias = label.toLowerCase().split(" ").slice(0, 4).join(" ");
        expect(pickField({ [label]: "marketing copy" }, [alias])).toBe("");
      }
    });

    it("is checked against the CLEANED label, not the raw title", () => {
      // The real title ends in a newline and would otherwise slip the check.
      expect(
        pickField({ "How does the academy work week to week?\n": "copy" }, ["how does the academy"]),
      ).toBe("");
    });

    it("is anchored, so it cannot silence a real question on another form", () => {
      // This list runs against EVERY cohort form the poller scans, and a loose
      // substring there costs a NULL column — or the whole submission, when the
      // label it silences is the email one. So: "select one" is denied only as
      // a whole label, and "by the end of the program" only as the curriculum
      // block, never as the opening clause of a genuine question.
      expect(
        pickField({ "Which city are you from? (select one)": "Chennai" }, FIELD_ALIASES.city),
      ).toBe("Chennai");
      expect(
        pickField(
          { "By the end of the program, what city will you be in?": "Chennai" },
          FIELD_ALIASES.city,
        ),
      ).toBe("Chennai");
      expect(pickField({ "Select one": "x" }, ["select one"])).toBe("");
      expect(
        pickField({ [LABEL.decoyEndOfProgram]: "All of the above" }, ["by the end of the program"]),
      ).toBe("");
    });
  });

  describe("the piped-personalisation prefix is stripped, not denied", () => {
    // Tally splices an earlier answer into a later title and the API returns the
    // token unresolved: "@<referenced question title>, <the real question>".
    // Denying any label carrying it was wrong in both directions at once.
    it("matches the question the author actually asked", () => {
      const only = { "@Your name, What do you do?": "Entrepreneur/Founder" };
      expect(pickField(only, FIELD_ALIASES.fullName)).toBe("");
      expect(pickField(only, FIELD_ALIASES.occupation)).toBe("Entrepreneur/Founder");
    });

    it("still reaches a piped label's own field, on any form", () => {
      // The over-match direction. A denied "@your name" made every one of these
      // unselectable poller-wide — and an empty email means toApplicationRow
      // drops the ENTIRE submission, not just one column.
      expect(pickField({ "@Your name, your Email ID": "a@b.example" }, FIELD_ALIASES.email))
        .toBe("a@b.example");
      expect(
        pickField(
          { "@Your name, Write your heart out! (In 100 words or more)": "the essay" },
          FIELD_ALIASES.bio,
        ),
      ).toBe("the essay");
      expect(pickField({ "@Your name, Which City are you from?": "Chennai" }, FIELD_ALIASES.city))
        .toBe("Chennai");
      expect(
        toApplicationRow(
          { id: "s_piped", responses: [{ questionId: "q1", answer: "a@b.example" }] },
          buildQuestionMap([{ id: "q1", title: "@Your name, your Email ID" }]),
          OFFERING_ID,
          null,
        )?.email,
      ).toBe("a@b.example");
    });

    it("keeps out the same decoy piped from a differently-titled question", () => {
      // The under-match direction: Tally pipes the REFERENCED question's title,
      // so a form whose name field is called "Full Name" produces this instead
      // — which a literal "@your name" deny entry never saw, and which would
      // then have filed the job bucket as full_name.
      expect(
        pickField({ "@Full Name, What do you do?": "Entrepreneur/Founder" }, FIELD_ALIASES.fullName),
      ).toBe("");
    });

    it("only strips a LEADING token, and leaves an ordinary '@' label alone", () => {
      expect(pickField({ "@ Your Instagram name": "@someone" }, FIELD_ALIASES.fullName))
        .toBe("@someone");
      expect(pickField({ "Your name, as on your PAN card": "Test Applicant" }, FIELD_ALIASES.fullName))
        .toBe("Test Applicant");
    });
  });

  it("falls through to a later alias when the earlier one is absent", () => {
    expect(pickField({ "Which city do you live in?": "Kochi" }, FIELD_ALIASES.city)).toBe("Kochi");
    expect(pickField({ "Current profession": "DOP" }, FIELD_ALIASES.occupation)).toBe("DOP");
    expect(pickField({ "Mobile no.": "9788385577" }, FIELD_ALIASES.phone)).toBe("9788385577");
  });

  it("falls through to the next ALIAS when the matching label has an empty answer", () => {
    expect(pickField({ "About you": "", "Bio": "Colourist" }, FIELD_ALIASES.bio)).toBe("Colourist");
  });

  describe("one label per alias — the runner-up is never consulted", () => {
    // The old "about" vs "How did you hear about us?" collision is designed out
    // by the retuned bio aliases, but the PROPERTY still has to hold, and it
    // has to hold in BOTH orderings — the guarantee is "the alias's runner-up
    // is never reached", NOT "the semantically right label always wins".
    // Whichever of two same-tier labels the form asks first is the one that
    // speaks; a blank there yields "" instead of the other one's answer.
    const essay = "Tell us about yourself";
    const referral = "Tell us who referred you";

    it("yields \"\" when the winning label is blank (essay asked first)", () => {
      expect(pickField({ [essay]: "", [referral]: "A friend" }, FIELD_ALIASES.bio)).toBe("");
    });

    it("yields \"\" when the winning label is blank (referral asked first)", () => {
      expect(pickField({ [referral]: "", [essay]: "Colourist" }, FIELD_ALIASES.bio)).toBe("");
    });

    it("returns the winning label's answer when it has one", () => {
      expect(pickField({ [essay]: "Colourist", [referral]: "A friend" }, FIELD_ALIASES.bio))
        .toBe("Colourist");
    });

    it("is why a generic alias must never be the only thing reaching the essay", () => {
      // Reversed, "tell us" hands bio the referral answer. Nothing in pickField
      // prevents that — the bio group leading with the real form's own labels
      // is what does, so pin that the specific alias wins outright.
      expect(pickField({ [referral]: "A friend", [essay]: "Colourist" }, FIELD_ALIASES.bio))
        .toBe("A friend");
      expect(
        pickField(
          {
            [referral]: "A friend",
            "Write your heart out! (In 100 words or more)": "The real essay",
          },
          FIELD_ALIASES.bio,
        ),
      ).toBe("The real essay");
    });
  });

  it("returns \"\" when nothing matches", () => {
    expect(pickField({ "Anything else?": "nope" }, FIELD_ALIASES.email)).toBe("");
    expect(pickField({}, FIELD_ALIASES.fullName)).toBe("");
  });

  it("still resolves the synthetic form's labels", () => {
    const synthetic = extractAnswers(syntheticSubmission(), SYNTHETIC_MAP);
    expect(pickField(synthetic, FIELD_ALIASES.fullName)).toBe("Meera Iyer");
    expect(pickField(synthetic, FIELD_ALIASES.email)).toBe("meera@example.invalid");
    expect(pickField(synthetic, FIELD_ALIASES.phone)).toBe("+919788385577");
    expect(pickField(synthetic, FIELD_ALIASES.city)).toBe("Chennai");
    expect(pickField(synthetic, FIELD_ALIASES.occupation)).toBe("Editor");
    expect(pickField(synthetic, FIELD_ALIASES.bio)).toBe(
      "Six years cutting wedding films, moving into brand work.",
    );
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
    expect(rows.map((r) => r?.email)).not.toContain("history@example.invalid");
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
    const empty = {
      inWindow: [],
      skippedUndated: 0,
      skippedAfterDeadline: 0,
      stoppedAtCutoff: false,
    };
    expect(partitionByCutoff([], EDITION_2_CUTOFF)).toEqual(empty);
    expect(partitionByCutoff(null, EDITION_2_CUTOFF)).toEqual(empty);
  });
});

describe("toApplicationRow — the exact cohort_applications payload", () => {
  it("maps the REAL submission end to end", () => {
    const row = toApplicationRow(submission(), QUESTION_MAP, OFFERING_ID, "user-1");
    expect(row).toEqual({
      offering_id: OFFERING_ID,
      user_id: "user-1",
      full_name: "Test Applicant",
      email: "applicant@example.invalid",
      phone: "9000000001",
      city: "Chennai",
      occupation: "Freelance Video Editor",
      bio: "REDACTED_ESSAY_TEXT_100_WORDS",
      status: "submitted",
      tally_response_id: REAL_SUBMISSION_ID,
      tally_data: expect.objectContaining({ id: REAL_SUBMISSION_ID }),
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
    expect(row?.full_name).toBe("applicant");
  });

  it("stores unanswered optional fields as null, not \"\"", () => {
    const row = toApplicationRow(
      submission({
        answers: {
          [QID.city]: null,
          [QID.occupation]: "",
          [QID.decoyWhatDoYouDo]: "",
          [QID.bio]: null,
        },
      }),
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
