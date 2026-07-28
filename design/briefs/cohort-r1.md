# PHASE R1 — Crossing the threshold
*Shell, theming, My Cohorts · branch `design/cohort-r1` (off `design/cohort-r0`) · worktree `/Users/rahulsrinivas/Claude/LevelUp-r1`.*
*Source: `design/cohorts/ROOMS-BACKLOG.md` PHASE R1.*

## What this phase is
Rooms stop being data and become **places**: a themed shell, a room switcher, a My Cohorts surface, working deep links. Modules render as ordered placeholders that R2 fills. No new tables — R0 already shipped the schema, the RLS and the RPCs.

## 🔴 FOUR CORRECTIONS TO THE BACKLOG — verified in this worktree on 2026-07-28
The backlog was written before the code it describes. Each of these would have cost a build round.

| # | Backlog says | Actually |
|---|---|---|
| **Δ1** | "`useActiveCohort.ts` *(delete — supersede)*; grep consumers → **StudentLayout only** (verify)" | **THREE references**: `StudentLayout.tsx`, **`CommunityPage.tsx:15,119`** (reads `offeringId`), and the file itself. Deleting it without migrating `CommunityPage` breaks the build. Either migrate BOTH consumers or do not delete it — say which you chose. |
| **Δ2** | "hero art via `ArtworkImage`" (path unstated) | It lives at **`@/components/media/ArtworkImage`**, not `src/components/`. Two import styles exist in the tree — default (`ContinueLearning`) and named (`CatalogCard`). Read it before using it. |
| **Δ3** | — | `offerings.whatsapp_group_link` **does exist** (`20260413100000:60`, typed at `types.ts:4086`), so R1-T6's WhatsApp card has a real source. Confirmed, build against it. |
| **Δ4** | — | `springs.glide` and `springs.snap` **do exist** in `src/lib/motion.ts`, and `vaul` **is** installed. Use them; do not hand-roll easings or a sheet. |

## The inviolable rules
1. **Flag off = ZERO behavioural diff.** Everything behind `VITE_COHORT_ROOMS` (env + localStorage override), default OFF. With the flag off, `/cohort/*` must stay byte-identical to today.
   > ⚠️ A flag is NOT a security control (NFR-CONFIG-2). R0's RLS gates the data regardless; the flag gates only the surface. Do not let any code path treat the flag as authorisation.
2. **`src/index.css` gets EXACTLY two lines** — the `--room-accent` / `--room-accent-text` defaults on `:root`. Nothing else. That file broke vertical scroll for every Android user on 2026-06-14 with a one-word change, and it is the single highest-blast-radius file in the repo.
3. **The theme provider adds NO overflow, transform or backdrop styles** — CSS variables only. Grep the diff to prove it. Same reason as rule 2.
4. **The payment pipeline and the `isIOS()` guards in `ApplicationStatus.tsx` are untouched.** Verify with `grep -n "isIOS" src/pages/ApplicationStatus.tsx` and diff those expressions (not comments) against `origin/main`. Never trust line numbers — they have drifted repeatedly in this program.
5. **No new migration.** R1 is client-only. If you believe you need a schema change, stop and say so.
6. **A non-member deep link renders a branded "This room is private."** — never a spinner, never a tease of content they cannot have.

## Ground truth R0 already shipped — build against it, do not re-derive
- RPCs: `get_my_cohort_rooms()`, `get_cohort_room(p_offering)`, `get_room_roster(p_offering)`. Each asserts access FIRST and RAISES for a non-member rather than returning an empty set — so "empty" and "denied" are different, and the UI must not conflate them.
- Pure client helpers in `src/lib/room.ts`: `resolveTheme(config)` (with the contrast floor), `sessionTimeState(session)`, `moduleEnabled(config, key)`. Import them; do not reimplement.
- The T-60 zoom gate is SERVER-side — the RPC nulls `zoom_link` before the window. The client never receives what it must not render, so do not add a client-side time check and call it security.

---

## Task R1-T1 — Room routes + shell + redirect shim (`tier: 1` — routing)
**Files:** `src/App.tsx`, `src/pages/room/RoomShell.tsx` *(new)*, `src/pages/room/RoomHome.tsx` *(new skeleton)*, `src/pages/MyCohortsPage.tsx` *(new skeleton)*, `src/lib/flags.ts`
**Spec:** Routes `/rooms` and `/room/:slug` with nested `weeks/:n | screenings | feed | people | resources` under `RoomShell`, lazy-chunked. `/cohort/:offeringId` resolves the slug and `<Navigate replace>` — **old notification emails link `/cohort/{{offering_id}}` and must keep working** (R-D9). Register `VITE_COHORT_ROOMS` in the existing registry, default OFF.
**Edge cases:** slug not found → 404 state; member of an offering with no config row → shell renders on defaults; non-member deep link → the private state, not a spinner.
**Acceptance:** flag off = zero behavioural diff; flag on = navigable skeletons; the lazy chunk actually splits (verify in the build output, do not assume).

## Task R1-T2 — RoomThemeProvider + token bridge (`tier: 1` — touches index.css)
**Files:** `src/components/room/RoomThemeProvider.tsx` *(new)*, `src/index.css` *(TWO LINES ONLY)*, `tailwind.config.ts` *(aliases `room-accent`, `room-accent-text`)*
**Spec:** The provider renders `<div data-room-theme style={{ "--room-accent": …, "--room-accent-text": … }}>` from `resolveTheme()`; children read `text-room-accent`. Defaults equal cream so an unthemed render is sane. The contrast floor lives in `resolveTheme` (R0, already tested) — **never trust the config row**.
**Edge cases:** config missing theme keys → defaults; theme changes mid-session → style object swaps, no remount; one provider per shell.
**Acceptance:** two fixture rooms render distinct accents with **identical layout**; outside `/room/*` the computed `--room-accent` is the cream default; `grep` proves no overflow/transform/backdrop added.

## Task R1-T3 — The title card: masthead + entrance (`tier: 2`)
**Files:** `src/components/room/RoomMasthead.tsx` *(new)*, `src/components/room/RoomEntrance.tsx` *(new)*
**Spec:** "Season One" masthead — hero art via `@/components/media/ArtworkImage` (landscape, scrim, monogram placeholder from `theme.monogram`), `wordmark_text` in mono tracking-widest at `--room-accent`, serif-italic tagline, `WEEK {n} OF {m}`, grain overlay when `theme.texture === 'grain'` (existing util, ≤4%). Entrance plays ONCE per session per room (`sessionStorage lu_room_entered_{slug}`): art fade + nameplate rise on `springs.glide`, **≤600ms total**; reduced motion → instant.
**Edge cases:** no `hero_url` → monogram block with the full layout preserved (**no void**); very long wordmark → clamp 2 lines, keep tracking; `pre_start` phase → the line reads "Starts {date}".
**Acceptance:** both fixtures read as distinct title cards at 375 and 360; entrance plays once per session; **CLS < 0.02**; 60fps at 4× CPU throttle; `backdrop-filter` delta = 0.

## Task R1-T4 — My Cohorts + nav (`tier: 2`)
**Files:** `src/pages/MyCohortsPage.tsx`, `src/components/layout/StudentLayout.tsx` *(nav slot lines only)*, `src/pages/CommunityPage.tsx` *(only if you migrate it off `useActiveCohort` — see Δ1)*, `src/hooks/useActiveCohort.ts`
**Spec:** `/rooms` lists room cards (accent bar, nameplate, phase, "Week 4 of 12", next-session countdown, unseen-announcement dot) from `get_my_cohort_rooms()`. Live rooms first, alumni shelf below. Empty state: serif "No cohort yet." + a link to the live-cohorts catalog.
Nav slot: 0 rooms → hidden; 1 room → that room's `wordmark_text` (**not** "My Cohort") linking `/room/:slug`; >1 → "My Cohorts" linking `/rooms`. **Shows from `pre_start`** — this fixes the enrolled-but-invisible window, so drop any `weeks > 0` requirement.
**Δ1 APPLIES HERE.** Handle all THREE `useActiveCohort` references or leave the hook in place.
**Acceptance:** two-room fixture shows both in the right order; one-room fixture nav shows the room name; enrolled-with-no-weeks fixture sees the room in `pre_start`; if you deleted the hook, zero references remain **and `CommunityPage` still works**.

## Task R1-T5 — Room switcher (`tier: 2`)
**Files:** `src/components/room/RoomSwitcher.tsx` *(new)*, `src/pages/room/RoomShell.tsx` *(mount — SEQUENTIAL with R1-T1, same file)*
**Spec:** With >1 membership the nameplate becomes a menu: dropdown on desktop, `vaul` sheet on mobile, listing rooms as accent-chipped rows. Switching navigates and writes `lu_last_room`. ≥44px rows, `tapTick()` on switch, `springs.snap` entrance, `AnimatePresence` exit.
**Edge cases:** a single membership renders static text — **no dead menu**; switching into an alumni room keeps full nav.
**Acceptance:** a switch round-trip preserves scroll on return; Android back closes the sheet; every target ≥44px.

## Task R1-T6 — Pre-start induction (`tier: 2`)
**Files:** `src/components/room/PreStartCard.tsx` *(new)*, `src/pages/room/RoomHome.tsx` *(slot — SEQUENTIAL with R1-T1)*
**Spec:** For `phase === 'pre_start'`: title card + "Doors open {batch start date}" countdown (day granularity), the roster module (**faces early — cohort-mates are the hook**), the first announcement slot, a WhatsApp card while R-D5 coexistence holds (`offerings.whatsapp_group_link`, external-link treatment, `rel="noopener"`), and "What to expect" (week count and cadence from authored weeks if present).
**Edge cases:** no weeks authored → the expectation block hides gracefully; the start date passes while the page is open → refetch flips to the live layout.
**Acceptance:** the pre-start fixture renders **no dead modules**; the countdown is correct across IST boundaries; the external link carries `rel="noopener"`.

---
## Phase acceptance
- `npm run build` · `npx vitest run` · `npm run typecheck:functions` green; lint no NEW errors.
- **Flag off = zero behavioural diff.** Say how you verified it, not that you believe it.
- `src/index.css` diff is exactly two lines; no overflow/transform/backdrop anywhere in the theme provider.
- `isIOS()` guard expressions and the payment pipeline diff = 0.
- Audited at 360×740 and 375×812 with real measurements.
- Do NOT deploy, apply migrations, or merge.
