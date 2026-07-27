# PHASE TP — Fix round 3: stop guessing in English, use the type the envelope already states
*Closes the remaining council-REVISE items. Branch `design/cohort-tally-poll`. Nothing deploys until this passes.*

## Already closed by the orchestrator — do NOT redo
- **PII (commits `…` + two history rewrites):** the real `fbclid`/`click_ts`/`utm_*` AND a real applicant's NAME are now purged from **every commit on the branch** (audited pattern-by-pattern across all 15 commits: 0 hits). Branch was never pushed.
- **Possessive-alias regression (`69469fc`):** a possessive alias may now only win at `TIER_EXACT`/`TIER_PREFIX`. Verified 8/8 prose cases + 8/8 third-party decoys, both orderings.

## THE ROOT CAUSE — and why three fix rounds each regressed in a new direction
`pickField` arbitrates which question is the applicant's email/phone/name **using English word-order heuristics**: alias lists, match tiers, question position, a third-party vocabulary, an informational deny-list. Each round closed one direction and opened another:
1. round 1 — `work` matched the FAQ block *"How does the academy **work** week to week?"*
2. round 2 — `"Email of the person who referred you"` outranked the applicant's own field
3. round 3 — `"Can we add **your email** to the newsletter?"` outranked it, answer `"Yes"`
And the obvious "fix" (reorder aliases most-specific-first) immediately breaks a pinned counter-case: `"Full name of my mentor"` then beats a plain `"Name"`. **English word-order cannot arbitrate this. There is no ordering that satisfies both.**

**The envelope already states the answer as a fact and we throw it away.** `buildQuestionMap` (`_shared/tally.ts`) keeps only `title` and discards `questions[].type`. Verified on the LIVE form `81dRPA`:
| type | label |
|---|---|
| `INPUT_EMAIL` | Your Email ID ← **the only email field, stated, not inferred** |
| `INPUT_NUMBER` | Your Whatsapp Number |
| `INPUT_TEXT` | Your name · What is your most recent designation? · Which City are you from? |
| `TEXTAREA` | Write your heart out! (In 100 words or more) |
| `DROPDOWN` | @Your name, What do you do? ← the occupation decoy |
| `MULTIPLE_CHOICE` | **every FAQ decoy**: What is the LevelUp Creator Academy? · How does the academy work week to week? · At the Academy, you are mentored by: · By the end of the program… · Select one |

Every decoy that has cost three rounds is structurally excluded by type. A prose question whose answer is `"Yes"` is a `MULTIPLE_CHOICE`; an applicant's email is an `INPUT_EMAIL`.

---

## Task T-1 — Type-aware field selection (`tier: 1`)
**Files:** `supabase/functions/_shared/tally.ts`, `supabase/functions/tally-application-poll/index.ts`, `src/lib/__tests__/tally.test.ts`, `qa-harness/tally-fixtures.ts`
**Spec:**
1. **Preserve the type.** `buildQuestionMap` must stop discarding `questions[].type`. Prefer an ADDITIVE change so existing callers/tests keep working — e.g. keep `buildQuestionMap(questions) -> Record<id,label>` and add `buildQuestionTypeMap(questions) -> Record<id,type>`; or return a richer record and provide a thin label-only accessor. Whatever you choose, `extractAnswers` must be able to carry a `type` alongside each `{label,value}` candidate.
2. **Add `TYPE_ALLOWLIST`**, one entry per `FIELD_ALIASES` group, expressing PREFERENCE not just permission:
   - `email`: prefer `INPUT_EMAIL`
   - `phone`: prefer `INPUT_NUMBER`, `INPUT_PHONE`
   - `fullName`: prefer `INPUT_TEXT`
   - `city`: prefer `INPUT_TEXT`, `DROPDOWN`
   - `occupation`: prefer `INPUT_TEXT`, then `DROPDOWN` (the real form's designation is `INPUT_TEXT`; the decoy "@Your name, What do you do?" is `DROPDOWN`, so INPUT_TEXT must outrank it)
   - `bio`: prefer `TEXTAREA`, then `INPUT_TEXT`
3. **`MULTIPLE_CHOICE` is NEVER eligible for any of the six identity fields.** This is the single highest-value line in the change: it structurally eliminates every FAQ decoy and every prose-question-with-a-Yes-answer, in all orderings, without one word of English.
4. **Selection order becomes `(typeRank, ownFieldFirst, aliasIndex, matchTier, questionOrder)`** — type outranks every English signal. Within the preferred type the existing scoring is unchanged.
5. **Fail-soft for untyped/unknown forms.** If a form supplies no type, or no candidate matches the preferred types, fall back to the current behaviour **but still excluding `MULTIPLE_CHOICE`**. The poller walks forms nobody here has read; it must not return empty just because a form is shaped oddly.
6. **The English machinery stays as a secondary signal** — do NOT delete `THIRD_PARTY_LABEL`, the deny-list, or the possessive rule. Type resolves the common case; those still discriminate between two candidates of the SAME type (e.g. an `INPUT_EMAIL` "Your Email ID" vs an `INPUT_EMAIL` "Referrer's email" — type cannot separate those, the third-party vocabulary can).
**Acceptance:**
- Real-envelope assertions unchanged: `fullName`/`email`/`phone`/`city`/`occupation`/`bio` all resolve to the applicant's values.
- **All THREE historical regression classes green simultaneously**, both orderings: (a) FAQ/informational decoys, (b) third-party `"… of the person who referred you"` / `"Guardian name"` / `"Emergency contact email"`, (c) prose `"Can we add your email to the newsletter?"` → `"Yes"`.
- The pinned counter-case still holds: `{"Full name of my mentor":"M","Name":"Asha Menon"}` → `"Asha Menon"`; `{"Alternate phone number":"222","Phone":"9000000002"}` → `"9000000002"`.
- A same-type third-party pair still resolves to the applicant (proving the English layer still does its job under type).
- An untyped form still resolves (fallback path), and a `MULTIPLE_CHOICE`-only form yields nothing for identity fields.
- `npx vitest run` green; `npm run typecheck:functions` exits 0.

## Task T-2 — Correct the false DB COMMENT before it becomes immutable (`tier: 1`)
**Files:** `supabase/migrations/20260722140000_offerings_intake_opens_at.sql`
**Spec:** Line ~92-93 writes `COMMENT ON COLUMN … 'NULL falls back to offerings.created_at'` and line ~16 repeats it as `COALESCE(intake_opens_at, created_at)`. **Both are now FALSE** — `index.ts` filters NULL rows out of the scan entirely and the function's own log text says *"The poller never falls back to created_at."* This migration is unapplied, so fix it in place; once applied, that COMMENT is what an operator reads from `\d+ offerings` and believing it produces the silent-intake-outage state verbatim (stage a cohort, skip the column, believe intake is live). Rewrite the COMMENT and the header note to state: **`intake_opens_at` is REQUIRED for polling; an offering with NULL is skipped entirely and counted as `skippedNoCutoff`; there is no `created_at` fallback.**
**Acceptance:** no occurrence of "falls back" / `COALESCE(intake_opens_at` remains in the migration; the COMMENT states the required-and-skipped semantics.

---
## Phase acceptance
- `npx vitest run` green · `npm run typecheck:functions` exits 0 · `npm run build` green · lint no NEW errors.
- Standing invariants: Tally GET-only; exactly one `cohort_applications` insert; `status` only ever `'submitted'`; `'accepted'` never authored; `tally-application-webhook` diff = 0.
- **No real PII may enter any file.** Fixtures use synthetic personas only.
- Do NOT deploy, apply migrations, or merge.
