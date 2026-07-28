# PHASE IV — The Interview
*Slice 2, rung 2.0 · REQ-INT-0/1/2/3 · branch `design/cohort-iv` · worktree `/Users/rahulsrinivas/Claude/LevelUp-iv`.*
*Sources: `design/cohorts/EXECUTION-BACKLOG-V3.md` §PHASE IV; `docs/01-PRD.md` §5.5; `04-INTEGRATION-CONTRACTS.md` §6.*

## What this phase is
Close the biggest structural loss after form abandonment: **"fee paid, interview not scheduled"**, which the CRO analysis says is "born in the hour between paying and scheduling". Three soonest slots go on the ₹400 success screen; the student picks the modality; the card honours it; the interviewer is shown in a way that creates perform-well pressure rather than reassurance.

## The inviolable rules
1. **The intake chain is FROZEN (INTEG-PAY-1).** We do NOT modify the Tally form, the in-form ₹400 Razorpay link, or the redirect. We ENRICH the Calendly step that already follows. The app originates no payment.
2. **The payment pipeline and `ApplicationStatus.tsx:319,337` `isIOS()` guard are untouched.**
3. **The app never writes a funnel status (SOR-1).** Booking advances the *reconciled, read-only* stage; it does not write back to TeleCRM.
4. **NFR-COPY-4:** the word **"free"** appears nowhere in interview copy (grep), and no charge copy sits near reschedule. **REQ-INT-2:** never "mentor", never "counselor" (grep).
5. Secrets by name only; `npm run typecheck:functions` must pass.

## Credentials already exist — do not invent names
The vault holds `CALENDLY_TOKEN` and `CALENDLY_WEBHOOK_SIGNING_KEY` (`LevelUp Core/.env.calendly`). `04-INTEGRATION-CONTRACTS.md` §6.2 specifies the scheme: **HMAC-SHA256 of `` `${t}.${rawBody}` `` with `CALENDLY_SIGNING_KEY`, hex, `timingSafeEqual`**, reusing `_shared/crypto.ts` (`hmacSha256Hex`, `timingSafeEqual`) — the same primitives `razorpay-webhook` uses. **Fail-closed on bad/absent signature, exactly like the Tally webhook.** Use the env name `CALENDLY_SIGNING_KEY`; the vault variable is `CALENDLY_WEBHOOK_SIGNING_KEY` and the orchestrator maps it at deploy.

## INTEG-CAL-1: ONE org-level Calendly account in v1
Two-account switching is fast-follow. Build for a single account and do not add per-interviewer credential plumbing.

---

## Task V-1 — Calendly webhook receiver + `interview_modality` (`tier: 1`)
**Files:** `supabase/functions/calendly-webhook/index.ts` *(new)*, `supabase/functions/_shared/calendly.ts` *(new — pure)*, `src/lib/__tests__/calendly.test.ts` *(new)*, `supabase/migrations/20260728100000_interview_modality.sql` *(new)*, `supabase/config.toml`
**Spec:**
1. `_shared/calendly.ts` **PURE, dependency-free** (vitest via `@shared/calendly`): `parseSignatureHeader(header)` → `{t, v1}`; `signingPayload(t, rawBody)`; `modalityFromEvent(payload)` → `"google_meet" | "phone" | null` (Calendly reports location as an object — map its `type`/`kind`, and treat an unrecognised location as `null`, never a guess); `bookingFromEvent(payload)` → `{ inviteeEmail, inviteePhone, startTime, eventUri, canceled }`.
2. `index.ts`: verify the signature fail-closed (401, no detail); idempotent on the Calendly event URI; persist modality + start time against the matching `cohort_applications` row resolved by **phone-primary / email-fallback** (INTEG-KEY-1). It records the booking; the **reconciler** derives funnel stage. **It writes no funnel status.**
3. Migration: `ALTER TABLE public.cohort_applications ADD COLUMN IF NOT EXISTS interview_modality text, ADD COLUMN IF NOT EXISTS interview_starts_at timestamptz;` additive/idempotent/reversible, no RLS change, with a COMMENT stating the reconciler owns stage and this column is booking fact only. **No `RAISE EXCEPTION`** (an aborting DO block would take sibling migrations down in the same push).
   > **CORRECTION — `interview_starts_at` is NOT to be created. Do not re-add it.** The contract overrides this line: `04-INTEGRATION-CONTRACTS.md:390` scopes the net-new work as `interview_modality` "plus reuse of the existing `interview_date` column (`20260413100000`)", and `:409` maps `start_time` → `cohort_applications.interview_date`. A second start column would give one fact two homes. The shipped migration therefore reuses `interview_date` as the ONE start instant and **drops** `interview_starts_at` if an earlier revision of the file created it. It also carries three further columns the receiver's own contract requires (`reschedule_count`, `calendly_event_uri`, `calendly_booked_at`) plus `calendly_canceled_at`, the cancellation signal — which must be its own column precisely because `interview_date` is shared, so an empty start is not proof a booking was cancelled. See the migration header for the full reasoning.
4. `config.toml`: `[functions.calendly-webhook] verify_jwt = false` — it is self-authenticating via HMAC, exactly like `razorpay-webhook`; state that in a comment.
**Acceptance:** a correctly-signed booking persists modality + start; a bad/absent signature writes nothing and returns 401; duplicate delivery is idempotent; an unrecognised location yields `null` not a guess; cancellation clears the booking; pure helpers unit-tested with zero network; `deno check` green.

## Task V-2 — Slots on the ₹400 success screen (`tier: 2`)
**Files:** `src/components/interview/SlotButtons.tsx` *(new)*, `src/hooks/useInterviewSlots.ts` *(new)*
**Spec:** REQ-INT-0 (this is CRO-2 made buildable). Present the **three soonest** slots as one-tap buttons at the post-₹400 step, so booking happens at peak intent. Read availability from Calendly via a thin server call (never expose `CALENDLY_TOKEN` to the client). Declining still leaves the applicant recoverable by RE's "book your interview" nudge. **ENTRY-PARITY-1:** the app path and the marketing-landing path must yield the same flow and the same reconcilable data. Motion transform/opacity only; ≥44px targets; reduced-motion intact; audit 360×740 and 375×812.
**Edge cases:** no slots → graceful "we'll text you the next opening", never a dead end; a slot taken between render and tap → re-fetch and re-offer; works signed-in and guest.
**Acceptance:** three soonest slots render and book in one tap; no-slots path is graceful; token never reaches the client (grep); build + lint green.

## Task V-3 — Interviewer card, honest ledger, reschedule guardrail (`tier: 2`)
**Files:** `src/components/interview/InterviewerCard.tsx` *(new)*, `src/components/interview/BatchLedger.tsx` *(new)*, `src/components/interview/RescheduleControl.tsx` *(new)*
**Spec:**
- **Interviewer (REQ-INT-2):** real **first name**, **no bio**, and a **selectivity line** ("accepts 24% of applicants he interviews") to create perform-well pressure. If the selectivity number is unavailable, show the name alone — **never a fabricated percentage**. The words "mentor" and "counselor" must not appear (grep).
- **Ledger (REQ-INT-3):** review-batch application/interview/admit counts sourced from the reconciler's TeleCRM read. **HIDE the row when the source is unavailable — never invent figures.** The delivery `cohort_batches` table has no window/close/admit columns, so do not attempt to derive it from there.
- **Reschedule:** exactly ONE offered; never charge for more; the word "free" appears nowhere (grep); no charge copy near it. The card reflects the student's chosen modality — **never assume Zoom**.
**Acceptance:** selectivity renders or the line is absent (no fake %); ledger renders real numbers or hides; one reschedule; "free"/"mentor"/"counselor" greps all return 0 in interview copy; modality honoured.

---
## Phase acceptance
- `npm run build` · `npx vitest run` · `npm run typecheck:functions` green; lint no NEW errors.
- Intake chain diff = 0 (no Tally/Razorpay-link changes); payment pipeline + `isIOS()` guard diff = 0.
- The app writes no funnel status; Calendly access is signature-verified and fail-closed.
- Do NOT deploy, apply migrations, or merge.
