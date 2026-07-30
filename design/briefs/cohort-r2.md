# PHASE R2 — The season
*Weeks, sessions, recordings, assignments · branch `design/cohort-r2` (off `design/cohort-r1`) · worktree `/Users/rahulsrinivas/Claude/LevelUp-r2`.*
*Source: `design/cohorts/ROOMS-BACKLOG.md` PHASE R2.*

## What this phase is
The four core modules brought to a standard worth shipping: the weekly rhythm, the doors-open moment, the Screening Shelf, and the feedback loop. This is where a room stops being a shell and becomes the thing a student opens every week.

## 🔴 FIVE THINGS VERIFIED IN THIS WORKTREE — build on these, do not re-derive
| # | Fact |
|---|---|
| **V1** | Everything R2 ports from EXISTS: `src/pages/CohortDashboard.tsx`, `src/components/cohort/AssignmentSubmissionForm.tsx`, `AssignmentFeedbackView.tsx`, `PeerReviewBoard.tsx`, `src/pages/MySessionsPage.tsx`. `src/lib/ics.ts` is correctly ABSENT — R2-T2 creates it. |
| **V2** | `sessionTimeState()` is already shipped and unit-tested in `src/lib/room.ts` (R0). Import it. Do NOT write a second time-state machine. |
| **V3** | `cohort_weeks.feedback_session_at` EXISTS (`20260526180000:27`). REQ says it "finally renders" — it has a real source. |
| **V4** | `TimeStateBadge` EXISTS at `src/components/live/TimeStateBadge.tsx` and `CohortDashboard` already uses it. Reuse it. |
| **V5** | **THE P5-T7 TOKEN MAP DOES NOT EXIST**, and there is no raw palette left to remove — `grep` for `statusToken`/`STATUS_TOKEN` returns nothing, and `grep` for raw `text-/bg-(green\|amber\|blue\|orange)-N` in `src/components/cohort/` returns nothing. So R2-T4's "token pass" is a genuine NO-OP, and R2-T1 cannot follow a map that was never built. Define the status→semantic-token mapping ONCE, locally, from the tokens already in `tailwind.config.ts` and `index.css`, and say what you chose. Do not invent new palette entries. Semantic tokens available: `--success`, `--destructive`, `--accent-crimson`, `--accent-indigo`, `--accent-amber`, `--accent-emerald`, `--gold`, `--room-accent` — `--accent-amber` is what covers "late renders amber, not red". |

## 🔴 SIX MORE CORRECTIONS — I got these WRONG in the first pass; the plan-check caught them
These are my errors, not the crew's. Each would have sent a task looking in the wrong place.

| # | I claimed | The truth |
|---|---|---|
| **V6** | R2-T1 must prove "the two-sessions-in-one-week fixture renders BOTH" by reading the week row | **INVERTED.** `get_cohort_progress` deliberately elects exactly ONE session per week via `LEFT JOIN LATERAL … LIMIT 1` — its own comment says "ONE session per week: the one that has not ENDED yet". Both sessions exist ONLY in the envelope's `sessions` array, which has no LIMIT. Group `envelope.sessions` by `week_id`. Reading the week row and finding one session is CORRECT behaviour, not the R0 bug. |
| **V7** | Build a new pure `src/lib/ics.ts` | **`src/lib/calendar.ts` ALREADY EXPORTS `buildICS()`** — RFC 5545, single VEVENT, proper escaping, UTC `Z` stamps — plus `downloadICS()`, `googleCalendarUrl()`, `addToCalendar()`, and `MySessionsPage` already consumes it. REUSE it. Do NOT write a second builder. Its UTC-Z stamps are the CORRECT way to get IST right; a naive local-time `DTSTART` is the actual bug to avoid. |
| **V8** | `PeerReviewBoard` needs a `batchId` prop to kill a reach-in | **It already takes a REQUIRED `cohortBatchId: string`.** The `rows[0]?.cohort_batch_id` reach-in is in the CALLER, `src/pages/CohortDashboard.tsx`, which no task owns and which must stay at zero diff. **Renaming the prop breaks two undeclared call sites** (`CommunityPage.tsx`, `CohortDashboard.tsx`) and fails the build. Do NOT rename. Report the no-op and pass `envelope.batch_id` at your own new call site. |
| **V9** | "A resume position survives an app restart" | **SUPERSEDED — see the V9 ruling below.** V9 was written when no in-app player existed, so resume looked unachievable. One now exists. |

> ### 🔴 V9 RULING (orchestrator, 2026-07-30) — the player STAYS
> **V9 and §R2-T3's "in-app-embeddable position writes" instruction contradicted each other, and that is my error.** V9 said no player exists so withdraw resume; the task body simultaneously commissioned embeddable position writes. A builder resolved the contradiction by writing `src/components/room/RecordingPlayer.tsx` (347 lines, imported at `RoomScreenings.tsx:6`) — a file no task declared.
>
> **Ruling: KEEP IT.** V9's premise was "there is no player, therefore resume would be a lie." That premise is now false. With a real embed, resume is **honest**, which is what V9 actually cared about — its objection was to a progress bar that misreports where the student was, not to playback itself. Deleting working code because my brief predated it would be perverse.
>
> **Conditions, because 347 undeclared lines on a paid-content surface is not a free win:**
> - It is now DECLARED and must be reviewed as part of R2-T3, not carried as an accident.
> - Resume writes only where the embed genuinely reports position. A plain external link still records `completed` on open and shows **no** resume bar — never a bar that guesses.
> - V10 still stands: this phase does not make the "recording within 24h" email true. The template has no link and the flag stays off.
| **V10** | This phase makes the "recording within 24h" email promise true | **It cannot.** That template contains NO link at all (its only href is `{{zoom_link}}`), `VITE_COHORT_ROOMS` stays OFF, and `/cohort` stays live — so `/room/:slug/screenings` is unreachable in production after R2. This phase makes it READY to be true. Flag the unlinked template copy for the rollout phase. |
| **V11** | (unstated) | Do NOT take total weeks from `rows.length`. The LATERAL collapse means row count is no longer week count — that is the exact bug `CohortDashboard.tsx:144/:157` has today. Use `room.total_weeks` from `get_my_cohort_rooms`, which counts DISTINCT week_number. |

**Two structural gaps the plan-check also found:** nothing mounted the new modules (`src/App.tsx` still routes R1's placeholders), and nothing owned the weeks/progress data layer — `get_cohort_progress` is called inline in `CohortDashboard` with no shared hook, and the room envelope carries no weeks at all. Both are now assigned.

## The inviolable rules
1. **`VITE_COHORT_ROOMS` stays default OFF and R2 does NOT flip it.** Flag off = zero behavioural diff.
2. **`/cohort` is NOT retired in this phase.** R2-T5 is deliberately excluded — it flips the flag default on production and is gated on Rahul's own device pass (Android + iOS) inside a real cohort fixture. That is his call, not ours.
3. **The submission → review → resubmit loop is preserved byte-for-byte.** It is the only path a student's paid work travels; wrap it, do not rewrite it.
4. **No new migration.** R2 is client-only. If you think you need schema, stop and say so.
5. **The payment pipeline and the `isIOS()` guards in `ApplicationStatus.tsx` are untouched.** Verify by grepping the guard expressions (not comments) against `origin/main`. Never trust line numbers.
6. **The T-60 zoom gate is SERVER-side.** The RPC nulls `zoom_link` before the window, so the client never receives what it must not render. Do not add a client-side clock check and call it security.

---

## Task R2-T1 — Weeks module: This Week + episode rail (`tier: 2`)
**Files:** `src/components/room/WeeksModule.tsx`, `src/components/room/ThisWeekCard.tsx`, `src/components/room/WeekRail.tsx` *(all new)*
**Spec:** Port the good bones of `CohortDashboard.tsx` — the This Week split, week list, progress strip, sticky footer ring — into the room register. Week theme as a serif episode title with an `E04 · {theme}` mono eyebrow; progress strip in `--room-accent`.
**TODAY-FIRST DISCIPLINE:** the This Week hero leads with the next TIMED thing, in this precedence: session countdown > assignment due > feedback session. `feedback_session_at` renders here for the first time (V3).
**Edge cases:** live phase with zero weeks → a serif "The schedule is being set." state (pre-start is R1's card, not yours); a week with no assignment → the existing "No assignment this week" copy; >12 weeks → the rail scrolls horizontally with snap, never squeezes.
**Acceptance:** the two-sessions-in-one-week fixture renders BOTH (this is the row-duplication bug R0 fixed at the RPC — prove the UI honours it); statuses use your single token mapping (grep raw palette → 0); footer ring and next-due reach parity with the old page; 60fps at 4× throttle.

## Task R2-T2 — Sessions module: doors-open choreography (`tier: 2`)
**Files:** `src/components/room/SessionSlot.tsx`, `src/components/room/DoorsOpenCountdown.tsx`, `src/lib/ics.ts` *(new — PURE)*, `src/lib/__tests__/ics.test.ts` *(new)*
**Spec:** `sessionTimeState()` (V2) drives six states: `scheduled` (date + "Add to calendar" → ICS download) → `tonight` (`TimeStateBadge`) → `soon` (T-60: live mm:ss countdown, Join enabled, champagne — **the screen's one champagne moment**) → `live` (crimson LIVE, ping gated on `motion-safe`, Join primary) → `ended` (a quiet "Recording lands within 24h") → `recorded` (hands to T3's shelf).
`src/lib/ics.ts` is a PURE string builder — no dependencies, one VEVENT, unit-tested. IST times must be correct.
ONE `setInterval` per room: 1s only inside T-60, 60s otherwise. Not one per slot.
**Edge cases:** `zoom_link` null at T-30 (the server gate withheld it) → "Link drops here 1 hour before", **never a broken button**; a cancelled session renders struck with no countdown; reduced motion → no ping, static states.
**Acceptance:** clock-mocked tests walk one session through all six states; the ICS opens correctly in Google and Apple Calendar with the right IST time; join fires `tapTick()` (it lives in `src/lib/haptics.ts`, NOT motion.ts); countdown drift <1s over 10 minutes.

## Task R2-T3 — The Screening Shelf (`tier: 2`)
**Files:** `src/pages/room/RoomScreenings.tsx`, `src/components/room/RecordingRow.tsx` *(new)*
**Spec:** Every session with a `recording_url` as a shelf: poster row with week eyebrow, serif session title, duration, and a watched-progress hairline in `--room-accent`. A "Continue watching" rail on top when any `cohort_recording_progress` row sits between 5% and 95%.
Playback follows the CURRENT `MySessionsPage` behaviour for external URLs. Position writes on visibility-change and unmount, throttled to 10s, and ONLY where playback is genuinely in-app-embeddable (YouTube/Vimeo embed patterns). A plain link cannot report position — record `completed` on open instead of pretending to resume.
**Edge cases:** zero recordings → serif "Recordings land here after each session."; a recording added while the page is open → 60s staleTime refetch; alumni phase → the shelf stays fully available (R-D7).
**Acceptance:** a resume position survives an app restart (fixture); progress hairlines accurate within ±5%. **The email promise becomes true** — `notify-cohort` already tells students "recording on your cohort dashboard within 24 hours", and that link must now land somewhere that actually shows it.

## Task R2-T4 — Assignments + feedback loop (`tier: 2`)
**Files:** `src/components/room/AssignmentModule.tsx` *(new — WRAPS the existing components)*, `src/components/cohort/PeerReviewBoard.tsx` *(batch-prop hardening ONLY)*
**Spec:** Submission status travels as a four-step mini-timeline (submitted → under review → reviewed/cleared, with a needs_revision branch) instead of a lone badge. Feedback renders in place with mentor attribution. **The resubmission path is preserved byte-for-byte.**
`PeerReviewBoard` gets an explicit `batchId` prop from the room envelope, killing the `rows[0]?.cohort_batch_id` reach-in.
**V5 APPLIES:** the token pass is a no-op — there is no raw palette left in `src/components/cohort/`. Verify and report rather than making cosmetic edits to prove effort.
**Edge cases:** submitting while offline → the existing error path and toast, unchanged; `late` renders amber, NOT red; file-upload limits unchanged.
**Acceptance:** the submit → review → resubmit loop reaches parity with the old page (walk it); timeline states map 1:1 to DB statuses; `grep` raw palette in `src/components/cohort/` → 0.

---
## Phase acceptance
- `npm run build` · `npx vitest run` · `npm run typecheck:functions` green; lint no NEW errors.
- Flag off = zero behavioural diff. Say how you verified it.
- `isIOS()` guard expressions and the payment pipeline diff = 0.
- Audited at 360×740 and 375×812 with real measurements, not estimates.
- Do NOT flip `VITE_COHORT_ROOMS`, do NOT retire `/cohort`, do NOT deploy or merge.
