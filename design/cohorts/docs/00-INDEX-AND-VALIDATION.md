# LevelUp Live Cohorts — Master Index & Cross-Document Validation

*Doc 00 of the cohort product docs set · authored 2026-07-18 · the **first doc to read**. It is the map (what each doc is), the referee's ledger (do the docs agree), the decision queue (what Rahul still owns), and the build gate (is each doc ready to hand to the crew).*

**Who this is for, and how to read it.** Two readers, as with every doc in this set. A founder new to PM/eng reads §1 (what each doc is), §4 (the decisions still on your desk), and §5 (what's ready vs blocked). An Opus 4.8 engineering crew reads §2 (the bijection proof — every flow screen has a state has a data row has an event has an access rule), §3 (the resolved-conflict log — where two docs disagreed and which one won), and §6 (the one Tier-1 gate list every risky change passes through).

**The precedence rule this whole set obeys** (used to resolve every conflict in §3): when two docs disagree, the one that is *wrong* yields to the source of truth, in this order —
> **`01-PRD.md` (product truth) > `02-STATE-MACHINE.md` (the lifecycle) > `03-DATA-MODEL-ERD.md` (the schema) > everything else** (`04` integration, `05` access, `06` tracking, `07` copy, `08` rollout, and the design artifacts `ROOMS-*`, `COMMONS-*`, `student-journey-flows-v2.html`).

A factual error is corrected in whichever doc holds it regardless of rank (precedence breaks *ties between defensible positions*, not *facts*). The v2 flows HTML and the `ROOMS-*` / `COMMONS-*` backlogs sit at the bottom of precedence; where they were the wrong side of a conflict, the fix landed in the higher doc and the backlog/flow correction is **flagged** here (this editor writes only the `docs/` set).

---

## 1. Master index — the nine documents

| # | Document | Purpose (one line) | Owner role | Status |
|---|---|---|---|---|
| **00** | `00-INDEX-AND-VALIDATION.md` *(this doc)* | Map + validation matrix + resolved-conflict log + decision queue + build verdict | Integration editor / PM | ✅ current — reflects the 2026-07-18 cross-doc reconciliation |
| **01** | `01-PRD.md` | The product source of truth: problem, north star, 12 stages, functional + non-functional requirements, scope, consolidated decisions | PM / founder | ✅ ready-to-build (gated on the §4 decisions it flags) |
| **02** | `02-STATE-MACHINE.md` | The lifecycle referee: every funnel/room state, its transitions + guards, the abandon branches, the access ladder, the flow↔state bijection | Systems / backend | ✅ ready (MEMBER-1 built to recommended default behind the room flag) |
| **03** | `03-DATA-MODEL-ERD.md` | The schema source of truth: every table, field dictionary, the room RPCs, the "every state is representable" proof, migration + Tier-1 summary | Backend / DBA | ✅ ready (additive-nullable columns; the `live_sessions.week_id` FK-type gate is the one hard pre-apply check) |
| **04** | `04-INTEGRATION-CONTRACTS.md` | The forward contract for Tally, Razorpay, TeleCRM, Calendly + the one identity key + the reconciler | Integrations / backend | ✅ ready (net-new Calendly receiver + reconciler are the build items) |
| **05** | `05-ACCESS-SECURITY.md` | The wall: threat model, entitlement derivation, RLS + RPC inventory, the adversarial access suite, the payments/auth sacred surfaces | Security / backend | ⚠️ ready **after** MEMBER-1 is ruled — the recommended-default access boundary is now specced (SEC-MEMBER-1) but is Tier-1 and council+Rahul-gated |
| **06** | `06-TRACKING-PLAN.md` | The analytics layer: event catalog, the A/B primitives, derived metrics, the funnel-to-PRD-§7 map | Data / growth | ✅ ready (PostHog sink + reconciler capture are the build items) |
| **07** | `07-COPY-DECK.md` | Voice guide + every user-facing string by stage + the per-SKU vocabulary + the banned-lexicon grep gate | Content / design | ✅ ready (copy is buildable; personalization tokens now have real columns) |
| **08** | `08-ROLLOUT-MIGRATION.md` | The three-slice ladder, the flag registry, the backfill plan, the rollback playbook, the staged-rollout doctrine | Release / eng lead | ✅ ready (gated on the ROOMS-BACKLOG amendments flagged in §3) |
| **09** | `09-DECISION-LOG.md` | The chronological record of every decision (DL-001…DL-049) across four rounds | PM / founder | ✅ reference — **should absorb the four new resolutions below (MEMBER-1 flip, accepted-is-written, the two new RPCs, B6)** as a Round E entry |

**Adjacent source artifacts (not in this set, cited throughout, lower precedence):** `student-journey-flows-v2.html` (the approved 12-stage / 41-screen flows), `ROOMS-ARCHITECTURE.md` + `ROOMS-BACKLOG.md` (room design + build tasks), `design/community-v2/COMMONS-*` (the *global* commons, out of this product's scope), `funnel/FUNNEL-DATA-AUDIT.md` + `TALLY-UX-ANALYSIS.md` + `APPLICATION-WALKTHROUGH.md` (the measured reality), `CRO-SUGGESTIONS.md` + `FLOW-FEEDBACK-R1.md` + `COHORT-LOGIC.md` (the briefs).

---

## 2. Validation matrix — the bijection (flows ↔ states ↔ data ↔ access ↔ tracking)

The invariant the whole set is built to satisfy: **every v2 flow screen maps to a state (`02`), every state is representable in data (`03`), every access boundary has an RLS/RPC rule (`05`), and every funnel step has an event (`06`).** If any cell is empty, a doc invented a surface or missed one. This table is the closing referee check across all nine docs.

| v2 Stage (flows) | Lifecycle state(s) — `02` | Data representation — `03` | Access rule — `05` | Tracking event(s) — `06` | PRD REQ — `01` |
|---|---|---|---|---|---|
| 01 Identity spine | `submitted`…`interview_done`, decision chips | `cohort_applications` (+ `claim_status`, `user_id`) | own-row RLS; SEC-AUTH-1 provisioning + collision defer | `application_started/completed`, OTP events | REQ-IDENT-1..4, RECON-1 |
| 02 Application | `form_started → submitted` | `cohort_applications` core + `craft`/`quiz_goal`/`experience_band` (NEW) | own-row RLS; webhook write | `application_field_reached`, `application_completed` ⏩ | REQ-APP-1..3 |
| 03 Install & ladder | `partial_form` (B1), `essay_done_no_fee` (B2), `fee_paid_no_schedule` (B3) | `recovery_marker` (NEW, 3 enum values) | own-row; reconciler read | `reminder_sent/opened`, `application_resumed` | REQ-INSTALL-1..3, LOOP |
| 04 Open loop | re-entry; `lapsed` (B5) | `carried_to_offering_id` (NEW) | own-row | `application_resumed` | REQ-LOOP-1..3 |
| 05 Interview | `app_fee_paid → interview_scheduled` (Meet/phone), `interview_no_show`, `interview_done`; reschedule budget=1 (`reschedule_count`, NEW) | `interview_modality` (`google_meet\|phone`), `interview_date`, `reschedule_count` | own-row; Calendly webhook write (net-new) | `interview_slot_shown`, `interview_scheduled` (supporting), `interview_completed` ⏩ **held-proxy**, `interview_no_show` 🛡️ | REQ-INT-0..3 |
| 06 Decision | `accepted`/`waitlisted`/`rejected` (**app-written**, admin RPC); `accepted_not_confirmed` (B4) → `confirmation_paid`; public admission page | `admission_page_slug`/`_published_at` (NEW); `status='accepted'` app-written | SEC-DECISION-1 (admin state-write RPC); SEC-PUBLIC-1 (public-page whitelist RPC, no anon table SELECT) | `decision_opened`, `decision_revealed {outcome}`, `admission_artifact_shared {artifact_type}`, `seat_claim_started`, `confirmation_paid` | REQ-DEC-1..6 |
| 07 Locked future | `accepted` (**E2 preview RPC**, no membership) → 7B veil-lifts at `confirmation_paid` (**E3 `pre_member`**) → 7C pre_start lobby; `enrolled` (E4 member) | `get_cohort_room_preview` RPC (NEW); `cohort_room_members.role='pre_member'` (resolver-written) | SEC-MEMBER-1 (preview whitelist + scoped pre_member); MEMBER-1 boundary | (room events begin at `enrolled`) | REQ-LOCK-1..3, MEMBER-1 |
| 08 Cohort room | `room_live` (E4) | room backbone; `get_cohort_progress` LEFT-JOIN fix (REQ-ROOM-6) | SEC-RLS-1 one-helper; assert-first RPCs; T-60 zoom gate | 7 R4-T4 room events | REQ-ROOM-1..6 |
| 09 Room's commons | `room_live` (E4); cross-room + cross-batch isolation | `cohort_room_posts` + `channel_key`/`cohort_week_id` (NEW), `cohort_room_post_replies` + `is_mentor_answer` (NEW) | SEC-WRITE-1 (write RPC validates `channel_key`, stamps `is_mentor_answer`; direct INSERT REVOKED); LEAK_CANARY suite | (feed rides room-engagement derivation) | REQ-COMM-1..3 |
| 10 Many tongues | any room phase (labels-only) | `cohort_room_configs.vocab` (NEW) | config member-gated; RLS never reads vocab | (state-invariant) | REQ-VOCAB-1..2 |
| 11 Mentor's desk | `room_live` (mentor/host, E4) | `feedback_visibility` (NEW) | manual-grant membership (`source=manual`) | (submission events) | REQ-MENTOR-1 |
| 12 The finish | `room_wrap → room_alumni` (E4→E5) | `certificates` + `public_verify_token`/`revoked_at`/`offering_id` (NEW); `cohort_transcripts` (computed) | verify-token public read; alumni role flip | `certificate_claimed {standing_tier}`, `certificate_verify_viewed`, `artifact_door_clicked` (loop) | REQ-FINISH-1..2 |

**Coverage verdict:** ✅ **bijection holds across all 12 stages.** The states with no screen (`anon`, `form_started` teaser, `withdrawn` silence) are intentional (`02` §10). The one place a screen's *copy* (the flows HTML) still overstates a state — flow 7A "everything is real" and 6D's "server render before you open" — is reconciled in the higher docs (`01`/`02`/`05`) and flagged for a flow-copy pass in §3 (the flows HTML is not in this editable set).

---

## 3. Resolved-conflict log — the 32 cross-document conflicts

Each row: the conflict, the resolution, **which doc yielded** (per the precedence rule), and the edit that landed. Grouped by the four council passes. 🔴 = the resolution touches a Tier-1 access/payments/auth boundary.

### 3A. Flows ↔ States (6)

| # | Conflict (short) | Resolution | Doc(s) edited / yielded |
|---|---|---|---|
| 1 🔴 | Does `confirmation_paid` open the real room (flows/PRD) or only sharpen a redacted preview (`02`)? | **MEMBER-1 resolved to the PRD/flows side (they outrank `02`):** `confirmation_paid` grants a scoped **`pre_member`** membership → the working pre_start lobby (7C); `accepted` (pre-₹8k) stays a redacted **preview RPC**, no membership; `enrolled` upgrades to full `member`. Flagged as a pending RAHUL DECISION with this as the recommended default; built behind the room flag. | `02` §3.3/§3.4/§5(T7m)/§6 yielded to PRD/flows; `03` §4.6a/§4.7a/§7 canonicalizes; `01` §4.1/§5.7 clarified; `05` SEC-MEMBER-1 added. Flow 7B/7C copy is already right. |
| 2 🔴 | E2 (accepted) preview whitelist: real community/recordings behind a scrim (flows/REQ-LOCK-1) vs skeleton only (`02`)? | **Settled to the PRD side:** the whitelist shows module *shells behind a scrim* (theme, week titles, Day-One date, faculty names, recordings-shelf skeleton, community frame) — "everything is real" = the structure is authored — but returns **no roster PII, no post bodies, no real recording/Zoom URLs.** | `02` §6 E2 yielded to `01`; `01` REQ-LOCK-1 acceptance made exact; `03` §4.7a preview RPC returns the whitelist; `05` R10. |
| 3 | Flow 6D + PRD §4.1 build the server render worker in v1; REQ-DEC-3/RENDER-1/§8.1 defer it. | **PRD requirement wins over the PRD one-liner:** v1 = PNG floor + on-device WebM (served in a 60s budget); the server MP4 worker is fast-follow (needs a net-new chromium+ffmpeg host). | `01` §4.1 Stage-06 summary corrected. Flow 6D storyboard flagged for a copy pass (annotated in `01`). |
| 4 | PRD §5 legend has `accepted→withdrawn`; `02` diagram/X1 lacked it. | **`02` yielded (real admit-then-declines case):** added `accepted→withdrawn` + `waitlisted→withdrawn` to the master diagram and the X1 guard. | `02` §2 diagram + §5 X1. |
| 5 | `02` §4 claims "exactly five" abandon branches; the flows surface a balance-due dwell the ladder text invokes. | Added **B6 balance-due dwell** (a `pre_member` with balance owed — exists under the MEMBER-1 default); "five" → "six"; ladder covers B6's automated rung + a human-call escalation (never a locked door). | `02` §4 (branch table, mermaid, guardrails); ties to REQ-INSTALL-3. |
| 6 | Flow line-1424 arrow conflates enrolment with the live-phase flip; `02` T9/T10/T11 separate them. | Docs already correct (T9 `→enrolled`/pre_start, T11 `→live` at Day One). **Flow HTML label flagged** for a copy fix; no doc edit needed. | Flagged (flows HTML, not editable here). |

### 3B. States ↔ Data ↔ Integration (10)

| # | Conflict (short) | Resolution | Doc(s) edited / yielded |
|---|---|---|---|
| 7 🔴 | `pre_member` in `03`'s role CHECK vs `02`'s enrolled-only default. | Same MEMBER-1 resolution as #1: `pre_member` **kept** and given a state mapping (`confirmation_paid`), resolver trigger named; the `accepted` tier uses the preview RPC (added to `03`). | `03` §4.6a + §4.7a; `02` §3.4 aligned. |
| 8 🔴 | Is `accepted` reconciled (`02`) or app-written (`03`/`04`)? | **`02` yielded to fact:** `accepted` is **app-written** (admin decision, Stage 06) — TeleCRM has no Accepted status, so no reconciler can produce it; removed the "inferred from Converted" path (Converted is post-confirmation). | `02` §1 SOR-1, §3.2, §5 T6a; matches `03`/`04`; `01` §8.2 Q1 carve-out. |
| 9 | `interview_modality` CHECK: `meet\|phone` (`03`) vs `google_meet\|phone` (`04`). | Standardized on **`google_meet\|phone`** (matches Calendly `location.type`). | `03` §3.1/§4.2 yielded to `04`; `06` event enum aligned. |
| 10 | Reconciler stage column: `reconciled_stage` (`03`) vs `funnel_stage_reconciled` (`04`). | Standardized on **`reconciled_stage`** (schema doc wins). | `04` §2.4 ERD yielded to `03`. |
| 11 | TeleCRM `No show` → `interview_no_show` (`02`/`03`) vs `interview_done` (`04`). | **`04` yielded:** maps to **`interview_no_show`** (a branch off `interview_scheduled`), preserving the guardrail metric. | `04` §5.2. |
| 12 | `02` T4r reschedule budget=1 has no data representation in `03`. | Added **`reschedule_count int`** to `03` §4.2 + a §7 representability row (derived source evaluated in Slice 2; column is the durable fallback). | `03` §4.2 + §7. |
| 13 🔴 | `02`'s SECURITY DEFINER preview RPC absent from `03`. | Added **`get_cohort_room_preview(p_offering)`** to `03` §4.7a (signature, gate, exact whitelist) + §7/§9 entries; cross-linked from `02` §11. | `03` §4.7a/§7/§9. |
| 14 | Recovery-marker vocab: `02` state names vs `03`/`04` enum values. | Annotated each `02` abandon branch with its `03` `recovery_marker` enum (`fee_paid_no_schedule`→`fee_paid_no_interview`, `partial_form`→`contactable_partial`, `essay_done_no_fee`→`completed_no_fee`). | `02` §4 table. |
| 15 | Primary join key: phone-primary (`04`) vs email-"join key to everything" (`03`). | Annotated `03` §4.2 that **phone is Primary** (INTEG-KEY-1), email is the app-side Tally dedup key + Secondary for reconciliation. | `03` §4.2. |
| 16 | `04`'s ERD omits `claim_status` (the pending_claim carrier). | Added `claim_status (bound\|pending_claim)` to `04` §2.4 ERD. | `04` §2.4. |

### 3C. Metrics ↔ Tracking (7)

| # | Conflict (short) | Resolution | Doc(s) edited / yielded |
|---|---|---|---|
| 17 🔴 | Second leading proxy: "interview-HELD" (PRD §2.1/NSM-1) vs `interview_scheduled` tagged in tracking. | **Honored PRD "held":** moved the ⏩ proxy tag to **`interview_completed`**; `interview_scheduled` is now a supporting metric (a no-show is a false win the guardrail catches). | `01` §7 Interview row; `06` §3.4 + §5 + §7 flowchart. |
| 18 🔴 | PRD §2.2 names a refund/dispute guardrail; tracking had **no** event for it. | Added reconciler-derived **`refund_recorded`** + **`payment_disputed`** events (Razorpay refund/dispute reads keyed on `user_id`) + a derived refund/dispute-rate note. | `06` §3.6 + §5 + §6.2/§6.3. |
| 19 | PRD §7 names `admission_video_shared`; tracking union has `admission_artifact_shared`. | Renamed PRD §7 to **`admission_artifact_shared {artifact_type}`** (matches RENDER-1's PNG/WebM/mp4 framing + the code union). | `01` §7 yielded to `06`. |
| 20 | PRD §7 Decision row omits `decision_revealed` (its own middle "accepted" step). | Added **`decision_revealed {outcome}`** to PRD §7 (also the Test C admit-mix input). | `01` §7. |
| 21 | Stage-12 `certificate_claimed`/`certificate_verify_viewed` (tracking) absent from PRD §7. | Added both to PRD §7 Completion/Loop rows with a CERT-1 pointer; kept eligibility % as the derived metric. | `01` §7. |
| 22 | PRD §7 Loop lists "share→application" as if an event. | Replaced with **`artifact_door_clicked`** + a note that "share→application" is the computed `admission_artifact_shared → artifact_door_clicked` rate. | `01` §7. |
| 23 | `offering_viewed`/`pay_cta_tapped`/`checkout_loaded`/`payment_initiated` tracked but no PRD §7 metric. | Added a note labeling them **diagnostic/context events** (intentional, not an omission). | `01` §7. |

### 3D. Copy ↔ Security ↔ Rollout (9)

| # | Conflict (short) | Resolution | Doc(s) edited / yielded |
|---|---|---|---|
| 24 🔴 | Public admission page needs anon whitelist reads (`03`/`07`/`08`); `05` forbids any anon `cohort_applications` read and never designs the path. | Added **SEC-PUBLIC-1** to `05`: a SECURITY DEFINER `get_admission_page(slug)` RPC returning only the whitelist (name/program/cohort/admit-date/city/faculty/ratio), **never** contact/fees/interview/funnel state; **no anon table SELECT**; added to threat model §2, the §4 matrix, and the suite (R12/R13). Not satisfied by a broad anon policy. | `05` §2/§4/§5.4/§7. |
| 25 🔴 | Who writes `accepted` — `03` §2 reconciler-only default vs §4.2/§7 "app must write"; the ceremony needs a verdict. | Reconciled `03` §2 to state `accepted` is the **one app-written** funnel status even under the reconciler default (app status write only, TeleCRM stays read-only); threaded the `is_admin()` state-transition RPC into `05` (**SEC-DECISION-1**). | `03` §2; `05` §5.4 SEC-DECISION-1; `02` T6a. |
| 26 🔴 | In-room community is multi-channel (`07`/`03`) but ROOMS-BACKLOG R3-T3 builds a flat feed and the channel schema is never staged in R0. | Added the `channel_key`/`cohort_week_id` columns to the **R0-dark** backbone in `08`, carried the channel write-path validation as a **Tier-1 gate inside Slice 3 (R3-3.3)**; **flagged ROOMS-BACKLOG R3-T3 + R0-T2 for correction** (build the taxonomy, land columns dark). | `08` §4 (3.0 + 3.3 rungs); ROOMS-BACKLOG flagged. |
| 27 🔴 | Post/reply writes: `03` mandates a server write RPC (validates `channel_key`, stamps `is_mentor_answer`); `05` models direct RLS INSERTs. | **`05` yielded to `03`:** routed feed/reply writes through **`cohort_room_post_write`/`cohort_room_reply_write`** RPCs, REVOKED direct client INSERT, added SEC-WRITE-1 + suite cases W8/W9. | `05` §5.3/§5.4/§7. |
| 28 | `04` §2.4 ERD field name `funnel_stage_reconciled` vs `03` `reconciled_stage` (dup of #10, copy-sec pass). | Same fix as #10 — `04` renamed to `reconciled_stage`. | `04` §2.4. |
| 29 🔴 | Native rooms kill-switch: ROOMS-BACKLOG R1-T1 compiles `VITE_COHORT_ROOMS` (can't hot-fix a native binary); ROLLOUT requires a server toggle. | Resolved ROLLOUT Open Q1: the native default carries a **server-readable flag mirror**; updated the 3.1 rung + flag table; **flagged ROOMS-BACKLOG R1-T1** to add the mirror. | `08` §4/§5/§12; ROOMS-BACKLOG flagged. |
| 30 | ROLLOUT §5 "exactly one flag per Tier-1 surface" violated by the identity-spine webhook (no registry flag). | Carved out the webhook explicitly + added a **server-config `identity_spine_enabled` gate** to the flag table (today-identical off-state). | `08` §5. |
| 31 🔴 | COPY personalization tokens `{craft}/{quiz_goal}/{experience_band}` have no structured columns (only free-text jsonb). | Added extracted typed columns to `03` §4.2 + the `04` §3.2 `extractField` map, so tokens resolve from real fields, never the essay. | `03` §4.2/§3.1; `04` §3.2. |
| 32 | COPY §2.4 bans "free" as a grep gate, but ships "browse freely" (substring hit); and `04` §6.3 "Zoom is never assumed anywhere" contradicts the allowed room-session "live on Zoom". | Reworded CD-01-HOME-04 to "browse the catalogue"; scoped the grep gate to the **whole word** `\bfree\b`; narrowed `04` §6.3 to "never assumed **for the interview modality**". | `07` CD-01-HOME-04 + §2.4; `04` §6.3. |

**Net:** 32/32 resolved in the `docs/` set. **3 items additionally require edits outside this set** (flagged, not silently dropped): the flow HTML copy for 7A/6D/line-1424 (conflicts 1/2/3/6), ROOMS-BACKLOG R3-T3+R0-T2 (channel taxonomy, conflict 26), and ROOMS-BACKLOG R1-T1 (server flag mirror, conflict 29). `09-DECISION-LOG.md` should record the four substantive resolutions as a Round E entry (MEMBER-1 flip to pre_member; `accepted` is app-written; the preview + write + decision + public RPCs; the B6 branch).

---

## 4. Consolidated RAHUL DECISION queue (pulled from every doc)

Every open scope choice, with the doc that owns the authoritative statement, its recommended default, and whether the crew is blocked. **The crew is never blocked** — everything has a recommended default it builds to (behind a flag where Tier-1). Rahul's ruling confirms or flips; it does not unblock.

### 4A. 🔴 Tier-1 access / payments / auth — the ones that gate a wall or the money

| ID | Owner doc | Decision | Recommended default | Build posture |
|---|---|---|---|---|
| **MEMBER-1** ⭐ | `02` §3.4 / `03` §4.6a | The room-access boundary at `accepted` vs `confirmation_paid` vs `enrolled` | **Scoped `pre_member` lobby at `confirmation_paid`** + preview RPC for `accepted`; full `member` at `enrolled` (alternative: enrolled-only + preview for both) | Build to default **behind the room flag**; must be ruled before the membership resolver or preview RPC ships |
| **SOR-1** | `02` §1 (= PRD Open Q1) | App as funnel *writer* vs *reconciler* | Reconciler-plus-owns-what-it-controls; **`accepted` is the one carve-out the app writes** | Reconciler default is built; the accepted-write is settled |
| **INTEG-KEY-1** | `04` §2.2 | Phone vs email as the primary external join key | Phone-primary, email-secondary | Reconciler tries both, records which resolved |
| **INTEG-PAY-1** | `04` §4.1 | Route the live ₹400 through the app order path (so it carries the hard key)? | (a) app-path for new cohorts + (b) reconciler net for legacy links | Reused staged functions; council + staged rollout |
| **INTEG-CRM-1** | `04` §5.4 | Write back to TeleCRM or stay read-only? | Read-only in v1 | Built read-only |
| **INTEG-CAL-1** | `04` §6.4 | Calendly subscription scope + slot mechanism | Org-level subscription + inline embed | Signature verify mandatory either way |
| **VEIL-SOURCE-1 / LOBBY-1** | `05` §4 | (subsumed by MEMBER-1) how much the veil shows / the pre_start lobby | Now = MEMBER-1 default (preview RPC + `pre_member` at confirmation_paid); the enrolled-only stance is the documented alternative | Superseded by SEC-MEMBER-1 |
| **ROSTER-SCOPE-1** | `05` §5.4 | Roster offering-wide vs batch-scoped | Batch-scoped (one-predicate fix on both roster RPCs) | Suite pins whichever scope Rahul picks (C3) |
| **CERT-OFFER-1** | `03` §4.9 | How a cohort cert keys given `certificates.UNIQUE(user_id, course_id)` | Add nullable `offering_id` + two partial unique indexes | Confirm the `offering_courses` wiring first |
| **CHANNEL-KEY-1** | `03` §4.7 | Channel columns on posts vs a first-class channels table | Columns on `cohort_room_posts` (additive) | Ship column form unless a channel-level feature forces the table |

### 4B. Product scope + build order (from `01` §8.1 — recommended defaults confirmed as v1 scope)

`BUILD-1` (three-slice order) · `NSM-1` (blended app→enrolled + two ⏩ proxies — the second is now **interview-HELD**) · `TARGET-1` (provisional targets, set after batch 1) · `CRO-1` (inversion = A/B, v1-prepared) · `CRO-2` (slots on success = absorbed into v2 Stage 05) · `CRO-3` (honors tiers, gated on STANDING-1) · `STANDING-1` (provisional cutoffs) · `FEE-1` (credit ₹400, fast-follow) · `OTP-1` (email OTP in v1) · `TITLE-1` ("Admissions Interviewer") · `RENDER-1` (server worker = fast-follow) · `SEAT-1` (manual release v1, automation fast-follow) · `COMM-1` (async threads only) · **`R-D2` (superseded by MEMBER-1 on the confirmation_paid point)** · `R-D3..R-D9` (rooms-architecture defaults).

### 4C. Data / tracking / rollout / copy defaults

`DATA-SoT-1` (`03` — reconciler default) · `CLOSE-1` (`03` — keep the date column) · `STANDING-STORE-1` (`03` — compute live) · `REVBATCH-1` (`03` — derive the ledger) · `PRODLINE-1` (`03` — no first-class product-line entity) · `SINK-1` (`06` — PostHog single warehouse) · `CERT-1` (`06` — Stage-12 events extend the seven) · `ABTEST-1` (`06` — PostHog flags + Tally form-split) · `PILOT-1` (`08` — Live Filmmaking `VE` window) · `RUNNING-BATCH-1` (`08` — no mid-flight migration) · `BACKFILL-1` (`08` — no bulk blast) · `WORD-1..N` (`07` — the per-SKU vocabulary + interviewer title).

**The one decision to make first:** ⭐ **MEMBER-1** — it is the single most security-load-bearing line, it is now built to a recommended default that *flips* the prior R-D2/`02` conservative stance, and every access-doc surface (SEC-MEMBER-1, the preview RPC, the `pre_member` resolver trigger, the B6 branch) hangs on it. Rule it before R0 ships.

---

## 5. Ready-to-build verdict — per document

| Doc | Verdict | What still gates it |
|---|---|---|
| **01 PRD** | ✅ **Ready** | Nothing internal; it flags its own §8.1 decisions. Downstream everything depends on it. |
| **02 State machine** | ✅ **Ready** | MEMBER-1 built to the recommended default behind the room flag; SOR-1's accepted-write settled. No blocker. |
| **03 Data model** | ✅ **Ready** with one **hard pre-apply check**: the `live_sessions.week_id` FK is declared `text` but FK'd to a `uuid` — introspect prod (`\d+ live_sessions`) and add the `ALTER COLUMN … TYPE uuid` migration if still `text`, **before** any room join is relied on (`03` §4.4/§10). Additive-nullable columns otherwise carry near-zero blast radius. |
| **04 Integration** | ✅ **Ready** | The Calendly receiver (signature + subscription + column) and the reconciler are net-new builds, each Tier-1-gated. Secrets by name. |
| **05 Access & security** | ⚠️ **Ready pending MEMBER-1 ruling.** | The recommended-default boundary is fully specced (SEC-MEMBER-1, SEC-WRITE-1, SEC-DECISION-1, SEC-PUBLIC-1) and the adversarial suite has the cases (R10–R13, W8–W10), but it is Tier-1: council + adversarial-suite-green-on-shadow + Rahul sign-off before apply, and the `pre_member` resolver trigger is built behind the room flag until MEMBER-1 is ruled. |
| **06 Tracking** | ✅ **Ready** | PostHog sink (`_shared/posthog-capture.ts`) + reconciler capture are the builds; the ⏩ proxy now keys on interview-HELD; refund/dispute guardrail instrumented. |
| **07 Copy** | ✅ **Ready** | Personalization tokens now resolve from real columns (`craft`/`quiz_goal`/`experience_band`); the "free" grep gate is internally satisfiable (whole-word). Confirm the Tally quiz-field labels during REQ-APP-3. |
| **08 Rollout** | ✅ **Ready** with two **backlog amendments** (outside this set): ROOMS-BACKLOG **R3-T3/R0-T2** (build the channel taxonomy + land the channel columns in R0-dark) and **R1-T1** (add the server-readable native flag mirror). Both are named in `08` §4/§12; the ladder itself is complete. |
| **09 Decision log** | ✅ **Reference** — add a **Round E** entry capturing the four 2026-07-18 resolutions (MEMBER-1 flip; accepted-is-app-written; the preview/write/decision/public RPCs; the B6 branch) so the chronology stays whole. |

**Program-level verdict:** the set is **internally consistent and build-ready**, with the build ordered by `08`'s three slices (funnel-first, rooms-last). The two true gates before the room train (Slice 3 / R0) are **(1) rule MEMBER-1** and **(2) run the `live_sessions.week_id` FK-type introspection**. Everything upstream (Slices 1–2: reconciler, spine, ladder, interview, decision) has no cross-doc blocker remaining.

---

## 6. The one Tier-1 gate every risky change passes (the shared checklist)

Per `CLAUDE.md` (blast-radius tiers) and echoed in every doc: a 🔴 Tier-1 surface — auth/provisioning, payments/Razorpay, Supabase migrations & RLS, any edge fn on the login/money path, the native shell, the room access boundary — ships only through **council + cross-platform verify + staged rollout + Rahul's written sign-off**, with the adversarial access suite green on a shadow project before apply. The sacred do-not-touch surfaces (the staged-payment pipeline, `verify-*`, `razorpay-webhook` core, the `ApplicationStatus.tsx:319,337` `isIOS()` guard) stay byte-for-byte across the whole program. Every additive change in this set is written *around* them, never through them.

**The Tier-1 surfaces this program introduces** (each with its owning doc): the identity-spine webhook + collision defer (`04`/`05`), the reconciler read path (`04`), email OTP (`05`), the Calendly receiver (`04`), the room R0 backbone + RLS + RPCs (`03`/`05`), the MEMBER-1 access boundary — preview RPC + `pre_member` resolver (`03`/`05`), the feed write RPCs (`03`/`05`), the admin decision RPC (`05`), the public-admission-page RPC (`05`), and the channel write-path gate (`03`/`08`). Each is council-gated and named in `02` §11, `05` §7, and `08` §4.

---

*End of Master Index & Validation. This is the entry point to the cohort docs set; if it and any other doc disagree, the precedence rule in the header governs, and the disagreement is a bug in this index to fix. Nothing in this program ships without Rahul's written sign-off; the staged-payment pipeline and its `isIOS()` guard stay untouched.*
