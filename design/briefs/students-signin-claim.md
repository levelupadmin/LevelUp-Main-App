# PHASE SC — Purchases attach at verified sign-in, never at signup
*Rahul's design, 2026-07-27. Supersedes five revisions of a signup-time claim fix.*

## THE RULING (Rahul, verbatim intent)
> "Anyone who already has a purchase with us doesn't have to sign up — you can stop them at signup, saying you already have an account, and just enable them to sign in instead."

Which yields one rule that resolves everything below:

> **Purchases attach at VERIFIED SIGN-IN. Never at signup.**

## WHY THIS IS THE RIGHT SHAPE (and five revisions were the wrong one)
The signup-time claim has been broken in production since **2026-06-11** and has now failed adversarial review five consecutive times. Each revision tried to make a claim safe at a moment when *identity is not yet proven*. It cannot be made safe there:

- At signup the account row is written **before** any code is verified. GoTrue creates the row, *then* sends the OTP.
- So a claim at that instant is a claim on an **asserted** phone, not a **proven** one.
- Every gate we tried was either forgeable (`public.users.phone`, carried from `options.data`), inert (`phone_confirmed_at`, which GoTrue sets in a *later* UPDATE — measured: 242/242 rows confirmed after insert, zero at the same instant), or dialect-mismatched (`+91…` vs `91…`, matching 0 of 73,926 rows).

Move the claim to sign-in and all of it dissolves. At sign-in the phone is **already confirmed**, so `phone_confirmed_at IS NOT NULL` — inert at signup — becomes exactly the right gate.

## VERIFIED FACTS (prod `ivkvluezuiojovpotlyb`, 2026-07-27 — build against these)
- Phone signup is enabled (`external_phone_enabled: true`, `disable_signup: false`), but **no SMS can be sent**: Twilio credentials are null and the send-SMS hook points at `send-sms-otp`, which is **not among the 27 deployed functions**. So phone signups roll back today — the protection is accidental, not designed.
- `verify-msg91-otp` creates users with `phone_confirm: true` (`index.ts:266-272`), so after MSG91 verification the phone IS confirmed.
- `check-user-exists` **already exists and is hardened**, and is called by **nobody** in `src/`.
- `Signup.tsx` has two paths: the MSG91 widget (`sendSmsOtp`) and `supabase.auth.signInWithOtp({ email, data: { phone } })` (`sendEmailLink`, ~:105) — the latter creates an unverified auth row carrying a **forgeable** phone.
- 73,865 unclaimed rows; 73,441 canonical `+91`; 485 `foreign:` placeholders; **zero** neither.
- 11 of 11 soft-deleted users retain `auth.users.phone`; `cleanup_deleted_users` exists but is **NOT scheduled** (prod has exactly two cron jobs), so a wrong stamp is permanent.

---

## Task SC-1 — Stop claiming at signup; claim at verified sign-in `🔴 Tier 1`
**Files:** `supabase/migrations/20260727220000_claim_at_signin.sql` *(new)*
**Spec:**
1. **Neuter the signup-time claim.** Replace `claim_legacy_enrolments_for_user()` with a body that does nothing but `RETURN NEW`, and say why in a comment. Do **not** drop the trigger (leaving it in place keeps the rollback trivial and avoids a schema surprise). This single change ENDS THE SIGNUP OUTAGE — not by repairing the broken INSERT, but by removing it. No constraint can be violated by a statement that no longer runs.
2. **Add `claim_my_purchases()`** — SECURITY DEFINER, zero-arg, `SET search_path = public, pg_temp`, uses `auth.uid()`. It:
   - resolves the caller's `auth.users` row and requires **`phone_confirmed_at IS NOT NULL`** (correct here, unlike at signup — by sign-in time confirmation has happened);
   - requires the caller's `public.users.deleted_at IS NULL`;
   - canonicalises the confirmed auth phone to `+91XXXXXXXXXX` (GoTrue stores it `91`-prefixed; `legacy_enrolments` stores `+91` — a raw compare matches nothing);
   - INSERTs `enrolments` with `source='migration'` (the only legal value; `enrolments_source_check` rejects `tagmango_migration`) for unclaimed rows where `offering_id IS NOT NULL`, guarded by `NOT EXISTS (... AND e.status='active')`;
   - stamps `claimed_by_user_id`/`claimed_at` **only** on rows it could actually grant, leaving NULL-offering rows unclaimed so `grant_enrolment_after_offering_resolved` can still serve them;
   - is **idempotent** and returns a small summary (e.g. `{claimed: n}`) so the client can log it;
   - never raises — wrap in `EXCEPTION WHEN query_canceled THEN … WHEN OTHERS THEN …` (plain `WHEN OTHERS` misses 57014).
3. **Fix `grant_enrolment_after_offering_resolved`** — it still fires on mapping resolution and is NOT on the signup path, so it stays, but it must be corrected: match the server-written auth phone via `au.phone IN (right(NEW.phone,10), '91'||right(NEW.phone,10), NEW.phone)` guarded by `IF NEW.phone ~ '^\+91[0-9]{10}$'` (so the 485 `foreign:` placeholders mint no key and add zero collision space — do **NOT** use bare last-10 keying, it can collide with a real subscriber), add `u.deleted_at IS NULL`, and replace the bare `LIMIT 1` with `ORDER BY u.created_at ASC, u.id ASC LIMIT 1`.
4. Additive, reversible (undo in a trailing comment), **no `RAISE EXCEPTION`** — it must never abort a `db push`.
**Acceptance:** signup cannot fail from any claim; `claim_my_purchases()` is idempotent, claims nothing for an unconfirmed or soft-deleted caller, and claims the right rows for a confirmed one; the granter matches on the corrected dialect; migration compiles under `check_function_bodies = on`.

## Task SC-2 — Call it after sign-in `🔴 auth path`
**Files:** `src/contexts/AuthContext.tsx`
**Spec:** After a successful sign-in, call `claim_my_purchases()`. **Non-blocking** — a failure must never prevent login; log and continue. **Idempotent**, so it is safe to run on every sign-in (that repeatability is the point: a student who signed up before their purchase was synced gets claimed on their next visit). Gate on the actual sign-in event — `onAuthStateChange` also fires `INITIAL_SESSION` and `TOKEN_REFRESHED`, and firing on every hourly refresh for 60k+ users would be a needless write storm. Do not otherwise alter auth behaviour; the MSG91 phone-OTP path stays byte-identical.

## Task SC-3 — "You already have an account" at signup `🟡`
**Files:** `src/pages/Signup.tsx`, `supabase/functions/check-user-exists/index.ts`
**Spec:** Before creating anything, check whether the entered phone/email already corresponds to an account **or an existing purchase**. If so, stop and route to sign-in with a clear, warm message — *"You already have an account with us. Sign in instead."* — never a dead end.
- Enforce **server-side** in `check-user-exists` (it is already hardened and currently unused); the screen alone is not a gate, since the API can be called directly.
- Keep it **rate-limited** and return a **boolean only** — never echo which offering, name, or email matched. This endpoint is anon-reachable, so it must not become an account-enumeration oracle beyond the yes/no the UX genuinely needs.
- Cover **both** signup paths: the MSG91 widget path and the `signInWithOtp` email path.
**Acceptance:** a phone/email with an existing purchase cannot start a signup and is offered sign-in; a genuinely new person signs up exactly as today; the endpoint leaks nothing beyond yes/no.

---
## Phase acceptance
- `npx vitest run` green · `npm run build` green · lint no NEW errors.
- **A claim can only ever happen after a verified sign-in.** Grep proves no claim path runs on signup.
- Nothing widens access for a non-entitled user; the payment pipeline and the `ApplicationStatus.tsx` `isIOS()` guard are untouched.
- Migration applied only after the council is green (Rahul pre-authorised the apply on that condition).

## Deliberately out of scope (documented, not silently shipped)
- **485 rows / 384 people** hold `foreign:<digits>:<handle>` placeholder phones and are reachable by no phone key at all. They need a one-off admin backfill — file it, don't guess.
- **Guest-checkout buyers**: all three payment paths (`razorpay-webhook:112-119`, `verify-razorpay-payment:412-419`, `guest-create-order:248-255`) create the user with no phone and set it in a later `users.update`, so `auth.users.phone` may be NULL. Under a confirmed-phone gate they claim nothing until they sign in with MSG91 — which, under this design, is exactly when they should. Verify this holds; do not paper over it.
