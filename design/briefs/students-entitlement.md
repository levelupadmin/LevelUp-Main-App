# PHASE ST — Students already in the system: see what you bought
*Rahul, 2026-07-27: "any of those 60,000+ students, if they go ahead and use their phone number or email that they have given on TagMango during an order, they should be able to see their offering very clearly." Prior work exists; this phase solidifies it and makes it bug-free.*

## TERMINOLOGY (Rahul's instruction)
Never say **"legacy students"** in user-facing copy, comments, or UI. They are **students already in the system**. The DB tables are named `legacy_enrolments` / `legacy_program_mapping` — those names stay (renaming them is a separate, riskier migration), but nothing a student reads may use the word.

## THE RULING THAT DEFINES THIS PHASE (Rahul, verbatim)
> "Archived should mean that people who bought it can only see it, and the others who are new and have not bought it cannot see it on the home or browse."

So `offerings.status = 'archived'` means exactly two things, and they must stop being conflated:
- **NOT discoverable** — excluded from home, browse, catalog, recommendations, search, and any purchase path. A new visitor must never encounter it.
- **FULLY visible to an entitled owner** — a student who bought it sees it in their library, can open it, and gets its resources, exactly as if it were active.

## VERIFIED DIAGNOSIS (all checked against prod `ivkvluezuiojovpotlyb`, 2026-07-27)
| # | Defect | Evidence |
|---|---|---|
| **A** | `claim_legacy_enrolments_for_user` is **never called** — not from the client, not from any edge function | `grep -rn` across `src/` + `supabase/functions/` returns nothing |
| **B** | Nothing student-facing reads `legacy_enrolments`; only admin pages do. `MyCoursesPage` reads only `enrolments` (**63 rows**), so **73,926** rows are invisible | `MyCoursesPage.tsx:74-80` |
| **C** | **1,067 mappings covering 67,129 students point at ARCHIVED offerings**, and every student surface filters `status='active'` | `useEnrolledProgress.ts:84`, `useEnrolmentCounts.ts:34`, `MyCoursesPage.tsx:78,244`, `CourseDetail.tsx:187,237,246`, `MySessionsPage.tsx:50` |
| **D** | `legacy_enrolments` loaded once **2026-05-24**; **1,810 orders / 1,276 students** since are absent | all 73,926 rows share one `created_at` |
| **E** | 16 recently-sold products unmapped | see rulings |

**C is the dominant defect: ~92% of mapped students are entitled to archived offerings and therefore see nothing.**

## RULINGS (do not re-litigate)
- **Film Direction 101 Workshop #Batch 407/408/409 → the EXISTING archived offering "The Film Direction 101 Workshop"** (batches 10–39 already map there). Do not create a new offering.
- **"The Ultimate Learning Subscription -AG/-KS/-LK/-ND/-RB/-VR" stay `pending`.** Do NOT guess whether they grant one masterclass or all. Leave unmapped, surface them in the report.
- **Forge products are SKIPPED entirely** — Forge is a separate app with its own Supabase. Exclude every Forge title from the sync; report the count.
- Screenwriting batches 415/416/417 → **Screenwriting & Storytelling** (older batches already map there).
- Creators Academy - 1 → **Creator Academy**. Video Editing Academy - 6 / -N → **Video Editing Academy**.

---

## Task ST-1 — One entitlement resolver, used everywhere (`tier: 1`)
**Files:** `src/hooks/useMyEntitlements.ts` *(new)*, `src/lib/entitlements.ts` *(new, pure + unit-tested)*, `src/lib/__tests__/entitlements.test.ts` *(new)*
**Spec:** A single source of truth for "what is this student entitled to", so the archived rule cannot drift between five call sites.
1. `useMyEntitlements(userId)` returns the union of: rows in `enrolments` (status active) **and** rows in `legacy_enrolments` claimed by this user, resolved through `legacy_program_mapping` to `offering_id`. De-duplicate by `offering_id`.
2. Pure helper `resolveVisibleOfferings({ entitledOfferingIds, offerings, surface })` in `entitlements.ts` implementing the ruling:
   - `surface: 'library'` → include an offering if the student is entitled, **regardless of status** (active OR archived).
   - `surface: 'catalog'` → include only `status='active'`, **minus nothing** — archived never appears, even for owners (they reach it from their library, not the shop).
   - An offering that is neither entitled nor active is never returned by either surface.
3. Unit-test the matrix exhaustively: {entitled, not-entitled} × {active, archived, draft} × {library, catalog}.
**Acceptance:** the pure matrix is fully covered by tests; no call site re-implements the rule.

## Task ST-2 — Apply the rule to every student surface (`tier: 1`)
**Files:** `src/pages/MyCoursesPage.tsx`, `src/pages/CourseDetail.tsx`, `src/pages/MySessionsPage.tsx`, `src/hooks/useEnrolledProgress.ts`, `src/hooks/useEnrolmentCounts.ts`
**Spec:** Replace the bare `.eq("status","active")` in each student-facing read with the ST-1 resolver.
- **Library surfaces** (`MyCoursesPage` enrolled section, `useEnrolledProgress`, `useEnrolmentCounts`, `MySessionsPage`) must include archived offerings the student is entitled to.
- **Catalog/recommendation surfaces** (`MyCoursesPage`'s recommendations block at ~:244, and anything feeding home/browse) keep excluding archived — a non-owner must never see it.
- `CourseDetail` (~:187/:237/:246): an **entitled** student may open an archived offering and see its content/resources; a **non-entitled** visitor gets the existing not-available path, NOT a 500 and not a silent empty page.
- Do NOT widen anything for non-entitled users. Entitlement is the gate; status is not.
**Acceptance:** an entitled student sees an archived offering in their library and can open it; a non-entitled visitor cannot see or open it anywhere; home/browse show zero archived offerings for anyone; existing active-offering behaviour is byte-identical.

## Task ST-3 — Claim on login, so entitlement actually happens (`tier: 1` — auth path)
**Files:** `src/contexts/AuthContext.tsx`, `supabase/functions/claim-student-enrolments/index.ts` *(new, if a server-side call is the safer shape)*
**Spec:** `claim_legacy_enrolments_for_user` exists and is called by nobody. Wire it so that when a student signs in (phone OTP **or** email OTP), their rows in `legacy_enrolments` matching their phone **or** email are claimed to their `user_id`.
- Match on **phone (primary) and email (fallback)**, using the existing `_shared/phone.ts` normalisation — the same last-10 rule `find_login_identity` uses, so a `+91`/bare/`0`-prefixed number all resolve.
- **Idempotent**: claiming twice must not duplicate or thrash `claimed_at`.
- **Non-blocking**: if the claim fails, sign-in must still succeed — a student must never be locked out because the claim errored. Log and continue.
- Must run for a student who signed up BEFORE their purchase was synced (so re-run on each sign-in, cheaply, not just at account creation).
**Acceptance:** a fixture student whose `legacy_enrolments` rows match by phone-only, by email-only, and by both, ends up with all of them claimed after one sign-in; a second sign-in changes nothing; a forced RPC failure still yields a successful login.

## Task ST-4 — Sync the missing two months + close the mappable gaps (`tier: 1` — prod data)
**Files:** `scripts/sync-student-enrolments.mjs` *(new)*, `design/students/SYNC-REPORT.md` *(new)*
**Spec:** A re-runnable, idempotent Node script (repo style: stdlib + fetch, no new deps) that reads the committed export at `LevelUp Core/TagMango LevelUp Data/orders.csv` and upserts into `legacy_enrolments`.
1. **Idempotent on `legacy_order_id`** (the TagMango order `_id`). Re-running must insert nothing new.
2. Only ingest orders whose status is completed and `isRefunded` is false.
3. Resolve `offering_id` via `legacy_program_mapping` on `legacy_program_name`. Unmapped → still insert the row with `offering_id` NULL (so the purchase is recorded and claimable later) and count it in the report — never drop a student's purchase silently.
4. **Skip every Forge product** (title matches `forge`); count them separately.
5. Add the resolvable mappings named in the rulings above (Film Direction 407/408/409, Screenwriting 415/416/417, Creators Academy - 1, Video Editing Academy - 6 and -N). Leave the six `Ultimate Learning Subscription -XX` rows `pending`.
6. `--dry-run` prints the plan and writes nothing. Default is dry-run; require an explicit `--apply`.
7. Write `SYNC-REPORT.md`: rows inserted, skipped-Forge, unmapped-but-recorded, still-pending mappings, and the resulting per-offering student counts.
**Acceptance:** dry-run reports ~1,810 candidate orders / ~1,276 students; `--apply` is idempotent on a second run (0 new); no Forge row inserted; no purchase silently dropped.

---
## Phase acceptance
- `npx vitest run` green · `npm run build` green · `npm run typecheck:functions` exits 0 · lint no NEW errors.
- **Security invariant: nothing here may widen access for a NON-entitled user.** Entitlement gates content; `status` gates discovery. A logged-out or non-entitled visitor must see exactly what they see today.
- No user-facing string contains "legacy".
- The payment pipeline and `ApplicationStatus.tsx` `isIOS()` guard remain untouched.
