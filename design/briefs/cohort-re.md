# PHASE RE — Re-entry & the Open Loop
*Slice 1, rung 1.3 · REQ-INSTALL-1/2/3 · REQ-LOOP-1/2/3 · branch `design/cohort-re` · worktree `/Users/rahulsrinivas/Claude/LevelUp-re`.*
*Sources: `design/cohorts/EXECUTION-BACKLOG-V3.md` §PHASE RE; `docs/01-PRD.md`; `04-INTEGRATION-CONTRACTS.md`.*

## 🔴 READ THIS FIRST — three rulings that OVERRIDE the backlog

The backlog's RE section was written before the data model was checked against production. I checked it on 2026-07-28 (project `ivkvluezuiojovpotlyb`). Three corrections, all settled with Rahul:

### Δ1 — THE FORM-INCOMPLETE LADDER IS CUT. It has no addressable population.
The backlog's RE-T1 centres on people who started the Tally form and never finished. **Those people do not exist in this database.** Verified:
- `reconcile-funnel-stage/index.ts` only ever `UPDATE`s `cohort_applications` (lines 724, 761) — there is **no INSERT and no upsert**, so a TeleCRM lead never becomes a row.
- A `cohort_applications` row exists only *because* someone completed the Tally form. So "form-incomplete" is definitionally rowless.
- `crm_contacts` holds **1 row**. It is not a lead store in practice.

**Build against the two pools that DO exist**, both real columns on real rows (`20260722120000_reconciled_stage_columns.sql`):
1. **`completed_no_fee`** — form submitted, ₹400 unpaid. This is the warmest lead in the funnel and the one the backlog calls "previously unrecovered".
2. **fee-paid-no-interview** — derived from `reconciled_stage`. Closes the scheduling gap the CRO analysis calls "born in the hour between paying and scheduling".

Form-incomplete stays TeleCRM's job. TeleCRM is the system of record (SOR-1) and already runs its own outreach; duplicating it in-app would double-message the same person from two systems that cannot see each other's sends.

### Δ2 — EMAIL ONLY in v1. The engine is channel-agnostic; only the sender is email.
- **Email is fully built and proven**: `queue-transactional-email` → `process-email-queue`.
- **WhatsApp goes through Interakt** (`sendWhatsApp(phone, templateName, vars)`, `notify-cohort/index.ts:173-190`, `INTERAKT_API_KEY`) and requires a template **pre-approved by Meta**. We cannot create one in code — only call it by name.
- Therefore: build the ladder so a channel is a strategy, not a hard-coded branch. Ship with the email sender wired and the WhatsApp sender present but **inert until a template name is supplied**. Adding WhatsApp later must be dropping in a name, never a rebuild.
- **SMS is not available**: MSG91 is OTP-only in this repo. Do not invent a transactional SMS path.

### Δ3 — SHIPS OFF. Enabling it is Rahul's switch, not ours.
This phase sends real messages to real applicants — outward-facing in a way a UI flag is not. Build it, prove it against fixtures, ship it behind `VITE_REMINDER_LADDER` **default OFF**, and hand over a verified switch. **Do not enable it. Do not send a live message during development** — fixtures only, and any dry-run must be provably incapable of dispatch.

## The inviolable rules
1. **The intake chain is FROZEN (INTEG-PAY-1).** Nudges hand back the **existing** ₹400 link and the **existing** Calendly link. The app inserts nothing into the chain and originates no order.
2. **The app writes no funnel status (SOR-1)** and **never writes to Tally, TeleCRM or Razorpay.** Grep must prove zero external writes.
3. **NFR-COPY-1: the 100-word essay is NEVER surfaced.** It lives in `cohort_applications.bio`, and the raw submission — essay included — lives in `tally_data`. **Check BOTH columns**; an earlier phase in this program grepped the wrong one and certified a surface clean that was not. Personalise from structured fields only (name, cohort, craft, city).
4. **The payment pipeline and the `isIOS()` guards in `ApplicationStatus.tsx` are untouched** (verify by `grep -n "isIOS" src/pages/ApplicationStatus.tsx`, diff = 0 — do NOT trust line numbers, they have drifted before).
5. Secrets by name only. `npm run typecheck:functions` must pass.

## Ground truth verified in this repo — build against these, do not re-derive
- **The existing ledger `cohort_notifications_log` will NOT work unmodified.** Its `user_id` is `NOT NULL REFERENCES public.users(id)` (`20260526210000:66`), and its UNIQUE is `(template_key, user_id, related_kind, related_id)`. A recoverable applicant may have **no** `public.users` row. Reuse the *shape and discipline*, but key the RE ledger on the **application**, not the user.
- Cron precedent: `20260722140100_tally_poll_cron.sql` (pg_cron + pg_net + vault). Note `timeout_milliseconds := 60000` — a ladder pass must finish inside it or chunk.
- **No quiet-hours logic exists anywhere in this repo.** It must be built, IST-aware. Do not assume a helper exists.
- `user_marketing_prefs` holds **0 rows** — there is no opt-in data to consult. Treat these as service messages to someone who submitted an application, keep an unsubscribe path in every email, and never claim consent the data does not show.

---

## Task E-1 — The ladder engine + its own idempotency ledger (`tier: 2`)
**Files:** `supabase/functions/cohort-reentry-cron/index.ts` *(new)*, `supabase/functions/_shared/ladder.ts` *(new — PURE)*, `src/lib/__tests__/ladder.test.ts` *(new)*, `supabase/migrations/20260730100000_reentry_ledger.sql` *(new)*, `src/lib/flags.ts`
**Spec:**
1. `_shared/ladder.ts` is **PURE and dependency-free** (vitest imports it via `@shared/ladder`, zero mocking, like `_shared/phone.ts`): given a row's markers, its timestamps, the send history and a clock, decide `{ send: false } | { send: true, templateKey, channel }`. Every rule below is a pure decision so it is unit-testable without network or database.
2. **Caps, all enforced in the pure layer:** ≤1 message per application per day; ≤4 per application ever; nothing during quiet hours (IST); no channel double-fire for the same step.
3. **Goes fully silent within ONE cron cycle** of the application reaching the next stage or being withdrawn — driven off the reconciled stage, never off a local guess.
4. **The ledger migration** creates a table keyed on `(application_id, template_key)` with a UNIQUE that makes a double-send impossible even if the cron overlaps itself. Additive/idempotent/reversible, **no `RAISE EXCEPTION`** (a shared `db push` must not abort). RLS on, admin-read only.
5. Register `VITE_REMINDER_LADDER` in the existing `src/lib/flags.ts` registry, **default OFF**.
**Edge cases:** the reconciler advances the stage between ticks → next tick emits nothing; the quiet-hours boundary minute → suppressed; two overlapping cron invocations → the UNIQUE holds and neither double-sends; an application with no contactable channel → skipped and counted, never retried forever.
**Acceptance:** every cap unit-tested including boundaries; overlapping invocations cannot double-send (prove it against the constraint, not by reasoning); grep proves zero writes to Tally/TeleCRM/Razorpay; `deno check` green.

## Task E-2 — The two nudges that have a real population (`tier: 2`)
**Files:** `supabase/functions/cohort-reentry-cron/index.ts` *(sequential with E-1 — same file, do not run in parallel with it)*
**Spec:**
1. **`completed_no_fee`** → a "you're one tap from applying, complete your ₹400" nudge that hands back the **existing in-form ₹400 link**. Never a new order path.
2. **fee-paid-no-interview** → a "you paid, book your interview" nudge handing back the **existing Calendly link**.
3. Both obey E-1's caps and go silent the moment the reconciler sees the next stage.
**Edge cases:** the marker clears mid-ladder (₹400 lands) → the fee nudge stops and the interview nudge may begin; fee paid AND interview booked → both silent; a marker that flaps between ticks must not re-send (the ledger is the guard).
**Acceptance:** a `completed_no_fee` fixture fires the fee nudge; a fee-paid-no-interview fixture fires the interview nudge; both respect caps, quiet hours and one-cycle silence; **zero live sends during development**.

## Task E-3 — Install prompt at two value moments + the web path (`tier: 2`)
**Files:** `src/components/install/InstallNudge.tsx` *(new)*, `src/hooks/useInstallMoment.ts` *(new)*
**Spec:** REQ-INSTALL-1/2. **Web is the landing and the entire journey is completable on web — install is NEVER a wall.** Offer install at exactly **two** value moments, dismissible once, never a repeated interruption. Already-installed (native, use the existing `isNative()`) → no prompt at all.
**Edge cases:** dismissed → suppressed for the session; a deep link hitting a signed-out user → OTP first, then land on the exact step they came for, not a generic home.
**Acceptance:** the prompt appears at only the two moments and only once; native shows nothing; the whole journey completes on web with no install wall (walk it and say so).

## ⛔ RE-T4 (the open-loop home) is NOT in this phase
It edits the Home surface, which phase SP already owns (`ApplicantStageCard`, `useApplicantStage`). Two branches editing Home in parallel is how work gets destroyed. It lands after SP merges, as its own task.

---
## Phase acceptance
- `npm run build` · `npx vitest run` · `npm run typecheck:functions` green; lint no NEW errors.
- Greps prove: no essay text (**check `bio` AND `tally_data`**); no external writes; `isIOS()` guards diff = 0.
- Everything behind `VITE_REMINDER_LADDER`, default OFF; flag-off = byte-identical to today.
- **Nothing was sent to a real person.** Say so explicitly, and say how you know.
- Do NOT deploy, apply migrations, enable the flag, or merge.
