# Community v2 (The Commons) — Execution Backlog (phases M0–M3)
### Hand-off-to-Opus plan. Every task execution-ready — EXCEPT: M1–M3 are written against Direction B ("The Exchange") and are FROZEN until Rahul picks a direction (COMMONS-DIRECTIONS §3). M0 is direction-agnostic and may proceed.
*Companions: `COMMONS-DIRECTIONS.md` (the why + the pick), `design/cohorts/` (where exclusivity now lives), the REJECTED `design/community/` (raided for parts, not resurrected). Format follows `design/vision/EXECUTION-BACKLOG.md`. Written 2026-07-08 on `design/phase-6`.*

## How to use this document
- Each phase becomes one `design/briefs/commons-N.md` through ORCHESTRATION.md's loop. M0 is 🔴 Tier 1 end-to-end (migrations + RLS): council argues it, adversarial suite green on shadow, Rahul written sign-off, prod backup.
- **Global hard rules (every task):** motion tokens only, transform/opacity, NO new `backdrop-filter`; ≥44px; reduced-motion; 360+375 audit; feeds paginate and END; one champagne moment per screen; never touch html/body overflow; no red badges/streaks/fake counts (the calm doctrine, COMMONS-DIRECTIONS §1); voice rules per design-vision P5-T4 (+ ban "engage/content/users" → "work/notes/members").
- **File ownership exclusive per task per phase.** `src/pages/CommunityPage.tsx` (old feed) is FROZEN except M3-T4 (retirement).
- **RAHUL DECISIONS** R-C1…R-C9 live in COMMONS-DIRECTIONS §4.

---

# PHASE M0 — Schema & backbone (direction-agnostic) — 🔴 all Tier 1, one council
**Goal:** the commons' data layer in prod, leak-free, zero client-visible change. Deliberately co-scheduled with cohort-rooms R0 (same council, shared doctrine).
**What transfers from the rejected draft SQL (`design/community/migrations-draft/`), block by block:**

| Old draft block | Fate |
|---|---|
| `0001` containers (`communities`, `community_editions`, `community_rooms`) | **KILLED** — one commons, no containers. A single `commons_id` doesn't even need a table; scope column dies entirely. |
| `0001` content (`community_threads/replies/reactions`, counters, soft delete, keyset indexes) | **TRANSFERS** ~80% — renamed `commons_posts/notes/reactions`; `room_id` dropped; `kind` becomes `ask\|work\|win\|resource\|post`; `crit_asks` → `asks text[]` (free chips, ≤3); adds `topics text[]` (≤2, CHECK against admin set) + `status open\|answered\|resolved` for asks/works. |
| `0002` entitlement rules + members + resolver | **SHRINKS** — no editions ⇒ no mapping table. `commons_members` remains ONLY as the role/mute/last-seen surface (role member/mentor/host/alumni, derived + manual grants); read access = any authenticated member (R-C2), enforced by policy not membership rows. |
| `0003` RLS + helper + feed RPC | **TRANSFERS** in spirit — one access helper (`commons_can_post()` for mutes/roles; SELECT is authenticated-wide), feed RPC with keyset + `has_more`, SECURITY DEFINER assert-first doctrine, teaser views KILLED (nothing is gated — nothing to tease). |
| `0004` seed + idempotent legacy copy | **TRANSFERS** — `legacy_post_id/legacy_comment_id` copy of non-cohort `community_posts` → `commons_posts`; cohort-scoped rows go to cohort rooms (R3-T3), not here. |
| Old C0-T4 adversarial suite | **TRANSFERS, reshaped** — no cross-room leak matrix (no rooms); instead: anon → 0 rows; write attacks (helped-mark by non-author, pin by member, post-while-muted, `commons_members` client writes); moderation invariants. |

### M0-T1 — Commons backbone migration (`tier: 1`)
**Files:** `design/community-v2/migrations-draft/0001_commons_backbone.sql` *(new — author it per the table above)* → `supabase/migrations/<ts>_commons_backbone.sql`
Content tables + counters + partial indexes matching the feed sort; `helped boolean` on notes settable only via `commons_mark_helped(note_id)` RPC (author-only, trigger-guarded); moderation set (`commons_reports`, `commons_mutes`, `commons_mod_log`) verbatim from the old draft pattern.
**Edge cases:** name collisions with live `community_posts/*` (none — new names); counter symmetry tests (insert/soft-delete/undelete).
**Acceptance:** shadow apply green; SQL tests green; council sign-off.

### M0-T2 — Roles, feed RPC + the usefulness sort (`tier: 1`)
**Files:** `design/community-v2/migrations-draft/0002_commons_rls_rpcs.sql` *(new)* → applied migration
1. Policies: SELECT = `authenticated` (+ `deleted_at IS NULL`); INSERT = author self + not-muted; UPDATE = author own body/status, pin/helped privileged; `commons_members` no client writes; `anon` nothing.
2. `commons_get_feed(p_lane text, p_topic text, p_before timestamptz, p_limit int)` — lanes: `all | open_asks | on_table` (Direction-B lanes are just WHERE clauses; A/C reuse `all` — this is why M0 is direction-agnostic). Sort (documented, legible): pinned → open items with 0 notes (oldest first) → `last_activity_at DESC`. Keyset, `has_more`, author join via `public_user_profiles`, `my_respect` included. p95 <120ms on 10k-post shadow.
3. `commons_get_home()` — one round-trip envelope: first feed page + open-ask count + this-week strip data + my unseen state.
**Edge cases:** `auth.uid()` NULL → RPCs raise; muted user reads everything, posts nothing; helped-mark on own note → error.
**Acceptance:** EXPLAIN plans in PR; adversarial suite (M0-T3) green; council + Rahul sign-off on the policy matrix.

### M0-T3 — Adversarial suite + apply + legacy copy (`tier: 1`)
**Files:** `qa-harness/commons-access.spec.mjs`, `qa-harness/commons-fixtures.sql` *(new)*, `docs/commons-runbook.md` *(new)*
The reshaped suite (per the table above) green on shadow → council → prod apply → idempotent copy of non-cohort `community_posts` + comments + likes (respect) with count verification recorded; old page keeps working untouched; rollback = DROP script (additive-only, old tables never touched).
**Acceptance:** one-command suite exit 0, wired into design-qa-gate as `commons-access` lens; copy counts recorded; Sentry clean 48h.

### M0-T4 — Types + hooks foundation (`tier: 2`)
**Files:** `src/integrations/supabase/types.ts` *(regenerated)*, `src/hooks/useCommons.ts`, `src/lib/commons.ts` *(new)*
React-query hooks (`useCommonsHome` staleTime 60s, `useCommonsFeed` infinite keyset, `useCommonsThread`, mutations post/note/respect/helped/report — optimistic patterns per the old page's like-revert); `lib/commons.ts` pure types + `laneFor(kind,status)` + topic-set constants (R-C4).
**Acceptance:** build + suite green; zero UI shipped.

---

# PHASE M1 — The Exchange surfaces ⛔ FROZEN until R-C1 pick
**Goal:** the commons home (masthead + two-lane deck + feed), the thread page, the composer. Ships behind `VITE_COMMONS_V2` flag.
**Gate routes:** `/community` (flag on), one ask thread, one work thread; 360+375; fresh-member/zero-activity/offline fixtures.
**Sequencing:** M1-T1 → T2/T3 parallel → T4.

### M1-T1 — Shell + home: masthead, deck, feed (`tier: 1` — routing, council accumulates)
**Files:** `src/App.tsx` *(route)*, `src/pages/commons/CommonsHome.tsx`, `src/components/commons/AskLedger.tsx`, `.../WorkRail.tsx`, `.../PostCard.tsx` *(new dir)*, `src/lib/flags.ts` *(flag)*
Masthead (eyebrow `THE COMMONS`, serif line "Someone here knows.", honest active-member mono line per R-C2); two-lane deck — OPEN ASKS ledger rows (mono: title clamp-1, topic flair, `0 NOTES · 2H`) + ON THE TABLE work cards (thumb via `ArtworkImage`, asks chips) — stacked snap-rails on mobile; the mixed feed below (PostCard: kind flair + ≤2 topic flairs, author row with `MEMBER #{n}` + role wordmark, body clamp, counters); filter chips (kind + topic) filtering in place, state in URL params; terminus block. Data: `commons_get_home` then `useCommonsFeed`.
**Edge cases:** zero open asks (ledger shows "No open asks. Someone will need you soon." — never hides, the lane IS the invitation); flag off = old page byte-identical; deep link with topic param pre-filters.
**Acceptance:** ≤2 network requests on open; deck + feed 60fps at 4×; one champagne element per screen; all rows ≥44px; register screenshot approved against COMMONS-DIRECTIONS §2 rules.

### M1-T2 — Thread page: the answer earns its place (`tier: 2`)
**Files:** `src/pages/commons/CommonsThread.tsx`, `src/components/commons/NoteCard.tsx`, `.../HelpedMark.tsx`, `.../AcceptedNote.tsx` *(new)*
Ask/work header (serif title, structured ask fields rendered as labeled blocks, work link-embed card — no iframe autoload), notes list, note composer; HelpedMark tappable only by thread author (RPC-guarded; champagne tick + settle animation on `springs.glide` — the screen's one champagne moment); when helped: the note renders into the AcceptedNote slot inline at top ("This helped · {name}"), ledger status flips OPEN→ANSWERED (cache update); author can post a resolution close ("posted the revision") → status `resolved`, credits line. First-note tag: a reply to a zero-note thread carries the quiet mono `FIRST NOTE` tag permanently (Direction-A absorb).
**Edge cases:** multiple helped marks allowed (all render, first-marked sits the slot); non-author helped tap → error toast, no state change (adversarial); deleted thread ("This was taken down."); win/resource/post kinds hide ask machinery.
**Acceptance:** helped flow works only for author fixture; settle animation ≤400ms, reduced-motion instant; status flip visible on home without refetch (cache write); axe clean.

### M1-T3 — Composer: structured asks, easy everything else (`tier: 2`)
**Files:** `src/components/commons/CommonsComposer.tsx`, `.../AskComposer.tsx` *(new)*, mount in `CommonsHome.tsx` *(sequential lane with M1-T1, same builder)*
Kind picker (5 kinds, flair-styled); `ask` opens the 3-field walk (what I'm making · where I'm stuck · what would help — field 1 required, 2–3 encouraged with ghost examples); `work` = link/image + asks chips (free text, ≤3, uppercase-normalized); topics picker (≤2 from R-C4 set); focus choreography (lift + champagne Post on non-empty — the P4-T8 spec, absorbed); optimistic prepend; `confirm(true)` haptic.
**Edge cases:** double-submit disabled; muted user → "You can't post right now."; paste non-URL in work link → inline `role="alert"`; draft survives accidental blur (state, not storage).
**Acceptance:** ask rows created with structured fields server-side (verify row); labels on all fields (axe); ≥44px everything; zero `querySelector` hacks (grep).

### M1-T4 — Commons notifications (`tier: 2`)
**Files:** `supabase/migrations/<ts>_commons_notify_triggers.sql` *(new — mirrors `20260611120000_comment_notification_trigger.sql`)*, `src/components/NotificationDropdown.tsx` *(type-map lines only)*
Server triggers: note on your thread; helped mark on your note; first-note on your ask (distinct copy: "{name} left the first note"). Volume caps: max 1 unread per thread (upsert), digest-first defaults; no push (rides Phase-8).
**Acceptance:** SQL tests per trigger; self-reply → none; cap holds under 5 rapid notes.

---

# PHASE M2 — Status, moderation & induction ⛔ FROZEN until pick
**Sequencing:** T1/T2 parallel → T3.

### M2-T1 — Helped identity + monthly honor (`tier: 2`) — **R-C3**
**Files:** `src/components/commons/HelperLine.tsx` *(new)*, `src/pages/ProfilePage.tsx` *(one section — coordinate with design-vision P4-T10 owner)*, `supabase/migrations/<ts>_commons_helper_stats.sql` *(view only)*
A `commons_helper_stats` view (helped count, first-notes count, 90d window); profile section "In the Commons" (member number, helped line "{n} notes helped someone", wordmarks); masthead monthly line from month 2 ("This month, {name}'s notes helped the most people") — admin-triggered, not automatic, first cycle.
**Edge cases:** zero activity (section shows member number only — identity without shame); ties (earliest wins, admin picks).
**Acceptance:** stats view matches fixtures; zero numeric scores outside the profile line (visual audit); no leaderboard route exists.

### M2-T2 — Moderation queue (`tier: 2`)
**Files:** `src/components/admin/commons/ModerationQueue.tsx`, `src/pages/admin/AdminCommons.tsx` *(new)*, `src/App.tsx` *(route line)*
Report → queue → dismiss / soft-delete / mute (7/30d) → `commons_mod_log`; member-side report action on every post/note (sheet, reasons list); admin register (mono/amber — do NOT restyle to student brand).
**Edge cases:** report on deleted subject (auto-resolve); double-mute extends.
**Acceptance:** full loop on fixtures; muted fixture's `commons_can_post` false (SQL verify); mod actions logged.

### M2-T3 — Induction: the first note ritual (`tier: 2`)
**Files:** `src/components/commons/InductionCard.tsx` *(new)*, `CommonsHome.tsx` *(slot — lane with M1-T1 owner)*
New member (<14d, zero posts/notes): one card above the deck — "You're in, {first name}." + ONE action: "Leave your first note" → deep-links the oldest zero-note open ask (the give-first activation, transferred from the old C3-T3 with the intro-thread mechanic swapped for a help-first mechanic — better fit for a commons). Dismissible; never returns after first contribution/dismissal.
**Acceptance:** shows exactly for new+silent fixture; disappears on contribution; `commons_first_contribution` event fires.

---

# PHASE M3 — This-week strip, digest & cutover ⛔ FROZEN until pick
**Sequencing:** T1/T2 parallel → T3 → T4.

### M3-T1 — This Week strip (`tier: 2`)
**Files:** `src/components/commons/ThisWeekStrip.tsx` *(new)*, `CommonsHome.tsx` *(slot — lane owner)*
The calm survivor of the old programme idea: one horizontal strip under the masthead when (and only when) there are dated things — upcoming public events (existing `events` table), a workshop, an admin-pinned prompt. Zero rows = strip absent (never an empty shell). No per-craft programming dependency.
**Acceptance:** renders only with data; rows ≥44px; strip absence leaves no layout hole.

### M3-T2 — Weekly digest email (`tier: 2`) — **R-C7-adjacent, recommend YES**
**Files:** `supabase/functions/commons-digest/index.ts` *(new)*, `<ts>_commons_digest_cron.sql`
Sunday 6pm IST via existing `queue-transactional-email`: your threads' new notes, 3 open asks in your topics, the week's best-helped note (C's pull-quote absorbed, weekly not daily). One email/week hard cap; unsubscribe bool; zero-content = zero send.
**Acceptance:** dry-run HTML for 5 fixtures attached to PR; double-cron sends 0; unsubscribe honored.

### M3-T3 — Analytics events (`tier: 3`)
**Files:** `src/lib/analytics.ts` *(extend track())*
Eight: `commons_opened`, `commons_ask_posted`, `commons_work_posted`, `commons_note_left {isFirst}`, `commons_helped_marked`, `commons_ask_resolved`, `commons_filter_used {kind,topic}`, `commons_first_contribution`. North-star **Weekly Contribution Rate** + time-to-first-note derive server-side from tables (the old §7 metrics transfer intact, minus per-house splits).
**Acceptance:** visible in sink on scripted walk; no PII beyond session user id.

### M3-T4 — Cutover: retire the old feed (`tier: 1` — routing + data truth, council)
**Files:** `src/App.tsx` *(flag default)*, `src/pages/CommunityPage.tsx` *(becomes redirect shim)*, `src/lib/flags.ts`
Preconditions: M0 copy verified; M1 gate-passed; delta copy re-run for posts made since; **cohort-scoped posts handled by rooms R3-T3 — verify both cutovers don't strand a row class (joint checklist in `docs/commons-runbook.md`)**; Rahul device pass. Flip flag; shim; staged native rollout; rollback = flag off (old page reads old tables, still intact).
**Acceptance:** zero writes to `community_posts` after cutover (48h audit); old deep links land on v2; rollback rehearsed.

---

## Phase summary

| Phase | Name | Tasks | Tier-1 | Blocked on direction pick? |
|---|---|---|---|---|
| M0 | Schema & backbone | 4 | 3 | **No** — direction-agnostic, can council alongside rooms R0 |
| M1 | Exchange surfaces | 4 | 1 | **Yes** (written for B; A/C variants would rewrite T1 only — T2/T3/T4 survive any pick ~80%) |
| M2 | Status & moderation | 3 | 0 | Yes (mildly — M2-T2 moderation is pick-agnostic and could pull forward) |
| M3 | Strip, digest, cutover | 4 | 1 | Yes |
| **Total** | | **15** | **5** | |
