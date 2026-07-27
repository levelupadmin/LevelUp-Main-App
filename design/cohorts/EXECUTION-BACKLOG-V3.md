# LevelUp Live Cohorts — Execution Backlog **v3** (funnel-first)
### Hand-off-to-Opus plan. Every task execution-ready: zero design thinking required from the builder.

*Regenerated 2026-07-18 against the **Round-F-settled** doc stack (`design/cohorts/docs/00-INDEX` → `09-DECISION-LOG`, commit `4de3a8d`). Supersedes the pre-docs `ROOMS-BACKLOG.md` as the **master** program plan: v3 adds the two funnel slices that did not exist as a backlog before (Reconciler → Spine → Re-entry → Interview → Decision) and folds the room slice in by reference **plus a Round-F correction delta**. Format follows `design/vision/EXECUTION-BACKLOG.md` and `ROOMS-BACKLOG.md`. Re-validate every `file:line` ref against `main` before building each phase — refs are cited from the docs and drift with edits.*

**Companion docs (read before building any phase):**
- `design/cohorts/docs/01-PRD.md` — the *what*; every task cites a REQ-ID here.
- `design/cohorts/docs/08-ROLLOUT-MIGRATION.md` — the *rollout*; this backlog is its §4 ladder expressed as tasks. Flags, gates, and rollbacks are quoted from it.
- `design/cohorts/docs/04-INTEGRATION-CONTRACTS.md` — the webhook / reconciler / Calendly / Razorpay contracts, with the sacred-core `file:line` refs.
- `design/cohorts/docs/05-ACCESS-SECURITY.md` — RLS + MEMBER-1 three-tier boundary.
- `design/cohorts/ROOMS-BACKLOG.md` — the R0–R4 room tasks Slice 3 executes (see §ROOM for the delta that makes them Round-F-consistent).
- `ORCHESTRATION.md` — the per-phase loop every phase below runs inside.

---

## How to use this document
- **Each `# PHASE` becomes one `design/briefs/cohort-<code>.md`** and runs `ORCHESTRATION.md`'s loop: `design-phase-build` → `design-qa-gate` → fix-sprints → **`bugfix-council` (every Tier-1 phase)** → internal release → **Rahul device pass** → promote. **Promotion to production is never automatic** — internal track + TestFlight only until Rahul says "promote."
- **Build order is FUNNEL-FIRST, ROOMS-LAST** (PRD §4.0; Rollout §4). The reconciler ships first because the NSM is gated on it; the room slice (highest blast radius) ships last. Slice 3 may build in parallel with Slice 1 *only if* Tier-1 review bandwidth allows, but **never promotes before Slice 1** (BUILD-1).
- **Pilot vertical = Creator Academy** (PILOT-1, already LIVE — pilot its *next* intake window / *next* `pre_start` batch, in strict parallel; the running batch is never migrated mid-flight). **Wave 2 = AI cohort + BFP/VE together**; Forge folds in after wave 2.
- **Tiers** per `CLAUDE.md` — gate on **blast radius, not diff size.** 🔴 Tier 1 = `bugfix-council` + cross-platform verify + staged rollout + Rahul written sign-off. 🟡 Tier 2 = adversarial self-review + verify touched surfaces. 🟢 Tier 3 = verify it builds.
- **Every Tier-1 surface ships DARK behind exactly one flag whose OFF-state is byte-identical to today** (Rollout §5). The flag register is the control surface; a flag hides UI, it **never** grants access (RLS is always membership-gated — NFR-CONFIG-2).

### Global hard rules (every task, non-negotiable)
1. **The payment pipeline is sacred and untouched.** The staged checkout (`create-razorpay-order` staged branch, `verify-razorpay-payment`, `razorpay-webhook`) and the `ApplicationStatus.tsx:319,337` `isIOS()` staged-payment revenue guard are **do-not-touch** (PRD §4.4 / NFR-SEC-5). This program **reads and adds beside** them; it never modifies them. Any task whose diff touches these files or that guard is a bug in the task. Verify `grep -n "isIOS" src/pages/ApplicationStatus.tsx` diff = 0 after every funnel phase.
2. **The intake chain is FROZEN byte-for-byte (INTEG-PAY-1).** "Apply" opens the **existing** Tally form → **existing** in-form Razorpay ₹400 link → Calendly → app. The app inserts nothing into this chain and does **not** route the ₹400 (or the ₹8k seat-confirm) through its own order path. Everything Tally/Razorpay-intake in v1 is **read-only reconciliation**. Form-shortening (REQ-APP-3) + funnel inversion (CRO-1) are **parked to the LAST phase** (§AB) — idea retained, not deleted.
3. **The app is a READ-ONLY MIRROR of funnel status (SOR-1).** TeleCRM is the master; the app **reads** the funnel stage (including `accepted`) by **phone (primary) / email (fallback)** (INTEG-KEY-1) and **reacts** — it **never writes** a funnel status back to any external system. There is **no in-app admin decision RPC** (SEC-DECISION-1 removed). Zero writes to Tally/TeleCRM/Razorpay is a gate acceptance criterion on every reconciler-touching task.
4. **Motion + layout doctrine (the June-14 lesson).** transform/opacity-only motion from `src/lib/motion.ts`; no new `backdrop-filter`; ≥44px touch targets on anything touched; reduced-motion intact via `useMotionSafe`/CSS; hover effects fine-pointer-gated; **never touch html/body overflow**; audit **360×740 AND 375×812**; inputs keep the 16px iOS-zoom floor (never reintroduce unlayered `<16px` on a focusable field).
5. **Secrets by name only** (`CLAUDE.md`) — never echo/commit a key; reference `TALLY_SIGNING_SECRET`, `RAZORPAY_KEY_SECRET`, `CALENDLY_SIGNING_KEY`, TeleCRM/Razorpay read creds as shell-var names.
6. **File ownership is exclusive per task within a phase.** Where two tasks name the same file they are one sequential lane (marked).
7. **Copy is final unless Rahul edits it.** Em dashes fine in-app, NEVER in store metadata. The 100-word essay text is **never** surfaced in any UI (NFR-COPY-1); the word "free" appears nowhere near rescheduling (NFR-COPY-4); "mentor"/"counselor" is never used for the interviewer (REQ-INT-2).

### Gates that must clear before each slice promotes
| Gate | Applies to | Status | Action |
|---|---|---|---|
| SOR-1, INTEG-KEY-1, INTEG-PAY-1, INTEG-CRM-1 (system-of-record, join key, intake frozen, TeleCRM read-only) | All funnel phases | ✅ **RULED** (Round-F) | none — encoded in the global rules |
| OTP-1 (ship email OTP in v1) | Phase SP | ✅ **RULED yes, v1** | build behind the Tier-1 gate; phone path untouched fallback |
| MEMBER-1 three-tier room access | Phase ROOM (R0) | ✅ **RULED** | `accepted` = veil only (offering-chrome, **NO membership row, NO room read, NO preview RPC**); `confirmation_paid` = scoped `pre_member` (redacted); `enrolled` = full `member`. Adversarial suite (R10/R11) must prove the boundary |
| CHANNEL-KEY-1 (channel storage = columns on `cohort_room_posts`, not a table) | Phase ROOM (R0/R3) | ✅ **defaulted** (DATA §4.7) | land `channel_key` + `cohort_week_id` columns **dark in R0** (delta below) |
| `live_sessions.week_id` FK-type check (declared text, FK'd to uuid) | Phase ROOM (R0) | ✅ **CLOSED 2026-07-21** | Already fixed on prod: `week_id` is `uuid` with `live_sessions_week_id_fkey → cohort_weeks(id) ON DELETE SET NULL`. Verified 2026-07-22; the migration was applied directly to prod without a committed file, now reconstructed as `20260721000000_live_sessions_week_id_fk.sql` |
| TARGET-1 (provisional numeric targets) | All | ⏳ set after batch 1 | instrument events first (Phase RC); real targets follow the first reconciled batch |
| `play-publish.mjs --rollout <fraction>` flag | Phase ROOM native train | ⏳ **prerequisite** | add the flag before any Tier-1 native room release (Rollout §12 Q3) |

---
---

# SLICE 1 — Make the funnel observable & recoverable
*Lowest blast radius, ships first. Turns the NSM from unmeasurable to measurable and recovers the ~69% contactable abandoners — **without one line of room schema and without modifying the intake forms.** Auth + reconciliation are the only Tier-1 items.*

# PHASE RC — The Reconciler *(REQ-RECON-1 · rung 1.1)* — 🔴 all Tier 1, one council
**The north-star linchpin. It ships FIRST — every funnel metric and every downstream stage assumes the app knows a user's funnel stage, and today it does not.**
**Goal:** a read-only edge path that, for the logged-in user, reads Tally / TeleCRM / Razorpay by **phone (primary) → email (fallback)**, derives their funnel stage per the `FUNNEL-DATA-AUDIT.md §6` stage→CTA table, writes the derived stage onto `cohort_applications` for app-owned states, and surfaces the two markers invisible today (completed-no-fee; contactable-partial) plus a join-completeness health metric.
**Gate:** fixture stage→CTA table resolves all six rows; which key resolved (phone/email) is recorded per match; orphan-rate alert fires below the ~10% watch line; **zero writes to any external system asserted**; `bugfix-council` + secrets-by-name; flag `VITE_FUNNEL_RECON` off = app reverts to no-stage-awareness.
**Rollback:** flag off → staged home falls back to `cohort_applications.status` only; no rows to unwind (it derives on read).
**Sequencing:** RC-T1 → RC-T2 → RC-T3 (fixtures+health) → council → RC-T4 (flag+client).

### RC-T1 — External-read clients, secrets-by-name, phone-first join helper (`tier: 1`)
**Files:** `supabase/functions/_shared/reconcile.ts` *(new — pure join + read helpers)*, `supabase/functions/reconcile-funnel-stage/index.ts` *(new edge fn)*
1. `reconcile.ts` exports pure helpers only (unit-testable, no network at import): `joinKeys(user)` → `{ phone: e164(normalizePhone(user.phone)), email: user.email?.trim().toLowerCase() }` reusing `_shared/phone.ts` (`normalizePhone`, `e164`) — do NOT re-implement phone canonicalisation. `deriveStage(tallyRow, telecrmLead, razorpayCaptures)` → `{ stage, resolvedKey: 'phone'|'email'|null, markers }` implementing the §6 table as a pure function.
2. `index.ts` reads three externals **read-only**, phone first then email, recording `resolvedKey` per system: Tally partials+completion (Tally API), TeleCRM lead `status`+`mql` (`fields.phone`/`fields.email_1`), Razorpay captured amounts (`contact`/`email`, amount=product per §4). Every external credential referenced by name (`TELECRM_*`, `RAZORPAY_KEY_*` read creds, Tally token) — never inlined.
3. **The read is fail-soft per source:** if one external is unreachable, derive from the reachable ones and mark that source `unavailable` (never fabricate a stage). No external write is ever issued — assert with a grep in the PR (`grep -nE "POST|PUT|PATCH|insert|update" index.ts` touching external hosts → 0).
**Edge cases:** phone match empty → fall to email; both empty → `resolvedKey: null`, stage `unknown` (surfaced as orphan, not an error); duplicate TeleCRM leads on one phone → newest-`status` wins, logged; Razorpay ₹400 present but no Tally completion → `completed-no-fee` cannot be true (needs essay-present) — stage stays fee-ambiguous, marker off.
**Acceptance:** `deriveStage` unit tests cover all six §6 rows + both markers + the null-key orphan; zero external writes (grep); every secret is a name.

### RC-T2 — Derive & mirror stage onto `cohort_applications`; the two invisible markers (`tier: 1`)
**Files:** `supabase/functions/reconcile-funnel-stage/index.ts` *(sequential lane with RC-T1)*, `supabase/migrations/<ts>_reconciled_stage_columns.sql` *(new)*
1. Migration adds **reconciler-written** columns to `cohort_applications` (canonical names per DATA §4.2): `reconciled_stage text`, `reconciled_key text` (`phone|email|null`), `completed_no_fee boolean default false`, `contactable_partial boolean default false`, `reconciled_at timestamptz`. **No column that mirrors an external system is a source of truth** — they are a read-through cache; a comment on each says so.
2. The fn writes ONLY these app-owned mirror columns (never a TeleCRM/Tally/Razorpay write, never `cohort_applications.status` for states TeleCRM owns — SOR-1). `accepted` is **read, never written** here (it fires the Stage-06 experience in Phase DC; this fn only detects the flip).
3. Markers: **completed-no-fee** = essay-present-in-Tally/TeleCRM **minus** a matching captured ₹400 (the warmest recoverable lead); **contactable-partial** = phone+email partial with no completion. Both clear automatically when the next stage appears.
**Edge cases:** a manual TeleCRM correction after mirror → next reconcile overwrites the cache (mirror never diverges silently); `accepted` seen → `reconciled_stage='accepted'` set, but the veil/experience gate lives in MEMBER-1/Phase DC (this fn does not open the room).
**Acceptance:** completed-no-fee marker fires for essay-present+no-₹400 and clears when a matching ₹400 appears; contactable-partial fires for a phone+email partial; `reconciled_key` records which key resolved; **grep proves no write to `status` and no external write**; council sign-off recorded in PR.

### RC-T3 — Join-completeness health metric + orphan-rate alert; fixtures (`tier: 1` — the proof)
**Files:** `qa-harness/reconcile-fixtures.sql` *(new)*, `qa-harness/reconcile.spec.mjs` *(new)*, `supabase/functions/reconcile-funnel-stage/index.ts` *(health emit)*
1. Fixtures: users whose phone/email match a TeleCRM `Application Fee Paid` lead with no `Interview Scheduled`; an essay-present-no-₹400 lead; a phone+email partial; a `Converted` lead; an orphan (phone/email match nothing). Assert each resolves to the exact §6 CTA (e.g. fee-paid-no-interview → home renders "book your interview").
2. Health: the fn records the share of Tally starts and captured ₹400s that resolve to a `user_id`; **a run below the ~10% orphan watch line raises a visible alert** (not a silent under-count). The metric is queryable for the NSM baseline.
3. Wire `reconcile.spec.mjs` into `design-qa-gate` as the `funnel-reconcile` lens (re-runs on every later funnel phase).
**Acceptance:** one command, exit 0; all six §6 mappings green; orphan-rate alert fires on the orphan-heavy fixture; join-completeness is a real number in the PR.

### RC-T4 — Flag, client stage-awareness, staged home wiring (`tier: 2`)
**Files:** `src/lib/flags.ts` *(new — the single flag registry; see Rollout §5)*, `src/hooks/useFunnelStage.ts` *(new)*, `src/pages/ApplicationStatus.tsx` *(READ-ONLY consumer — do NOT touch the `isIOS()` guard at :319,337)*
1. Establish `src/lib/flags.ts` as the one honest flag registry (env + localStorage override, the `VITE_COHORT_ROOMS` pattern). Add `VITE_FUNNEL_RECON` (default off).
2. `useFunnelStage()` calls the reconcile fn (react-query, `["funnel","stage",uid]`, staleTime 60s) **only when the flag is on**; flag off → returns null and the staged home falls back to `cohort_applications.status` exactly as today (byte-identical).
3. Consume stage in the staged applicant home (REQ-IDENT-4 surface) to pick the label chip + single CTA — **without editing the payment guard**. Confirm `git diff src/pages/ApplicationStatus.tsx` shows no change to lines 319/337.
**Edge cases:** flag off = zero behavioral diff (visual spot-check); reconcile fn unreachable → home degrades to the `status`-only view, never a spinner-lock.
**Acceptance:** flag off = today's behavior byte-for-byte (incl. the `isIOS()` guard diff = 0); flag on = home reflects reconciled stage; suite + `funnel-reconcile` lens green.

---

# PHASE SP — The Identity Spine *(REQ-IDENT-1/2/3/4 + OTP-1 · rung 1.2)* — 🔴 all Tier 1, one council
**Goal:** a Tally completion auto-provisions a passwordless app account carrying **both** phone+email (so an OTP on either channel resolves to one `auth.uid`); collisions **defer** to an interactive claim (never a silent merge); sign-in offers phone-OTP (untouched) + a new email-OTP tab.
**Gate:** idempotent on `tally_response_id`; collision leaves `user_id` NULL + `pending_claim`, creates/merges nothing; phone-OTP byte-identical to `verify-msg91-otp`; email-OTP mints a session for a valid code, rejects invalid/expired; adversarial suite + council + Rahul sign-off; **the webhook's one honest kill-switch is the server-config `identity_spine_enabled` gate + code-revert to the pre-spine webhook** (a server-to-server webhook has no `VITE_` surface — Rollout §5, carved-out exception).
**Rollback:** webhook → revert `tally-application-webhook` to pre-spine (email-only link) behavior; email OTP → flag off, phone-OTP path proven-untouched fallback (Risk R8).
**Sequencing:** SP-T1 → SP-T2 → SP-T3 (email OTP) → SP-T4 (adversarial suite) → council → SP-T5 (staged home states).

### SP-T1 — Webhook auto-provision, both identifiers, idempotent (`tier: 1`)
**Files:** `supabase/functions/tally-application-webhook/index.ts` *(extend — keep the fail-closed secret guard at `:9-12` and `FORM_RESPONSE`-only at `:46-50`)*
1. On `FORM_RESPONSE` with **no** `auth.users` row matching the form's email **or** phone, mint one passwordless auth user carrying **both** identifiers — reuse the proven `guest-create-order` provisioning surface verbatim (`auth.admin.createUser({ email, phone, email_confirm:false, phone_confirm:false })`, pattern at `guest-create-order/index.ts:247-255`). Stamp `cohort_applications.user_id` to that uid. No password, no signup screen ever.
2. Idempotency: re-delivering the same `tally_response_id` creates no duplicate user and no duplicate application (extend the existing `(offering_id, email)` dedup at `:104-109` to also be safe on `tally_response_id`).
3. Gate the whole provisioning branch behind the server-config `identity_spine_enabled` read (default off) so it can be dark-switched without a redeploy; off = the pre-spine email-only-link behavior.
**Edge cases:** email present, phone absent (mint with email only, bind phone on first phone-OTP); Tally re-fires on edit (idempotent); provisioning throws → application row still lands with `user_id` NULL (never lose the lead).
**Acceptance:** one completed submission → exactly one `auth.users` row with both `email`+`phone` and `cohort_applications.user_id` stamped; same `tally_response_id` twice → no dupes; no user-facing signup screen exists anywhere (grep); flag off = pre-spine behavior byte-identical.

### SP-T2 — The collision defer + interactive claim (`tier: 1`)
**Files:** `supabase/functions/tally-application-webhook/index.ts` *(sequential lane with SP-T1)*, `src/pages/auth/ClaimApplication.tsx` *(new)*, `src/hooks/useClaimApplication.ts` *(new)*
1. Webhook side: if the incoming phone **or** email already belongs to a **different** auth user, the webhook **defers** — leaves `cohort_applications.user_id` NULL, sets `pending_claim`, creates/merges **nothing** (the collision can't be resolved server-to-server; mirrors the `guest-create-order/index.ts:118-128` interactive 403 guard, moved to the moment a human is present).
2. Client side: at the first interactive OTP sign-in, a `pending_claim` application surfaces a claim/verify step — one additional OTP on the **second** channel — and only on a correct second-channel OTP is the application attached. **No admin/support action required** (checkable by driving end-to-end with zero out-of-band steps).
**Edge cases:** shared family number (two people, one phone) → each claims via their own email OTP; claim abandoned → application stays `pending_claim`, re-surfaces next sign-in; second-channel OTP wrong → reject, no attach, no merge.
**Acceptance:** (a) email-keyed app + later same-phone OTP → one auth user, no orphan; (b) collision → `user_id` NULL + `pending_claim`, zero users created/merged; (c) claim completes in-flow with zero out-of-band steps; never a silent merge.

### SP-T3 — Email OTP sign-in (OTP-1, RULED yes-v1) (`tier: 1`)
**Files:** `supabase/functions/verify-email-otp/index.ts` *(new — mirror `verify-msg91-otp` structure)*, `src/pages/auth/*` sign-in surface *(add Email tab)*, `src/components/auth/OtpTabs.tsx` *(new)*
1. Sign-in offers a **Phone tab** (today's MSG91 flow, **untouched** — `verify-msg91-otp`) and an **Email tab** (new six-digit email code) so both channels feel identical. A person who never chose a password is never shown a password field.
2. Email-OTP resolves to the same `auth.uid` via `find_login_identity(p_phone, p_email)` (`verify-msg91-otp/index.ts:167-178`, call site `:175`) — bind-both-identifiers (SP-T1) is what makes this land on the one user.
3. Rate-limit + expiry parity with the phone path; codes single-use.
**Edge cases:** email belongs to a `pending_claim` app → routes into SP-T2's claim step; expired code → reject; unknown email → generic "code sent" (no account enumeration).
**Acceptance:** phone-OTP byte-identical to production (`verify-msg91-otp`); email-OTP mints a session for a valid code and rejects invalid/expired; no password field in the applicant flow (grep); email-first + phone-first sign-in resolve to the same uid.

### SP-T4 — Adversarial identity suite (`tier: 1` — the proof)
**Files:** `qa-harness/identity-spine.spec.mjs` *(new)*, `qa-harness/identity-fixtures.sql` *(new)*
1. Provision-idempotency: same `tally_response_id` ×3 → 1 user, 1 app. Both-identifier bind: email-keyed provision + phone-OTP → same uid. Collision-defer: pre-existing conflicting phone → `pending_claim`, 0 users minted. Claim: correct/incorrect second-channel OTP → attach/reject. OTP parity: phone path unchanged; email path mints/rejects correctly. No-signup-screen grep. No-password-field grep.
2. Wire as the `identity-spine` lens in `design-qa-gate`; re-runs on later funnel phases.
**Acceptance:** one command, exit 0; every row above green; council reviews the suite as the sign-off artifact.

### SP-T5 — The staged applicant home states (`tier: 2`)
**Files:** `src/pages/Home*` staged surface, `src/components/home/ApplicantStageCard.tsx` *(new)*
1. A signed-in applicant's home leads with one label chip (`applicant · draft` / `fee pending` / `in review` / `decision ready`) + exactly one primary (champagne) action, derived from stage (reconciled stage when `VITE_FUNNEL_RECON` on, else `cohort_applications.status`) — **no new state machine.**
2. Reuse the champagne Button variant (phase-3 `ui/button.tsx`) and the one-obvious-action-per-state rule (§6 Rule 01).
**Edge cases:** unknown/orphan stage → neutral "we're checking your application" card (never a wrong CTA); `pending_claim` → the claim step (SP-T2), not a stage chip.
**Acceptance:** each of the four sub-states renders the correct chip + single champagne action; changing the underlying status changes the surface with no other code change.

---

# PHASE RE — Re-entry & the Open Loop *(REQ-INSTALL-1/2/3, REQ-LOOP-1/2/3 · rung 1.3)* — 🟡 Tier 2
**Goal:** recover the ~69% contactable abandoners with a deadline-anchored, capped reminder ladder that **reads partial state (TeleCRM/webhook/reconciler) and nudges WITHOUT touching the form** (INTEG-PAY-1), covering both form-incomplete AND the warmest lead (completed-form / fee-not-paid), plus the open-loop re-entry home.
**Gate:** exact copy at exact offsets; single idempotency ledger (reuse the `cohort_notifications_log` pattern); goes silent within one cron cycle of the next stage; nothing in quiet hours; **no write into Tally/TeleCRM/Razorpay.**
**Rollback:** flag `VITE_REMINDER_LADDER` off → no reminders (net-neutral vs today, which sends ≈none).
**Sequencing:** RE-T1 (ladder engine + ledger) → RE-T2 (fee-gate nudges, driven by RC markers) → RE-T3 (install prompts + web-path landing) → RE-T4 (open-loop home + kept copy).

### RE-T1 — The reminder ladder engine + single idempotency ledger (`tier: 2`)
**Files:** `supabase/functions/cohort-reentry-cron/index.ts` *(new — mirror the `20260526220000_cohort_notify_cron` pattern)*, `src/lib/flags.ts` *(add `VITE_REMINDER_LADDER`)*
1. Form-incomplete ladder (reads partial state, hands back **Tally's own save-and-resume link** — never the form): **T+2h** "Your application is saved. Two taps to finish. The draft is exactly where you left it." (verbatim, kept); **T+22h** "The review batch for this cohort closes {close} — lock your application." (verbatim, kept; `{close}` from the real deadline source); **T−24h** names the exact step, skipped if either earlier touch was opened.
2. Caps enforced by **one** idempotency ledger (reuse the `cohort_notifications_log` shape): ≤1/day, ≤4/application, nothing in quiet hours, no channel double-fires. The ladder goes **fully silent within one cron cycle** of the next stage or withdrawal (driven off RC's reconciled stage).
**Edge cases:** reconciler sees the next stage between cron ticks → next tick emits nothing; quiet-hours boundary minute → suppressed; a touch already opened → later touch skipped.
**Acceptance:** form-incomplete fixture emits the exact copy at the exact offsets; caps never exceeded; nothing in quiet hours; goes silent within one cycle of the next stage; **grep proves zero writes to Tally/TeleCRM/Razorpay.**

### RE-T2 — Fee-gate nudges (the warmest lead) driven off RC markers (`tier: 2`)
**Files:** `supabase/functions/cohort-reentry-cron/index.ts` *(sequential lane with RE-T1)*
1. **Completed-form, fee-not-paid** (previously unrecovered — driven off RC's `completed_no_fee` marker): a "you're one tap from applying — complete your ₹400" nudge that hands back the **existing** in-form ₹400 link (never a new order path).
2. Once a ₹400 is captured but no interview is booked (RC stage = fee-paid-no-interview): a **"you paid, book your interview"** nudge (closes the CRO-2 scheduling gap). Both obey the same caps and go silent the moment RC sees the next stage.
**Edge cases:** marker clears mid-ladder (₹400 appears) → fee nudge stops, interview nudge may begin; fee paid + interview booked → both silent.
**Acceptance:** completed-no-fee fixture → fee nudge fires; fee-paid-no-interview fixture → "book your interview" fires; both respect caps + quiet hours + one-cycle silence; no external writes.

### RE-T3 — Install prompt at two value moments + the web path (`tier: 2`)
**Files:** `src/components/install/InstallNudge.tsx` *(new)*, `src/pages` recovery-landing wiring
1. Web is the landing; the **entire** journey (application, interview, decision, room) is completable on web — install is never a wall (REQ-INSTALL-1). Every SMS/WhatsApp/email link opens the web app; the **link target depends on where the person abandoned** (form-stage → Tally resume link; app-stage → app-authenticated deep-link).
2. Install offered at exactly **two value moments**, dismissible once (REQ-INSTALL-2) — never a repeated wall.
**Edge cases:** already-installed (native) → no prompt; dismissed → suppressed for the session; deep link as a non-authenticated user → OTP first, then the exact step.
**Acceptance:** both abandon-pools land at the right place; install appears only at the two moments and only once; web path completes the whole journey with no install wall.

### RE-T4 — The open-loop re-entry home + kept copy (`tier: 2` / copy `tier: 3`)
**Files:** `src/pages/Home*` re-entry surface *(coordinate with SP-T5 lane)*, copy deck strings
1. Re-entry reorganizes home around **one** action, **no essay text** ever (REQ-LOOP-1 / NFR-COPY-1) — personalize from structured fields only (name, cohort, craft/quiz answers, city).
2. Kept copy verbatim (REQ-LOOP-2): the two round-1 lines (RE-T1) + the tone line "The one prerequisite for any cohort is the passion to learn." Judgmental framing gone ("untouched"/"unfinished" softened; never "the only wrong answer").
3. Graceful deadline close, not deletion (REQ-LOOP-3): a lapsed window closes gracefully, the draft is never deleted.
**Acceptance:** home leads with one action; zero essay text in any state (grep); the kept lines render word-for-word; a lapsed deadline shows the graceful close, not a delete.

---
---

# SLICE 2 — Convert the middle
*Rides Slice 1's now-observable states; each surface is a conversion ceremony on the already-recovered applicant. No room dependency. The one net-new Tier-1 item is the Calendly webhook.*

# PHASE IV — The Interview *(REQ-INT-0/1/2/3 · rung 2.0)* — 🟡 Tier 2 (+ 🔴 net-new Calendly webhook)
**Goal:** book the interview on the ₹400 success screen (close the scheduling gap); student chooses modality (Google Meet OR phone) and the card honors it; interviewer shown by real first name + selectivity line (never "mentor"/"counselor"); an honest batch ledger that hides rather than invents.
**Gate:** slots create a booking + advance the **reconciled (read-only) stage — no funnel write-back (SOR-1)**; modality persists from the **verified** webhook (new signing secret); **entry parity: app-path and marketing-landing-path yield the same flow + data** (ENTRY-PARITY-1); ledger renders real numbers or hides.
**Rollback:** flag `VITE_INTERVIEW_ONSUCCESS` off → thank-you page reverts to today's single Calendly link; the webhook receiver is additive (no writer removed); disable the Calendly-side subscription.
**Sequencing:** IV-T1 (webhook receiver + modality column) → IV-T2 (on-success slots) → IV-T3 (interviewer + ledger) → IV-T4 (reschedule guardrail).

### IV-T1 — Calendly webhook receiver + signature verify + `interview_modality` column (`tier: 1` — net-new integration)
**Files:** `supabase/functions/calendly-webhook/index.ts` *(new)*, `supabase/migrations/<ts>_interview_modality.sql` *(new)*
1. New receiver on **one org-level Calendly account** (INTEG-CAL-1; two-account switching is fast-follow). Verify the Calendly signature with a **new** `CALENDLY_SIGNING_KEY` — HMAC-SHA256 of `` `${t}.${rawBody}` `` (reuse `_shared/crypto.ts` `hmacSha256Hex` + `timingSafeEqual`, the razorpay-webhook primitives; INTEG §6.2) — fail-closed if unset, exactly like the Tally webhook's `:9-12` posture.
2. Migration adds `interview_modality text` (`google_meet|phone`) to the interview-bearing row (canonical per DATA §4.2). The webhook persists the student's chosen modality + booking time; the **reconciler** (RC) is what advances the funnel stage — the webhook does **not** write a funnel status (SOR-1).
**Edge cases:** signature invalid → 401, no write; duplicate webhook delivery → idempotent on the Calendly event id; booking canceled → modality cleared, stage re-reconciled.
**Acceptance:** a valid signed booking persists modality + time; an invalid signature writes nothing; the receiver is purely additive (no existing writer touched); secret referenced by name.

### IV-T2 — Book the interview on the ₹400 success screen (REQ-INT-0 / CRO-2) (`tier: 2`)
**Files:** `src/pages/ThankYou.tsx` *(post-₹400 success step — coordinate with the existing thank-you sequence)*, `src/components/interview/SlotButtons.tsx` *(new)*
1. The ₹400 payment-success screen presents the **three soonest interview slots** as one-tap buttons (receipt → booking, one motion), so booking happens at peak intent. This **enriches the Calendly step of the existing chain** — it does not alter Tally→₹400 (INTEG-PAY-1); Calendly MAY be embedded in-app for UI control (nice-to-have, not required).
2. A student who declines still lands in RE-T2's "book your interview" nudge.
3. **ENTRY-PARITY-1:** whether the user arrived via the app or a marketing landing page, this step yields the same flow + the same reconciled data (RC joins on phone/email). Verify both entry paths produce a bookable slot and a reconcilable record.
**Edge cases:** no slots available → graceful "we'll text you the next opening" (never a dead end); slot taken between render+tap → re-fetch + re-offer; guest vs signed-in both supported.
**Acceptance:** three soonest slots render + book in one tap; declining lands in the nudge; app-path and marketing-path yield identical flow + data (parity test); the intake chain diff = 0.

### IV-T3 — Interviewer identity + the honest batch ledger (`tier: 3` copy / `tier: 2` data)
**Files:** `src/components/interview/InterviewerCard.tsx` *(new)*, `src/components/interview/BatchLedger.tsx` *(new)*
1. Interviewer: real **first name**, **no bio**, a **selectivity line** ("accepts 24% of applicants he interviews") to create perform-well FOMO. Never "mentor"/"counselor"/"BDA" in UI copy (grep).
2. Batch ledger (review-batch application/interview/admit counts) sourced from **RC's TeleCRM read-back** (`Interview completed`/`Converted` by review batch) — **no invented figures; the row hides if the source is unavailable** (the delivery `cohort_batches` has no window/close/admit counts, so the numbers must come from the reconciler).
**Edge cases:** selectivity number missing → show name only (never a fake %); ledger source down → row hidden, not zeroed.
**Acceptance:** interviewer card shows first-name + selectivity, zero forbidden titles (grep); ledger renders real reconciled numbers or hides; no invented figures.

### IV-T4 — Reschedule guardrail; the "free" ban (`tier: 3`)
**Files:** `src/components/interview/RescheduleControl.tsx` *(new)*, copy deck
1. Exactly **one** reschedule offered; never charge for more; the word **"free" appears nowhere** in interview copy (grep) and no charge copy sits near reschedule (NFR-COPY-4).
2. The card reflects the chosen modality (never assume Zoom) — Google Meet OR phone per the student's Calendly choice (IV-T1).
**Acceptance:** one reschedule offered; "free" grep = 0 in interview copy; modality honored on the card; no charge copy near reschedule.

---

# PHASE DC — The Decision *(REQ-DEC-1/2/3/4/5/6 · rung 2.1)* — 🟡 Tier 2 (+ 🔴 public-read policy)
**Goal:** a sealed decision → full-viewport reveal → **shareable artifact (v1 = PNG floor + on-device WebM; the server MP4 worker is fast-follow, RENDER-1)** → acceptance card (no essay, no seat number) → claim/enrollment flows → public admission page. **Acceptance is TeleCRM-sourced: the app READS the flip to `accepted` and fires the experience — it never writes the status** (SOR-1; SEC-DECISION-1 removed).
**Gate:** reveal ≤2.6s transform/opacity only, reduced-motion ≤200ms crossfade; **the app writes no funnel status — it only reads `accepted` and reacts** (MEMBER-1 still READS `accepted` to gate the veil); no verdict in any notification payload; public page renders only whitelisted fields (adversarial probe = 0 leaked fields); seat-release stays **manual** (SEAT-1).
**Rollback:** flag `VITE_DECISION_FLOW` off → decision reverts to today's TeleCRM-managed admin status + email; public page unpublish → 404.
**Sequencing:** DC-T1 (accepted-detection + sealed reveal) → DC-T2 (PNG+WebM artifact) → DC-T3 (acceptance card + claim/details) → DC-T4 (public admission page + policy).

### DC-T1 — Read `accepted`, fire the sealed reveal (no app write) (`tier: 2`)
**Files:** `src/pages/decision/DecisionReveal.tsx` *(new)*, `src/hooks/useDecision.ts` *(new)*, `src/lib/flags.ts` *(add `VITE_DECISION_FLOW`)*
1. The app **reads** the TeleCRM `accepted` flip (via RC's read path and/or a TeleCRM webhook if available) and fires the experience — **no in-app admin decision RPC** (SEC-DECISION-1 removed; SOR-1). The `accepted` state must reach the app promptly (reconciler cadence and/or webhook — the only sub-question left, an implementation detail).
2. The three kept beats (REQ-DEC-1): "Your decision is ready → Open your decision → Claim my seat." Sealed until the user opens it; **no verdict in any notification payload.**
3. Full-viewport reveal (REQ-DEC-2): ≤2.6s, transform/opacity only, from `src/lib/motion.ts`; reduced-motion → ≤200ms crossfade that still reveals the verdict.
**Edge cases:** `accepted` seen but flag off → today's email/admin path (no in-app reveal); rejected → the graceful decision screen, never a shareable artifact; `accepted` arrives while offline → reveal on next open.
**Acceptance:** reveal fires from READING `accepted` (grep proves no funnel-status write); reveal ≤2.6s transform/opacity only; reduced-motion path reveals verdict ≤200ms; no verdict in any notification body.

### DC-T2 — The shareable admission artifact: PNG + on-device WebM (`tier: 2`)
**Files:** `src/lib/artifact/renderAdmission.ts` *(new — canvas/WebM, on-device)*, `src/components/decision/ShareArtifact.tsx` *(new)*
1. v1 = **PNG floor + on-device WebM** generated within a 60s post-accept budget (the server-rendered MP4 worker is **fast-follow**, RENDER-1 — it needs a net-new chromium+ffmpeg host on neither deploy target). Personalize **without the essay** (name, cohort, craft, city — structured fields only).
2. Buildspace-grade shareable (LinkedIn/stories moment) — a beautiful animation with their name, shareable to stories.
**Edge cases:** WebM unsupported on the device → PNG floor still delivered (never nothing); slow device → PNG immediately, WebM when ready; reduced-motion → static PNG.
**Acceptance:** PNG always produced; WebM produced where supported, within 60s; zero essay text in the artifact (grep); artifact carries name + cohort from structured fields only.

### DC-T3 — Acceptance card, claim-my-seat, read-the-details (`tier: 2`)
**Files:** `src/pages/decision/AcceptanceCard.tsx` *(new)*, `src/pages/decision/ClaimSeat.tsx` *(new)*, `src/pages/decision/EnrollmentDetails.tsx` *(new)*
1. Acceptance card: **no essay, no seat number** (low numbers signal an empty cohort — REQ-DEC-4/9i). Replace seat numbers with the **locked future view** (Stage 07): they can SEE what's inside (locked previews) → confirming unlocks it.
2. Claim-my-seat (REQ-DEC-5): the held-seat window with **honest "seat held · closes {countdown}" copy** shown before Razorpay and persisted on scroll (this is the v1 conversion lever; automated release is fast-follow, SEAT-1). The ₹8k seat-confirm runs on the **existing** link (INTEG-PAY-1) — the app surfaces it, does not originate it.
3. Read-enrollment-details flow: what happens on claim, the fee structure (per-SKU flexible), the schedule.
**Edge cases:** window lapses → seat releases but acceptance stays valid for the next batch (said upfront — removes deadline resentment); countdown persists across scroll/refresh; guest arrival supported.
**Acceptance:** card shows no seat number + the locked-future preview; countdown copy honest + persisted; claim routes to the existing ₹8k link (app-originated order diff = 0); details flow renders the per-SKU fee + schedule.

### DC-T4 — The public admission page + read policy (`tier: 2` + 🔴 public-read policy)
**Files:** `src/pages/AdmissionPublic.tsx` *(new)*, `supabase/migrations/<ts>_admission_public_policy.sql` *(new — whitelist-only public read)*
1. Wireframe what a **recipient** sees when an admission is shared as a link (REQ-DEC-6/9h) — a public admission page rendering **only whitelisted fields** (name, cohort, a celebratory frame). No PII, no essay, no internal status.
2. The public-read RLS policy is `🔴 Tier 1`: an adversarial probe from logged-out/other-user must return **0 leaked fields**; per-record unpublish → link 404/private.
**Edge cases:** unpublished record → 404 to everyone; logged-out probe on `?id=` → only whitelisted fields; scraped field-enumeration → nothing beyond the whitelist.
**Acceptance:** adversarial probe leaks 0 non-whitelisted fields; unpublish → 404; the policy is reviewed in council as the Tier-1 artifact.

---
---

# SLICE 3 — Deliver the room *(highest blast radius, ships LAST)*

# PHASE ROOM (R0–R4) — see `design/cohorts/ROOMS-BACKLOG.md` + the Round-F delta below
The R0–R4 room execution tasks already exist, fully house-formatted, in **`design/cohorts/ROOMS-BACKLOG.md`** (backbone → threshold → season → people → third act). **Execute those tasks as written, WITH the corrections below applied** — they reconcile the pre-docs backlog to the Round-F rulings (MEMBER-1, CHANNEL-KEY-1, the native flag mirror) that were decided *after* it was written. The Rollout doc (§4 Slice 3, §5, §12) flagged each of these explicitly.

**Slice-3 promotion never precedes Slice 1 (BUILD-1).** R0 is 5 Tier-1 migrations on the login/enrolment path — the heaviest blast radius in the program — so it ships **dark (schema, zero UI)**, adversarial suite green on a **shadow project**, council + Rahul written sign-off, prod backup before apply.

### Round-F correction delta (apply on top of `ROOMS-BACKLOG.md`)
| # | ROOMS-BACKLOG task | Correction required | Source |
|---|---|---|---|
| Δ1 | **R0-T2** (content tables) — "finalizes posts per draft" (no channel columns) | Add the community **`channel_key` + `cohort_week_id` columns on `cohort_room_posts`** and land them **dark in R0** (not deferred to R3), so the taxonomy exists before any feed UI reads it (CHANNEL-KEY-1). | DATA §4.7; Rollout §4 rung 3.0 |
| Δ2 | **R0** (roles) — two-tier member/mentor | Add the **`pre_member` scoped role** (MEMBER-1 tier 2): `confirmation_paid` enters the room **heavily redacted** (whitelist: masthead, this-week overview, cohort-mate presence, announcements read-only, schedule; NOT curriculum detail/recordings/assignments/feedback; community read-only). The **`accepted` tier gets NO membership row and NO room-content read** (veil only — the council's accepted-preview RPC stays KILLED). | MEMBER-1 ruling; ACCESS §3.1 |
| Δ3 | **R0-T3 / R0-T4** (RPCs + suite) | Add the **write RPCs** (`cohort_room_post_write`/`cohort_room_reply_write`) with the channel write-path gate. **NO `get_cohort_room_preview` RPC — it is DELETED (MEMBER-1): `accepted` holds ZERO room read grant and no preview RPC of any kind; the veil is offering-chrome only (VEIL-SOURCE-1).** The adversarial suite must add **W8 (channel-forgery)**, **W9 (`is_mentor_answer`-forgery)**, **R10 (`accepted` = zero room read + "no `get_cohort_room_preview` RPC to call")**, **R11 (pre_member redaction whitelist)**. | ACCESS §5.4 SEC-MEMBER-1 / §7 R10 |
| Δ4 | **R3-T3** (feed) — currently a **FLAT feed** ("post\|question\|win", no channels) | Rebuild as the **channel taxonomy**: standing channels (Announcements · This Week auto-mint · Assignments Help · Wins · General) + niche channels; feed writes go through the write RPC — a forged `channel_key` or client-set `is_mentor_answer` is **rejected** (W8/W9); feed paginates and **ENDS**. | DATA §4.7; Rollout §4 rung 3.3 |
| Δ5 | **R1-T1** (routing flag) — compiled `VITE_COHORT_ROOMS` + localStorage only | Add a **server-readable flag mirror** so a bad **native** room build can be dark-switched **without a store release** (Capacitor binaries can't be hot-fixed) — the phase-5 remote-restore machinery. Makes the "flag off = instant native kill" rollback real. | Rollout §5, §12 Q1 |
| Δ6 | **any residual** honors-tier / tuition-credit language in room certs or fees | Room completion = **single Completion certificate** (STANDING-1 — no Distinction/Merit tiers in v1); the ₹400 is a **non-refundable review fee, not tuition credit** (FEE-1). Strip any honors-tier or credit-fee wording from the R4 certificate + any fee copy. | STANDING-1; FEE-1 |
| Δ7 | **pre-R0 chore** | Resolve `live_sessions.week_id` FK-type (declared text, FK'd to uuid): introspect prod, `ALTER` if mismatched — a mechanical gate, do it before R0-T1 applies. | 00-INDEX §4A; DATA |

**In-room commons + per-SKU vocabulary + Mentor's Desk** (PRD Stages 09/10/11) execute as `ROOMS-BACKLOG.md` R3/R4 + their own tasks; the commons is **async threads only, WhatsApp coexists until >60% weekly room engagement per cohort** (COMM-1 / R-D5). Per-SKU vocabulary is a **config-level term map** (academic register — no craft-metaphor language); each cohort/SKU can carry its own configurable vocabulary (an AI-cohort mentor sees different terms than a film cohort) — VISUAL theme + term map only, never a per-craft IA fork.

---
---

# PHASE AB — Fast-follow A/B harness *(LAST phase — RULED park, 2026-07-18)*
**Placed deliberately last** (Rahul's ruling: pay-first/form-shorten is "a future A/B, in the last phase of the app, not right now"). Nothing here ships until Rahul approves the deferred **Tally-form changes** the levers require.
**Goal:** the A/B assignment + measurement harness (rides the §7 events instrumented in Phase RC), then the parked levers as tests:
1. **CRO-1 — funnel inversion** (pay-first, ~5-field pre-payment form, essay/quiz after payment) — needs Tally reorder + payment-gate move.
2. **REQ-APP-3 — form-shortening** (progress bar, cut the quiz block, split contact page, optional Q7/Q9, forward-dated availability, ≤14 fields) — Tally-builder changes.
3. The success-page slot embed and essay-before/after-payment tests (CRO #15).
4. The rest of the CRO fast-follow backlog (`CRO-SUGGESTIONS.md` #4–#15): the unified magic link (#4), honest scarcity (#6), prep pack (#7), lapsed≠lost (#8), EMI/autopay (#9), Assignment Zero (#10), cohort map (#11), dailies wall (#12), the artifact-carries-a-door loop (#13), the payment ledger (#14), and honors-tier certs (#3, deferred per STANDING-1).
**Tier:** the harness is 🟡 Tier 2; each Tally-side lever is 🟢 Tier 3 *form-builder* but gated on Rahul's approval of the form changes (INTEG-PAY-1 freeze lifts only for the test).
**Note:** every lever here is **validated-and-parked**, not deleted — the evidence lives in `CRO-SUGGESTIONS.md` + PRD §4.3. Sequence these during the fast-follow window, not the v1 build.

---

## Build-order summary (one screen)
```
Slice 1 (funnel)   RC → SP → RE      🔴🔴🟡   ships FIRST · reconciler is the NSM linchpin
Slice 2 (convert)  IV → DC           🟡+🔴 webhook · 🟡+🔴 public page   rides Slice 1's states
Slice 3 (room)     R0(dark) → R1 → R2 → R3 → R4   🔴 heaviest · ships LAST · never promotes before Slice 1
Last phase         AB                parked CRO-1/REQ-APP-3 A/B — only after Rahul approves Tally changes
```
- **Pilot everything on Creator Academy** (next intake window for the funnel; next `pre_start` batch for the room), in strict parallel beside its running batch. **Wave 2 = AI cohort + BFP/VE together.** Forge after wave 2.
- **Every Tier-1 rung:** `bugfix-council` → cross-platform verify (Android real surface for anything touching scroll/index.css) → staged rollout (Android 10–20% held on Rahul's device pass; iOS phased) → Rahul written sign-off. Nothing promotes to prod automatically.

*End of Execution Backlog v3. This plan decomposes the Round-F-settled docs into execution-ready tasks; it does not change their scope. Where a task adds a claim, it cites a REQ-ID or a `file:line`. The three inviolable rules never bend: the payment pipeline is untouched, the intake chain is frozen, and the app never writes a funnel status.*
