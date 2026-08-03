#!/usr/bin/env node
/**
 * qa-harness/cohort-room-access.spec.mjs — the R0 adversarial access suite.
 *
 * THIS FILE IS THE SIGN-OFF ARTIFACT. It is what proves one cohort's private
 * content cannot leak to another cohort's students. Nothing else in phase R0
 * proves that: the migrations describe the wall, this suite attacks it.
 *
 * Authority: design/cohorts/docs/05-ACCESS-SECURITY.md §7 (the case matrix),
 * MEMBER-1 / ROSTER-SCOPE-1 / CHANNEL-KEY-1 / NFR-CONFIG-2, and the R-4 brief in
 * design/briefs/cohort-r0.md.
 *
 *   ONE COMMAND:  npm run test:room-access        (exit 0 = the wall holds)
 *
 * HOW IT ATTACKS
 *   Every read and write below is a REAL HTTP request to PostgREST carrying a
 *   REAL user JWT minted by GoTrue — not a `SET ROLE` simulation. That matters:
 *   table GRANTs, RLS policies, SECURITY DEFINER asserts and the PostgREST
 *   surface itself are all in the path, so a hole in any one of them shows up.
 *   Every response body is retained verbatim in a per-actor corpus, and the
 *   canary greps run over that whole corpus at the end — a leak through any
 *   surface, including one this suite never thought to name, is still caught.
 *
 * WHAT IT NEEDS (shadow project only — the prod ref is refused outright)
 *   SUPABASE_PAT            Management-API PAT (SQL channel: fixtures + introspection)
 *                           — SUPABASE_ACCESS_TOKEN is read as a fallback
 *   ROOM_QA_PROJECT_REF     the SHADOW project ref
 *                           — SUPABASE_SHADOW_REF is read as a fallback
 *   optional: ROOM_QA_ANON_KEY / ROOM_QA_SERVICE_KEY (else fetched via the PAT)
 *   optional: ROOM_QA_KEEP=1 to leave the fixture world in place for inspection
 *   optional: ROOM_QA_DIFF_BASE (default "main") for the Delta-6 copy grep
 *
 * A SHADOW RUN, EXACTLY — FIVE SETUP STEPS (0–4) BEFORE THE RUN ITSELF (5), AND
 * THE FIRST TWO ARE THE ONES THAT GET SKIPPED. Every command below targets the
 * SHADOW database and never production (ivkvluezuiojovpotlyb); steps 0–3 are all
 * destructive — one empties the database, two write grants, one writes schema.
 *   0. If `supabase db push` has EVER run against this shadow, EMPTY IT before
 *      going any further — and NOT with `supabase db reset`:
 *        psql "$SHADOW_DB_URL" -v ON_ERROR_STOP=1 \
 *          -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' \
 *          -c 'DELETE FROM supabase_migrations.schema_migrations;'
 *      …or re-create the shadow project, which arrives in the same state.
 *      `supabase db reset` IS THE WRONG TOOL HERE and lands exactly the state
 *      this step exists to prevent: it drops the schema and then RE-APPLIES every
 *      migration in supabase/migrations/, so the nine tables R0 creates are back
 *      before step 1 ever runs. Step 1 arms `ALTER DEFAULT PRIVILEGES`, which
 *      Postgres consults at CREATE TABLE time and never again and cannot retrofit
 *      a table that already exists; step 2 is then a no-op because the migration
 *      ledger is full again too. The three steps below all succeed, change
 *      nothing that matters, and leave the state the PRECONDITION aborts on.
 *      The ORDER IS LOAD-BEARING IN BOTH DIRECTIONS: pg_default_acl rows are
 *      SCHEMA-SCOPED, so dropping schema public also drops step 1's arming. Any
 *      later `db reset` (or any other drop of public) silently un-arms a shadow
 *      that used to pass, and the recipe has to be re-run from step 0. The
 *      re-created schema also arrives with no USAGE for the client roles;
 *      SECTION A re-grants it in step 1, and the PRECONDITION checks it, so step 1
 *      is not optional after emptying the database.
 *   1. Arm the default privileges, BEFORE the schema exists:
 *        psql "$SHADOW_DB_URL" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql
 *      That file's hand-maintained SECTION A reproduces the platform's
 *      `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES`, which only affects
 *      tables created AFTER it runs — so it has to precede `db push` — plus the
 *      schema-level `GRANT USAGE ON SCHEMA public`, which step 0's DROP took away
 *      and without which every request is refused above the table ACL entirely.
 *      The -v ROOM_QA_SHADOW=1 marker is not decoration: the file refuses to run
 *      without it, because it permanently alters a database's grant model.
 *   2. Apply the three R0 migrations (20260729100000 / 100100 / 100200):
 *        supabase db push --db-url "$SHADOW_DB_URL"
 *      Nothing here applies them, and the fixture failure message decodes the
 *      SQLSTATE if they are missing.
 *   3. Run shadow-grants.sql AGAIN, after `db push`: its generated SECTION B
 *      grant loop skips every table that did not exist on the first pass, and
 *      those tables are created BY the migrations. Both passes are idempotent;
 *      the file is written to be run exactly this way.
 *   4. Export the five names above (values live in the vault, never here, never
 *      in a log line, and never in this file's output).
 *   5. `npm run test:room-access`. Exit 0 = the wall holds; exit 1 = a leak;
 *      exit 2 = it could not run at all, which is NOT a pass; exit 3 = --list.
 *   The suite creates and deletes its own auth users, plants canaries, revokes
 *   and re-grants an enrolment, and briefly arms a forced trigger failure. It
 *   is destructive by design and refuses the prod ref for exactly that reason.
 *
 *   STEPS 0, 1 AND 3 ARE NOT OPTIONAL HOUSEKEEPING. A database built purely from
 *   this repo's migrations grants the client roles almost nothing, and PostgreSQL
 *   checks the GRANT before it ever consults RLS — so every read attack in this
 *   file would be refused for the wrong reason and print the same word it prints
 *   when the wall holds. Worse, a shadow provisioned in the WRONG ORDER — step 3
 *   run without step 1 — looks fully granted while the nine tables R0 creates
 *   never received a destructive verb anybody could revoke, which makes the whole
 *   GRANT section and both §7 REVOKE blocks vacuous. The PRECONDITION section
 *   below refuses to run the suite in either state rather than hand back a green
 *   summary that means nothing.
 *
 * A NOTE FOR R1–R4 — live_sessions HAS NO BATCH DIMENSION
 *   The table hangs off course_id and reaches a batch only through
 *   week_id → cohort_weeks → cohort_batch_id. No policy on live_sessions can
 *   draw a batch boundary, so EVERY batch boundary in this phase is drawn in an
 *   RPC standing above tables that do not know batches exist — and the same
 *   root cause surfaces three times in this one diff (R8.2's envelope
 *   predicate, GAP-2's table read + link RPC, GAP-3's progress lateral). Every
 *   new surface R1–R4 puts over live_sessions needs its own hand-written
 *   scoping and its own case here; nothing underneath it will scope for you.
 *   It has no TIER dimension either — the April policies on it ask only "is
 *   there an ACTIVE enrolment for this offering?", which a staged lobby row
 *   satisfies while the room tier says pre_member. That is GAP-4.
 *
 * READING THE OUTPUT
 *   Every line states WHAT IT PROVES, not that something passed. A green run is
 *   a paragraph of security claims you can hand to the council verbatim.
 *
 *   PASS / FAIL are the wall R0 owns. A third verdict, CARRIED, exists for a
 *   hole this suite MEASURES in a wall R0 does not own — a pre-existing policy
 *   on a table outside the room-content set. A carried gap keeps the exit code
 *   at 0 (R0's own wall is intact) but is reprinted in full above the verdict
 *   and is raised as a finding by the design-qa-gate lens, so "green" never
 *   quietly means "nothing left to fix". If the residue grows past its stated
 *   boundary it stops being carried and fails like any other leak; if it is
 *   closed, the run says so and tells you to retire the entry.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

// ── The canaries. Planted by cohort-room-fixtures.sql, hunted for here. ──────
//
// THE RULE THIS MAP OBEYS, AND THE THREE CHECKS THAT ENFORCE IT MECHANICALLY.
// A sentinel is planted only if a corpus that CAN ACTUALLY CARRY IT hunts it.
// Six used to fail that test — three were hunted over a corpus in which the
// surface carrying them was never queried, and three were planted and named
// nowhere in this file. A sweep that cannot fail is worse than a missing sweep:
// it prints the same word. Prose cannot police that, so all three halves of the
// rule are executable:
//   CANARY-LEDGER.1  every planted sentinel appears in at least one needle list
//                    that was actually swept;
//   CANARY-LEDGER.2  every sentinel reached the actor ENTITLED to it at least
//                    once, so "0 hits" cannot mean "never written";
//   CANARY-LEDGER.3  every sweep is REACHABLE — for each needle, at least one
//                    of its HOME SURFACES (CANARY_HOME below) was queried inside
//                    that sweep's own window. This is the check whose absence
//                    the 2026-07-28 review found: without it, re-adding the
//                    three unreachable needles that started all this to R9.1's
//                    list left both other ledger cases printing PASS.
// proveCorpusClean() fails the individual sweep too, so an unreachable needle is
// named where it was added rather than only in the aggregate at the foot.
const CANARY = {
  A1: "LEAK_CANARY_A1",
  A2: "LEAK_CANARY_A2",
  B1: "LEAK_CANARY_B1",
  ZOOM_A1: "LEAK_CANARY_ZOOM_A1",
  ZOOMNEAR_A1: "LEAK_CANARY_ZOOMNEAR_A1",
  ZOOMLIVE_A1: "LEAK_CANARY_ZOOMLIVE_A1",
  ZOOMCANCEL_A1: "LEAK_CANARY_ZOOMCANCEL_A1",
  ZOOM_A2: "LEAK_CANARY_ZOOM_A2",
  ZOOM_B1: "LEAK_CANARY_ZOOM_B1",
  CONFIG_A: "LEAK_CANARY_CONFIG_A",
  CONFIG_A2: "LEAK_CANARY_CONFIG_A2",
  REC_A1: "LEAK_CANARY_REC_A1",
  CURRIC_A1: "LEAK_CANARY_CURRIC_A1",
  CURRIC_A2: "LEAK_CANARY_CURRIC_A2",
  CURRIC_B1: "LEAK_CANARY_CURRIC_B1",
  ASSIGN_A1: "LEAK_CANARY_ASSIGN_A1",
  ASSIGN_A2: "LEAK_CANARY_ASSIGN_A2",
  ASSIGN_B1: "LEAK_CANARY_ASSIGN_B1",
  FEEDBACK_A1: "LEAK_CANARY_FEEDBACK_A1",
  MENTORDOC_A1: "LEAK_CANARY_MENTORDOC_A1",
  ATTEND_A1: "LEAK_CANARY_ATTEND_A1",
  PII_A1: "LEAK_CANARY_PII_A1",
  PII_A2: "LEAK_CANARY_PII_A2",
  // Two surfaces have no text column to hide a word in, so their sentinel is an
  // absurd instant instead. Rendered UTC by PostgREST (Supabase pins the
  // connection TimeZone), and just as greppable as a word.
  SEEN_A1: "2011-11-11T11:11:11",     // cohort_room_seen.seen_at
  RECPROG_A1: "2012-12-12T12:12:12",  // cohort_recording_progress.updated_at
};

/**
 * WHERE EACH SENTINEL LIVES — the reachability map, and the thing that makes a
 * sweep falsifiable.
 *
 * A surface is listed here if the sentinel is IN the data that surface reads,
 * so a broken wall could hand it over. A sweep whose window never queried any
 * of a needle's homes could not have found it however wide the hole was, and
 * proveCorpusClean() now FAILS on that rather than printing a pass.
 *
 * Two deliberate absences, both load-bearing:
 *   · live_sessions is NOT a home for any ZOOM_* sentinel. zoom_link carries a
 *     column-level REVOKE from `authenticated` (20260408151600) and no probe in
 *     this file projects it, so the link can only ever arrive through an RPC.
 *   · get_my_cohort_rooms carries the theme and an unseen COUNT — never an
 *     announcement body, never a link — so it is a home for the config pair only.
 * The token for a table probe is the path before '?'; for an RPC it is
 * `rpc:<function>`; both are stamped onto every corpus entry by record().
 */
const TEXT_SURFACES = [
  "cohort_announcements", "cohort_resources", "cohort_room_posts",
  "cohort_room_post_replies", "cohort_demo_entries", "cohort_weeks",
];
const CANARY_HOME = {
  // Batch/offering bodies: every content table, the envelope's announcements
  // block, and get_cohort_progress (which returns cohort_weeks.theme).
  A1: [...TEXT_SURFACES, "cohort_week_submissions", "rpc:get_cohort_room", "rpc:get_cohort_progress"],
  A2: [...TEXT_SURFACES, "rpc:get_cohort_room", "rpc:get_cohort_progress"],
  B1: [...TEXT_SURFACES, "rpc:get_cohort_room", "rpc:get_cohort_progress"],
  ZOOM_A1: ["rpc:get_live_session_zoom_link", "rpc:get_cohort_room", "rpc:get_cohort_progress"],
  ZOOMNEAR_A1: ["rpc:get_live_session_zoom_link", "rpc:get_cohort_room", "rpc:get_cohort_progress"],
  ZOOMLIVE_A1: ["rpc:get_live_session_zoom_link", "rpc:get_cohort_room", "rpc:get_cohort_progress"],
  ZOOMCANCEL_A1: ["rpc:get_live_session_zoom_link", "rpc:get_cohort_room", "rpc:get_cohort_progress"],
  ZOOM_A2: ["rpc:get_live_session_zoom_link", "rpc:get_cohort_room", "rpc:get_cohort_progress"],
  ZOOM_B1: ["rpc:get_live_session_zoom_link", "rpc:get_cohort_room", "rpc:get_cohort_progress"],
  CONFIG_A: ["cohort_room_configs", "rpc:get_cohort_room", "rpc:get_my_cohort_rooms"],
  CONFIG_A2: ["cohort_room_configs", "rpc:get_cohort_room", "rpc:get_my_cohort_rooms"],
  REC_A1: ["live_sessions", "rpc:get_cohort_room"],
  CURRIC_A1: ["cohort_weeks", "rpc:get_cohort_progress"],
  CURRIC_A2: ["cohort_weeks", "rpc:get_cohort_progress"],
  CURRIC_B1: ["cohort_weeks", "rpc:get_cohort_progress"],
  ASSIGN_A1: ["cohort_weeks", "rpc:get_cohort_progress"],
  ASSIGN_A2: ["cohort_weeks", "rpc:get_cohort_progress"],
  ASSIGN_B1: ["cohort_weeks", "rpc:get_cohort_progress"],
  FEEDBACK_A1: ["cohort_week_submissions", "rpc:get_cohort_progress"],
  MENTORDOC_A1: ["cohort_resources", "rpc:get_cohort_room"],
  ATTEND_A1: ["cohort_week_attendance"],
  PII_A1: ["users", "rpc:get_room_roster"],
  PII_A2: ["users", "rpc:get_room_roster"],
  SEEN_A1: ["cohort_room_seen"],
  RECPROG_A1: ["cohort_recording_progress"],
};
/** sentinel VALUE → the surfaces that could carry it. */
const HOME_OF = new Map(Object.entries(CANARY).map(([k, v]) => [v, CANARY_HOME[k] ?? []]));

/**
 * Everything private to offering A. No outsider may ever see any of it.
 *
 * ZOOM_A2 is deliberately IN this list and deliberately OUT of member_A1's
 * (below): it is offering-A private against the world, and cross-BATCH residue
 * inside offering A, which is GAP-2's territory rather than a pass/fail claim.
 */
const ALL_A_SECRETS = [
  CANARY.A1, CANARY.A2,
  CANARY.ZOOM_A1, CANARY.ZOOMNEAR_A1, CANARY.ZOOMLIVE_A1, CANARY.ZOOMCANCEL_A1, CANARY.ZOOM_A2,
  CANARY.CONFIG_A, CANARY.CONFIG_A2,
  CANARY.REC_A1, CANARY.RECPROG_A1, CANARY.SEEN_A1, CANARY.ATTEND_A1,
  CANARY.CURRIC_A1, CANARY.CURRIC_A2, CANARY.ASSIGN_A1, CANARY.ASSIGN_A2,
  CANARY.FEEDBACK_A1, CANARY.MENTORDOC_A1, CANARY.PII_A1, CANARY.PII_A2,
];

/**
 * ALL_A_SECRETS minus the five join links — the list for a window built ONLY
 * out of table probes. The links live behind an RPC (zoom_link is column-REVOKEd
 * from `authenticated`, so no table read in this file can project one), so
 * hunting them over a corpus of pure table reads is exactly the vacuity the
 * reachability check exists to stop. The run-wide sweeps at the foot of the
 * file, whose windows DO include the link RPC, carry them instead.
 */
const A_SECRETS_TABLE_BORNE = ALL_A_SECRETS.filter((n) => !n.includes("ZOOM"));

/**
 * What the TEN room-content surfaces in SURFACES_A can actually hand over. It
 * is narrower than A_SECRETS_TABLE_BORNE by four: the mentor's feedback and the
 * attendance mark live on cohort_week_submissions / cohort_week_attendance, and
 * the two PII sentinels on users — none of which is a room-content table, and
 * none of which SURFACES_A probes.
 */
const A_SECRETS_VIA_SURFACES = A_SECRETS_TABLE_BORNE.filter(
  (n) => ![CANARY.FEEDBACK_A1, CANARY.ATTEND_A1, CANARY.PII_A1, CANARY.PII_A2].includes(n)
);

/**
 * The sentinels the surfaces R0's own revocation wall covers can carry — the
 * ten minus cohort_weeks, plus the envelope and the link RPC. The curriculum,
 * assignment, feedback, attendance and PII sentinels are deliberately absent:
 * they live on tables OUTSIDE that wall, which is GAP-1 / GAP-3 territory and
 * is measured there rather than swept over a window that never queries them.
 */
const R0_OWNED_A_SECRETS = [
  CANARY.A1, CANARY.A2, CANARY.CONFIG_A, CANARY.CONFIG_A2,
  CANARY.REC_A1, CANARY.RECPROG_A1, CANARY.SEEN_A1,
  CANARY.ZOOM_A1, CANARY.ZOOMNEAR_A1, CANARY.ZOOMLIVE_A1, CANARY.ZOOMCANCEL_A1, CANARY.ZOOM_A2,
];

/**
 * Everything private to offering B — the mirror set, swept over the offering-A
 * actors. It exists because isolation is a claim about a WALL, not about a
 * direction: a suite that only ever proves "B's members see nothing of A" has
 * proven half a wall. Reachable because the TOTAL section makes every A-side
 * actor enumerate every content table with no filter at all, which is the one
 * request shape under which another offering's rows COULD come back.
 */
const ALL_B_SECRETS = [
  CANARY.B1, CANARY.ZOOM_B1, CANARY.CURRIC_B1, CANARY.ASSIGN_B1,
];
/** The same, for a window made of table probes only — see A_SECRETS_TABLE_BORNE. */
const B_SECRETS_TABLE_BORNE = ALL_B_SECRETS.filter((n) => n !== CANARY.ZOOM_B1);

/**
 * What a batch-A1 member must never receive about batch A2, and vice versa.
 *
 * The zoom/recording sentinels are NOT here. That is not an oversight and not a
 * softening: live_sessions carries no batch column at all (see the header
 * note), so the cross-batch residue on that ONE surface is a pre-existing
 * April-policy shape R0 neither widens nor narrows. It is measured as GAP-2 and
 * carried, which is louder than a sweep that silently avoided the surface.
 */
const CROSS_BATCH_A2_FORBIDDEN = [
  CANARY.A2, CANARY.CURRIC_A2, CANARY.ASSIGN_A2, CANARY.CONFIG_A2, CANARY.PII_A2,
];
const CROSS_BATCH_A1_FORBIDDEN = [
  CANARY.A1, CANARY.CURRIC_A1, CANARY.ASSIGN_A1, CANARY.FEEDBACK_A1,
  CANARY.MENTORDOC_A1, CANARY.SEEN_A1, CANARY.RECPROG_A1, CANARY.ATTEND_A1,
  CANARY.PII_A1,
];

/**
 * What a pre_member is redacted out of ON THE SURFACES R0 OWNS: curriculum
 * detail, assignments, mentor feedback, mentor materials, the attendance fact
 * and the resume position. Every one of those is a cohort_room_can_access()
 * table or an R-3 envelope field, so the redaction is R0's to claim.
 *
 * 🔴 THE RECORDING URL AND THE JOIN LINKS ARE DELIBERATELY NOT HERE, AND THIS
 * IS THE ONE LIST IN THE FILE THAT GOT SMALLER ON PURPOSE. Both ride
 * live_sessions, whose read is governed by `live_sessions_student_read`
 * (20260408140000:54) and `get_live_session_zoom_link` (20260408151600:74-86) —
 * two APRIL policies that test "an ACTIVE enrolment in an offering mapped to
 * this course" and know nothing of rooms, batches or tiers. R-1's own migration
 * header (20260729100000:906-918) marks the STAGED lobby shape (ACTIVE
 * enrolment + outstanding balance) as a known, escalated, NOT-CLOSED hole and
 * ends: "do not re-assert 'a pre_member reads zero rows from live_sessions'
 * anywhere until that follow-up lands." This suite used to re-assert it three
 * ways, and passed only because its single lobby occupant was the OTHER lobby
 * shape — an application stamp with no enrolment at all, for whom the April
 * policies deny for a reason that has nothing to do with being a pre_member.
 * So the claim is retired as a PASS and measured instead, on BOTH lobby shapes
 * and against a purpose-built staged actor, as GAP-4.
 */
const PRE_MEMBER_FORBIDDEN = [
  CANARY.CURRIC_A1, CANARY.ASSIGN_A1,
  CANARY.FEEDBACK_A1, CANARY.MENTORDOC_A1, CANARY.ATTEND_A1, CANARY.RECPROG_A1,
];

/**
 * THE LEDGER — one row per planted sentinel, and the anti-vacuity contract.
 *
 * `observedBy` names the actor who is ENTITLED to the sentinel and must
 * therefore be handed it at least once in this run. If nobody ever receives it,
 * every "0 hits" result for that sentinel is unfalsifiable — the string might
 * simply not be in the database. `observedBy: null` marks the sentinels nobody
 * is ever entitled to (the PII pair), whose armed-ness is proven differently
 * and named in `hunt`.
 *
 * CANARY-LEDGER at the foot of the run asserts, mechanically:
 *   · every value in CANARY appears in at least one needle list actually swept;
 *   · every entry with an `observedBy` was in fact observed by that actor;
 *   · every sweep could have found every needle it hunted (CANARY_HOME).
 */
const CANARY_LEDGER = {
  A1: { observedBy: "member_A1", hunt: "member_B / outsider / anon / accepted_A / member_A2" },
  A2: { observedBy: "member_A2", hunt: "member_A1 + every non-A actor" },
  B1: { observedBy: "member_B", hunt: "every offering-A actor via TOTAL" },
  // No STUDENT may ever hold this one — it is the withheld link. The admin
  // path is what proves the column is a real string rather than NULL, which is
  // the difference between "the gate held" and "there was nothing to hand out".
  ZOOM_A1: { observedBy: "admin", hunt: "member_A1 / member_A2 / member_B / outsider — nobody entitled to the room before T-60 (the two LOBBY shapes are measured as GAP-4, not asserted)" },
  ZOOMNEAR_A1: { observedBy: "member_A1", hunt: "member_B / outsider / accepted_A via the link RPC; both lobby shapes measured as GAP-4" },
  ZOOMLIVE_A1: { observedBy: "member_A1", hunt: "member_B / outsider / accepted_A via the link RPC and the envelope; lobby shapes → GAP-4" },
  ZOOMCANCEL_A1: { observedBy: "admin", hunt: "member_A1 first of all — the entitled student of a class that was called off — then every other tier" },
  ZOOM_A2: { observedBy: "member_A2", hunt: "member_B / outsider / accepted_A / anon via the link RPC" },
  ZOOM_B1: { observedBy: "member_B", hunt: "member_A1 / member_A2 / outsider via the link RPC" },
  CONFIG_A: { observedBy: "member_A1", hunt: "outsider / accepted_A / anon" },
  CONFIG_A2: { observedBy: "member_A2", hunt: "member_A1 (the one intra-offering boundary the config policy draws)" },
  REC_A1: { observedBy: "member_A1", hunt: "member_B / outsider / anon / accepted_A — the two lobby shapes are measured as GAP-4 (live_sessions is April policy, not R0's wall)" },
  RECPROG_A1: { observedBy: "member_A1", hunt: "member_A2 / accepted_A / pre_member / outsider" },
  SEEN_A1: { observedBy: "member_A1", hunt: "member_A2 / accepted_A / outsider" },
  ATTEND_A1: { observedBy: "member_A1", hunt: "member_A2 / accepted_A / pre_member / outsider" },
  CURRIC_A1: { observedBy: "member_A1", hunt: "member_A2 / pre_member / outsider / anon" },
  CURRIC_A2: { observedBy: "member_A2", hunt: "member_A1 / outsider" },
  CURRIC_B1: { observedBy: "member_B", hunt: "member_A1 / member_A2 / outsider via TOTAL" },
  ASSIGN_A1: { observedBy: "member_A1", hunt: "member_A2 / pre_member / outsider" },
  ASSIGN_A2: { observedBy: "member_A2", hunt: "member_A1 / outsider" },
  ASSIGN_B1: { observedBy: "member_B", hunt: "member_A1 / member_A2 / outsider via TOTAL" },
  FEEDBACK_A1: { observedBy: "member_A1", hunt: "member_A2 / pre_member / outsider" },
  MENTORDOC_A1: { observedBy: "member_A1", hunt: "member_A2 / pre_member / outsider" },
  PII_A1: { observedBy: "admin", hunt: "the roster RPC (C1.2 proves the mentor ROW is returned while the sentinel is not) + every actor's own users read" },
  PII_A2: { observedBy: "admin", hunt: "member_A1's roster and users reads" },
};

const ACTORS = {
  admin: "room-qa-admin@leveluptest.invalid",
  member_A1: "room-qa-member-a1@leveluptest.invalid",
  member_A2: "room-qa-member-a2@leveluptest.invalid",
  member_B: "room-qa-member-b@leveluptest.invalid",
  mentor_A: "room-qa-mentor-a@leveluptest.invalid",
  accepted_A: "room-qa-accepted-a@leveluptest.invalid",
  pre_member_A1: "room-qa-pre-member-a1@leveluptest.invalid",
  // THE SECOND LOBBY SHAPE, and the reason GAP-4 is a measurement rather than
  // prose. pre_member_A1 is the application-only lobby occupant (no enrolments
  // row at all). staged_lobby_A1 is the one the STAGED payment path actually
  // mints: the same `pre_member` room tier, reached with an ACTIVE enrolment
  // that still owes a balance (R-1 contract note 3). Every April-era policy on
  // live_sessions asks "is there an active enrolment for this offering?" and
  // gets a YES from this actor and a NO from the other — so a fixture carrying
  // only the first proves the lobby redaction against the shape where it is
  // free, and says nothing about the shape where it costs something.
  staged_lobby_A1: "room-qa-staged-lobby-a1@leveluptest.invalid",
  outsider: "room-qa-outsider@leveluptest.invalid",
};
const MODULE_KEYS = [
  "weeks", "sessions", "recordings", "assignments", "feedback", "commons",
  "resources", "demo_day", "roster", "announcements", "mentor_materials",
  "certificates",
];
const PROD_REF = "ivkvluezuiojovpotlyb";

// ── Reporting ───────────────────────────────────────────────────────────────
const C = process.stdout.isTTY
  ? { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" }
  : { g: "", r: "", y: "", d: "", b: "", x: "" };

let passed = 0;
const failures = [];

function section(title, why) {
  console.log(`\n${C.b}── ${title}${C.x}`);
  if (why) console.log(`${C.d}   ${why}${C.x}`);
}

/**
 * The only assertion primitive. `claim` is a sentence about the security
 * property being demonstrated — write what it PROVES, never "it passed".
 */
function prove(id, claim, ok, evidence) {
  if (ok) {
    passed++;
    console.log(`${C.g}PASS${C.x} ${id}  ${claim}`);
    if (evidence) console.log(`${C.d}       ↳ ${evidence}${C.x}`);
  } else {
    failures.push({ id, claim, evidence });
    console.log(`${C.r}FAIL${C.x} ${id}  ${claim}`);
    console.log(`${C.r}       ↳ ${evidence}${C.x}`);
  }
  return ok;
}

/**
 * A gap this suite MEASURES but R0 does not OWN — a pre-existing policy on a
 * table outside the room-content set that R0 deliberately does not widen (and
 * therefore does not narrow either).
 *
 * Three outcomes, and none of them is silence:
 *   open+unchanged → CARRIED. Printed in the verdict, exit stays 0, and the
 *                    design-qa-gate lens is instructed to raise every carried
 *                    gap as a finding, so it cannot be swallowed by a green run.
 *   widened        → FAIL. The residue grew past its documented boundary; that
 *                    is a leak like any other.
 *   closed         → PASS, plus an explicit "retire this entry" instruction, so
 *                    a fix does not leave a stale pin behind rotting.
 */
const carriedGaps = [];
function carryGap(id, { claim, closedClaim, open, widened, evidence, closing }) {
  if (widened) {
    failures.push({ id, claim, evidence });
    console.log(`${C.r}FAIL${C.x} ${id}  ${claim}`);
    console.log(`${C.r}       ↳ RESIDUE WIDENED: ${evidence}${C.x}`);
    return false;
  }
  if (!open) {
    passed++;
    console.log(`${C.g}PASS${C.x} ${id}  ${closedClaim}`);
    console.log(`${C.d}       ↳ the gap is CLOSED — ${evidence}. Retire this entry from the suite.${C.x}`);
    return true;
  }
  carriedGaps.push({ id, evidence, closing });
  console.log(`${C.y}CARRIED${C.x} ${id}  ${claim}`);
  console.log(`${C.d}       ↳ ${evidence}${C.x}`);
  console.log(`${C.d}       ↳ closing it: ${closing}${C.x}`);
  return true;
}

function die(msg, code = 2) {
  console.error(`\n${C.r}✖ ${msg}${C.x}`);
  process.exit(code);
}

// ── Case inventory (also printed by --list) ─────────────────────────────────
const INVENTORY = [
  ["PRECONDITION", "the shadow carries production's grants — aborts (exit 2) if it does not, because every RLS assertion would be vacuous"],
  ["PRE", "fixture world + membership preflight (derived vs manual vs none)"],
  ["Δ6", "R0 diff carries no certificate tiers and no tuition-credit phrasing"],
  ["SEC-ENT-2", "the four guarded triggers ARE attached and armed, and a forced failure — thrown, and CANCELLED — never blocks the enrolment write"],
  ["R1/R2/R3", "member_B / outsider / anon read every offering-A surface"],
  ["R4", "non-members calling the room RPCs are raised at, not handed an empty set"],
  ["R7", "recording positions are own-row-only between members"],
  ["R8/R9/C3", "cross-batch isolation inside one offering (A1 vs A2), config override included"],
  ["R10", "accepted_A holds zero room read grant, and there is no preview RPC"],
  ["R11", "pre_member_A1 sees the whitelist only, and is redacted out of the surfaces R0's wall owns"],
  ["GAP-4", "the measured live_sessions/join-link residue of the STAGED lobby shape (April policy, not R0's)"],
  ["MYROOMS", "the room-LIST RPC is self-scoped and carries the lobby redaction"],
  ["W1/W2/W5/W6/W7", "write attacks on announcements, demo entries and the feed"],
  ["W3/W4", "membership and config are server-derived, never client-claimed"],
  ["GRANT", "the verb list under the wall: SELECT-only on the room tables, and no TRUNCATE anywhere — the one layer PostgREST cannot probe"],
  ["W3.5/W3.6", "the admin grant/revoke RPCs DO work from an admin JWT (W3.4's control)"],
  ["W6b", "pre_member community write is rejected"],
  ["W8", "forged channel_key is rejected by the write RPC"],
  ["W9", "client-set is_mentor_answer is overridden; raw feed INSERT is revoked"],
  ["R3F/R3R", "feed/resource RPC scope, bounded pagination, safe projection, and resource-week integrity"],
  ["L1/L2", "revoking an enrolment removes access; re-granting restores it"],
  ["PROG", "get_cohort_progress — the one shipped-client surface R0 redefines"],
  ["TOTAL", "unfiltered enumeration: every actor asks each table for everything"],
  ["GAP-1", "the measured residue revocation leaves outside R0's own surfaces"],
  ["GAP-2", "the measured cross-batch residue on live_sessions (no batch column)"],
  ["GAP-3", "the measured residue get_cohort_progress leaves (links + revocation)"],
  ["C1", "roster ships the safe column set only — no phone, no email"],
  ["C2", "the T-60 zoom gate holds server-side, in the envelope AND in the link RPC"],
  ["NFR-CONFIG-2", "flipping every module flag ON changes no row count anywhere"],
  ["CANARY", "full-corpus grep for every planted sentinel"],
  ["CANARY-LEDGER", "every planted sentinel was hunted, every hunt was armed, and every sweep was reachable"],
];

if (process.argv.includes("--list")) {
  console.log(`${C.b}cohort-room-access — case inventory (NOTHING IS PROVEN BY THIS FLAG)${C.x}`);
  for (const [id, what] of INVENTORY) console.log(`  ${id.padEnd(16)} ${what}`);
  console.log(`\n${C.r}INVENTORY ONLY — run without --list to actually attack the wall.${C.x}`);
  process.exit(3);
}

// ── Config + the prod guard ─────────────────────────────────────────────────
//
// TWO TARGETS, ONE SUITE. The attacks below are identical either way; only the
// two transports differ.
//
//   HOSTED  — a throwaway Supabase project. SQL goes through the Management API,
//             the data plane is <ref>.supabase.co. This is the original mode and
//             is unchanged.
//   LOCAL   — the `supabase start` stack on this machine (ROOM_QA_LOCAL=1). SQL
//             goes through psql against the local Postgres; the data plane is
//             127.0.0.1:54321. Added because the hosted mode requires a paid
//             project, which meant this suite — the ONLY thing that attacks R0's
//             wall — had never been executed anywhere.
//
// LOCAL MODE IS NOT A WEAKER TEST. Both transports drive REAL HTTP against a
// REAL PostgREST/GoTrue carrying REAL user JWTs, so table GRANTs, RLS policies,
// SECURITY DEFINER asserts and the PostgREST surface are all still in the path.
// What local mode does NOT reproduce is the hosted platform's grant model, which
// is precisely what qa-harness/shadow-grants.sql exists to reproduce by hand —
// and the PRECONDITION below still refuses to run without it. A local shadow
// with the grants applied and a hosted shadow with them applied are the same
// database as far as every assertion in this file is concerned.
const LOCAL = process.env.ROOM_QA_LOCAL === "1";
const PAT = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;
const REF = LOCAL
  ? process.env.ROOM_QA_PROJECT_REF || "local"
  : process.env.ROOM_QA_PROJECT_REF || process.env.SUPABASE_SHADOW_REF;

// The local Postgres, and the psql that talks to it. libpq is keg-only on this
// Mac, so psql is NOT on PATH by default — hence the override.
const DB_URL =
  process.env.ROOM_QA_DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PSQL = process.env.ROOM_QA_PSQL || "psql";

if (!LOCAL && !PAT) die("Missing SUPABASE_PAT (Management API token for the SQL channel).");
if (!REF) die("Missing ROOM_QA_PROJECT_REF — the SHADOW project ref to attack.");
if (REF === PROD_REF) {
  die(
    `ROOM_QA_PROJECT_REF is the PRODUCTION project (${PROD_REF}). This suite creates ` +
      "users, plants leak canaries and revokes enrolments. It runs on a SHADOW project only."
  );
}

const API = `https://api.supabase.com/v1/projects/${REF}`;
const BASE = LOCAL
  ? process.env.ROOM_QA_BASE_URL || "http://127.0.0.1:54321"
  : `https://${REF}.supabase.co`;

// The prod guard above keys on a project REF, which local mode does not have —
// so local mode gets its own guard on the two things it does have. A DB_URL or
// a BASE pointing off-box in a mode whose whole contract is "disposable stack on
// this machine" is a misconfiguration, and this suite is destructive by design.
if (LOCAL) {
  const localHost = (u) => /^(127\.0\.0\.1|localhost|\[::1\]|::1)$/i.test(new URL(u).hostname);
  const asUrl = (u) => (u.startsWith("postgres") ? u.replace(/^postgres(ql)?:/, "http:") : u);
  if (!localHost(asUrl(DB_URL))) {
    die(`ROOM_QA_LOCAL=1 but ROOM_QA_DB_URL is not on this machine (${new URL(asUrl(DB_URL)).hostname}).`);
  }
  if (!localHost(BASE)) {
    die(`ROOM_QA_LOCAL=1 but ROOM_QA_BASE_URL is not on this machine (${new URL(BASE).hostname}).`);
  }
}

// ── Transport 1: the SQL channel (project owner, bypasses RLS) ──────────────
async function sqlHosted(query) {
  const res = await fetch(`${API}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`SQL channel ${res.status}: ${detail.slice(0, 600)}`);
  }
  return Array.isArray(body) ? body : [];
}

/**
 * One psql invocation. Throws with the server's own message, carrying the
 * SQLSTATE, on any error.
 *
 * VERBOSITY=verbose is what puts the SQLSTATE on stderr (`ERROR:  42601: …`),
 * and the code is the whole point: it is the only thing that distinguishes
 * "this statement cannot be phrased as a CTE" from "this statement is wrong".
 * Without it the fallback below has to catch everything, and catching
 * everything turns a genuine SQL error into an empty result set — a silent []
 * that reads downstream as "no rows found" instead of "your query is broken".
 */
function psqlExec(text) {
  try {
    return execFileSync(
      PSQL,
      ["-X", "-q", "-t", "-A", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
       "-v", "VERBOSITY=verbose", "-d", DB_URL, "-c", text],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (e) {
    const raw = String(e.stderr || e.message).trim();
    const err = new Error(raw.slice(0, 600));
    err.sqlState = (raw.match(/^ERROR:\s+([0-9A-Z]{5}):/m) || [])[1] || "";
    throw err;
  }
}

/**
 * The two SQLSTATEs that mean "not expressible as a CTE", and nothing else.
 *   42601 syntax_error          — DDL, SET, or two statements in one string
 *   0A000 feature_not_supported — a data modification with no RETURNING clause
 * Every other code is a real defect in the query and MUST reach the caller.
 */
const NOT_A_CTE = new Set(["42601", "0A000"]);

/**
 * The LAST top-level statement of a script, or "" if it cannot be isolated.
 *
 * Needed because the hosted Management API answers a multi-statement script with
 * the rows of its FINAL statement, and two call sites depend on that: the whole
 * fixtures file is sent as one string and read as `(await sql(fixtureSql))[0]`,
 * and SEC-ENT-2's driving query does the same. A raw psql run returns nothing
 * usable, so those reads came back undefined and PRE.1, PRE.1b and SEC-ENT-2.4
 * failed on a fixture world that had in fact applied perfectly.
 *
 * Splitting on `;` naively would be wrong on this file above all others: the
 * fixtures and migrations are full of dollar-quoted function bodies, and one
 * `;` inside a $$ … $$ block would truncate the script. So this walks the text
 * tracking single quotes (with '' doubling), quoted identifiers, line and block
 * comments, and dollar-quoted tags, and only counts a `;` seen at depth zero.
 */
function lastStatement(script) {
  const n = script.length;
  let i = 0, start = 0, last = "";
  const close = (end) => {
    const s = script.slice(start, end).trim();
    if (s) last = s;
  };
  while (i < n) {
    const c = script[i];
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < n) {
        if (script[i] === q) {
          if (script[i + 1] === q) { i += 2; continue; }
          i++; break;
        }
        i++;
      }
      continue;
    }
    if (c === "-" && script[i + 1] === "-") {
      while (i < n && script[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && script[i + 1] === "*") {
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (script[i] === "/" && script[i + 1] === "*") { depth++; i += 2; continue; }
        if (script[i] === "*" && script[i + 1] === "/") { depth--; i += 2; continue; }
        i++;
      }
      continue;
    }
    if (c === "$") {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(script.slice(i));
      if (m) {
        const tag = m[0];
        const end = script.indexOf(tag, i + tag.length);
        i = end === -1 ? n : end + tag.length;
        continue;
      }
    }
    if (c === ";") { close(i); i++; start = i; continue; }
    i++;
  }
  close(n);
  return last;
}

/** Leading comments and whitespace stripped, so the first keyword is visible. */
const firstKeyword = (s) =>
  s.replace(/^(?:\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/, "").slice(0, 12).toLowerCase();

/**
 * The local SQL channel. It has to be INDISTINGUISHABLE from the hosted one
 * above: same rows, same JSON types, same throw on error. Two paths, and the
 * split between them is load-bearing.
 *
 * PATH 1 — wrap the statement in a CTE and let Postgres serialise the result.
 * `json_agg` is what preserves TYPE FIDELITY: a pg boolean stays a JSON boolean
 * and a NULL stays null, exactly as the Management API hands them back. Parsing
 * psql's text output instead would turn every boolean into "t"/"f" and every
 * NULL into "", and this file's own `pgBool` comment records what that class of
 * ambiguity already cost once — a precondition that read the string "false" as
 * GRANTED and failed OPEN, in the one check whose whole job is to fail closed.
 *
 * A CTE — not a subquery — because three call sites read an id back out of an
 * `INSERT … RETURNING` (`armEnrol`, `enrolA`, `enrolB`). A data-modifying
 * statement cannot sit in a FROM, so a subquery wrap would drop those rows and
 * hand back []. Those ids then go null, and every downstream assertion that
 * names them stops testing anything while still printing green. A CTE accepts
 * both a plain SELECT and an `INSERT/UPDATE/DELETE … RETURNING`, so one wrap
 * covers every statement in this file whose rows are actually read.
 *
 * PATH 2 — DDL, `INSERT` with no RETURNING, and multi-statement scripts cannot
 * be expressed as a CTE. Run them for their effects and return [], which is what
 * the Management API returns for them too.
 *
 * WHY PATH 2 CANNOT DOUBLE-EXECUTE PATH 1's WORK. Every way a statement can fail
 * to be a legal CTE — DDL, a no-RETURNING data modification, two statements — is
 * caught during PARSE ANALYSIS, before Postgres executes any of it. And psql
 * sends a `-c` string as ONE simple-query message, so even a multi-statement
 * script is a single implicit transaction that rolls back whole. A statement
 * that reached execution and then failed therefore never lands in path 2; it
 * throws, and the caller sees the same error the hosted channel would raise.
 */
async function sqlLocal(query) {
  const bare = query.trim().replace(/;\s*$/, "");
  try {
    // The newlines around `bare` are load-bearing. This file's SQL carries
    // trailing `--` line comments, and closing the paren on the same line would
    // put it INSIDE that comment — a syntax error, which falls through to the
    // raw path and returns [], so a perfectly good query reports "no rows" and
    // every count built on it reads `undefined`. PRE.1 and PRE.1b failed exactly
    // that way before the paren moved to its own line.
    const out = psqlExec(
      `WITH __qa AS (\n${bare}\n) SELECT coalesce(json_agg(__qa), '[]'::json)::text FROM __qa`
    ).trim();
    return out ? JSON.parse(out) : [];
  } catch (e) {
    // ONLY a structurally-impossible CTE falls through. Anything else — an
    // ambiguous column, a missing table, a type error — is a broken query, and
    // swallowing it here would hand the caller [] and let an assertion read a
    // failure as "nothing found". That is the fail-open shape this file exists
    // to prevent, so it is re-thrown exactly as the hosted channel would.
    if (!NOT_A_CTE.has(e.sqlState)) throw e;
  }

  // Not expressible as a CTE: run it for its effects, exactly as the hosted
  // channel would.
  psqlExec(query);

  // Then recover the FINAL statement's rows, because that is what the hosted
  // channel returns for a multi-statement script and what two call sites read.
  //
  // ONLY a plain SELECT is re-run. That is the whole safety argument: a SELECT
  // with no data-modifying CTE has no side effects, so executing it a second
  // time cannot change the world the script just built. Anything else — an
  // INSERT, an ALTER, a DO block — is left alone and answers [], as it did
  // before, rather than being run twice to satisfy a reader that does not exist.
  const tail = lastStatement(query);
  if (tail && /^select\b/.test(firstKeyword(tail))) {
    try {
      const out = psqlExec(
        `WITH __qa AS (\n${tail}\n) SELECT coalesce(json_agg(__qa), '[]'::json)::text FROM __qa`
      ).trim();
      return out ? JSON.parse(out) : [];
    } catch (e) {
      if (!NOT_A_CTE.has(e.sqlState)) throw e;
    }
  }
  return [];
}

const sql = (query) => (LOCAL ? sqlLocal(query) : sqlHosted(query));
const sqlOne = async (q) => (await sql(q))[0] ?? null;
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * ONE COERCION FOR EVERY BOOLEAN THAT COMES BACK THROUGH THE SQL CHANNEL.
 *
 * The Management API round-trips results as JSON, and this file already
 * compares against text CASE outputs elsewhere — so a Postgres `boolean` can
 * plausibly arrive as `true` or as the string "true"/"t". Two call sites used
 * to disagree about which: the precondition tested truthiness (making the
 * string "false" read as GRANTED, which would let an ungranted shadow through
 * — fail-open, in the one check whose whole job is to fail closed) while the
 * GRANT section tested `=== true` (making "true" read as NOT HELD, failing
 * everything). Neither form is right on its own. This one is right on both
 * serialisations, and nothing in this file should compare a pg boolean without
 * it.
 */
const pgBool = (v) => v === true || v === "true" || v === "t";

// ── Transport 2: real user sessions against the real API surface ────────────
let ANON_KEY = process.env.ROOM_QA_ANON_KEY || "";
let SERVICE_KEY = process.env.ROOM_QA_SERVICE_KEY || "";

async function loadKeys() {
  if (ANON_KEY && SERVICE_KEY) return;
  // Local mode has no Management API to ask, so the keys come from the env the
  // local stack itself prints. They are the well-known development keys of a
  // disposable stack, not secrets — but they still never get echoed from here.
  if (LOCAL) {
    die(
      "Local mode needs ROOM_QA_ANON_KEY and ROOM_QA_SERVICE_KEY. Take them from the " +
        "running stack:\n\n  eval \"$(npx -y supabase@latest status -o env | sed 's/^/export /')\"\n" +
        "  export ROOM_QA_ANON_KEY=\"$ANON_KEY\" ROOM_QA_SERVICE_KEY=\"$SERVICE_ROLE_KEY\"\n"
    );
  }
  for (const url of [`${API}/api-keys?reveal=true`, `${API}/api-keys`]) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${PAT}` } });
    if (!res.ok) continue;
    const keys = await res.json().catch(() => null);
    if (!Array.isArray(keys)) continue;
    for (const k of keys) {
      const value = k.api_key || k.apiKey || k.key;
      if (!value) continue;
      if (k.name === "anon" && !ANON_KEY) ANON_KEY = value;
      if (k.name === "service_role" && !SERVICE_KEY) SERVICE_KEY = value;
    }
    if (ANON_KEY && SERVICE_KEY) return;
  }
  die(
    "Could not resolve the anon / service_role keys for this project. Pass " +
      "ROOM_QA_ANON_KEY and ROOM_QA_SERVICE_KEY explicitly, or use a PAT with project-keys scope."
  );
}

/** actor → { id, token } */
const session = {};
/** actor → [{ label, text }] — every byte the server ever handed this actor. */
const corpus = new Map();

/**
 * `surface` is the reachability token — the path before '?' for a table probe,
 * `rpc:<fn>` for a function call. It is stamped on the entry whether the server
 * answered or refused, which is the correct definition: what makes a sweep
 * falsifiable is that the REQUEST went out, not that it succeeded. A request
 * denied by the wall is the wall holding, and the sweep has to be able to say so.
 */
function record(actor, label, text, surface) {
  if (!corpus.has(actor)) corpus.set(actor, []);
  corpus.get(actor).push({ label, text: text ?? "", surface: surface ?? "" });
}
const mark = (actor) => (corpus.get(actor) ?? []).length;
const since = (actor, from) => (corpus.get(actor) ?? []).slice(from);
const surfacesIn = (actor, from) =>
  new Set(since(actor, from).map((e) => e.surface).filter(Boolean));

function authHeaders(actor) {
  if (actor === "anon") return { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
  const s = session[actor];
  if (!s) throw new Error(`no session for actor ${actor}`);
  return { apikey: ANON_KEY, Authorization: `Bearer ${s.token}` };
}

/**
 * A probe the SERVER could not parse (bad column, missing embed, unknown table)
 * also comes back 4xx. Counting that as "denied" would turn a typo in this file
 * into a green security result, so malformed probes are called out instead.
 */
const PARSE_ERROR_CODES = /^PGRST(1\d\d|20\d)$/;
function isMalformed(status, json) {
  if (status !== 400 && status !== 404) return false;
  const code = json && json.code;
  return typeof code === "string" && PARSE_ERROR_CODES.test(code);
}

/** GET through PostgREST as `actor`. Body text always lands in the corpus. */
async function read(actor, path, label = path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: authHeaders(actor) });
  const text = await res.text();
  record(actor, `GET ${label}`, text, path.split("?")[0]);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch { /* PostgREST always speaks JSON; a non-JSON body is itself evidence */ }
  const malformed = isMalformed(res.status, json);
  return {
    status: res.status,
    ok: res.ok,
    json,
    text,
    malformed,
    rows: Array.isArray(json) ? json.length : null,
    /** "0 rows" and "denied" are both a pass for a read attack. A probe the
     *  server rejected as unparseable is neither — it proved nothing. */
    blocked: !malformed && (!res.ok || (Array.isArray(json) && json.length === 0)),
    describe: malformed
      ? `MALFORMED PROBE — HTTP ${res.status} ${json.code}: ${json.message || ""} (this probe tested nothing)`
      : res.ok
        ? `HTTP ${res.status}, ${Array.isArray(json) ? json.length : "?"} row(s)`
        : `HTTP ${res.status} ${(json && (json.message || json.code)) || text.slice(0, 120)}`,
  };
}

/** POST/PATCH/DELETE through PostgREST as `actor` (the write attacks). */
async function write(actor, path, method, body, label) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      ...authHeaders(actor),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  record(actor, `${method} ${label || path}`, text, path.split("?")[0]);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch { /* non-JSON error bodies are kept as raw text evidence */ }
  const malformed = isMalformed(res.status, json);
  return {
    status: res.status,
    ok: res.ok,
    json,
    text,
    malformed,
    /** Rejected by policy or grant — NOT rejected because we sent nonsense. */
    rejected: !res.ok && !malformed,
    /** A write that PostgREST accepted but RLS filtered to nothing. */
    changedNothing: res.ok && Array.isArray(json) && json.length === 0,
    describe: malformed
      ? `MALFORMED WRITE — HTTP ${res.status} ${json.code}: ${json.message || ""} (this attack was never delivered)`
      : `HTTP ${res.status} ${(json && (json.message || json.code)) || text.slice(0, 160)}`,
  };
}

/** Call a SECURITY DEFINER RPC as `actor`. */
async function rpc(actor, fn, args = {}, label) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...authHeaders(actor), "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  record(actor, `RPC ${label || fn}`, text, `rpc:${fn}`);
  let json = null;
  let parsed = false;
  try {
    json = JSON.parse(text);
    parsed = true;
  } catch { /* ditto */ }
  // PGRST202 = "no function matches". For every case except R10 (where the
  // absence IS the proof) that means the call never reached the RPC, so it must
  // not be scored as a raise.
  const missing = res.status === 404 || (json && json.code === "PGRST202");
  const malformed = !missing && isMalformed(res.status, json);
  return {
    status: res.status,
    ok: res.ok,
    json,
    text,
    missing,
    /** The server rejected the CALL, not the caller — a bad argument name, a
     *  wrong overload. Scoring that as a refusal would green-light a typo. */
    malformed,
    /** The function ran and refused us — not "the function was not found",
     *  and not "PostgREST could not parse what this file sent". */
    raised: !res.ok && !missing && !malformed,
    /**
     * The function RAN, answered 200, and its answer was SQL NULL.
     *
     * This is the pass condition for every link-gate case (C2.5, C2.7.*, L1.3b)
     * and the measurement GAP-4 reads, which makes it the one place where "the
     * server sent nothing
     * usable" and "the server deliberately withheld the link" must never be
     * allowed to look the same. `json === null` alone conflates them: a gateway
     * 502 HTML page, a proxy error or an empty body all fail JSON.parse, leave
     * `json` at its null initialiser, and would sail through as a withheld
     * link. So this demands the full shape — 2xx, a body that parsed, and a
     * body that is literally `null` — exactly the guard read() and write()
     * already carry (see the malformed-probe note above them).
     */
    returnedNull: res.ok && parsed && json === null && text.trim() === "null",
    message: (json && (json.message || json.hint || json.code)) || text.slice(0, 160),
    describe: missing
      ? `NO SUCH FUNCTION — HTTP ${res.status} ${(json && json.message) || ""} (the call never reached an RPC)`
      : malformed
        ? `MALFORMED CALL — HTTP ${res.status} ${json.code}: ${json.message || ""} (this probe tested nothing)`
        : `HTTP ${res.status} ${(json && (json.message || json.code)) || text.slice(0, 160)}`,
  };
}

// ── Canary greps over the retained corpus ───────────────────────────────────
function corpusHits(actor, needle, from = 0) {
  return since(actor, from)
    .filter((e) => e.text.includes(needle))
    .map((e) => e.label);
}

/** Every needle any sweep has actually looked for — CANARY-LEDGER reads this. */
const sweptNeedles = new Set();
/** One row per sweep: what it hunted, and what it could not possibly have found. */
const sweepAudit = [];

/**
 * THE ANTI-VACUITY GUARD, APPLIED AT THE SWEEP.
 *
 * Two things have to be true before "zero hits" means anything:
 *   1. nothing leaked  — the obvious half;
 *   2. something COULD have leaked — for every needle, at least one of its home
 *      surfaces (CANARY_HOME) was queried inside this sweep's own window.
 * (2) is the half that was missing. A needle hunted over a window that never
 * touched the surface carrying it returns zero for the same reason an empty
 * database does, and the printed word is identical. So an unreachable needle
 * FAILS the sweep here — naming the sentinel and the window — instead of being
 * discovered later, or never.
 */
function proveCorpusClean(id, actor, needles, claim, from = 0) {
  for (const n of needles) sweptNeedles.add(n);
  const surfaces = surfacesIn(actor, from);
  const unreachable = needles.filter((n) => !(HOME_OF.get(n) ?? []).some((s) => surfaces.has(s)));
  const leaks = [];
  for (const n of needles) for (const label of corpusHits(actor, n, from)) leaks.push(`${n} via ${label}`);
  const responses = since(actor, from).length;
  sweepAudit.push({ id, actor, needles: needles.length, unreachable });
  return prove(
    id,
    claim,
    leaks.length === 0 && unreachable.length === 0,
    leaks.length
      ? `LEAKED: ${leaks.slice(0, 8).join("; ")}`
      : unreachable.length
        ? `VACUOUS SWEEP — ${unreachable.join(", ")} could not have appeared in this window: ` +
          `${actor} queried [${[...surfaces].join(", ") || "nothing"}] and none of those surfaces carries them. ` +
          "Hunt them over a window that queries their home surface, or drop them from this list."
        : `${responses} response bodies swept for ${needles.length} sentinel(s) across ` +
          `${surfaces.size} distinct surface(s); zero hits`
  );
}

// ── RPC signature resolution ────────────────────────────────────────────────
// R-3 owns the write RPCs' parameter names; this suite must not guess them and
// must not go green just because a typo'd argument made the call 404. We read
// the real signature from pg_proc and bind our semantic slots to it.
const SIG_MATCHERS = [
  ["channel", /channel/i],
  ["mentor", /mentor/i],
  ["week", /week/i],
  ["post", /(post|parent)/i],
  ["batch", /batch/i],
  ["offering", /offering/i],
  ["kind", /(kind|type)/i],
  ["media", /media/i],
  ["body", /(body|content|text|message)/i],
];

async function signature(fn) {
  const rows = await sql(
    `SELECT pg_get_function_arguments(p.oid) AS args
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ${lit(fn)}`
  );
  if (!rows.length) return null;
  const names = String(rows[0].args || "")
    .split(",")
    .map((a) => a.trim().split(/\s+/)[0])
    .filter(Boolean);
  return { raw: rows[0].args, names };
}

/**
 * Bind {offering, batch, body, …} onto a function's real parameter names.
 * Returns null (never throws) when a slot cannot be bound, so an unexpected
 * signature fails one named case instead of aborting the whole suite.
 */
function bind(sig, wanted) {
  if (!sig) return null;
  const out = {};
  const taken = new Set();
  for (const [slot, re] of SIG_MATCHERS) {
    if (!(slot in wanted)) continue;
    const name = sig.names.find((n) => !taken.has(n) && re.test(n));
    if (!name) return null;
    taken.add(name);
    out[name] = wanted[slot];
  }
  return out;
}

// ── Fixture lifecycle ───────────────────────────────────────────────────────
async function resetAuthUsers() {
  const emails = Object.values(ACTORS).map(lit).join(",");
  const existing = await sql(`SELECT id, email FROM auth.users WHERE email IN (${emails})`);
  for (const u of existing) {
    await fetch(`${BASE}/auth/v1/admin/users/${u.id}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
  }
  const password = `RoomQA-${randomUUID()}!aA1`;
  for (const [actor, email] of Object.entries(ACTORS)) {
    const res = await fetch(`${BASE}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: actor },
      }),
    });
    if (!res.ok) die(`Could not create fixture user ${actor}: HTTP ${res.status} ${await res.text()}`);
  }
  return password;
}

async function signIn(password) {
  for (const [actor, email] of Object.entries(ACTORS)) {
    const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) die(`Could not sign in fixture user ${actor}: HTTP ${res.status} ${await res.text()}`);
    const body = await res.json();
    session[actor] = { id: body.user.id, token: body.access_token };
  }
}

async function teardown() {
  await sql(`
    -- SEC-ENT-2's forced-failure props first. That section disarms itself in a
    -- finally and asserts the world is back (SEC-ENT-2.5); this is the second
    -- lock, because a CHECK(false) left on cohort_room_members would break the
    -- next run of this suite AND every room write on the shadow project.
    ALTER TABLE public.cohort_room_members DROP CONSTRAINT IF EXISTS tmp_room_qa_force_fail;
    ALTER TABLE public.cohort_room_members DROP CONSTRAINT IF EXISTS tmp_room_qa_force_cancel;
    DO $do$
    BEGIN
      IF to_regclass('public.enrolments_room_qa_real') IS NOT NULL THEN
        DROP VIEW IF EXISTS public.enrolments;
        ALTER TABLE public.enrolments_room_qa_real RENAME TO enrolments;
      END IF;
    END $do$;
    -- cohort_recording_progress and cohort_room_seen are not named here: the
    -- first cascades from live_sessions and the second from offerings, both
    -- deleted below. cohort_week_attendance and cohort_week_submissions cascade
    -- from cohort_weeks, which cascades from cohort_batches → offerings.
    DELETE FROM public.live_sessions WHERE title LIKE 'ROOM QA %';
    DELETE FROM public.cohort_applications WHERE email LIKE 'room-qa-%';
    DELETE FROM public.enrolments WHERE offering_id IN (SELECT id FROM public.offerings WHERE slug LIKE 'room-qa-%');
    DELETE FROM public.offerings WHERE slug LIKE 'room-qa-%';
    DELETE FROM public.courses WHERE slug LIKE 'room-qa-%';
    DROP FUNCTION IF EXISTS public._room_qa_uid(text);
    DROP FUNCTION IF EXISTS public._room_qa_cancel(uuid);
    DROP FUNCTION IF EXISTS public._room_qa_boom();
    DROP SEQUENCE IF EXISTS public._room_qa_cancel_seq;
    -- GRANT.0b's throwaway create-time witness. It drops itself in a finally;
    -- this is the second lock, for a process killed between CREATE and DROP.
    DROP TABLE IF EXISTS public._room_qa_default_acl_probe;
    SELECT 1;
  `).catch(() => {});
  const emails = Object.values(ACTORS).map(lit).join(",");
  const rows = await sql(`SELECT id FROM auth.users WHERE email IN (${emails})`).catch(() => []);
  for (const u of rows) {
    await fetch(`${BASE}/auth/v1/admin/users/${u.id}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }).catch(() => {});
  }
}

// ════════════════════════════════════════════════════════════════════════════
// THE RUN
// ════════════════════════════════════════════════════════════════════════════
console.log(`${C.b}cohort room access — adversarial suite${C.x}`);
console.log(`${C.d}project ${REF} (shadow) · ${BASE}${C.x}`);

// ── Δ6 / Delta-6: a copy + schema grep over the R0 diff. Pure static, runs
//    first so it reports even if the shadow project is unreachable. ──────────
section(
  "Δ6 — STANDING-1 + FEE-1 copy discipline",
  "single Completion certificate, and the ₹400 is a non-refundable review fee — never tuition credit"
);
{
  const base = process.env.ROOM_QA_DIFF_BASE || "main";
  const SELF = "qa-harness/cohort-room-access.spec.mjs"; // the scanner cannot scan itself
  const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // Scope: what R0 SHIPS. design/ is the authority set — those documents have to
  // be able to state the rule ("no honours tiers", "never tuition credit")
  // without the scanner reading the rule as a violation of itself.
  const SHIPPED = /^(src|supabase|public|scripts|qa-harness|android|ios)\/|^index\.html$/;
  const sources = [];
  /** @type {{file: string, text: string}[]} */
  const added = [];

  const collectDiff = (label, args) => {
    let out;
    try {
      out = git(args);
    } catch {
      return false; // base may not exist / no commits yet — the fallback still counts
    }
    sources.push(label);
    let file = "";
    for (const line of out.split("\n")) {
      if (line.startsWith("+++ b/")) { file = line.slice(6); continue; }
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      if (line.startsWith("+") && file && file !== SELF) added.push({ file, text: line.slice(1) });
    }
    return true;
  };
  // Scan the final working tree relative to the base in one pass. Collecting the
  // committed diff and the working diff separately leaves a replaced line in
  // both sets — once as a historical addition and once as its correction — and
  // can falsely fail the release gate on text that no longer ships.
  const collectedFinal = collectDiff(`git diff ${base}`, ["diff", base, "--", "."]);
  if (!collectedFinal) {
    collectDiff("git diff HEAD", ["diff", "HEAD", "--", "."]);
  }
  try {
    const untracked = git(["ls-files", "--others", "--exclude-standard"])
      .split("\n").map((f) => f.trim()).filter((f) => f && f !== SELF);
    if (untracked.length) {
      sources.push(`${untracked.length} untracked file(s)`);
      for (const f of untracked) {
        try {
          for (const text of readFileSync(resolve(REPO, f), "utf8").split("\n")) added.push({ file: f, text });
        } catch { /* binary or unreadable — nothing to grep */ }
      }
    }
  } catch { /* not a git checkout */ }

  const how = sources.join(" + ");
  const scanned = added.filter((l) => SHIPPED.test(l.file));

  // Patterns are assembled from fragments so this file never contains the
  // literal strings it forbids (it would otherwise flag its own diff).
  const TIER = `\\b(dis${"tinction"}|${"me"}rit)\\b`;
  const CREDIT =
    `(tuition ${"cred"}it|${"cred"}ited (towards?|against)|adjusted against the (fee|tuition)|` +
    `${"cred"}it towards? (the )?(tuition|balance|fee))`;
  // A line that NEGATES the retired concept ("no Dis…/Me… tiers", "never tuition
  // credit") is the rule being restated, not the rule being broken — but that
  // excuse is available ONLY to prose. In executable code a hit is a hit: a
  // CHECK constraint listing the tier values sits right after "NOT NULL", and
  // letting that count as a negation would blind the scanner to the single most
  // important thing it looks for.
  const NEGATED = /\b(no|not|never|zero|non|without|forbidden|banned|prohibit\w*|retired|removed|deleted|drops?|superseded|instead of)\b/i;
  const isProse = (file, text) => /\.(md|txt)$/i.test(file) || /^\s*(--|\/\/|\/\*|\*|#|>|\|)/.test(text);
  const violations = (source) =>
    scanned.filter(({ file, text }, i) => {
      // Prose comments wrap, so the negation ("No <tier> / <tier> appears…")
      // often sits on the previous line. Read it as context, not in isolation.
      const prev = i > 0 && scanned[i - 1].file === file ? scanned[i - 1].text : "";
      const excusable = isProse(file, text);
      const re = new RegExp(source, "gi");
      let m;
      while ((m = re.exec(text)) !== null) {
        if (!excusable) return true;
        const before = `${prev} ${text.slice(Math.max(0, m.index - 90), m.index)}`;
        if (!NEGATED.test(before)) return true;
      }
      return false;
    });

  const tierHits = violations(TIER);
  const creditHits = violations(CREDIT);
  const show = (hits) => hits.slice(0, 5).map((h) => `${h.file}: ${h.text.trim().slice(0, 90)}`).join(" | ");

  // A grep over nothing is not evidence of anything.
  prove("Δ6.1",
    "no certificate honours tier survives in what R0 ships — STANDING-1 gives every finisher ONE Completion certificate, so there is no column, CHECK or copy string by which one student's certificate can outrank another's",
    scanned.length > 0 && tierHits.length === 0,
    scanned.length === 0
      ? `nothing to scan (${how || "no diff source"}) — a vacuous grep proves nothing; set ROOM_QA_DIFF_BASE`
      : tierHits.length === 0
        ? `${scanned.length} shipped added lines scanned via ${how}; zero un-negated tier words`
        : `found: ${show(tierHits)}`);
  prove("Δ6.2",
    "the ₹400 is never described as tuition credit in what R0 ships — FEE-1 makes it a non-refundable review fee, and copy implying it is credited back is a refund liability the moment a student quotes it",
    scanned.length > 0 && creditHits.length === 0,
    scanned.length === 0
      ? `nothing to scan (${how || "no diff source"})`
      : creditHits.length === 0
        ? `${scanned.length} shipped added lines scanned; zero un-negated credit phrasings`
        : `found: ${show(creditHits)}`);
}

// ════════════════════════════════════════════════════════════════════════════
// PRECONDITION — THE SHADOW MUST CARRY PRODUCTION'S GRANTS, OR NOTHING BELOW
// IS EVIDENCE. This aborts the run; it never prints a summary.
// ════════════════════════════════════════════════════════════════════════════
//
// THE ENVIRONMENT-LAYER VERSION OF THE EXACT DEFECT THE ASSERTION LAYER JUST
// FIXED. Every read attack in this file is an RLS attack, and PostgreSQL checks
// the table GRANT strictly BEFORE it consults a row policy. On a shadow built
// from supabase/migrations/ alone, the client roles hold almost nothing —
// measured on a clean local stack, 3 of 103 public tables grant SELECT to anon —
// so "outsider reads offering A and gets denied" is produced by a missing GRANT
// and is printed with the identical word a holding wall prints. A whole green
// run in that state is worth precisely zero, and it is the most expensive kind
// of zero because it looks like a sign-off artifact.
//
// THREE SAMPLES, AND THE THIRD IS THE ONLY ONE THAT CAN SEE THE ORDERING BUG:
//   · PRE-EXISTING tables, probed as `anon` for SELECT. Nothing in this repo's
//     migrations grants these — only the hosted platform's bootstrap, or
//     qa-harness/shadow-grants.sql SECTION B, does — so `anon` holding SELECT
//     here is the reliable signal that this shadow gates on RLS the way prod
//     does for the 103 tables that predate R0.
//   · R0-CREATED tables, probed as `authenticated` for SELECT. REACHABILITY,
//     and the claim is no larger than that word: 20260729100000 §7 and
//     20260729100100 §7 GRANT this SELECT themselves, so it is satisfied by any
//     shadow where `db push` ran, with or without production's grant model. It
//     detects a half-applied migration set — it is NOT evidence about grants,
//     and it used to be described as though it were. `anon` is deliberately not
//     the probe role here: both §7s REVOKE ALL on these tables FROM anon on
//     purpose, so demanding anon SELECT would abort a CORRECTLY provisioned
//     shadow.
//   · R0-CREATED tables, probed as `authenticated` for REFERENCES/TRIGGER —
//     A TABLE+VERB PAIR ONLY THE BOOTSTRAP CAN PRODUCE, and the reason this
//     block is not decorative. shadow-grants.sql SECTION B was generated from
//     prod on 2026-07-28 and therefore CANNOT name the nine tables R0 adds;
//     the only thing that can arm those nine is SECTION A's `ALTER DEFAULT
//     PRIVILEGES … GRANT ALL ON TABLES`, and default privileges apply ONLY to
//     tables created AFTER the statement runs. So an operator who ran the file
//     once, after `db push` — which is the natural thing to do, and what an
//     operator returning to an already-pushed shadow will do — gets a shadow
//     where every pre-existing table is granted, every R0 table is readable
//     because the migrations said so, and NOTHING ever held a destructive verb
//     on a room table. In that state "authenticated holds no TRUNCATE here" is
//     printed by a database in which nobody ever held TRUNCATE on anything, and
//     the whole GRANT section, plus 20260729100000 §7's REVOKEs, is vacuous.
//     `GRANT ALL` is seven verbs; the R0 migrations grant, revoke and mention
//     five of them (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) and never touch
//     REFERENCES or TRIGGER. Those two therefore exist on an R0 table if and
//     only if the create-time bootstrap was armed when that table was created.
//
//     ⚠️ THE COUPLING, STATED SO IT CANNOT ROT SILENTLY: if a future revision of
//     20260729100000 §7 or 20260729100100 §7 ever issues `REVOKE ALL … FROM
//     authenticated` on these tables, this witness disappears and a correctly
//     provisioned shadow will abort here. The fix then is to move the witness to
//     another verb the migrations do not touch — not to delete it, because
//     without it nothing in this suite can tell the two shadows apart.
//
// THE REMEDY IS PRINTED ONCE, HERE, BECAUSE BOTH OBVIOUS ONES FAIL — AND THE
// SECOND ONE FAILS SILENTLY. Every abort below hands back PROVISION_RECIPE.
//   · Re-running the file in place does nothing: on a shadow where `db push` has
//     ALREADY run, SECTION A cannot retrofit anything. Default privileges are
//     consulted at CREATE TABLE time and never again, `db push` is a no-op the
//     second time, and the nine tables keep whatever they were created with.
//   · `supabase db reset` — the natural reading of "rebuild it" — is WORSE than
//     doing nothing, because it looks like compliance. It drops the schema and
//     then RE-APPLIES every migration in supabase/migrations/, so it hands back a
//     database in which the nine tables already exist and the migration ledger is
//     already full. Step 1 then has nothing to arm and step 2 nothing to push, and
//     the recipe deterministically reproduces the state that printed this message.
// The database has to be EMPTY when SECTION A runs, which means the schema drop
// and the ledger wipe, with no migration apply in between — or a fresh project.
const PROVISION_RECIPE =
  "FIX — AND IF `db push` HAS ALREADY RUN AGAINST THIS SHADOW, START BY EMPTYING IT.\n" +
  "SECTION A of shadow-grants.sql arms `ALTER DEFAULT PRIVILEGES`, which applies only to tables\n" +
  "created AFTER it runs. It cannot retrofit tables that already exist, so re-running it in place\n" +
  "on an already-pushed shadow succeeds and fixes nothing.\n\n" +
  "  # step 0 — empty it. Do NOT use `supabase db reset`: that re-applies every migration as part\n" +
  "  # of the reset, so the R0 tables are back before step 1 can arm anything and you land here again.\n" +
  "  psql \"$SHADOW_DB_URL\" -v ON_ERROR_STOP=1 \\\n" +
  "    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' \\\n" +
  "    -c 'DELETE FROM supabase_migrations.schema_migrations;'   # or re-create the shadow project\n" +
  "  psql \"$SHADOW_DB_URL\" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql   # pass 1: BEFORE db push\n" +
  "  supabase db push --db-url \"$SHADOW_DB_URL\"                                  # build the schema\n" +
  "  psql \"$SHADOW_DB_URL\" -v ROOM_QA_SHADOW=1 -f qa-harness/shadow-grants.sql   # pass 3: AFTER db push\n\n" +
  "pg_default_acl rows are SCHEMA-SCOPED, so the DROP above also clears any earlier arming — which\n" +
  "is why pass 1 comes after it, and why a later `db reset` silently un-arms a shadow that used to\n" +
  "pass. The re-created schema carries no USAGE for the client roles either; SECTION A re-grants it.\n\n" +
  "$SHADOW_DB_URL is the SHADOW database, never production (ivkvluezuiojovpotlyb). The\n" +
  "-v ROOM_QA_SHADOW=1 marker is required: shadow-grants.sql refuses to run without it, because\n" +
  "SECTION A permanently alters a database's grant model and `db push` writes schema.\n" +
  "The ORDERING block at the top of qa-harness/shadow-grants.sql is the authority.";
{
  const GRANT_SAMPLE = [
    ["offerings", "anon"], ["courses", "anon"], ["users", "anon"],
    ["enrolments", "anon"], ["cohort_batches", "anon"],
    ["cohort_batch_members", "anon"], ["cohort_weeks", "anon"],
    ["live_sessions", "anon"],
    ["cohort_room_configs", "authenticated"],
    ["cohort_room_members", "authenticated"],
    ["cohort_announcements", "authenticated"],
    ["cohort_room_posts", "authenticated"],
  ];
  const R0_CREATED = new Set([
    "cohort_room_configs", "cohort_room_members", "cohort_announcements",
    "cohort_resources", "cohort_room_posts", "cohort_room_post_replies",
    "cohort_recording_progress", "cohort_demo_entries", "cohort_room_seen",
  ]);
  // has_table_privilege() ERRORS on a missing table or role, so both are
  // resolved through LEFT JOINs and the call is guarded by a CASE that can only
  // reach it with two live oids. relkind is filtered for the same reason and it
  // is not belt-and-braces: has_table_privilege() raises on an index oid, so a
  // public index sharing a name with a sampled table would abort the run with a
  // raw SQL-channel error instead of a decoded message.
  const values = GRANT_SAMPLE.map(([t, g]) => `(${lit(t)}, ${lit(g)})`).join(", ");
  let grants;
  try {
    grants = await sql(`
      SELECT t.tbl, t.grantee,
             (c.oid IS NOT NULL) AS present,
             (r.oid IS NOT NULL) AS role_exists,
             -- has_ANY_COLUMN_privilege, NOT has_table_privilege. What this
             -- precondition needs to know is "can this role reach a row at all,
             -- so that a refusal below is RLS and not a missing GRANT" - and a
             -- role can reach rows through column-level grants with no
             -- table-level SELECT whatsoever. live_sessions and events are
             -- exactly that shape once the zoom_link / venue_link gate is real:
             -- table SELECT revoked, every other column granted individually.
             -- Asking has_table_privilege there reports "ungranted" for a
             -- perfectly readable table and aborts the whole run. This form is
             -- true under BOTH shapes and still false on a migrations-only
             -- shadow, where the role holds nothing at any granularity - which
             -- is the state this check exists to refuse.
             CASE WHEN c.oid IS NULL OR r.oid IS NULL THEN false
                  ELSE has_any_column_privilege(r.oid, c.oid, 'SELECT') END AS can_select,
             CASE WHEN c.oid IS NULL OR r.oid IS NULL THEN false
                  ELSE has_table_privilege(r.oid, c.oid, 'REFERENCES')
                    OR has_table_privilege(r.oid, c.oid, 'TRIGGER') END AS bootstrap_verb
        FROM (VALUES ${values}) AS t(tbl, grantee)
        LEFT JOIN pg_class c
          ON c.relname = t.tbl AND c.relnamespace = 'public'::regnamespace
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
        LEFT JOIN pg_roles r ON r.rolname = t.grantee
       ORDER BY 1`);
  } catch (e) {
    die(`Could not read table privileges through the SQL channel: ${e.message}`);
  }

  const missingRole = grants.filter((g) => !pgBool(g.role_exists));
  const missingTable = grants.filter((g) => pgBool(g.role_exists) && !pgBool(g.present));
  const ungranted = grants.filter(
    (g) => pgBool(g.role_exists) && pgBool(g.present) && !pgBool(g.can_select));
  const missingR0 = missingTable.filter((g) => R0_CREATED.has(g.tbl));
  const unbootstrapped = grants.filter(
    (g) => R0_CREATED.has(g.tbl) && pgBool(g.role_exists) && pgBool(g.present) &&
      !pgBool(g.bootstrap_verb));
  const show = (rows) => rows.map((g) => `${g.tbl}→${g.grantee}`).join(", ");

  if (missingRole.length) {
    die(
      "The client roles this suite depends on do not exist on this project — " +
        `${[...new Set(missingRole.map((g) => g.grantee))].join(", ")}. This is not a Supabase project ` +
        "in the shape the suite assumes, and every RLS assertion below would be meaningless."
    );
  }

  // ── USAGE ON SCHEMA public — a separate check because the table check cannot
  // see it. has_table_privilege() reports the table's own ACL and says nothing
  // about the schema above it, so a shadow can pass every assertion in the block
  // above while PostgREST is refused one level up. That is not hypothetical: it
  // is the state step 0 of PROVISION_RECIPE produces. `DROP SCHEMA public
  // CASCADE; CREATE SCHEMA public;` empties the database so SECTION A can arm the
  // create-time grant — and the re-created schema grants USAGE to its owner and
  // nobody else. SECTION A re-grants it on pass 1; an operator who emptied the
  // database and skipped straight to `db push` lands here. Failing loudly is the
  // point: a wrong-reason denial at the schema level prints the same word as the
  // wall holding, exactly like a wrong-reason denial at the table level.
  let schemaUsage;
  try {
    schemaUsage = await sql(`
      SELECT r.rolname AS grantee,
             CASE WHEN to_regnamespace('public') IS NULL THEN false
                  ELSE has_schema_privilege(r.oid, 'public', 'USAGE') END AS can_use
        FROM pg_roles r
       WHERE r.rolname IN (${["anon", "authenticated", "service_role"].map(lit).join(", ")})
       ORDER BY 1`);
  } catch (e) {
    die(`Could not read schema privileges through the SQL channel: ${e.message}`);
  }
  const noSchemaUsage = schemaUsage.filter((r) => !pgBool(r.can_use));
  if (noSchemaUsage.length) {
    die(
      "THE CLIENT ROLES HAVE NO USAGE ON SCHEMA public — REFUSING TO RUN. EVERY REQUEST IN THIS\n" +
        "SUITE WOULD BE REFUSED ABOVE THE TABLE ACL, WHICH READS EXACTLY LIKE THE WALL HOLDING.\n\n" +
        `  no USAGE on schema public: ${noSchemaUsage.map((r) => r.grantee).join(", ")}\n\n` +
        "This is the signature of a database emptied for step 0 and then pushed WITHOUT pass 1: a\n" +
        "freshly re-created schema grants USAGE to its owner only. shadow-grants.sql SECTION A\n" +
        "restores it, and it has to run. Re-run the recipe from the top — the DROP first, then pass 1,\n" +
        "then `db push` — because the same pass also arms the create-time default privileges that\n" +
        "the nine tables R0 creates can only receive while they do not yet exist.\n\n" +
        PROVISION_RECIPE
    );
  }

  if (missingR0.length) {
    die(
      "THE R0 MIGRATIONS ARE NOT ON THIS PROJECT — NOT ONE ASSERTION RAN.\n" +
        `  missing: ${show(missingR0)}\n\n` +
        "20260729100000 / 20260729100100 / 20260729100200 have to be applied to the shadow. Do NOT " +
        "just run `db push`:\nthe pass that arms the create-time grants has to precede it, or the " +
        "tables it creates arrive ungranted and\nthe next abort in this block is the one you will " +
        "hit instead.\n\n" +
        PROVISION_RECIPE
    );
  }
  if (ungranted.length || missingTable.length) {
    die(
      "THE SHADOW IS UNGRANTED — REFUSING TO RUN, BECAUSE EVERY RLS ASSERTION IN THIS SUITE\n" +
        "WOULD PASS VACUOUSLY AND THE RUN WOULD PRINT A GREEN SUMMARY THAT PROVES NOTHING.\n\n" +
        (ungranted.length
          ? `  no SELECT: ${show(ungranted)}\n`
          : "") +
        (missingTable.length ? `  table absent entirely: ${show(missingTable)}\n` : "") +
        "\nPostgreSQL checks the table GRANT before it ever consults a row policy. With the grant\n" +
        "missing, `outsider reads offering A → denied` is the GRANT refusing, not the wall holding —\n" +
        "and this file prints the same word either way. A database built from supabase/migrations/\n" +
        "alone does NOT reproduce production's grants: on a clean local stack only 3 of 103 public\n" +
        "tables grant SELECT to anon. Production grants anon/authenticated/service_role full DML and\n" +
        "relies on RLS as the gate, applied by the hosted platform's bootstrap rather than by any\n" +
        "migration in this repo.\n\n" +
        PROVISION_RECIPE
    );
  }
  if (unbootstrapped.length) {
    die(
      "THE SHADOW WAS BUILT IN THE WRONG ORDER — REFUSING TO RUN. THE R0 TABLES EXIST AND ARE\n" +
        "READABLE, BUT THEY WERE CREATED WITHOUT PRODUCTION'S CREATE-TIME GRANT, SO EVERY \"THE\n" +
        "CLIENT ROLE DOES NOT HOLD VERB X ON A ROOM TABLE\" ASSERTION BELOW WOULD BE VACUOUS.\n\n" +
        `  no REFERENCES and no TRIGGER: ${show(unbootstrapped)}\n\n` +
        "WHAT THAT MEASURES. `GRANT ALL ON TABLES` is seven verbs. The R0 migrations grant, revoke\n" +
        "or mention five of them and never touch REFERENCES or TRIGGER — so those two are present on\n" +
        "an R0 table if and only if shadow-grants.sql's SECTION A was armed BEFORE that table was\n" +
        "created. Their absence means SECTION A ran late or never. The consequence is not cosmetic:\n" +
        "20260729100000 §7's `REVOKE INSERT, UPDATE, DELETE, TRUNCATE … FROM authenticated` and\n" +
        "20260729100100 §7's `REVOKE TRUNCATE … FROM authenticated` are the statements this suite's\n" +
        "GRANT section exists to verify, and on this shadow they took back nothing, because nothing\n" +
        "was ever handed out. A REVOKE that was never needed prints the same word as a REVOKE that\n" +
        "worked.\n\n" +
        PROVISION_RECIPE
    );
  }
  console.log(
    `${C.d}precondition: ${schemaUsage.length} client roles hold USAGE on schema public; ` +
      `${grants.length} representative grants verified ` +
      `(${GRANT_SAMPLE.filter(([t]) => !R0_CREATED.has(t)).length} pre-existing tables readable by anon; ` +
      `${GRANT_SAMPLE.filter(([t]) => R0_CREATED.has(t)).length} R0-created tables readable by authenticated ` +
      "AND carrying the bootstrap-only REFERENCES/TRIGGER pair, so they were created under " +
      `production's create-time grant) — this shadow gates on RLS, not on a missing GRANT${C.x}`
  );
}

await loadKeys();

// ── Build the world ─────────────────────────────────────────────────────────
section("PRE — the fixture world", "two batches under offering A, one under B, canaries split per batch");
const password = await resetAuthUsers();
const fixtureSql = readFileSync(resolve(HERE, "cohort-room-fixtures.sql"), "utf8");
let world;
try {
  world = (await sql(fixtureSql))[0];
} catch (e) {
  // The batch is applied as ONE statement, so the server hands back exactly one
  // SQLSTATE. Name what each class actually means instead of guessing at the
  // migrations — a wrong diagnosis here sent the 2026-07-27 review chasing the
  // wrong file for a plain CHECK-constraint violation in this fixture.
  die(
    "Fixtures failed to apply — NOT ONE ASSERTION RAN, so this run proves nothing.\n" +
      `${e.message}\n\n` +
      "Reading the SQLSTATE:\n" +
      "  42P01 / 42883  a table or function is missing → the R0 migrations " +
      "(20260729100000/100100/100200) are not on this project. Apply them first.\n" +
      "  23514          a CHECK constraint rejected a fixture value → this file " +
      "disagrees with the schema (e.g. offerings.type only accepts " +
      "'onetime'|'subscription'). Fix the fixture, not the migrations.\n" +
      "  22P02          a literal was written into a typed column → almost always " +
      "a text id in a uuid column on cohort_applications.\n" +
      "  42501          the SQL channel lacks privilege → check SUPABASE_PAT."
  );
}
await signIn(password);

prove("PRE.1",
  "the fixture world exists: two offerings, three batches, three room configs, seven sessions and — the piece whose absence silently voided every session probe before the 2026-07-27 review — an offering_courses row per offering, which is what live_sessions RLS actually resolves through",
  Number(world?.offerings) === 2 && Number(world?.batches) === 3 &&
    Number(world?.configs) === 3 && Number(world?.sessions) === 7 &&
    Number(world?.course_maps) === 2,
  `offerings=${world?.offerings} batches=${world?.batches} configs=${world?.configs} sessions=${world?.sessions} offering_courses=${world?.course_maps}; ` +
    `membership rows derived so far=${world?.memberships} (reported, not asserted — the SHAPE of each one is what matters and PRE.2–PRE.7 assert that per actor; ` +
    "the raw count is inflated by the retracted batch-less rows branch (c) leaves behind for every roster member, which is correct behaviour and a poor thing to pin a number to)");

prove("PRE.1b",
  "the three seeds the ten-surface matrix depends on are present — a cohort_room_seen watermark, a recording position and an attendance mark — and BOTH clock-dependent rows are inside their windows right now: exactly one live session RUNNING, and the CANCELLED decoy also still running. Without the running row, 'which session is this week's session' has the same answer under a correct ordering and a broken one; without the decoy still being in ITS window, PROG.2's demotion claim would be won on timing alone and would pass with the cancelled sort key deleted. The decoy leaves its window 60 minutes after the fixtures apply — half the live session's margin, and the tightest clock dependency in the run — so it is asserted here rather than assumed, and a slow or re-used (ROOM_QA_KEEP=1) world fails HERE, by name",
  Number(world?.room_seen) === 1 && Number(world?.rec_progress) === 1 &&
    Number(world?.attendance) === 1 && Number(world?.running_sessions) === 1 &&
    Number(world?.cancelled_running) === 1,
  `cohort_room_seen=${world?.room_seen} cohort_recording_progress=${world?.rec_progress} ` +
    `cohort_week_attendance=${world?.attendance} currently-running sessions=${world?.running_sessions} ` +
    `cancelled-but-still-in-window sessions=${world?.cancelled_running}`);

const ids = await sqlOne(`
  SELECT
    (SELECT id FROM public.offerings WHERE slug = 'room-qa-offering-a') AS offering_a,
    (SELECT id FROM public.offerings WHERE slug = 'room-qa-offering-b') AS offering_b,
    (SELECT id FROM public.cohort_batches WHERE name = 'ROOM QA Batch A1') AS batch_a1,
    (SELECT id FROM public.cohort_batches WHERE name = 'ROOM QA Batch A2') AS batch_a2,
    (SELECT id FROM public.cohort_batches WHERE name = 'ROOM QA Batch B1') AS batch_b1,
    (SELECT p.id FROM public.cohort_room_posts p JOIN public.cohort_batches b ON b.id = p.batch_id
      WHERE b.name = 'ROOM QA Batch A1' LIMIT 1) AS post_a1,
    (SELECT d.id FROM public.cohort_demo_entries d JOIN public.cohort_batches b ON b.id = d.batch_id
      WHERE b.name = 'ROOM QA Batch A1' LIMIT 1) AS demo_a1,
    (SELECT d.id FROM public.cohort_demo_entries d JOIN public.cohort_batches b ON b.id = d.batch_id
      WHERE b.name = 'ROOM QA Batch A2' LIMIT 1) AS demo_a2,
    (SELECT id FROM public.live_sessions WHERE title = 'ROOM QA A1 PAST session') AS session_past_a1,
    (SELECT id FROM public.live_sessions WHERE title = 'ROOM QA A1 FAR session') AS session_far_a1,
    (SELECT id FROM public.live_sessions WHERE title = 'ROOM QA A1 NEAR session') AS session_near_a1,
    (SELECT id FROM public.live_sessions WHERE title = 'ROOM QA A1 LIVE session') AS session_live_a1,
    (SELECT id FROM public.live_sessions WHERE title = 'ROOM QA A1 CANCELLED session') AS session_cancelled_a1,
    (SELECT id FROM public.live_sessions WHERE title = 'ROOM QA A2 session') AS session_a2,
    (SELECT id FROM public.live_sessions WHERE title = 'ROOM QA B1 session') AS session_b1,
    (SELECT w.id FROM public.cohort_weeks w JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
      WHERE b.name = 'ROOM QA Batch A1' LIMIT 1) AS week_a1,
    (SELECT w.id FROM public.cohort_weeks w JOIN public.cohort_batches b ON b.id = w.cohort_batch_id
      WHERE b.name = 'ROOM QA Batch A2' LIMIT 1) AS week_a2
`);

// Every room-content surface for offering A, as an outsider would probe it.
//
// live_sessions is deliberately NOT `select=*`: 20260408151600 carries a
// column-level REVOKE SELECT (zoom_link) FROM anon, authenticated, so a star
// projection comes back as a column-privilege error for EVERY actor and the
// probe stops being an RLS row-isolation result at all. The explicit list is
// the shape a real client uses; the column REVOKE itself is attacked separately
// and on purpose in C2.
//
// ALL TEN ROOM-CONTENT SURFACES, not the eight this list used to carry. The
// two that were missing are the two own-row tables — cohort_room_seen (which
// had no reference anywhere in this file and no fixture row at all) and
// cohort_recording_progress (referenced exactly once, member-against-member).
// Leaving them out did not weaken any single case; it weakened the SENTENCE
// every case rolls up into, because "accepted_A reads EVERY room-content
// surface and gets nothing" was being asserted over 8/10 of them.
const SURFACES_A = [
  ["cohort_announcements", `cohort_announcements?offering_id=eq.${ids.offering_a}&select=*`],
  ["cohort_resources", `cohort_resources?offering_id=eq.${ids.offering_a}&select=*`],
  ["cohort_room_posts", `cohort_room_posts?offering_id=eq.${ids.offering_a}&select=*`],
  ["cohort_room_post_replies", `cohort_room_post_replies?post_id=eq.${ids.post_a1}&select=*`],
  ["cohort_demo_entries", `cohort_demo_entries?offering_id=eq.${ids.offering_a}&select=*`],
  ["cohort_weeks", `cohort_weeks?cohort_batch_id=in.(${ids.batch_a1},${ids.batch_a2})&select=*`],
  ["live_sessions", `live_sessions?title=like.ROOM%20QA%20A*&select=id,title,scheduled_at,duration_minutes,status,recording_url,week_id,course_id`],
  ["cohort_room_configs", `cohort_room_configs?offering_id=eq.${ids.offering_a}&select=*`],
  // Own-row tables. An attacker gets zero rows here by ownership as well as by
  // room access, which is exactly why they need a sentinel: without one, their
  // zero is indistinguishable from an empty table and carries no information.
  ["cohort_recording_progress", `cohort_recording_progress?live_session_id=eq.${ids.session_past_a1}&select=*`],
  ["cohort_room_seen", `cohort_room_seen?offering_id=eq.${ids.offering_a}&select=*`],
];

/**
 * The sentinel each surface MUST hand a legitimate batch-A1 member. A surface
 * with no sentinel here has no positive control, and a surface with no positive
 * control cannot support a "0 rows = the wall held" claim — it may simply be
 * empty or unreachable for reasons nothing to do with access. Every one of the
 * TEN is covered; the two own-row tables carry timestamp sentinels because
 * neither has a text column to hide a word in (see the CANARY map).
 */
const POSITIVE_CONTROL = {
  cohort_announcements: CANARY.A1,
  cohort_resources: CANARY.A1,
  cohort_room_posts: CANARY.A1,
  cohort_room_post_replies: CANARY.A1,
  cohort_demo_entries: CANARY.A1,
  cohort_weeks: CANARY.CURRIC_A1,
  live_sessions: CANARY.REC_A1,
  cohort_room_configs: CANARY.CONFIG_A,
  cohort_recording_progress: CANARY.RECPROG_A1,
  cohort_room_seen: CANARY.SEEN_A1,
};

/**
 * The two MEMBER-PRIVATE curriculum tables. They are not room-content surfaces
 * — they predate the room and are governed by their own older policies — so
 * they are deliberately not in SURFACES_A and not part of the "every room
 * surface" claim. They are probed alongside it wherever a sweep hunts the
 * FEEDBACK or ATTEND sentinels, because those two sentinels live nowhere else:
 * a window that never queries these tables cannot find them, and under the
 * reachability rule that is now a failure rather than a quiet pass.
 */
const MEMBER_PRIVATE_A = [
  ["cohort_week_submissions", `cohort_week_submissions?cohort_week_id=eq.${ids.week_a1}&select=*`],
  ["cohort_week_attendance", `cohort_week_attendance?cohort_week_id=eq.${ids.week_a1}&select=*`],
];

/**
 * Which wall governs each surface's REVOCATION semantics.
 *
 * R0 owns the six room-content tables plus cohort_room_configs: all of them
 * route through cohort_room_can_access() / the membership row the resolver
 * retracts. cohort_weeks does NOT — it is governed by the pre-existing
 * `cohort_weeks_student_read` (20260526180000:322), which R-2's own header says
 * neither R-1 nor R-2 widens, and which R0 therefore also does not narrow. That
 * asymmetry is measured as GAP-1 rather than asserted away in either direction.
 * live_sessions is likewise pre-existing, but its policies DO carry
 * `status = 'active'`, so revocation closes it and it stays in the owned set.
 */
const R0_OWNED_SURFACES = SURFACES_A.filter(([name]) => name !== "cohort_weeks");
const LEGACY_SURFACES = SURFACES_A.filter(([name]) => name === "cohort_weeks");

// ── Membership preflight. Prove the fixture built the world through the REAL
//    paths — otherwise every case below is theatre. ─────────────────────────
{
  const rows = await sql(`
    SELECT u.email, m.role, m.source, m.status, m.batch_id
      FROM public.cohort_room_members m
      JOIN public.users u ON u.id = m.user_id
     WHERE m.offering_id = ${lit(ids.offering_a)}`);
  // ACTIVE ROWS FIRST, because a roster member legitimately owns TWO rows here.
  // The fixture inserts the enrolment before the batch-roster row, so resolver
  // branch (a2) mints a batch-less `member` row first (a real purchase whose
  // roster placement has not happened yet), and the roster write then mints the
  // batch-scoped row and branch (c) retracts the batch-less one to 'revoked'.
  // Both rows survive by design — revocation is a status flip, not a delete —
  // so an unordered [0] would sometimes hand the assertions the retracted row
  // and fail PRE.2 for a reason that has nothing to do with access.
  const by = (email) =>
    rows
      .filter((r) => (r.email || "").startsWith(email))
      .sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));

  const a1 = by("room-qa-member-a1")[0];
  prove("PRE.2",
    "member_A1's membership was DERIVED by the resolver from a real enrolment + batch roster row — membership is server-derived, never client-claimed (NFR-SEC-1)",
    a1?.role === "member" && a1?.source === "derived" && a1?.status === "active" && a1?.batch_id === ids.batch_a1,
    a1 ? `role=${a1.role} source=${a1.source} status=${a1.status} batch=${a1.batch_id === ids.batch_a1 ? "A1" : a1.batch_id}` : "no membership row was derived");

  const a2 = by("room-qa-member-a2")[0];
  prove("PRE.3",
    "member_A2 is a derived member of batch A2 of the SAME offering — the two-batch fixture that makes cross-batch isolation testable at all",
    a2?.role === "member" && a2?.batch_id === ids.batch_a2,
    a2 ? `role=${a2.role} batch=${a2.batch_id === ids.batch_a2 ? "A2" : a2.batch_id}` : "no membership row was derived");

  const mentor = by("room-qa-mentor-a")[0];
  prove("PRE.4",
    "mentor_A holds a MANUAL, offering-wide grant (batch_id NULL) that the resolver did not touch — staff access survives re-derivation",
    mentor?.role === "mentor" && mentor?.source === "manual" && mentor?.batch_id === null,
    mentor ? `role=${mentor.role} source=${mentor.source} batch=${mentor.batch_id}` : "no mentor row");

  const pre = by("room-qa-pre-member")[0];
  prove("PRE.5",
    "pre_member_A1 was created by the REAL confirmation_payment_id path (application stamped confirmation_paid), and landed as `pre_member` — NOT widened into `member`",
    pre?.role === "pre_member" && pre?.status === "active",
    pre ? `role=${pre.role} source=${pre.source} batch=${pre.batch_id ?? "NULL (offering-wide lobby)"}`
        : "no pre_member row appeared — R-1's cohort_applications trigger / resolver branch is missing");

  // THE SECOND LOBBY SHAPE. Same tier, different truth underneath it: an ACTIVE
  // enrolment that still owes a balance. R-1 branch (a2) stands down on
  // _room_balance_outstanding() and branch (b) claims the row instead, so the
  // room tier is identical — while every April-era policy that asks only "is
  // there an active enrolment?" now answers YES. Both halves are asserted
  // because GAP-4's whole meaning depends on them: a lobby row proves the tier,
  // the active enrolment proves the residue is not simply this actor being an
  // ordinary member.
  const staged = by("room-qa-staged-lobby")[0];
  const stagedEnrol = await sqlOne(
    `SELECT count(*)::int AS n FROM public.enrolments
      WHERE user_id = ${lit(session.staged_lobby_A1.id)}
        AND offering_id = ${lit(ids.offering_a)} AND status = 'active'`);
  prove("PRE.5b",
    "staged_lobby_A1 holds the SAME `pre_member` room tier while carrying an ACTIVE enrolment with an outstanding balance — the shape the staged payment path actually mints, and the one R-1's own header (20260729100000:906-918) flags as the un-closed hole in the April live_sessions policies. The room resolver refuses to promote them (branch (a2) is gated on the balance, not on the enrolments table), so anything they reach through live_sessions is reached in spite of the tier, not because of it",
    staged?.role === "pre_member" && staged?.status === "active" && stagedEnrol?.n === 1,
    staged ? `role=${staged.role} source=${staged.source} status=${staged.status} batch=${staged.batch_id ?? "NULL"}; active enrolments in offering A: ${stagedEnrol?.n}`
           : `no membership row for the staged lobby actor; active enrolments in offering A: ${stagedEnrol?.n}`);

  const accepted = by("room-qa-accepted-a");
  prove("PRE.6",
    "accepted_A has NO membership row of any kind — MEMBER-1: `accepted` is a marketing-class veil, not a tier of room access",
    accepted.length === 0,
    accepted.length === 0 ? "0 rows in cohort_room_members" : `unexpected: ${JSON.stringify(accepted)}`);

  const outsider = await sql(
    `SELECT count(*)::int AS n FROM public.cohort_room_members WHERE user_id = ${lit(session.outsider.id)}`);
  prove("PRE.7", "outsider is an authenticated user with zero rooms — the control actor for every read attack",
    outsider[0].n === 0, `${outsider[0].n} membership rows`);
}

// Positive control: the canaries are real, findable data — so a later "0 hits"
// result means the wall held, not that the fixture was empty.
section("PRE — positive controls", "if a member cannot see the canaries, every later 'no leak' result is vacuous");
{
  // PER-SURFACE, never aggregated. An aggregate ("all eight calls returned 200,
  // and the canary turned up at least five times somewhere") is satisfied by a
  // surface that RLS filtered to nothing: PostgREST answers 200 [] for that, and
  // the other surfaces' hits cover the shortfall. Every downstream "0 rows = the
  // wall held" claim on that surface would then be vacuous — which is precisely
  // the failure this section exists to make impossible.
  for (const [name, path] of SURFACES_A) {
    const needle = POSITIVE_CONTROL[name];
    const r = await read("member_A1", path, `${name}(A) as member_A1 [positive control]`);
    const armed = r.ok && r.rows > 0 && r.text.includes(needle);
    prove(`PRE.8.${name}`,
      `member_A1 reads their own ${name} and the row carries ${needle} — this surface is ARMED, so a later "0 rows" from anyone else is the wall holding and not an empty table`,
      armed,
      r.ok
        ? `${r.rows} row(s); sentinel ${needle} ${r.text.includes(needle) ? "present" : "ABSENT — this surface proves nothing downstream"}`
        : r.describe);
  }

  const envelope = await rpc("member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) as member_A1");
  prove("PRE.8.envelope",
    "the sanctioned read RPC also opens for member_A1 and returns a room envelope — the RPC path is armed alongside the table paths, so an R4/R10/L1 raise later is a refusal and not a broken function",
    envelope.ok && !!envelope.json?.config, envelope.describe);

  prove("PRE.9",
    "the offering-wide announcement (batch_id NULL) reaches a batch-A1 member — an all-batches notice is not accidentally batch-filtered out",
    corpusHits("member_A1", "ROOMQA_ALLBATCH_A").length > 0,
    `seen in: ${corpusHits("member_A1", "ROOMQA_ALLBATCH_A").join(", ") || "nowhere"}`);

  // member_B's own room must be armed too, or R1's "member_B sees nothing of A"
  // is indistinguishable from "member_B sees nothing, full stop".
  const bAnn = await read("member_B", `cohort_announcements?offering_id=eq.${ids.offering_b}&select=*`, "announcements(B) as member_B [positive control]");
  const bSessions = await read("member_B",
    `live_sessions?title=like.ROOM%20QA%20B*&select=id,title,scheduled_at,status,recording_url`,
    "sessions(B) as member_B [positive control]");
  prove("PRE.11",
    "member_B can read their OWN offering's noticeboard and their OWN course's sessions — member_B is a fully-provisioned member of a different cohort, which is what makes every zero they get from offering A a boundary result rather than an empty account",
    bAnn.ok && bAnn.rows > 0 && bAnn.text.includes(CANARY.B1) && bSessions.ok && bSessions.rows > 0,
    `announcements(B): ${bAnn.describe}, B1 sentinel ${bAnn.text.includes(CANARY.B1)}; sessions(B): ${bSessions.describe}`);

  const bWeeks = await read("member_B", `cohort_weeks?cohort_batch_id=eq.${ids.batch_b1}&select=*`,
    "weeks(B) as member_B [positive control]");
  prove("PRE.12",
    "member_B's own curriculum body and assignment brief are readable BY member_B — the offering-B sentinels are real, findable rows, which is the only thing that makes the offering-A actors' later zeros on those same strings a wall rather than an empty offering",
    bWeeks.ok && bWeeks.rows > 0 && bWeeks.text.includes(CANARY.CURRIC_B1) && bWeeks.text.includes(CANARY.ASSIGN_B1),
    `${bWeeks.describe}; ${CANARY.CURRIC_B1}=${bWeeks.text.includes(CANARY.CURRIC_B1)} ${CANARY.ASSIGN_B1}=${bWeeks.text.includes(CANARY.ASSIGN_B1)}`);

  const a2Weeks = await read("member_A2", `cohort_weeks?cohort_batch_id=eq.${ids.batch_a2}&select=*`,
    "weeks(A2) as member_A2 [positive control]");
  prove("PRE.13",
    "batch A2's own curriculum body and assignment brief are readable by a batch-A2 member — the sibling batch's material exists and is findable, so member_A1's zero on those two strings is batch isolation and not an empty sibling batch",
    a2Weeks.ok && a2Weeks.rows > 0 && a2Weeks.text.includes(CANARY.CURRIC_A2) && a2Weeks.text.includes(CANARY.ASSIGN_A2),
    `${a2Weeks.describe}; ${CANARY.CURRIC_A2}=${a2Weeks.text.includes(CANARY.CURRIC_A2)} ${CANARY.ASSIGN_A2}=${a2Weeks.text.includes(CANARY.ASSIGN_A2)}`);

  const a1Attend = await read("member_A1", `cohort_week_attendance?cohort_week_id=eq.${ids.week_a1}&select=*`,
    "own attendance as member_A1 [positive control]");
  const a1Sub = await read("member_A1", `cohort_week_submissions?cohort_week_id=eq.${ids.week_a1}&select=*`,
    "own submission + mentor feedback as member_A1 [positive control]");
  prove("PRE.14",
    "member_A1 reads their own attendance mark and their own mentor feedback — the two member-private facts that ride get_cohort_progress: both are armed, so a zero from a room-mate, a lobby occupant or an outsider later is ownership being enforced and not a table nobody ever wrote to",
    a1Attend.ok && a1Attend.rows > 0 && a1Attend.text.includes(CANARY.ATTEND_A1) &&
      a1Sub.ok && a1Sub.rows > 0 && a1Sub.text.includes(CANARY.FEEDBACK_A1),
    `attendance: ${a1Attend.describe}, sentinel=${a1Attend.text.includes(CANARY.ATTEND_A1)}; submission: ${a1Sub.describe}, sentinel=${a1Sub.text.includes(CANARY.FEEDBACK_A1)}`);

  // The PII sentinels are the one pair NO room actor may ever receive, so their
  // arming cannot come from a room read. It comes from the one role that IS
  // entitled to them: users_read_own admits `OR is_admin()`. Without this, "the
  // roster carries no PII canary" would also be satisfied by a fixture that
  // never planted one.
  const adminUsers = await read("admin", "users?select=*&limit=200", "users table as admin [PII positive control]");
  prove("PRE.15",
    "an ADMIN reads the users table and finds both PII sentinels in it — mentor_A's and member_A2's phone/email are genuinely planted, so every later 'the PII canary is absent' result is a projection guarantee rather than a grep for a string that was never written",
    adminUsers.ok && adminUsers.text.includes(CANARY.PII_A1) && adminUsers.text.includes(CANARY.PII_A2),
    adminUsers.ok
      ? `${adminUsers.rows} row(s); ${CANARY.PII_A1}=${adminUsers.text.includes(CANARY.PII_A1)} ${CANARY.PII_A2}=${adminUsers.text.includes(CANARY.PII_A2)}`
      : adminUsers.describe);
}

// ── SEC-ENT-2 — the room is downstream of the money, never in front of it ───
//
// THE HIGHEST-CONSEQUENCE GUARANTEE IN THE PHASE, AND IT HAD ZERO CASES. Every
// other failure in this file costs privacy. This one costs a student their
// enrolment: four AFTER triggers on cohort_batch_members, enrolments and
// cohort_applications call the resolver, and an unguarded error in any of them
// rolls back the payment write it is attached to. Until now the only evidence
// for it was prose describing a PGlite run against stand-in tables — which is
// evidence about stand-in tables.
//
// The failure is injected from OUTSIDE, exactly as the migration's contract
// note 8 (20260729100000:183-200) prescribes, because no test backdoor is
// compiled into the migration: a NOT VALID CHECK makes every resolver write to
// cohort_room_members throw, and a renamed table behind a raising view makes a
// trigger's OWN driving query throw. Both halves are needed — the first can
// only ever prove the inner guard, and the outer one is where the 2026-07
// review found the hole.
//
// FIRST, THE ARMING — WITHOUT WHICH THIS WHOLE SECTION PASSES ON NOTHING.
// Every case below asserts "the money write committed AND no membership row
// appeared". That second half is byte-identical to "the trigger was never
// attached, so the forced failure was never reached" — and an unattached
// trigger is not hypothetical here: §5 of the backbone migration attaches all
// four inside DO blocks that swallow a failed attachment into RAISE WARNING,
// bounded by a 1s lock_timeout, as an explicitly accepted degradation. On a
// shadow project where two of them lost that race, this section used to print
// five green claims about a guard that never executed. So:
//   .0a  the four triggers exist on their tables and are ENABLED (the migration's
//        own section-8 VERIFY query, run as an assertion instead of a comment);
//   .0b  with NOTHING armed, the same enrolment INSERT and the same roster
//        INSERT DO derive a membership row — the positive control that turns
//        every "0 membership rows" below into evidence about the guard.
//
// THEN THE FOUR FAILURE CASES, and the third is the one that matters most:
//   .1  a plain error inside the resolver              (23514)
//   .2  the same, on the roster-write trigger path     (23514)
//   .3  a CANCELLED statement inside the resolver      (57014)
//   .4  a failure in the trigger's own driving query   (P0001)
// .3 exists because plpgsql's `WHEN OTHERS` does NOT match query_canceled: a
// statement_timeout landing inside the resolver propagates straight through a
// handler that catches everything else, and the enrolment INSERT it was
// attached to is rolled back. Timeouts land on the busiest node under the
// heaviest load — which is checkout. The cancel is injected by SQLSTATE rather
// than by wall clock on purpose: a real timeout has to be raced, and a case
// that only fails when the machine is slow is a case that never fails.
section("SEC-ENT-2 — a failing room trigger can never block an enrolment",
  "inviolable rule #4: enrolment is the money path and the room hangs off it, so the room's failures are the room's to absorb");
{
  const OUT = session.outsider.id;
  const attempt = async (q) => {
    try {
      return { ok: true, rows: await sql(q) };
    } catch (e) {
      return { ok: false, error: e.message.slice(0, 300) };
    }
  };
  const enrolInto = (slug) => `
    INSERT INTO public.enrolments (user_id, offering_id, status, source)
    SELECT ${lit(OUT)}, o.id, 'active', 'admin_grant'
      FROM public.offerings o WHERE o.slug = ${lit(slug)}
    RETURNING id;`;
  const memberRows = () =>
    sqlOne(`SELECT count(*)::int AS n FROM public.cohort_room_members WHERE user_id = ${lit(OUT)}`);
  const DISARM = `
    ALTER TABLE public.cohort_room_members DROP CONSTRAINT IF EXISTS tmp_room_qa_force_fail;
    ALTER TABLE public.cohort_room_members DROP CONSTRAINT IF EXISTS tmp_room_qa_force_cancel;
    SELECT 1;`;

  // ── .0a  The four guarded trigger attachments ───────────────────────────────
  const triggers = await sql(`
    SELECT v.tgname,
           CASE WHEN t.oid IS NULL THEN 'MISSING'
                WHEN t.tgenabled = 'D' THEN 'DISABLED'
                ELSE 'ok' END AS verdict
      FROM (VALUES
        ('cohort_batch_members', 'room_resolve_on_batch_member'),
        ('enrolments',           'room_resolve_on_enrolment_status'),
        ('enrolments',           'room_resolve_on_enrolment_insert'),
        ('cohort_applications',  'room_resolve_on_application_status')
      ) AS v(tbl, tgname)
      LEFT JOIN pg_trigger t
        ON t.tgname  = v.tgname
       AND t.tgrelid = to_regclass('public.' || v.tbl)
       AND NOT t.tgisinternal
     ORDER BY 1`);
  const badTriggers = triggers.filter((t) => t.verdict !== "ok");
  prove("SEC-ENT-2.0a",
    "all four resolver triggers are attached to the money tables and enabled — cohort_batch_members, both enrolments triggers and cohort_applications. R-1 attaches them inside DO blocks whose handler downgrades a failed attachment to a WARNING under a 1s lock_timeout, so 'the trigger is not there' is a documented, expected outcome of a busy `db push`, not a hypothetical; and with it absent every forced-failure case below would commit its write, find zero membership rows and print PASS having executed no guard at all",
    triggers.length === 4 && badTriggers.length === 0,
    triggers.length === 4
      ? triggers.map((t) => `${t.tgname}:${t.verdict}`).join(" · ")
      : `expected 4 rows from pg_trigger, got ${triggers.length} — ${JSON.stringify(triggers).slice(0, 200)}`);

  // ── .0b  The positive control: nothing armed, the resolver DOES fire ────────
  const armA = await attempt(enrolInto("room-qa-offering-a"));
  const armEnrol = armA.ok ? armA.rows[0]?.id : null;
  const armRow = await sqlOne(
    `SELECT role, source, status, batch_id FROM public.cohort_room_members
      WHERE user_id = ${lit(OUT)} AND offering_id = ${lit(ids.offering_a)}`);
  const armRoster = await attempt(`
    INSERT INTO public.cohort_batch_members (batch_id, enrolment_id)
    VALUES (${lit(ids.batch_a1)}, ${lit(armEnrol)}) RETURNING id;`);
  const armRowScoped = await sqlOne(
    `SELECT role, batch_id FROM public.cohort_room_members
      WHERE user_id = ${lit(OUT)} AND offering_id = ${lit(ids.offering_a)}
        AND batch_id = ${lit(ids.batch_a1)}`);
  prove("SEC-ENT-2.0b",
    "with no failure armed, that same enrolment INSERT derives a membership row through resolver branch (a2) — and putting the student on a batch roster re-derives it batch-scoped through branch (a). Both writes below are therefore proven to REACH the resolver, which is the difference between 'the guard absorbed a failure' and 'nothing ever ran': the enrolment and roster paths this section attacks are live on this project right now",
    armA.ok && armRow?.role === "member" && armRow?.source === "derived" &&
      armRow?.status === "active" && armRow?.batch_id === null &&
      armRoster.ok && armRowScoped?.batch_id === ids.batch_a1,
    armA.ok
      ? `after the enrolment INSERT: role=${armRow?.role} source=${armRow?.source} status=${armRow?.status} batch=${armRow?.batch_id ?? "NULL (branch a2)"}; ` +
        `after the roster INSERT: batch=${armRowScoped?.batch_id === ids.batch_a1 ? "A1 (branch a)" : armRowScoped?.batch_id ?? "none"}`
      : `the control enrolment itself failed: ${armA.error}`);

  // Back to zero before anything is armed — .1 re-runs this exact INSERT and
  // reads the membership count as its evidence, so a leftover row from the
  // control would read as a resolver that ran while it was supposed to be
  // throwing. Order matters: the roster row references the enrolment.
  await sql(`
    DELETE FROM public.cohort_batch_members
     WHERE enrolment_id IN (SELECT id FROM public.enrolments WHERE user_id = ${lit(OUT)});
    DELETE FROM public.enrolments WHERE user_id = ${lit(OUT)};
    DELETE FROM public.cohort_room_members WHERE user_id = ${lit(OUT)};
    SELECT 1;`);

  /**
   * THE SIDE CHANNEL THAT SURVIVES THE ROLLBACK, and the reason .3 can prove
   * the guard EXECUTED rather than merely that the enrolment committed.
   *
   * _room_qa_cancel() raises inside the trigger's subtransaction, and the guard
   * catching it rolls that subtransaction back — so anything the function wrote
   * to a counter TABLE is undone with it and reads as zero. A counter table
   * therefore proves nothing. `nextval()` is explicitly non-transactional: the
   * bump is not rolled back, by design, so a sequence read before and after the
   * INSERT is the one witness that says "the cancelled path was entered".
   */
  const cancelCount = async () => {
    const r = await sqlOne(
      `SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END AS n
         FROM public._room_qa_cancel_seq`);
    return Number(r?.n ?? -1);
  };

  let enrolA = null;
  let enrolB = null;
  try {
    await sql(`
      DROP SEQUENCE IF EXISTS public._room_qa_cancel_seq;
      CREATE SEQUENCE public._room_qa_cancel_seq START 1;
      CREATE OR REPLACE FUNCTION public._room_qa_cancel(p_user uuid)
      RETURNS boolean LANGUAGE plpgsql VOLATILE COST 1 AS $fn$
      BEGIN
        -- Bump BEFORE the raise, and through a sequence rather than a table:
        -- the RAISE aborts the subtransaction the guard is about to catch, which
        -- would undo a table write. nextval() is non-transactional and survives.
        PERFORM nextval('public._room_qa_cancel_seq');
        RAISE EXCEPTION 'ROOM QA: simulated statement cancellation while resolving %', p_user
          USING ERRCODE = '57014';
      END $fn$;
      CREATE OR REPLACE FUNCTION public._room_qa_boom()
      RETURNS boolean LANGUAGE plpgsql VOLATILE COST 1 AS $fn$
      BEGIN
        RAISE EXCEPTION 'ROOM QA: simulated failure of a trigger driving query'
          USING ERRCODE = 'P0001';
      END $fn$;
      SELECT 1;`);

    // ── .1  A plain throw inside the resolver ────────────────────────────────
    await sql(`ALTER TABLE public.cohort_room_members
                 ADD CONSTRAINT tmp_room_qa_force_fail CHECK (false) NOT VALID;`);
    const insA = await attempt(enrolInto("room-qa-offering-a"));
    enrolA = insA.ok ? insA.rows[0]?.id : null;
    const rowA = await sqlOne(
      `SELECT id, status FROM public.enrolments
        WHERE user_id = ${lit(OUT)} AND offering_id = ${lit(ids.offering_a)}`);
    const memA = await memberRows();
    prove("SEC-ENT-2.1",
      "with EVERY write to cohort_room_members forced to throw, an enrolment INSERT into a room-bearing offering still COMMITS and the student is enrolled — the AFTER trigger swallows the resolver's failure as a WARNING instead of taking the payment write down with it, which is the difference between a broken room and a broken checkout",
      insA.ok && rowA?.status === "active" && memA.n === 0,
      insA.ok
        ? `enrolment ${rowA?.id} committed with status=${rowA?.status}; membership rows written: ${memA.n} (0 is correct — the resolver could not write one, and that is precisely the failure being absorbed)`
        : `THE ENROLMENT WAS ROLLED BACK: ${insA.error}`);

    // ── .2  The same forced failure, on the roster-write path ────────────────
    const insRoster = await attempt(`
      INSERT INTO public.cohort_batch_members (batch_id, enrolment_id)
      VALUES (${lit(ids.batch_a1)}, ${lit(enrolA)})
      RETURNING id;`);
    const rosterRow = await sqlOne(
      `SELECT count(*)::int AS n FROM public.cohort_batch_members WHERE enrolment_id = ${lit(enrolA)}`);
    prove("SEC-ENT-2.2",
      "an admin putting that student on a batch roster also commits while the resolver is still throwing — the roster is an ops write, it is not the room's to veto, and an ops tool that cannot save because a downstream trigger is unhappy is an outage of its own",
      insRoster.ok && rosterRow?.n === 1,
      insRoster.ok ? `cohort_batch_members rows for the enrolment: ${rosterRow?.n}`
                   : `THE ROSTER WRITE WAS ROLLED BACK: ${insRoster.error}`);

    await sql(DISARM);

    // ── .3  A CANCELLED statement inside the resolver (the N-1 case) ─────────
    await sql(`ALTER TABLE public.cohort_room_members
                 ADD CONSTRAINT tmp_room_qa_force_cancel
                 CHECK (public._room_qa_cancel(user_id)) NOT VALID;`);
    const cancelsBefore = await cancelCount();
    const insB = await attempt(enrolInto("room-qa-offering-b"));
    enrolB = insB.ok ? insB.rows[0]?.id : null;
    const rowB = await sqlOne(
      `SELECT id, status FROM public.enrolments
        WHERE user_id = ${lit(OUT)} AND offering_id = ${lit(ids.offering_b)}`);
    const cancelsAfter = await cancelCount();
    const memB = await memberRows();
    // THREE HALVES, BECAUSE THIS IS THE CASE WRITTEN TO PROVE THE HEADLINE FIX
    // AND IT USED TO ASSERT ONLY THE FIRST. `insB.ok && rowB.status === 'active'`
    // is satisfied byte-for-byte by a build where the trigger was never attached
    // and the cancel therefore never happened — the same shape .0a exists to
    // rule out, arriving here through a different door. So: the money write
    // committed, the cancelled path was ENTERED (the sequence moved, and it can
    // only be moved from inside _room_qa_cancel), and the resolver wrote nothing
    // (which is what being cancelled means, and what .1's sibling already
    // asserted with memA.n === 0).
    prove("SEC-ENT-2.3",
      "the resolver being CANCELLED mid-write — SQLSTATE 57014, what a statement_timeout looks like from inside a trigger — also leaves the enrolment committed: `EXCEPTION WHEN OTHERS` does not match query_canceled, so a handler that catches everything else still lets a timeout roll the money write back, and a timeout is likeliest exactly when the system is busiest, which is checkout. The cancel is proven to have HAPPENED, not assumed: a QA sequence bumped inside the cancelling function and read either side of the INSERT moved, and nextval() is non-transactional so the bump outlives the subtransaction the guard rolls back — a build whose trigger silently never fired would leave the sequence still and fail here instead of printing a pass",
      insB.ok && rowB?.status === "active" && cancelsAfter > cancelsBefore && memB.n === 0,
      insB.ok
        ? `enrolment ${rowB?.id} committed with status=${rowB?.status}; the resolver entered the cancelled path ` +
          `${cancelsAfter - cancelsBefore} time(s) (sequence ${cancelsBefore}→${cancelsAfter}) and wrote ${memB.n} membership row(s)` +
          (cancelsAfter > cancelsBefore
            ? ""
            : " — THE GUARD NEVER RAN: the enrolment committed because nothing was ever cancelled, which makes this case's PASS condition unearned. Check SEC-ENT-2.0a: the resolver trigger on enrolments is missing or disabled.")
        : `THE ENROLMENT WAS ROLLED BACK BY A CANCELLED RESOLVER: ${insB.error}. ` +
          "The guard must name query_canceled explicitly — `WHEN query_canceled THEN … WHEN OTHERS THEN …` — because OTHERS does not cover it.");

    // ── .3b The cancel on the OTHER guard shape ─────────────────────────────
    //
    // The batch-member trigger resolves a LIST of users, so its per-user guard
    // handles a cancel differently from an error: it stops the loop instead of
    // carrying on, because Postgres arms statement_timeout once per statement
    // and a loop that traps the cancel and continues has consumed the only
    // interrupt an operator gets. Different code, same obligation — the write
    // it hangs off still has to commit — so it is attacked separately rather
    // than assumed to behave like the enrolment guard.
    const insRosterCancelled = await attempt(`
      INSERT INTO public.cohort_batch_members (batch_id, enrolment_id)
      VALUES (${lit(ids.batch_a2)}, ${lit(enrolA)})
      RETURNING id;`);
    const rosterCancelledRow = await sqlOne(
      `SELECT count(*)::int AS n FROM public.cohort_batch_members
        WHERE enrolment_id = ${lit(enrolA)} AND batch_id = ${lit(ids.batch_a2)}`);
    prove("SEC-ENT-2.3b",
      "a roster write whose resolver is CANCELLED also commits — the batch-member trigger stops its per-user loop on 57014 rather than carrying on with a timer that has already fired, and stopping is not the same as failing: the ops write lands, a WARNING names who was skipped, and the 03:45 reconcile re-derives them",
      insRosterCancelled.ok && rosterCancelledRow?.n === 1,
      insRosterCancelled.ok ? `roster rows written while the resolver was being cancelled: ${rosterCancelledRow?.n}`
                            : `THE ROSTER WRITE WAS ROLLED BACK BY A CANCELLED RESOLVER: ${insRosterCancelled.error}`);

    await sql(DISARM);

    // ── .4  A failure in the trigger's OWN driving query ─────────────────────
    //
    // Not the resolver: the `SELECT array_agg(...) FROM public.enrolments`
    // that _room_resolve_from_batch_member runs to find out WHO to resolve.
    // The whole rename → view → insert → restore runs as ONE statement batch,
    // which the SQL channel sends as one implicit transaction: if the trigger
    // does not swallow the error, the transaction aborts and the rename never
    // reaches disk. There is deliberately no window in which this shadow
    // project can be left holding a raising view named public.enrolments.
    const driving = await attempt(`
      ALTER TABLE public.enrolments RENAME TO enrolments_room_qa_real;
      CREATE VIEW public.enrolments AS
        SELECT * FROM public.enrolments_room_qa_real WHERE public._room_qa_boom();
      INSERT INTO public.cohort_batch_members (batch_id, enrolment_id)
      VALUES (${lit(ids.batch_b1)}, ${lit(enrolB)});
      DROP VIEW public.enrolments;
      ALTER TABLE public.enrolments_room_qa_real RENAME TO enrolments;
      SELECT count(*)::int AS n FROM public.cohort_batch_members WHERE enrolment_id = ${lit(enrolB)};`);
    prove("SEC-ENT-2.4",
      "when the trigger's OWN driving query fails — reading `enrolments` itself raises, which is what a permissions change, a lock timeout or a schema edit under load looks like — the roster write STILL commits: the guard wraps the query that decides whom to resolve, not merely the resolver call, so there is no statement inside these triggers that runs outside a handler",
      driving.ok && Number(driving.rows?.[0]?.n) === 1,
      driving.ok
        ? `cohort_batch_members rows for the enrolment: ${driving.rows?.[0]?.n}; public.enrolments restored to a table in the same transaction`
        : `THE ROSTER WRITE WAS ROLLED BACK: ${driving.error} (the rename rolled back with it — public.enrolments is untouched)`);
  } finally {
    // Restore the world exactly. Everything below is idempotent and runs even
    // if a case above threw, because leaving a CHECK(false) on
    // cohort_room_members would fail every remaining case in the file for a
    // reason that has nothing to do with access.
    await sql(DISARM).catch(() => {});
    await sql(`
      DO $do$
      BEGIN
        IF to_regclass('public.enrolments_room_qa_real') IS NOT NULL THEN
          DROP VIEW IF EXISTS public.enrolments;
          ALTER TABLE public.enrolments_room_qa_real RENAME TO enrolments;
        END IF;
      END $do$;
      DELETE FROM public.cohort_batch_members
       WHERE enrolment_id IN (SELECT id FROM public.enrolments WHERE user_id = ${lit(OUT)});
      DELETE FROM public.enrolments WHERE user_id = ${lit(OUT)};
      DELETE FROM public.cohort_room_members WHERE user_id = ${lit(OUT)};
      DROP FUNCTION IF EXISTS public._room_qa_cancel(uuid);
      DROP FUNCTION IF EXISTS public._room_qa_boom();
      DROP SEQUENCE IF EXISTS public._room_qa_cancel_seq;
      SELECT 1;`).catch(() => {});
  }

  const leftovers = await sqlOne(`
    SELECT
      (SELECT count(*)::int FROM public.enrolments WHERE user_id = ${lit(OUT)}) AS enrolments,
      (SELECT count(*)::int FROM public.cohort_room_members WHERE user_id = ${lit(OUT)}) AS memberships,
      (SELECT count(*)::int FROM pg_constraint
        WHERE conname LIKE 'tmp_room_qa_force%') AS forced_constraints,
      (SELECT count(*)::int FROM pg_class WHERE relname = 'enrolments_room_qa_real') AS renamed_tables,
      (SELECT count(*)::int FROM pg_class WHERE relname = '_room_qa_cancel_seq') AS qa_sequences,
      (SELECT count(*)::int FROM pg_class WHERE relname = 'enrolments' AND relkind = 'r') AS enrolments_is_table`);
  prove("SEC-ENT-2.5",
    "the forced-failure world is fully dismantled — no CHECK constraint left armed on cohort_room_members, no QA sequence left in public, `public.enrolments` is a TABLE again, and the outsider is back to zero enrolments and zero memberships: this section mutates the money tables, so proving it put them back is part of proving anything that follows it",
    leftovers?.enrolments === 0 && leftovers?.memberships === 0 &&
      leftovers?.forced_constraints === 0 && leftovers?.renamed_tables === 0 &&
      leftovers?.qa_sequences === 0 && leftovers?.enrolments_is_table === 1,
    `outsider enrolments=${leftovers?.enrolments} memberships=${leftovers?.memberships}; ` +
      `forced constraints=${leftovers?.forced_constraints} renamed tables=${leftovers?.renamed_tables} ` +
      `qa sequences=${leftovers?.qa_sequences} public.enrolments is a table=${leftovers?.enrolments_is_table === 1}`);
}

// ── R1 / R2 / R3 — the cross-offering read attacks ──────────────────────────
section("R1 / R2 / R3 — cross-offering reads", "member_B, outsider and anon probe every offering-A surface directly");
for (const [actor, id] of [["member_B", "R1"], ["outsider", "R2"], ["anon", "R3"]]) {
  const results = [];
  for (const [name, path] of SURFACES_A) {
    const r = await read(actor, path, `${name}(A) as ${actor}`);
    results.push([name, r]);
  }
  const leaked = results.filter(([, r]) => !r.blocked);
  prove(`${id}.1`,
    `${actor} reading all ${SURFACES_A.length} room-content surfaces of offering A is stopped at the storage engine — zero rows or denied on every one, so another cohort's noticeboard, library, feed, gallery, curriculum, sessions and room config are simply not there`,
    leaked.length === 0,
    leaked.length === 0
      ? results.map(([n, r]) => `${n}:${r.ok ? "0 rows" : r.status}`).join(" · ")
      : `LEAKED ${leaked.map(([n, r]) => `${n} → ${r.describe}`).join("; ")}`);
}

// The literal shape the brief names: a raw PostgREST filter on offering_id.
{
  const r = await read("outsider", `cohort_announcements?offering_id=eq.${ids.offering_a}&select=id,body`,
    "PostgREST ?offering_id=eq.A as outsider");
  prove("R2.2",
    "the raw PostgREST filter ?offering_id=eq.<A> — the exact request an attacker with the anon key and a login writes by hand — returns nothing to an outsider",
    r.blocked, r.describe);
}

// ── R4 — the RPCs raise, they do not return an empty set ────────────────────
section("R4 — room RPCs for non-members", "an empty set reads as 'no content yet'; a raise reads as 'not yours'");
for (const actor of ["member_B", "outsider"]) {
  for (const fn of ["get_cohort_room", "get_room_roster"]) {
    const r = await rpc(actor, fn, { p_offering: ids.offering_a }, `${fn}(A) as ${actor}`);
    prove(`R4.${actor}.${fn}`,
      `${fn}(A) RAISES for ${actor} instead of handing back an empty envelope a UI could render as "this room is empty" — access is asserted before any read happens`,
      r.raised, r.describe);
  }
}

// ── R7 — private recording positions ───────────────────────────────────────
section("R7 — per-user privacy inside a room", "room-mates are not entitled to each other's private state");
{
  const r = await read("member_A2", `cohort_recording_progress?live_session_id=eq.${ids.session_past_a1}&select=*`,
    "member_A1's recording position, as member_A2");
  prove("R7.1",
    "one member cannot read another member's recording position — 'where you paused' is own-row-only, not room-visible",
    r.blocked, r.describe);
}

// ── R8 / R9 / C3 — cross-batch isolation inside ONE offering ────────────────
section("R8 / R9 / C3 — cross-batch isolation", "batch A1 and batch A2 share an offering and must still not see each other");
{
  const before = mark("member_A2");
  const results = [];
  // Every batch-A1-private surface EXCEPT live_sessions and the config row.
  // The config is R8.3's (its boundary runs the other way). live_sessions is
  // GAP-2's, and it is left out of this list honestly rather than quietly: the
  // table has no batch column, so a probe here would fail for a reason R0 does
  // not own and a sweep that avoided the surface would report a wall that is
  // not there. The four surfaces added below — submissions, attendance, the
  // resume position and the seen watermark — are the member-private facts that
  // used to sit outside every cross-batch probe in this file.
  for (const [name, path] of [
    ["announcements", `cohort_announcements?batch_id=eq.${ids.batch_a1}&select=*`],
    ["resources", `cohort_resources?batch_id=eq.${ids.batch_a1}&select=*`],
    ["posts", `cohort_room_posts?batch_id=eq.${ids.batch_a1}&select=*`],
    ["demo", `cohort_demo_entries?batch_id=eq.${ids.batch_a1}&select=*`],
    ["weeks", `cohort_weeks?cohort_batch_id=eq.${ids.batch_a1}&select=*`],
    ["submissions", `cohort_week_submissions?cohort_week_id=eq.${ids.week_a1}&select=*`],
    ["attendance", `cohort_week_attendance?cohort_week_id=eq.${ids.week_a1}&select=*`],
    ["recording position", `cohort_recording_progress?live_session_id=eq.${ids.session_past_a1}&select=*`],
    ["room seen", `cohort_room_seen?offering_id=eq.${ids.offering_a}&select=*`],
  ]) {
    results.push([name, await read("member_A2", path, `batch-A1 ${name} as member_A2`)]);
  }
  const leaked = results.filter(([, r]) => !r.blocked);
  prove("R8.1",
    `member_A2 — a paying member of the same offering — gets zero rows from all ${results.length} batch-A1-scoped surfaces, including the four member-private ones (assignment, feedback, attendance, resume position, seen watermark): batch precision is enforced in RLS, not merely in a client query filter`,
    leaked.length === 0,
    leaked.length === 0 ? results.map(([n, r]) => `${n}:${r.ok ? "0 rows" : r.status}`).join(" · ")
      : `LEAKED ${leaked.map(([n, r]) => `${n} → ${r.describe}`).join("; ")}`);

  // The schedule is the one batch boundary RLS cannot draw: live_sessions is
  // course-scoped, never batch-scoped, so both batches of offering A can read
  // each other's session ROWS at the table by pre-existing design. R-3's
  // envelope predicate is the only thing that makes the schedule batch-precise,
  // which makes this the assertion that carries the claim — not a table probe.
  const envA2 = await rpc("member_A2", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) as member_A2");
  const a2Sessions = envA2.json?.sessions ?? [];
  const foreignSessions = a2Sessions.filter((s) => (s.title || "").includes("A1"));
  prove("R8.2",
    "member_A2's room envelope lists their own batch's session and not one of batch A1's — because live_sessions itself is course-scoped, the RPC's batch predicate is the ONLY thing standing between two batches of one offering and each other's schedule, so this is where that boundary has to be proven",
    envA2.ok && a2Sessions.length > 0 && foreignSessions.length === 0,
    envA2.ok
      ? `${a2Sessions.length} session(s): ${a2Sessions.map((s) => s.title).join(", ") || "none"}; batch-A1 sessions present: ${foreignSessions.length}`
      : envA2.describe);

  // The room CONFIG is the one intra-offering boundary room_configs_member_read
  // actually draws, and it is drawn in the opposite direction from everything
  // above: batch A1 owns no override, so the row that can leak is A2's. That
  // policy routes through cohort_room_can_access(offering_id, batch_id)
  // (20260729100000:1121-1126), whose batch arm is `m.batch_id = p_batch` — the
  // single predicate standing between a batch-A1 member and batch A2's skin.
  // Regress it to "p_batch IS NULL OR TRUE" and every other assertion in this
  // suite still passes, which is why the override carries its own sentinel and
  // why this probe exists at all.
  const a2ConfigOwn = await read("member_A2", `cohort_room_configs?batch_id=eq.${ids.batch_a2}&select=*`,
    "batch-A2 config override as member_A2 [positive control]");
  const a2ConfigForeign = await read("member_A1", `cohort_room_configs?batch_id=eq.${ids.batch_a2}&select=*`,
    "batch-A2 config override as member_A1");
  prove("R8.3",
    "batch A2's own room config override is readable by a batch-A2 member and returns zero rows to a batch-A1 member of the SAME offering — the override row is the only place cohort_room_can_access's batch arm is load-bearing inside one offering, so this is where a predicate that quietly stopped comparing batches would show up",
    a2ConfigOwn.ok && a2ConfigOwn.rows > 0 && a2ConfigOwn.text.includes(CANARY.CONFIG_A2) &&
      a2ConfigForeign.blocked && !a2ConfigForeign.text.includes(CANARY.CONFIG_A2),
    `as member_A2: ${a2ConfigOwn.describe}, ${CANARY.CONFIG_A2} ${a2ConfigOwn.text.includes(CANARY.CONFIG_A2) ? "present (armed)" : "ABSENT — this probe proves nothing"}; ` +
      `as member_A1: ${a2ConfigForeign.describe}, sentinel present=${a2ConfigForeign.text.includes(CANARY.CONFIG_A2)}`);

  // THE NEEDLE LIST THIS SWEEP USED TO CARRY WAS THREE-SEVENTHS UNREACHABLE.
  // It hunted REC_A1, ZOOM_A1 and ZOOMNEAR_A1 over a corpus in which member_A2
  // had never queried live_sessions and had never called the link RPC, so
  // those three could not have turned up however broken the wall was — and the
  // sweep printed a pass either way. Every needle below is carried by a probe
  // this actor actually issued in this window (the loop above); the three
  // live_sessions-borne sentinels are measured instead, immediately after, as
  // GAP-2 — which is the honest home for a surface that has no batch column to
  // scope by in the first place.
  proveCorpusClean("R9.1", "member_A2",
    [CANARY.A1, CANARY.CURRIC_A1, CANARY.ASSIGN_A1, CANARY.FEEDBACK_A1,
     CANARY.MENTORDOC_A1, CANARY.ATTEND_A1, CANARY.SEEN_A1, CANARY.RECPROG_A1],
    "no batch-A1 sentinel appears anywhere in what the server handed member_A2 — the noticeboard, the library, the mentor-materials file, the feed, the gallery, the curriculum, the assignment brief, the mentor's feedback, the attendance mark, the resume position and the seen watermark are all absent from every response, not just the ones we thought to assert on",
    before);

  // ── GAP-2. The cross-batch residue on live_sessions, measured rather than
  //    avoided. Two probes, both aimed straight at the surface R8.1 leaves out.
  const a2ReadsA1Sessions = await read("member_A2",
    `live_sessions?title=like.ROOM%20QA%20A1*&select=id,title,scheduled_at,status,recording_url,week_id`,
    "batch-A1 sessions as member_A2 [GAP-2 probe]");
  const a2PullsA1Link = await rpc("member_A2", "get_live_session_zoom_link",
    { p_session_id: ids.session_near_a1 }, "get_live_session_zoom_link(A1 NEAR) as member_A2 [GAP-2 probe]");
  const gap2Text = `${a2ReadsA1Sessions.text || ""}${a2PullsA1Link.text || ""}`;
  const sessionBorne = [CANARY.REC_A1, CANARY.ZOOM_A1, CANARY.ZOOMNEAR_A1, CANARY.ZOOMLIVE_A1];
  const gap2Residue = sessionBorne.filter((n) => gap2Text.includes(n));
  const gap2Beyond = ALL_A_SECRETS
    .filter((n) => !sessionBorne.includes(n))
    .filter((n) => gap2Text.includes(n));
  carryGap("GAP-2", {
    claim:
      "batch precision stops at live_sessions: a batch-A2 member reads batch A1's session rows — titles, times and recording URLs — and can pull batch A1's join link out of get_live_session_zoom_link, because that table has no batch column and that RPC gates on any active enrolment in the OFFERING",
    closedClaim:
      "the schedule is now batch-precise at the table and in the older link RPC as well as in the envelope — a batch-A2 member reads none of batch A1's sessions and cannot pull their join link",
    open: (a2ReadsA1Sessions.ok && a2ReadsA1Sessions.rows > 0) || gap2Residue.length > 0,
    widened: gap2Beyond.length > 0,
    evidence: gap2Beyond.length > 0
      ? `the cross-batch session path now also carries ${gap2Beyond.join(", ")} — that is past the boundary this gap is carried within`
      : `member_A2 read ${a2ReadsA1Sessions.rows} batch-A1 session row(s) and the link RPC answered ${a2PullsA1Link.returnedNull ? "NULL" : "a link"}; sentinels reaching them: ${gap2Residue.join(", ") || "none"}. ` +
        "live_sessions hangs off course_id and reaches a batch only through week_id → cohort_weeks → cohort_batch_id, so neither live_sessions_read (has_course_access) nor get_live_session_zoom_link (20260408151600:76-84, `active enrolment in an offering mapped to the course`) has a batch to compare against — both predate R0 by four months. R0 draws the batch line where it CAN be drawn, in R-3's envelope (R8.2), and neither widens nor narrows the April policy. What leaks is the schedule and the join link of a sibling batch of the same programme, never its noticeboard, curriculum, assignments, feedback, attendance or people — R8.1 and R9.1 above assert exactly that, on nine surfaces.",
    closing:
      "give the link RPC and live_sessions_student_read the batch dimension the table lacks: resolve week_id → cohort_weeks → cohort_batch_id and require the caller's cohort_batch_members row to match, falling through to the course-level check only for batch-less (legacy/workshop) sessions. That edits a pre-existing April policy and a pre-existing RPC, both outside R0's file set, so it belongs to a scoped follow-up with its own council pass and its own cross-client regression check — the shipped CohortDashboard calls that RPC.",
  });
}

{
  const roster = await rpc("member_A1", "get_room_roster", { p_offering: ids.offering_a }, "get_room_roster(A) as member_A1");
  const rows = Array.isArray(roster.json) ? roster.json : [];
  const seen = new Set(rows.map((r) => r.user_id));

  prove("C3.1",
    "member_A1's roster is BATCH-scoped (ROSTER-SCOPE-1): it contains their own batch and the offering-wide mentor, and it does NOT contain member_A2 — a student cannot enumerate a sibling batch's students",
    roster.ok && seen.has(session.member_A1.id) && seen.has(session.mentor_A.id) && !seen.has(session.member_A2.id),
    roster.ok
      ? `${rows.length} row(s): self=${seen.has(session.member_A1.id)} mentor=${seen.has(session.mentor_A.id)} member_A2=${seen.has(session.member_A2.id)}`
      : roster.describe);

  const envelope = await rpc("member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) roster_count");
  const count = envelope.json?.roster_count;
  // roster_count is the COHORT-MATE count (members + alumni), so it is compared
  // against that subset of the roster, not against the staff-inclusive list.
  const cohortMates = rows.filter((r) => r.role === "member" || r.role === "alumni");
  prove("C3.2",
    "the envelope's roster_count equals the batch-scoped cohort-mate count and nothing more — the headline number on the room screen cannot quietly reveal how many students are in the sibling batch",
    envelope.ok && Number(count) === cohortMates.length,
    `roster_count=${count} vs batch-scoped cohort-mates in roster=${cohortMates.length} (roster also lists ${rows.length - cohortMates.length} offering-wide staff)`);

  // C1 — the exact safe column set.
  const EXPECTED = ["user_id", "full_name", "avatar_url", "occupation", "city", "role"];
  const cols = rows.length ? Object.keys(rows[0]).sort() : [];
  prove("C1.1",
    `get_room_roster returns exactly ${EXPECTED.join(", ")} — the column list is pinned, so a later "just add one more field" cannot quietly widen it`,
    rows.length > 0 && JSON.stringify(cols) === JSON.stringify([...EXPECTED].sort()),
    rows.length ? `columns: ${cols.join(", ")}` : "roster returned no rows to inspect");

  prove("C1.2",
    "mentor_A's phone and email never appear in the roster response even though their row IS returned — the PII canary planted in both columns is absent, so this is a projection guarantee and not an accident of who is in the room",
    rows.some((r) => r.full_name === "ROOM QA Mentor A") && !roster.text.includes(CANARY.PII_A1),
    `mentor row present=${rows.some((r) => r.full_name === "ROOM QA Mentor A")}, PII canary present=${roster.text.includes(CANARY.PII_A1)}`);

  proveCorpusClean("C3.3", "member_A1", [CANARY.A2, CANARY.PII_A2, CANARY.CONFIG_A2],
    "nothing member_A1 has ever been served contains a batch-A2 sentinel, member_A2's PII, or batch A2's own room-config override — the sibling batch's content, its people and its skin are all absent from every byte this member has received");
}

// ── R10 — accepted_A: zero room read grant, and no preview RPC to call ──────
section("R10 — accepted_A holds ZERO room read grant", "MEMBER-1: the confirm-seat veil is offering chrome, never room rows");
{
  const before = mark("accepted_A");
  const results = [];
  for (const [name, path] of SURFACES_A) results.push([name, await read("accepted_A", path, `${name}(A) as accepted_A`)]);
  // Beyond the ten, and the reason they are here rather than in SURFACES_A: the
  // mentor's feedback and the attendance mark live nowhere else, so R10.5's
  // sweep could not have found either sentinel without these two probes — it
  // would have hunted them over a window that never asked for them.
  for (const [name, path] of MEMBER_PRIVATE_A) {
    results.push([name, await read("accepted_A", path, `${name}(A) as accepted_A`)]);
  }
  const leaked = results.filter(([, r]) => !r.blocked);
  prove("R10.1",
    `an accepted-but-unpaid applicant reads every one of the ${SURFACES_A.length} room-content surfaces for the offering they were admitted to — the noticeboard, the library, the feed, the replies, the gallery, the curriculum, the schedule, the room config, their would-be resume positions and the room-seen watermark — plus the ${MEMBER_PRIVATE_A.length} member-private curriculum tables beyond them, and gets zero rows or denied on all ${results.length}: acceptance grants no room read at all, so the veil cannot be sourced from real room data`,
    leaked.length === 0,
    leaked.length === 0 ? results.map(([n, r]) => `${n}:${r.ok ? "0 rows" : r.status}`).join(" · ")
      : `LEAKED ${leaked.map(([n, r]) => `${n} → ${r.describe}`).join("; ")}`);

  for (const fn of ["get_cohort_room", "get_room_roster"]) {
    const r = await rpc("accepted_A", fn, { p_offering: ids.offering_a }, `${fn}(A) as accepted_A`);
    prove(`R10.2.${fn}`, `${fn} raises for accepted_A — being admitted is not membership`, r.raised, r.describe);
  }

  const inCatalog = await sql(
    `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_cohort_room_preview'`);
  prove("R10.3",
    "there is NO get_cohort_room_preview function in the database — MEMBER-1 deleted that path, so no redacted room projection exists for anyone to widen later",
    inCatalog[0].n === 0, `pg_proc matches: ${inCatalog[0].n}`);

  const live = await rpc("accepted_A", "get_cohort_room_preview", { p_offering: ids.offering_a }, "get_cohort_room_preview (must not exist)");
  prove("R10.4",
    "calling get_cohort_room_preview over the wire as accepted_A gets 'no such function' — there is genuinely no preview RPC to call, not merely one that is undocumented",
    live.missing, live.describe);

  proveCorpusClean("R10.5", "accepted_A", ALL_A_SECRETS,
    "not one sentinel from offering A appears in anything the server has served accepted_A", before);
}

// ── R11 — pre_member_A1: the whitelist, and only the whitelist ──────────────
section("R11 — pre_member redaction whitelist", "confirmation_paid buys the lobby: masthead, schedule, presence, announcements");
{
  const before = mark("pre_member_A1");

  // The masthead reaches the lobby through the sanctioned envelope. Whether the
  // config TABLE is also directly readable is R-2's call and the stricter answer
  // is the safer one, so this asserts the whitelist is DELIVERED, not the route.
  const config = await read("pre_member_A1", `cohort_room_configs?offering_id=eq.${ids.offering_a}&select=*`, "config table as pre_member");
  const ann = await read("pre_member_A1", SURFACES_A[0][1], "announcements as pre_member");
  const envelope = await rpc("pre_member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) as pre_member");

  prove("R11.a1",
    "pre_member_A1 CAN open the room envelope and receives the masthead/theme config — the lobby is a real, scoped grant, so every redaction result below is about redaction and not about a locked door",
    envelope.ok && !!envelope.json?.config,
    envelope.ok ? `access=${envelope.json?.access}, config=${envelope.json?.config ? "present" : "absent"}; direct config table read: ${config.describe}`
                : envelope.describe);
  prove("R11.a2",
    "pre_member_A1 CAN read announcements — the welcome channel is the one content table on the MEMBER-1 whitelist",
    ann.ok && Array.isArray(ann.json) && ann.json.length > 0, ann.describe);

  // THE LOBBY SCHEDULE RESOLVES EMPTY IN R0, AND THAT IS THE SECURE ANSWER.
  //
  // A lobby row carries NO batch — PRE.5 prints `batch=NULL (offering-wide
  // lobby)` because the resolver writes it that way (20260729100000:686) — and
  // `cohort_room_is_offering_wide()` is TRUE only for a NULL-batch mentor/host
  // or an admin (same file :460-471), so a pre_member is not offering-wide
  // either. R-3's lobby predicate is `(v_wide OR w.cohort_batch_id = v_batch)`
  // (20260729100200:456-459), which is therefore `false OR (uuid = NULL)` → NULL
  // → zero rows → COALESCE '[]'. R-3 documents this twice on purpose
  // (20260729100200:348-361 and :443-447) and refers the "should the lobby see a
  // schedule at all?" question to the council as a PRODUCT question.
  //
  // So this case asserts the shape R0 SHIPS, and says why that shape is right:
  // an occupant queued for no batch has no batch whose timetable is theirs to
  // read, and the withdrawn `all_batches` widening is precisely what handed a
  // batch-A1 lobby occupant batch A2's private schedule. Asserting a non-empty
  // lobby schedule here would fail this suite against R0's own migrations —
  // asserting a property the phase does not deliver, which is the one thing a
  // sign-off artifact may never do. It is also the shape the brief itself
  // specifies for every batch-less occupant: "member with no batch yet
  // (pre_start) → envelope returns config + empty sessions, no raise"
  // (design/briefs/cohort-r0.md:43). The redaction invariant is asserted as a
  // shape guard so it still bites the day product gives the lobby a batch: no
  // entry may EVER carry a zoom_link or recording_url key, and any entry that
  // does appear must carry a title and a date.
  const lobbySessions = envelope.json?.sessions ?? [];
  const lobbyLeak = lobbySessions.filter((s) => "zoom_link" in s || "recording_url" in s);
  const lobbyDated = lobbySessions.filter((s) => s.title && s.scheduled_at);
  prove("R11.a3",
    "the envelope built for a pre_member is stamped access=pre_member and its schedule resolves EMPTY — a lobby row is queued for no batch, so there is no batch schedule it is entitled to, and the only alternative R-3 considered (span every batch) is the widening that handed a batch-A1 lobby occupant batch A2's timetable; whatever product later decides, no entry the lobby branch can ever emit carries a zoom_link or recording_url key at all, so the redaction is a different payload SHAPE and not a member payload with fields blanked",
    envelope.ok && envelope.json?.access === "pre_member" &&
      Array.isArray(lobbySessions) && lobbySessions.length === 0 &&
      lobbyDated.length === lobbySessions.length && lobbyLeak.length === 0,
    `access=${envelope.json?.access}, sessions=${JSON.stringify(lobbySessions)} (${lobbySessions.length} entr(y/ies), ${lobbyLeak.length} carrying a link key). ` +
      "An empty array here is R-3's documented lobby scope, NOT a broken envelope: R11.a1/a2 prove the same call delivers the masthead and the announcements, so the door is open and only the batch-scoped half is absent.");

  // Every one of these probes has an armed positive control above — PRE.8
  // proved a real member reads rows carrying the CURRIC / MENTORDOC / RECPROG
  // sentinels from the same paths, and PRE.14 the FEEDBACK and ATTEND ones — so
  // a zero here is a denial and not an empty table. The assignments and resume
  // probes are own-row-only for everyone, so their zero is over-determined
  // (ownership AND room access); their sentinels are swept for in R11.b1, which
  // is where the stronger claim lives.
  //
  // 🔴 WHAT IS NO LONGER PROBED HERE, AND WHY. live_sessions and
  // get_live_session_zoom_link used to be in this set, and their results were
  // printed as pre_member redaction PASSes. They are not R0's wall: both are
  // gated by April policies that ask only "is there an ACTIVE enrolment in an
  // offering mapped to this course?", and R-1's header (20260729100000:906-918)
  // forbids re-asserting a pre_member's zero on live_sessions until the
  // follow-up lands. This fixture's original lobby occupant has no enrolment at
  // all, so its zero was a property of the fixture, not of the tier. Both lobby
  // shapes — this one and the staged actor who DOES hold an active enrolment —
  // are probed against those two surfaces in GAP-4 immediately below, and the
  // result is carried rather than certified.
  const curriculum = await read("pre_member_A1", `cohort_weeks?cohort_batch_id=eq.${ids.batch_a1}&select=*`, "curriculum detail as pre_member");
  const assignments = await read("pre_member_A1", `cohort_week_submissions?select=*`, "assignments as pre_member");
  const mentorDocs = await read("pre_member_A1", `cohort_resources?offering_id=eq.${ids.offering_a}&select=*`, "mentor materials as pre_member");
  // The two member-private facts the lobby also has no claim on. They are
  // probed HERE, inside R11's sweep window, and not only in the ten-surface
  // matrix, because R11.b1 hunts their sentinels — and a needle whose surface
  // was never queried in the swept window is a needle that cannot be found
  // however wide the hole is.
  const attendance = await read("pre_member_A1", `cohort_week_attendance?cohort_week_id=eq.${ids.week_a1}&select=*`, "attendance as pre_member");
  const resume = await read("pre_member_A1", `cohort_recording_progress?live_session_id=eq.${ids.session_past_a1}&select=*`, "resume positions as pre_member");
  const denied = [
    ["curriculum", curriculum],
    ["assignments", assignments], ["mentor materials", mentorDocs],
    ["attendance", attendance], ["resume positions", resume],
  ];

  // The strongest form of the claim: not "these queries returned nothing" but
  // "no redacted body reached this actor by ANY path we exercised".
  proveCorpusClean("R11.b1", "pre_member_A1", PRE_MEMBER_FORBIDDEN,
    "no curriculum body, assignment brief, mentor feedback, mentor-materials file, attendance mark or resume position has reached pre_member_A1 through any surface R0's wall governs: those bodies unlock at `enrolled`, and none of it depends on the UI choosing not to render them",
    before);

  prove("R11.b2",
    "each redacted surface R0 OWNS individually returns zero rows or a denial to pre_member_A1 — every one of them was proven readable to a real member first, so the redaction is enforced per-surface and not by one lucky filter or an empty table. The word 'owns' is doing work: the recordings and join-link surfaces that used to sit in this list are governed by an April policy this phase does not touch, and they are measured as GAP-4 rather than counted here",
    denied.every(([, r]) => r.blocked),
    denied.map(([n, r]) => `${n}:${r.ok ? `${r.rows} row(s)` : r.status}`).join(" · "));
}

// ── GAP-4 — the lobby's live_sessions residue, on BOTH lobby shapes ─────────
//
// THE HOLE R-1's OWN HEADER NAMES, MEASURED INSTEAD OF CERTIFIED AWAY.
// 20260729100000:906-918 marks the staged lobby shape — ACTIVE enrolment +
// outstanding balance, resolver branch (b) — as a KNOWN, ESCALATED, NOT-CLOSED
// hole, because that shape satisfies `live_sessions_student_read`
// (20260408140000:54) and `get_live_session_zoom_link`'s enrolment test
// (20260408151600:74-86) while the room tier says lobby. It ends: do not
// re-assert "a pre_member reads zero rows from live_sessions" anywhere until
// the follow-up lands. This suite did re-assert it, three ways, and went green
// because its only lobby occupant was the OTHER shape.
//
// So both shapes are attacked, side by side, with the same probes:
//   pre_member_A1     application stamp, NO enrolment  → the April policies deny
//   staged_lobby_A1   the same tier, ACTIVE enrolment  → the April policies admit
// The delta between those two rows IS the gap, and it is a measurement rather
// than a claim. What R0 DOES own for the staged shape is asserted normally
// right after (GAP-4.1): every redacted body on a table R0's wall governs stays
// shut for it too, so the residue below is a boundary of this phase and not a
// hole inside it.
section("GAP-4 — the staged lobby's live_sessions residue",
  "the one place the room tier and the April enrolment policies disagree — measured on both lobby shapes");
{
  const LINKS = [
    ["FAR (T+3h)", ids.session_far_a1, CANARY.ZOOM_A1],
    ["NEAR (T+30m)", ids.session_near_a1, CANARY.ZOOMNEAR_A1],
    ["LIVE (running)", ids.session_live_a1, CANARY.ZOOMLIVE_A1],
    ["CANCELLED", ids.session_cancelled_a1, CANARY.ZOOMCANCEL_A1],
  ];
  /** Probe one lobby shape against the two April-governed surfaces. */
  const probeLobby = async (actor) => {
    const table = await read(actor,
      `live_sessions?title=like.ROOM%20QA%20A1*&select=id,title,scheduled_at,status,recording_url,week_id`,
      `batch-A1 sessions as ${actor} [GAP-4 probe]`);
    const links = [];
    for (const [what, sessionId, sentinel] of LINKS) {
      const r = await rpc(actor, "get_live_session_zoom_link",
        { p_session_id: sessionId }, `get_live_session_zoom_link(${what}) as ${actor} [GAP-4 probe]`);
      links.push([what, r, sentinel]);
    }
    const handed = links.filter(([, r, sentinel]) => r.text.includes(sentinel));
    return { table, links, handed, text: table.text + links.map(([, r]) => r.text).join("") };
  };

  const applicationOnly = await probeLobby("pre_member_A1");
  const staged = await probeLobby("staged_lobby_A1");

  // The redacted bodies R0 DOES own, for the staged shape. Probed before the
  // carryGap so the sweep below has a window that could have carried them.
  const stagedBefore = mark("staged_lobby_A1");
  for (const [name, path] of [
    ["cohort_weeks", `cohort_weeks?cohort_batch_id=eq.${ids.batch_a1}&select=*`],
    ["cohort_resources", `cohort_resources?offering_id=eq.${ids.offering_a}&select=*`],
    ["cohort_week_submissions", `cohort_week_submissions?select=*`],
    ["cohort_week_attendance", `cohort_week_attendance?cohort_week_id=eq.${ids.week_a1}&select=*`],
    ["cohort_recording_progress", `cohort_recording_progress?live_session_id=eq.${ids.session_past_a1}&select=*`],
  ]) {
    await read("staged_lobby_A1", path, `${name}(A) as staged_lobby_A1`);
  }
  proveCorpusClean("GAP-4.1", "staged_lobby_A1", PRE_MEMBER_FORBIDDEN,
    "the STAGED lobby occupant — the one whose active enrolment the April session policies do admit — still receives none of the bodies R0's own wall governs: no curriculum detail, no assignment brief, no mentor feedback, no mentor-materials file, no attendance mark, no resume position. The room tier holds exactly where R0 draws it, which is what makes the residue below a boundary of this phase rather than a failure inside it",
    stagedBefore);

  const stagedSessions = staged.table.ok ? staged.table.rows : 0;
  const beyond = A_SECRETS_TABLE_BORNE
    .filter((n) => n !== CANARY.REC_A1)
    .filter((n) => staged.text.includes(n));
  carryGap("GAP-4", {
    claim:
      "the LOBBY tier stops at the room's own tables: a staged lobby occupant — `pre_member` in cohort_room_members, with an ACTIVE enrolment that still owes a balance — reads batch A1's session rows straight off live_sessions, recording_url included, and pulls the join link of every session inside its window out of get_live_session_zoom_link",
    closedClaim:
      "both lobby shapes now read zero rows from live_sessions and are handed no join link at any distance — the April policies have caught up with the room tier and the pre_member redaction is finally true on every surface",
    open: stagedSessions > 0 || staged.handed.length > 0,
    widened: beyond.length > 0,
    evidence: beyond.length > 0
      ? `the staged lobby path now also carries ${beyond.join(", ")} — that is past the live_sessions boundary this gap is carried within, and it is a failure of R0's own wall rather than of the April one`
      : `staged_lobby_A1 (active enrolment, balance outstanding) read ${stagedSessions} batch-A1 session row(s) and was handed ${staged.handed.length} of 4 join links (${staged.handed.map(([w]) => w).join(", ") || "none"}); ` +
        `the application-only lobby occupant read ${applicationOnly.table.ok ? applicationOnly.table.rows : 0} row(s) and ${applicationOnly.handed.length} link(s). ` +
        "The delta between those two lines is the whole gap: both hold the identical `pre_member` room row, and the only difference between them is an enrolments row that live_sessions_student_read (20260408140000:54) and get_live_session_zoom_link (20260408151600:74-86) test for while knowing nothing about rooms, batches or tiers. R-1's own header (20260729100000:906-918) flags this shape as KNOWN, ESCALATED and NOT CLOSED by R0, and forbids re-asserting the zero. This suite therefore does not: it reports what each shape actually receives.",
    closing:
      "add the room tier to the two April objects — `live_sessions_student_read` and `get_live_session_zoom_link` must require a membership row whose role is not `pre_member` (or, equivalently, `NOT _room_balance_outstanding(...)`) on top of the enrolment test. Both are shipped objects CohortDashboard reads through, so it is the same scoped follow-up as GAP-2, with its own council pass and its own client-compat check.",
  });
}

// ── MYROOMS — the OTHER client-callable room read RPC ──────────────────────
//
// get_my_cohort_rooms() (20260729100200:228, GRANT EXECUTE … TO authenticated
// at :328-329) is the room LIST: masthead + theme + schedule aggregates +
// an unseen-announcements counter, one row per membership. It takes no
// argument, which is exactly why it needs attacking — it is self-scoped by
// construction, and "self-scoped by construction" is a claim, not a proof,
// until the actors who must receive nothing are made to call it. It also
// carries its own pre_member redaction (next_due_at NULLed at :274-281) and
// its own config-override resolution (:300-312), neither of which any other
// case in this suite exercises.
section("MYROOMS — get_my_cohort_rooms is self-scoped", "the second client-callable room read: no argument to forge, so prove it scopes itself");
{
  const listOf = (r) => (Array.isArray(r.json) ? r.json : []);

  const mine = await rpc("member_A1", "get_my_cohort_rooms", {}, "get_my_cohort_rooms as member_A1");
  const mineRows = listOf(mine);
  const mineA = mineRows.find((r) => r.offering_id === ids.offering_a);
  const mineTheme = JSON.stringify(mineA?.theme ?? null);
  prove("MYROOMS.1",
    "member_A1's room list contains exactly the one room they hold — offering A, batch A1, role member — wearing offering A's own masthead and not batch A2's override: the list is built from the caller's membership rows and cannot be pointed at anybody else's, and it is ARMED (a real theme and a real announcement counter come back), so every zero below is a boundary result",
    mine.ok && mineRows.length === 1 && mineA?.batch_id === ids.batch_a1 && mineA?.role === "member" &&
      mineTheme.includes(CANARY.CONFIG_A) && !mineTheme.includes(CANARY.CONFIG_A2) &&
      Number(mineA?.unseen_announcements) > 0,
    mine.ok
      ? `${mineRows.length} room(s): ${mineRows.map((r) => `${r.offering_title}/${r.batch_name ?? "no batch"} as ${r.role}`).join(", ")}; ` +
        `masthead sentinel ${CANARY.CONFIG_A}=${mineTheme.includes(CANARY.CONFIG_A)} ${CANARY.CONFIG_A2}=${mineTheme.includes(CANARY.CONFIG_A2)}; ` +
        `unseen_announcements=${mineA?.unseen_announcements}`
      : mine.describe);

  const theirs = await rpc("member_A2", "get_my_cohort_rooms", {}, "get_my_cohort_rooms as member_A2");
  const theirsRows = listOf(theirs);
  const theirsA = theirsRows.find((r) => r.offering_id === ids.offering_a);
  const theirsTheme = JSON.stringify(theirsA?.theme ?? null);
  prove("MYROOMS.2",
    "member_A2's row for the SAME offering resolves batch A2's own config override instead of the offering default — the list's override lateral picks the caller's batch and only ever the caller's batch, so the two batches of one offering see two different rooms from the same RPC and neither is served the other's",
    theirs.ok && theirsRows.length === 1 && theirsA?.batch_id === ids.batch_a2 &&
      theirsTheme.includes(CANARY.CONFIG_A2),
    theirs.ok
      ? `${theirsRows.length} room(s); batch=${theirsA?.batch_name}; masthead sentinel ${CANARY.CONFIG_A2}=${theirsTheme.includes(CANARY.CONFIG_A2)}`
      : theirs.describe);

  for (const actor of ["accepted_A", "outsider"]) {
    const r = await rpc(actor, "get_my_cohort_rooms", {}, `get_my_cohort_rooms as ${actor}`);
    const rows = listOf(r);
    prove(`MYROOMS.3.${actor}`,
      `${actor} calling the room-list RPC receives an empty list — it reads cohort_room_members WHERE user_id = auth.uid() AND status = 'active', and ${actor} holds no such row, so a caller with no membership cannot learn that offering A has a room at all: no title, no masthead, no schedule, no announcement count`,
      r.ok && rows.length === 0 && !r.text.includes(CANARY.CONFIG_A),
      r.ok ? `${rows.length} row(s); offering-A masthead sentinel present=${r.text.includes(CANARY.CONFIG_A)}` : r.describe);
  }

  const lobby = await rpc("pre_member_A1", "get_my_cohort_rooms", {}, "get_my_cohort_rooms as pre_member_A1");
  const lobbyRows = listOf(lobby);
  const lobbyRow = lobbyRows[0];
  prove("MYROOMS.4",
    "the lobby occupant's row IS in the list — role pre_member, masthead present, offering-wide announcements counted — with next_due_at NULL and the batch-scoped aggregates (total_weeks, current_week, next_session_at) resolving to nothing: an assignment deadline is a member fact, and a lobby row that is queued for no batch has no batch whose curriculum clock is its own, so the redaction and the scope agree instead of one covering for the other",
    lobby.ok && lobbyRows.length === 1 && lobbyRow?.role === "pre_member" &&
      JSON.stringify(lobbyRow?.theme ?? null).includes(CANARY.CONFIG_A) &&
      lobbyRow?.batch_id === null && lobbyRow?.next_due_at === null &&
      Number(lobbyRow?.total_weeks) === 0 && lobbyRow?.current_week === null &&
      lobbyRow?.next_session_at === null && Number(lobbyRow?.unseen_announcements) > 0,
    lobby.ok
      ? `${lobbyRows.length} row(s); role=${lobbyRow?.role} masthead sentinel ${CANARY.CONFIG_A}=${JSON.stringify(lobbyRow?.theme ?? null).includes(CANARY.CONFIG_A)} ` +
        `batch=${lobbyRow?.batch_id ?? "NULL"} next_due_at=${JSON.stringify(lobbyRow?.next_due_at)} ` +
        `total_weeks=${lobbyRow?.total_weeks} current_week=${JSON.stringify(lobbyRow?.current_week)} next_session_at=${JSON.stringify(lobbyRow?.next_session_at)} ` +
        `unseen_announcements=${lobbyRow?.unseen_announcements}`
      : lobby.describe);

  const anonList = await rpc("anon", "get_my_cohort_rooms", {}, "get_my_cohort_rooms as anon");
  prove("MYROOMS.5",
    "an unauthenticated caller gets no room list at all — the EXECUTE grant stops at `authenticated` and the function raises 42501 on a NULL auth.uid() besides, so the room list is not a surface the anon key reaches; MYROOMS.1 proves the same RPC works for a logged-in member, which makes this a grant boundary rather than a dead function",
    !anonList.ok && !anonList.text.includes(CANARY.CONFIG_A),
    `${anonList.describe}; offering-A masthead sentinel present=${anonList.text.includes(CANARY.CONFIG_A)}`);
}

// ── PROG — get_cohort_progress, the one SHIPPED surface R0 redefines ───────
//
// Every other RPC in this phase is new: nothing calls it yet, so a mistake in
// it reaches nobody until R1 ships a screen. get_cohort_progress is the
// opposite — CohortDashboard.tsx:78 and :265 call it TODAY, from Capacitor
// builds that are already on phones and cannot be fixed in the same deploy —
// and R0 rewrites its body: a LATERAL … LIMIT 1 replacing the plain join, and
// a new own-user-or-admin assert. It had ZERO cases in this file. The suite
// was proving the wall around a room nobody can open yet while the one door
// already in use went untested.
section("PROG — get_cohort_progress", "the only shipped-client surface this phase redefines: one row per week, own account only");
{
  const own = await rpc("member_A1", "get_cohort_progress",
    { p_user_id: session.member_A1.id, p_offering_id: ids.offering_a }, "get_cohort_progress(self, A) as member_A1");
  const rows = Array.isArray(own.json) ? own.json : [];
  const weeks = new Set(rows.map((r) => r.week_id));

  prove("PROG.1",
    "member_A1's progress comes back as exactly ONE row per week even though that week carries five live sessions — the LATERAL … LIMIT 1 collapses the fan-out the plain join used to produce, and the shipped dashboard draws one card per row, so a week with three sessions used to draw three week cards; the row is armed with the curriculum body, the assignment brief, the mentor's feedback and the attendance mark, which proves all four joins actually resolved rather than the collapse being achieved by returning nothing",
    own.ok && rows.length > 0 && rows.length === weeks.size &&
      own.text.includes(CANARY.CURRIC_A1) && own.text.includes(CANARY.ASSIGN_A1) &&
      own.text.includes(CANARY.FEEDBACK_A1) &&
      rows[0]?.attended === true && rows[0]?.attendance_marked === true,
    own.ok
      ? `${rows.length} row(s) over ${weeks.size} distinct week(s); curriculum=${own.text.includes(CANARY.CURRIC_A1)} assignment=${own.text.includes(CANARY.ASSIGN_A1)} feedback=${own.text.includes(CANARY.FEEDBACK_A1)} attended=${rows[0]?.attended} attendance_marked=${rows[0]?.attendance_marked}`
      : own.describe);

  // The batch boundary, on the shipped surface. get_cohort_progress resolves
  // through cohort_batch_members, so the ONE thing keeping a batch-A1 student
  // out of batch A2's weeks is that join — the same shape that, one level down
  // on live_sessions, has no batch to join through at all (GAP-2/GAP-3). Both
  // week ids are named explicitly rather than counted, because "1 row came
  // back" is equally true of the right week and the wrong one.
  prove("PROG.1b",
    "the weeks member_A1 receives are their OWN batch's and never batch A2's — the sibling batch's week id is absent from the response and its curriculum body and assignment brief are absent with it, so the one already-shipped call site that reads room-adjacent data is batch-precise before any room UI exists to widen it",
    own.ok && weeks.has(ids.week_a1) && !weeks.has(ids.week_a2) &&
      !own.text.includes(CANARY.CURRIC_A2) && !own.text.includes(CANARY.ASSIGN_A2),
    `week ids returned: ${[...weeks].join(", ") || "none"} (own batch-A1 week present=${weeks.has(ids.week_a1)}, batch-A2 week present=${weeks.has(ids.week_a2)}); ` +
      `batch-A2 curriculum sentinel present=${own.text.includes(CANARY.CURRIC_A2)}`);

  // WHICH session survives the collapse is a decision with a right answer, and
  // it is invisible in a fixture where every session is in the future. The
  // week here holds four: one two days past, one running RIGHT NOW, one in
  // thirty minutes and one in three hours. The session a student needs on that
  // screen is the one they are supposed to be IN.
  const week1 = rows[0];
  const chosen = String(week1?.live_session_title || "");
  prove("PROG.2",
    "the session the week collapses to is the one RUNNING RIGHT NOW — not the next one to start, not the most recent to finish, and not the CANCELLED one that started even earlier and would have won on start time alone: the dashboard renders exactly one session card with one Join link per week, so a student sitting in a class that began twenty minutes ago must not be handed a link to the class that starts in thirty, and must never be sent to a class that was called off",
    own.ok && chosen.includes("LIVE") && !own.text.includes(CANARY.ZOOMCANCEL_A1),
    own.ok
      ? `chosen session: ${JSON.stringify(week1?.live_session_title)} at ${week1?.live_session_at} ` +
        `(candidates on this week: CANCELLED −60m still in window, LIVE −20m, NEAR +30m, FAR +3h, PAST −2d); ` +
        `cancelled link present in the response=${own.text.includes(CANARY.ZOOMCANCEL_A1)}`
      : own.describe);

  // The IDOR. This RPC is SECURITY DEFINER and took p_user_id straight from
  // the client, so before R0 any authenticated user could read any other
  // user's submission status, rating, mentor feedback and join link by passing
  // their uuid. Two callers, because "a stranger is refused" and "a room-mate
  // is refused" are different claims: the second is the one a cohort makes
  // possible, since a room-mate knows exactly whose uuid to try.
  for (const [actor, why] of [
    ["member_B", "a member of a different cohort"],
    ["member_A2", "a room-mate in the sibling batch of the SAME offering, who can read that uuid off their own roster"],
    ["outsider", "a stranger with nothing but a login"],
  ]) {
    const idor = await rpc(actor, "get_cohort_progress",
      { p_user_id: session.member_A1.id, p_offering_id: ids.offering_a },
      `get_cohort_progress(member_A1, A) as ${actor}`);
    prove(`PROG.3.${actor}`,
      `${actor} — ${why} — passing member_A1's uuid to get_cohort_progress is REFUSED (42501) and receives none of it: p_user_id is a client-supplied argument on a SECURITY DEFINER function, so without the own-user-or-admin assert this one call hands over another student's submission status, rating, mentor feedback and join link`,
      idor.raised && !idor.text.includes(CANARY.FEEDBACK_A1) && !idor.text.includes(CANARY.ASSIGN_A1),
      `${idor.describe}; feedback sentinel present=${idor.text.includes(CANARY.FEEDBACK_A1)}`);
  }

  for (const actor of ["accepted_A", "pre_member_A1", "outsider"]) {
    const self = await rpc(actor, "get_cohort_progress",
      { p_user_id: session[actor].id, p_offering_id: ids.offering_a },
      `get_cohort_progress(self, A) as ${actor}`);
    const selfRows = Array.isArray(self.json) ? self.json : [];
    prove(`PROG.4.${actor}`,
      `${actor} asking for their OWN progress in offering A gets an empty set — the RPC resolves through cohort_batch_members, and an applicant, a lobby occupant and a stranger all hold no roster row, so the curriculum, the assignment brief and the schedule are not reachable by asking about oneself either`,
      self.ok && selfRows.length === 0 && !self.text.includes(CANARY.CURRIC_A1),
      self.ok ? `${selfRows.length} row(s); curriculum sentinel present=${self.text.includes(CANARY.CURRIC_A1)}` : self.describe);
  }

  const anonProg = await rpc("anon", "get_cohort_progress",
    { p_user_id: session.member_A1.id, p_offering_id: ids.offering_a }, "get_cohort_progress as anon");
  prove("PROG.5",
    "an unauthenticated caller is refused outright — auth.uid() is NULL, so the own-user assert can never be satisfied by any uuid the anon key sends, and the shipped dashboard's RPC is not a surface reachable with the public key",
    !anonProg.ok && !anonProg.text.includes(CANARY.CURRIC_A1),
    `${anonProg.describe}; curriculum sentinel present=${anonProg.text.includes(CANARY.CURRIC_A1)}`);
}

// ── W6b — the lobby is read-only ───────────────────────────────────────────
section("W6b — pre_member community write", "the lobby can listen; it cannot speak until it is enrolled");
{
  const direct = await write("pre_member_A1", "cohort_room_posts", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1,
    author_id: session.pre_member_A1.id, kind: "post",
    body: "pre_member should not be able to post", channel_key: "general",
  }, "raw post INSERT as pre_member");
  prove("W6b.1",
    "a pre_member's community post is rejected — read-only is enforced at the write path, so an unfinished payment cannot start conversations in a room it has not fully joined",
    direct.rejected, direct.describe);

  const sig = await signature("cohort_room_post_write");
  const args = bind(sig, {
    offering: ids.offering_a, batch: ids.batch_a1,
    channel: "general", body: "pre_member via the write RPC", kind: "post",
  });
  if (!args) {
    prove("W6b.2", "cohort_room_post_write exists so the sanctioned write path can be attacked", false,
      sig ? `could not bind arguments onto (${sig.raw})` : "no cohort_room_post_write function in public — R-3 has not landed");
  } else {
    const viaRpc = await rpc("pre_member_A1", "cohort_room_post_write", args, "cohort_room_post_write as pre_member");
    prove("W6b.2",
      "the same write refused through the SECURITY DEFINER write RPC — the sanctioned path does not become a back door around the lobby's read-only rule",
      viaRpc.raised, viaRpc.describe);
  }
}

// ── W1 / W2 / W5 / W6 / W7 — the classic write attacks ─────────────────────
section("W1 / W2 / W5 / W6 / W7 — write attacks", "authorship, role and container scope are all server-pinned");
{
  const w1 = await write("member_B", "cohort_announcements", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1,
    author_id: session.member_B.id, body: "member_B posting into room A",
  }, "announcement into A as member_B");
  prove("W1.1", "a member of another offering cannot post an announcement into room A — write scope is checked against membership, not against what the client claims",
    w1.rejected, w1.describe);

  const w2 = await write("member_A1", "cohort_announcements", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1,
    author_id: session.member_A1.id, body: "plain member posting an announcement",
  }, "announcement as plain member_A1");
  prove("W2.1", "a plain member of room A cannot post to the noticeboard — the mentor/host role is required, so the official channel cannot be impersonated by a student",
    w2.rejected, w2.describe);

  const w5 = await write("mentor_A", `cohort_demo_entries?id=eq.${ids.demo_a1}`, "PATCH",
    { title: "edited by someone who is not the owner" }, "edit member_A1's demo entry as mentor_A");
  prove("W5.1",
    "even a mentor with full read access to the room cannot edit a student's demo-day entry — ownership, not room access, governs the write",
    w5.rejected || w5.changedNothing, w5.describe);

  const w5b = await write("member_A1", `cohort_demo_entries?id=eq.${ids.demo_a2}`, "PATCH",
    { title: "cross-batch edit" }, "edit member_A2's demo entry as member_A1");
  prove("W5.2", "a batch-A1 member cannot edit a batch-A2 member's showcase entry — cross-batch writes fail the same way cross-batch reads do",
    w5b.rejected || w5b.changedNothing, w5b.describe);

  const w6 = await write("member_A1", "cohort_room_posts", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1,
    author_id: session.member_A2.id, kind: "post", body: "forged authorship", channel_key: "general",
  }, "post with a forged author_id");
  prove("W6.1", "a member cannot publish a post under another member's name — author_id is pinned to auth.uid(), so nothing in this room can be put in someone else's mouth",
    w6.rejected, w6.describe);

  const w7 = await write("member_B", "cohort_room_posts", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1,
    author_id: session.member_B.id, kind: "post", body: "member_B in room A", channel_key: "general",
  }, "feed post into room A as member_B");
  prove("W7.1", "an outsider to the offering cannot inject a post into room A's feed", w7.rejected, w7.describe);
}

// ── W3 / W4 — membership and config are not client-writable ────────────────
section("W3 / W4 — membership and config are server-derived", "inviolable rule #2: a client can never claim its way in");
{
  const w3i = await write("outsider", "cohort_room_members", "POST", {
    user_id: session.outsider.id, offering_id: ids.offering_a, role: "member", source: "derived", status: "active",
  }, "self-INSERT a membership row");
  prove("W3.1",
    "a client cannot INSERT itself into cohort_room_members — the single table every room policy reads is unreachable from the client role, so nobody can self-grant a cohort",
    w3i.rejected, w3i.describe);

  const w3u = await write("member_A1", `cohort_room_members?user_id=eq.${session.member_A1.id}`, "PATCH",
    { role: "mentor", offering_id: ids.offering_b }, "escalate own membership row");
  prove("W3.2",
    "a member cannot UPDATE their own membership row to promote themselves to mentor or move themselves into another offering",
    w3u.rejected || w3u.changedNothing, w3u.describe);

  const w3d = await write("member_A1", `cohort_room_members?user_id=eq.${session.member_A1.id}`, "DELETE", {}, "DELETE own membership row");
  prove("W3.3", "a member cannot DELETE membership rows — revocation history cannot be erased from the client",
    w3d.rejected || w3d.changedNothing, w3d.describe);

  // R-1 deliberately makes this RPC return NULL + a WARNING rather than raise
  // (the nothing-raises rule), so the assertion that matters is not "it errored"
  // but "it wrote no row" — a silent no-op that still granted access would be
  // the worst of both worlds.
  const grant = await rpc("member_A1", "admin_grant_room_member",
    { p_user: session.member_A1.id, p_offering: ids.offering_b, p_role: "mentor" }, "admin_grant_room_member as a student");
  const granted = await sqlOne(
    `SELECT count(*)::int AS n FROM public.cohort_room_members
      WHERE user_id = ${lit(session.member_A1.id)} AND offering_id = ${lit(ids.offering_b)}`);
  prove("W3.4",
    "a student calling the admin grant RPC gets NULL back and NO membership row is written — the one sanctioned way to mint a manual mentor grant is is_admin()-gated, and its refusal is a genuine no-op rather than a swallowed error that granted anyway",
    (grant.raised || grant.json === null) && granted.n === 0,
    `returned ${JSON.stringify(grant.json)}; rows written into offering B for this student: ${granted.n}`);

  // W3.4's evidence is "NULL back, nothing written" — which is byte-identical to
  // the RPC being broken, mis-signatured or REVOKEd. Only the admin half tells
  // those apart, so the SAME call is now made with an admin JWT and must write
  // the row W3.4 proved a student cannot. Without this, W3.4 goes green against
  // a completely non-functional grant path.
  const adminGrant = await rpc("admin", "admin_grant_room_member",
    { p_user: session.member_A1.id, p_offering: ids.offering_b, p_role: "mentor" },
    "admin_grant_room_member as admin");
  const adminRow = await sqlOne(
    `SELECT role, source, status FROM public.cohort_room_members
      WHERE user_id = ${lit(session.member_A1.id)} AND offering_id = ${lit(ids.offering_b)}`);
  prove("W3.5",
    "the identical call, made with an ADMIN JWT, DOES mint the manual mentor row — so W3.4's refusal is is_admin() gating on a working RPC, not a function that refuses everyone equally because it is broken, mis-signatured or REVOKEd",
    adminGrant.ok && typeof adminGrant.json === "string" &&
      adminRow?.role === "mentor" && adminRow?.source === "manual" && adminRow?.status === "active",
    adminGrant.ok
      ? `RPC returned membership id ${adminGrant.json}; row is role=${adminRow?.role} source=${adminRow?.source} status=${adminRow?.status}`
      : adminGrant.describe);

  const adminRevoke = await rpc("admin", "admin_revoke_room_member",
    { p_user: session.member_A1.id, p_offering: ids.offering_b }, "admin_revoke_room_member as admin");
  const revokedRow = await sqlOne(
    `SELECT status FROM public.cohort_room_members
      WHERE user_id = ${lit(session.member_A1.id)} AND offering_id = ${lit(ids.offering_b)}`);
  prove("W3.6",
    "and the admin can withdraw it again — a manual grant is the one membership the truth tables cannot retract on their own, so an appointment made by mistake has a sanctioned off switch instead of needing raw SQL; the withdrawal is a SOFT revoke (status flips to 'revoked', the row survives), which is what keeps the grant-and-withdrawal auditable and is why every downstream read filters on status = 'active' rather than on the row's existence",
    adminRevoke.ok && Number(adminRevoke.json) === 1 && revokedRow?.status === "revoked",
    `RPC returned ${JSON.stringify(adminRevoke.json)} row(s) updated; the row still exists with status=${revokedRow?.status}. ` +
      "Note for a ROOM_QA_KEEP=1 run: this leaves a revoked manual mentor row for member_A1 in offering B that the fixture never created — the suite's own residue, not the fixture's. A normal run's teardown drops offering B and it cascades away.");

  const w4i = await write("member_A1", "cohort_room_configs", "POST", {
    offering_id: ids.offering_b, slug: "room-qa-forged", phase: "live",
    theme: { accent_h: 0, accent_s: 0, accent_l: 0 }, modules: {},
  }, "INSERT a room config");
  prove("W4.1", "a client cannot create a room config — rooms are opened by ops, not by whoever can POST",
    w4i.rejected, w4i.describe);

  const w4u = await write("member_A1", `cohort_room_configs?offering_id=eq.${ids.offering_a}`, "PATCH",
    { phase: "alumni", modules: { commons: true } }, "UPDATE the room config");
  prove("W4.2",
    "a member cannot UPDATE the room config — phase and modules drive lifecycle and UX, and a student flipping them is not a supported state",
    w4u.rejected || w4u.changedNothing, w4u.describe);
}

// ── GRANT — the verb list underneath the wall ──────────────────────────────
//
// THE ONE LAYER NOTHING IN THIS FILE HAD EVER READ. Every other case in the
// suite attacks through PostgREST, and PostgREST speaks GET/POST/PATCH/DELETE
// and nothing else. TRUNCATE has no verb there — so a client role holding
// TRUNCATE on a room table is invisible to every probe above, while being
// strictly worse than the INSERT/UPDATE/DELETE those probes do attack: it
// empties the table without evaluating a single row policy, it cannot be
// scoped by a USING clause, and it is not undone by revoking anything else.
// W3.1–W3.3 pass with it wide open.
//
// It is also not hypothetical. Supabase's bootstrap `ALTER DEFAULT PRIVILEGES
// IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role`
// hands every newly created table the full verb list — TRUNCATE included — and
// 20260729100000 §7 revokes `INSERT, UPDATE, DELETE` while 20260729100100 §7
// states its GRANTs explicitly and revokes only `anon`. Neither takes TRUNCATE
// back from `authenticated`. This section reads the catalogue and says so.
//
// WHAT THIS PROVES ON A SHADOW, HONESTLY. The whole section is only meaningful
// if something ever GRANTED the verbs it claims are absent — which on a
// migrations-built shadow is exactly what shadow-grants.sql's hand-maintained
// SECTION A does, and what nothing else does. That premise is measured, in two
// places, and neither of them is a pre-existing table:
//
//   · THE PRECONDITION carries the CREATION-TIME half. It demands the
//     bootstrap-only REFERENCES/TRIGGER pair on the R0 tables themselves, which
//     is the only observable that distinguishes "SECTION A ran before db push"
//     from "SECTION A ran after it, or never". A shadow that fails it never
//     reaches this section — the run aborts with exit 2 rather than printing a
//     green line here.
//   · GRANT.0a/GRANT.0b below carry the CURRENT-STATE half, by measuring the
//     statement SECTION A issues rather than any table's grants: 0a reads
//     pg_default_acl for schema public directly, and 0b creates a throwaway
//     table through the same channel `db push` uses and asserts it ARRIVES with
//     the client roles holding the full verb list. A shadow whose default
//     privileges were armed once and then revoked passes the precondition and
//     fails here, which is the state neither check sees alone.
//
// AN EARLIER REVISION ARMED THIS SECTION OFF `authenticated` HOLDING TRUNCATE ON
// public.offerings, AND THAT CONTROL COULD NOT FAIL. shadow-grants.sql SECTION B
// grants exactly that (offerings → authenticated → the full seven verbs) and
// SECTION B is the pass that runs AFTER `db push` — the pass that does NOT arm
// the nine R0 tables. A prod clone grants it too. So the control was satisfied by
// a statement orthogonal to the one it claimed to control for, and GRANT.1/
// GRANT.2 printed green on a database where nothing had ever held TRUNCATE on a
// room table. The rule the replacement follows: an arming control must measure
// the statement whose effect it is arming, not a table that statement happens to
// share a database with.
//
// Asserted through the SQL channel on purpose — has_table_privilege() is the
// only way to ask this question, and PostgREST exposes no TRUNCATE verb to ask
// it through.
section("GRANT — the verb list underneath the wall",
  "RLS is the second lock; the GRANT is the first, and TRUNCATE is the verb no PostgREST probe can reach");
{
  const ROOM_TABLES = ["cohort_room_configs", "cohort_room_members"];
  const CONTENT_TABLES = [
    "cohort_announcements", "cohort_resources", "cohort_room_posts",
    "cohort_room_post_replies", "cohort_recording_progress",
    "cohort_demo_entries", "cohort_room_seen",
  ];
  const VERBS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
  const DESTRUCTIVE = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"];
  const CLIENT_ROLES = ["anon", "authenticated"];
  // The throwaway witness for GRANT.0b. Created and dropped inside this section;
  // teardown() drops it again in case the process dies between the two.
  const PROBE_TABLE = "_room_qa_default_acl_probe";

  const tblValues = [...ROOM_TABLES, ...CONTENT_TABLES].map((t) => `(${lit(t)})`).join(", ");
  const verbValues = VERBS.map((v) => `(${lit(v)})`).join(", ");
  const rows = await sql(`
    SELECT t.tbl, r.rolname AS grantee, v.verb,
           has_table_privilege(r.oid, c.oid, v.verb) AS held
      FROM (VALUES ${tblValues}) AS t(tbl)
      CROSS JOIN (VALUES ${verbValues}) AS v(verb)
      CROSS JOIN pg_roles r
      JOIN pg_class c ON c.relname = t.tbl AND c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     WHERE r.rolname IN (${CLIENT_ROLES.map(lit).join(", ")})
     ORDER BY 1, 2, 3`);
  const held = new Map(rows.map((r) => [`${r.tbl}|${r.grantee}|${r.verb}`, pgBool(r.held)]));
  const has = (tbl, grantee, verb) => held.get(`${tbl}|${grantee}|${verb}`) === true;
  const verbsOf = (tbl, grantee) => VERBS.filter((v) => has(tbl, grantee, v));

  // ── GRANT.0a — the catalogue entry SECTION A writes ──────────────────────
  //
  // pg_default_acl is where `ALTER DEFAULT PRIVILEGES` lands, and it is the one
  // part of prod's grant model a per-table `information_schema.role_table_grants`
  // dump structurally cannot capture: the rows describe tables that do not exist
  // yet. Read per granting role, because default privileges are recorded per
  // granting role — `postgres` here, `supabase_admin` on the platform.
  const defacl = await sql(`
    SELECT creator.rolname AS creator, grantee.rolname AS grantee,
           string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type) AS privs
      FROM pg_default_acl d
      JOIN pg_roles creator ON creator.oid = d.defaclrole
      CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
      JOIN pg_roles grantee ON grantee.oid = a.grantee
     WHERE d.defaclnamespace = 'public'::regnamespace
       AND d.defaclobjtype = 'r'
       AND grantee.rolname IN (${CLIENT_ROLES.map(lit).join(", ")})
     GROUP BY 1, 2
     ORDER BY 1, 2`);
  const defaclByCreator = new Map();
  for (const row of defacl) {
    if (!defaclByCreator.has(row.creator)) defaclByCreator.set(row.creator, new Map());
    defaclByCreator.get(row.creator).set(row.grantee, String(row.privs || "").split(",").filter(Boolean));
  }
  const armingCreators = [...defaclByCreator.entries()].filter(([, byRole]) =>
    CLIENT_ROLES.every((role) => VERBS.every((v) => (byRole.get(role) || []).includes(v))));
  const defaclArmed = armingCreators.length > 0;
  prove("GRANT.0a",
    "this database carries the create-time bootstrap itself — a pg_default_acl entry on schema public for relations, handing `anon` AND `authenticated` the full seven-verb list, for at least one role that creates objects here. That is the statement production's platform runs once per project and that qa-harness/shadow-grants.sql SECTION A reproduces, read from the catalogue it actually lands in rather than inferred from some table's grants. It is the premise the two assertions below stand on: they claim verbs are ABSENT, and an absence only means something where a presence was possible",
    defaclArmed,
    defaclArmed
      ? `pg_default_acl(public, relations) armed by ${armingCreators.map(([c]) => c).join(", ")} — ` +
        armingCreators.map(([c, byRole]) =>
          CLIENT_ROLES.map((role) => `${c}→${role}=[${(byRole.get(role) || []).join(", ")}]`).join(" · ")).join(" · ")
      : (defacl.length
          ? `pg_default_acl(public, relations) exists but is incomplete: ` +
            defacl.map((r) => `${r.creator}→${r.grantee}=[${r.privs}]`).join(" · ")
          : "pg_default_acl holds NO entry for schema public / relations at all") +
        ". GRANT.1 and GRANT.2 below are VACUOUS in this state and are reported as failures rather than " +
        "passes. See the PROVISION recipe the precondition prints: SECTION A of qa-harness/shadow-grants.sql " +
        "must run BEFORE `supabase db push`, and on an already-pushed shadow that means emptying the database " +
        "first — the schema drop plus a wipe of supabase_migrations.schema_migrations, NOT `supabase db reset`, " +
        "which re-applies every migration as part of the reset and puts the R0 tables back before SECTION A runs.");

  // ── GRANT.0b — the same claim, measured instead of read ──────────────────
  //
  // A catalogue entry is a statement of intent; this is the effect. Create a
  // table through the SAME channel `db push` creates tables through and ask what
  // it ARRIVES holding. Nothing else in this file — and no migration, and no
  // line of shadow-grants.sql SECTION B — can put a verb on this table, so its
  // verb set is the create-time default and nothing else.
  let probeVerbs = { anon: [], authenticated: [] };
  let probeError = "";
  try {
    await sql(`
      DROP TABLE IF EXISTS public.${PROBE_TABLE};
      CREATE TABLE public.${PROBE_TABLE} (id int);
      SELECT 1;`);
    const probeRows = await sql(`
      SELECT r.rolname AS grantee, v.verb,
             has_table_privilege(r.oid, c.oid, v.verb) AS held
        FROM (VALUES ${verbValues}) AS v(verb)
        CROSS JOIN pg_roles r
        JOIN pg_class c ON c.relname = ${lit(PROBE_TABLE)}
         AND c.relnamespace = 'public'::regnamespace
         AND c.relkind IN ('r', 'p')
       WHERE r.rolname IN (${CLIENT_ROLES.map(lit).join(", ")})`);
    for (const role of CLIENT_ROLES) {
      probeVerbs[role] = probeRows.filter((r) => r.grantee === role && pgBool(r.held)).map((r) => r.verb);
    }
  } catch (e) {
    probeError = e.message;
  } finally {
    await sql(`DROP TABLE IF EXISTS public.${PROBE_TABLE}; SELECT 1;`).catch(() => {});
  }
  const probeArmed = !probeError &&
    CLIENT_ROLES.every((role) => VERBS.every((v) => probeVerbs[role].includes(v)));
  prove("GRANT.0b",
    "and the bootstrap is not merely recorded, it FIRES: a table created right now through the same connection `supabase db push` uses arrives with `anon` and `authenticated` already holding all seven verbs, TRUNCATE included. This is the empirical form of GRANT.0a and it closes the gap between them — a pg_default_acl row written FOR a role this connection is not, or armed on a different schema, reads fine in the catalogue and grants nothing to the tables the migrations actually create",
    probeArmed,
    probeError
      ? `could not run the create-time probe: ${probeError}`
      : CLIENT_ROLES.map((role) => `${role}=[${probeVerbs[role].join(", ") || "nothing"}]`).join(" · ") +
        (probeArmed
          ? " on a table created seconds ago and dropped again"
          : " on a freshly created table — the create-time grant did NOT fire for these roles, so every " +
            "table the R0 migrations created arrived the same way and the REVOKEs in both §7s took back nothing"));

  const controlArmed = defaclArmed && probeArmed;

  const roomOffenders = [];
  for (const tbl of ROOM_TABLES) {
    if (!has(tbl, "authenticated", "SELECT")) roomOffenders.push(`${tbl}: authenticated has NO SELECT`);
    for (const v of DESTRUCTIVE) if (has(tbl, "authenticated", v)) roomOffenders.push(`${tbl}: authenticated holds ${v}`);
    for (const v of VERBS) if (has(tbl, "anon", v)) roomOffenders.push(`${tbl}: anon holds ${v}`);
  }
  prove("GRANT.1",
    "on BOTH room tables `authenticated` holds SELECT and none of the four verbs that can change or destroy a row — no INSERT, no UPDATE, no DELETE and no TRUNCATE — and `anon` holds nothing at all. Membership is server-derived (NFR-SEC-1) and the config is ops-owned, so the client role's entire relationship with cohort_room_members and cohort_room_configs is reading its own rows through RLS. TRUNCATE is named because it is the one verb the bootstrap hands out that section 7's `REVOKE INSERT, UPDATE, DELETE` does not take back, it empties a table without evaluating one row policy, and PostgREST exposes no verb for it — so W3.1–W3.3 all pass with it held",
    controlArmed && roomOffenders.length === 0,
    !controlArmed
      ? "VACUOUS — the create-time bootstrap is not armed on this database, so this assertion could not have failed. See GRANT.0a / GRANT.0b."
      : roomOffenders.length === 0
        ? ROOM_TABLES.map((t) => `${t}: authenticated=[${verbsOf(t, "authenticated").join(", ")}] anon=[${verbsOf(t, "anon").join(", ") || "none"}]`).join(" · ") +
          " (REFERENCES/TRIGGER are not asserted HERE — neither reads nor destroys a row, and both are inert without CREATE on the schema — but they are not decoration either: the PRECONDITION asserts them on these same tables as the one observable proving they were CREATED under the bootstrap, which is what makes this line's absences meaningful)"
        : `HELD: ${roomOffenders.join("; ")}`);

  const contentOffenders = [];
  for (const tbl of CONTENT_TABLES) {
    if (!has(tbl, "authenticated", "SELECT")) contentOffenders.push(`${tbl}: authenticated has NO SELECT`);
    if (has(tbl, "authenticated", "TRUNCATE")) contentOffenders.push(`${tbl}: authenticated holds TRUNCATE`);
    for (const v of VERBS) if (has(tbl, "anon", v)) contentOffenders.push(`${tbl}: anon holds ${v}`);
  }
  prove("GRANT.2",
    "no client role can TRUNCATE any of the seven room-content tables, and `anon` holds nothing on any of them. Their SELECT/INSERT/UPDATE/DELETE sets are the ones 20260729100100 §7 states deliberately and are not narrowed here — every one of those verbs is filtered by a row policy the rest of this suite attacks. TRUNCATE is the exception: it is granted by the same bootstrap, revoked by nothing, filtered by no policy, and would let any logged-in user with a direct connection empty a cohort's noticeboard, library, feed, gallery and every recording position in one statement",
    controlArmed && contentOffenders.length === 0,
    !controlArmed
      ? "VACUOUS — the create-time bootstrap is not armed on this database, so this assertion could not have failed. See GRANT.0a / GRANT.0b."
      : contentOffenders.length === 0
        ? `${CONTENT_TABLES.length} tables, authenticated verb sets: ` +
          CONTENT_TABLES.map((t) => `${t}=[${verbsOf(t, "authenticated").join(", ")}]`).join(" · ") +
          "; anon holds nothing on any of them"
        : `HELD: ${contentOffenders.join("; ")}`);
}

// ── W8 / W9 — the write RPC's two server-side stamps ────────────────────────
section("W8 / W9 — channel + mentor-answer forgery", "the two controls that cannot be expressed as a table policy");
{
  const postSig = await signature("cohort_room_post_write");
  const replySig = await signature("cohort_room_reply_write");

  const forgedArgs = bind(postSig, {
    offering: ids.offering_a, batch: ids.batch_a1,
    channel: "forged_channel_ROOMQA", body: "forged channel attempt", kind: "post",
  });
  if (!forgedArgs) {
    prove("W8.1", "cohort_room_post_write exists so channel forgery can be attempted", false,
      postSig ? `could not bind arguments onto (${postSig.raw})` : "function not found in public — R-3 has not landed");
    prove("W8.2", "a legitimate channel_key still writes — the control that proves W8.1 is validation and not a broken call", false,
      "skipped: the write RPC could not be called");
  } else {
    const forged = await rpc("member_A1", "cohort_room_post_write", forgedArgs,
      "cohort_room_post_write with a forged channel_key");
    prove("W8.1",
      "a channel_key outside the room's resolved standing + niche set is rejected — because channel_key is free text by design (so niche channels stay a config edit), this server-side validation is the only thing between a niche channel and an arbitrary one",
      forged.raised, forged.describe);

    const okPost = await rpc("member_A1", "cohort_room_post_write",
      bind(postSig, {
        offering: ids.offering_a, batch: ids.batch_a1,
        channel: "general", body: "legitimate post ROOMQA_W8_CONTROL", kind: "post",
      }), "cohort_room_post_write with a valid channel_key");
    prove("W8.2",
      "the same call with a standing channel_key succeeds — so W8.1 above is a rejection by validation, not a call that never landed",
      okPost.ok, okPost.describe);
  }

  const rawPost = await write("member_A1", "cohort_room_posts", "POST", {
    offering_id: ids.offering_a, batch_id: ids.batch_a1, author_id: session.member_A1.id,
    kind: "post", body: "raw INSERT bypassing the write RPC", channel_key: "general",
  }, "raw INSERT on cohort_room_posts");
  prove("W9.1",
    "a raw client INSERT on cohort_room_posts is refused — the INSERT grant is revoked, so the channel and mentor-answer validations cannot be skipped by talking to the table directly",
    rawPost.rejected, rawPost.describe);

  const rawReply = await write("member_A1", "cohort_room_post_replies", "POST",
    { post_id: ids.post_a1, author_id: session.member_A1.id, body: "raw reply INSERT", is_mentor_answer: true },
    "raw INSERT on cohort_room_post_replies");
  prove("W9.2",
    "a raw client INSERT on cohort_room_post_replies is refused, including one that tries to set is_mentor_answer directly",
    rawReply.rejected, rawReply.describe);

  const forgedAnswerArgs = bind(replySig, {
    post: ids.post_a1, body: "student pretending to be staff ROOMQA_W9", mentor: true,
  });
  if (!forgedAnswerArgs) {
    prove("W9.3", "cohort_room_reply_write exists so mentor-answer forgery can be attempted", false,
      replySig ? `could not bind arguments onto (${replySig.raw})` : "function not found in public — R-3 has not landed");
    prove("W9.4", "a real mentor's reply is stamped TRUE — the control that proves the stamp is derived, not defaulted", false,
      "skipped: the reply write RPC could not be called");
  } else {
    const forgedAnswer = await rpc("member_A1", "cohort_room_reply_write", forgedAnswerArgs,
      "cohort_room_reply_write with is_mentor_answer=true as a student");
    const row = await sqlOne(
      `SELECT is_mentor_answer FROM public.cohort_room_post_replies
        WHERE body LIKE '%staff ROOMQA_W9' ORDER BY created_at DESC LIMIT 1`);
    prove("W9.3",
      "a student passing is_mentor_answer=true produces a row stamped FALSE — the flag is stamped from the caller's resolved membership role, so a student answer can never wear the authority of a mentor answer",
      forgedAnswer.raised || row?.is_mentor_answer === false,
      forgedAnswer.raised ? `call rejected outright: ${forgedAnswer.describe}` : `stored is_mentor_answer=${row?.is_mentor_answer}`);

    const mentorAnswer = await rpc("mentor_A", "cohort_room_reply_write",
      bind(replySig, { post: ids.post_a1, body: "the real mentor answer ROOMQA_W9_MENTOR", mentor: false }),
      "cohort_room_reply_write as mentor_A");
    const mentorRow = await sqlOne(
      `SELECT is_mentor_answer FROM public.cohort_room_post_replies
        WHERE body LIKE '%ROOMQA_W9_MENTOR%' ORDER BY created_at DESC LIMIT 1`);
    prove("W9.4",
      "a real mentor's reply is stamped TRUE even though the client sent false — the stamp is derived server-side in both directions, so it reflects the room's roster and nothing else",
      mentorAnswer.ok && mentorRow?.is_mentor_answer === true,
      mentorAnswer.ok ? `stored is_mentor_answer=${mentorRow?.is_mentor_answer}` : mentorAnswer.describe);
  }
}

// ── R3F / R3R — the built feed and binder read envelopes ───────────────────
section("R3F / R3R — feed + resource binder", "one bounded page, exact batch scope, no applicant or contact data");
{
  // Add one positive win through the real write path. The seed already has a
  // general question and W8 added a second valid post, so a page size of one is
  // now guaranteed to have a next page for a non-vacuous keyset test.
  const postSig = await signature("cohort_room_post_write");
  const win = postSig
    ? await rpc("member_A1", "cohort_room_post_write", bind(postSig, {
        offering: ids.offering_a,
        batch: ids.batch_a1,
        channel: "general",
        body: "ROOM QA win for the pagination control",
        kind: "win",
      }), "create a real A1 win before reading the feed")
    : null;

  const feedArgs = {
    p_offering: ids.offering_a,
    p_channel: "all",
    p_batch: null,
    p_before_activity: null,
    p_before_id: null,
    p_limit: 40,
  };
  const feedA1 = await rpc("member_A1", "get_room_feed", feedArgs, "get_room_feed(A) as member_A1");
  const postsA1 = Array.isArray(feedA1.json?.posts) ? feedA1.json.posts : [];
  const feedKeys = new Set(postsA1.flatMap((post) => Object.keys(post ?? {})));
  const replyKeys = new Set(postsA1.flatMap((post) =>
    Array.isArray(post?.replies) ? post.replies.flatMap((reply) => Object.keys(reply ?? {})) : []));
  const forbiddenKeys = ["email", "phone", "bio", "tally_data", "content_text"];

  prove("R3F.1",
    "a batch-A1 member receives their own feed rows and inline replies through one RPC, including the planted A1 canary, while batch A2 and offering B remain absent",
    feedA1.ok && postsA1.length >= 2 && feedA1.text.includes(CANARY.A1) &&
      !feedA1.text.includes(CANARY.A2) && !feedA1.text.includes(CANARY.B1),
    feedA1.ok
      ? `${postsA1.length} post(s); A1=${feedA1.text.includes(CANARY.A1)} A2=${feedA1.text.includes(CANARY.A2)} B1=${feedA1.text.includes(CANARY.B1)}`
      : feedA1.describe);

  prove("R3F.2",
    "the feed projection contains no contact, applicant-essay, raw-community or tally field on either posts or replies",
    feedA1.ok && forbiddenKeys.every((key) => !feedKeys.has(key) && !replyKeys.has(key)),
    `post keys: ${[...feedKeys].sort().join(", ")}; reply keys: ${[...replyKeys].sort().join(", ")}`);

  const wins = await rpc("member_A1", "get_room_feed", { ...feedArgs, p_channel: "wins" }, "get_room_feed(A,wins)");
  const winRows = Array.isArray(wins.json?.posts) ? wins.json.posts : [];
  prove("R3F.3",
    "the Wins standing channel is a real kind-filtered view, not a free-text channel alias: the control win is returned and every returned row has kind=win",
    !!win?.ok && wins.ok && winRows.length > 0 && winRows.every((post) => post.kind === "win"),
    wins.ok ? `${winRows.length} win row(s), kinds=${[...new Set(winRows.map((post) => post.kind))].join(",")}` : wins.describe);

  const page1 = await rpc("member_A1", "get_room_feed", { ...feedArgs, p_limit: 1 }, "get_room_feed page 1");
  const cursor = page1.json?.next_cursor;
  const firstRows = Array.isArray(page1.json?.posts) ? page1.json.posts : [];
  const page2 = cursor
    ? await rpc("member_A1", "get_room_feed", {
        ...feedArgs,
        p_limit: 1,
        p_before_activity: cursor.activity,
        p_before_id: cursor.id,
      }, "get_room_feed page 2")
    : null;
  const secondRows = Array.isArray(page2?.json?.posts) ? page2.json.posts : [];
  prove("R3F.4",
    "keyset pagination exposes an explicit next cursor, advances to a different post, and therefore gives the client a real terminus instead of a silent fixed limit",
    page1.ok && page1.json?.has_more === true && !!cursor && firstRows.length === 1 &&
      !!page2?.ok && secondRows.length === 1 && firstRows[0].id !== secondRows[0].id,
    `page1=${firstRows[0]?.id ?? "none"}, has_more=${page1.json?.has_more}, cursor=${!!cursor}, page2=${secondRows[0]?.id ?? "none"}`);

  const resourcesA1 = await rpc("member_A1", "get_room_resources", {
    p_offering: ids.offering_a,
    p_batch: null,
  }, "get_room_resources(A) as member_A1");
  const resourceRows = Array.isArray(resourcesA1.json?.resources) ? resourcesA1.json.resources : [];
  const resourceKeys = new Set(resourceRows.flatMap((resource) => Object.keys(resource ?? {})));
  prove("R3R.1",
    "the binder returns batch-A1's week-grouped resources and mentor material, never batch A2 or offering B, with no contact/applicant/tally fields",
    resourcesA1.ok && resourceRows.length >= 2 && resourcesA1.text.includes(CANARY.A1) &&
      resourcesA1.text.includes(CANARY.MENTORDOC_A1) && !resourcesA1.text.includes(CANARY.A2) &&
      !resourcesA1.text.includes(CANARY.B1) && forbiddenKeys.every((key) => !resourceKeys.has(key)),
    resourcesA1.ok
      ? `${resourceRows.length} resource(s); week numbers=${resourceRows.map((r) => r.week_number).join(",")}; keys=${[...resourceKeys].sort().join(",")}`
      : resourcesA1.describe);

  const deniedActors = ["member_B", "accepted_A", "pre_member_A1", "outsider", "anon"];
  const deniedReads = [];
  for (const actor of deniedActors) {
    deniedReads.push([
      actor,
      await rpc(actor, "get_room_feed", feedArgs, `get_room_feed(A) as ${actor}`),
      await rpc(actor, "get_room_resources", { p_offering: ids.offering_a, p_batch: null }, `get_room_resources(A) as ${actor}`),
    ]);
  }
  const escaped = deniedReads.filter(([, feed, resources]) => !feed.raised || !resources.raised);
  prove("R3F/R3R.2",
    "another offering's member, an unpaid accepted applicant, a pre-member lobby occupant, an outsider and anon are all raised at by both read RPCs rather than handed empty or cross-room content",
    escaped.length === 0,
    escaped.length === 0
      ? deniedReads.map(([actor, feed, resources]) => `${actor}:feed ${feed.status}/resources ${resources.status}`).join(" · ")
      : `ESCAPED: ${escaped.map(([actor, feed, resources]) => `${actor}(feed raised=${feed.raised}, resources raised=${resources.raised})`).join(", ")}`);

  // The mentor is offering-wide and has INSERT on resources. Give the trigger
  // the exact forgery the old policy admitted: A1 resource, A2 week.
  const crossWeek = await write("mentor_A", "cohort_resources", "POST", {
    offering_id: ids.offering_a,
    batch_id: ids.batch_a1,
    cohort_week_id: ids.week_a2,
    title: "forged cross-batch week",
    kind: "link",
    url: "https://files.test/cross-week",
    added_by: session.mentor_A.id,
  }, "resource under batch A1 pointing at batch A2's week");
  prove("R3R.3",
    "the table boundary rejects a resource whose week belongs to another batch, so week grouping can never carry another cohort's title through an otherwise readable resource row",
    crossWeek.rejected,
    crossWeek.describe);

  const memberResource = await write("member_A1", "cohort_resources", "POST", {
    offering_id: ids.offering_a,
    batch_id: ids.batch_a1,
    cohort_week_id: null,
    title: "member-forged binder row",
    kind: "link",
    url: "https://files.test/member-forge",
    added_by: session.member_A1.id,
  }, "plain member attempting to write the resource binder");
  prove("R3R.4",
    "a plain cohort member cannot INSERT into the resource binder; the admin resource tab is convenience over a table boundary that still grants writes only to admin/room staff",
    memberResource.rejected,
    memberResource.describe);
}

// ── C2 — the T-60 zoom gate ────────────────────────────────────────────────
section("C2 — the zoom-link gate is server-side", "a link the client never received cannot be rendered early");
{
  // ARM THE WITHHELD LINK FIRST. Every claim below about the T+3h session says
  // "nobody got it" — a sentence that is equally true of a session whose
  // zoom_link is NULL. The admin branch of the RPC (20260408151600:70-72)
  // returns the link with no window check at all, which is the one path that
  // can prove the string exists before the rest of the section proves nobody
  // else can reach it.
  const adminFar = await rpc("admin", "get_live_session_zoom_link",
    { p_session_id: ids.session_far_a1 }, "get_live_session_zoom_link(FAR) as admin [positive control]");
  prove("C2.0",
    "an admin pulls the T+3h session's join link and it is a real string carrying the withheld sentinel — the link EXISTS, so every 'zoom_link was NULL / absent / not in the corpus' result below is the gate holding and not an empty column",
    typeof adminFar.json === "string" && adminFar.json.includes(CANARY.ZOOM_A1),
    typeof adminFar.json === "string" ? "admin received the FAR session's link" : adminFar.describe);

  const before = mark("member_A1");
  const envelope = await rpc("member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) zoom gate");
  const sessions = envelope.json?.sessions ?? [];
  const far = sessions.find((s) => (s.title || "").includes("FAR"));
  const near = sessions.find((s) => (s.title || "").includes("NEAR"));

  prove("C2.1",
    "the session three hours out comes back with zoom_link NULL — the join link is withheld by the server until T-60, so it cannot be scraped from a response and shared ahead of time",
    !!far && (far.zoom_link === null || far.zoom_link === undefined),
    far ? `FAR session zoom_link=${JSON.stringify(far.zoom_link)}` : "FAR session missing from the envelope");

  prove("C2.2",
    "the session thirty minutes out DOES carry its zoom_link — the gate opens on time, so this is a timing control and not a permanently broken field",
    !!near && typeof near.zoom_link === "string" && near.zoom_link.length > 0,
    near ? `NEAR session zoom_link=${near.zoom_link ? "present" : "null"}` : "NEAR session missing from the envelope");

  // Two halves, because "the canary was absent" alone is satisfied by a member
  // who cannot read the table at all. member_A1 provably CAN (PRE.8), so:
  //   (a) the projection a real client uses returns the session and no link;
  //   (b) explicitly ASKING for the column is refused by the column-level
  //       REVOKE, which is what makes (a) a guarantee rather than a habit.
  const directSafe = await read("member_A1",
    `live_sessions?title=eq.ROOM%20QA%20A1%20FAR%20session&select=id,title,scheduled_at,status,recording_url`,
    "FAR session read directly from the table");
  prove("C2.3a",
    "reading live_sessions directly returns the FAR session row to this member and still no join link — the T-60 gate is not merely an RPC nicety that a direct table read walks around",
    directSafe.ok && directSafe.rows > 0 && !directSafe.text.includes(CANARY.ZOOM_A1), directSafe.describe);

  const directZoom = await read("member_A1",
    `live_sessions?title=eq.ROOM%20QA%20A1%20FAR%20session&select=id,zoom_link`,
    "FAR session asking for zoom_link explicitly");
  prove("C2.3b",
    "naming zoom_link in the projection is refused outright by the column-level REVOKE — the link is not a field the client is trusted to omit, it is a column `authenticated` cannot select at any time, for any session",
    !directZoom.ok && !directZoom.text.includes(CANARY.ZOOM_A1), directZoom.describe);

  // The OTHER server path to a join link. It predates the room work and gates on
  // any active enrolment in an offering mapped to the course — not on the room,
  // and not on the batch — so it has to be attacked on its own terms.
  const linkFar = await rpc("member_A1", "get_live_session_zoom_link",
    { p_session_id: ids.session_far_a1 }, "get_live_session_zoom_link(FAR) as member_A1");
  prove("C2.5",
    "get_live_session_zoom_link returns NULL for the session three hours out — the older link RPC enforces the same window as the envelope, so a member cannot collect the link early by calling the path the room screen does not use",
    linkFar.returnedNull && !linkFar.text.includes(CANARY.ZOOM_A1),
    `HTTP ${linkFar.status}, body ${JSON.stringify(linkFar.text.slice(0, 80))}`);

  const linkNear = await rpc("member_A1", "get_live_session_zoom_link",
    { p_session_id: ids.session_near_a1 }, "get_live_session_zoom_link(NEAR) as member_A1");
  prove("C2.6",
    "the same RPC DOES return the link for the session thirty minutes away — so C2.5 is a timing refusal and not a permanently broken function, and an entitled student is not locked out of their own class",
    typeof linkNear.json === "string" && linkNear.json.includes(CANARY.ZOOMNEAR_A1),
    `returned ${typeof linkNear.json === "string" ? "a link" : JSON.stringify(linkNear.json)}`);

  // The session that is RUNNING RIGHT NOW — the middle of the window, which
  // FAR and NEAR between them never test. The gate is a WINDOW (T-60 → end +
  // 1h), not a threshold, and a student walking into class late is the case
  // that must not be locked out.
  const linkLive = await rpc("member_A1", "get_live_session_zoom_link",
    { p_session_id: ids.session_live_a1 }, "get_live_session_zoom_link(LIVE) as member_A1");
  prove("C2.6b",
    "the session that started twenty minutes ago and is still running DOES hand its link to an entitled member — the gate is a window around the class and not a countdown that shuts at the start time, so a student who joins late is not locked out of a class they paid for",
    typeof linkLive.json === "string" && linkLive.json.includes(CANARY.ZOOMLIVE_A1),
    `returned ${typeof linkLive.json === "string" ? "a link" : JSON.stringify(linkLive.json)}`);

  // A CALLED-OFF CLASS HANDS OUT NOTHING, to anyone, at any distance. The
  // cancelled session is inside its own window right now and its caller is a
  // fully entitled member of the batch that owns it, so the only reason to
  // withhold the link is the cancellation itself — which makes this the one
  // probe where `status = 'cancelled'` is the sole variable.
  const cancelledEnvelope = (envelope.json?.sessions ?? []).find((s) => (s.title || "").includes("CANCELLED"));
  const linkCancelled = await rpc("member_A1", "get_live_session_zoom_link",
    { p_session_id: ids.session_cancelled_a1 }, "get_live_session_zoom_link(CANCELLED) as member_A1");
  const adminCancelled = await rpc("admin", "get_live_session_zoom_link",
    { p_session_id: ids.session_cancelled_a1 }, "get_live_session_zoom_link(CANCELLED) as admin [positive control]");
  prove("C2.9",
    "the cancelled session appears on the entitled member's schedule with NO join link — in the envelope and from the link RPC alike — while an admin can still retrieve it: the link exists, the class does not, so this is the cancellation being enforced on both server paths and not a row with an empty column",
    (linkCancelled.returnedNull || linkCancelled.raised) &&
      !linkCancelled.text.includes(CANARY.ZOOMCANCEL_A1) &&
      (!cancelledEnvelope || cancelledEnvelope.zoom_link === null || cancelledEnvelope.zoom_link === undefined) &&
      typeof adminCancelled.json === "string" && adminCancelled.json.includes(CANARY.ZOOMCANCEL_A1),
    `link RPC as member_A1: HTTP ${linkCancelled.status} ${JSON.stringify(linkCancelled.text.slice(0, 40))}; ` +
      `envelope entry zoom_link=${JSON.stringify(cancelledEnvelope?.zoom_link)}; ` +
      `admin retrieved the link=${typeof adminCancelled.json === "string"}`);

  // THE ENTITLEMENT HALF OF THE LINK GATE, AS A MATRIX. It used to be two
  // calls — member_B and outsider, both against ONE session — which is why the
  // A2 and B1 join links were planted in the fixture and then hunted by
  // nobody. Every pair below is (caller who must get nothing, session they
  // should not be able to reach), and each row's sentinel is armed by a
  // positive control above or below it: the fixture puts all three of these
  // sessions INSIDE the T-60 window on purpose, so a NULL here is the RPC
  // refusing the CALLER and never the clock refusing everybody.
  const LINK_DENIALS = [
    ["member_B", ids.session_near_a1, "offering A's imminent session", CANARY.ZOOMNEAR_A1],
    ["member_B", ids.session_live_a1, "offering A's running session", CANARY.ZOOMLIVE_A1],
    ["member_B", ids.session_a2, "offering A's other batch's session", CANARY.ZOOM_A2],
    ["outsider", ids.session_near_a1, "offering A's imminent session", CANARY.ZOOMNEAR_A1],
    ["outsider", ids.session_live_a1, "offering A's running session", CANARY.ZOOMLIVE_A1],
    ["outsider", ids.session_a2, "offering A's other batch's session", CANARY.ZOOM_A2],
    ["outsider", ids.session_b1, "offering B's imminent session", CANARY.ZOOM_B1],
    ["accepted_A", ids.session_near_a1, "the imminent session of the room they were admitted to", CANARY.ZOOMNEAR_A1],
    ["accepted_A", ids.session_live_a1, "the running session of that same room", CANARY.ZOOMLIVE_A1],
    ["anon", ids.session_near_a1, "offering A's imminent session", CANARY.ZOOMNEAR_A1],
    ["anon", ids.session_b1, "offering B's imminent session", CANARY.ZOOM_B1],
    ["member_A1", ids.session_b1, "another OFFERING's imminent session", CANARY.ZOOM_B1],
    ["member_A2", ids.session_b1, "another OFFERING's imminent session", CANARY.ZOOM_B1],
  ];
  for (const [actor, sessionId, what, sentinel] of LINK_DENIALS) {
    const r = await rpc(actor, "get_live_session_zoom_link",
      { p_session_id: sessionId }, `get_live_session_zoom_link(${what}) as ${actor}`);
    prove(`C2.7.${actor}.${sentinel.replace("LEAK_CANARY_", "")}`,
      `${actor} asking for the join link of ${what} gets NULL or is refused — the link RPC is entitlement-gated as well as time-gated, and this session is INSIDE its window right now, so knowing a session id is worth nothing without an enrolment behind it`,
      (r.returnedNull || r.raised) && !r.text.includes(sentinel),
      `HTTP ${r.status}, body ${JSON.stringify(r.text.slice(0, 80))}; ${sentinel} present=${r.text.includes(sentinel)}`);
  }

  // The other side of the same matrix: the two sessions above whose links this
  // suite claims nobody else can reach are genuinely reachable by the people
  // who ARE entitled to them. Without these two, every NULL above is equally
  // explained by a NULL zoom_link column.
  const a2OwnLink = await rpc("member_A2", "get_live_session_zoom_link",
    { p_session_id: ids.session_a2 }, "get_live_session_zoom_link(A2) as member_A2 [positive control]");
  const bOwnLink = await rpc("member_B", "get_live_session_zoom_link",
    { p_session_id: ids.session_b1 }, "get_live_session_zoom_link(B1) as member_B [positive control]");
  prove("C2.8",
    "batch A2's member and offering B's member each DO receive their own imminent session's link — so every NULL in the matrix above is the RPC refusing a caller, not a fixture with an empty zoom_link column, and the two links R0's own actors must never see are proven to exist",
    typeof a2OwnLink.json === "string" && a2OwnLink.json.includes(CANARY.ZOOM_A2) &&
      typeof bOwnLink.json === "string" && bOwnLink.json.includes(CANARY.ZOOM_B1),
    `member_A2 → A2 session: ${a2OwnLink.json ? "link" : JSON.stringify(a2OwnLink.json)}; member_B → B1 session: ${bOwnLink.json ? "link" : JSON.stringify(bOwnLink.json)}`);

  proveCorpusClean("C2.4", "member_A1", [CANARY.ZOOM_A1, CANARY.ZOOMCANCEL_A1],
    "neither the withheld T+3h link nor the cancelled class's link appears anywhere in what member_A1 was served during this run — this member is entitled to both sessions and reads both rows, so the only thing keeping either link out of their hands is the server withholding it",
    before);
}

// ── NFR-CONFIG-2 — a feature flag can never be a privilege escalation ──────
section("NFR-CONFIG-2 — flags are UX, never authorization", "inviolable rule #3: RLS is membership-gated regardless of any modules value");
{
  const baseline = {};
  for (const actor of ["outsider", "accepted_A"]) {
    baseline[actor] = [];
    for (const [name, path] of SURFACES_A) {
      const r = await read(actor, path, `${name}(A) as ${actor} [flags OFF]`);
      baseline[actor].push([name, r.ok ? r.rows : `denied ${r.status}`]);
    }
  }

  const allOn = JSON.stringify(Object.fromEntries(MODULE_KEYS.map((k) => [k, true])));
  await sql(
    `UPDATE public.cohort_room_configs SET modules = ${lit(allOn)}::jsonb
      WHERE offering_id = ${lit(ids.offering_a)}`);

  const after = {};
  const mkOutsider = mark("outsider");
  const mkAccepted = mark("accepted_A");
  for (const actor of ["outsider", "accepted_A"]) {
    after[actor] = [];
    for (const [name, path] of SURFACES_A) {
      const r = await read(actor, path, `${name}(A) as ${actor} [flags ON]`);
      after[actor].push([name, r.ok ? r.rows : `denied ${r.status}`]);
    }
  }

  for (const actor of ["outsider", "accepted_A"]) {
    const same = JSON.stringify(baseline[actor]) === JSON.stringify(after[actor]);
    prove(`NFR-CONFIG-2.${actor}`,
      `turning every one of the ${MODULE_KEYS.length} module flags ON for room A changes ${actor}'s row counts on all ${SURFACES_A.length} surfaces by exactly nothing — a config edit is UX only and can never become a privilege escalation, which is what makes "just enable the module" a safe operation for ops`,
      same,
      same ? `identical: ${after[actor].map(([n, v]) => `${n}:${v}`).join(" · ")}`
           : `OFF ${JSON.stringify(baseline[actor])} vs ON ${JSON.stringify(after[actor])}`);
  }
  // Swept over A_SECRETS_VIA_SURFACES, not ALL_A_SECRETS: this window is the ten
  // room-content surfaces and nothing else, so the join links (RPC-only), the
  // mentor feedback, the attendance mark and the PII pair have no home in it.
  // Hunting them here would be four more sweeps that cannot fail.
  proveCorpusClean("NFR-CONFIG-2.canary-outsider", "outsider", A_SECRETS_VIA_SURFACES,
    "with every module flag ON, an outsider still receives no offering-A sentinel that these ten surfaces could carry", mkOutsider);
  proveCorpusClean("NFR-CONFIG-2.canary-accepted", "accepted_A", A_SECRETS_VIA_SURFACES,
    "with every module flag ON, accepted_A still receives no offering-A sentinel that these ten surfaces could carry", mkAccepted);

  // Put the flags back exactly as the fixture seeded them (all-false on the
  // offering default, empty on the batch override) so a ROOM_QA_KEEP run leaves
  // an inspectable world rather than a half-mutated one.
  await sql(`
    UPDATE public.cohort_room_configs
       SET modules = ${lit(JSON.stringify(Object.fromEntries(MODULE_KEYS.map((k) => [k, false]))))}::jsonb
     WHERE offering_id = ${lit(ids.offering_a)} AND batch_id IS NULL;
    UPDATE public.cohort_room_configs
       SET modules = '{}'::jsonb
     WHERE offering_id = ${lit(ids.offering_a)} AND batch_id IS NOT NULL;
    SELECT 1;`);
}

// ── TOTAL — unfiltered enumeration ─────────────────────────────────────────
//
// EVERY PROBE ABOVE NAMES WHAT IT IS LOOKING FOR. That is what made three of
// this suite's canary sweeps structurally vacuous: a sentinel planted in
// offering B could not have surfaced in a corpus built entirely from
// `?offering_id=eq.<A>` requests, so hunting for it there proved nothing about
// the wall and everything about the WHERE clause. The fix is not a longer
// needle list — it is a request shape under which the needle COULD come back.
//
// So: no filter at all. Every actor asks every content table for everything it
// has, which is also the first thing a real attacker with an anon key and a
// login types. What comes back is whatever RLS is willing to hand them across
// the entire database, and the sweeps below finally have a corpus that could
// carry the other offering's rows if the wall were not there.
//
// These sweeps are WINDOW-scoped to the probes in this section, so they carry
// the table-borne sentinels. The link sentinels ride along in the same lists
// and are carried by the run-wide sweeps at the foot of the file, whose window
// includes the link-RPC probes — CANARY-LEDGER is what guarantees each one has
// at least one window that could actually have handed it over.
section("TOTAL — unfiltered enumeration", "no WHERE clause: every actor asks every table for everything, and the sweeps get a corpus that could actually leak");
{
  const TOTAL_TABLES = [
    ["cohort_announcements", "cohort_announcements?select=*&limit=200"],
    ["cohort_resources", "cohort_resources?select=*&limit=200"],
    ["cohort_room_posts", "cohort_room_posts?select=*&limit=200"],
    ["cohort_room_post_replies", "cohort_room_post_replies?select=*&limit=200"],
    ["cohort_demo_entries", "cohort_demo_entries?select=*&limit=200"],
    ["cohort_weeks", "cohort_weeks?select=*&limit=200"],
    ["cohort_week_submissions", "cohort_week_submissions?select=*&limit=200"],
    ["cohort_week_attendance", "cohort_week_attendance?select=*&limit=200"],
    ["cohort_recording_progress", "cohort_recording_progress?select=*&limit=200"],
    ["cohort_room_seen", "cohort_room_seen?select=*&limit=200"],
    ["cohort_room_configs", "cohort_room_configs?select=*&limit=200"],
    ["cohort_room_members", "cohort_room_members?select=*&limit=200"],
    ["users", "users?select=*&limit=200"],
    // Named columns, not `*`: zoom_link carries a column-level REVOKE, so a
    // star projection here would come back as a privilege error for EVERY
    // actor and this probe would stop being a row-isolation result (C2.3b
    // attacks the column REVOKE itself, on purpose and separately).
    ["live_sessions", "live_sessions?title=like.ROOM%20QA*&select=id,title,scheduled_at,status,recording_url,week_id,course_id"],
  ];

  const marks = {};
  for (const actor of ["member_A1", "member_A2", "member_B", "pre_member_A1", "accepted_A", "outsider", "anon"]) {
    marks[actor] = mark(actor);
    const results = [];
    for (const [name, path] of TOTAL_TABLES) {
      results.push([name, await read(actor, path, `${name} UNFILTERED as ${actor}`)]);
    }
    // For the three actors who hold no grant anywhere, the unfiltered read is
    // itself the assertion: "give me everything you have" must return nothing
    // from every room-content table. (users is excluded from the count — every
    // authenticated caller legitimately reads their OWN row, and that is what
    // makes the PII sweep below meaningful rather than a locked door.)
    if (["outsider", "accepted_A", "anon"].includes(actor)) {
      const roomOnly = results.filter(([n]) => n !== "users");
      const open = roomOnly.filter(([, r]) => !r.blocked);
      prove(`TOTAL.${actor}`,
        `${actor} asks all ${roomOnly.length} room tables for their ENTIRE contents with no filter — the first request an attacker actually writes — and every one comes back empty or denied: there is no cohort, no batch and no offering anywhere in this database whose room content they can enumerate`,
        open.length === 0,
        open.length === 0
          ? roomOnly.map(([n, r]) => `${n}:${r.ok ? "0 rows" : r.status}`).join(" · ")
          : `LEAKED ${open.map(([n, r]) => `${n} → ${r.describe}`).join("; ")}`);
    }
  }

  // Now the sweeps that were impossible before: each actor against the OTHER
  // container's sentinels, over a corpus that would have carried them.
  //
  // TABLE-BORNE LISTS ONLY. This window is fourteen table reads, and zoom_link
  // is column-REVOKEd from `authenticated` — no probe here projects it and none
  // could. The five link sentinels are therefore swept by the run-wide sweeps at
  // the foot of the file, whose windows include the link RPC; hunting them here
  // as well would print five more passes that no leak could ever fail.
  proveCorpusClean("TOTAL.canary.member_A1", "member_A1", [...B_SECRETS_TABLE_BORNE, ...CROSS_BATCH_A2_FORBIDDEN],
    "asked for the unfiltered contents of every content table, member_A1 receives nothing belonging to offering B and nothing belonging to batch A2 — not a noticeboard row, not a curriculum body, not an assignment brief, not a room skin and not a cohort-mate's phone number",
    marks.member_A1);
  proveCorpusClean("TOTAL.canary.member_A2", "member_A2", [...B_SECRETS_TABLE_BORNE, ...CROSS_BATCH_A1_FORBIDDEN],
    "the same for member_A2 against offering B and batch A1 — the sibling batch's private material is absent from an unfiltered enumeration, which is the request shape under which a missing batch predicate would show up immediately",
    marks.member_A2);
  proveCorpusClean("TOTAL.canary.member_B", "member_B", A_SECRETS_TABLE_BORNE,
    "member_B enumerating every table receives not one table-borne sentinel from offering A — the cross-offering wall holds against a request with no WHERE clause to get wrong",
    marks.member_B);
  proveCorpusClean("TOTAL.canary.pre_member", "pre_member_A1", [...PRE_MEMBER_FORBIDDEN, ...B_SECRETS_TABLE_BORNE],
    "the lobby occupant enumerating every table still receives none of the redacted bodies R0's wall governs, no resume position, no attendance mark and nothing at all from offering B",
    marks.pre_member_A1);
  for (const actor of ["accepted_A", "outsider", "anon"]) {
    proveCorpusClean(`TOTAL.canary.${actor}`, actor, [...A_SECRETS_TABLE_BORNE, ...B_SECRETS_TABLE_BORNE],
      `${actor} enumerating every content table in the database receives no table-borne sentinel from either offering — including the two that live in users.phone / users.email, which this actor's own users read could have carried`,
      marks[actor]);
  }
}

// ── L1 / L2 — revocation and re-grant ──────────────────────────────────────
section("L1 / L2 — lifecycle", "the exact regression the resolver exists to prevent: a refunded student keeps reading");
{
  await sql(
    `UPDATE public.enrolments SET status = 'revoked', revoked_at = now()
      WHERE offering_id = ${lit(ids.offering_a)}
        AND user_id = ${lit(session.member_A1.id)}`);

  // THE SAME TWO-ROW PROBLEM PRE.2 DOCUMENTS, AND THIS CASE USED TO IGNORE IT.
  // member_A1 legitimately owns TWO membership rows in offering A — the partial
  // unique indexes (:601 on user+batch, :604 on user+offering WHERE batch IS
  // NULL) exist precisely so both can coexist — and one of them, the batch-less
  // row branch (c) retracted when the roster placement landed, has read
  // 'revoked' since the fixtures applied. An unordered single-row SELECT here
  // therefore returned "revoked" out of heap order whether or not the revocation
  // trigger fired at all, which is a case that cannot fail. PRE.2 solves the
  // same problem by sorting active-first; the revocation claim needs the
  // complementary shape: name the row PRE.2 proved was ACTIVE and require IT to
  // have flipped, and require that no row of any kind is left active.
  const membershipRows = await sql(
    `SELECT batch_id, status FROM public.cohort_room_members
      WHERE user_id = ${lit(session.member_A1.id)} AND offering_id = ${lit(ids.offering_a)}
      ORDER BY (batch_id IS NULL), batch_id`);
  const scopedRow = membershipRows.find((r) => r.batch_id === ids.batch_a1);
  const stillActive = membershipRows.filter((r) => r.status === "active");
  prove("L1.1",
    "flipping the enrolment off 'active' retracts the derived membership through the AFTER-trigger path — no nightly job, no manual cleanup, no window where a refunded student is still a member. The assertion names the BATCH-SCOPED row PRE.2 proved was active and requires that specific row to have flipped, and separately requires zero active rows of any shape to remain: this member owns two rows by design, one of which was already 'revoked' before the enrolment was touched, so an unordered read of either one is a result the revocation could not have changed",
    scopedRow?.status === "revoked" && stillActive.length === 0,
    membershipRows.length
      ? `${membershipRows.length} membership row(s): ` +
        membershipRows.map((r) => `${r.batch_id === ids.batch_a1 ? "batch A1" : r.batch_id ?? "offering-wide"}=${r.status}`).join(", ") +
        `; rows still active: ${stillActive.length}` +
        (scopedRow ? "" : " — the batch-A1 row PRE.2 asserted on is GONE, which is not what revocation does (it is a status flip, not a delete)")
      : "no membership rows at all for member_A1 in offering A — PRE.2 proved one existed, so something deleted it rather than revoking it");

  const after = mark("member_A1");
  const results = [];
  for (const [name, path] of R0_OWNED_SURFACES) results.push([name, await read("member_A1", path, `${name}(A) as revoked member_A1`)]);
  const stillReadable = results.filter(([, r]) => !r.blocked);
  prove("L1.2",
    `the revoked member's still-valid session token now reads zero rows from all ${R0_OWNED_SURFACES.length} surfaces whose read path R0 owns — including live_sessions, whose own policies do carry status = 'active' — so access dies with the enrolment, not with the JWT, and a refund takes effect immediately rather than at the next login`,
    stillReadable.length === 0,
    stillReadable.length === 0 ? results.map(([n, r]) => `${n}:${r.ok ? "0 rows" : r.status}`).join(" · ")
      : `STILL READABLE ${stillReadable.map(([n, r]) => `${n} → ${r.describe}`).join("; ")}`);

  const envelope = await rpc("member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) as revoked member_A1");
  prove("L1.3", "the room RPC raises for the revoked member exactly as it does for a stranger",
    envelope.raised, envelope.describe);

  const revokedLink = await rpc("member_A1", "get_live_session_zoom_link",
    { p_session_id: ids.session_near_a1 }, "get_live_session_zoom_link(NEAR) as revoked member_A1");
  prove("L1.3b",
    "the revoked member cannot pull the imminent session's join link out of the older link RPC either — a refunded student loses the class they can no longer attend, on every path that hands out a link",
    revokedLink.returnedNull && !revokedLink.text.includes(CANARY.ZOOMNEAR_A1),
    `HTTP ${revokedLink.status}, body ${JSON.stringify(revokedLink.text.slice(0, 80))}`);

  const revokedList = await rpc("member_A1", "get_my_cohort_rooms", {}, "get_my_cohort_rooms as revoked member_A1");
  const revokedRooms = Array.isArray(revokedList.json) ? revokedList.json : [];
  prove("L1.3c",
    "the revoked member's room LIST empties too — get_my_cohort_rooms filters on status = 'active', so the room stops appearing on the shelf at the same instant it stops being readable; a refunded student is not left with a tile whose masthead and announcement count still describe a room they can no longer open",
    revokedList.ok && revokedRooms.length === 0 && !revokedList.text.includes(CANARY.CONFIG_A),
    revokedList.ok
      ? `${revokedRooms.length} room(s); offering-A masthead sentinel present=${revokedList.text.includes(CANARY.CONFIG_A)} (MYROOMS.1 returned 1 room for this same actor before revocation)`
      : revokedList.describe);

  // R0_OWNED_A_SECRETS, not ALL_A_SECRETS, and the narrowing is the honest one:
  // this window is the surfaces R0's revocation wall covers plus the envelope
  // and the link RPC. cohort_weeks, cohort_week_submissions, cohort_week_
  // attendance and users are deliberately NOT in it — they are GAP-1 and GAP-3
  // territory, measured immediately below — so their sentinels have no home in
  // this window and hunting them here would be five sweeps that cannot fail.
  proveCorpusClean("L1.4", "member_A1", R0_OWNED_A_SECRETS,
    "across every response the former member received from the surfaces R0 owns — the noticeboard, the library, the feed, the replies, the gallery, the schedule, the room skin, their own resume position and seen watermark, the envelope and the link RPC — not one sentinel those surfaces carry appears",
    after);

  // ── GAP-1. Measured, not assumed, and deliberately not swept into L1.4's
  //    window above: cohort_weeks sits OUTSIDE R0's owned set and the residue it
  //    leaves has to be reported as itself rather than blended into a green
  //    lifecycle result or hidden behind a narrower assertion.
  const [legacyName, legacyPath] = LEGACY_SURFACES[0];
  const weeks = await read("member_A1", legacyPath, `${legacyName}(A) as revoked member_A1 [legacy wall]`);
  const weeksText = weeks.text || "";
  const expectedResidue = [CANARY.A1, CANARY.CURRIC_A1, CANARY.ASSIGN_A1];
  // Widening = anything beyond week metadata reaching the ex-member here: another
  // batch's material, a join link, a recording, mentor feedback, mentor docs.
  const beyondBoundary = ALL_A_SECRETS
    .filter((n) => !expectedResidue.includes(n))
    .filter((n) => weeksText.includes(n));
  carryGap("GAP-1", {
    claim:
      "R0's revocation wall stops at cohort_weeks: a revoked member still reads their old batch's week rows, and the residue is exactly week metadata — curriculum body and assignment brief — and nothing beyond it",
    closedClaim:
      "revocation now closes cohort_weeks too — the curriculum body and assignment brief of a batch a refunded student has left are no longer readable by them, so the last surface outside R0's own wall has caught up with it",
    open: weeks.ok && weeks.rows > 0,
    widened: beyondBoundary.length > 0,
    evidence: beyondBoundary.length > 0
      ? `cohort_weeks now also carries ${beyondBoundary.join(", ")} to a revoked member`
      : weeks.ok && weeks.rows > 0
        ? `${weeks.rows} week row(s) still readable, carrying ${expectedResidue.filter((n) => weeksText.includes(n)).join(", ") || "no sentinel"}. ` +
          "cohort_weeks_student_read (20260526180000:322) tests only that a cohort_batch_members row joins to an enrolments row — it never checks e.status — and revocation flips the enrolment without touching the batch roster, so the policy still answers TRUE. R-2's header states plainly that neither R-1 nor R-2 widens cohort_weeks; the same ruling is why R0 does not narrow it either."
        : "cohort_weeks returned nothing to the revoked member",
    closing:
      "add `AND e.status = 'active'` to cohort_weeks_student_read, or have the revocation path retract the cohort_batch_members row. Both are edits to a pre-existing policy outside R0's file set, so they belong to a scoped follow-up with its own council pass, not to this phase.",
  });

  // ── GAP-2's sibling on the RPC side, and the reason this probe is placed
  //    AFTER L1.4 rather than inside it: get_cohort_progress is not one of the
  //    surfaces R0's revocation wall covers, and folding its response into
  //    L1.4's sweep would either fail a case for a hole R0 does not own or,
  //    worse, tempt someone to narrow L1.4's needle list until it passed.
  const revokedProgress = await rpc("member_A1", "get_cohort_progress",
    { p_user_id: session.member_A1.id, p_offering_id: ids.offering_a },
    "get_cohort_progress(self, A) as revoked member_A1 [GAP-3 probe]");
  const revokedRows = Array.isArray(revokedProgress.json) ? revokedProgress.json : [];
  const revokedProgressLink = revokedRows.find((r) => r.live_session_zoom_link);
  const progressText = revokedProgress.text || "";
  const progressResidue = [CANARY.CURRIC_A1, CANARY.ASSIGN_A1, CANARY.FEEDBACK_A1, CANARY.ZOOMLIVE_A1]
    .filter((n) => progressText.includes(n));
  const progressBeyond = [...ALL_B_SECRETS, ...CROSS_BATCH_A2_FORBIDDEN]
    .filter((n) => progressText.includes(n));
  carryGap("GAP-3", {
    claim:
      "get_cohort_progress does not read enrolment STATUS and applies no join-link window: a student whose enrolment has just been revoked still receives their old batch's curriculum body, assignment brief and mentor feedback from it — and the join link of the class running right now",
    closedClaim:
      "get_cohort_progress now stands down on a revoked enrolment — the last read path a refunded student held into their old batch's curriculum and join link is closed",
    open: revokedProgress.ok && revokedRows.length > 0,
    widened: progressBeyond.length > 0,
    evidence: progressBeyond.length > 0
      ? `get_cohort_progress now also carries ${progressBeyond.join(", ")} to this caller — another batch's or another offering's material, which is past this gap's boundary`
      : revokedProgress.ok && revokedRows.length > 0
        ? `${revokedRows.length} week row(s) still returned after revocation, carrying ${progressResidue.join(", ") || "no sentinel"}${revokedProgressLink ? ", including a live join link" : ""}. ` +
          "Its FROM clause is `cohort_batch_members → enrolments` with no `e.status = 'active'` anywhere (20260526180000:236-238, unchanged by R0 — amendment C1 authorised the per-week collapse and the four columns staying, nothing else), and revocation flips the enrolment without touching the batch roster. The same root cause as GAP-1: the roster row, not the enrolment, is what these older reads trust. R0 neither widens this nor narrows it, and every surface R0 DOES own closed on the same revocation two assertions above."
        : "get_cohort_progress returned nothing to the revoked member",
    closing:
      "add `AND e.status = 'active'` to get_cohort_progress's join, and gate live_session_zoom_link on the same window get_cohort_room already applies (T-60 → end + 1h). Both are edits to a function two shipped Capacitor call sites depend on, so they need the client-compat pass a room migration does not get: same follow-up as GAP-1, same council.",
  });

  await sql(
    `UPDATE public.enrolments SET status = 'active', revoked_at = NULL
      WHERE offering_id = ${lit(ids.offering_a)}
        AND user_id = ${lit(session.member_A1.id)}`);

  const regrant = await read("member_A1", SURFACES_A[0][1], "announcements(A) after re-grant");
  const regrantEnvelope = await rpc("member_A1", "get_cohort_room", { p_offering: ids.offering_a }, "get_cohort_room(A) after re-grant");
  prove("L2.1",
    "re-activating the enrolment restores the room on the very next read — the membership table self-heals from the truth tables, so a mistaken revocation is repaired by fixing the enrolment and nothing else",
    regrant.ok && regrant.rows > 0 && regrantEnvelope.ok,
    `announcements: ${regrant.describe}; envelope: HTTP ${regrantEnvelope.status}`);
}

// ── The full-corpus sweep ──────────────────────────────────────────────────
section("CANARY — the full-corpus sweep", "every byte the server handed each actor, re-read for every sentinel");
{
  for (const actor of ["member_B", "outsider", "anon", "accepted_A"]) {
    proveCorpusClean(`CANARY.${actor}`, actor, ALL_A_SECRETS,
      `across every response ${actor} received in this entire run, not one offering-A sentinel appears — the isolation claim covers surfaces this suite never explicitly asserted on`);
  }
  proveCorpusClean("CANARY.member_A2", "member_A2", [...CROSS_BATCH_A1_FORBIDDEN, ...ALL_B_SECRETS],
    "across the entire run member_A2 received nothing private to batch A1 — no noticeboard row, curriculum body, assignment brief, mentor feedback, mentor-materials file, attendance mark, resume position, seen watermark or mentor PII — and nothing at all from offering B");
  // C3.3 swept member_A1 up to the roster case; this closes the window over the
  // rest of the run — the room-list RPC, the write attacks and the lifecycle
  // reads all land after it.
  proveCorpusClean("CANARY.member_A1", "member_A1", [...CROSS_BATCH_A2_FORBIDDEN, ...ALL_B_SECRETS],
    "across the ENTIRE run — every table read, every RPC envelope, every room-list call, every progress call and every rejected write — member_A1 never received one byte of batch A2's content, curriculum, people or room skin, nor anything belonging to offering B");
  proveCorpusClean("CANARY.pre_member", "pre_member_A1", PRE_MEMBER_FORBIDDEN,
    "pre_member_A1 never received a redacted body across the whole run");

  const totals = [...corpus.entries()].map(([a, e]) => `${a}:${e.length}`).join(" · ");
  console.log(`${C.d}       corpus swept: ${totals}${C.x}`);
}

// ── CANARY-LEDGER — the sweeps are audited, not trusted ────────────────────
//
// A canary sweep is the one kind of assertion that looks identical whether it
// is working or not: "0 hits" is printed by a wall that held, by a needle
// nobody planted, and by a corpus in which the needle could never have
// appeared. Three needles in this suite's cross-batch sweep were in the third
// category, and six of the twenty strings the fixtures plant were in the second
// — planted, and named nowhere in this file. Prose cannot police that; the next
// person to add a canary will not read this comment. So it is mechanical.
//
// AND THE THIRD CASE IS HERE BECAUSE THE FIRST TWO WERE NOT ENOUGH. Until the
// 2026-07-28 review, this section's header claimed the reachability rule was
// enforced mechanically while .1 and .2 between them only checked "swept
// somewhere" and "observed by its owner". Re-adding the three unreachable
// needles that started all this to R9.1's list left both printing PASS — the
// ledger could not tell the fixed state from the broken one it was written to
// prevent. .3 audits every sweep against CANARY_HOME, which is the property
// that was being claimed all along.
section("CANARY-LEDGER — every sentinel was hunted, every hunt was armed, and every sweep could have failed",
  "the anti-vacuity check: a sweep nobody could fail is not evidence");
{
  const declared = Object.entries(CANARY);
  const unhunted = declared.filter(([, value]) => !sweptNeedles.has(value)).map(([k]) => k);
  prove("CANARY-LEDGER.1",
    `all ${declared.length} planted sentinels were actually swept for by at least one corpus grep in this run — a canary planted in the fixtures and named in no needle list is a sentinel standing guard over nothing, and it makes the fixture look more adversarial than the suite is`,
    unhunted.length === 0,
    unhunted.length === 0
      ? `${sweptNeedles.size} distinct needle(s) swept across the run; every CANARY entry is among them`
      : `NEVER HUNTED: ${unhunted.join(", ")} — either sweep for them or delete them from the fixture`);

  const unarmed = [];
  const undeclared = Object.keys(CANARY).filter((k) => !CANARY_LEDGER[k]);
  for (const [key, entry] of Object.entries(CANARY_LEDGER)) {
    const value = CANARY[key];
    if (!value) { unarmed.push(`${key}: in the ledger, missing from CANARY`); continue; }
    if (!entry.observedBy) continue;
    if (corpusHits(entry.observedBy, value).length === 0) {
      unarmed.push(`${key}: never reached ${entry.observedBy}, who is entitled to it`);
    }
  }
  prove("CANARY-LEDGER.2",
    "every sentinel was OBSERVED at least once by the actor entitled to it — the mentor's PII by an admin, the withheld T+3h link by an admin, each batch's own curriculum by its own members, each offering's own join link by its own students: so every 'zero hits' result elsewhere is a wall holding, and never a string that was never written to the database",
    unarmed.length === 0 && undeclared.length === 0,
    unarmed.length === 0 && undeclared.length === 0
      ? `${Object.keys(CANARY_LEDGER).length} ledger entries, each observed by its entitled actor`
      : `${unarmed.join("; ")}${undeclared.length ? `; not in the ledger at all: ${undeclared.join(", ")}` : ""}`);

  // .3 — THE REACHABILITY AUDIT. Every sweep, re-read against the map of where
  // each sentinel actually lives. A needle whose home surface the swept window
  // never queried is a needle that could not have been found however wide the
  // hole was, and "0 hits" from that sweep is the same sentence a wall that
  // held prints. proveCorpusClean already failed each such sweep by name; this
  // is the aggregate, so the ledger itself carries the property its header
  // claims rather than a weaker one that happens to co-occur with it.
  const homeless = Object.entries(CANARY).filter(([k]) => !(CANARY_HOME[k] ?? []).length).map(([k]) => k);
  const vacuous = sweepAudit.filter((s) => s.unreachable.length);
  prove("CANARY-LEDGER.3",
    `every one of the ${sweepAudit.length} corpus sweeps in this run could actually have failed — for each needle it hunted, at least one surface carrying that sentinel was queried inside that sweep's own window. This is the check whose absence made the other two unfalsifiable: without it, needles could be hunted over corpora that were never able to carry them and the ledger would still print two green lines`,
    vacuous.length === 0 && homeless.length === 0,
    vacuous.length === 0 && homeless.length === 0
      ? `${sweepAudit.length} sweeps audited against ${Object.keys(CANARY_HOME).length} home-surface declarations; every needle had a live home in its own window`
      : `${vacuous.map((s) => `${s.id} (${s.actor}): ${s.unreachable.join(", ")} unreachable`).join("; ")}` +
        `${homeless.length ? `; no home surface declared for: ${homeless.join(", ")}` : ""}`);
}

// ── Teardown + verdict ─────────────────────────────────────────────────────
if (process.env.ROOM_QA_KEEP === "1") {
  console.log(`\n${C.d}ROOM_QA_KEEP=1 — fixture world left in place on ${REF}.${C.x}`);
} else {
  await teardown();
}

console.log("");
if (carriedGaps.length) {
  // Printed before the verdict, every run, green or not. A carried gap is a
  // measured hole in a wall R0 does not own — it is not a pass, and the
  // design-qa-gate room-access-leak lens is instructed to raise each one as a
  // finding so it reaches the chair rather than dying in this log.
  console.log(`${C.y}${C.b}⚠ ${carriedGaps.length} KNOWN GAP(S) CARRIED — measured, outside R0's own surfaces, NOT fixed${C.x}`);
  for (const g of carriedGaps) {
    console.log(`${C.y}   ${g.id}  ${g.evidence}${C.x}`);
    console.log(`${C.y}       closing it: ${g.closing}${C.x}`);
  }
  console.log("");
}

if (failures.length === 0) {
  console.log(`${C.g}${C.b}✅ ROOM ACCESS WALL HOLDS — ${passed} security properties proven on ${REF}.${C.x}`);
  if (carriedGaps.length) {
    console.log(`${C.y}   …with ${carriedGaps.length} carried gap(s) above. The wall R0 built holds; the gaps are in walls it does not own.${C.x}`);
  }
  process.exit(0);
}
console.log(`${C.r}${C.b}❌ ${failures.length} of ${passed + failures.length} properties FAILED — this is a leak, not a flake.${C.x}`);
for (const f of failures) console.log(`${C.r}   ${f.id}  ${f.claim}\n      ↳ ${f.evidence}${C.x}`);
process.exit(1);
