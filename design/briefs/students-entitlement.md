# PHASE ST — Students already in the system: see what you bought
*Rahul, 2026-07-27: any of the 60,000+ students who log in with the phone/email they used on TagMango must see their offering clearly. Prior work exists; this phase solidifies it.*

> **v2 — this brief was REWRITTEN after the plan-check disproved three claims in v1.** The corrections are recorded below because two of them are the difference between fixing this and causing an incident.

## TERMINOLOGY
Never "legacy students" in student-facing copy or UI — they are **students already in the system**. The DB tables keep their `legacy_*` names (renaming is a separate, riskier migration). Admin-only strings ("Legacy mappings" nav, `/admin/legacy-mappings`) are OUT of scope for this phase.

## RAHUL'S RULING (the spec)
> "Archived should mean that people who bought it can only see it, and the others who are new and have not bought it cannot see it on the home or browse."

- **NOT discoverable** — no home, browse, catalog, recommendations, search, or **purchase path**, for anyone, owners included.
- **Fully visible to an entitled owner** in their own library: open it, get its resources.

## WHAT v1 GOT WRONG (do not repeat)
1. **v1 blamed client-side `.eq("status","active")` filters. The real blocker is RLS.**
   `CREATE POLICY offerings_read_active ON offerings FOR SELECT USING (status = 'active' OR is_admin())` (`20260405063223_…sql:100`, never relaxed). A non-admin **cannot SELECT an archived offering at all** — the rows never leave Postgres, so no client change can work. Likewise `legacy_enrolments` and `legacy_program_mapping` are **admin-only SELECT** (`20260524130000:77`, `20260524180000:108`), so a student-side entitlement query returns empty for everyone.
2. **v1 told the crew to strip eight `status='active'` filters. SIX OF THEM ARE `enrolments.status`, NOT `offerings.status`** — `MyCoursesPage:78`, `useEnrolledProgress:84`, `useEnrolmentCounts:34`, `MySessionsPage:50`, `CourseDetail:187`, `CourseDetail:246`. `enrolments` carries `revoked_at / revoked_by / revoked_reason / expires_at`, and **`CourseDetail:187` IS the entitlement check**. Stripping those would have handed course access to every revoked and refunded student. **Only `CourseDetail:237` and `MyCoursesPage:244` are `offerings.status`.**
3. **`claim_legacy_enrolments_for_user` is NOT an RPC.** It is `RETURNS trigger`, zero-arg, fired by `CREATE TRIGGER users_claim_legacy_enrolments AFTER INSERT OR UPDATE OF phone, email ON public.users` (`20260524130000:153`). PostgREST does not expose trigger functions and it is absent from `types.ts`, so `supabase.rpc(...)` would not even typecheck. It already fires on signup — the low claim count reflects only 247 app users, not a broken trigger.

---

## Task ST-0 — The database change (owns ALL DB work) `🔴 Tier 1`
**Files:** `supabase/migrations/<ts>_student_entitlement_visibility.sql` *(new)*, `src/integrations/supabase/types.ts` *(regenerated)*
**Spec:**
1. **Relax `offerings` SELECT so an entitled owner can read their archived offering — and nobody else can.** Keep `status='active' OR is_admin()`, and ADD: the caller is entitled, i.e. an `enrolments` row for `auth.uid()` that is active and not revoked/expired, OR a `legacy_enrolments` row with `claimed_by_user_id = auth.uid()` whose `offering_id` matches. Non-entitled users must see exactly what they see today.
2. **Add a narrow student SELECT policy on `legacy_enrolments`: `claimed_by_user_id = auth.uid()`.** Nothing else. A student may read only their own claimed rows. `legacy_program_mapping` stays admin-only — **do not join it client-side**; `offering_id` is already denormalised onto `legacy_enrolments`.
3. **Add a real callable RPC `claim_my_student_enrolments()`** (SECURITY DEFINER, zero-arg, uses `auth.uid()`): claims `legacy_enrolments` rows matching the caller's phone (last-10 normalised, primary) or verified email (fallback) to their `user_id`. **Idempotent.** It must NOT silently revert the two deliberate decisions in the existing trigger: the `TG_OP='INSERT'`-only guard on email claims (an unverified-email guard) and the `app.suppress_legacy_claim` GUC. Mirror that intent — only claim by email when the caller's email is verified.
4. Migration must be additive, reversible (include the DROP/undo in a comment block), and contain **no `RAISE EXCEPTION`**.
**Acceptance:** an adversarial suite proves — an entitled student reads their archived offering; a NON-entitled authenticated user gets **0 rows** for that same offering; an anonymous user gets 0; a student reads only their own `legacy_enrolments` rows and no one else's; `legacy_program_mapping` remains unreadable to non-admins; the RPC is idempotent and claims nothing it shouldn't.
**Gate:** Tier-1 — `bugfix-council` + the adversarial suite green on a **shadow project** before `db push` to `ivkvluezuiojovpotlyb`. Rahul has pre-authorised applying once both are green.

## Task ST-1 — One entitlement resolver `🟡`
**Files:** `src/lib/entitlements.ts` *(new)*, `src/hooks/useMyEntitlements.ts` *(new)*, `src/lib/__tests__/entitlements.test.ts` *(new)*
**Spec:** Sequential after ST-0 (needs its policies + types). Pure `resolveVisibleOfferings({ entitledOfferingIds, offerings, surface })` with `surface: 'library' | 'catalog'` — library includes entitled offerings regardless of status; catalog includes only `active`, archived never appears even for owners. `useMyEntitlements(userId)` returns the union of active non-revoked `enrolments` and the caller's own claimed `legacy_enrolments` rows, **reading `offering_id` straight off `legacy_enrolments`** (no `legacy_program_mapping` join — it stays admin-only). A NULL `offering_id` (unmapped purchase) is excluded from entitlements without erroring. Do NOT persist this payload in `queryClient` — it decides access. Exhaustive tests over {entitled, not-entitled} × {active, archived, draft} × {library, catalog}.

## Task ST-2 — Apply the rule, and CLOSE THE PURCHASE HOLES `🔴`
**Files:** `src/pages/MyCoursesPage.tsx`, `src/pages/CourseDetail.tsx`, `src/pages/ProfilePage.tsx`, `src/components/**/QuickPick.tsx`, `src/pages/CheckoutPage.tsx`, `src/lib/queryClient.ts`
**Spec:** Sequential after ST-1.
- **ONLY touch `offerings.status` filters**: `CourseDetail:237`, `MyCoursesPage:244`, `ProfilePage:752`.
- **DO NOT TOUCH any `enrolments.status` filter** — `MyCoursesPage:78`, `useEnrolledProgress:84`, `useEnrolmentCounts:34`, `MySessionsPage:50`, `CourseDetail:187`, `CourseDetail:246` are revocation/expiry checks and `CourseDetail:187` is the entitlement check itself. Touching them grants access to revoked and refunded students. Those five files are NOT in this task's file list for that reason.
- **NEW REGRESSION SURFACE created by ST-0 — close it.** Relaxing offerings RLS makes an owner's archived offering readable on *every* surface. Three purchase/discovery sites have **no status filter today** and would begin offering a closed product for sale: `QuickPick.tsx:102`, `CheckoutPage.tsx:338`, `CheckoutPage.tsx:426`. Add an explicit `status='active'` guard to each. This is the sharpest way this phase could violate Rahul's own ruling.
- `ChapterViewer.tsx:406/426` and `PublicOffering.tsx:1219` already use `.in("status",["active","archived"])` — verify they remain correct under the new policy; change only if wrong.
**Acceptance:** an entitled student sees and opens their archived offering; a non-entitled visitor sees it nowhere and cannot reach checkout for it; home/browse/QuickPick/Checkout show zero archived offerings to anyone; active-offering behaviour byte-identical; no revocation filter altered (diff-verify those five files are untouched).

## Task ST-3 — Claim on every sign-in `🔴 auth path`
**Files:** `src/contexts/AuthContext.tsx`
**Spec:** Sequential after ST-0 (calls its new RPC). The existing trigger only fires on `users` INSERT/UPDATE of phone/email, and email claims only on INSERT — so a student who signed up **before** their purchase was synced is never claimed. Call `claim_my_student_enrolments()` after a successful sign-in. **Idempotent**, **non-blocking** (a failed claim must never prevent login — log and continue), and cheap enough to run every sign-in. The MSG91 phone-OTP path stays byte-identical.

## Task ST-4 — Sync the missing two months `🔴 prod data`
**Files:** `scripts/sync-student-enrolments.mjs` *(new)*, `design/students/SYNC-REPORT.md` *(new)*
**Spec:** Independent of ST-0/1/2/3 — may run in parallel from the start. Re-runnable idempotent Node script (stdlib + fetch, no new deps, in the style of `scripts/backfill-thumbnails.mjs`) reading `LevelUp Core/TagMango LevelUp Data/orders.csv` and upserting `legacy_enrolments` on prod (`ivkvluezuiojovpotlyb`; `SUPABASE_PAT` from the vault, secrets by name, never echoed).
1. Idempotent on `legacy_order_id` — a second run inserts 0.
2. Completed, non-refunded orders only.
3. Unmapped product → still insert with `offering_id` NULL so the purchase is recorded and claimable later; count it. **Never silently drop a purchase.**
4. **Skip every Forge title** (`/forge/i`) — separate app. Count separately.
5. Add mappings: Film Direction 101 `#Batch 407/408/409` → the **existing ARCHIVED** offering "The Film Direction 101 Workshop"; Screenwriting `#Batch 415/416/417` → "Screenwriting & Storytelling"; "The LevelUp Creators Academy - 1" → "Creator Academy"; "The LevelUp Video Editing Academy - 6" and "-N" → "Video Editing Academy". **Leave the six "Ultimate Learning Subscription -XX" rows `pending`** — Rahul ruled do-not-guess.
6. **Default dry-run**; require `--apply`.
7. ⚠️ `--apply` fires `grant_enrolment_after_offering_resolved`, retro-granting real enrolments to already-claimed students. Say so in the report.
**Acceptance:** dry-run reports ~1,810 candidate orders / ~1,276 students; `--apply` idempotent on re-run; zero Forge rows; no purchase dropped.

---
## Phase acceptance
- `npx vitest run` green · `npm run build` green · lint no NEW errors. *(There is no `typecheck:functions` script on this branch — it lives on the unmerged TP branch. Do not add it here.)*
- **Security invariant: nothing may widen access for a NON-entitled user.** Entitlement gates content; status gates discovery; revocation filters are untouchable.
- No student-facing string contains "legacy".
- The payment pipeline and the `ApplicationStatus.tsx` `isIOS()` guard remain untouched.
