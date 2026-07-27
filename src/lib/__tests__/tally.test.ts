import { describe, it, expect } from "vitest";
import {
  buildQuestionMap,
  buildQuestionTypeMap,
  dedupeBySubmissionId,
  extractAnswers,
  extractAnswerTypes,
  FIELD_ALIASES,
  formIdFromTallyUrl,
  isInIntakeWindow,
  isIngestableSubmission,
  partitionByCutoff,
  pickField,
  resolveIntakeWindow,
  toApplicationRow,
  TYPE_ALLOWLIST,
  type FieldKey,
} from "@shared/tally";
import {
  closedEditionPage,
  DEADLINE_BOUNDARY,
  EDITION_2_CUTOFF,
  EDITION_2_DEADLINE,
  EDITION_2_WINDOW_END_IST,
  envelope,
  LABEL,
  offeringWindow,
  QID,
  REAL_QUESTIONS,
  REAL_SUBMISSION_ID,
  SQID,
  straddlingPage,
  submission,
  SYNTHETIC_QUESTIONS,
  syntheticSubmission,
  typedForm,
  type TypedField,
  type TypedFormFixture,
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
const REAL_TYPE_MAP = buildQuestionTypeMap(REAL_QUESTIONS);
const REAL_TYPES = extractAnswerTypes(QUESTION_MAP, REAL_TYPE_MAP);
const OFFERING_ID = "11111111-1111-4111-8111-111111111111";

/** `pickField` with the type channel on, exactly as `toApplicationRow` calls it. */
function pickTyped(form: TypedFormFixture, field: FieldKey): string {
  return pickField(form.answers, FIELD_ALIASES[field], {
    types: form.types,
    prefer: TYPE_ALLOWLIST[field],
  });
}

/**
 * The same questions asked in BOTH orders. Every regression this file has ever
 * shipped was right in one ordering and wrong in the other, so a single-ordering
 * assertion proves nothing.
 */
function typedBothWays(fields: readonly TypedField[], field: FieldKey): [string, string] {
  return [
    pickTyped(typedForm(fields), field),
    pickTyped(typedForm([...fields].reverse()), field),
  ];
}

/** The same pair with the type channel OFF — the pre-fix behaviour, for contrast. */
function untypedBothWays(fields: readonly TypedField[], field: FieldKey): [string, string] {
  return [
    pickField(typedForm(fields).answers, FIELD_ALIASES[field]),
    pickField(typedForm([...fields].reverse()).answers, FIELD_ALIASES[field]),
  ];
}

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

describe("buildQuestionTypeMap — the fact the envelope states", () => {
  it("agrees with buildQuestionMap about which questions exist", () => {
    // THE INVARIANT THE WHOLE TYPE LAYER RESTS ON. The two maps are read
    // together and keyed by the same id, so a row one keeps and the other drops
    // is a form the parser disagrees with itself about — e.g. a hidden
    // attribution field (title:null) that regained a type entry and could then
    // be ranked as a candidate. Both drops (no string id, empty cleaned title)
    // have to be repeated verbatim in both functions.
    expect(Object.keys(REAL_TYPE_MAP)).toEqual(Object.keys(QUESTION_MAP));
    expect(Object.keys(buildQuestionTypeMap(SYNTHETIC_QUESTIONS))).toEqual(
      Object.keys(SYNTHETIC_MAP),
    );
    // SYNTHETIC_QUESTIONS carries a TITLE block ("<h1>  </h1>") and a DIVIDER
    // ("") precisely to exercise that, so prove they are the rows being dropped.
    expect(buildQuestionTypeMap(SYNTHETIC_QUESTIONS)[SQID.heading]).toBeUndefined();
    expect(buildQuestionTypeMap(SYNTHETIC_QUESTIONS)[SQID.divider]).toBeUndefined();
  });

  it("states the block type of every field the poller maps", () => {
    // Ground truth, from the committed live envelope. These six lines are the
    // entire premise of fix round 3: the form already says which question is
    // the email and which are the FAQ blocks.
    expect(REAL_TYPE_MAP[QID.fullName]).toBe("INPUT_TEXT");
    expect(REAL_TYPE_MAP[QID.email]).toBe("INPUT_EMAIL");
    expect(REAL_TYPE_MAP[QID.phone]).toBe("INPUT_NUMBER");
    expect(REAL_TYPE_MAP[QID.city]).toBe("INPUT_TEXT");
    expect(REAL_TYPE_MAP[QID.occupation]).toBe("INPUT_TEXT");
    expect(REAL_TYPE_MAP[QID.bio]).toBe("TEXTAREA");
  });

  it("marks the occupation decoy a DROPDOWN and every FAQ decoy a MULTIPLE_CHOICE", () => {
    expect(REAL_TYPE_MAP[QID.decoyWhatDoYouDo]).toBe("DROPDOWN");
    for (const id of [
      QID.decoyWhatIsAcademy,
      QID.decoyAcademyWork,
      QID.decoyMentoredBy,
      QID.decoyEndOfProgram,
      QID.decoySelectOne,
    ]) {
      expect(REAL_TYPE_MAP[id]).toBe("MULTIPLE_CHOICE");
    }
  });

  it("stores '' rather than nothing for a question with no usable type", () => {
    // Key-set equality again, from the other side: a form whose questions carry
    // no type must still produce an entry per question, or the label map and
    // the type map stop describing the same form.
    const untyped = buildQuestionTypeMap([
      { id: "q1", title: "Your Email ID" },
      { id: "q2", title: "Your name", type: null },
      { id: "q3", title: "Your city", type: 42 as unknown as string },
    ]);
    expect(untyped).toEqual({ q1: "", q2: "", q3: "" });
  });

  it("normalises the type, and tolerates a null/undefined questions array", () => {
    expect(buildQuestionTypeMap([{ id: "q1", title: "Email", type: " input_email " }]).q1)
      .toBe("INPUT_EMAIL");
    expect(buildQuestionTypeMap(null)).toEqual({});
    expect(buildQuestionTypeMap(undefined)).toEqual({});
    expect(buildQuestionTypeMap([{ title: "No id here", type: "INPUT_TEXT" }])).toEqual({});
  });
});

describe("extractAnswerTypes — the type side of the join", () => {
  it("re-keys the type onto the same label extractAnswers uses", () => {
    const answers = extractAnswers(submission(), QUESTION_MAP);
    for (const label of [LABEL.email, LABEL.phone, LABEL.bio]) {
      expect(answers[label]).toBeTruthy();
      expect(REAL_TYPES[label]).toBeTruthy();
    }
    expect(REAL_TYPES[LABEL.email]).toBe("INPUT_EMAIL");
    expect(REAL_TYPES[LABEL.decoyMentoredBy]).toBe("MULTIPLE_CHOICE");
  });

  it("yields '' — not a guess — when two questions share a label but not a type", () => {
    // extractAnswers collapses duplicate labels and takes the first NON-EMPTY
    // answer, which may well have come from the second question, so taking the
    // first type would be a guess. Guessing MULTIPLE_CHOICE would strike the
    // label out entirely and could lose a real email — i.e. the whole
    // submission. Ambiguity therefore degrades to the fail-soft rank.
    const questions = [
      { id: "q1", title: "Email", type: "MULTIPLE_CHOICE" },
      { id: "q2", title: "Email", type: "INPUT_EMAIL" },
    ];
    const types = extractAnswerTypes(buildQuestionMap(questions), buildQuestionTypeMap(questions));
    expect(types["Email"]).toBe("");
    // Agreeing duplicates keep their type.
    const agreeing = [
      { id: "q1", title: "Email", type: "INPUT_EMAIL" },
      { id: "q2", title: "Email", type: "INPUT_EMAIL" },
    ];
    expect(
      extractAnswerTypes(buildQuestionMap(agreeing), buildQuestionTypeMap(agreeing))["Email"],
    ).toBe("INPUT_EMAIL");
  });

  it("returns an empty map when no type map is supplied at all", () => {
    expect(extractAnswerTypes(QUESTION_MAP, null)).toEqual({});
    expect(extractAnswerTypes(QUESTION_MAP, undefined)).toEqual({});
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

  it("leads name / email / phone with the applicant's own possessive form", () => {
    // Alias priority is scored ABOVE tier, so it is the only lever INSIDE
    // these lists that can outrank a third-party label PREFIX-matching the bare
    // noun ("Name of referrer", "Email ID of the person who referred you"); the
    // THIRD_PARTY_LABEL sweep is the other, and it sits outside them. Pinning
    // the order here means the fix cannot be undone by a later "tidy-up".
    const fullName: readonly string[] = FIELD_ALIASES.fullName;
    const email: readonly string[] = FIELD_ALIASES.email;
    const phone: readonly string[] = FIELD_ALIASES.phone;
    expect(fullName.indexOf("your name")).toBeLessThan(fullName.indexOf("name"));
    expect(email.indexOf("your email")).toBeLessThan(email.indexOf("email"));
    expect(phone.indexOf("your whatsapp")).toBeLessThan(phone.indexOf("whatsapp"));
    expect(phone.indexOf("your phone")).toBeLessThan(phone.indexOf("phone"));
  });

  it("promotes ONLY the possessive form, keeping every bare noun ahead of its compound", () => {
    // The mechanism cuts both ways: promoting an alias the applicant's own
    // label does NOT contain hands the group to whatever third-party label
    // does. An earlier cut of this fix put "full name" ahead of "name" and
    // "phone number" ahead of "phone", which filed somebody else's compound
    // over a plainly-worded "Name" / "Phone" — order-independently, the same
    // defect class the possessive lead closes.
    const fullName: readonly string[] = FIELD_ALIASES.fullName;
    const phone: readonly string[] = FIELD_ALIASES.phone;
    expect(fullName.indexOf("name")).toBeLessThan(fullName.indexOf("full name"));
    expect(phone.indexOf("phone")).toBeLessThan(phone.indexOf("phone number"));
    // And the behaviour that ordering buys, on wordings THIRD_PARTY_LABEL
    // cannot recognise — which is where alias order is the ONLY defence.
    expect(
      pickField({ "Full name of my mentor": "M", "Name": "Asha Menon" }, FIELD_ALIASES.fullName),
    ).toBe("Asha Menon");
    expect(
      pickField({ "Alternate phone number": "222", "Phone": "9000000002" }, FIELD_ALIASES.phone),
    ).toBe("9000000002");
  });

  it("keeps the bare noun as the floor, so a plainly-worded form still resolves", () => {
    // The possessive lead re-ranks candidates; it must not remove any. A form
    // that simply asks "Name" / "Email" / "Phone" is the common case, and the
    // poller walks forms nobody here has read.
    expect(pickField({ "Name": "Asha Menon" }, FIELD_ALIASES.fullName)).toBe("Asha Menon");
    expect(pickField({ "Email": "asha@example.invalid" }, FIELD_ALIASES.email))
      .toBe("asha@example.invalid");
    expect(pickField({ "Phone": "9000000002" }, FIELD_ALIASES.phone)).toBe("9000000002");
  });

  it("keeps the compound noun reachable as a floor when the bare one is blank", () => {
    // "phone number" sits after "phone" and looks redundant — any \bphone
    // number\b hit implies a \bphone\b hit — but it is not: when the bare
    // "Phone" input is present and EMPTY, the sweep moves to the next ALIAS,
    // and "phone number" is what then reaches the other label. Same for
    // "full name" behind "name". Removing either loses a real answer.
    expect(pickField({ "Phone": "", "Contact phone number": "222" }, FIELD_ALIASES.phone))
      .toBe("222");
    expect(pickField({ "Name": "", "Full name": "Asha Menon" }, FIELD_ALIASES.fullName))
      .toBe("Asha Menon");
  });

  it("leaves city alone — its pinned behaviour is the opposite one", () => {
    // "City of residence" is MEANT to beat a bare "Your city" on tier, so
    // leading this group with "your city" would flip a pinned case rather than
    // fix anything. city has no observed third-party twin.
    expect(FIELD_ALIASES.city).not.toContain("your city");
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
      //
      // THE PAIR WAS "Your name" / "Referrer name" AND IS RETIRED. fullName now
      // LEADS with "your name" (fix round 2, finding 1), so the applicant's own
      // field wins on alias priority before tier or position is consulted —
      // correct, but it means that pair can no longer demonstrate a tie at all.
      // These two are neutral by construction: neither is the lead alias of any
      // group, both are mid-label 'name' hits, so nothing but position separates
      // them. The third-party pairs get their own suite below.
      const first = { "Preferred name": "Test Applicant", "Legal name": "T Applicant" };
      const reversed = { "Legal name": "T Applicant", "Preferred name": "Test Applicant" };
      expect(pickField(first, FIELD_ALIASES.fullName)).toBe("Test Applicant");
      expect(pickField(reversed, FIELD_ALIASES.fullName)).toBe("T Applicant");
    });
  });

  describe("a third party's field never outranks the applicant's own", () => {
    // FIX ROUND 2, FINDING 1 — a regression the real-envelope fixture cannot
    // see. "Name of X" / "Email ID of X" / "Phone number of X" all START with
    // the generic alias, so they scored TIER_PREFIX while the applicant's own
    // "Your Email ID" could only ever score TIER_WORD; tier outranks position,
    // so the referrer won deterministically. Every real 81dRPA label is a
    // TIER_WORD hit, which is exactly why the live form stayed correct while
    // the rule underneath it was wrong.
    //
    // BOTH ORDERINGS ARE ASSERTED ON PURPOSE. The pre-FX-1 includes() matcher
    // was at least right whenever the applicant's field came first, so a
    // single-ordering test would have called this regression fixed.
    //
    // TWO LEVERS ARE UNDER TEST HERE, NOT ONE. Alias order handles the pairs
    // where the applicant's label carries the possessive ("Your Email ID"); the
    // THIRD_PARTY_LABEL sweep handles the rest, and it is the only thing that
    // can reach a plainly-worded "Email Address" tying the referrer's label at
    // the same tier. Both are exercised below, and the sweep is proven to be a
    // demotion rather than a deny.
    //
    // AND THE SWEEP'S VOCABULARY IS PROVEN TO POINT AT THIRD PARTIES ONLY. An
    // earlier cut matched "<noun> of <anyone>" and carved out an APPLICANT word
    // list; that list was incomplete, so it demoted real applicants ("Email of
    // the filmmaker") and handed the group to a genuine "Referrer email" in
    // both orderings — the same defect, inverted. The suites below pin both
    // directions: a recognised third party never wins, and a label the
    // vocabulary does not recognise is never moved.
    const bothWays = (
      own: readonly [string, string],
      other: readonly [string, string],
      aliases: readonly string[],
    ) => [
      pickField({ [own[0]]: own[1], [other[0]]: other[1] }, aliases),
      pickField({ [other[0]]: other[1], [own[0]]: own[1] }, aliases),
    ];

    it("keeps the applicant's email out of the referrer's hands", () => {
      // The worst of the four. email is the (offering_id, email) dedupe key,
      // the users-join key and the reminder recipient, and the poller never
      // UPDATEs a row — so a wrong pick is permanent and hides the application
      // from the applicant, who cannot see it under RLS either.
      expect(
        bothWays(
          ["Your Email ID", "real@example.invalid"],
          ["Email ID of the person who referred you", "ref@example.invalid"],
          FIELD_ALIASES.email,
        ),
      ).toEqual(["real@example.invalid", "real@example.invalid"]);
    });

    it("keeps the applicant's name out of the referrer's hands", () => {
      expect(
        bothWays(
          ["Your Name", "Real Person"],
          ["Name of referrer", "Someone Else"],
          FIELD_ALIASES.fullName,
        ),
      ).toEqual(["Real Person", "Real Person"]);
    });

    it("keeps the applicant's whatsapp out of the reference's hands", () => {
      expect(
        bothWays(
          ["Your WhatsApp number", "111"],
          ["Phone number of your reference", "222"],
          FIELD_ALIASES.phone,
        ),
      ).toEqual(["111", "111"]);
    });

    it("does the same when the applicant's field is worded as a phone", () => {
      // The phone group has two possessive leads because forms use both words;
      // this pair exercises "your phone" rather than "your whatsapp".
      expect(
        bothWays(
          ["Your phone number", "111"],
          ["Phone number of your reference", "222"],
          FIELD_ALIASES.phone,
        ),
      ).toEqual(["111", "111"]);
    });

    it("holds when the applicant's own label is a BARE noun, with no possessive", () => {
      // The case alias order cannot reach, and the one a form nobody has read
      // is most likely to ask: "Name" / "Email" / "Phone" against a third
      // party's version of the same noun. Nothing here says "your", so the
      // THIRD_PARTY_LABEL sweep is the only thing standing between the
      // applicant and somebody else's contact details.
      expect(
        bothWays(["Name", "Real Person"], ["Full name of guardian", "G"], FIELD_ALIASES.fullName),
      ).toEqual(["Real Person", "Real Person"]);
      expect(
        bothWays(
          ["Email Address", "real@example.invalid"],
          ["Email ID of the person who referred you", "ref@example.invalid"],
          FIELD_ALIASES.email,
        ),
      ).toEqual(["real@example.invalid", "real@example.invalid"]);
      expect(
        bothWays(["Phone", "111"], ["Phone number of your reference", "222"], FIELD_ALIASES.phone),
      ).toEqual(["111", "111"]);
    });

    it("holds when the APPLICANT's label is the compound one", () => {
      // The mirror of the case above, and the reason "full name" / "phone
      // number" could not simply be promoted: on this pair the applicant is the
      // one saying "Full Name" and the third party prefix-matches the bare
      // noun. Both directions have to hold at once, which is what the sweep —
      // rather than any alias ordering — buys.
      expect(
        bothWays(["Full Name", "Real Person"], ["Name of referrer", "Ref"], FIELD_ALIASES.fullName),
      ).toEqual(["Real Person", "Real Person"]);
      expect(
        bothWays(
          ["Mobile number", "111"],
          ["Mobile number of your parent", "222"],
          FIELD_ALIASES.phone,
        ),
      ).toEqual(["111", "111"]);
    });

    it("catches the bare-compound wording too, not just '<noun> of <someone>'", () => {
      // "Referrer email" / "Guardian name" / "Emergency phone number" never say
      // "of", so the "<noun> of <role>" pattern cannot see them. They are the
      // wording that beats an applicant whose own label is only a mid-label hit
      // ("Legal name", "Contact email"): both score TIER_WORD, and the referral
      // block is usually asked first, so position hands it over. The second
      // anchored pattern — "<role>['s] <identity noun>" — is what settles those.
      expect(
        bothWays(["Legal name", "Real Person"], ["Guardian name", "Other"], FIELD_ALIASES.fullName),
      ).toEqual(["Real Person", "Real Person"]);
      expect(
        bothWays(["Legal name", "Real Person"], ["Referrer's name", "Other"], FIELD_ALIASES.fullName),
      ).toEqual(["Real Person", "Real Person"]);
      expect(
        bothWays(["Phone", "111"], ["Emergency phone number", "222"], FIELD_ALIASES.phone),
      ).toEqual(["111", "111"]);
      expect(
        bothWays(["Name", "Real Person"], ["Emergency contact name", "Other"], FIELD_ALIASES.fullName),
      ).toEqual(["Real Person", "Real Person"]);
    });

    it("never demotes an APPLICANT whose own field is worded institutionally", () => {
      // THE REGRESSION THIS VOCABULARY'S DIRECTION EXISTS TO MAKE IMPOSSIBLE.
      // The previous cut demoted "<identity noun> of <anything not in a short
      // applicant word list>", so a form that calls its applicant a filmmaker,
      // an artist, a delegate, a trainee or "the person applying" had its OWN
      // email pushed out of the first sweep — and lost, in both orderings, to a
      // genuine "Referrer email" the rule never recognised. Pinning only "Name
      // of the applicant" (the one wording that happened to be carved out) is
      // exactly the false confidence that let it through review, so the whole
      // class is enumerated here instead.
      const applicantWordings = [
        "the applicant",
        "the candidate",
        "the participant",
        "the student",
        "the filmmaker",
        "the artist",
        "the nominee",
        "the delegate",
        "the trainee",
        "the person applying",
        "the founder",
        "the team lead",
      ];
      for (const who of applicantWordings) {
        expect(
          bothWays([`Name of ${who}`, "Real Person"], ["Referrer name", "Other"], FIELD_ALIASES.fullName),
        ).toEqual(["Real Person", "Real Person"]);
        expect(
          bothWays(
            [`Email of ${who}`, "real@example.invalid"],
            ["Reference email", "other@example.invalid"],
            FIELD_ALIASES.email,
          ),
        ).toEqual(["real@example.invalid", "real@example.invalid"]);
        expect(
          bothWays([`Phone number of ${who}`, "111"], ["Emergency phone", "222"], FIELD_ALIASES.phone),
        ).toEqual(["111", "111"]);
      }
    });

    it("leaves a wording it does not recognise exactly where it already was", () => {
      // THE HONEST LIMIT, PINNED SO IT CANNOT BE MISREAD AS A GUARANTEE. The
      // role vocabulary is finite and no vocabulary is complete. An unlisted
      // role in the "<noun> of <someone>" shape is not demoted, so it is
      // decided by tier and then position like any other label — and when the
      // applicant's own label is only a mid-label hit, the third party WINS,
      // in both orderings. This is not a desired answer; it is the pre-existing
      // behaviour of a rule that deliberately does nothing when it is unsure,
      // because the alternative — guessing which side is the applicant — is the
      // regression above.
      expect(
        bothWays(["Legal name", "Real Person"], ["Name of my mentor", "Other"], FIELD_ALIASES.fullName),
      ).toEqual(["Other", "Other"]);
      // Where the applicant's own label scores better, tier alone still carries
      // it — which is why an incomplete vocabulary is survivable at all.
      expect(
        bothWays(["Name", "Real Person"], ["Name of my mentor", "Other"], FIELD_ALIASES.fullName),
      ).toEqual(["Real Person", "Real Person"]);
      expect(
        bothWays(["Your name", "Real Person"], ["Name of my mentor", "Other"], FIELD_ALIASES.fullName),
      ).toEqual(["Real Person", "Real Person"]);
    });

    it("does not fall through to a third party when the applicant's answer is BLANK", () => {
      // Sweep 2 is gated on "the applicant's labels matched no alias at all",
      // not on "sweep 1 produced no value". An applicant email question that is
      // optional and left empty must yield "" — toApplicationRow then skips the
      // submission — rather than filing the row under the referrer's address,
      // which would be the permanent (offering_id, email) dedupe key, the
      // users-join key and the reminder recipient for a person who never
      // applied. A skipped submission is recoverable; a wrong one is not.
      expect(
        pickField(
          { "Your Email ID": "", "Email ID of the person who referred you": "ref@example.invalid" },
          FIELD_ALIASES.email,
        ),
      ).toBe("");
      expect(
        pickField({ "Your Name": "", "Name of referrer": "Someone Else" }, FIELD_ALIASES.fullName),
      ).toBe("");
      // The gate is per GROUP, not per form: the same submission still resolves
      // every field the applicant DID answer.
      expect(
        pickField(
          { "Your Email ID": "", "Your Name": "Real Person", "Name of referrer": "Someone Else" },
          FIELD_ALIASES.fullName,
        ),
      ).toBe("Real Person");
    });

    it("DEMOTES a third party's field, never denies it", () => {
      // The whole reason this is a sweep and not a deny-list entry. On a form
      // where the referrer's email is the ONLY email, the row still has one —
      // a deny would return "" and toApplicationRow would drop the submission
      // outright, on forms nobody here has read, every time the pattern
      // over-matched. A re-rank costs at most a wrong column; a deny costs the
      // whole application.
      expect(
        pickField(
          { "Email ID of the person who referred you": "ref@example.invalid" },
          FIELD_ALIASES.email,
        ),
      ).toBe("ref@example.invalid");
      expect(pickField({ "Name of referrer": "Someone Else" }, FIELD_ALIASES.fullName))
        .toBe("Someone Else");
      // Including when the form has other labels, just none this group can use:
      // the fallback is gated on "this GROUP matched nothing", not on "every
      // label on the form was demoted".
      expect(
        pickField(
          { "Your city": "Kochi", "Name of referrer": "Someone Else" },
          FIELD_ALIASES.fullName,
        ),
      ).toBe("Someone Else");
    });

    it("cannot reach city, occupation or bio — it is anchored to identity nouns", () => {
      // The sweep is scoped by construction: a pattern must START with a name /
      // email / phone noun, so no city, occupation or bio label can match one.
      // That is what keeps "City of residence" beating a bare "Your city" on
      // tier, and what a loose /\breferr(er|ed)\b/ deny would have broken along
      // with the essay decoy below it.
      expect(
        pickField({ "Your city": "Kochi", "City of residence": "Chennai" }, FIELD_ALIASES.city),
      ).toBe("Chennai");
      expect(
        pickField(
          { "Tell us who referred you": "Someone Else", "Tell us about yourself": "My story" },
          FIELD_ALIASES.bio,
        ),
      ).toBe("Someone Else");
      // Both assertions are about the ENGLISH layer alone, and both still hold
      // with the type channel on: the block type is only ever a tie-break under
      // the alias and the tier, so it cannot re-open a question those two have
      // already answered ("what the preference MOVES that alias order used to
      // decide" pins the second one in both directions).
      //
      // And the residual that scoping leaves behind, stated rather than hidden:
      // an "<other field> of <someone>" label outside the three identity groups
      // is still decided by tier alone. Widening the sweep to cover it would
      // put "City of residence" and the essay decoy back in play, which the two
      // assertions above exist to prevent — so this stays a known limit, not a
      // desired answer.
      expect(
        pickField(
          { "Occupation of your referrer": "Editor", "Your occupation": "Director" },
          FIELD_ALIASES.occupation,
        ),
      ).toBe("Editor");
    });

    it("files the row against the applicant, not the referrer, end to end", () => {
      // The consequence, not just the selection: this is the exact
      // cohort_applications payload a third-party-carrying form produces.
      const thirdPartyForm = buildQuestionMap([
        { id: "q_ref_name", title: "Name of referrer" },
        { id: "q_ref_email", title: "Email ID of the person who referred you" },
        { id: "q_ref_phone", title: "Phone number of your reference" },
        { id: "q_name", title: "Your Name" },
        { id: "q_email", title: "Your Email ID" },
        { id: "q_phone", title: "Your WhatsApp number" },
      ]);
      const row = toApplicationRow(
        {
          id: "sub_third_party",
          responses: [
            { questionId: "q_ref_name", answer: "Someone Else" },
            { questionId: "q_ref_email", answer: "ref@example.invalid" },
            { questionId: "q_ref_phone", answer: "222" },
            { questionId: "q_name", answer: "Real Person" },
            { questionId: "q_email", answer: "real@example.invalid" },
            { questionId: "q_phone", answer: "111" },
          ],
        },
        thirdPartyForm,
        OFFERING_ID,
        null,
      );
      expect(row?.full_name).toBe("Real Person");
      expect(row?.email).toBe("real@example.invalid");
      expect(row?.phone).toBe("111");
    });

    it("holds on a form whose labels look NOTHING like 81dRPA's", () => {
      // The "NOTHING HERE MAY BE TUNED TO ONE FORM" invariant, stated at the
      // top of tally.ts. The poller walks EVERY staged offering carrying a
      // tally_form_url, so a rule that merely happens to be inert on the one
      // form anyone has read is not a rule.
      //
      // NOT ONE APPLICANT LABEL HERE IS 81dRPA-SHAPED. An earlier cut of this
      // test used "Your Name (as you want it on the certificate)" and friends,
      // which are the REAL labels ("Your name", "Your Email ID", "Your Whatsapp
      // Number") with a suffix bolted on — so it re-proved the possessive lead
      // and nothing else. These three carry no possessive at all, which is the
      // wording alias order is powerless against; and the third-party questions
      // are asked FIRST, the ordering that used to lose.
      const otherForm = {
        "Name of the person who referred you to us": "Referrer R",
        "Email ID of the person who referred you to us": "referrer@example.invalid",
        "Phone number of your reference": "999",
        "Full Name": "Asha Menon",
        "Email Address": "asha@example.invalid",
        "Contact Phone": "9000000002",
      };
      expect(pickField(otherForm, FIELD_ALIASES.fullName)).toBe("Asha Menon");
      expect(pickField(otherForm, FIELD_ALIASES.email)).toBe("asha@example.invalid");
      expect(pickField(otherForm, FIELD_ALIASES.phone)).toBe("9000000002");

      // A THIRD SHAPE, which no lever in this file is tuned for: the applicant
      // is named by their ROLE ("of the filmmaker") and the third party is a
      // bare compound ("Referrer email"). Neither the possessive lead nor the
      // "<noun> of <role>" pattern speaks to the applicant's labels here; they
      // win on tier, exactly as they did before any of this was written, and
      // the previous cut of the fix broke precisely this form.
      const institutionalForm = {
        "Referrer name": "Referrer R",
        "Referrer email": "referrer@example.invalid",
        "Emergency phone": "999",
        "Name of the filmmaker": "Asha Menon",
        "Email of the filmmaker": "asha@example.invalid",
        "Phone number of the filmmaker": "9000000002",
      };
      expect(pickField(institutionalForm, FIELD_ALIASES.fullName)).toBe("Asha Menon");
      expect(pickField(institutionalForm, FIELD_ALIASES.email)).toBe("asha@example.invalid");
      expect(pickField(institutionalForm, FIELD_ALIASES.phone)).toBe("9000000002");
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

describe("pickField — the block TYPE the envelope already states", () => {
  /**
   * FIX ROUND 3. Three consecutive rounds each closed one direction of the
   * English heuristic and opened another — the FAQ "work" block, then
   * "Email of the person who referred you", then the prose "Can we add your
   * email to the newsletter?" answered "Yes" — and the obvious reorder
   * (most-specific alias first) immediately breaks the pinned counter-case
   * {"Full name of my mentor", "Name"}. There is no alias ordering that
   * satisfies both, which is the point: the envelope STATES the type and the
   * parser used to throw it away.
   *
   * THE TYPE DOES TWO THINGS AND NOT A THIRD. It EXCLUDES `MULTIPLE_CHOICE`,
   * which is what retires all three decoy classes in every ordering; and it
   * breaks a TIE that alias order and match tier both left open. It does NOT
   * outrank them — the round that let it do so handed `email` to a mentor, a
   * colleague and an "alternate address" in both orderings, which is pinned in
   * "the type may NOT overrule an alias or a tier" below.
   *
   * Everything below is a synthetic persona on an invented form. The real
   * envelope's own assertions are unchanged and live in the block above.
   */

  it("keys TYPE_ALLOWLIST off the same groups as FIELD_ALIASES", () => {
    // A preference is per GROUP, not a global type ranking — DROPDOWN is city's
    // second choice AND occupation's demoted decoy type at the same time, which
    // one global ordering cannot express. So the two objects must stay aligned.
    expect(Object.keys(TYPE_ALLOWLIST).sort()).toEqual(Object.keys(FIELD_ALIASES).sort());
  });

  it("names all three phone block types, not just one", () => {
    // The live form asks its number as INPUT_NUMBER, but Tally's dedicated
    // phone block is INPUT_PHONE_NUMBER. Shipping only one of them drops every
    // phone-typed form to fail-soft, where the type layer buys nothing.
    expect(TYPE_ALLOWLIST.phone).toContain("INPUT_NUMBER");
    expect(TYPE_ALLOWLIST.phone).toContain("INPUT_PHONE_NUMBER");
    expect(TYPE_ALLOWLIST.phone).toContain("INPUT_PHONE");
  });

  describe("the REAL envelope, with the type channel on", () => {
    const realTyped = (field: FieldKey) =>
      pickField(extractAnswers(submission(), QUESTION_MAP), FIELD_ALIASES[field], {
        types: REAL_TYPES,
        prefer: TYPE_ALLOWLIST[field],
      });

    it("resolves all six fields to the applicant's own answers", () => {
      // Identical to the untyped assertions above, on purpose: the fix must not
      // move the one form anyone has actually read.
      expect(realTyped("fullName")).toBe("Test Applicant");
      expect(realTyped("email")).toBe("applicant@example.invalid");
      expect(realTyped("phone")).toBe("9000000001");
      expect(realTyped("city")).toBe("Chennai");
      expect(realTyped("occupation")).toBe("Freelance Video Editor");
      expect(realTyped("bio")).toBe("REDACTED_ESSAY_TEXT_100_WORDS");
    });

    it("produces the identical cohort_applications row through toApplicationRow", () => {
      const untyped = toApplicationRow(submission(), QUESTION_MAP, OFFERING_ID, "user-1");
      const typed = toApplicationRow(
        submission(),
        QUESTION_MAP,
        OFFERING_ID,
        "user-1",
        REAL_TYPE_MAP,
      );
      expect(typed).toEqual(untyped);
      expect(typed?.email).toBe("applicant@example.invalid");
    });

    it("records the DROPDOWN occupation decoy's type without depending on it", () => {
      // "@Your name, What do you do?" is a DROPDOWN; the real designation is an
      // INPUT_TEXT. Alias order is what beats it — "designation" is declared
      // ahead of "what do you do", and the decoy matches no earlier alias — and
      // the type agrees rather than overruling. Both are asserted so that a
      // future change to either lever fails here by name.
      expect(REAL_TYPES[LABEL.decoyWhatDoYouDo]).toBe("DROPDOWN");
      expect(REAL_TYPES[LABEL.occupation]).toBe("INPUT_TEXT");
      expect(realTyped("occupation")).toBe("Freelance Video Editor");
      expect(realTyped("occupation")).toBe(
        pickField(extractAnswers(submission(), QUESTION_MAP), FIELD_ALIASES.occupation),
      );
    });
  });

  describe("MULTIPLE_CHOICE is never eligible for an identity field", () => {
    it("kills the FAQ decoy the deny-list cannot reach", () => {
      // Deliberately NOT one of the five deny-listed labels: the deny-list is
      // anchored to this one form's informational blocks, and the whole claim of
      // fix round 3 is that the type retires the CLASS, not five strings.
      const fields: TypedField[] = [
        {
          title: "Email updates from the academy work how?",
          type: "MULTIPLE_CHOICE",
          value: "Every Friday",
        },
        { title: "Contact email", type: "INPUT_EMAIL", value: "asha@example.invalid" },
      ];
      // Without types the FAQ block wins outright — it PREFIX-matches "email"
      // while the applicant's own label only manages a mid-label hit, and tier
      // outranks position. This is the regression, reproduced.
      expect(untypedBothWays(fields, "email")).toEqual(["Every Friday", "Every Friday"]);
      expect(typedBothWays(fields, "email")).toEqual([
        "asha@example.invalid",
        "asha@example.invalid",
      ]);
    });

    it("kills the prose consent question answered 'Yes'", () => {
      const fields: TypedField[] = [
        {
          title: "Can we add your email to the newsletter?",
          type: "MULTIPLE_CHOICE",
          value: "Yes",
        },
        { title: "Email", type: "INPUT_EMAIL", value: "asha@example.invalid" },
      ];
      expect(typedBothWays(fields, "email")).toEqual([
        "asha@example.invalid",
        "asha@example.invalid",
      ]);
      // And on its own it is not an email at all — where the untyped parser,
      // before the possessive restriction landed, filed "Yes" as the applicant's
      // address and made it the permanent (offering_id, email) dedupe key.
      const alone: TypedField[] = [
        { title: "Can we add your email to the newsletter?", type: "MULTIPLE_CHOICE", value: "Yes" },
      ];
      expect(typedBothWays(alone, "email")).toEqual(["", ""]);
    });

    it("stays excluded on the FAIL-SOFT path, where nothing else matched", () => {
      // The single most important line of the change: exclusion is not a
      // preference that a barren form can talk its way past. A form whose only
      // "email" is a MULTIPLE_CHOICE yields NO email, so toApplicationRow skips
      // the submission — visible and re-pollable — rather than filing marketing
      // copy as somebody's identity, permanently.
      const mcOnly: TypedField[] = [
        { title: "Your name", type: "MULTIPLE_CHOICE", value: "Pick one" },
        { title: "Your Email ID", type: "MULTIPLE_CHOICE", value: "Yes" },
        { title: "Your Whatsapp Number", type: "MULTIPLE_CHOICE", value: "Yes" },
        { title: "Which city are you from?", type: "MULTIPLE_CHOICE", value: "Chennai" },
        { title: "What is your most recent designation?", type: "MULTIPLE_CHOICE", value: "Founder" },
        { title: "Tell us your story", type: "MULTIPLE_CHOICE", value: "All of the above" },
      ];
      const form = typedForm(mcOnly);
      for (const field of Object.keys(FIELD_ALIASES) as FieldKey[]) {
        expect(pickTyped(form, field)).toBe("");
      }
      expect(
        toApplicationRow(form.submission, form.questionMap, OFFERING_ID, null, form.questionTypeMap),
      ).toBeNull();
    });
  });

  describe("the preference ORDER inside a group, on a genuine TIE", () => {
    // The type is consulted only where alias AND tier tie — see the block
    // below for the measured reason it may not sit any higher than that. So
    // every fixture here is a tie the pre-type key settled by question order,
    // which is why each one also asserts that the two orderings DISAGREED
    // untyped: that coin toss is the whole of what the preference buys.
    const coinToss = (fields: TypedField[], field: FieldKey) =>
      new Set(untypedBothWays(fields, field)).size;

    it("settles an occupation tie for INPUT_TEXT over DROPDOWN", () => {
      const fields: TypedField[] = [
        { title: "Occupation category", type: "DROPDOWN", value: "Entrepreneur/Founder" },
        { title: "Occupation (as printed on your card)", type: "INPUT_TEXT", value: "Video Editor" },
      ];
      expect(coinToss(fields, "occupation")).toBe(2);
      expect(typedBothWays(fields, "occupation")).toEqual(["Video Editor", "Video Editor"]);
    });

    it("still reaches DROPDOWN for occupation when no INPUT_TEXT answers", () => {
      // A preference, not a permission list: the dropdown is the intended floor
      // when the form only offers one.
      expect(
        typedBothWays(
          [{ title: "What do you do?", type: "DROPDOWN", value: "Entrepreneur/Founder" }],
          "occupation",
        ),
      ).toEqual(["Entrepreneur/Founder", "Entrepreneur/Founder"]);
    });

    it("settles a city tie for INPUT_TEXT, and still accepts a DROPDOWN city", () => {
      const fields: TypedField[] = [
        { title: "City you would like to attend in", type: "DROPDOWN", value: "Mumbai" },
        { title: "City (as on your ID)", type: "INPUT_TEXT", value: "Chennai" },
      ];
      expect(coinToss(fields, "city")).toBe(2);
      expect(typedBothWays(fields, "city")).toEqual(["Chennai", "Chennai"]);
      // A DROPDOWN city is a perfectly ordinary city question and is picked on
      // its own, and where TIER separates the two the type does not interfere:
      // "City of residence" still beats a mid-label "Your city", typed or not.
      expect(
        typedBothWays([{ title: "Which city are you from?", type: "DROPDOWN", value: "Chennai" }], "city"),
      ).toEqual(["Chennai", "Chennai"]);
      const byTier: TypedField[] = [
        { title: "City of residence", type: "DROPDOWN", value: "Kochi" },
        { title: "Your city", type: "INPUT_TEXT", value: "Chennai" },
      ];
      expect(typedBothWays(byTier, "city")).toEqual(untypedBothWays(byTier, "city"));
      expect(typedBothWays(byTier, "city")).toEqual(["Kochi", "Kochi"]);
    });

    it("settles a bio tie for TEXTAREA over INPUT_TEXT", () => {
      const fields: TypedField[] = [
        { title: "Tell us your website", type: "INPUT_TEXT", value: "portfolio.example.invalid" },
        { title: "Tell us your story", type: "TEXTAREA", value: "The hundred word essay" },
      ];
      // Both PREFIX-match "tell us", so untyped the funnel's core qualification
      // signal came down to which question the form happened to ask first.
      expect(coinToss(fields, "bio")).toBe(2);
      expect(typedBothWays(fields, "bio")).toEqual([
        "The hundred word essay",
        "The hundred word essay",
      ]);
    });

    it("settles a phone tie for each of the three phone block types", () => {
      for (const phoneType of ["INPUT_PHONE_NUMBER", "INPUT_PHONE", "INPUT_NUMBER"]) {
        const fields: TypedField[] = [
          { title: "Phone for deliveries", type: "INPUT_TEXT", value: "404" },
          { title: "Phone number", type: phoneType, value: "9000000003" },
        ];
        expect(coinToss(fields, "phone")).toBe(2);
        expect(typedBothWays(fields, "phone")).toEqual(["9000000003", "9000000003"]);
      }
    });

    it("puts Tally's DEDICATED phone block above the generic number block", () => {
      // INPUT_NUMBER is what a room count or a year of experience uses too, so
      // where a form offers both, the dedicated block is the better statement.
      expect(TYPE_ALLOWLIST.phone.indexOf("INPUT_PHONE_NUMBER")).toBeLessThan(
        TYPE_ALLOWLIST.phone.indexOf("INPUT_NUMBER"),
      );
      const fields: TypedField[] = [
        { title: "Phone (landline)", type: "INPUT_NUMBER", value: "04422220000" },
        { title: "Phone (mobile)", type: "INPUT_PHONE_NUMBER", value: "9000000003" },
      ];
      expect(coinToss(fields, "phone")).toBe(2);
      expect(typedBothWays(fields, "phone")).toEqual(["9000000003", "9000000003"]);
      // And the live form, whose only number question is a generic INPUT_NUMBER,
      // is unmoved by that ordering — it is won on the alias, not on the type.
      expect(
        pickField(extractAnswers(submission(), QUESTION_MAP), FIELD_ALIASES.phone, {
          types: REAL_TYPES,
          prefer: TYPE_ALLOWLIST.phone,
        }),
      ).toBe("9000000001");
    });
  });

  describe("the type may NOT overrule an alias or a tier", () => {
    /**
     * THE CORRECTION THAT DEFINES WHERE THE PREFERENCE SITS. The brief asked for
     * `(typeRank, ownFieldFirst, aliasIndex, matchTier, questionOrder)` — "type
     * outranks every English signal" — and shipped that way it handed identity
     * fields to other people, in BOTH orderings, on cases the pre-type code got
     * right. A block type states what a question COLLECTS, never whose answer it
     * holds, so every case below asserts the typed answer EQUALS the untyped one:
     * the type channel may add a tie-break and may exclude MULTIPLE_CHOICE, and
     * it may do nothing else.
     */

    it("does not let a mismatched-type third party take the email dedupe key", () => {
      // None of these roles is one THIRD_PARTY_LABEL names — "mentor",
      // "colleague" and "alternate" are absent by design, and no vocabulary can
      // name them all — so the type rank was the ONLY thing moving them, and it
      // moved them onto the permanent (offering_id, email) key.
      const pairs: TypedField[][] = [
        [
          { title: "Email of my mentor", type: "INPUT_EMAIL", value: "mentor@example.invalid" },
          { title: "Your Email ID", type: "INPUT_TEXT", value: "asha@example.invalid" },
        ],
        [
          { title: "Colleague email", type: "INPUT_EMAIL", value: "colleague@example.invalid" },
          { title: "Email Address", type: "INPUT_TEXT", value: "asha@example.invalid" },
        ],
        [
          {
            title: "Alternate email address",
            type: "INPUT_EMAIL",
            value: "alternate@example.invalid",
          },
          { title: "Your Email ID", type: "INPUT_TEXT", value: "asha@example.invalid" },
        ],
      ];
      for (const fields of pairs) {
        expect(typedBothWays(fields, "email")).toEqual([
          "asha@example.invalid",
          "asha@example.invalid",
        ]);
        expect(typedBothWays(fields, "email")).toEqual(untypedBothWays(fields, "email"));
        const form = typedForm(fields);
        expect(
          toApplicationRow(form.submission, form.questionMap, OFFERING_ID, null, form.questionTypeMap)
            ?.email,
        ).toBe("asha@example.invalid");
      }
    });

    it("holds the pinned counter-cases when the two TYPES differ", () => {
      // The brief's own counter-cases, with the types set against the applicant.
      // Pinning only the same-type variant is what let the cross-type break ship.
      expect(
        typedBothWays(
          [
            { title: "Full name of my mentor", type: "INPUT_TEXT", value: "M" },
            { title: "Name", type: "DROPDOWN", value: "Asha Menon" },
          ],
          "fullName",
        ),
      ).toEqual(["Asha Menon", "Asha Menon"]);
      expect(
        typedBothWays(
          [
            { title: "Alternate phone number", type: "INPUT_NUMBER", value: "222" },
            { title: "Phone", type: "INPUT_PHONE_NUMBER", value: "9000000002" },
          ],
          "phone",
        ),
      ).toEqual(["9000000002", "9000000002"]);
      expect(
        typedBothWays(
          [
            { title: "Office phone number", type: "INPUT_NUMBER", value: "222" },
            { title: "Your Whatsapp Number", type: "INPUT_PHONE_NUMBER", value: "9000000002" },
          ],
          "phone",
        ),
      ).toEqual(["9000000002", "9000000002"]);
    });

    it("does not demote a DROPDOWN city under an INPUT_TEXT that merely says 'location'", () => {
      // city prefers INPUT_TEXT over DROPDOWN, and on a filmmaking-cohort form —
      // exactly the population this poller scans — an INPUT_TEXT "location"
      // question is entirely ordinary. Ranked above the alias, the preference
      // filed the shoot location as the applicant's city in both orderings.
      for (const decoy of [
        "Shoot location preference",
        "Preferred location for the workshop",
        "Studio location",
      ]) {
        const fields: TypedField[] = [
          { title: decoy, type: "INPUT_TEXT", value: "Studio B" },
          { title: "Which city are you from?", type: "DROPDOWN", value: "Chennai" },
        ];
        expect(typedBothWays(fields, "city")).toEqual(["Chennai", "Chennai"]);
        expect(typedBothWays(fields, "city")).toEqual(untypedBothWays(fields, "city"));
      }
    });

    it("leaves an alias-order decision to alias order, cost and all", () => {
      // THE PRICE OF THE CORRECTION, STATED. The coarse dropdown bucket beats
      // the free-text designation here, because "occupation" is declared ahead
      // of "designation" and the type is no longer allowed to overrule that.
      // Accepted: `occupation` is a nullable qualification column, the live form
      // resolves correctly on alias order alone (its dropdown decoy reads "What
      // do you do?", which no earlier alias matches), and the alternative —
      // letting type outrank the alias — is what put a mentor's address on the
      // permanent email key above.
      const fields: TypedField[] = [
        { title: "Your occupation category", type: "DROPDOWN", value: "Entrepreneur/Founder" },
        { title: "Most recent designation", type: "INPUT_TEXT", value: "Video Editor" },
      ];
      expect(typedBothWays(fields, "occupation")).toEqual(untypedBothWays(fields, "occupation"));
      expect(typedBothWays(fields, "occupation")).toEqual([
        "Entrepreneur/Founder",
        "Entrepreneur/Founder",
      ]);
    });
  });

  describe("what the preference MOVES that alias order used to decide", () => {
    it("no longer inverts the essay decoy for bio", () => {
      // "Tell us who referred you and why" is an essay about somebody else;
      // THIRD_PARTY_LABEL cannot touch it (it is anchored to identity nouns,
      // deliberately — see the sweep's own tests above), so the only thing
      // keeping it out of `bio` is that "about you" is declared before
      // "tell us". The round that ranked type above alias order inverted
      // exactly this and filed the referral essay as the applicant's bio;
      // with the preference demoted to a tie-break, alias order decides again.
      const fields: TypedField[] = [
        { title: "Tell us who referred you and why", type: "TEXTAREA", value: "My friend R" },
        { title: "About you", type: "INPUT_TEXT", value: "Editor, Chennai" },
      ];
      expect(typedBothWays(fields, "bio")).toEqual(untypedBothWays(fields, "bio"));
      expect(typedBothWays(fields, "bio")).toEqual(["Editor, Chennai", "Editor, Chennai"]);
    });

    it("leaves the same-type residual exactly where it already was", () => {
      // The other half of the honesty: where the two labels share a type, the
      // type layer abstains and the pre-existing limit stands unchanged — the
      // "<other field> of <someone>" wording outside the three identity groups
      // is still decided by tier alone, typed or not.
      const fields: TypedField[] = [
        { title: "Occupation of your referrer", type: "INPUT_TEXT", value: "Editor" },
        { title: "Your occupation", type: "INPUT_TEXT", value: "Director" },
      ];
      expect(typedBothWays(fields, "occupation")).toEqual(untypedBothWays(fields, "occupation"));
      expect(typedBothWays(fields, "occupation")).toEqual(["Editor", "Editor"]);
    });
  });

  describe("the English machinery still does the job type cannot", () => {
    it("separates a SAME-TYPE third party from the applicant", () => {
      // Type is blind here by construction — both are INPUT_EMAIL — so this is
      // exactly the residual THIRD_PARTY_LABEL exists for, and the reason none
      // of the vocabulary was deleted when the type layer arrived.
      expect(
        typedBothWays(
          [
            {
              title: "Email of the person who referred you",
              type: "INPUT_EMAIL",
              value: "referrer@example.invalid",
            },
            { title: "Email Address", type: "INPUT_EMAIL", value: "asha@example.invalid" },
          ],
          "email",
        ),
      ).toEqual(["asha@example.invalid", "asha@example.invalid"]);
      expect(
        typedBothWays(
          [
            { title: "Guardian name", type: "INPUT_TEXT", value: "Other Person" },
            { title: "Legal name", type: "INPUT_TEXT", value: "Asha Menon" },
          ],
          "fullName",
        ),
      ).toEqual(["Asha Menon", "Asha Menon"]);
      expect(
        typedBothWays(
          [
            { title: "Emergency contact number", type: "INPUT_NUMBER", value: "222" },
            { title: "Phone", type: "INPUT_NUMBER", value: "9000000002" },
          ],
          "phone",
        ),
      ).toEqual(["9000000002", "9000000002"]);
    });

    it("separates a third party whose TYPE outranks the applicant's own", () => {
      // The one the first cut of the type layer got wrong, and the reason the
      // score key reads (ownFieldFirst, aliasIndex, matchTier, typeRank, …).
      // Ranking the type above the third-party sweep let a set holding only the
      // referrer match, run its own fallback and return before the applicant's
      // lower-typed field was ever consulted — regression class (b), rebuilt out
      // of the mechanism meant to retire it, on the field whose wrong answer is
      // the permanent (offering_id, email) dedupe key. The demotion is asked
      // FIRST, and the type only ever breaks a tie inside one sweep.
      expect(
        typedBothWays(
          [
            {
              title: "Email of the person who referred you",
              type: "INPUT_EMAIL",
              value: "referrer@example.invalid",
            },
            { title: "Your Email ID", type: "INPUT_TEXT", value: "asha@example.invalid" },
          ],
          "email",
        ),
      ).toEqual(["asha@example.invalid", "asha@example.invalid"]);
      expect(
        typedBothWays(
          [
            { title: "Emergency contact phone", type: "INPUT_NUMBER", value: "222" },
            { title: "Your Whatsapp Number", type: "INPUT_PHONE_NUMBER", value: "9000000002" },
          ],
          "phone",
        ),
      ).toEqual(["9000000002", "9000000002"]);
      // Including where the applicant's own question states no type at all —
      // the fail-soft rank is still ABOVE anybody else's typed field.
      expect(
        typedBothWays(
          [
            { title: "Guardian name", type: "INPUT_TEXT", value: "Other Person" },
            { title: "Your name", value: "Asha Menon" },
          ],
          "fullName",
        ),
      ).toEqual(["Asha Menon", "Asha Menon"]);
      // And the row it files, since email is the column that makes it permanent.
      const form = typedForm([
        { title: "Referrer email", type: "INPUT_EMAIL", value: "referrer@example.invalid" },
        { title: "Email", type: "INPUT_TEXT", value: "asha@example.invalid" },
        { title: "Your name", type: "INPUT_TEXT", value: "Asha Menon" },
      ]);
      expect(
        toApplicationRow(form.submission, form.questionMap, OFFERING_ID, null, form.questionTypeMap)
          ?.email,
      ).toBe("asha@example.invalid");
    });

    it("still ANSWERS from a third party's field when it is the only one", () => {
      // The demotion is not a deny at any type rank: a form whose only email is
      // the referrer's still produces a row, exactly as it did untyped. A deny
      // would return "" and drop the whole application.
      expect(
        typedBothWays(
          [
            {
              title: "Email of the person who referred you",
              type: "INPUT_EMAIL",
              value: "referrer@example.invalid",
            },
            { title: "Which city are you from?", type: "INPUT_TEXT", value: "Chennai" },
          ],
          "email",
        ),
      ).toEqual(["referrer@example.invalid", "referrer@example.invalid"]);
    });

    it("keeps the deny-list working under a perfectly innocent type", () => {
      // The deny-list is NOT subsumed by the MULTIPLE_CHOICE rule: a form owner
      // can author an informational block as anything, and the deny-list is
      // also the second line of defence on an UNTYPED form.
      expect(
        typedBothWays([{ title: "Select one", type: "INPUT_TEXT", value: "a grant, please" }], "city"),
      ).toEqual(["", ""]);
      expect(pickField({ "Select one": "a grant, please" }, ["select one"])).toBe("");
    });

    it("keeps the possessive restriction working under type", () => {
      // "your email" may still only win where the label LEADS with it, so a
      // typed prose question that merely contains it cannot outrank the
      // applicant's own field.
      expect(
        typedBothWays(
          [
            { title: "Where should we send your email receipts?", type: "INPUT_TEXT", value: "Anywhere" },
            { title: "Email", type: "INPUT_EMAIL", value: "asha@example.invalid" },
          ],
          "email",
        ),
      ).toEqual(["asha@example.invalid", "asha@example.invalid"]);
    });
  });

  describe("the pinned counter-cases still resolve to the applicant", () => {
    it("{'Full name of my mentor', 'Name'} → the applicant", () => {
      // The case that kills "just reorder the aliases most-specific-first".
      // "full name" ahead of "name" hands this to the mentor in both orderings;
      // both labels are INPUT_TEXT here, so the type layer is deliberately not
      // what saves it — the bare-noun-first alias order is, and stays.
      expect(
        typedBothWays(
          [
            { title: "Full name of my mentor", type: "INPUT_TEXT", value: "M" },
            { title: "Name", type: "INPUT_TEXT", value: "Asha Menon" },
          ],
          "fullName",
        ),
      ).toEqual(["Asha Menon", "Asha Menon"]);
    });

    it("{'Alternate phone number', 'Phone'} → the applicant", () => {
      expect(
        typedBothWays(
          [
            { title: "Alternate phone number", type: "INPUT_NUMBER", value: "222" },
            { title: "Phone", type: "INPUT_NUMBER", value: "9000000002" },
          ],
          "phone",
        ),
      ).toEqual(["9000000002", "9000000002"]);
    });
  });

  describe("all three historical regression classes, on one form, both orderings", () => {
    // (a) FAQ/informational decoys, (b) a NAMED third party's fields, (c) a
    // prose question whose answer is "Yes". Each of the three closed a previous
    // round and opened the next; the acceptance for this one is all three green
    // AT THE SAME TIME, on a form asked in either direction.
    const gauntlet: TypedField[] = [
      // (a)
      { title: "What is the Creator Academy?", type: "MULTIPLE_CHOICE", value: "A live cohort" },
      {
        title: "Email updates from the academy work how?",
        type: "MULTIPLE_CHOICE",
        value: "Every Friday",
      },
      // (c)
      { title: "Can we add your email to the newsletter?", type: "MULTIPLE_CHOICE", value: "Yes" },
      // (b)
      { title: "Name of the person who referred you", type: "INPUT_TEXT", value: "Referrer R" },
      {
        title: "Email of the person who referred you",
        type: "INPUT_EMAIL",
        value: "referrer@example.invalid",
      },
      { title: "Phone number of your reference", type: "INPUT_NUMBER", value: "999" },
      // The applicant. Not one label is 81dRPA-shaped, and none carries a
      // possessive — the wording alias order is powerless against.
      { title: "Full Name", type: "INPUT_TEXT", value: "Asha Menon" },
      { title: "Email Address", type: "INPUT_EMAIL", value: "asha@example.invalid" },
      { title: "Contact Phone", type: "INPUT_NUMBER", value: "9000000002" },
      { title: "Which city are you from?", type: "DROPDOWN", value: "Chennai" },
      { title: "Most recent designation", type: "INPUT_TEXT", value: "Video Editor" },
      { title: "Tell us your story", type: "TEXTAREA", value: "The hundred word essay" },
    ];

    it("resolves every one of the six fields to the applicant, in both orderings", () => {
      expect(typedBothWays(gauntlet, "fullName")).toEqual(["Asha Menon", "Asha Menon"]);
      expect(typedBothWays(gauntlet, "email")).toEqual([
        "asha@example.invalid",
        "asha@example.invalid",
      ]);
      expect(typedBothWays(gauntlet, "phone")).toEqual(["9000000002", "9000000002"]);
      expect(typedBothWays(gauntlet, "city")).toEqual(["Chennai", "Chennai"]);
      expect(typedBothWays(gauntlet, "occupation")).toEqual(["Video Editor", "Video Editor"]);
      expect(typedBothWays(gauntlet, "bio")).toEqual([
        "The hundred word essay",
        "The hundred word essay",
      ]);
    });

    it("is a form the English-only matcher decides by question ORDER", () => {
      // Why the gauntlet is worth having: with the type channel off, the two
      // orderings of the SAME form disagree about who the applicant is. That is
      // the defect class, stated as a property rather than as one wording.
      const untyped = untypedBothWays(gauntlet, "email");
      expect(new Set(untyped).size).toBe(2);
    });

    it("files the applicant's row end to end, through toApplicationRow", () => {
      const form = typedForm(gauntlet);
      const row = toApplicationRow(
        form.submission,
        form.questionMap,
        OFFERING_ID,
        null,
        form.questionTypeMap,
      );
      expect(row?.full_name).toBe("Asha Menon");
      expect(row?.email).toBe("asha@example.invalid");
      expect(row?.phone).toBe("9000000002");
      expect(row?.city).toBe("Chennai");
      expect(row?.occupation).toBe("Video Editor");
      expect(row?.bio).toBe("The hundred word essay");
      expect(row?.status).toBe("submitted");
    });
  });

  describe("fail-soft — a form that states no type at all", () => {
    const untypedForm: TypedField[] = [
      { title: "Full Name", value: "Asha Menon" },
      { title: "Email Address", value: "asha@example.invalid" },
      { title: "Contact Phone", value: "9000000002" },
      { title: "Which city are you from?", value: "Chennai" },
      { title: "Most recent designation", value: "Video Editor" },
      { title: "Tell us your story", value: "The hundred word essay" },
    ];

    it("resolves all six fields anyway", () => {
      // The poller walks forms nobody here has read. A missing type must cost
      // the ranking, not the row.
      const form = typedForm(untypedForm);
      expect(Object.values(form.types).every((t) => t === "")).toBe(true);
      expect(pickTyped(form, "fullName")).toBe("Asha Menon");
      expect(pickTyped(form, "email")).toBe("asha@example.invalid");
      expect(pickTyped(form, "phone")).toBe("9000000002");
      expect(pickTyped(form, "city")).toBe("Chennai");
      expect(pickTyped(form, "occupation")).toBe("Video Editor");
      expect(pickTyped(form, "bio")).toBe("The hundred word essay");
    });

    it("gives the identical answer with the type channel off entirely", () => {
      // Which is the same statement made from the other side, and the reason
      // the ~90 untyped `pickField(answers, aliases)` call sites in this file
      // are themselves the fallback-path proof.
      const form = typedForm(untypedForm);
      for (const field of Object.keys(FIELD_ALIASES) as FieldKey[]) {
        expect(pickTyped(form, field)).toBe(pickField(form.answers, FIELD_ALIASES[field]));
      }
    });

    it("falls back per FIELD, not per form, when only some types are known", () => {
      // A partially-typed form must not lose the untyped half.
      const mixed: TypedField[] = [
        { title: "Email Address", type: "INPUT_EMAIL", value: "asha@example.invalid" },
        { title: "Which city are you from?", value: "Chennai" },
      ];
      expect(typedBothWays(mixed, "email")).toEqual([
        "asha@example.invalid",
        "asha@example.invalid",
      ]);
      expect(typedBothWays(mixed, "city")).toEqual(["Chennai", "Chennai"]);
    });

    it("falls back when a type is present but is not one the group prefers", () => {
      // CHECKBOXES is neither preferred nor MULTIPLE_CHOICE, so it ranks last —
      // and last is still reachable when nothing better answered.
      expect(
        typedBothWays([{ title: "Which city are you from?", type: "CHECKBOXES", value: "Chennai" }], "city"),
      ).toEqual(["Chennai", "Chennai"]);
    });

    it("never PROMOTES a blank answer by its type — it ranks as it did untyped", () => {
      // The type layer ranks the answers a form COLLECTED; an empty one carries
      // no evidence to rank. A blank therefore drops to the fail-soft rank
      // whatever its block type, and the pre-type English key decides — the same
      // answer, in both orderings, as with the type channel off entirely.
      const fields: TypedField[] = [
        { title: "Your Email ID", type: "INPUT_EMAIL", value: "" },
        { title: "Where do we email your invoice?", type: "INPUT_TEXT", value: "Accounts dept" },
      ];
      expect(typedBothWays(fields, "email")).toEqual(untypedBothWays(fields, "email"));
      // Asked first, the blank still speaks for its alias and still yields "":
      // "asked and left empty" does not become "so use the next label down".
      // That rule is the alias sweep's, and it is untouched — what changed is
      // only that TYPE alone can no longer put a blank at the front of the queue.
      expect(pickTyped(typedForm(fields), "email")).toBe("");
    });

    it("does not let a blank at a preferred type swallow the applicant's answer", () => {
      // The defect that rule exists for. An optional "Work email" left empty is
      // an INPUT_EMAIL and the applicant's real address is a plain INPUT_TEXT,
      // so promoting the blank on type alone returned "" — and toApplicationRow
      // DROPS a submission with no email, one the pre-type code ingested
      // correctly. A blank may cost the ranking; it may never cost the row.
      const fields: TypedField[] = [
        { title: "Your name", type: "INPUT_TEXT", value: "Asha Menon" },
        { title: "Work email (optional)", type: "INPUT_EMAIL", value: "" },
        { title: "Email Address", type: "INPUT_TEXT", value: "asha@example.invalid" },
      ];
      expect(typedBothWays(fields, "email")).toEqual([
        "asha@example.invalid",
        "asha@example.invalid",
      ]);
      const form = typedForm(fields);
      expect(
        toApplicationRow(form.submission, form.questionMap, OFFERING_ID, null, form.questionTypeMap)
          ?.email,
      ).toBe("asha@example.invalid");
      // The same shape on phone, where the blank sits at the group's FIRST
      // preferred type and the answer at its second.
      expect(
        typedBothWays(
          [
            { title: "Your Whatsapp Number", type: "INPUT_NUMBER", value: "" },
            { title: "Your mobile", type: "INPUT_PHONE_NUMBER", value: "9000000003" },
          ],
          "phone",
        ),
      ).toEqual(["9000000003", "9000000003"]);
    });
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

describe("resolveIntakeWindow — the window the scan runs on (FX-2.1/FX-2.2)", () => {
  it("resolves the healthy pair into both bounds", () => {
    expect(resolveIntakeWindow(offeringWindow())).toEqual({
      windowStart: EDITION_2_CUTOFF,
      windowEnd: EDITION_2_WINDOW_END_IST,
      skipReason: null,
    });
  });

  it("ingests NOTHING when intake_opens_at is NULL — no created_at fallback", () => {
    // FX-2.1's whole point: NULL is the PERMANENT default (nothing sets the
    // column for a new offering), so the old created_at fallback would have
    // back-filled a cloned edition with up to 2000 rows of Edition-1 history on
    // its first tick. The failure mode of a forgotten cutoff has to be an
    // offering that ingests nothing and SAYS SO — hence a skipReason, not a
    // guessed window.
    expect(resolveIntakeWindow(offeringWindow({ intake_opens_at: null }))).toEqual({
      windowStart: null,
      windowEnd: null,
      skipReason: "no_cutoff",
    });
  });

  it("fails closed the same way on a non-null but unparseable intake_opens_at", () => {
    // The column is timestamptz, so PostgREST cannot produce these today; the
    // branch exists so a schema change can never turn a bad value into an
    // UNBOUNDED scan. Note both bounds go null: a usable ceiling on top of an
    // unusable floor would still be an unbounded scan downwards.
    for (const bad of ["", "   ", "not a date", "2026-13-45T99:99:99Z"]) {
      expect(resolveIntakeWindow(offeringWindow({ intake_opens_at: bad }))).toEqual({
        windowStart: null,
        windowEnd: null,
        skipReason: "no_cutoff",
      });
    }
  });

  it("treats a missing offering row as no cutoff rather than no ceiling", () => {
    for (const missing of [null, undefined, {}]) {
      expect(resolveIntakeWindow(missing).skipReason).toBe("no_cutoff");
    }
  });

  it("reports windowEnd: null when there is no deadline — visible, not assumed", () => {
    // The ceiling fails OPEN, in the opposite direction to the floor: a NULL
    // deadline means the offering ingests for as long as it is staged, and the
    // caller has to be able to see that state rather than infer it.
    for (const noDeadline of [null, undefined, "", "   ", "not a date"]) {
      expect(resolveIntakeWindow(offeringWindow({ application_deadline: noDeadline }))).toEqual({
        windowStart: EDITION_2_CUTOFF,
        windowEnd: null,
        skipReason: null,
      });
    }
  });

  it("ends the deadline day at 23:59:59.999 IST, not at any UTC boundary", () => {
    // Asserted against the hand-written literal in the fixture, which is NOT
    // derived from the date — a computed expectation would agree with the
    // implementation by construction.
    const { windowEnd } = resolveIntakeWindow(
      offeringWindow({ application_deadline: EDITION_2_DEADLINE }),
    );
    expect(windowEnd).toBe(EDITION_2_WINDOW_END_IST);
    // And it is the instant it claims to be, ~18.5h AFTER the UTC midnight the
    // applicant was shown on PublicOffering — strictly the more generous of the
    // two, which is the only safe direction for a date already advertised.
    expect(Date.parse(windowEnd!)).toBe(Date.parse("2026-07-31T18:29:59.999Z"));
    expect(Date.parse(windowEnd!)).toBeGreaterThan(Date.parse(`${EDITION_2_DEADLINE}T00:00:00Z`));
  });

  it("honours a full instant verbatim if the column is ever widened", () => {
    // Not a shape a `date` column can produce. It must NOT be re-derived into
    // somebody's idea of a day boundary the author did not ask for.
    const stored = "2026-07-31T09:00:00.000+05:30";
    expect(resolveIntakeWindow(offeringWindow({ application_deadline: stored })).windowEnd).toBe(
      stored,
    );
  });
});

describe("the IST end-of-day ceiling — the boundary a UTC cut gets wrong", () => {
  // The window under test is the resolved one, not a hand-built pair, so this
  // exercises the derivation and the comparison together — which is the whole
  // path a submission actually travels.
  const { windowStart, windowEnd } = resolveIntakeWindow(offeringWindow());

  it("keeps 12:00 IST on the deadline day IN — a UTC-midnight cut would drop it", () => {
    // UTC midnight on the deadline date is 05:30 IST that morning. Cutting
    // there discards the entire last-day rush; this assertion fails the moment
    // anyone reverts to it.
    expect(isInIntakeWindow(DEADLINE_BOUNDARY.middayIst, windowStart, windowEnd)).toBe(true);
  });

  it("keeps 23:59 IST on the deadline day IN", () => {
    expect(isInIntakeWindow(DEADLINE_BOUNDARY.lastMinuteIst, windowStart, windowEnd)).toBe(true);
  });

  it("treats the ceiling instant itself as IN — both bounds are inclusive", () => {
    expect(isInIntakeWindow(EDITION_2_WINDOW_END_IST, windowStart, windowEnd)).toBe(true);
  });

  it("puts 00:01 IST the next morning OUT — a UTC end-of-day cut would ingest it", () => {
    // `2026-07-31T23:59:59.999Z` is 05:29 IST on 2026-08-01, i.e. AFTER this
    // instant. So this assertion fails on the other wrong reading too.
    expect(isInIntakeWindow(DEADLINE_BOUNDARY.nextDayFirstMinuteIst, windowStart, windowEnd)).toBe(
      false,
    );
  });

  it("still enforces the floor with a ceiling present", () => {
    expect(isInIntakeWindow("2026-03-14T08:00:00.000Z", windowStart, windowEnd)).toBe(false);
  });

  it("imposes no ceiling at all when the offering has no deadline", () => {
    const unbounded = resolveIntakeWindow(offeringWindow({ application_deadline: null }));
    expect(
      isInIntakeWindow(
        DEADLINE_BOUNDARY.nextDayFirstMinuteIst,
        unbounded.windowStart,
        unbounded.windowEnd,
      ),
    ).toBe(true);
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

describe("partitionByCutoff — the ceiling skips, and MUST NOT stop the scan (FX-2.2)", () => {
  const { windowStart, windowEnd } = resolveIntakeWindow(offeringWindow());
  const result = partitionByCutoff(closedEditionPage(), windowStart, windowEnd);

  it("collects the in-window rows that sit UNDERNEATH the post-deadline ones", () => {
    // The load-bearing assertion. Tally is newest-first, so once an edition
    // closes the post-deadline rows are the ones that arrive first — exactly
    // how `closedEditionPage()` is built. If the ceiling ever became a stop
    // signal the scan would halt on row 1 and this list would be empty.
    expect(result.inWindow.map((s) => s.id)).toEqual(["sub_in_window_1", "sub_in_window_2"]);
  });

  it("counts the post-deadline rows as skipped rather than ingesting them", () => {
    expect(result.skippedAfterDeadline).toBe(2);
    expect(result.inWindow.map((s) => s.id)).not.toContain("sub_after_deadline_1");
    const rows = result.inWindow.map((s) => toApplicationRow(s, QUESTION_MAP, OFFERING_ID, null));
    expect(rows.map((r) => r?.email)).not.toContain("late-1@example.invalid");
    expect(rows.map((r) => r?.email)).not.toContain("late-2@example.invalid");
  });

  it("reports stoppedAtCutoff FALSE — a stop here would read healthy while zeroing the form", () => {
    // This is the pairing that makes the bug invisible: `stoppedAtCutoff: true`
    // is the normal, expected value on a straddling page, so a ceiling-stop
    // would ingest nothing on every closed edition and still look fine in the
    // summary. The count and the flag must disagree in exactly this way.
    expect(result.stoppedAtCutoff).toBe(false);
    expect(result.skippedUndated).toBe(0);
  });

  it("skips EVERY post-deadline row, not just the run at the top of the page", () => {
    // Late arrivals interleaved with in-window rows (a clock skew, or a page
    // boundary) must each be skipped and counted individually.
    const page = [
      submission({ id: "late_a", submittedAt: DEADLINE_BOUNDARY.nextDayFirstMinuteIst }),
      submission({ id: "in_a", submittedAt: DEADLINE_BOUNDARY.lastMinuteIst }),
      submission({ id: "late_b", submittedAt: "2026-08-02T00:00:00.000Z" }),
      submission({ id: "in_b", submittedAt: DEADLINE_BOUNDARY.middayIst }),
    ];
    const mixed = partitionByCutoff(page, windowStart, windowEnd);
    expect(mixed.inWindow.map((s) => s.id)).toEqual(["in_a", "in_b"]);
    expect(mixed.skippedAfterDeadline).toBe(2);
    expect(mixed.stoppedAtCutoff).toBe(false);
  });

  it("still stops at a row below the FLOOR while the ceiling is in force", () => {
    // Only the lower bound may ever end the scan — the ceiling changes nothing
    // about that.
    const withHistory = partitionByCutoff(
      [...closedEditionPage(), ...straddlingPage().slice(2)],
      windowStart,
      windowEnd,
    );
    expect(withHistory.inWindow.map((s) => s.id)).toEqual(["sub_in_window_1", "sub_in_window_2"]);
    expect(withHistory.skippedAfterDeadline).toBe(2);
    expect(withHistory.stoppedAtCutoff).toBe(true);
  });

  it("ingests the whole page when the offering has no deadline", () => {
    // Same page, no ceiling: the two late rows are ordinary in-window rows.
    const unbounded = resolveIntakeWindow(offeringWindow({ application_deadline: null }));
    const open = partitionByCutoff(closedEditionPage(), unbounded.windowStart, unbounded.windowEnd);
    expect(open.inWindow).toHaveLength(4);
    expect(open.skippedAfterDeadline).toBe(0);
    expect(open.stoppedAtCutoff).toBe(false);
  });

  it("ingests nothing for an offering resolveIntakeWindow refused to open", () => {
    // The no_cutoff offering never reaches the scan in production (it is
    // filtered out of the query), but if it ever did, its null windowStart
    // fails closed here too.
    const skipped = resolveIntakeWindow(offeringWindow({ intake_opens_at: null }));
    const scan = partitionByCutoff(closedEditionPage(), skipped.windowStart, skipped.windowEnd);
    expect(scan.inWindow).toEqual([]);
    expect(scan.stoppedAtCutoff).toBe(true);
  });
});

describe("isIngestableSubmission — completed-only, without depending on a URL (FX-2.3)", () => {
  it("accepts a completed submission", () => {
    expect(isIngestableSubmission(submission())).toBe(true);
  });

  it("rejects isCompleted:false even though it reached the loop", () => {
    // `cohort_applications.status` has no honest value for a half-filled form.
    // Until FX-2 the only thing standing between a partial and an insert was
    // `&filter=completed` in a URL literal in another file, unreachable by any
    // test; this is the code-side twin of that filter.
    expect(isIngestableSubmission(submission({ isCompleted: false }))).toBe(false);
    expect(isIngestableSubmission(syntheticSubmission({ isCompleted: false }))).toBe(false);
  });

  it("rejects an ABSENT flag — the guard is `=== true`, not `!== false`", () => {
    // A payload that simply does not carry `isCompleted` is not a completion.
    // `!== false` would have waved all four of these through.
    const withFlag = submission();
    delete withFlag.isCompleted;
    expect(isIngestableSubmission(withFlag)).toBe(false);
    expect(isIngestableSubmission({})).toBe(false);
    expect(isIngestableSubmission(null)).toBe(false);
    expect(isIngestableSubmission(undefined)).toBe(false);
  });

  it("is independent of the window — the two guards answer different questions", () => {
    // An in-window partial is still not ingestable, and an out-of-window
    // completion is still not in window. Neither guard may stand in for the
    // other.
    const partial = submission({ isCompleted: false, submittedAt: "2026-07-20T09:15:00.000Z" });
    expect(isIngestableSubmission(partial)).toBe(false);
    expect(isInIntakeWindow(partial.submittedAt, EDITION_2_CUTOFF)).toBe(true);
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
