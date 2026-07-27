# PHASE RC — The Reconciler (brief)
*Cohort funnel Slice 1, rung 1.1 · REQ-RECON-1 · branch `design/cohort-rc`.*
*Source of truth: `design/cohorts/EXECUTION-BACKLOG-V3.md` §PHASE RC; `design/cohorts/docs/01-PRD.md` §5.1 (REQ-RECON-1) + §5.2; `design/cohorts/docs/04-INTEGRATION-CONTRACTS.md` §7 + §2; `design/cohorts/funnel/FUNNEL-DATA-AUDIT.md` §4/§5/§6. Read those before building.*

## What this phase is
The reconciler is the **north-star linchpin** — it makes the app a first-party observer of a user's funnel stage for the first time. For the **logged-in user**, a server-side edge path reads the three external systems the app can query (**Tally, TeleCRM, Razorpay**) keyed on **phone (primary) → email (fallback)**, derives the user's funnel stage per the `FUNNEL-DATA-AUDIT.md §6` stage→CTA table, **mirrors** the derived stage onto `cohort_applications` (app-owned columns only), and surfaces two markers invisible today (**completed-no-fee**, **contactable-partial**) plus a **join-completeness health metric**. It ships **dark** behind `VITE_FUNNEL_RECON` (default off).

## The three inviolable rules (a violation is a failed task)
1. **Payment pipeline untouched.** Do NOT modify `create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`, or the `ApplicationStatus.tsx:319,337` `isIOS()` staged-payment guard. RC-T4 *reads* stage in the staged home but must leave those two guard lines byte-identical — verify `git diff src/pages/ApplicationStatus.tsx` shows no change at lines 319/337.
2. **Read-only against externals (SOR-1).** The reconciler issues **ZERO writes** to Tally / TeleCRM / Razorpay. It only READS them. It writes ONLY the app-owned mirror columns on `cohort_applications`, and it NEVER writes `cohort_applications.status` (TeleCRM owns funnel status) and NEVER writes/authors `accepted`. A grep for any external POST/PUT/PATCH or any write to `status` must return 0.
3. **Secrets by name only.** Reference `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (both already exist as edge secrets), and the NET-NEW `TELECRM_API_KEY`, `TELECRM_ENTERPRISE_ID`, `TALLY_API_KEY` via `Deno.env.get(...)`. Never inline a key. Fail-soft if a secret/system is unavailable (mark that source `unavailable`, never fabricate a stage).

## Ground-truth interlocks (use these exactly)
- **Pure helpers** live in `supabase/functions/_shared/reconcile.ts` — **dependency-free** (no imports), exactly like `_shared/phone.ts`, so vitest can import it via the `@shared/*` alias. Reuse `normalizePhone`, `e164`, `last10` from `@shared/phone` **only inside the edge fn** (`index.ts`), OR re-export the tiny bits you need — but keep `reconcile.ts` itself import-free for the join/derive PURE logic so the unit test needs no mocking. (If you must reference phone normalization inside a pure function, inline a last-10 digits helper; do not add an import to `reconcile.ts`.)
- **Edge-fn pattern** (copy from `tally-application-webhook/index.ts` + the authed fns): `Deno.serve`, handle `OPTIONS` with `corsHeadersFor(req)` (`@shared/cors`), read the caller via a **user-scoped** client `userClient.auth.getUser()` (JWT from the `Authorization` header — see `register-for-event/index.ts:27`, `verify-event-payment/index.ts:44`), then use a **service-role** client (`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`) for the mirror write. Every response carries `corsHeadersFor(req)`.
- **`cohort_applications`** (migration `20260413100000`): columns incl. `id, offering_id, user_id, email, phone, status (CHECK enum), tally_response_id, tally_data jsonb, app_fee_payment_id, …`. RLS: `students_read_own_applications` = `USING (user_id = auth.uid())` (SELECT) + `admin_manage_applications` (ALL). **The new mirror columns are covered by the existing SELECT policy for free — do NOT add or modify any RLS policy.** The service-role writer bypasses RLS.
- **`offerings`** carries `app_fee_inr`, `confirmation_amount_inr`, `tally_form_url`, `calendly_url`, `payment_mode='staged'`.
- **§4 amount→product map** (Razorpay carries no SKU): ₹400 = Live app fee; ₹600–900 = Forge app fees; ₹8,000 = Live seat-confirm; ₹15,000 = Forge seat-confirm; ≥₹22k = balance/full. Amount IS the product.
- **§6 stage→CTA table** (the six rows the derive must resolve): Tally-partial-no-completion → resume; completed-form-no-₹400 → pay ₹400; `Application Fee Paid`-no-`Interview Scheduled` → book interview; `Interview completed`-not-`Converted` → awaiting decision; ₹8k/₹15k-confirm-no-balance → pay balance; `Converted`/full → enrolled.
- **TeleCRM** read: `POST https://next.telecrm.in/autoupdate/v2/enterprise/{TELECRM_ENTERPRISE_ID}/lead/search`, join on `fields.phone` / `fields.email_1`, read top-level `status` picklist + `fields.mql`; essay presence = `fields.essay`/`character_count`. **Razorpay** read: `GET https://api.razorpay.com/v1/payments` HTTP-Basic (`RAZORPAY_KEY_ID:RAZORPAY_KEY_SECRET`), match `contact`/`email`, bucket by amount. **Tally** read: partials + completion via the Tally API (furthest-question for the resume signal). All **GET/read only.**

## Deferred to the deploy step (NOT this phase — do not block on them)
Live external credentials (`TELECRM_*`, `TALLY_API_KEY`) are set as **edge secrets by Rahul at deploy**. This phase builds + tests against the **documented contract + fixtures/mocked fetch** — it does NOT require live creds and does NOT deploy. The pure `deriveStage` is fully unit-tested with fixtures; the `index.ts` I/O layer is verified with a mocked-fetch integration test, not a live call.

---

## Tasks

### RC-T1 — Pure join + derive helpers, external-read clients, fail-soft I/O (`tier: 1`)
**Files:** `supabase/functions/_shared/reconcile.ts` (new, dependency-free pure), `supabase/functions/reconcile-funnel-stage/index.ts` (new edge fn)
**Spec:**
1. `reconcile.ts` (PURE, no imports): export `joinKeys({phone,email})` → `{ phone: <last-10 or null>, email: <lowercased-trimmed or null> }`; `deriveStage(tally, telecrm, razorpay)` → `{ stage, resolvedKey: 'phone'|'email'|null, markers: { completedNoFee, contactablePartial } }` implementing the §6 table + §4 amount buckets as a pure function; `amountToProduct(amountInr)` per §4. Every branch of the §6 table is covered.
2. `index.ts`: OPTIONS→cors; auth the caller via user-scoped `auth.getUser()`; read the caller's `phone`+`email`; read the three externals **read-only**, **phone first then email**, recording which `resolvedKey` matched per system; each external is **fail-soft** — on unreachable/unset-secret, mark that source `unavailable` and derive from the reachable ones (never fabricate). Every credential via `Deno.env.get` by name.
3. Emit **zero** external writes (assert by grep: no POST/PUT/PATCH to telecrm/razorpay/tally hosts). Response uses `corsHeadersFor(req)`.
**Edge cases:** phone match empty → fall to email; both empty → `resolvedKey:null`, stage `unknown` (surfaced as orphan, not error); duplicate TeleCRM leads on one phone → newest-`status` wins; ₹400 present but no Tally completion → completed-no-fee stays FALSE (needs essay-present).
**Acceptance:** `deriveStage` covers all six §6 rows + both markers + the null-key orphan (unit tests in RC-T3); zero external writes (grep); every secret is a name; `npx vitest run` + `npx eslint` on touched files green.

### RC-T2 — Mirror migration + stage write (app-owned columns only) (`tier: 1`)
**Files:** `supabase/migrations/<newtimestamp>_reconciled_stage_columns.sql` (new), `supabase/functions/reconcile-funnel-stage/index.ts` (sequential lane after RC-T1 — same file)
**Spec:**
1. Migration adds to `cohort_applications` (all nullable/defaulted, additive, reversible): `reconciled_stage text`, `reconciled_key text` (`'phone'|'email'|null` — no CHECK needed or a soft CHECK), `completed_no_fee boolean NOT NULL DEFAULT false`, `contactable_partial boolean NOT NULL DEFAULT false`, `reconciled_at timestamptz`. Add a SQL comment on each column: "reconciler-written read-through mirror of external state; NOT a source of truth (SOR-1)." **No RLS change, no index change required** (optionally `idx` on `reconciled_stage` if trivial). Idempotent (`ADD COLUMN IF NOT EXISTS`).
2. `index.ts` writes ONLY these five mirror columns via the service-role client. It NEVER writes `status`, and NEVER sets `accepted` anywhere. `accepted` is only READ (it will fire the Stage-06 experience in a later phase; this fn does not open any room).
3. Markers: `completed_no_fee` = essay-present-in-Tally/TeleCRM AND no matching captured ₹400; `contactable_partial` = phone+email partial with no completion. Both auto-clear when the next stage appears.
**Edge cases:** a manual TeleCRM correction after mirror → next reconcile overwrites the cache (never diverges silently); `accepted` seen → `reconciled_stage='accepted'` set, but no room opened and no status write.
**Acceptance:** migration applies cleanly on a local/shadow Postgres (or `supabase db diff` dry parse); grep proves the fn writes none of `status`/external systems and never `.update(...accepted...)` on `status`; completed-no-fee fires for essay-present+no-₹400 and clears when a ₹400 appears; `reconciled_key` records the resolving key; vitest + eslint green.

### RC-T3 — Join-completeness health metric + orphan alert + the fixtures/tests (`tier: 1` — the proof)
**Files:** `src/lib/__tests__/reconcile.test.ts` (new — vitest, imports `@shared/reconcile`), `qa-harness/reconcile-fixtures.ts` (new — fixture builders for tally/telecrm/razorpay shapes), `supabase/functions/reconcile-funnel-stage/index.ts` (health emit — sequential lane after RC-T2)
**Spec:**
1. Vitest suite drives `deriveStage` with fixtures for each §6 row: fee-paid-no-interview → stage=fee-paid-no-interview (home CTA "book your interview"); essay-present-no-₹400 → completed-no-fee marker; phone+email partial → contactable-partial; `Converted` → enrolled; orphan (matches nothing) → `resolvedKey:null` + stage `unknown`. Assert `resolvedKey` per case.
2. Health: `index.ts` records the share of resolved-vs-orphan and emits a **join-completeness** number; a run below the ~10% orphan watch line raises a **visible alert** (log level error / structured field), never a silent under-count. Keep the metric queryable (return it in the fn response payload for the client health surface + log it).
3. Fixtures are pure TS (no network); the mocked-fetch integration check for `index.ts` can live here or be described for the deploy step — the PURE derive path must be fully green without any network.
**Acceptance:** `npx vitest run` green with all six §6 mappings + both markers + orphan; the orphan-heavy fixture drives the alert branch; join-completeness is a real number in the response; eslint green.

### RC-T4 — Flag registry, client hook, staged-home read (guard untouched) (`tier: 2`)
**Files:** `src/lib/flags.ts` (new — the single flag registry), `src/hooks/useFunnelStage.ts` (new), `src/pages/ApplicationStatus.tsx` (READ-ONLY consumer — do NOT touch lines 319/337)
**Spec:**
1. `src/lib/flags.ts`: the one honest flag registry. `flag(name)` reads `import.meta.env[name]` with a `localStorage` override (mirror the `VITE_COHORT_ROOMS` env+localStorage pattern referenced in the rollout doc). Register `VITE_FUNNEL_RECON` (default **off**). Pure, unit-testable; add a small `flags.test.ts` if trivial.
2. `useFunnelStage()` (react-query, key `["funnel","stage",uid]`, staleTime 60s) calls the `reconcile-funnel-stage` fn **only when `VITE_FUNNEL_RECON` is on**; flag off → returns `null` and consumers fall back to `cohort_applications.status` exactly as today (byte-identical).
3. In `ApplicationStatus.tsx` (or the staged applicant home surface), consume the reconciled stage to pick the label chip + single CTA **only under the flag**, WITHOUT editing the `isIOS()` guard at lines 319/337. Confirm the guard diff = 0.
**Edge cases:** flag off = zero behavioral diff (the whole reconciler path is inert); fn unreachable → home degrades to the `status`-only view, never a spinner-lock.
**Acceptance:** flag off = today's behavior byte-for-byte incl. `ApplicationStatus.tsx:319,337` diff = 0 (grep/verify); flag on = home reflects reconciled stage; `npm run build` + `npx vitest run` + `npm run lint` green.

---

## Phase acceptance (integrate)
- `npm run build` green, `npx vitest run` green (incl. the new reconcile + flags tests), `npm run lint` clean.
- `git diff src/pages/ApplicationStatus.tsx` shows **no change at lines 319/337** (the `isIOS()` staged-payment guard).
- Grep proves: zero external POST/PUT/PATCH; the fn never writes `cohort_applications.status`; secrets are names only.
- Everything is **dark** (`VITE_FUNNEL_RECON` default off) — flag-off is byte-identical to today.
- Commits are conventional (`feat(cohort): reconciler pure derive + edge fn`, `feat(cohort): reconciled_stage mirror columns`, etc.). Do NOT merge to main. Do NOT deploy. Do NOT apply the migration to prod.
