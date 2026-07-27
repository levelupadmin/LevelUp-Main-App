# PHASE TP — Fix round 2 (council BLOCK)
*The re-council returned **BLOCK** (unanimous). Two findings are already closed by the orchestrator; this brief covers the rest. Branch `design/cohort-tally-poll`. Nothing deploys until this passes.*

## Already fixed — do NOT redo
- **PII leak (commit `d69b01b`)**: the "real envelope" fixture's 6 HIDDEN attribution answers still held a real person's Meta `fbclid`, `click_ts` and live `utm_*`, under a FALSE "zero PII" certification. Nulled, `submittedAt` synthesised, both certifications corrected. Caught before the branch was ever pushed.
- **Non-compiling handler (commit `6dc508c`)**: `form_polled` referenced a `cutoff` binding FX-2 deleted → `deno check` TS2552. Fixed to `windowStart`/`windowEnd`; `npm run typecheck:functions` added; CLAUDE.md Tier-1 checklist gained a step 0.

## Council findings still open

### 1. PARSER REGRESSION — a referrer/organisation field outranks the applicant's own `🔴`
`TIER_PREFIX` beating `TIER_WORD` (tally.ts ~435-440) combined with generic-alias-first ordering (~142-144) makes **"Name of X" / "Email of X" / "Phone number of X" deterministically win over the applicant's own field**, in BOTH question orderings. Reproduced against the shipped `pickField`:
- `{"Your Email ID":"real@x.com","Email ID of the person who referred you":"ref@x.com"}` → **`ref@x.com`** (must be `real@x.com`)
- `{"Your Name":"Real Person","Name of referrer":"Someone Else"}` → **`Someone Else`**

This is a **regression**: the pre-fix `includes()` matcher was at least correct whenever the applicant's own field came first. **Email is the `(offering_id,email)` dedupe key, the users-join key and the reminder recipient**, and the poller never updates a row — so a wrong pick is *permanent* and hides the application from the real applicant under RLS. It is inert on `81dRPA` (every real label there is TIER_WORD), which is exactly why the real-envelope fixture cannot catch it — and it violates `tally.ts`'s own stated invariant *"NOTHING HERE MAY BE TUNED TO ONE FORM"*.
**Fix:** lead each alias group with the specific form (`["your name","full name","name"]`, `["your email","email"]`, `["your whatsapp","your phone","phone number","phone","mobile","whatsapp"]`) so the applicant's own field wins on alias priority, and/or add an anchored deny for possessive/third-party patterns (`^(name|email|phone number) of\b`, `\bof the person\b`, `\breferr(er|ed)\b`). **Both orderings must pass.**
**Acceptance:** the four decoy pairs above resolve to the applicant's value in BOTH orderings; the real-envelope assertions stay green; a test documents the invariant that no alias may be tuned to one form.

### 2. `skippedNoCutoff` is computed but never returned `🟡`
`index.ts` computes it (~:506) and only warn-logs it; the response body (~:764) is `{ok, forms}` + `pageCapHit`. **Four separate doc blocks promise a top-level field that does not exist.** Also `if (noCutoff.count)` is falsy for `null`, so the "unknown, explicitly not zero" case emits no line at all.
**Fix:** add `skippedNoCutoff` to the response body; make the log fire for `null` as well as `>0` (distinguish "0" from "unknown"). **Acceptance:** the body contains the field; a null count still logs.

### 3. FX-2 is UNTESTED `🔴`
`resolveIntakeWindow` and `isIngestableSubmission` are not imported by the test file, and no `partitionByCutoff` call passes a third `windowEnd` argument. **All three FX-2 acceptance tests from the previous brief are missing**, and the subtlest new code — the **IST end-of-day derivation** (tally.ts ~581-598) — is entirely unexercised.
**Fix:** add them. Required cases: (a) NULL `intake_opens_at` → offering ingests nothing; (b) a submission after `application_deadline` → not ingested, and crucially **does NOT stop the newest-first scan** (post-deadline rows arrive FIRST — a stop here would silently zero the whole form while `stoppedAtCutoff` still read healthy); (c) `isCompleted:false` → not ingested even if it reaches the loop; (d) the IST end-of-day boundary — a submission at 23:59 IST on the deadline day is IN, one at 00:01 IST the next day is OUT (UTC would wrongly cut at 05:30 IST).
**Acceptance:** all four green; existing cutoff/idempotency tests stay green.

### 4. `reconcile-funnel-stage` fails `deno check` (type-only) `🟡`
Two `TS2345`s at `index.ts:645,648`: `SupabaseClient<any,"public","public",any,any>` is not assignable to the helpers' annotated `SupabaseClient<unknown,{...},never,never,{...}>` — a generics mismatch between the annotation and what `createClient` returns. **This is type-only: Deno strips types at runtime and the deployed function demonstrably works** (401/CORS smoke tests passed). But it defeats the type gate on an already-deployed function.
**Fix:** loosen the helper parameter annotations to match what `createClient` actually returns (or a structural minimum). Do NOT change any runtime behavior — this function is live in prod; the diff must be types only.
**Acceptance:** `deno check supabase/functions/reconcile-funnel-stage/index.ts` exits 0; zero runtime-behavior change (no logic lines in the diff); 395+ tests still green.

### 5. Make `typecheck:functions` usable against the pre-existing baseline `🟢`
The new script globs all functions, but **4 pre-existing failures** are unrelated to this work: `auth-email-hook` + `generate-invoice-pdf` (missing npm packages in node_modules — environment, not code), `guest-create-order` (TS2339), `verify-msg91-otp` (TS2345). All four are live and working in prod.
**Fix:** keep the script checking everything, but make the gate honest — e.g. a small `scripts/typecheck-functions.mjs` that checks every function, compares against an explicit `KNOWN_FAILING` baseline list (with a one-line reason each), exits non-zero ONLY on a NEW failure, and prints the baseline so it can't be forgotten. Do not "fix" the four by editing unrelated live functions in this phase.
**Acceptance:** the script exits 0 today; introducing a new type error in any function makes it exit non-zero; the baseline is visible in output.

---
## Phase acceptance
- `npm run typecheck:functions` exits 0 · `npx vitest run` green · `npm run build` green · `npm run lint` no NEW errors.
- Standing invariants unchanged: Tally GET-only; exactly one `cohort_applications` insert; `status` only ever the literal `'submitted'`; `'accepted'` never authored; `tally-application-webhook` diff = 0.
- Do NOT deploy, apply migrations, or merge.
