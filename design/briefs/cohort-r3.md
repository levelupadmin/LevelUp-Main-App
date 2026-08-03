# PHASE R3 — The people layer (round 1: announcements + roster)

**Branch:** `design/cohort-r3`, based on `design/cohort-r2`.
**Scope of THIS round: R3-T1 and R3-T2 only.** T3 (feed) and T4 (resources) are
deliberately NOT in this round — see "Why only two tasks" below.

## What this phase is

R0 built the room's tables, RLS and RPCs. R1 built the shell and routes. R2 built
the weeks and screenings modules. **R3 is the layer that makes the room stop
being single-player.** It is almost entirely CLIENT work: the data already
exists and is already access-controlled. Where this phase needs a server change
it is one trigger, not a schema.

The two module slots this round fills are already routed and already rendering a
placeholder. In `src/App.tsx` the routes `people` and `resources` and `feed` are
mounted through `RoomModuleRoute`, whose body renders
`{room.offering_title} · {title} opens here.` **That placeholder is the thing
being replaced for `people`.** Do not add routes; they exist.

## Why only two tasks in this round

The backlog sequences R3 as **T1/T2 parallel → T3 → T4**, and the other two carry
dependencies this round should not absorb:

- **T3 (feed)** — the backlog says its post primitives "should share DNA with
  community-v2's post components — build after the commons direction pick, or
  accept a later unification pass". That pick has not been made. T3 also does a
  one-off legacy copy out of `community_posts` and removes the old CommunityPage
  cohort scope-toggle, which touches a SHIPPED community surface. It deserves its
  own round and its own council.
- **T4 (resources)** — shares an `AdminCohorts.tsx` lane with other admin-cohorts
  work and is the sequential tail of T3.

## VERIFIED FACTS — every source below was checked on this branch today

Do not re-derive these, but DO challenge any you think is wrong. Three separate
surfaces in this project were once briefed against data sources that did not
exist, so these were verified before this brief was written:

- **`get_room_roster(p_offering)` EXISTS** in
  `supabase/migrations/20260729100200_cohort_room_rpcs.sql`, and its signature is
  `RETURNS TABLE (user_id uuid, full_name text, avatar_url text, occupation text,
  city text, role text)`. **There is no phone and no email in it**, by design, and
  the migration pins that projection in a comment. T2's grid renders exactly
  these columns and must not invent others.
- **`cohort_announcements` and `cohort_room_seen` both exist** in
  `20260729100100_cohort_room_content.sql`, with RLS routed through
  `cohort_room_can_access()`.
- **`AdminAnnouncements.tsx` EXISTS and is ALREADY batch-aware** — it filters on
  `.eq("cohort_batch_id", audienceId)` and separately resolves a course to its
  offerings. The backlog line "verify current shape first; if it's course-scoped,
  add an offering/batch target picker" is therefore ALREADY SATISFIED. **Do not
  rebuild the target picker.** Audit it, and only add what is genuinely missing.
- **`supabase/migrations/20260611120000_comment_notification_trigger.sql` exists**
  and is the shape T1's fan-out trigger mirrors.
- **`src/components/InitialsAvatar.tsx` exists** and is the avatar primitive.

## The inviolable rules

- **NFR-COPY-1** — the applicant's 100-word essay never reaches a client. It is
  in `cohort_applications.bio` and the raw submission is in `tally_data`. Neither
  belongs anywhere in this phase. **Grep BOTH names** before claiming a surface is
  clean; an earlier phase grepped one, missed the other, and certified wrongly.
- **MEMBER-1 — three tiers.** `accepted` has NO membership row and reads nothing.
  A `pre_member` gets masthead / this-week / presence / announcements-READ /
  schedule, and is DENIED curriculum detail, recordings, assignments, feedback and
  every community write. **The tier is enforced in RLS, not in the client** — the
  client may hide, but hiding is not the gate.
- **Roster privacy (ROSTER-SCOPE-1)** — no DMs, no follow, no profile drilldown in
  v1. The grid is a list of humans, not a social graph.
- **No em dashes** in any user-facing copy.
- Purchase UI on Android gates on `isNative()`, never `isIOS()`. Not obviously
  relevant here (no purchase UI in R3), but the rule stands.

## Task R3-T1 — Announcements: the noticeboard (`tier: 2`)

**Files:** `src/components/room/AnnouncementsModule.tsx` *(new)*,
`supabase/migrations/20260801120000_announcement_notify_trigger.sql` *(new)*

**Spec:** Pinned-first list under the masthead — accent-left-border card, author
plus role wordmark, relative date. Viewing writes the `cohort_room_seen`
watermark. A server trigger fans out ONE in-app notification per member per
announcement, **volume-capped: at most one unread per room, via upsert**, so a
mentor posting three times in an hour does not produce three unread badges.
Mentors and hosts post through an in-room composer; **RLS is the gate and the UI
merely hides the composer for members.**

Mirror `20260611120000_comment_notification_trigger.sql` for the trigger's shape.
The trigger runs on the announcements table, which hangs off the room — so it is
NOT on the money path, but the R0 lesson still applies: `EXCEPTION WHEN OTHERS`
does NOT trap `QUERY_CANCELED` (57014), so name the cancel codes explicitly if
you add a handler at all.

**Edge cases:** zero announcements ("Nothing on the board yet." in the serif);
an announcement with `batch_id NULL` across two batches notifies each member
exactly once, not once per batch.

**Acceptance:** a SQL test proving 1 announcement × N members = N notifications
and that a repeat post does not add a second unread while one is pending; a
member fixture sees no composer; the unseen dot on `/rooms` clears after view.

## Task R3-T2 — Roster: people in the room (`tier: 2`)

**Files:** `src/pages/room/RoomPeople.tsx` *(new)*,
`src/components/room/MentorCard.tsx` *(new)*,
`src/components/room/RosterGrid.tsx` *(new)*

**Spec:** Mentor and host cards on top — avatar, name, serif one-liner, `MENTOR`
wordmark. Then the member grid: `InitialsAvatar` or avatar, name, city,
occupation — **exactly the columns `get_room_roster` returns and nothing more.**
A count line in mono ("41 in this room").

This route currently renders `RoomModuleRoute module="roster" title="People"`,
the placeholder. Replace the placeholder for this slot only; leave `feed` and
`resources` on `RoomModuleRoute`, because their modules are not built yet and a
slot with no module must keep saying so.

**Edge cases:** 200+ members — window the list or paginate at 60, and MEASURE
rather than guessing which; a missing city or occupation hides that line rather
than rendering an empty separator; in an alumni room every derived member carries
the `ALUMNI` wordmark.

**Acceptance:** the adversarial suite still passes (`npm run test:room-access`
needs the local shadow — see `design/cohorts/HANDOFF.md` §10 for the recipe);
an outsider calling the RPC gets a raise, not an empty set; **no phone or email
appears in any response — assert the exact column list**; the grid holds 60fps at
4× CPU throttle.

## The gate

`npx vitest run && npm run build && npm run typecheck:functions`

`npm run typecheck:functions` is the ONLY thing that sees `supabase/functions/`.
And note that `npm run build` is a bare `vite build` with **no tsc**, so types
need their own check: `npx tsc --noEmit -p tsconfig.app.json` and compare the
error COUNT to `origin/main` — there is a pre-existing baseline of 8, so "no new
errors" is the bar, not "zero errors".

## Method

Cite a SYMBOL plus a grep that cannot go stale. **Never cite a bare line number**
— 23 citations across 15 files in this project once pointed at code that had
drifted, and reviewers verified unrelated lines. Verify every claim against the
actual file before asserting it.
