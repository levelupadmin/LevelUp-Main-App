# PHASE TP — Tally intake by POLLING (replaces the webhook dependency)
*Rahul ruled 2026-07-22: no Tally signing secret. Instead of an unauthenticated public webhook, the app PULLS submissions from the Tally API on a schedule. Branch `design/cohort-tally-poll`. Ships behind a flag/cron that is easy to disable.*

## Why polling, not the webhook
The webhook needs a shared secret to be safe (Tally signs with an HMAC you define). Rahul declined to set one, and an unsigned public webhook is a publicly-writable path into `cohort_applications`. We already have **proven Tally API access** (`TALLY_API_KEY`, verified live), so we pull instead. Pulling is also strictly more capable — the webhook only fires on completed submissions, while the API exposes partials too.

**Leave `tally-application-webhook` deployed and untouched.** It is fail-closed (rejects everything without a signature), so it is inert and harmless. It stays as the instant-delivery option if Rahul ever sets a secret. This phase does NOT modify it.

## VERIFIED API GROUND TRUTH (probed live 2026-07-22 — build against exactly this)
- `GET https://api.tally.so/forms/{formId}/submissions?page=N&limit=M&filter=completed`, header `Authorization: Bearer $TALLY_API_KEY`.
- Envelope: `{ page, limit, hasMore, totalNumberOfSubmissionsPerFilter: {all, completed, partial}, questions: [...], submissions: [...] }`.
- Submission: `{ id, formId, respondentId, isCompleted, submittedAt, createdAt, updatedAt, previewUrl, pdfUrl, responses: [...] }`.
- Response item: `{ id, formId, questionId, respondentId, submissionId, sessionUuid, answer, createdAt, updatedAt }` — **answers are keyed by `questionId`, NOT by label.** The label lives in the envelope's `questions[]` (`{id, title, ...}`, `title` may contain HTML and some are empty layout blocks). **You must join `responses[].questionId` → `questions[].id` → `title` to get labels.** This differs from the webhook payload (`data.fields[{label,value}]`) — the webhook's `extractField` CANNOT be reused as-is.
- `filter=completed` genuinely filters rows (verified: all `isCompleted:true`). Order is **newest-first** by `submittedAt` (verified).
- Form `81dRPA` (Creator Academy) currently: **all 3927 / completed 880 / partial 3047**, and it is **receiving live traffic today**.

## 🔴 THE HARD REQUIREMENT: an intake cutoff (do not ingest history)
Form `81dRPA` served **Edition 1 and earlier** — there are **880 historical completed submissions**. Ingesting them would fabricate 880 bogus Edition 2 applications, corrupt the NSM baseline, and (once the reminder ladder ships) could nudge hundreds of stale contacts. **The poller MUST only ingest submissions on/after the offering's intake-open cutoff.** Because the list is newest-first, the poller pages until it crosses the cutoff and then STOPS.

## The three inviolable rules still hold
1. Payment pipeline + the `ApplicationStatus.tsx` staged `isIOS()` guard: untouched.
2. **READ-ONLY against Tally** (SOR-1) — GET only, zero writes to any external system.
3. Never writes `cohort_applications.status` for TeleCRM-owned states and never authors `accepted`. The only status this may set is `'submitted'` on a row it creates (identical to the webhook's behavior today).

---

## Task TP-1 — `intake_opens_at` cutoff column (`tier: 1` — migration)
**Files:** `supabase/migrations/<newtimestamp>_offerings_intake_opens_at.sql`
**Spec:** Additive, idempotent, reversible: `ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS intake_opens_at timestamptz;` with a comment: "Poller ingests Tally submissions submitted on/after this instant only; NULL falls back to offerings.created_at. Exists because one Tally form is reused across editions." No RLS change, no index needed. Then set it for the pilot: `UPDATE offerings SET intake_opens_at = created_at WHERE slug = 'creator-academy-edition-2' AND intake_opens_at IS NULL;`
**Acceptance:** applies cleanly; Edition 2 has a non-null `intake_opens_at`; no other row altered; reversal SQL included as a comment.

## Task TP-2 — the poller edge function (`tier: 1`)
**Files:** `supabase/functions/tally-application-poll/index.ts` *(new)*, `supabase/functions/_shared/tally.ts` *(new — PURE, dependency-free helpers)*, `supabase/config.toml` *(add `[functions.tally-application-poll] verify_jwt = true` — invoked by cron with a service-role JWT, mirroring `notify-cohort`)*
**Spec:**
1. `_shared/tally.ts` (PURE, no imports, vitest-testable via `@shared/tally`): `buildQuestionMap(questions)` → `{questionId: cleanTitle}` (strip HTML tags, trim, drop empties); `extractAnswers(submission, questionMap)` → `{label: value}` (stringify non-string answers sensibly — arrays join with ", ", objects pick a sane text field); `pickField(answers, [...aliases])` → fuzzy label match mirroring the webhook's semantics (`name`/`full name`, `email`, `phone`/`mobile`/`whatsapp`, `city`/`location`, `occupation`/`profession`/`work`, `about`/`bio`/`tell us`); `formIdFromTallyUrl(url)` → the id segment of `https://tally.so/r/{id}`.
2. `index.ts`: for **every** offering with `payment_mode='staged'` AND a `tally_form_url`, resolve its formId, then page `?filter=completed&limit=100` newest-first, **stopping as soon as `submittedAt < cutoff`** where `cutoff = intake_opens_at ?? created_at`. Hard-cap pages (e.g. 20) as a runaway guard and log if the cap is hit.
3. For each in-window completed submission, upsert `cohort_applications` **idempotently on `tally_response_id` = submission.id** (the existing unique index; catch 23505 as success, exactly like the webhook at `tally-application-webhook/index.ts:164-176`). Mirror the webhook's other behaviors: dedupe by `(offering_id, email)`; link `user_id` when a `users` row matches the email; store the raw submission in `tally_data`; `status='submitted'`. Skip a submission with no email (same as the webhook).
4. **Partials: DO NOT create application rows** — `cohort_applications.status` has no honest value for an incomplete form, and inventing one would corrupt the funnel. Instead **report** them: include `partialCount` (from `totalNumberOfSubmissionsPerFilter.partial`) per form in the response + a structured log line, so the recoverable pool is finally visible as a number. (Per-user partial detail is already REQ-RECON-1's job.)
5. Read-only against Tally; `TALLY_API_KEY` via `Deno.env.get` by name; fail-soft per form (one form erroring must not abort the others); return a per-form summary `{formId, offering, scanned, created, skipped, partialCount, stoppedAtCutoff}`.
**Edge cases:** offering whose `tally_form_url` isn't a tally.so URL (skip, log); duplicate emails across editions (dedupe is per-offering, so the same person may legitimately appear in two editions — allowed); submission with `submittedAt` null (treat as out-of-window, skip); Tally 429/5xx (fail-soft, report).
**Acceptance:** unit tests green for every `_shared/tally.ts` helper (question-map join, HTML-stripped titles, alias matching, url parsing); **a cutoff test proving an out-of-window submission is NOT ingested**; idempotency test (same submission id twice → one row); zero writes to Tally (grep); never writes `status` other than `'submitted'` on insert; secrets by name.

## Task TP-3 — cron schedule (`tier: 1`)
**Files:** `supabase/migrations/<newtimestamp>_tally_poll_cron.sql`
**Spec:** Copy the proven pattern in `supabase/migrations/20260526220000_cohort_notify_cron.sql` **verbatim in structure**: ensure `pg_cron`+`pg_net`; unschedule any prior job of the same name (re-runnable); `cron.schedule('tally_application_poll_every_15min', '*/15 * * * *', ...)` calling `net.http_post` to `https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/tally-application-poll` with the service-role JWT pulled from `vault.decrypted_secrets` where `name = 'email_queue_service_role_key'` (the same vault secret that migration already reuses — do NOT embed a key).
**Acceptance:** re-runnable (unschedules first); job appears in `cron.job`; the disable path is documented in the migration comment (`SELECT cron.unschedule('tally_application_poll_every_15min');`).

---
## Phase acceptance (integrate)
- `npm run build` green; `npx vitest run` green (incl. the new `_shared/tally.ts` tests + the cutoff test); `npm run lint` no NEW errors.
- Grep proves: no writes to Tally; the poller never sets a TeleCRM-owned status; `TALLY_API_KEY` referenced by name only.
- `tally-application-webhook` is **not modified** by this phase (diff = 0).
- Do NOT deploy, do NOT apply migrations, do NOT merge — the orchestrator does that after the council.
- Conventional commits.
