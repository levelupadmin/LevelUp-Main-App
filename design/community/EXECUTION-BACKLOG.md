# LevelUp Community — Execution Backlog (phases C0–C4)
### Hand-off-to-Opus plan. Every task execution-ready: zero design thinking required from the builder.
*Companions: `STRATEGY.md` (the why), `ARCHITECTURE.md` + `migrations-draft/` (the backbone), `UI-DIRECTIONS.md` + `PROTOTYPE.html` (the look — Direction A, "The Programme"). Format follows `design/vision/EXECUTION-BACKLOG.md`. Written 2026-07-07 on `design/phase-2`; re-validate file/line refs before building each phase.*

## How to use this document
- Each phase becomes one `design/briefs/community-N.md` and runs through ORCHESTRATION.md's loop: `design-phase-build` → `design-qa-gate` (with the NEW lenses in §QA below) → sprints → council (Tier 1) → internal release → Rahul device pass → promote.
- **Tiers** per CLAUDE.md. Everything in Phase C0 is 🔴 Tier 1 (Supabase migrations + RLS + triggers on `enrolments` — the entitlement spine): council **must** argue it, the adversarial suite **must** pass on a shadow project, Rahul signs off in writing, prod backup before apply.
- **Global hard rules (every task):** transform/opacity-only motion from `src/lib/motion.ts` tokens; NO new `backdrop-filter`; ≥44px touch targets; reduced-motion intact; audit at 360×740 AND 375×812; feeds paginate and END (no infinite scroll); champagne = one moment per screen; never touch html/body overflow; buy/apply CTAs gated `isNative()` on native (Reader Rule) — a Door's `path_in_url` renders as informational text on iOS, tappable link on web/Android.
- **Names discipline:** Nelson **Dilipkumar** (never Venkatesan), Lokesh Kanagaraj, Ravi Basrur — grep the diff for "Venkatesan" → must be 0.
- **File ownership is exclusive per task within a phase.** `src/pages/CommunityPage.tsx` (the OLD page) is frozen: nothing in this program edits it until C2-T8 retires it.
- Standing **RAHUL DECISIONS** (R1–R10) live in STRATEGY.md §8; tasks reference them by number.

---

# PHASE C0 — The backbone (schema, entitlements, RLS) — 🔴 all Tier 1, one council
**Goal:** the four draft migrations land in prod, provably leak-proof, with zero client-visible change. No UI ships in this phase.
**Gate:** the adversarial access suite (C0-T4) green on a shadow Supabase project seeded with prod-shaped fixtures; then council; then apply to prod per CLAUDE.md (link `ivkvluezuiojovpotlyb` explicitly, `migration list` diff, backup first).
**Sequencing:** C0-T1 → C0-T2 → C0-T3 → C0-T4 (suite) → council → C0-T5 (apply + seed + copy) → C0-T6.

### C0-T1 — Finalize the backbone migration (`tier: 1`)
**Files:** `design/community/migrations-draft/0001_community_backbone.sql` → `supabase/migrations/<ts>_community_backbone.sql`
1. Review/finalize the draft: remove the guard-placeholder lines; confirm `set_updated_at()` exists (it does — used app-wide); confirm every CHECK/index compiles on Postgres 15 (`supabase start` local or shadow project).
2. Verify no name collisions in prod: `communities`, `community_editions`, `community_rooms`, `community_threads`, `community_replies`, `community_reactions`, `community_programming`, `community_reports`, `community_mutes`, `community_mod_log` must not exist (the dead Lovable-era `community_spaces`/`community_channels` are absent from live types — confirm against the prod schema, not just types.ts).
3. Counter triggers: add a unit-style SQL test (insert reply → reply_count 1; soft-delete → 0; un-delete → 1; reaction insert/delete symmetric).
**Edge cases:** re-run safety (draft uses plain CREATE — the applied migration runs once by definition; do NOT add IF NOT EXISTS, we want loud failure); `cardinality(crit_asks) <= 3` with NULL (column is NOT NULL DEFAULT '{}' — fine).
**Acceptance:** applies cleanly on shadow; all SQL tests green; `npx supabase migration list` shows exactly one new local migration; council sign-off recorded in the PR.

### C0-T2 — The entitlement engine (`tier: 1` — triggers on enrolments: the payment path's table)
**Files:** `design/community/migrations-draft/0002_community_entitlements.sql` → `supabase/migrations/<ts>_community_entitlements.sql`
1. Finalize the draft. **Council must specifically argue:** (a) the AFTER-trigger on `enrolments` cannot block or slow enrolment creation — the exception guard swallows errors with WARNING; verify by forcing a failure (drop a temp permission) and confirming the enrolment still commits; (b) `community_resolve_user` cost on a user with many enrolments (measure with a 74k-legacy-shaped fixture; must be <50ms); (c) temp-table churn under the backfill loop (`community_apply_rule` over the `all_members` Commons rule = full user-table walk — run it batched in the release window, measure duration on shadow with prod-scale row counts).
2. Schedule `community_reconcile()` nightly via pg_cron (mirror `20260526220000_cohort_notify_cron.sql`'s pattern), 03:30 IST.
3. SQL tests: enrolment insert → membership appears; status→'revoked' → membership gone; batch-member delete → edition membership gone, community membership survives if another rule grants it; rule deactivate → retraction + re-resolve; manual grant survives every resolver pass; application status 'accepted' → edition membership; 'withdrawn' → gone.
**Edge cases:** user deleted (`users.deleted_at`) → reconcile drops all rows (CASCADE covers hard deletes); duplicate rules for the same scope (DISTINCT ON keeps highest role); enrolment expiry passing silently (no trigger fires — the nightly reconcile catches it; document the ≤24h staleness window for expiry-based revocation as ACCEPTED and note that `expires_at` UPDATEs do fire the trigger).
**Acceptance:** all SQL tests green on shadow; enrolment-path timing regression <5ms p95 (before/after INSERT benchmark); council sign-off.

### C0-T3 — RLS + read RPCs (`tier: 1` — THE security boundary, council mandatory)
**Files:** `design/community/migrations-draft/0003_community_rls.sql` → `supabase/migrations/<ts>_community_rls.sql`
1. Finalize the draft. **Council must specifically argue:** every SELECT policy routes through `community_can_access_room()` (invariant #2); the `threads_update_own` / `replies_update_own` WITH CHECK self-subquery pattern (pin/helped immutability) — if council prefers, replace with BEFORE-UPDATE trigger guards that RAISE on non-privileged pin/helped changes (equivalent, easier to reason about; builder implements whichever council picks, same acceptance);
   the two SECURITY DEFINER read RPCs assert access FIRST (invariant #6); the teaser view exposes zero content columns (invariant #3); `REVOKE` statements actually bite (PostgREST default grants).
2. `community_get_feed` p95 <120ms on shadow with 10k threads/room (uses `idx_community_threads_feed` — verify EXPLAIN shows the partial index).
3. `community_get_programme` p95 <150ms for a user in 3 houses + 2 editions.
**Edge cases:** `auth.uid()` NULL (anon) → every helper returns false, every RPC raises; a user with ONLY an edition membership can read the edition's rooms AND the house's open rooms (by design — ARCHITECTURE §5) but NOT another edition's rooms; soft-deleted thread visible to author + admin only; muted user can read everything, post nothing.
**Acceptance:** C0-T4 suite green; EXPLAIN plans recorded in the PR; council sign-off; Rahul sign-off (written) on the §5 policy matrix.

### C0-T4 — The adversarial access suite (`tier: 1` — the proof)
**Files:** `qa-harness/community-access.spec.mjs` *(new — node script, PostgREST/RPC calls with real JWTs against the shadow project)*, `qa-harness/community-fixtures.sql` *(new)*
Fixtures: two houses (F, W), one edition E inside F, users: `admin`, `member_F` (house F only), `member_E` (edition E via cohort_batch rule), `member_W`, `outsider` (authenticated, zero memberships), `anon`. Content: threads in F-lobby, E-room, W-lobby.
**The suite (every case is a hard assert, run as each user):**
1. `outsider` + `member_W`: SELECT on `community_threads`/`community_replies`/`community_reactions` filtered to E's room → **0 rows**; `community_get_feed(E-room)` → **error**; direct PostgREST `?room_id=eq.<E-room>` → 0 rows; `community_rooms?id=eq.<E-room>` → 0 rows.
2. `member_F` (house but not edition): same as (1) for E's room → 0 rows/error; F-lobby → rows.
3. `member_E`: E-room rows visible; F-lobby visible; W-lobby → 0 rows.
4. **Write attacks:** `outsider` INSERT thread into E-room → RLS reject; `member_F` INSERT into E-room → reject; INSERT with `is_pinned:true` → reject; reply with `helped:true` → reject; `member_E` UPDATE another author's thread → reject; any user INSERT/UPDATE/DELETE on `community_members` and `community_entitlement_rules` → reject (grant-level); non-author calling `community_mark_helped` → error.
5. **Tease non-leak:** `outsider` SELECT `community_editions` → rows (metadata only — assert returned column set exactly matches the schema's safe set); `community_programme_teasers` → titles only; assert NO route exists to thread bodies: grep the suite's full response corpus for a sentinel string planted in every gated thread body (`LEAK_CANARY_E`) → **0 occurrences across all outsider/member_F/member_W responses**.
6. **Lifecycle:** revoke `member_E`'s enrolment → re-run (3) as them → E-room now 0 rows (trigger path); re-grant → visible again.
7. `anon` key: every community table + RPC → 0 rows/401/error.
**Acceptance:** suite runs green in CI-style (single command, exit 0); the canary grep is part of the run; suite is wired into the design-qa-gate as the `access-leak` lens (§QA) and re-runs on every later community phase.

### C0-T5 — Apply + seed + legacy copy (`tier: 1` — prod data)
**Files:** `design/community/migrations-draft/0004_community_seed_and_migrate.sql` → `supabase/migrations/<ts>_community_seed_and_migrate.sql`, `docs/community-runbook.md` *(new — the apply/verify/rollback runbook)*
1. Finalize the draft (admin RPCs, Commons seed, idempotent copy). The Commons `all_members` backfill walks the full users table — run the apply in a low-traffic window; measure on shadow first.
2. After prod apply: run the verification queries in the file's footer; record outputs in the PR (legacy count == copied count for posts and comments; members ≈ non-deleted users).
3. Rollback plan in the runbook: the copy is additive — rollback = drop the new tables (single DROP script included, NEVER touching `community_posts/*`); the old page never stopped working.
**Edge cases:** posts whose author was deleted (FK CASCADE means the users row is gone → the copy's JOIN drops them; count and record the delta as expected); batch posts whose batch has no edition yet → Commons Open Floor (by COALESCE design); re-run after a failed partial → idempotent via legacy ids.
**Acceptance:** prod verification outputs recorded; old `/community` page still fully functional (manual pass); reconcile cron visible in `cron.job`; Sentry/logs clean for 48h after apply.

### C0-T6 — Types + client foundation (`tier: 2`)
**Files:** `src/integrations/supabase/types.ts` *(regenerated)*, `src/hooks/useCommunity.ts` *(new)*, `src/lib/community.ts` *(new — pure types/helpers)*
1. Regenerate types from the applied schema (`npx supabase gen types`).
2. `useCommunity.ts`: react-query hooks — `useProgramme()` (`["community","programme",uid]`, staleTime 60s) wrapping `community_get_programme`; `useRoomFeed(roomId)` (infinite query keyed `["community","feed",roomId]`, keyset via `p_before`, staleTime 60s); `useThread(threadId)`; mutations `usePostThread`, `usePostReply`, `useRespect` (optimistic, mirrors the old page's revert pattern), `useMarkHelped` (RPC).
3. `lib/community.ts`: TS types for the RPC envelopes; `roleWordmark(role)`; `programmeBuckets(data)` (now/tonight/this-week derivation, IST-aware).
**Edge cases:** RPC error surfaces as react-query error (no toast storms — surfaces render ErrorState); signed-out → hooks disabled.
**Acceptance:** `npm run build` + suite green; unit tests for `programmeBuckets` (fixture timestamps → buckets); zero UI change shipped.

---

# PHASE C1 — Admin & operations
**Goal:** Rahul can run the whole community from the admin panel: create houses/editions, map products, programme rituals, moderate. The "one insert" story gets a UI.
**Gate routes:** `/admin/community` (new), existing admin shell untouched elsewhere.
**Sequencing:** C1-T1 first (page shell), then T2–T4 parallel; C1-T5 (ops) anytime after C0.

### C1-T1 — Admin: Communities & editions manager (`tier: 2` — admin surface)
**Files:** `src/pages/admin/AdminCommunity.tsx` *(new)*, `src/App.tsx` *(route line only)*, `src/components/admin/community/HouseEditor.tsx`, `.../EditionEditor.tsx` *(new dir)*
Table of houses (name/slug/status/member count/rooms) + create/edit via `admin_create_community` RPC + status flips (draft → opening_soon → active — the STRATEGY §5 launch gate); editions per house via `admin_create_edition` (kind, tease_copy, path_in_url, phase flips incl. → alumni). Admin register (mono/amber) — do NOT restyle to the student brand (REPORT §e-12).
**Edge cases:** slug collisions (unique violation → inline error); archiving a house with content (status flip only — nothing deletes).
**Acceptance:** create house → 5 default rooms exist; create edition with a `cohort_batch` source → members appear (verify count); all writes via RPCs (no direct table inserts from the client except UPDATE status by admin policy).

### C1-T2 — Admin: Entitlement rules board (`tier: 2`)
**Files:** `src/components/admin/community/RulesBoard.tsx` *(new)*, `src/pages/admin/AdminCommunity.tsx` *(tab mount — same lane as C1-T1, sequential)*
Rules table (source kind/source label/destination/role/active/members-created count) + create form: source pickers query `offerings` (title search) and `cohort_batches`; destination pickers query houses/editions; role select. Deactivate = `active:false` (trigger retracts). Show a preview count before creating ("this rule will place ~412 existing members") via a dry-run RPC `community_rule_preview(source_kind, source_id)` *(add in this task — SECURITY DEFINER, admin-guarded, COUNT only)*.
**Edge cases:** rule on an offering with 0 enrolments (preview 0, still creatable); duplicate rule (same source+destination) → warn, allow (resolver dedupes).
**Acceptance:** create screenwriting→writing + screenwriting→filmmaking rules (the STRATEGY cross-map case) → one purchase fixture user appears in both houses; deactivate → memberships retract; preview counts match post-create counts ±0.

### C1-T3 — Admin: Programme manager (`tier: 2`)
**Files:** `src/components/admin/community/ProgrammeManager.tsx` *(new)*, `src/pages/admin/AdminCommunity.tsx` *(tab mount — same lane)*
Week-grid per house: create/edit `community_programming` rows (kind, title, starts/ends, tease_visible, location: pick an existing `live_sessions`/`workshops` row, a thread, or external URL). Recurring helper: "repeat weekly ×N" creates N rows (no RRULE engine — keep dumb). Empty-programme alarm: any active house with 0 rows in the next 7 days renders a red row in this view (the STRATEGY §3.5 "empty slot is an admin alarm").
**Edge cases:** cross-midnight events; IST display (admin) vs timestamptz storage; deleting a programming row that a Door tease referenced (tease just shrinks).
**Acceptance:** created rows appear in `community_get_programme` buckets correctly (verify via the C0-T6 hook in a dev harness); alarm row appears for a bare house.

### C1-T4 — Admin: Moderation queue + host tools (`tier: 2`)
**Files:** `src/components/admin/community/ModerationQueue.tsx` *(new)*, `src/pages/admin/AdminCommunity.tsx` *(tab mount — same lane)*
Open reports list (subject preview via admin read, reporter, reason) → actions: dismiss / soft-delete subject / mute author (7/30d) — each writes `community_mod_log`; manual grants UI (`admin_grant_membership` — user search by phone/email, house/edition, role incl. host/mentor appointments).
**Edge cases:** report on already-deleted subject (auto-resolve); double-mute (upsert extends).
**Acceptance:** full report→action→log loop works; mod actions visible in the log tab; muted fixture user's `community_can_post` returns false (verify via SQL).

### C1-T5 — Operations: the launch mappings (`tier: 3` — data entry, Rahul + assistant)
**Files:** none (prod admin UI usage) — checklist in `docs/community-runbook.md` *(same file as C0-T5, append)*
Execute STRATEGY §6/R1: create Filmmaking house (+Writing as opening_soon); rules: Lokesh offering → filmmaking, Nelson offering → filmmaking, Ravi Basrur offering → filmmaking, screenwriting offering → writing + filmmaking; editions for each active cohort batch + Forge edition with tease copy + path_in_url; hosts appointed; first 2 weeks of programme rows; founding-member grants.
**Acceptance:** runbook checklist fully ticked with row counts recorded; RAHUL DECISION R1/R2 confirmations attached.

---

# PHASE C2 — The member surfaces (Direction A core UI)
**Goal:** ship "The Programme" — home, house, room feed, dailies thread — behind `/community` v2, at parity+ with the old page, then retire the old feed.
**Gate routes:** `/community`, `/community/filmmaking`, `/community/filmmaking/dailies`, one thread route, at 375 AND 360, member + outsider fixtures.
**Sequencing:** C2-T1 (shell+routing, Tier 1) first → T2–T6 parallel (exclusive files) → T7 (composer) → T8 (cutover) last.

### C2-T1 — Community shell + routes (`tier: 1` — routing, council accumulates with the phase)
**Files:** `src/App.tsx` *(routes only)*, `src/pages/community/CommunityProgramme.tsx`, `.../CommunityHouse.tsx`, `.../CommunityRoom.tsx`, `.../CommunityThread.tsx` *(new dir, skeleton screens)*, `src/lib/flags.ts` *(new — `communityV2` flag: env `VITE_COMMUNITY_V2` + localStorage override)*
Routes: `/community` renders v2 `CommunityProgramme` when flag on, else old `CommunityPage`; `/community/:house`, `/community/:house/:room`, `/community/t/:threadId`. Old page keeps its exact route behavior when flag off. Lazy-load the new dir as its own chunk.
**Edge cases:** deep link to a room the user can't access → RPC error → branded "This door is closed" state with a link back to the Programme (NEVER an infinite spinner); flag off + v2 deep link → redirect `/community`.
**Acceptance:** flag off = byte-identical old behavior (visual diff); flag on = four skeleton screens navigable; chunk split verified in build output; council notes the routing diff.

### C2-T2 — The Programme (home) (`tier: 2`)
**Files:** `src/pages/community/CommunityProgramme.tsx`, `src/components/community/PlaybillRow.tsx`, `.../HappeningNow.tsx`, `.../NeedsYou.tsx` *(new)*
Build PROTOTYPE.html screen 1 in the real system: masthead (eyebrow `THE PROGRAMME · {date}`, h1 "What's on *tonight*." — serif italic token, member line from `useAuth` profile `member_number` + house names); HappeningNow (champagne dot pulse — `motion-safe` gated, the screen's ONE champagne moment); Tonight/This Week playbill rows (mono time column w-16, serif-italic title, meta line — `PlaybillRow` with `locked` variant); NeedsYou surface (from feed data: own threads with new replies, open dailies count); Doors shelf mounts C4-T1's component (until then: houses row only); terminus block ("You're all caught up." serif + next programme line). Pull-to-refresh invalidates `["community","programme"]`.
**Edge cases:** zero programme rows (terminus becomes "The programme is being set." + houses still render — never a dead screen); signed-in user with zero houses (Commons rule makes this impossible post-C0-T5 — but render a safe "Your rooms are being prepared" state anyway); reduced motion (no pulse).
**Acceptance:** matches prototype register at 375/360 (side-by-side screenshot in PR); one champagne element per screen (visual audit); all rows ≥44px; data from exactly ONE RPC round-trip (network tab ≤2 requests incl. auth).

### C2-T3 — The House screen (`tier: 2`)
**Files:** `src/pages/community/CommunityHouse.tsx`, `src/components/community/RoomRow.tsx`, `.../NoticeboardDrop.tsx` *(new)*
Prototype screen 2: house masthead (serif tagline from `communities.tagline`, active-member mono line); latest Noticeboard drop as the champagne-left-border quote card (query: latest `kind='drop'` thread in the house's noticeboard room); rooms index (RoomRow: name/description/right-aligned mono live-hint from feed counters); house programme playbill (filtered `this_week` from the programme envelope); Doors-in-this-house rail (C4-T1 component).
**Edge cases:** no drop yet ("The noticeboard is waiting for its first note." serif empty inside the card frame); user is edition-member-only (open rooms still listed per access model); room with 0 threads (live-hint hidden, never "0").
**Acceptance:** register matches prototype; drop quote renders serif italic with mentor wordmark when author role = mentor; navigation house→room→back preserves scroll (react-router state).

### C2-T4 — The Room feed (`tier: 2`)
**Files:** `src/pages/community/CommunityRoom.tsx`, `src/components/community/ThreadCard.tsx`, `.../RespectButton.tsx` *(new)*
Feed via `useRoomFeed` (keyset infinite query, 20/page, explicit "Earlier" button — NOT scroll-triggered; feeds END with the terminus block). ThreadCard: author row (InitialsAvatar, name, `MEMBER #{n}` mono line, role wordmark for host/mentor/alumni), serif title (when present), body clamp-4, dailies variant shows work-frame strip + asks chips + `OPEN FOR NOTES · {n}` slate, counters row (RespectButton with optimistic toggle + `tapTick()`, reply count). Pinned threads render first with a pin glyph (champagne). `kind='drop'` renders the NoticeboardDrop treatment inline.
**Edge cases:** empty room (kind-specific serif empty states: dailies → "Put the first work on the table."; intros → "Say your name. Someone's waiting to meet you."); deleted thread mid-scroll (RPC omits; optimistic list splice on moderation); offline (react-query cache renders + existing OfflineBanner).
**Acceptance:** one RPC per page fetch (network audit); scroll 60fps at 4× throttle (gate lens); "Earlier" appears only when `has_more`; respect optimistic-reverts on forced error; zero raw-Tailwind palette colors (token-police grep).

### C2-T5 — The Dailies thread screen (`tier: 2`)
**Files:** `src/pages/community/CommunityThread.tsx`, `src/components/community/NoteCard.tsx`, `.../HelpedMark.tsx`, `.../AsksSlate.tsx` *(new)*
Prototype screen 4: serif title, author row, work frame (link-embed card for `work_url` — YouTube/Drive/IG thumbnail via oEmbed-safe pattern or plain link card; NO iframe autoload), AsksSlate (mono `LOOKING FOR` + chips), respect row + `OPEN FOR NOTES` status, notes list (NoteCard: timecode chip when present — tapping copies the timecode; mentor notes get the champagne-left-border serif treatment; host wordmark), HelpedMark (visible to all as state; tappable ONLY when `auth.uid() == thread.author_id`, calls `community_mark_helped`, `confirm(true)` haptic), reply composer (input + timecode attach button that validates `M:SS`), and for the author of an open dailies: the "post your director's cut" action → posts a reply flagged in body + sets thread `status='resolved'` → credits block renders (names of helped-mark recipients).
**Edge cases:** thread soft-deleted while open (ErrorState "This thread was taken down."); non-dailies kinds hide slate/frame/status; helped on own reply impossible (RPC guards); very long note bodies (no clamp in thread view).
**Acceptance:** helped tap works only for author fixture (adversarial: other-user tap → error toast, no state change); resolved thread shows credits with correct names; timecode regex enforced client + schema-side; register matches prototype screenshot.

### C2-T6 — Composer: posts + dailies (`tier: 2`)
**Files:** `src/components/community/Composer.tsx`, `.../DailiesComposer.tsx` *(new)*, `src/pages/community/CommunityRoom.tsx` *(mount point — sequential lane with C2-T4, same builder)*
Room-aware composer: rooms with `post_policy='hosts'` hide it for non-hosts (RLS is the boundary; this is UX). Default mode: text post (+ optional title). In dailies rooms: the DailiesComposer — work link field (URL validate), asks picker (≤3 from a per-house preset list: filmmaking `PACING/EDIT/SOUND/PERFORMANCE/FRAME`, writing `STRUCTURE/DIALOGUE/OPENING/CHARACTER`, fallback generic), body ("What should we know before watching?"). Composer focus choreography per old P4-T8 spec (lift + champagne Post button on non-empty — absorbed here); `confirm(true)` on post; prompt chips on empty rooms pre-fill via ref (kills the old page's `querySelector` hack pattern — never reintroduce it).
**Edge cases:** muted user (insert rejected → "You can't post here right now." — no raw error string); double-submit (disable while pending); paste of non-URL into work field (inline error, `role="alert"`).
**Acceptance:** post → appears top of feed without full refetch (cache prepend); dailies posts carry asks + work_url server-side (verify row); hosts-only room shows no composer to member fixture; axe: labels on all fields.

### C2-T7 — Community notifications (in-app) (`tier: 2`)
**Files:** `supabase/migrations/<ts>_community_notify_triggers.sql` *(new — mirrors `20260611120000_comment_notification_trigger.sql`)*, `src/components/NotificationDropdown.tsx` *(type-map lines only — coordinate: lands AFTER design-vision P4-T2 if that phase ran; else independent)*
Server-side triggers (RLS-safe, like the existing comment trigger): reply on your thread → notification; helped mark on your note → notification; mentor/host drop in a house you belong to → notification (batched: one per drop). Types map to the existing notification system; NO new push surface (R8 rides the global Phase-8 decision).
**Edge cases:** self-reply (no notification); notification for a thread later deleted (link → "taken down" state); volume cap: max 1 unread "drop" notification per room (upsert semantics).
**Acceptance:** SQL tests for each trigger; a reply from user B creates exactly one notification for author A (and zero for B); grep confirms no client-side notification inserts.

### C2-T8 — Cutover + retire the old feed (`tier: 1` — routing + data truth swap, council)
**Files:** `src/App.tsx` *(flag default)*, `src/pages/CommunityPage.tsx` *(retirement: becomes a redirect shim)*, `src/lib/flags.ts`
Preconditions (mechanical): C0-T5 verification counts recorded; C2-T2…T6 gate-passed; re-run the legacy copy delta (posts created since apply — the idempotent script picks them up); Rahul device pass on Android + iOS.
1. Re-run `0004`'s copy block (as a one-off SQL with fresh timestamp) to catch posts made on the old page since C0.
2. Flip `communityV2` default ON; `CommunityPage.tsx` becomes `<Navigate to="/community" replace/>` shim (file kept, logic removed); "My Cohort"/peer-review entry points keep working (PeerReviewBoard is NOT community — verify `CohortDashboard` links unaffected).
3. Staged rollout per CLAUDE.md for the native release train; web = instant with revert plan (flag flip back).
**Acceptance:** old deep links land on v2; zero writes to `community_posts` from the app after cutover (grep + 48h DB write audit); rollback rehearsal documented (flag off restores old page reading old tables).

---

# PHASE C3 — Rituals & programming (the heartbeat)
**Goal:** the programme is not decoration — crit night, challenges, and induction actually run through the product.
**Sequencing:** C3-T1 → C3-T2; T3/T4 parallel.

### C3-T1 — Crit night live mode (`tier: 2`)
**Files:** `src/pages/community/CommunityRoom.tsx` *(banner slot only)*, `src/components/community/CritNightBanner.tsx` *(new)*
When a `crit_night` programming row for this room's house is live (now between starts/ends): the dailies room shows the live banner (champagne pulse dot + "Crit night is on · {host} is in the room" + attendee-free honesty — no fake presence counts in v1) and the feed default-sorts open dailies with fewest replies first during the window (`p_sort:'needs_eyes'` param added to `community_get_feed` — SQL change rides a Tier-2 migration, same access assertion).
**Edge cases:** overlapping crit nights (earliest wins); reduced motion (static dot).
**Acceptance:** banner appears/disappears on window boundaries (clock-mocked test); sort verified by fixture; outside the window, default sort unchanged.

### C3-T2 — Challenges (`tier: 2`)
**Files:** `src/components/community/ChallengeCard.tsx` *(new)*, `src/pages/community/CommunityHouse.tsx` *(mount — sequential lane with C2-T3's owner)*
A `challenge` programming row renders as the house's challenge card (serif brief title, mono deadline, "submit" → DailiesComposer pre-tagged `crit_asks:['CHALLENGE']` + body prefix `[{challenge title}]`); submissions listed via feed filter (client-side on the tag); at `ends_at`, card flips to "Screening {date}" linking the screening programming row.
**Edge cases:** no submissions at deadline (card: "Quiet month. The brief stands." — no shame states); multiple active challenges (stack max 2).
**Acceptance:** full loop on fixtures: brief → 2 submissions → deadline flip; submissions visible in dailies room tagged.

### C3-T3 — Induction: First Positions (`tier: 2`)
**Files:** `src/components/community/InductionCard.tsx` *(new)*, `src/pages/community/CommunityProgramme.tsx` *(mount slot — sequential lane with C2-T2's owner)*
For a member whose first membership row is <14 days old AND has zero threads/replies: the Programme's top block (above Happening Now) is the induction card: "You're in, {first name}." (serif) + house name + ONE action: "Take first position" → intros room composer pre-filled with the format (`Name / City / Craft / One link`). Dismissible; never returns after first contribution or dismissal (localStorage + server check).
**Edge cases:** multi-house new member (card names the primary = first-granted house); returning legacy user (>14d membership → never shows).
**Acceptance:** shows exactly for the fixture cohort (new+silent), disappears on post/dismiss; the 48h-activation metric event fires (C4-T4's `track()`).

### C3-T4 — The weekly digest (email) (`tier: 2`) — **RAHUL DECISION R8-adjacent (recommend YES)**
**Files:** `supabase/functions/community-digest/index.ts` *(new edge fn)*, cron migration `<ts>_community_digest_cron.sql`
Weekly (Sun 6pm IST) per-user email via the existing `queue-transactional-email` infra + `_shared/email-templates/` pattern: your houses' next-week programme (≤5 rows), "your dailies got N notes", one door tease (rotating). Hard rules: one email/week max, one-tap unsubscribe flag on `users` (new bool column in the same migration), zero send when nothing to say.
**Edge cases:** user in Commons only (send only if programme non-empty); unsubscribed (skip); email absent/synthetic phone-email (skip).
**Acceptance:** dry-run mode renders HTML for 5 fixture users (attach to PR); volume cap test (double-cron within a week sends 0); unsubscribe honored.

---

# PHASE C4 — The FOMO & status layer
**Goal:** doors, teases, happening-now, and earned identity — the growth surface.
**Sequencing:** T1 → T2; T3/T4 parallel.

### C4-T1 — Doors shelf + door slabs (`tier: 2`)
**Files:** `src/components/community/DoorShelf.tsx`, `.../DoorSlab.tsx` *(new)*, mounts in `CommunityProgramme.tsx`/`CommunityHouse.tsx` *(slots reserved by C2-T2/T3)*
Prototype's Doors rail: horizontal snap-scroll shelf; slabs 128×172, three variants: `open` (champagne-tinted border+wash, crest initial, active count), `locked` (brass plate `🔒 PRIVATE`, champagne crest ring, member count), `soon` (muted, "Opening {month}"). Data: `houses` + `my_editions` (open) + `teased_editions` (locked) from the programme envelope. Order: your doors first, then locked (nearest-launch first), then soon.
**Edge cases:** >8 doors (shelf scrolls; no "see all" in v1); house `opening_soon` renders as `soon` slab; zero teased editions (shelf shows houses only — never empty).
**Acceptance:** counts match `member_count`; locked slab tap → C4-T2 page; snap-scroll smooth at 4× throttle; slabs ≥44px tap targets.

### C4-T2 — The Door page (edition tease) (`tier: 2` — the conversion surface)
**Files:** `src/pages/community/CommunityDoor.tsx` *(new)*, `src/App.tsx` *(route line — coordinate with C2-T1 owner)*
Prototype screen 3: crest hero (radial champagne wash — gradient only, NO backdrop-filter), serif edition name, honest mono count line, tease_copy serif block, "On their programme" locked playbill (from `community_programme_teasers` — titles/times only), path-in champagne button (`path_in_url`) — **`isNative()` gates it to plain text on iOS** (Reader Rule), and the closing line "Alumni keep their rooms forever." For MEMBERS, the same route renders the edition's room directly (redirect to room).
**Edge cases:** edition with no teased programme (playbill section hidden; tease copy carries the page); `path_in_url` empty ("Doors open by invitation." quiet line instead of button); alumni-phase edition (eyebrow `ALUMNI ROOM`, no path-in).
**Acceptance:** adversarial: outsider fixture's page contains zero content strings from the edition's threads (canary grep — automated in the access-leak lens); iOS emulation shows no tappable buy path; door-tease view + path-in tap fire C4-T4 events.

### C4-T3 — Earned identity: wordmarks, crests, member numbers (`tier: 2`)
**Files:** `src/components/community/RoleWordmark.tsx`, `.../EditionCrests.tsx` *(new)*, `src/pages/ProfilePage.tsx` *(one section insert — coordinate with any design-vision P4-T10 owner; lands after)*
RoleWordmark: the mono-bordered `HOST`/`MENTOR`/`ALUMNI`/`FOUNDING` tags (prototype's `.rolemark`) used by ThreadCard/NoteCard (already consuming from C2). EditionCrests: profile section "Rooms & crests" — the user's houses + edition crests (circle monograms; alumni crests champagne-ringed) + `MEMBER #{member_number}` line. No counts, no XP, no progress bars — crests are binary and permanent.
**Edge cases:** user with Commons only (section shows Commons + member number — still identity); very many crests (wrap grid, no scroll).
**Acceptance:** crests match membership fixtures exactly; zero numeric "score" anywhere (visual audit); wordmark contrast ≥4.5:1.

### C4-T4 — Community analytics events (`tier: 3`)
**Files:** `src/lib/analytics.ts` *(extend the existing `track()` — coordinate with design-vision P3-T7 if built; else add the same no-op-safe `track()`)*
Exactly eight events: `community_programme_viewed`, `community_room_opened {roomKind}`, `community_thread_posted {kind}`, `community_note_left {hasTimecode}`, `community_helped_marked`, `community_door_tease_viewed {editionId}`, `community_path_in_tapped {editionId}`, `community_first_contribution` (the 48h activation). These are STRATEGY §7's inputs (WCR derives server-side from tables, not events). No PII beyond session user id.
**Acceptance:** events visible in the sink on a scripted walkthrough; zero console errors when blocked/offline.

---

# QA — Gate additions for every community phase (extends design/vision/QA-PROCESS.md)

**New lens: `access-leak` (live, adversarial — BLOCKING from C0 onward).** Runs `qa-harness/community-access.spec.mjs` (C0-T4) against the phase's environment on every gate: the full outsider/member_F/member_W matrix, the write-attack set, and the LEAK_CANARY grep across every captured response AND every rendered page's DOM (Playwright `page.content()` on door/tease/programme routes as the outsider fixture). **A non-member reading one byte of gated content = BLOCK, no fix-list.**
**New lens: `feed-perf` (live, counted).** Room open ≤2 network requests (RPC + at most one auth refresh); page fetch p95 <400ms on emulated Fast-3G against staging; scroll 60fps at 4× CPU (existing budget); NO scroll-position fetch triggers (grep for IntersectionObserver on the feed container → only the "Earlier" button is allowed to fetch).
**New lens: `empty-cold` (live).** Every community route rendered with: fresh-user fixture, zero-programme fixture, offline — no dead screens, every empty state in the serif register, terminus present at feed end.
**Standing checks inherited:** token-police greps (extended: `red-400|amber-400` in `src/components/community src/pages/community` → 0), 44px floor, reduced-motion, voice lens (community copy follows the P5-T4 voice rules; ban "engage", "content", "users" in student-facing strings — say "work", "notes", "members").
**Device protocol:** every community phase's Rahul pass includes one real mid-range Android + the iOS Reader-Rule walk (door pages must show no purchase path).

---

## Phase summary

| Phase | Name | Tasks | Tier-1 tasks | Ships |
|---|---|---|---|---|
| C0 | The backbone | 6 | 5 | Schema, entitlement engine, RLS, adversarial suite, seed+copy — zero UI |
| C1 | Admin & operations | 5 | 0 | Rahul runs communities end-to-end; launch mappings live |
| C2 | Member surfaces | 8 | 2 | The Programme / House / Room / Dailies; cutover, old feed retired |
| C3 | Rituals & programming | 4 | 0 | Crit night, challenges, induction, digest |
| C4 | FOMO & status | 4 | 0 | Doors, tease pages, crests, analytics |
| **Total** | | **27** | **7** | |
