# LevelUp Live Cohorts — The As-Is Logic
### Everything the app knows about a live cohort today: pipeline, entities, RPCs, and where it's thin
*Authored 2026-07-08 on branch `design/phase-6`, from a full read of `supabase/migrations/`, `src/integrations/supabase/types.ts` surfaces, `src/pages/CohortDashboard.tsx`, `src/pages/ApplicationStatus.tsx`, `src/pages/CheckoutPage.tsx`, `src/pages/PublicOffering.tsx`, `src/pages/admin/AdminCohort*.tsx`, `src/components/cohort/*`, `supabase/functions/tally-application-webhook/` and `notify-cohort/`. Companions: `ROOMS-ARCHITECTURE.md` (what we build on this), `ROOMS-BACKLOG.md` (how), `migrations-draft/` (DRAFT SQL — nothing applied).*

**Standing guard:** `ApplicationStatus.tsx:319,337` — the `isIOS()` gate on staged-payment buttons is a REVENUE GUARD (Apple anti-steering; Android staged payments depend on the gate being `isIOS()`, not `isNative()`). Nothing in this program touches it. Ever.

---

## 1. The pipeline as it runs today (application → alumni-nothing)

```
 MARKETING                    APPLICATION                     MONEY                         DELIVERY
┌───────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────────┐
│ /p/:slug      │   │ Tally form (external)    │   │ /checkout?type=app_fee   │   │ /cohort/:offeringId          │
│ live_cohort   │──▶│  └▶ tally-application-   │──▶│  /checkout?type=         │──▶│  get_cohort_progress RPC     │
│ offering with │   │     webhook (HMAC-       │   │     confirmation         │   │  get_attendance_pct RPC      │
│ tally_form_url│   │     verified, matches    │   │  /checkout?type=balance  │   │  weeks → sessions →          │
│ = "Apply" CTA │   │     offering by formId,  │   │  (payment_orders.        │   │  assignments → feedback →    │
│ + application_│   │     upserts application  │   │   payment_type +         │   │  peer review → attendance →  │
│ deadline      │   │     by offering+email,   │   │   application_id)        │   │  certificate eligibility     │
│ countdown     │   │     idempotent on        │   │                          │   │                              │
└───────────────┘   │     tally_response_id)   │   │ verify-razorpay-payment  │   │ …then the weeks archive and  │
                    └──────────────────────────┘   │ advances application     │   │ NOTHING happens. No demo     │
                                                   │ status; admin enrols +   │   │ day, no alumni state, no     │
                                                   │ assigns batch            │   │ room to keep.                │
                                                   └──────────────────────────┘   └──────────────────────────────┘
```

### The status machine (`cohort_applications.status`)
`submitted → app_fee_paid → interview_scheduled → interview_done → accepted → confirmation_paid → balance_paid → enrolled`, with exits `rejected | withdrawn | waitlisted`. `ApplicationStatus.tsx` renders this as the 7-step cream timeline (interview_scheduled and interview_done collapse to one step). Deadlines exist as offering-level config (`confirmation_deadline_days` default 2, `balance_deadline_days` default 15, `confirmation_grace_hours`) — enforcement is manual/admin, not automated.

### Step by step, with the exact mechanism
1. **Discover** — `PublicOffering.tsx`: an offering with `tally_form_url` set is an "apply" offering (`isApply`, `:319`). CTA renders an external link to the Tally form (gated to informational text on native per Reader Rule); `application_deadline` drives a countdown. Live-cohort offerings get the landscape-poster hero treatment (`:212-230`).
2. **Apply** — Tally form submission → `tally-application-webhook`: HMAC-SHA256 signature verified (rejects if `TALLY_SIGNING_SECRET` unset), matches the offering by `payment_mode='staged'` + `tally_form_url` containing the formId, extracts name/email/phone/city/occupation/bio by label-fuzzy-match, links `user_id` if an account with that email exists, upserts by (offering, email), absorbs Tally retries via the `tally_response_id` unique index (migration `20260606120100`).
3. **Application fee** — `/checkout/:offeringId?type=app_fee&app=:applicationId` (`CheckoutPage.tsx:241` — `paymentType` is `full | app_fee | confirmation | balance`). `payment_orders` rows carry `payment_type` + `application_id`. Successful verify advances the application, stamps `app_fee_payment_id`/`app_fee_paid_at`.
4. **Interview** — `offerings.calendly_url` + `thankyou_show_calendly` surface Calendly on the thank-you page; admin records `interview_date`/`interview_notes` in `AdminApplications.tsx`; status moves by hand.
5. **Accept / reject / waitlist** — admin action; `rejection_reason` surfaces on ApplicationStatus as a neutral "Decision note".
6. **Confirmation → balance** — two more staged checkouts from the ApplicationStatus timeline (the `isIOS()`-gated buttons). Each stamps its `*_payment_id`. `enrolments` gains `application_id`, `total_paid_inr`, `balance_due_inr`.
7. **Enrol + batch** — admin creates the enrolment and adds it to a `cohort_batches` row via `cohort_batch_members` (`AdminCohorts.tsx`). `offerings.whatsapp_group_link` is the de-facto onboarding: the community lives on WhatsApp.
8. **Weeks** — admin authors `cohort_weeks` per batch (`AdminCohortWeeks.tsx`): week_number, theme, description, date range, assignment_prompt, assignment_due_at, feedback_session_at, status (`upcoming|active|completed|archived` — **advanced by hand**), sort_order.
9. **Sessions** — `live_sessions` rows (via `AdminSchedule.tsx`) with `week_id` + `session_type` + `zoom_link` + `recording_url`. NOTE: sessions are keyed by `course_id`, not offering — student read access flows through `offering_courses`, a legacy join from the masterclass world.
10. **Attend** — `cohort_week_attendance`: admin-marked per user per week (`AdminCohortAttendance.tsx`); students read their own. There is no automated capture from Zoom.
11. **Submit** — `cohort_week_submissions` (one per user per week; text/files/link; 2GB `cohort-submissions` private bucket with per-user folder RLS). Status `draft → submitted → under_review → reviewed|cleared|needs_revision|late`. Mentor review = admin UPDATE with `feedback_text` + `rating` (`AdminCohortSubmissions.tsx`) → trigger fires an in-app notification + `cohort_submission_reviewed` email.
12. **Peer review** — `open_to_peer_review` opt-in + `peer_review_assignments` (no-self trigger) + a same-batch RLS read policy; `PeerReviewBoard.tsx` renders to-review/given lanes inside the dashboard.
13. **Nudges** — `notify-cohort` edge fn every 15 min (pg_cron): assignment-due-24h email, session-reminder-1h email + Interakt WhatsApp, assignment-missed one-time nudge. Idempotent via `cohort_notifications_log` unique constraint. Templates in `email_templates` (4 `cohort_*` keys).
14. **Certificate** — `user_is_certificate_eligible()`: staged offerings require `get_attendance_pct >= offerings.attendance_threshold_pct` (default 85). Dashboard shows the eligibility chip.
15. **End** — weeks flip to `archived`. That is the entire ending. No demo day, no alumni state, no exit ritual, no post-cohort access story.

### The student surface today
- Entry: the sidebar/tab "My Cohort" link via `useActiveCohort()` — which **`.find()`s the first active staged enrolment** and requires ≥1 cohort_week to exist. One slot. A member of two cohorts sees one; a just-enrolled member whose weeks aren't authored yet sees nothing.
- `/cohort/:offeringId` (`CohortDashboard.tsx`): sticky header (batch label, title, week X of N, attendance bar + cert chip, progress strip), a This Week card (live session + assignment split, feedback panel, resubmission), All-weeks list, Peer-reviews tab, sticky footer ring with next-due. Data: one offering fetch + `get_cohort_progress` ∥ `get_attendance_pct` (react-query, P6-T2 shape).

---

## 2. Entity & RPC inventory (complete)

| Entity / fn | Kind | What it holds / does | RLS posture |
|---|---|---|---|
| `offerings` (+staged cols) | table | `payment_mode single\|staged`, `app_fee_inr`, `confirmation_amount_inr`, `confirmation_deadline_days`, `balance_deadline_days`, `confirmation_grace_hours`, `tally_form_url`, `calendly_url`, `whatsapp_group_link`, `thankyou_show_calendly`, `attendance_threshold_pct`, `application_deadline`; `product_tier='live_cohort'` for catalog grouping | public read (active), admin write |
| `cohort_applications` | table | the pipeline row: statuses, tally payload, interview fields, the 3 payment-id stamps | admin ALL; student SELECT own (`user_id = auth.uid()`) — **email-only applicants with no account see nothing until linked** |
| `payment_orders` (+cols) | table | `payment_type`, `application_id` | existing payments RLS |
| `enrolments` (+cols) | table | `application_id`, `total_paid_inr`, `balance_due_inr` | existing |
| `cohort_batches` | table | offering_id, name, max_students | admin ALL; member SELECT own batch |
| `cohort_batch_members` | table | batch ↔ enrolment | admin ALL; student SELECT own |
| `cohort_weeks` | table | the weekly spine: theme/dates/assignment/feedback-session/status/sort | admin ALL; batch-member SELECT |
| `live_sessions` (+cols) | table | `course_id` (legacy key!), `week_id → cohort_weeks`, `session_type`, `zoom_link`, `recording_url`, status | admin ALL; enrolled-via-`offering_courses` SELECT; zoom-link gating migration `20260408151600` |
| `cohort_week_submissions` | table | one/user/week; text+files+link; review status/rating/feedback; `open_to_peer_review` | admin ALL; own CRUD (update only in `draft/submitted/needs_revision`); peer read via same-batch + opt-in policy |
| `cohort_week_attendance` | table | attended bool, marked_by, notes | admin ALL/write; own SELECT |
| `peer_review_assignments` | table | submission × reviewer, status, feedback, rating; no-self trigger | reviewer read/update own; submitter read; admin ALL |
| `community_posts` (+cols) | table | `cohort_batch_id`, `post_type` (discussion/peer_review_request/…/announcement/wins), `linked_submission_id` — the cohort-scoped feed toggle on the old CommunityPage | existing community RLS |
| storage `cohort-submissions` | bucket | private, 2GB/file, video/image/pdf/audio/zip; `{uid}/` folder paths | own folder CRUD + admin |
| `cohort_notifications_log` | table | idempotency ledger for notify-cohort | admin read |
| `email_templates` (`cohort_*` ×4) | rows | due-24h, session-1h, reviewed, missed | admin |
| `get_cohort_progress(user, offering)` | RPC (SECURITY DEFINER) | the whole dashboard in one round-trip: weeks × (session, submission, attendance) | joins through `cohort_batch_members`→`enrolments` so it self-scopes; **LEFT JOIN live_sessions duplicates week rows when a week has >1 session** |
| `get_attendance_pct(user, offering)` | RPC | attended/total over non-upcoming weeks | self-scoping |
| `user_is_certificate_eligible(user, offering)` | RPC | attendance-threshold gate for staged offerings | STABLE, definer |
| `tally-application-webhook` | edge fn | signed intake → application upsert | service-role |
| `notify-cohort` | edge fn + cron 15min | the 3 nudge classes, email + WhatsApp | service-role JWT check |
| Admin pages | UI | `AdminApplications`, `AdminCohorts` (batches/members), `AdminCohortWeeks`, `AdminCohortAttendance`, `AdminCohortSubmissions`, `AdminSchedule` (sessions + recordings) | `is_admin()` |
| `useActiveCohort()` | hook | sidebar "My Cohort" — first staged enrolment with weeks | n/a |

**What is genuinely good here (keep, build on):** the staged-payment pipeline is real and battle-tested; the application timeline UI is honest; RLS is consistently entitlement-derived (batch membership via enrolments — never client-claimed); `get_cohort_progress` is the right one-round-trip shape; the notify loop is idempotent and already multi-channel; the submission bucket's per-user folder policy is correct. **The backbone is sound. The product on top of it is a utility page, not a room.**

---

## 3. The gaps — what a serious cohort program has that this app lacks

Ranked by member-felt impact, grounded in what On Deck / Reforge / Buildspace / Maven ship as table stakes.

### G1 — There is no *place*. (The flagship product has no room.)
A Maven cohort or Buildspace season is a world: its own name, art, tone, navigation, people. Here the flagship is one route named "My Cohort" with the app's default chrome. No cohort identity, no roster, no sense of *who else is in the room with you*. Members can't see their batch-mates at all (RLS has no roster read — only peer-review submissions leak names). WhatsApp is the actual room; the app is the homework portal. **This is the inversion Rahul is asking to fix, and everything in ROOMS-ARCHITECTURE.md answers it.**

### G2 — Live sessions are a link, not a moment.
World-class cohort UX treats the live session as the heartbeat: doors-open countdown, "starting in 12 min" states, one-tap join that works from a notification, calendar (ICS/Google) capture, and a recording that lands *in the same slot* within 24h with resume position. Today: the Zoom link renders only inside the final 60 minutes (`CohortDashboard.tsx:510`), there's no countdown state, no calendar export, no in-room "happening now", attendance is admin-marked days later, and `recording_url` — though it exists on the table and the reminder email *promises* "the recording will be on your cohort dashboard within 24 hours" — **is never selected by `get_cohort_progress` and never rendered on the cohort dashboard**. The email makes a promise the product breaks.

### G3 — Multi-cohort membership structurally unsupported.
`useActiveCohort` returns one offering; the nav slot is singular; there's no "My Cohorts" surface; nothing prevents a member of the Filmmaking cohort + AI cohort from *paying twice and seeing one*. Rahul's brief says "they could be part of multiple cohorts" — today that's a coin-flip on which one the sidebar shows.

### G4 — No communication layer inside the cohort.
No announcements stream (the old community's `post_type='announcement'` + batch scope exists in schema but has no dedicated surface and no notification fan-out), no cohort feed with presence, no mentor office-hours mechanism, no Q&A per week. Everything mid-week happens on WhatsApp, where LevelUp owns nothing: no history, no search, no status, no funnel.

### G5 — The arc has no third act.
Weeks archive and the story just stops. No demo day / final showcase (the single highest-retention ritual in Buildspace/On Deck), no peer gallery of finished work, no alumni transition (STRATEGY.md's "alumni keep their rooms forever" insight — the rejected community design's best idea — has no cohort-side counterpart), no structured "what's next" upsell into Forge/next cohort. Certificates exist but arrive as a table-stakes artifact, not a finale.

### Second-order gaps (real, cheaper)
- **G6 — One-session-per-week assumption:** the RPC's LEFT JOIN both duplicates rows on 2+ sessions and gives the UI only one session slot; `feedback_session_at` exists on weeks but never renders.
- **G7 — Deadline enforcement is human:** confirmation/balance deadline days are config with no cron; seats aren't auto-released; `max_students` on batches is advisory (no seat-count guard like `claim_event_seat`).
- **G8 — No in-app schedule view for a cohort:** MySessionsPage is a flat all-courses list; no per-cohort calendar, no timezone handling beyond `en-IN` locale strings.
- **G9 — Applicants without accounts are blind:** applications key on email; until a user signs up with the *same* email and someone links `user_id`, ApplicationStatus is unreachable (and the webhook only links if the user pre-existed).
- **G10 — No instrumentation:** zero events on the application funnel or weekly engagement; Rahul cannot see week-over-week submission/attendance decay without SQL.

## 4. What's broken/thin in the current CohortDashboard experience specifically

1. **The recording hole (G2)** — promised in email, absent in product. One RPC column + one card slot fixes the trust break; the full library is the room's job.
2. **Row-duplication bug-in-waiting** — `get_cohort_progress`'s `LEFT JOIN live_sessions` on `week_id`: two sessions in one week ⇒ duplicate week rows ⇒ the progress strip, counts, and week list all double. Works today only because admin discipline keeps it 1:1.
3. **Join-link window too clever** — link at T-60min only; a student opening at T-65 sees "Not scheduled yet"-adjacent dead space with no countdown, no add-to-calendar, no expectation set.
4. **No roster, no people** — the dashboard is single-player. Peer review is the only place batch-mates exist, and only as submission cards.
5. **Attendance is opaque** — a bare percentage + threshold chip; no per-week self-view of what was missed or how to make it up (recordings would be the answer — see the hole).
6. **`feedback_session_at` dead data** — authored by admins, never rendered.
7. **Entry fragility** — `useActiveCohort` hides the nav item until weeks exist, so the *enrolled-but-pre-start* window (exactly when excitement peaks and WhatsApp onboarding happens) shows nothing in-app. Also 3 sequential queries where one RPC would do.
8. **Register drift** — the page still runs raw green/amber/blue/orange status classes (design/vision P5-T7 maps them but hasn't shipped here); the room program should land on tokens from day one.
9. **Peer-review board keys off `rows[0]?.cohort_batch_id`** — fine while one batch per user per offering holds; another silent single-ness assumption to kill in the rooms work.
10. **No error/empty distinction** — RPC failure and zero-weeks render similar dead-ends; progError → toast + empty state rather than a retryable ErrorState.

**Verdict in one line:** the *pipeline* (apply→pay→enrol) is genuinely production-grade; the *delivery* experience is a competent homework tracker wearing the app's default clothes, with no place, no people, no live-ness, and no ending — exactly the gap between "an LMS with a cohort feature" and "a cohort product."
