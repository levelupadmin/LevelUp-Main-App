# Cohort Rooms — Execution Backlog (phases R0–R4)
### Hand-off-to-Opus plan. Every task execution-ready: zero design thinking required from the builder.
*Companions: `COHORT-LOGIC.md` (the as-is), `ROOMS-ARCHITECTURE.md` (the design), `migrations-draft/` (DRAFT SQL). Format follows `design/vision/EXECUTION-BACKLOG.md`. Written 2026-07-08 on `design/phase-6`; re-validate file/line refs before building each phase.*

## How to use this document
- Each phase becomes one `design/briefs/rooms-N.md` and runs ORCHESTRATION.md's loop: `design-phase-build` → `design-qa-gate` → sprints → council (Tier 1) → internal release → Rahul device pass → promote.
- **Tiers** per CLAUDE.md. All of R0 is 🔴 Tier 1 (migrations + RLS + triggers on `enrolments`): council must ARGUE it, the adversarial suite must pass on a shadow project, Rahul signs off in writing, prod backup before apply.
- **Global hard rules (every task):** transform/opacity-only motion from `src/lib/motion.ts`; NO new `backdrop-filter`; ≥44px touch targets; reduced-motion intact; hover effects fine-pointer-gated; audit 360×740 AND 375×812; never touch html/body overflow; **`ApplicationStatus.tsx:319,337` stays `isIOS()` — the staged-payment revenue guard; NOTHING in this program touches the application/payment pipeline**; feeds paginate and END; room accent is the only per-room variable — champagne stays the system voice.
- **File ownership is exclusive per task within a phase.** `src/pages/CohortDashboard.tsx` is frozen for everyone except R2-T1 (which supersedes it) — design-vision P5-T7/P6-T2 edits that already landed are the base.
- Standing **RAHUL DECISIONS** (R-D1…R-D9) live in ROOMS-ARCHITECTURE §8; tasks reference them.

---

# PHASE R0 — The backbone (config, membership, content schema, RLS) — 🔴 all Tier 1, one council
**Goal:** the four draft migrations land in prod, provably leak-proof, zero client-visible change.
**Gate:** adversarial suite green on a shadow project; council; apply per CLAUDE.md (link `ivkvluezuiojovpotlyb`, `migration list` diff, backup first).
**Sequencing:** R0-T1 → R0-T2 → R0-T3 → R0-T4 (suite) → council → R0-T5 (apply + backfill) → R0-T6 (types/hooks).

### R0-T1 — Finalize config + membership migrations (`tier: 1`)
**Files:** `design/cohorts/migrations-draft/0001_cohort_room_configs.sql`, `0002_cohort_room_members.sql` → `supabase/migrations/<ts>_cohort_rooms_backbone.sql`
1. Merge 0001+0002 into one migration (0001's `room_configs_member_read` references 0002's helper — single file removes the ordering foot-gun). Council decides trigger-vs-composite-FK for the batch guard (draft notes both).
2. Resolver correctness tests (SQL): batch-member insert → membership row; enrolment status→'revoked' → membership revoked; alumni phase flip → roles rename; manual mentor grant survives resolver + reconcile; duplicate batch membership upserts cleanly.
3. **Council must argue:** AFTER-trigger failure cannot block enrolment writes (force a failure, enrolment still commits); resolver cost <50ms per user at prod scale; reconcile duration measured on shadow.
4. pg_cron reconcile at 03:45 IST (offset from the community draft's 03:30 slot to avoid stacking, if that ever ships) mirroring `20260526220000_cohort_notify_cron.sql`.
**Edge cases:** enrolment deleted outright (CASCADE via batch_members path — reconcile confirms); user in 2 batches of one offering (2 rows, unique key holds); config row absent for an offering with batches (membership rows still derive; room UI falls back to defaults — verify resolver doesn't require config).
**Acceptance:** applies cleanly on shadow; all SQL tests green; enrolment INSERT p95 regression <5ms; council sign-off recorded in PR.

### R0-T2 — Content tables + policies (`tier: 1`)
**Files:** `design/cohorts/migrations-draft/0003_cohort_room_content.sql` → `supabase/migrations/<ts>_cohort_room_content.sql`
1. Finalize announcements/resources/posts+replies/recording-progress/demo-entries per draft. Every SELECT routes through `cohort_room_can_access()` (grep the migration: zero content policies referencing membership tables directly).
2. Counter trigger test: reply insert → count 1; soft-delete → 0.
3. `cohort_room_seen` (draft 0004) lands here (it's a table, not an RPC).
**Edge cases:** announcement with `batch_id NULL` visible to all batches of the offering (test with 2-batch fixture); post author whose membership is later revoked (rows persist, author can no longer read — accepted, matches enrolment-revocation semantics).
**Acceptance:** shadow apply green; policy matrix documented in PR (table × verb grid, community-draft style); council sign-off.

### R0-T3 — Read RPCs (`tier: 1` — SECURITY DEFINER paths)
**Files:** `design/cohorts/migrations-draft/0004_cohort_room_rpcs.sql` → `supabase/migrations/<ts>_cohort_room_rpcs.sql`
1. `get_my_cohort_rooms()`, `get_cohort_room(p_offering)`, `get_room_roster(p_offering)` — access asserted FIRST in each (raise, not empty-set, for non-members).
2. Keep the T-60 zoom-link gate server-side (the RPC nulls `zoom_link` before T-60 — the client can't render what it never received; today's client-side window check becomes cosmetic).
3. `get_cohort_progress` hardening: DROP + recreate without the live_session columns (sessions move to the room envelope), killing the >1-session-per-week row duplication. **Coordinate: `CohortDashboard.tsx` consumes those columns today — this migration ships in the SAME release train as R2-T1's room weeks module, or the RPC keeps a deprecated duplicate-prone view until R2 lands. Council picks; default = ship together.**
4. Roster column audit: confirm safe set against `public_user_profiles`; phone/email must not appear (adversarial test asserts exact column list).
**Edge cases:** member with no batch yet (pre_start, batch NULL) → envelope returns config + empty sessions, no raise; alumni member → full envelope (recordings retained per R-D7); two batches same offering → envelope scopes to the member's batch.
**Acceptance:** p95 <150ms per RPC on shadow with 200-member/12-week fixtures; EXPLAIN plans in PR; suite green; council sign-off.

### R0-T4 — Adversarial access suite (`tier: 1` — the proof)
**Files:** `qa-harness/cohort-room-access.spec.mjs` *(new)*, `qa-harness/cohort-room-fixtures.sql` *(new)*
Fixtures: offerings A and B each with a batch + config; users `admin`, `member_A`, `member_B`, `mentor_A` (manual grant), `outsider` (authenticated, zero rooms), `anon`. Content: announcements/resources/posts/demo entries in both rooms, sentinel string `LEAK_CANARY_A` planted in every room-A content body.
1. `outsider`/`member_B`/`anon`: every room-A table SELECT → 0 rows; `get_cohort_room(A)` → error; PostgREST direct `?offering_id=eq.A` → 0 rows; canary grep over the full response corpus → 0.
2. Write attacks: `member_B` INSERT announcement into A → reject; `member_A` INSERT announcement (not mentor) → reject; any client INSERT/UPDATE on `cohort_room_members` / `cohort_room_configs` → reject; `member_A` UPDATE `member_B`'s demo entry → reject.
3. Lifecycle: revoke `member_A`'s enrolment → re-run as them → 0 rows (trigger path); re-add → visible.
4. Zoom-link timing: session at T+3h → envelope `zoom_link` null for members; at T-30m → present.
**Acceptance:** one command, exit 0; wired into design-qa-gate as the `room-access-leak` lens, re-runs every later rooms phase; canary grep part of the run.

### R0-T5 — Apply + backfill + config seed (`tier: 1` — prod data)
**Files:** `docs/cohort-rooms-runbook.md` *(new)*, applied migrations from T1–T3
1. Apply on prod per CLAUDE.md; run `cohort_room_reconcile()` once to backfill members from existing batch rosters; record counts (members ≈ active `cohort_batch_members`).
2. Seed one config row per existing live cohort offering (Rahul provides accents/art; defaults: accent = `--accent-violet-deep` values, hero = the offering poster, `phase` per its real state).
3. Rollback plan: new tables only; single DROP script; no existing table altered except the `get_cohort_progress` recreate (revert = re-apply the prior definition — include it verbatim in the runbook).
**Acceptance:** verification counts recorded in PR; existing `/cohort/:offeringId` page still works untouched (RPC compat verified per R0-T3 coordination); Sentry clean 48h.

### R0-T6 — Types + client foundation (`tier: 2`)
**Files:** `src/integrations/supabase/types.ts` *(regenerated)*, `src/hooks/useCohortRooms.ts` *(new)*, `src/lib/room.ts` *(new — pure helpers)*
`useMyCohortRooms()` (react-query `["rooms","mine",uid]`, staleTime 5min — rides P6-T1's data layer), `useCohortRoom(offeringId)` (`["rooms",offeringId,uid]`, staleTime 60s), `useRoomRoster`, mutations for posts/replies/demo/seen/recording-progress. `lib/room.ts`: `RoomTheme`/`RoomModules` TS types + `resolveTheme(config)` (defaults, contrast-safe fallbacks) + `sessionTimeState(session)` (scheduled/tonight/soon/live/ended/recorded — unit-tested, IST-aware) + `moduleEnabled(config, key)` with the §5 defaults table.
**Acceptance:** build + suite green; `sessionTimeState` unit tests (fixture timestamps → states incl. boundary minutes); zero UI change shipped.

---

# PHASE R1 — Crossing the threshold (shell, theming, My Cohorts)
**Goal:** rooms exist as places: themed shell, room switcher, My Cohorts surface, deep links. Modules render as ordered placeholders wired in R2.
**Gate routes:** `/rooms`, `/room/:slug` (2 differently-themed fixtures), 360+375, member/multi-member/outsider fixtures.
**Sequencing:** R1-T1 → R1-T2 → (T3, T4, T5 parallel) → R1-T6.

### R1-T1 — Room routes + shell + redirect shim (`tier: 1` — routing, council)
**Files:** `src/App.tsx` *(routes)*, `src/pages/room/RoomShell.tsx`, `src/pages/room/RoomHome.tsx` *(skeleton)*, `src/pages/MyCohortsPage.tsx` *(skeleton)*
Routes: `/rooms` (My Cohorts), `/room/:slug` + nested `weeks/:n | screenings | feed | people | resources` under `RoomShell` (lazy chunk). `/cohort/:offeringId` → resolve slug → `<Navigate replace>` shim (old notification-email links keep working — templates link `/cohort/{{offering_id}}`; keep per R-D9). Deep link as non-member → branded "This room is private." state with a link to the offering page (never a spinner, never a tease).
**Edge cases:** slug not found → 404 state; member of offering with no config row → shell renders on defaults; flag: `VITE_COHORT_ROOMS` env + localStorage override — flag off keeps `/cohort/*` on the old page byte-identical.
**Acceptance:** flag off = zero behavioral diff (visual spot-check); flag on = navigable skeletons; chunk split verified; council notes the routing diff.

### R1-T2 — RoomThemeProvider + the token bridge (`tier: 1` — touches index.css, council)
**Files:** `src/components/room/RoomThemeProvider.tsx` *(new)*, `src/index.css` *(ONLY adding `--room-accent`/`--room-accent-text` defaults on `:root` — two lines, nothing else)*, `tailwind.config.ts` *(color aliases `room-accent`, `room-accent-text`)*
1. Provider renders `<div data-room-theme style={{--room-accent, --room-accent-text}}>` from `resolveTheme()`; children read `text-room-accent` etc. Defaults equal cream so unthemed renders are sane.
2. Contrast guard in `resolveTheme`: if computed accent-on-canvas <4.5:1, lift lightness to the precomputed floor (the `--accent-violet-deep` doctrine) — never trust the config row.
3. Reduced-motion + June-14 audit: provider adds NO overflow/transform/backdrop styles — variables only (grep the diff).
**Edge cases:** config theme missing keys (defaults); theme changes mid-session (react-query refetch → style object swap, no remount); nested providers impossible (one per shell).
**Acceptance:** two fixture rooms render distinct accents with identical layout; outside `/room/*` computed `--room-accent` = cream default; council sign-off (index.css line).

### R1-T3 — The title card: room masthead + entrance (`tier: 2`)
**Files:** `src/components/room/RoomMasthead.tsx`, `src/components/room/RoomEntrance.tsx` *(new)*
Direction R-A "Season One" masthead: hero art via `ArtworkImage` (landscape, scrim, branded monogram placeholder from `theme.monogram`), nameplate `wordmark_text` in mono tracking-widest at `--room-accent`, serif-italic tagline, phase/`WEEK {n} OF {m}` line, grain overlay when `theme.texture='grain'` (existing util, ≤4%). Entrance: ONE staged sequence on first mount per session (`sessionStorage lu_room_entered_{slug}`) — art fade + nameplate rise on `springs.glide`, ≤600ms total; reduced motion → instant.
**Edge cases:** no hero_url (monogram block, full layout preserved — no void, per DESIGN-STRATEGY finding #3); very long wordmark (clamp 2 lines, tracking preserved); pre_start phase (line reads "Starts {date}").
**Acceptance:** both fixture rooms read as distinct title cards at 375/360; entrance plays once per session; CLS <0.02; 60fps at 4× throttle; grep `backdrop-filter` delta 0.

### R1-T4 — My Cohorts + nav integration (`tier: 2`)
**Files:** `src/pages/MyCohortsPage.tsx`, `src/components/layout/StudentLayout.tsx` *(nav slot lines only)*, `src/hooks/useActiveCohort.ts` *(delete — supersede)*
1. `/rooms`: room cards (mini-masthead: accent bar, nameplate, phase, "Week 4 of 12", next-session countdown, unseen-announcements dot) from `useMyCohortRooms()`; live rooms first, alumni shelf below with `ALUMNI` wordmark; empty state (zero rooms) = serif "No cohort yet." + link to the live-cohorts catalog section.
2. Nav slot: 0 rooms → hidden; 1 room → the room's `wordmark_text` (not "My Cohort") linking `/room/:slug`; >1 → "My Cohorts" linking `/rooms`. Shows from `pre_start` (fixes the enrolled-but-invisible window — no more weeks>0 requirement).
3. Delete `useActiveCohort.ts`; grep consumers → StudentLayout only (verify).
**Edge cases:** membership resolves mid-session (query invalidation on window focus stays default); alumni-only user (shelf renders, nav shows room name).
**Acceptance:** two-room fixture shows both, correct order; one-room fixture nav shows the room name; enrolled-no-weeks fixture sees the room in `pre_start`; zero references to `useActiveCohort` remain.

### R1-T5 — Room switcher (`tier: 2`)
**Files:** `src/components/room/RoomSwitcher.tsx` *(new)*, `src/pages/room/RoomShell.tsx` *(mount — sequential lane with R1-T1, same builder)*
Nameplate becomes a menu when memberships >1: dropdown (desktop) / vaul sheet (mobile, P4-T1 pattern) listing rooms as accent-chipped rows; switching navigates `/room/:otherSlug` and writes `lu_last_room`. ≥44px rows, `tapTick()` on switch, `springs.snap` entrance, AnimatePresence exit.
**Edge cases:** single membership (nameplate is static text — no dead menu); switch to alumni room (full nav, wrap modules per phase).
**Acceptance:** switch round-trip preserves scroll on return (router state); Android back closes the sheet; all targets ≥44px.

### R1-T6 — Pre-start induction (`tier: 2`)
**Files:** `src/components/room/PreStartCard.tsx` *(new)*, `src/pages/room/RoomHome.tsx` *(slot — sequential lane with R1-T1's owner)*
`phase='pre_start'` room home: the title card + "Doors open {batch start date}" countdown (days granularity), the roster module (faces early — cohort-mates are the hook), first announcement slot, WhatsApp link card while R-D5 coexistence holds (`offerings.whatsapp_group_link`, external-link treatment), and "What to expect" (weeks count, session cadence from authored weeks if present).
**Edge cases:** no weeks authored yet (expectation block hides gracefully); start date passes while open (query refetch flips to live layout).
**Acceptance:** pre-start fixture renders no dead modules; countdown correct across IST boundaries; external link marked `rel="noopener"`.

---

# PHASE R2 — The season (weeks, sessions, recordings, assignments)
**Goal:** the four core modules at world-class: the weekly rhythm, doors-open moments, the Screening Shelf, the feedback loop. `/cohort` page retired.
**Gate routes:** `/room/:slug` live-phase fixture with 12 weeks/2 sessions-in-one-week/mixed submissions; recordings fixture; 360+375.
**Sequencing:** R2-T1 → R2-T2 → T3/T4 parallel → R2-T5 (retire).

### R2-T1 — Weeks module: This Week + episode rail (`tier: 2`)
**Files:** `src/components/room/WeeksModule.tsx`, `src/components/room/ThisWeekCard.tsx`, `src/components/room/WeekRail.tsx` *(new)*
Port the good bones of `CohortDashboard.tsx` (ThisWeekCard split, week list, progress strip, sticky footer ring) into the room register: week theme as serif episode title ("E04 · {theme}" mono eyebrow), progress strip in `--room-accent`, statuses on the P5-T7 token map from day one (zero raw green/amber/blue/orange). Today-first discipline (R-B absorbed): the This Week hero leads with the next timed thing (session countdown > assignment due > feedback session — `feedback_session_at` finally renders). Data: existing `get_cohort_progress` (post-R0-T3 shape) via `useCohortRoom` envelope + progress hook.
**Edge cases:** zero weeks (pre-start handles it; live-phase zero weeks → "The schedule is being set." serif state); week with no assignment (slot reads "No assignment this week" — existing copy); >12 weeks (rail scrolls horizontally, snap, no squeeze).
**Acceptance:** two-sessions-in-one-week fixture renders both (duplication bug dead); statuses tokenized (grep raw palette → 0); footer ring + next-due parity with the old page; 60fps.

### R2-T2 — Sessions module: doors-open choreography (`tier: 2`)
**Files:** `src/components/room/SessionSlot.tsx`, `src/components/room/DoorsOpenCountdown.tsx`, `src/lib/ics.ts` *(new — pure ICS string builder)*
`sessionTimeState` drives the slot: `scheduled` (date + "Add to calendar" → ICS download via `lib/ics.ts`, no deps, one VEVENT; ≥44px) → `tonight` (TimeStateBadge) → `soon` (T-60: live countdown mm:ss + Join button enabled — champagne, the screen's one champagne moment) → `live` (crimson LIVE treatment, ping `motion-safe`-gated, Join primary) → `ended` ("Recording lands within 24h" quiet line) → `recorded` (hands off to R2-T3's shelf row). One `setInterval` per room (context tick, 1s only inside T-60, else 60s).
**Edge cases:** zoom_link null at T-30 (server gate failed/absent → "Link drops here 1 hour before" — never a broken button); session cancelled (status renders struck, no countdown); reduced motion (no ping, static states).
**Acceptance:** clock-mocked tests walk a session through all 6 states; ICS opens in Google Calendar/ Apple Calendar with correct IST times; join tap fires `tapTick()`; countdown drift <1s over 10min.

### R2-T3 — The Screening Shelf: recordings that resume (`tier: 2`)
**Files:** `src/pages/room/RoomScreenings.tsx`, `src/components/room/RecordingRow.tsx` *(new)*
All `recording_url` sessions as a shelf: poster row (week eyebrow, session title serif, duration, watched-progress hairline in `--room-accent`), "Continue watching" rail on top when any `cohort_recording_progress` row is 5–95%. Playback: external URLs open per current MySessionsPage behavior; position writes on visibility-change/unmount (throttled 10s) when playback is in-app-embeddable (YouTube/Vimeo embed patterns; plain links skip resume — record `completed` on open instead).
**Edge cases:** zero recordings (serif empty "Recordings land here after each session."); recording added while open (60s staleTime refetch); alumni phase (shelf fully available — R-D7).
**Acceptance:** resume position survives app restart (fixture); the email promise ("recording on your cohort dashboard within 24 hours") is now true — the notify-cohort template link lands on a page that shows it; progress hairlines accurate ±5%.

### R2-T4 — Assignments + feedback loop in the room register (`tier: 2`)
**Files:** `src/components/room/AssignmentModule.tsx` *(new — wraps existing `AssignmentSubmissionForm`, `AssignmentFeedbackView`)*, `src/components/cohort/AssignmentSubmissionForm.tsx` *(token pass only)*, `src/components/cohort/PeerReviewBoard.tsx` *(token pass + batch-prop hardening only)*
Submission status travels as a 4-step mini-timeline (submitted → under review → reviewed/cleared, needs_revision branch) instead of a lone badge; feedback renders in place with mentor attribution; resubmission path preserved byte-for-byte; peer lane mounts `PeerReviewBoard` with an explicit `batchId` prop from the envelope (kills the `rows[0]?.cohort_batch_id` reach-in). Token pass per P5-T7 map on both cohort components (coordinate: if design-vision P5 already shipped it, this is a no-op — verify first).
**Edge cases:** submission while offline (existing error path + toast); `late` status renders amber not red; file-upload limits unchanged (2GB bucket rules).
**Acceptance:** submit→review→resubmit loop parity with old page (manual fixture walk); status timeline states match DB statuses 1:1; grep raw palette in `src/components/cohort/` → 0.

### R2-T5 — Retire `/cohort` (`tier: 1` — route truth swap, council)
**Files:** `src/App.tsx` *(flag default)*, `src/pages/CohortDashboard.tsx` *(becomes redirect shim)*, `src/lib/flags.ts`
Preconditions: R2-T1…T4 gate-passed; Rahul device pass (Android + iOS) inside a real cohort fixture; notification templates' `/cohort/{{offering_id}}` links verified through the shim. Flip `VITE_COHORT_ROOMS` default on; `CohortDashboard.tsx` logic removed, file kept as `<Navigate>` shim; staged rollout for the native train per CLAUDE.md.
**Acceptance:** old deep links land in the room; rollback rehearsal documented (flag off restores old page — which still compiles against the post-R0-T3 RPC, per that task's coordination); 48h Sentry clean.

---

# PHASE R3 — The people layer (announcements, roster, feed, resources)
**Goal:** the room stops being single-player. **Coordinate:** R3-T3's post primitives should share DNA with community-v2's post components — build after the commons direction pick, or accept a later unification pass (see ROOMS-ARCHITECTURE §9).
**Sequencing:** T1/T2 parallel → T3 → T4.

### R3-T1 — Announcements: the noticeboard (`tier: 2`)
**Files:** `src/components/room/AnnouncementsModule.tsx` *(new)*, `src/pages/admin/AdminAnnouncements.tsx` *(cohort-target section — verify current shape first; if it's course-scoped, add an offering/batch target picker)*, `supabase/migrations/<ts>_announcement_notify_trigger.sql` *(new — mirrors `20260611120000_comment_notification_trigger.sql`)*
Pinned-first list under the masthead (R-B's tacked-notice treatment: accent-left-border card, author + role wordmark, relative date); "seen" writes `cohort_room_seen` on view; server trigger fans out ONE in-app notification per member per announcement (batch semantics, volume-capped: max 1 unread per room via upsert). Mentors/hosts post via an in-room composer (RLS enforces; UI hides for members).
**Edge cases:** zero announcements ("Nothing on the board yet." serif); announcement to `batch_id NULL` across 2 batches (both notified once each).
**Acceptance:** SQL test — 1 announcement × N members = N notifications, repeat post ≠ duplicate unread per cap; member fixture sees no composer; unseen dot on `/rooms` clears after view.

### R3-T2 — Roster: people in the room (`tier: 2`)
**Files:** `src/pages/room/RoomPeople.tsx`, `src/components/room/MentorCard.tsx`, `src/components/room/RosterGrid.tsx` *(new)*
Mentor/host cards on top (avatar, name, serif one-liner, `MENTOR` wordmark); member grid (InitialsAvatar/avatar, name, city, occupation — exactly the RPC's safe columns); count line ("41 in this room" mono). No DMs, no follow, no profiles-drilldown v1 (privacy-first, matches community R7 reasoning).
**Edge cases:** 200+ members (windowed list or paginate at 60 — builder measures); missing city/occupation (line hides); alumni room (wordmark `ALUMNI` on all derived members).
**Acceptance:** adversarial re-run: outsider RPC → error (suite lens); no phone/email in any response (column assert); grid 60fps at 4×.

### R3-T3 — The room feed (`tier: 2`) — **RAHUL DECISION R-D1 executed (async-only default)**
**Files:** `src/pages/room/RoomFeed.tsx`, `src/components/room/RoomPostCard.tsx`, `src/components/room/RoomComposer.tsx` *(new)*
Post kinds `post | question | win` (flair chips, accent-tinted); keyset pagination via react-query infinite, explicit "Earlier" button, terminus block; composer with kind picker + the P4-T8 focus choreography (lift + champagne post button on non-empty); optimistic insert; reply thread inline (flat, no nesting v1). Legacy copy: one-off idempotent SQL copies `community_posts` rows with `cohort_batch_id` into `cohort_room_posts` via `legacy_post_id` (community-draft §8 pattern; old rows never deleted).
**Edge cases:** empty feed (kind-aware serif prompts); muted/moderation (admin soft-delete via policy; no member-facing mod tools v1); double-submit disabled while pending.
**Acceptance:** one RPC/page fetch; feed ENDS; copy delta counts recorded; zero writes to `community_posts` with `cohort_batch_id` after cutover (48h audit); the old CommunityPage cohort scope-toggle removed in the same train *(coordinate with community-v2 M1 owner if it shipped)*.

### R3-T4 — Resources: the binder (`tier: 2`)
**Files:** `src/pages/room/RoomResources.tsx` *(new)*, `src/pages/admin/AdminCohorts.tsx` *(resources tab — sequential lane with any other admin-cohorts task)*
Week-grouped resource list (kind icon, title, source domain mono); pinned (week-less) section on top; admin/mentor CRUD in admin panel (client writes for hosts via RLS are allowed by 0003 — UI ships admin-first, host composer later).
**Edge cases:** dead link (no validation v1 — external); 0 resources (module self-hides on the room home, empty state on the tab).
**Acceptance:** resources render grouped correctly against fixture; member cannot INSERT (suite); ≥44px rows.

---

# PHASE R4 — The third act (demo day, certificates, alumni)
**Goal:** cohorts end like seasons, not like cron jobs.
**Sequencing:** T1 → T2 → T3; T4 parallel.

### R4-T1 — Demo day module (`tier: 2`) — **RAHUL DECISION R-D6 (members-only default)**
**Files:** `src/pages/room/RoomDemoDay.tsx`, `src/components/room/DemoEntryCard.tsx`, `src/components/room/DemoSubmitSheet.tsx` *(new)*
From week 1 the episode rail ends in a dated "THE FINALE" slot (anticipation, no mechanics). In `wrap` phase the module opens: submit sheet (title, description, work_url or file via the cohort-submissions bucket pattern), gallery of entry cards (poster treatment, member name + city), the demo-day `live_sessions` row as the headline event with R2-T2 choreography.
**Edge cases:** no entries at event time ("The screening goes on." — entries can land after); entry edit until event end; file size per bucket rules.
**Acceptance:** full loop on fixtures (submit → gallery → event live state); one entry per member enforced (unique key surfaces as friendly error); outsider suite re-run green.

### R4-T2 — The certificate moment (`tier: 2`)
**Files:** `src/components/room/CertificateMoment.tsx` *(new)*, `src/pages/room/RoomHome.tsx` *(wrap-phase slot — lane with R1-T6 owner)*
Wrap phase, eligible member (`user_is_certificate_eligible`): a produced moment — serif "You finished." + certificate card + share (reuses P4-T6's share mechanism if landed; else download link) + `celebrate()` haptic once (localStorage guard). Ineligible: honest state ("{pct}% attendance · {threshold}% needed") with the recordings shelf linked (the make-up path) — no shame register.
**Edge cases:** eligibility flips after late attendance marking (query refetch); certificate system offline (existing error paths).
**Acceptance:** fires once per user; ineligible copy exact; reduced motion instant; no red anywhere.

### R4-T3 — The alumni flip (`tier: 2`)
**Files:** `src/components/room/AlumniBanner.tsx` *(new)*, `src/pages/admin/AdminCohorts.tsx` *(phase control — sequential lane with R3-T4)*
Admin flips `phase='alumni'` (one control + confirm). Room re-renders: masthead gains `ALUMNI` wordmark, sessions module retires, Screening Shelf + feed + roster + demo gallery stay, banner: "This room stays open. You keep it." Members' role rows rename via the R0 trigger.
**Edge cases:** flip with open assignments (submissions lock to read-only via existing status rules — verify no orphaned `needs_revision` path: keep resubmission open 14 days post-flip, then admin closes);
**Acceptance:** flip fixture walk: modules retire/stay per spec; `/rooms` moves the card to the alumni shelf; no data deleted anywhere.

### R4-T4 — Room analytics events (`tier: 3`)
**Files:** `src/lib/analytics.ts` *(extend `track()` — coordinate with design-vision P3-T7 state)*
Exactly seven: `room_opened {slug, phase}`, `room_session_join_tapped {sessionId, state}`, `room_recording_played {resumed:boolean}`, `room_assignment_submitted {weekN, late:boolean}`, `room_announcement_seen`, `room_demo_entry_submitted`, `room_switched`. Weekly engagement (the G10 gap) derives server-side from tables, not events.
**Acceptance:** events visible on a scripted walk; zero console errors offline.

---

## Phase summary

| Phase | Name | Tasks | Tier-1 | Ships |
|---|---|---|---|---|
| R0 | Backbone | 6 | 5 | Config/membership/content schema, RLS, RPCs, adversarial suite, backfill — zero UI |
| R1 | Threshold | 6 | 2 | Themed shell, title card, My Cohorts, switcher, pre-start induction |
| R2 | The season | 5 | 1 | Weeks/sessions/recordings/assignments world-class; `/cohort` retired |
| R3 | People layer | 4 | 0 | Announcements, roster, feed, resources |
| R4 | Third act | 4 | 0 | Demo day, certificate moment, alumni flip, analytics |
| **Total** | | **25** | **8** | |

**Starts immediately:** R0 and R1 in full, R2 in full — no dependency on the community-v2 direction pick. **Waits:** R3-T3 (feed post primitives — align with the commons pick), R3-T1's notification cadence if Phase-8 push lands first (then doors-open push is the follow-up, R-D8).
