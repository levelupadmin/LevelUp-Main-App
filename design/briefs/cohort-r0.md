# PHASE R0 — The Room Backbone
*Slice 3, the heaviest phase in the program · branch `design/cohort-r0` · worktree `/Users/rahulsrinivas/Claude/LevelUp-r0`.*
*Sources: `design/cohorts/ROOMS-BACKLOG.md` PHASE R0; the **Round-F correction delta** in `design/cohorts/EXECUTION-BACKLOG-V3.md` §PHASE ROOM; `design/cohorts/docs/05-ACCESS-SECURITY.md` (the MEMBER-1 authority); `migrations-draft/0001–0004`.*

## What this phase is
Config + membership + content schema + RLS + the SECURITY DEFINER write RPCs + the adversarial access suite, applied to prod, **with ZERO client-visible change**. No UI ships in R0. This is the highest-blast-radius change in the entire program: RLS on the enrolment path. A mistake here leaks one cohort's private content to another cohort's students.

## 🔴 THE SEVEN ROUND-F CORRECTIONS — the drafts predate these rulings
`migrations-draft/0001–0004` were written before Round-F. Apply every correction below; the drafts are a starting point, not the spec.

| Δ | Correction |
|---|---|
| **Δ1** | Land the community `channel_key` + `cohort_week_id` columns on `cohort_room_posts` **dark in R0** (CHANNEL-KEY-1), NOT deferred to R3 — the taxonomy must exist before any feed UI reads it. |
| **Δ2** | **Three access tiers, not two.** `accepted` = **NO membership row, NO read into ANY room-content table, NO preview RPC** — offering-chrome veil only. `confirmation_paid` = a scoped **`pre_member`** row: masthead, this-week overview, cohort-mate presence, announcements read-only, schedule — but **NOT** curriculum detail, recordings, assignments, feedback, and **no community write**. `enrolled` = full `member`. |
| **Δ3** | Ship the write RPCs (`cohort_room_post_write`, `cohort_room_reply_write`) with the channel write-path gate. **There is NO `get_cohort_room_preview` RPC — MEMBER-1 DELETED it.** The suite must assert there is *no such RPC to call*. |
| **Δ6** | Single **Completion** certificate (STANDING-1) — no Distinction/Merit tiers anywhere in schema or copy. The ₹400 is a **non-refundable review fee**, never tuition credit (FEE-1). |
| **Δ7** | ✅ **ALREADY CLOSED** — `live_sessions.week_id` is `uuid` with `live_sessions_week_id_fkey → cohort_weeks(id) ON DELETE SET NULL`, verified on prod 2026-07-22. Do not re-fix it. |

## The inviolable rules
1. **ZERO client-visible change.** No UI, no route, no component. If the diff touches `src/` beyond generated types, it is wrong.
2. **Membership is SERVER-DERIVED, never client-claimed** (NFR-SEC-1). A raw client INSERT into `cohort_room_members` or `cohort_room_configs` must be rejected.
3. **Security never depends on a feature flag** (NFR-CONFIG-2). RLS is membership-gated regardless of any flag or `modules` config value. Turning a flag on can never be a privilege escalation.
4. **An AFTER-trigger failure must never block an enrolment write.** Enrolment is the money path; the room is downstream of it.
5. **No `RAISE EXCEPTION`** in a migration that could abort a shared `db push`.
6. **The payment pipeline and `ApplicationStatus.tsx:319,337` guard are untouched.**

---

## Task R-1 — Config + membership migration (`tier: 1`)
**Files:** `supabase/migrations/20260729100000_cohort_rooms_backbone.sql` *(new)*
**Spec:** Merge drafts `0001` + `0002` into ONE migration (0001's `room_configs_member_read` references 0002's helper — a single file removes the ordering foot-gun). Roles: **`pre_member` | `member` | `mentor`** (Δ2). Resolver derives membership from existing `cohort_batch_members`; enrolment status → `revoked` revokes; alumni phase flip renames roles; a manual mentor grant survives both resolver and reconcile; duplicate batch membership upserts cleanly. pg_cron reconcile at **03:45 IST** (offset from the community draft's 03:30 to avoid stacking). Additive/idempotent/reversible.
**Acceptance:** applies cleanly on a SHADOW project; enrolment INSERT p95 regression **<5ms**; a forced AFTER-trigger failure still commits the enrolment; resolver cost <50ms/user at prod scale; reversal is a single DROP script.

## Task R-2 — Content tables + RLS + channel columns (`tier: 1`)
**Files:** `supabase/migrations/20260729100100_cohort_room_content.sql` *(new)*
**Spec:** Draft `0003` finalised: announcements, resources, posts + replies, recording-progress, demo entries, `cohort_room_seen`. **Every SELECT routes through `cohort_room_can_access()`** — grep the migration: zero content policies may reference membership tables directly. **Δ1:** add `channel_key` + `cohort_week_id` to `cohort_room_posts` NOW. **Δ2:** the `pre_member` whitelist is enforced in RLS, not in the client — a `pre_member` gets masthead/this-week/presence/announcements-read/schedule and is DENIED on curriculum detail, recordings, assignments, feedback, and any community write. Counter trigger: reply insert → count 1; soft-delete → 0.
**Edge cases:** announcement with `batch_id NULL` visible to all batches of the offering (test with a 2-batch fixture); a post author whose membership is later revoked — rows persist, author can no longer read (matches enrolment-revocation semantics).
**Acceptance:** shadow apply green; a table×verb policy matrix documented in the PR; no content policy references a membership table directly.

## Task R-3 — Read + write RPCs (`tier: 1` — SECURITY DEFINER)
**Files:** `supabase/migrations/20260729100200_cohort_room_rpcs.sql` *(new)*
**Spec:** Draft `0004` finalised. Reads: `get_my_cohort_rooms()`, `get_cohort_room(p_offering)`, `get_room_roster(p_offering)` — **access asserted FIRST in each; raise, never return an empty set**, for a non-member. Keep the **T-60 zoom-link gate server-side**: the RPC nulls `zoom_link` before T-60 so the client cannot render what it never received. **Writes (Δ3):** `cohort_room_post_write` / `cohort_room_reply_write` validate `channel_key` against the allowed taxonomy and **reject a client-set `is_mentor_answer`**. **NO `get_cohort_room_preview` — it is deleted (Δ3).** `get_cohort_progress` hardening: DROP + recreate without the live_session columns to kill the >1-session-per-week row duplication; **hold the prior definition VERBATIM in the runbook** as the reversal.
**Edge cases:** member with no batch yet (`pre_start`) → envelope returns config + empty sessions, no raise; alumni member → full envelope; two batches of one offering → envelope scopes to the member's batch.
**Acceptance:** p95 <150ms per RPC on 200-member/12-week shadow fixtures; EXPLAIN plans in the PR; roster exposes **no phone/email** (assert the exact column list).

## Task R-4 — The adversarial access suite (`tier: 1` — THE PROOF)
**Files:** `qa-harness/cohort-room-access.spec.mjs` *(new)*, `qa-harness/cohort-room-fixtures.sql` *(new)*
**Spec:** Fixtures: offerings A and B, each with a batch + config; users `admin`, `member_A`, `member_B`, `mentor_A` (manual grant), **`accepted_A`**, **`pre_member_A1`**, `outsider`, `anon`. Plant sentinel `LEAK_CANARY_A1` / `LEAK_CANARY_A2` in every room-A content body.
Required cases: **W8** channel-forgery rejected · **W9** client-set `is_mentor_answer` rejected · **R10** `accepted_A` reads EVERY room-content surface → **0 rows/denied, and there is NO `get_cohort_room_preview` to call** · **R11** `pre_member` reads only the whitelisted subset and is denied on recordings/curriculum/assignments/feedback/mentor-materials · **W6b** `pre_member` community write rejected · **R8/R9/C3** cross-batch isolation · **L1/L2** lifecycle: revoke enrolment → 0 rows, re-grant → visible · zoom-link timing (T+3h null, T−30m present) · canary grep over the full response corpus → 0.
**Acceptance:** ONE command, exit 0; canary grep part of the run; wired into `design-qa-gate` as the `room-access-leak` lens so it re-runs on R1–R4.

## Task R-5 — Types + client foundation (`tier: 2`)
**Files:** `src/lib/room.ts` *(new — pure)*, `src/lib/__tests__/room.test.ts` *(new)*
**Spec:** **Pure helpers only — no UI, no routes, no components.** `RoomTheme`/`RoomModules` types; `resolveTheme(config)` with defaults and a **contrast-safe floor** (if accent-on-canvas <4.5:1, lift lightness to the `--accent-violet-deep` floor — never trust the config row); `sessionTimeState(session)` → `scheduled|tonight|soon|live|ended|recorded`, IST-aware; `moduleEnabled(config,key)`.
**Acceptance:** `sessionTimeState` unit-tested including boundary minutes; contrast floor unit-tested; **zero UI change shipped** (grep the diff for `.tsx` — there should be none).

---
## Phase acceptance
- `npm run build` · `npx vitest run` · `npm run typecheck:functions` green; lint no NEW errors.
- **Zero client-visible change** — no `.tsx` in the diff.
- Migrations are additive/idempotent/reversible with a single DROP reversal; none contains `RAISE EXCEPTION`.
- Do NOT apply to prod. The orchestrator runs the council, proves the suite green on a SHADOW project, takes a prod backup, and only then applies.
