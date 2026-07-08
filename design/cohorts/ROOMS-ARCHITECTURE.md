# Cohort Rooms — Architecture
### Every cohort is its own room: one component tree, config-driven theming, per-cohort feature levels, entitlement-gated membership
*Authored 2026-07-08 on `design/phase-6`. Companions: `COHORT-LOGIC.md` (the as-is), `ROOMS-BACKLOG.md` (the build), `migrations-draft/` (DRAFT SQL — NOTHING applied; all of it 🔴 Tier 1 per CLAUDE.md: council + adversarial suite + Rahul written sign-off before anything moves to `supabase/migrations/`).*

**The product sentence:** entering a cohort = crossing into ITS room. The room carries the cohort's identity (art, accent, wordmark), its feature set (only the modules that cohort runs), and its people (the roster, entitlement-derived). The community (see `design/community-v2/`) is the shared commons outside; **specificity, exclusivity and theming live HERE.**

**The engineering sentence:** one component tree + one config row per cohort. A new cohort with its own look and feature level costs Rahul one `cohort_room_configs` insert and zero deploys.

---

## 1. Design goals (ranked)

1. **Theming without forking** — per-cohort identity is data (tokens + art), never code. No `if (cohort === 'bfp')` anywhere, no per-cohort components, no per-cohort CSS files.
2. **Feature levels without forking** — modules toggle per cohort from config; the room renders only what's on. The AI cohort can run leaderboard+demo-day while the Filmmaking cohort runs dailies-style assignments only.
3. **Leak-proof multi-cohort** — a member of room A must be structurally unable to read room B's announcements/resources/roster. Same doctrine as the community backbone: scope on containers, membership server-derived, RLS checks one indexed table.
4. **Perf budget intact inside rooms** — theming is CSS-variable scoping (zero runtime cost), hero art rides the existing `ArtworkImage` discipline, motion stays on `src/lib/motion.ts` tokens, NO new `backdrop-filter`, reduced-motion everywhere. A themed room must scroll at 60fps on mid-range Android exactly like the rest of the app.
5. **The pipeline is untouched** — application → staged payments → enrolment → batch keep working byte-for-byte. Rooms are a *delivery* layer on top of the existing tables; `ApplicationStatus.tsx`'s `isIOS()` guard is sacred.

---

## 2. What survives from the rejected community design — said explicitly

The community *product* (houses per craft, editions, doors, the Programme) is dead per Rahul. Three pieces of `design/community/ARCHITECTURE.md` were architecture, not product, and they survive **into the cohort-rooms backbone**:

1. **The entitlement mapping-table pattern** (§3 there): rules table + materialized membership + resolver triggers on `enrolments` / `cohort_batch_members` / `cohort_applications` + nightly reconcile. Rooms reuse the identical shape (simplified: the only destination is a room). This was the crown jewel and it still is.
2. **The leak-proofing invariants** (§5 there): scope lives on containers; every content SELECT routes through ONE helper (`cohort_room_can_access()` here); membership table takes no client writes; SECURITY DEFINER RPCs assert access first; counters trigger-maintained. The adversarial-suite QA lens (LEAK_CANARY greps, write-attack matrix) transfers verbatim to `qa-harness/cohort-room-access.spec.mjs`.
3. **The alumni insight** (§5.4/STRATEGY §3.4 there): *rooms are never deleted; alumni keep them.* An ended cohort's room flips to `alumni` phase — read+post stays open, live modules retire. The longest-tail value of a cohort is the network it mints.

Killed with the rest: editions/doors/teases inside community, craft houses, the programme-guide home. (FOMO now lives where it's honest: the offering page sells the room; the room doesn't tease outsiders — outsiders never see it.)

---

## 3. The container model

```
offerings (payment_mode='staged')          ── the product (pipeline unchanged)
  └─ cohort_batches                        ── the delivery group (existing)
       └─ cohort_room_configs  (NEW, 1:1 offering, optional batch override)
            ├─ theme jsonb                 ── the skin
            ├─ modules jsonb               ── the feature level
            └─ phase                       ── pre_start → live → wrap → alumni
       └─ cohort_room_members  (NEW, materialized entitlements — the ONE table RLS reads)
       └─ content tables (NEW): cohort_announcements, cohort_resources,
          cohort_room_posts (feed), + existing cohort_weeks/sessions/submissions/attendance
```

- **Config keys on `offering_id`** (the room is the program), with `batch_id NULL` = applies to all batches. A batch-level override row exists for the rare "Batch 2 gets a different accent" case; resolution = batch row else offering row. *(Justification: Rahul thinks in programs; batches are scheduling.)*
- **Membership derives, never claimed:** `cohort_room_members` is written only by the resolver (triggers on `cohort_batch_members` INSERT/DELETE, `enrolments` status changes, `cohort_applications` status changes for the pre-start lobby rule, config changes) + nightly reconcile. Roles: `member` (batch member), `mentor`/`host` (manual admin grant), `alumni` (auto on phase flip — membership survives, role renames).
- **Phase is the room's clock:** `pre_start` (enrolled, weeks not begun — the induction window that today shows *nothing*), `live` (weeks running), `wrap` (last week done → demo day/certificates window), `alumni` (forever). Modules can declare phase visibility (e.g. `demo_day` only in wrap+alumni).

## 4. Theming without forking — the `theme` config

### 4.1 Schema (inside `cohort_room_configs.theme` jsonb, validated by CHECK + admin UI)

```jsonc
{
  "accent_h": 258, "accent_s": 90, "accent_l": 66,   // ONE accent hsl triple (required)
  "accent_text_l": 74,                                // lightness override for small text (the --accent-*-text pattern from index.css:254-290)
  "hero_url": "https://…/bfp-hero.webp",              // landscape room art (same asset class as the offering poster)
  "wordmark_text": "BREAKTHROUGH FILMMAKERS",         // mono, tracking-widest — the room's nameplate
  "monogram": "BF",                                    // crest fallback when hero absent
  "texture": "grain" | "none",                        // grain = the existing ≤4% film-grain util; NOTHING else in v1
  "tagline": "Twelve weeks. One film."                // serif-italic line under the nameplate
}
```

**Hard rules (enforced by the admin editor + QA lens, not trust):**
- One accent per room. Champagne/cream stays the *system's* voice (CTAs, helped-marks); the room accent colors identity surfaces only: nameplate, progress strip, week numbers, module eyebrows, the switcher chip. *(This is the "album art" move: the album changes, the player doesn't.)*
- Accent must pass ≥4.5:1 on `--canvas` for text usages — the admin editor computes and refuses (the `--accent-violet-deep` darken/lighten precedent at `index.css:254-298`).
- `hero_url` rides `ArtworkImage` (aspect enforcement, scrim, branded placeholder, blur-up). Budget: one hero image per room screen, ≤120KB webp target, lazy below-fold.
- No custom fonts, no per-room motion, no backdrop-filter, no full-bleed video. Texture is the one licensed flourish and it's the existing grain util.

### 4.2 How it lands on the token system

A single `RoomThemeProvider` at the room route boundary (`/room/:slug` subtree) renders one wrapper div:

```tsx
<div data-room-theme style={{
  "--room-accent": `${h} ${s}% ${l}%`,
  "--room-accent-text": `${h} ${s}% ${textL}%`,
} as CSSProperties}>
```

- Everything inside uses `hsl(var(--room-accent))` / `--room-accent-text`; **`src/index.css` gains only the two var *defaults*** (`--room-accent: var(--cream)`-equivalent fallback declared on `:root` in ONE Tier-1-reviewed addition) so components render sanely outside a provider. No global token changes, no html/body edits, no descendant selector magic.
- CSS-var scoping is inherit-only — it cannot leak upward or across routes; unmounting the provider restores the base system instantly. Zero runtime theming cost (no context re-renders for style; the style object is static per config fetch).
- Reduced-motion, spring tokens, 44px floor, hover-gating (`fine-pointer`-only hovers) apply inside rooms unchanged — the provider adds *variables*, never behavior.

## 5. Feature levels — the `modules` config

`cohort_room_configs.modules` jsonb — the per-cohort feature matrix. The room shell reads it once (in the room RPC envelope) and renders only enabled modules, in a fixed canonical order (config toggles, it does not reorder — one less way to make a mess).

| module key | Surface it turns on | Backing data | Default |
|---|---|---|---|
| `weeks` | Weekly spine: This Week hero, week list, progress strip | `cohort_weeks` (existing) | ON |
| `sessions` | Doors-open states, countdown, join, schedule view, ICS export | `live_sessions` (existing) | ON |
| `recordings` | The Screening Shelf: recordings library with resume | `live_sessions.recording_url` (existing, unsurfaced) + `cohort_recording_progress` (new) | ON |
| `assignments` | Submission + mentor feedback loop | `cohort_week_submissions` (existing) | ON |
| `peer_review` | PeerReviewBoard lane + peer gallery | `peer_review_assignments` (existing) | ON |
| `announcements` | Mentor/host noticeboard (append-only) + notification fan-out | `cohort_announcements` (new) | ON |
| `feed` | Cohort-mates' async feed (posts/questions/wins) | `cohort_room_posts` (new; supersedes the `community_posts.cohort_batch_id` scope-toggle) | ON |
| `resources` | Files/links library per week or pinned | `cohort_resources` (new) | ON |
| `roster` | Who's in the room: names/avatars/cities, mentor cards | `cohort_room_members` + `public_user_profiles` | ON |
| `leaderboard` | Calm standings (submission streaks, helped counts) | derived view | **OFF** (R-D3) |
| `demo_day` | The finale: showcase gallery + event | `cohort_demo_entries` (new) + a `live_sessions` row | OFF until wrap |
| `certificates` | Eligibility chip + issuance surface | existing certificate system | ON |

- **New cohort = one config row.** `INSERT INTO cohort_room_configs (offering_id, theme, modules) VALUES (…)` — members auto-place from the batch roster via the resolver; every module reads existing-or-new tables scoped by batch. Zero new code.
- Modules the config disables are ABSENT (not locked-teasers) — inside a room you either have a thing or the room simply doesn't do that. FOMO mechanics do not exist inside rooms.
- Module flags are UX; **RLS never reads them** (a disabled feed's table simply has no rows for that room — but access, if rows existed, would still be membership-gated). Security never depends on a jsonb flag.

## 6. Membership & multi-cohort

### 6.1 The resolver (the surviving crown jewel, simplified)
`cohort_room_members (user_id, offering_id, batch_id, role, source, status)` with a covering unique index — the one table every room RLS policy reads (one indexed EXISTS, same perf doctrine as the community draft).

Writers (server only; `authenticated` gets SELECT-own, zero INSERT/UPDATE grants):
1. Trigger on `cohort_batch_members` (INSERT/DELETE) → resolve that enrolment's user.
2. Trigger on `enrolments` (UPDATE OF status) → revoked/refunded exits the room automatically.
3. Trigger on `cohort_applications` (UPDATE OF status) → **pre-start lobby rule (R-D2)**: `accepted/confirmation_paid/balance_paid` may grant `pre_member` access to the room's lobby-limited view before full payment/batching. Default OFF (enrolled-only) pending Rahul.
4. Manual grants RPC → mentor/host rows (`source='manual'`, resolver never touches them).
5. `cohort_room_reconcile()` nightly (pg_cron, mirrors `cohort_notify_cron` pattern) — drift self-heals.

### 6.2 Multi-cohort surfaces
- **`useMyCohorts()`** replaces `useActiveCohort()`'s `.find()`: one RPC `get_my_cohort_rooms()` returns every room (offering, batch, phase, theme accents, next-thing-due, unseen-announcements count) in one round-trip. Kills the 3-query waterfall and the single-slot bug in the same move.
- **Nav:** the sidebar/tab slot becomes "My Cohorts" when count > 1 (singular room name when exactly 1 — most members, most of the time, see their one room's name, not a generic label). Shows even in `pre_start` phase (fixes the enrolled-but-invisible window).
- **My Cohorts surface:** a room-picker screen (`/rooms`) of theme-accented room cards (nameplate, phase, "Week 4 of 12", next session countdown). Also the alumni shelf — ended rooms sit below live ones.
- **Room switcher:** inside a room, the nameplate is a menu (when >1 membership) — switch rooms without visiting `/rooms`. 44px, `springs.snap`, remembers last room per session (`lu_last_room`).
- **Deep links:** `/room/:offeringSlug` (canonical) with sub-routes `/room/:slug/weeks/:n`, `/room/:slug/screenings`, `/room/:slug/feed`, `/room/:slug/people`. `/cohort/:offeringId` becomes a redirect shim (old notification emails keep working — the templates link `/cohort/{{offering_id}}`).

### 6.3 RLS drafts (in `migrations-draft/` — DRAFT, Tier 1, council + Rahul sign-off)
- `0001_cohort_room_configs.sql` — config table; member/admin read (theme is not secret but is not public either), admin write.
- `0002_cohort_room_members.sql` — membership + resolver + triggers + reconcile; SELECT-own only.
- `0003_cohort_room_content.sql` — announcements/resources/posts/recording-progress/demo entries; every SELECT routes through `cohort_room_can_access(offering_id, batch_id)`; posting policies (announcements = host/mentor/admin only, append-only; feed = members; demo entries = own).
- `0004_cohort_room_rpcs.sql` — `get_my_cohort_rooms()`, `get_cohort_room(p_offering)` (the one-round-trip room envelope: config + phase + this-week + next session + counts), `get_room_roster(p_offering)`; all SECURITY DEFINER, all assert access first.
- Cross-room leakage is structurally impossible: content rows carry `(offering_id, batch_id)` FK'd to real containers; membership is the only path in; the adversarial suite (write attacks + LEAK_CANARY greps as outsider/other-room-member fixtures) is a blocking QA lens from R0 onward.

---

## 7. The room experience — what world-class feels like

**The spine is the week.** Everything else hangs off "what does this week ask of me": the session(s), the assignment, the deadline, the feedback loop. On Deck/Maven get this right — the member never has to *assemble* their week from scattered surfaces.

The seven moments the room must nail:
1. **Crossing the threshold** — route transition into the room swaps the accent vars + hero; the nameplate + tagline render like a title card. Cheap (one wrapper, transform/opacity entrance on `springs.glide`) but it *reads* as entering somewhere.
2. **The weekly rhythm** — This Week front and center: theme as a serif headline, session slot(s) with live time-state, assignment slot with due-state, feedback slot. The week list below is the season's spine.
3. **Doors open in 12 minutes** — session states: `scheduled` (date + Add to calendar ICS) → `T-24h` (tonight, time) → `T-60m` (countdown + join enabled early) → `live` (crimson LIVE treatment + join) → `ended` (recording-pending) → `recorded` (play, with resume). The join link appears at T-60 *with* a countdown instead of appearing from nothing.
4. **Recordings that resume** — the Screening Shelf: every session's recording as a poster row; `cohort_recording_progress` stores position; "Continue watching" surfaces the half-watched one. (Closes the email promise the product currently breaks.)
5. **Submission → feedback as a loop, not a form** — submit, see status travel (submitted → under review → reviewed), read feedback in place, resubmit on `needs_revision`; peer lane beside it. Mostly exists — the room re-stages it and adds the missing notification surfaces.
6. **People in the room** — roster with faces/cities/crafts, mentor cards at top; "3 cohort-mates submitted today" quiet presence lines (derived counts, no realtime in v1).
7. **The third act** — wrap phase: demo-day gallery (each member's final work as an entry), the certificate moment, then the alumni flip ("This room stays open. You keep it.").

### 7.1 Two named directions for the room UI

**Direction R-A — "Season One" ★ RECOMMENDED**
The cohort as a limited series and the member is *in* it. The room home is the season page: hero art with nameplate lockup (title-card treatment), "WEEK 4 OF 12" as the season progress, This Week as the *now-airing episode* (serif episode title = week theme), weeks list as an episode rail (watched/current/upcoming states), the Screening Shelf for recordings, Demo Day staged as "the finale" from week 1 (a dated slot at the end of the episode rail — anticipation without FOMO mechanics). Sessions are *airings*; the doors-open countdown is the "starts in 12:00" slate.
*Why it wins:* it's the most literal continuation of the private-screening-room brand into the flagship; album-art theming is native to it (every season has its own art — that IS the metaphor); it gives the arc a shape (episodes → finale) which is exactly the missing third act; and it maps 1:1 onto `cohort_weeks` + `live_sessions` with zero exotic UI. Passes the AI-slop test because the metaphor is structural (episode states, airing times, finale slot), not a costume.

**Direction R-B — "The Callboard"**
The room as a working production's callboard: operational, dense, today-first. Home is a board — TODAY block (session time, due-tonight), THIS WEEK block, pinned announcements as tacked notices, roster as the crew list, resources as the binder. Mono-heavy, document-like register.
*Why not:* it optimizes for the 10% operational glance at the cost of the 90% emotional job (feeling like you're *in something special you paid ₹40k for*); it reads closer to a SaaS dashboard — the thing DESIGN-STRATEGY.md explicitly positions against; and its density fights 360px. **Absorbed into R-A:** the today-first discipline (This Week hero always leads with the *next timed thing*), and the tacked-notice treatment for announcements.

**Recommendation: build R-A, "Season One,"** with R-B's today-first spine absorbed. One component tree; the direction is the register of the shell, not per-cohort code — every themed room is a different *season*, same player.

### 7.2 Perf & motion budget inside rooms (non-negotiable)
Transform/opacity only, tokens from `src/lib/motion.ts`; the ONE room-entrance sequence (title card) ≤600ms total and fully reduced-motion-collapsible; hero art lazy + `ArtworkImage`; countdowns tick via a single `setInterval` per room (not per card); no realtime subscriptions v1 (counts ride the room RPC's 60s react-query cache); feed paginates and ENDS; `grep backdrop-filter` delta = 0; scroll 60fps at 4× CPU throttle on the room home with hero + 12 weeks + shelf mounted.

---

## 8. RAHUL DECISIONS (defaults recommended)

| # | Decision | Recommended default |
|---|---|---|
| **R-D1** | Room communication: async feed + announcements only, or realtime chat? | **Async-only v1** (feed + append-only announcements). Chat is a moderation/presence/push surface WhatsApp already serves; the room wins on structure, not immediacy. Revisit post-launch with data. |
| **R-D2** | Pre-start lobby for `accepted`/`confirmation_paid` applicants (before full payment)? | **OFF** — enrolled-only. Warmth argument exists (community draft made it) but unpaid users inside the paid room muddies the seat-release story. The `pre_start` *phase* for enrolled members is ON regardless. |
| **R-D3** | Leaderboard module default | **OFF by default**, per-cohort opt-in. If on: submission streaks + helped counts, names not points — calm register. |
| **R-D4** | Theming authority | Admin editor with guardrails (contrast check, single accent, preset texture). Free-hex accent allowed; everything else constrained. |
| **R-D5** | WhatsApp coexistence | Keep `whatsapp_group_link` for logistics through at least one full cohort run; announcements + recordings + deadlines move in-app (the pull). Sunset per-cohort when a run completes with >60% weekly room engagement. |
| **R-D6** | Demo day visibility | Room-members + alumni only in v1. A public showcase page is a marketing surface — separate decision, separate program. |
| **R-D7** | Recording retention for alumni | Keep forever (alumni keep the Screening Shelf). Storage cost is VdoCipher/Zoom-link-side, not ours. |
| **R-D8** | Push notifications for room events (doors-open, feedback landed) | Ride the global Phase-8 push decision; rooms ship with in-app + existing email/WhatsApp cron. The doors-open moment is the strongest future push case — note it in the Phase-8 file. |
| **R-D9** | `/cohort/:offeringId` retirement | Redirect shim to `/room/:slug` (old emails keep working). Kill the shim only after templates are updated + one cohort cycle. |

## 9. Sequencing honesty

- **Starts now, independent of community-v2:** everything in this file. R0 (schema/config/membership drafts + council), R1 (shell/theming/My Cohorts), R2 (modules). The rooms program has zero dependency on the commons direction pick.
- **Coordinates with community-v2:** the `feed` module's post shapes (post/question/win + helped-mark) should share component DNA with the commons' post primitives — build rooms' feed AFTER the commons direction is picked (it's R3, naturally later) or accept a later unification pass. The old CommunityPage's cohort scope-toggle retires when rooms' feed ships (R3), not before.
- **Coordinates with design/vision phases:** P5-T7's token map touches `CohortDashboard.tsx` — rooms *replace* that page, so if rooms land first, P5-T7's cohort lines become moot; if P5-T7 lands first, harvest nothing (the room is new code on tokens from day one). P6-T2's react-query conversion of CohortDashboard is already merged on this branch — the room RPC hooks follow its exact shape.
