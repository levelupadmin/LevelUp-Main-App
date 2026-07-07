# LevelUp Community — Systems Architecture
### Communities → rooms → editions, on an entitlement-driven access model
*Companion to `STRATEGY.md` (the why) and `EXECUTION-BACKLOG.md` (the build). Draft SQL lives in `design/community/migrations-draft/` — **NOTHING in this folder is applied**. Everything touching RLS/auth/migrations is 🔴 Tier 1 per CLAUDE.md: council + cross-platform verify + staged rollout + Rahul sign-off before any of it moves to `supabase/migrations/`.*

---

## 1. Design goals (ranked)

1. **Leak-proof by construction** — a non-member must be *structurally unable* to read a gated edition's content: scope lives on containers, membership is server-derived, RLS checks one indexed table. No client-supplied scope anywhere.
2. **One-row expansion** — a new community, a new product line, or a new edition each costs Rahul one insert (plus optional seeding); members auto-place from existing purchase data.
3. **Real entitlement sources only** — membership derives from `enrolments`, `cohort_batch_members`, `cohort_applications`, `legacy_enrolments`, and explicit manual grants. Nothing is claimed client-side.
4. **Feed queries stay cheap on mid-range Android + Supabase** — denormalized counters, keyset pagination, one RPC round-trip per room open.
5. **Nothing breaks** — the current `community_posts` page keeps working untouched; new tables are net-new; migration copies (never moves) legacy content.

---

## 2. The container model

```
communities            "houses" — one per craft (filmmaking, writing, editing, content, AI, …)
  └─ community_editions    gated sub-communities: a Forge edition, a cohort batch,
  │                        a masterclass circle, an alumni circle
  └─ community_rooms       the ONLY posting surfaces. A room belongs to a community,
        │                  and optionally to one edition (which makes it gated)
        └─ community_threads → community_replies → community_reactions
```

- **A thread lives in exactly one room; a room carries the access scope.** Threads/replies have *no* community/edition columns — scope cannot be forged or drift. *(Justification: single source of scope = single place to secure.)*
- **Editions are children of communities** (a Forge Goa room lives inside Filmmaking) so teasing happens where the aspiration is. *(Justification: FOMO is adjacency — STRATEGY §3.4.)*
- **Rooms have kinds** (`lobby`, `noticeboard`, `dailies`, `wins`, `intros`, `custom`) and **posting policies** (`all` | `hosts`) — the noticeboard is append-only-by-hosts by policy, not by convention. *(Justification: structure defends against noise — STRATEGY §4.)*
- **The Commons** is just a community with an `all_members` entitlement rule — no special-case code. *(Justification: one mechanism, zero branches.)*
- Cross-community/edition integrity is enforced by a **composite FK** — `community_rooms (edition_id, community_id)` references `community_editions (id, community_id)` — so a room can never point at an edition of a different community. *(Justification: constraint beats trigger beats convention.)*

## 3. The entitlement engine (the crown jewel)

Two tables, one resolver:

### `community_entitlement_rules` — the mapping table (admin-written)
One row = "holders of source X are members of community Y (optionally edition Z) with role R".

| column | meaning |
|---|---|
| `source_kind` | `offering` \| `cohort_batch` \| `application_accepted` \| `legacy_alumni` \| `all_members` |
| `source_id` | offering id / batch id (NULL for `all_members` / `legacy_alumni`) |
| `community_id`, `edition_id` | the destination (edition nullable) |
| `member_role` | `member` \| `alumni` \| `host` \| `mentor` |
| `active` | rules can be retired without deleting history |

**Source semantics (all bind to real tables):**
- `offering` → active `enrolments` rows on that offering (covers masterclass purchases, cohort enrolments, admin grants, bulk imports, and migrated legacy buyers — `enrolments.source` already distinguishes them).
- `cohort_batch` → `cohort_batch_members` roster (via `enrolments.user_id`) — the edition-precise source for cohort/Forge batches.
- `application_accepted` → `cohort_applications.status IN ('accepted','confirmation_paid','balance_paid','enrolled')` on that offering — lets admitted students enter the edition room *before* full payment lands (a deliberate warmth move; revoked if withdrawn/rejected).
- `legacy_alumni` → `users.is_legacy = true` — the 74k TagMango base, for the Commons/Alumni Assembly.
- `all_members` → every non-deleted user.

### `community_members` — the materialized resolution (server-written only)
`(user_id, community_id, edition_id NULL, role, source_rule_id | 'manual', status)` with a covering unique index. All RLS checks read this one table.

**Why materialized instead of computing entitlements inside RLS:** feed RLS runs per-row; a live 4-way join (`enrolments → rules → editions → rooms`) per thread row is a Supabase perf trap at feed scale. A membership row lookup is one indexed EXISTS. *(Trade-off accepted: eventual consistency measured in milliseconds via triggers, plus a reconciliation function as a safety net.)*

**How rows get written (never by clients — RLS grants no INSERT to `authenticated`):**
1. **Trigger on `enrolments`** (INSERT / UPDATE OF status) → `community_resolve_user(user_id)` re-derives that user's memberships. Revocation/expiry removes derived rows in the same pass — *a revoked enrolment exits the room automatically*.
2. **Trigger on `cohort_batch_members`** (INSERT/DELETE) → same resolver (batch → enrolment → user).
3. **Trigger on `cohort_applications`** (UPDATE OF status) → same resolver.
4. **Trigger on `community_entitlement_rules`** (INSERT / UPDATE OF active) → `community_apply_rule(rule_id)` backfills or retracts memberships for *all* qualifying users in one statement.
5. **Manual grants** — admin RPC writes a row with `source_rule_id NULL, source 'manual'`; the resolver never touches manual rows.
6. **Reconciliation** — `community_reconcile()` (pg_cron nightly, and callable ad hoc) recomputes everything derived; drift between triggers and truth self-heals. *(Justification: triggers for freshness, reconciliation for certainty — belt and braces on a Tier-1 surface.)*

### The one-row expansion story (worked)
**New product line, existing community** — Rahul ships a "Screenwriting Masterclass" offering; it belongs in Writing AND Filmmaking (the many-to-many cross-map):
```sql
INSERT INTO community_entitlement_rules (source_kind, source_id, community_id, member_role)
VALUES ('offering', '<screenwriting-offering-id>', (SELECT id FROM communities WHERE slug='writing'), 'member'),
       ('offering', '<screenwriting-offering-id>', (SELECT id FROM communities WHERE slug='filmmaking'), 'member');
```
The rule trigger backfills every existing buyer into both houses; every future buyer lands via the enrolment trigger. Zero code, zero deploys. The same shape handles "Forge edition members also join the AI house" or any future mapping — **the mapping table IS the product-line→community many-to-many.**

**Community #6** — see §7.

---

## 4. Content model

### `community_threads`
`id, room_id, author_id, kind, title, body, media jsonb, crit_asks text[], work_url, status, is_pinned, reply_count, respect_count, last_activity_at, legacy_post_id, created_at, edited_at, deleted_at`

- `kind`: `post` | `dailies` (the crit format) | `win` | `question` | `drop` (noticeboard). *(Justification: the crit format is a first-class type, not a convention — STRATEGY §2.2.)*
- **Dailies fields:** `work_url` (the work), `crit_asks` (what feedback the author wants, ≤3 chips), `status open → resolved` (the "director's cut" loop close).
- Soft delete (`deleted_at`) — moderation removals are reversible and auditable.
- `reply_count` / `respect_count` / `last_activity_at` are trigger-maintained denormalized counters. *(Justification: kills the current page's 3-extra-queries-per-feed pattern.)*
- `legacy_post_id UNIQUE` — idempotent migration marker (§8).

### `community_replies`
`id, thread_id, author_id, body, timecode, parent_reply_id, helped boolean, legacy_comment_id, created_at, deleted_at`
- `timecode` (`"02:14"`) — timestamped crit notes on video/audio work.
- `helped` — settable **only by the thread author** (enforced in RLS via a dedicated UPDATE policy + trigger guard): the calm-luxury status currency.

### `community_reactions`
`(subject_kind 'thread'|'reply', subject_id, user_id, emote)` PK on all four; `emote` CHECK-constrained to a named palette (v1: `respect` only — expandable by widening the CHECK). *(Justification: constrained vocabulary is the anti-dopamine stance, enforced in schema.)*

### `community_programming`
`id, community_id, edition_id NULL, title, kind (crit_night|screening|challenge|ama|session|drop), starts_at, ends_at, location_kind (thread|live_session|workshop|external), ref_id, external_url, tease_visible, created_by`
- References existing `live_sessions` / `workshops` rows rather than duplicating scheduling. *(Justification: don't fork the calendar; the programme guide is a projection.)*
- `tease_visible = true` rows surface **title/time only** to non-members — the honest-FOMO mechanism.

### Moderation
- `community_reports` (subject, reporter, reason, status) — any member can report.
- `community_mutes` (community_id, user_id, muted_until, reason, actor_id) — host/admin scoped mute; checked by `community_can_post()`.
- Removals = soft-delete via admin/host UPDATE policies; `enrolment_audit_log` pattern reused as `community_mod_log`.

---

## 5. Access model & RLS (🔴 Tier 1 — draft only, council + Rahul sign-off required)

**Helper functions** (SQL, `STABLE SECURITY DEFINER SET search_path = public` — the house `is_admin()` pattern):

- `community_is_member(p_community uuid)` — EXISTS on `community_members` (community-scope row, status active).
- `community_can_access_room(p_room uuid)` — the single gate: room open → community membership; room edition-scoped → membership row with that `edition_id`. Admin passes via `is_admin()`.
- `community_can_post(p_room uuid)` — `can_access_room` AND posting policy (`all` vs `hosts` → role IN (host, mentor) or admin) AND no active mute.

**Policy matrix (every table `ENABLE ROW LEVEL SECURITY`; no `anon` access anywhere):**

| table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `communities` | authenticated, `status IN ('opening_soon','active')` or admin | admin | admin | admin |
| `community_editions` | authenticated (tease metadata is public-in-app **by design**; content never lives here) | admin | admin | admin |
| `community_rooms` | `can_access_room(id)` | admin | admin | admin |
| `community_members` | own rows, or admin | — (server functions only) | — | — |
| `community_entitlement_rules` | admin | admin | admin | admin |
| `community_threads` | `can_access_room(room_id)` AND `deleted_at IS NULL` (author sees own deleted; admin sees all) | `author_id = auth.uid()` AND `can_post(room_id)` | author (body/title/status, not `is_pinned`) or host/admin | soft-delete only (UPDATE) |
| `community_replies` | via parent thread's room check | `author_id = auth.uid()` AND `can_access_room` | author own body; **`helped` only via thread-author policy**; host/admin soft-delete | — |
| `community_reactions` | via subject's room check | own rows, subject accessible | — | own rows |
| `community_programming` | members full rows; non-members only `tease_visible` rows **through the `community_programme_teasers` view** (title/time/kind columns only) | admin/host | admin/host | admin/host |
| `community_reports` | reporter own + admin | any member on accessible subject | admin | — |
| `community_mutes` | admin + the muted user | admin/host RPC | admin | admin |

**Structural leak-proofing invariants (the QA gate's adversarial tests assert every one — EXECUTION-BACKLOG QA section):**
1. Content scope is only ever derived `thread → room → (community, edition)`; there is no client-writable scope column.
2. Every content SELECT policy routes through `community_can_access_room()` — one function to audit, one function to test.
3. Tease data lives in **metadata-only tables/views** (`communities`, `community_editions`, `community_programme_teasers`); no view ever joins content tables. Views are `security_invoker = false` SECURITY-DEFINER-style projections of safe columns only.
4. `community_members` accepts no client writes at all — the GRANT surface for `authenticated` is SELECT-only; all writes go through SECURITY DEFINER functions owned by `postgres`.
5. Counter columns are trigger-maintained; counters can therefore never disclose content the reader couldn't already see (they live on rows the reader passed RLS for).
6. The feed RPC (`community_get_feed`) is SECURITY DEFINER **with `community_can_access_room()` as its first statement** (assert-or-raise), mirroring the `secure_admin_rpcs` precedent — never trust "the client only calls it for rooms it can see".

## 6. Read path & performance (mid-range Android budget)

- **One RPC per room open:** `community_get_feed(p_room_id, p_before timestamptz, p_limit int DEFAULT 20)` returns threads + author (`public_user_profiles` join: name/avatar/member_number/occupation) + counters + `my_respect` in a single round-trip. Kills the current page's 4-query fan-out. Keyset pagination on `(is_pinned DESC, last_activity_at DESC, id DESC)` — no OFFSET. Pages **end** (STRATEGY §3.4): the RPC returns `has_more`; the UI renders a terminus, not an infinite scroll.
- **One RPC for the home surface:** `community_get_programme(p_user)` — user's houses + rooms-with-unseen-activity + happening-now + next-7-days programme + teased doors, one round-trip, cacheable 60s in react-query (rides Phase-6's data layer).
- **Indexes:** threads `(room_id, is_pinned DESC, last_activity_at DESC, id DESC) WHERE deleted_at IS NULL` (partial, matches the feed sort exactly); members `(user_id, community_id, edition_id)` UNIQUE covering; replies `(thread_id, created_at) WHERE deleted_at IS NULL`; reactions PK is its own lookup; editions `(community_id)`; programming `(community_id, starts_at)`.
- **Counters over COUNT(*):** `reply_count`/`respect_count` denormalized via `AFTER INSERT/DELETE` triggers — feed rendering does zero aggregate queries.
- **Realtime:** v1 ships **without** Postgres realtime subscriptions (RLS + realtime + editions is a leak-audit surface of its own); "happening now" freshness comes from the 60s programme cache. Revisit in Phase C4 with a dedicated council. *(Justification: FOMO from events doesn't need sub-second push.)*

## 7. The admin story — "Rahul adds community #6"

```sql
-- 1. The house (one call — creates the community + its default rooms:
--    lobby, noticeboard, dailies, wins, intros)
SELECT admin_create_community('photography', 'Photography', 'Light, frame, patience.');

-- 2. The people (one row per source — trigger backfills every existing holder)
INSERT INTO community_entitlement_rules (source_kind, source_id, community_id, member_role)
VALUES ('offering', '<photography-masterclass-offering-id>',
        (SELECT id FROM communities WHERE slug = 'photography'), 'member');
```
Optional in the same sitting: `admin_create_edition(...)` for a cohort batch, a host appointment (manual member row with role `host`), and programming rows for the first two rituals. The house shows as `opening_soon` (teased) until Rahul flips `status = 'active'` — the STRATEGY §5 launch gate is a status flip, not a deploy.

## 8. Migration path from today's feed (copy, verify, cut over — never move)

Today: `community_posts` (content_text, media_urls, course_tag_id, is_pinned, is_admin_post, cohort_batch_id, post_type) + `community_post_comments` (with parent_comment_id) + `community_post_likes`. All of it survives:

1. Seed the **Commons** community (+ rooms) and one edition per `cohort_batches` row that has posts (`admin_create_edition` per batch, entitled via `cohort_batch` rules).
2. Copy posts → `community_threads`: `cohort_batch_id IS NULL` → Commons *Open Floor* room; `cohort_batch_id` set → that batch-edition's lobby; `post_type='peer_review'`-adjacent content stays with its batch. `is_admin_post` → `kind='drop'` where pinned, else `post`. `legacy_post_id` makes the copy **idempotent and re-runnable**.
3. Copy comments → `community_replies` (`legacy_comment_id`), likes → `community_reactions('respect')` (PK dedupes).
4. Recompute counters; verify row counts + spot-check threads; **the old tables and page stay live and untouched** until the new UI reaches parity (Phase C2 exit), then the old page is retired behind a redirect. Rollback = flip the route back; no data was moved.
5. `PeerReviewBoard` (assignment peer crits) is NOT migrated — it stays a cohort-dashboard feature; the community links to it. *(Justification: it's coupled to `cohort_week_submissions`, works today, and forcing it into threads risks a live cohort surface.)*

## 9. What deliberately does NOT exist

- **No DMs** — mentor-proximity promises stay honest (STRATEGY §3.4); WhatsApp already serves 1:1 (and DMs are a moderation/safety surface this team shouldn't carry yet).
- **No follower graph, no algorithmic ranking** — rooms + programme + pins are the only ordering. The feed is a place, not a machine.
- **No client-side entitlement checks as security** — UI gating is UX; RLS is the security boundary, always.
- **No per-post visibility options** — a post is as visible as its room, full stop. (Complexity here is where leaks breed.)
- **No native video upload v1** — link embeds + images only (R10).

## 10. Draft SQL index (`design/community/migrations-draft/` — DRAFT, NOT APPLIED)

| file | contents |
|---|---|
| `0001_community_backbone.sql` | containers, content, moderation tables; counters; indexes |
| `0002_community_entitlements.sql` | rules + members, resolver + backfill fns, source-table triggers, reconcile |
| `0003_community_rls.sql` | helper fns, every policy, grants, tease view, feed/programme RPCs |
| `0004_community_seed_and_migrate.sql` | admin RPCs, Commons seed, legacy feed copy (idempotent) |

Every file is headed with a DO-NOT-APPLY banner and its Tier-1 checklist. Apply order is 0001→0004, in one release train, after council + Rahul sign-off, against a fresh backup, with `migration list` verified per CLAUDE.md.
