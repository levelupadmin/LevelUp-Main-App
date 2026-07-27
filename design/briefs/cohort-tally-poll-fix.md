# PHASE TP — Fix round (council REVISE + verified parser defects)
*The `bugfix-council` returned **REVISE** on `design/cohort-tally-poll`. This brief closes every blocking finding. Branch unchanged. Nothing is deployed or applied until this passes.*

## What the council got WRONG (do not "fix" this — it is already correct)
The council claimed `full_name` would capture a Meta ad creative name (`ad_name` alias collision). **I probed the live form and disproved it.** Form `81dRPA`'s hidden fields have **EMPTY titles** (question indices 0–5) — `ad_name`/`campaign`/`fdclid` are *TeleCRM* field names, NOT Tally question titles. `buildQuestionMap` already drops empty titles. Verified against a real live submission: `fullName` resolved to the applicant's own name ✅, `email` ✅, `phone` ✅, `city` ✅. **Leave that behavior as-is.**

## What the council got RIGHT (verified by running the shipped parser on a REAL submission)
Two genuine parser defects, same root cause the council identified (naive substring alias matching against a real form):
1. **`occupation` captures form marketing copy.** Alias `"work"` matches the informational block **"How does the academy *work* week to week?"**, yielding `"Learn live on weekends. Execute during the…"`. It should capture **"What is your most recent designation?"**.
2. **`bio` is silently NULL — the 100-word essay is dropped.** Aliases `about/bio/tell us` match nothing. The real label is **"Write your heart out! (In 100 words or more)"**. This is the funnel's core qualification signal, and REQ-RECON-1's `completed-no-fee` marker keys off essay presence, so losing it breaks a downstream requirement.

## The real form's field map (ground truth — probed 2026-07-27, now committed as a fixture)
`qa-harness/tally-81dRPA-real-envelope.json` holds the **REAL** 29-question envelope (real ids/titles/order; every answer anonymised, zero PII). The fields that matter:
| Target | Real label |
|---|---|
| fullName | `Your name` |
| email | `Your Email ID` |
| phone | `Your Whatsapp Number` |
| city | `Which City are you from?` |
| occupation | `What is your most recent designation?` |
| bio / essay | `Write your heart out! (In 100 words or more)` |
Decoys that must NOT match: `@Your name, What do you do?`, `How does the academy work week to week?`, `What is the LevelUp Creator Academy?`, `At the Academy, you are mentored by:`.

---

## Task FX-1 — Robust field matching + REAL fixtures (`tier: 1`)
**Files:** `supabase/functions/_shared/tally.ts`, `src/lib/__tests__/tally.test.ts`, `qa-harness/tally-fixtures.ts`
**Spec:**
1. Replace naive `includes()` alias matching in `pickField` with **scored, word-boundary matching**. Required precedence: exact label match → label *starts with* alias → alias appears as a **whole word** (`\b` boundaries, case-insensitive) → (no bare substring fallback for generic aliases). Ties break by earliest question order.
2. **Retune the alias lists against the real labels above.** Drop the dangerously generic `"work"` from occupation; use `occupation | profession | designation | what do you do`. For bio/essay use `write your heart | 100 words | about you | bio | tell us`. Keep name/email/phone/city aliases (they already resolve correctly) but re-verify under the new matcher.
3. **Add an informational-block guard:** a question whose label is a marketing/FAQ block (e.g. matches `how does the academy|what is the levelup|you are mentored by|by the end of the program|select one`) must never be selected as a data field. Implement as an explicit deny-list checked before scoring.
4. **Rebuild `qa-harness/tally-fixtures.ts` from the REAL envelope** (`qa-harness/tally-81dRPA-real-envelope.json`) instead of the invented labels. Keep a small synthetic fixture only for edge cases (empty titles, HTML titles, array/object answers).
5. **Tests must assert the real-form mapping end to end**: from the real envelope, `fullName='Test Applicant'`, `email='applicant@example.invalid'`, `phone='9000000001'`, `city='Chennai'`, `occupation='Freelance Video Editor'`, `bio='REDACTED_ESSAY_TEXT_100_WORDS'`. Add explicit negative tests proving each decoy label above is NOT selected.
**Acceptance:** every field above resolves correctly from the REAL envelope; all decoy negatives pass; `npx vitest run` + eslint green.

## Task FX-2 — Close the cutoff/window/partial holes (`tier: 1`)
**Files:** `supabase/functions/tally-application-poll/index.ts`, `supabase/functions/_shared/tally.ts` *(sequential lane after FX-1)*, `src/lib/__tests__/tally.test.ts` *(sequential lane after FX-1)*
**Spec:**
1. **Cutoff must FAIL CLOSED, not open.** Today `cutoff = intake_opens_at ?? created_at` and a NULL merely warns then proceeds — and nothing sets `intake_opens_at` for any future offering (no admin surface), so NULL is the permanent default. Change to: **an offering with NULL `intake_opens_at` is SKIPPED entirely** (explicit opt-in per offering), reported in the summary as `skippedNoCutoff`. Never fall back to `created_at`. Also add `.not("intake_opens_at","is",null)` to the offering query so such rows are never even scanned.
2. **Add an upper bound to the intake window.** `isInIntakeWindow` is currently `submitted >= cutoff` with no ceiling, so an always-on lead form mints applications forever. Honor **`offerings.application_deadline`** (already exists and is already rendered to applicants as the close date at `src/pages/PublicOffering.tsx:1427-1428`) as an inclusive-end bound when non-null: ingest only `cutoff <= submittedAt <= application_deadline (end of that day)`. A NULL deadline means no ceiling (current behavior) — but report it in the summary so it is visible.
3. **Defend the partial guarantee in code, not just in a query string.** The `&filter=completed` query param is the only thing preventing partial ingestion today; `isCompleted` is declared but never read. Add an explicit `if (submission.isCompleted !== true) skip` check before any insert, counted as `skippedNotCompleted`.
4. Extend the per-form summary with `skippedNoCutoff`, `skippedNotCompleted`, and the resolved `windowStart`/`windowEnd`.
**Acceptance:** an offering with NULL `intake_opens_at` ingests nothing (test); a submission after `application_deadline` is not ingested (test); a submission with `isCompleted:false` is not ingested even if it reaches the loop (test); existing cutoff/idempotency tests stay green.

## Task FX-3 — Make the caller gate unforgeable (`tier: 1`)
**Files:** `supabase/functions/tally-application-poll/index.ts` *(sequential lane after FX-2)*
**Spec:** The handler currently parses the bearer JWT payload and requires `role=service_role`, but it **does not verify the signature** — and this repo's own docs (`src/docs/content/tech.ts:119-120`) call `--no-verify-jwt` the standard deploy flag, which would make the gate a forgeable string. Replace the unverified-payload parse with a **direct constant-time comparison of the bearer token against `SUPABASE_SERVICE_ROLE_KEY`** (already in the fn's env; use the existing `timingSafeEqual` from `_shared/crypto.ts`). This is unforgeable without the key and holds regardless of the `verify_jwt` setting or deploy flags. Keep `verify_jwt = true` in config.toml as defense in depth. Reject with 401 and no detail on mismatch; never log the token.
**Acceptance:** a request bearing the anon key is rejected 401; a request with no auth is rejected; only the service-role key passes (unit-verifiable via the extracted comparison helper if practical, else code-review + a live post-deploy probe); token never logged.

---
## Phase acceptance (integrate)
- `npm run build` green; `npx vitest run` green (incl. all real-envelope + negative + window/partial tests); `npm run lint` no NEW errors.
- Grep still proves: Tally access is GET-only; the only write is the `cohort_applications` insert; `status` is only ever the literal `'submitted'`; `'accepted'` never authored; `tally-application-webhook` diff = 0.
- Do NOT deploy, do NOT apply migrations, do NOT merge.
