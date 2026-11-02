# Stage: the LevelUp brand system

**Handoff spec for Claude Code.** Written for `levelupadmin/levelup-main-app` (Vite, React 18, TypeScript, Tailwind, shadcn/ui, framer-motion, Capacitor, Supabase).
**Status:** decided. Accent **Ember `#f0561a` with white type** (the default), plus **Mono** (no colour) as the alternative. Dark first, light later.
**Source of the direction:** the LMS Experience Lab, rounds 1 to 3 (live at levelup-experience-lab.vercel.app). The screens there were mocks. This document keeps the thinking and drops the mock features.

---

## 0. How to use this document

**For Claude Code, in this order:**

1. Read this file end to end once. Then read `CLAUDE.md`, `ARCHITECTURE.md`, `ORCHESTRATION.md` and `DESIGN-STRATEGY.md` in the repo. This spec **replaces** the visual parts of `DESIGN-STRATEGY.md`: colour, type, grain, the champagne system and the serif. Its motion, haptic, performance and phasing doctrine **still stands** and this spec builds on it.
2. Work stage phase by stage phase, **S0 to S5** (section 13). The repo already uses "phase-0 to phase-6" for the earlier design revamp (`design/briefs/phase-*.md`, `design/phase-N` branches), so always call these **S0 to S5**, with briefs in `design/stage/briefs/` and branches `design/stage-sN`. Every stage phase ships on its own, behind the `VITE_BRAND_STAGE` flag, and respects the repo's change-risk tiers. `src/index.css`, `tailwind.config.ts`, `index.html`, `capacitor.config.ts`, the app shell, auth and payments are **Tier 1**.
3. **The flag-off parity rule.** With the flag off, the app must render exactly as it does today: same DOM where tests pin it (`StudentLayout.nav.test.tsx`), same classes, same network requests. So every visual change in S1 to S4 is flag-scoped in one of two ways:
   - CSS under `html[data-brand="stage"]` (like the bridge rules in `tokens/stage.css`); or
   - a class choice on the module-level constant: `STAGE_ENABLED ? stageClasses : legacyClasses` (`STAGE_ENABLED` comes from `src/lib/appearance.ts`).

   Never edit a legacy class string in place.
4. **The flag** goes through the repo's own `flag()` helper (`src/lib/flags.ts`). Register `VITE_BRAND_STAGE` and `VITE_BRAND_LIGHT` in its `REGISTRY` with default `false`. To preview Stage on the live site without a deploy, set `localStorage["VITE_BRAND_STAGE"] = "on"` and reload.
5. **Gates.** Use the repo's workflows as `ORCHESTRATION.md` describes (by `scriptPath`). `npm run release:gate` already has failures at HEAD (14 `tsc` errors in admin files) and needs the local Supabase stack. The bar is **no new failures** compared with `main`, and all Stage tests green.
6. When a screen is not described here, apply the principles (section 2) and the decision rules (section 3). Do not copy a prototype screen. Do not invent a feature to fill a layout.
7. When this spec and the code disagree about **what exists** (routes, data, states), the code wins. When they disagree about **how it should look, move or sound**, this spec wins.
8. The files under `tokens/` and `reference/code/` are meant to be used, not just read. They typecheck against this repo, lint clean, and pass their render test (`reference/code/brand.smoke.test.tsx`, 9 tests).

**Words used here:**

- **Stage**: the brand system.
- **Accent**: the one brand colour, Ember or Mono. In code it is `brand`, **never** shadcn's `accent`. In this repo `accent` is the neutral hover fill, and that stays.
- **The next thing**: whatever a learner should do next (join tonight's class, continue a lesson, finish an application).

---

## 1. The change in one paragraph

The app moves from "private screening room" (pure black, warm cream type, champagne gradient buttons, Instrument Serif italics, film grain, gold for live) to **Stage**:

- **Base:** cool charcoal neutrals.
- **Type:** a confident grotesque for headlines (Bricolage Grotesque) and a clean workhorse for everything else (Geist).
- **Blocks:** filled blocks instead of outlined boxes.
- **One accent:** **Ember**, a bright orange with white type, used only where you press or where you are.
- **Red:** reserved for live classes.

**What changes:** it is premium through restraint, not decoration. The feel is less "dramatic" and more "a real app you trust with ₹1,499".

**Mono** is the same system with the accent taken out: white on dark, black on light. It is the quiet, most premium version, and a learner can choose it.

**What stays** from the current app:

- the spring physics in `src/lib/motion.ts`;
- the haptics doctrine in `src/lib/haptics.ts`;
- reduced-motion care;
- the Android WebView performance budget;
- safe-area handling;
- the Tier process.

---

## 2. Principles (the thinking to carry into every screen)

Each principle has the reason it exists. The reason is what lets you apply it to a screen this document never mentions.

### 2.1 One accent, and only where you press or where you are
Ember appears in four places only:
- the primary action on a screen;
- the selected filter, tab or option;
- the single "next thing" card;
- progress (bars, the current week, the playing lesson).

Everything else is neutral.

*Why:* when colour means "act here", people find the action without reading. The moment colour is used for decoration, it stops meaning anything. **Test:** cover the accent with your thumb. If the screen loses no meaning, the accent was decoration and must go.

### 2.2 One loud thing per screen
Each screen has at most **one filled accent block** in view, usually the next-thing card or the primary button. A second call to action is secondary: a neutral fill or a text button.

*Why:* two loud things cancel out, and the learner hesitates.

### 2.3 Filled blocks, not outlined boxes
Cards, chips, inputs and rows sit on filled surfaces one step lighter than the page (`surface-2` on `bg`). There are no borders around cards. Hairlines separate list rows, not containers.

*Why:* on dark UIs, outlines look like wireframes and fills look like objects. This is most of the "real app, not a mockup" feeling.

### 2.4 Content is the colour
Posters, mentor photography and video are the only rich colour in the app. Never tint artwork with the accent, never lay the accent over a face, never recolour a poster. Let the artwork carry the page, and keep the chrome around it grey.

*Why:* the catalogue is the product. A grey frame makes the artwork look expensive, and an orange frame competes with it.

### 2.5 Red means live
`live` red appears only when a class is live right now (and, separately, for errors). It never marks "new", unread, a sale or urgency.

*Why:* "your class is live" is the most important interrupt in the app. If red is used anywhere else, a live class stops standing out.

With Ember being orange, live must also carry the word **LIVE** and a pulsing dot. Never rely on the red alone.

### 2.6 Words, not icons in boxes
Format labels are words in small caps (MASTERCLASS, WORKSHOP, LIVE COHORT). An icon may sit next to a word, but never inside a coloured square or circle. The week strip uses a thin colour bar, not an icon, to mark type.

*Why:* icon-in-a-box is the most common "template" tell. Words are faster to read for a first-time user.

### 2.7 Calm motion: things settle, they do not perform
Everything moves on springs from `motion.ts`, arrives with a short settle, and never tilts, flips, bursts or bounces. The one exception is `bounce`, used for a completion moment.

The brand has exactly **three set pieces**:
- the first-launch intro;
- the sign-in moment;
- the line drawing itself on success and empty states.

Everything else is functional motion. The existing decision reveal (`decisionReveal` in `motion.ts`) stays as the one other full-screen moment: it keeps its timeline and takes the Stage type and colour rules.

*Why:* the brief was "elegant, premium, sophisticated, less drama". Drama spent on every screen makes the whole app feel like a demo.

### 2.8 Sound marks moments, not taps
The app makes sound at five kinds of moment: sign-in (the sonic logo), success, completion, a class going live, and errors. Taps, keys and sheets are silent by default.

*Why:* sound on every tap is noise within a day. Sound on the five moments that matter makes those moments feel produced.

### 2.9 Familiar before clever
Use patterns people already trust on their phone:
- a tab bar;
- lists;
- sheets that slide up and swipe down;
- one primary button at the bottom of a flow;
- the system's own back gesture.

Brand lives in type, colour, motion and sound, not in reinvented controls.

*Why:* "it looks like a mockup, not a real app" came from invented patterns.

---

## 3. Decision rules for any screen (including ones not in this spec)

Go through these in order before styling a screen.

1. **What is the one thing this screen is for?** That action gets the accent fill. If there are two, the less important one becomes secondary (neutral fill) or a text button.
2. **Is anything time-bound in the next 24 hours for this learner?** If yes, and this is a home-type screen, it becomes the next-thing card (section 7.6). If not, there is no accent card, and the artwork leads.
3. **Is anything live right now?** Only that gets red, with the word LIVE and the pulse.
4. **Is there artwork?** Let it lead. Use the correct aspect ratio, `object-cover`, a scrim into `bg` at the bottom, and no accent over it.
5. **Are there icons in boxes, or outlines around cards?** Remove the box or outline. Use a filled block, or just the word.
6. **How many filled accent blocks are in view?** More than one means demoting one.
7. **What moves?** Only what changed: arrivals settle, and presses spring. If something moves for decoration, delete the motion.
8. **Does anything make a sound?** Only if it is one of the five moments (section 9).
9. **Empty, loading, error?** Every screen needs all three:
   - empty: the rising line draws, then one sentence and one action;
   - loading: skeletons for lists and pages, the line loader for waits;
   - error: one sentence saying what happened and what to do, plus a retry.
10. **Check it at 360×740, both accents, and with reduced motion on.**

---

## 4. Colour

All values live in `tokens/stage.css`. That file is generated by `tokens/build_tokens.py`, so edit the source, not the output. They are HSL triplets like the rest of `src/index.css`, so `bg-brand/15` and `text-foreground/70` work.

### 4.1 Neutrals

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#0c0d0f` | `#f3f4f6` | Page |
| `surface` | `#15171a` | `#ffffff` | Sheets, nav bars |
| `surface-2` | `#1c1f23` | `#e8ebef` | Cards, chips, inputs (filled blocks) |
| `surface-3` | `#262a2f` | `#dde1e6` | Pressed / hover fill, avatars |
| `line` | `#262a2f` | `#e0e3e8` | Hairlines |
| `line-strong` | `#373c43` | `#c6cbd2` | Input edges, dividers that must show |
| `text` | `#f4f6f8` | `#0f1216` | Primary type |
| `text-2` | `#a8afb8` | `#4d5560` | Secondary type |
| `text-3` | `#8a929c` | `#626b76` | Hints, eyebrows, timestamps |
| `live` | `#ff453a` | `#d42a20` | Live now only (and errors) |
| `success` | `#34c38f` | `#1f9e6f` | Done, completed, paid (marks and small fills) |
| `warning` | `#f5a524` | `#b86e00` | Due soon (bars and dots; text uses warning-text) |

Stage dark is **cool charcoal `#0c0d0f`, not pure black**. Pure black is used only for letterboxing inside the video player. Light mode is a cool paper grey page with white sheets.

### 4.2 The accent: Ember (default) and Mono

| Accent · theme | Fill `--brand` | Type on fill | Accent type on page | Type on fill contrast | Accent type contrast |
|---|---|---|---|---|---|
| Ember · dark | `#f0561a` | `#ffffff` | `#ff9362` | 3.5:1 | 8.9:1 on `#0c0d0f` |
| Ember · light | `#f0561a` | `#ffffff` | `#b63f0b` | 3.5:1 | 5.2:1 on `#f3f4f6` |
| Mono · dark | `#f4f6f8` | `#0c0d0f` | `#ffffff` | 17.9:1 | 19.4:1 on `#0c0d0f` |
| Mono · light | `#0f1216` | `#ffffff` | `#0f1216` | 18.8:1 | 17.1:1 on `#f3f4f6` |

**Ember with white type is a deliberate choice, with a known exception.** White on `#f0561a` is **3.5:1**:
- **It passes** WCAG AA for large text (24px and up, or 18.66px bold and up) and for non-text UI, which needs 3:1. The countdown, the card title and the Ember fill itself all pass.
- **It fails** AA for normal-size text. Button labels (15px), chip labels (14px) and the card's small lines (14px) are **below AA on Ember**. LevelUp has accepted this for the look.

The guardrails that come with the choice:

- On an Ember fill, type is **at least 14px at weight 600**, always 100% white. Nothing smaller, lighter or translucent.
- No reduced-opacity type on Ember. Secondary lines on the Ember card are **100% white at 14px/600**, not 72% opacity.
- Accent-coloured **text on the page** never uses the fill colour. It uses `brand-text`: `#ff9362` on dark (8.9:1) and `#b63f0b` on light (5.2:1).
- If an accessibility audit later requires AA everywhere, change one token: Ember Deep `#d44510` gives 4.5:1 with white. Nothing else changes.
- The same exception applies to white on the live red (3.4:1 on dark), with the same guardrails.

**Mono** swaps the accent for pure contrast: a white fill with near-black type on dark, and a near-black fill with white type on light.
- It is a complete theme, not a special case. Every rule in this spec works in Mono.
- In Mono, the red of a live class is the only colour in the app.
- A learner picks Mono in Profile > Appearance, and it applies everywhere. Never mix Ember and Mono on one screen.

### 4.3 Type contrast (all checked)

| Theme | Type token | on `bg` | on `surface-2` |
|---|---|---|---|
| dark | `text` `#f4f6f8` | 17.9:1 | 15.3:1 |
| dark | `text-2` `#a8afb8` | 8.8:1 | 7.5:1 |
| dark | `text-3` `#8a929c` | 6.2:1 | 5.3:1 |
| dark | `live-text` `#ff7a70` | 7.7:1 | 6.5:1 |
| dark | `success-text` `#34c38f` | 8.7:1 | 7.4:1 |
| dark | `warning-text` `#f5a524` | 9.5:1 | 8.1:1 |
| light | `text` `#0f1216` | 17.1:1 | 15.7:1 |
| light | `text-2` `#4d5560` | 6.9:1 | 6.3:1 |
| light | `text-3` `#626b76` | 4.9:1 | 4.5:1 |
| light | `live-text` `#c0271d` | 5.4:1 | 4.9:1 |
| light | `success-text` `#136e4c` | 5.7:1 | 5.2:1 |
| light | `warning-text` `#8a5300` | 5.8:1 | 5.3:1 |

The live fill with white type is 3.4:1 on dark and 5.1:1 on light. Same rule as Ember: only type of 14px or more at weight 600 or more on it. The LIVE pill is the one exception: 10.5px/700 caps, red on a white pill inside the live card (3.4:1), and white on a red pill elsewhere. It is always paired with the pulsing dot, so it never carries meaning by colour or text alone.

### 4.4 Where the accent may and may not appear

| Allowed (`brand`) | Not allowed |
|---|---|
| Primary button fill | Headlines, body text, icons for decoration |
| Selected chip or filter | Card backgrounds (except the one next-thing card) |
| Next-thing card (one per screen) | Artwork frames, tints, overlays on photos |
| Progress bars, playing lesson, current week (`brand-line`) | "New" badges, sale tags, counts |
| Active tab icon and label (`brand-text`) | Borders around cards |
| Links and text actions (`brand-text`) | Anything that is also red (live) |
| Self avatar (the learner's own initials) | Red unread badges or counts |
| Unread dot (8px, `brand-line`) | Any second accent colour |
| Focus ring (`ring`) | Charts: use neutrals plus one brand series |

### 4.5 Status colours
- **Live** (`live`): red; only "live now", with the LIVE word and pulse.
- **Error** (`destructive`): the same red hue. The error message says what went wrong, so it is never confused with live.
- **Success** (`success`): green; check marks, "Paid", "Completed", "Submitted". Use it as a small mark or as text (`success-text`), never as a big fill. The only fill exception is the pay button's brief done state.
- **Warning**: amber; "Due tomorrow", "Seat held until 6 PM". Bars and dots use `warning`, and text uses `text-warning-text`, which is darker in light mode so it reads.

### 4.6 Cohort rooms
One brand, many rooms. Buttons, chips, links, progress and the current week inside a room use `brand`.

- **The code change:** today `RoomThemeProvider.tsx` writes `--room-accent` and `--room-accent-text` inline, which beats any stylesheet. Under Stage (`STAGE_ENABLED`), it writes the room's colour to a new `--room-art-accent` instead, which only the masthead's artwork glow reads. It leaves `--room-accent` alone, so `tokens/stage.css` points it at `brand`.
- **The masthead glow** (`RoomMasthead.tsx`, the radial gradient near the top of the file) reads `--room-art-accent` under Stage instead of `--room-accent`.
- **Decorative room type goes neutral under Stage.** Today some `room-accent` call sites colour type that is not an action:
  - `RoomMasthead`'s monogram, eyebrow and H1;
  - the eyebrows in `RosterGrid` and `MentorCard`.

  Under Stage these use `text-foreground` (headlines, monogram) and `text-muted-foreground` (eyebrows). Flag-scope them per section 0.
- **Result:** the remaining `room-accent` call sites (actions, the current week, progress) turn Ember (or Mono) with no edits, and flag-off rooms are unchanged. Search for every `room-accent` use and sort it into "action or state" (keeps the brand) or "decoration" (goes neutral) before S1 closes.

---

## 5. Type

| Role | Face | Size / line / tracking | Weight | Where |
|---|---|---|---|---|
| Display | Bricolage Grotesque | 38 / 1.02 / -0.035em | 720 | Hero lines on welcome and sales pages |
| H1 | Bricolage Grotesque | 30 / 1.06 / -0.035em | 720 | Page titles, "Good evening, Arjun" |
| H2 | Bricolage Grotesque | 22 / 1.15 / -0.02em | 680 | Section heads ("Pick up where you left off") |
| H3 | Geist | 17 / 1.25 / -0.01em | 620 | Card titles, row titles |
| Body | Geist | 15 / 1.45 | 400 | Everything readable |
| Small | Geist | 13 / 1.4 | 400 / 560 | Meta lines, captions |
| Eyebrow | Geist | 11 / 1.3 / +0.1em, UPPERCASE | 600 | Dates, section labels, format labels |
| Countdown | Bricolage Grotesque | 56 / 0.9 / -0.03em, tabular | 720 | The next-thing card only |
| Numbers | Geist Mono | as context | 400 / 500 | Timecodes, "8:54 left", file sizes |

**Rules:**
- **Two faces plus mono.** Instrument Serif is retired in Stage, and so is JetBrains Mono (Geist Mono replaces it).
- Headlines use `text-wrap: balance`. Never set a headline wider than about 22 characters per line on a phone.
- Prices and counters are tabular (`tabular-nums`). The rupee sign is in the same face as the number.
- Inputs stay at **16px** on iOS (the anti-zoom rule in `index.css` is Tier 1, so don't touch it).
- Sentence case everywhere, except eyebrows and format labels in small caps. No Title Case Buttons.

**Installing the fonts** (Tier 1, since it touches `index.css`):
- All three are on Google Fonts under the SIL Open Font License. Download the variable woff2 files (latin + latin-ext) into `public/fonts/`:
  - Bricolage Grotesque, axes opsz, wdth and wght;
  - Geist;
  - Geist Mono.
- Declare them with `@font-face` next to the existing Inter blocks, using `font-display: swap`.
- **Preloads:** add them for Geist and Bricolage only when the flag is on at build time, through a small Vite `transformIndexHtml` plugin that reads `VITE_BRAND_STAGE`. That keeps flag-off network traffic unchanged. Web font requests still happen only when a Stage page actually uses the faces.
- **The rupee:** check that each new face has the ₹ glyph (U+20B9) before shipping. `index.css` explains how the repo handles faces without it: leave U+20B9 out of that face's `unicode-range` so it falls through to a real glyph. Follow the same pattern, and screenshot a price in each face.
- Keep Inter, Instrument Serif and JetBrains Mono until S5, because the flag-off look still needs them.

Tailwind's `fontFamily` becomes variables (`tokens/tailwind.stage.ts`), so `font-display` and `font-body` switch with the flag and no call site changes.

---

## 6. Shape, space and depth

- **Radius:** 8 (tiny), 12 (chips, small cards), 16 (buttons, inputs, cards), 22 (large cards, the next-thing card at 28), 28 (sheets, top corners only), pill (999). Tailwind `sm/md/lg/xl/2xl` map onto these through variables (see `tokens/tailwind.stage.ts`).
- **Gutter:** 20px on phones, and section spacing 28 to 32px. Keep the existing `space-*` tokens and `tab-bar` offset.
- **Touch targets:** at least 44×44. Buttons are 44 high (large 52, small 34), and chips 38.
- **Depth:**
  - *Dark mode:* depth comes from surface steps (`bg` → `surface` → `surface-2` → `surface-3`), not shadows. The only dark-mode shadow is under floating sheets and the sticky pay bar.
  - *Light mode:* one soft shadow ladder. `shadow-design-sm/md/lg` are hard-coded for black in `tailwind.config.ts` today, so S4 turns them into CSS variables with a light-mode set.
- **No grain, no glass on content.** Glass (blur) is allowed only on the top bar and tab bar while scrolling, blur at most 20px, per the Android budget.

---

## 7. Components (rules, not screens)

Each entry says what the component is, its states, and the Stage-specific rule. Build on the existing shadcn components and `components/patterns/`. Do not fork them.

### 7.1 Buttons (`src/components/ui/button.tsx`)
- **default** (primary): `bg-brand text-brand-foreground`, radius 16, height 44, label 15px/640. Keep the framer `whileTap` press (0.97) and `tapTick()`.
- **champagne** (the money path today): in Stage it renders exactly like **default** (flat Ember, white type, no gradient, no glow). Keep the variant name until S5, so its call sites don't churn.
- **How:** build the variant map twice in `button.tsx` (`STAGE_ENABLED ? stageVariants : legacyVariants`, both through `cva`). The base class's `rounded-[12px]` and the sizes' radii become `rounded-button` only in the Stage map. The legacy strings stay byte-identical.
- **secondary**: `bg-surface-2 text-foreground`, no outline in dark and a 1px `line` in light.
- **ghost / link**: text in `brand-text` for actions, `muted-foreground` for dismissals ("Not now").
- **Live**: when the action is "Join the live class", the button is `bg-live text-live-foreground` (or white-on-red inside the live card).
- **States:**
  - Loading replaces the label with `LevelUpLoader` (30px, inheriting colour) and keeps the width.
  - Done briefly shows a check and "Paid" on `success`, then moves on.
  - Disabled uses `surface-3` with `subtle` text, never a faded accent.

### 7.2 Chips and filters (catalogue tiers: All, Mentorship Cohorts, Masterclasses, Programs, Workshops)
- Pill, 38 high, `bg-surface-2`, label 14px/600.
- Selected: `bg-brand text-brand-foreground`. No icons inside chips.

### 7.3 Segmented control (Learn: Courses, Live, Calendar)
- Track `bg-surface-2`, pill 999.
- Selected segment: **`bg-foreground text-background`**, an inverted neutral, not the accent. It is "where you are" inside a page, and the page's primary action keeps the accent.
- The selection glides on `springs.glide` (existing `layoutId` pattern).

### 7.4 Tab bar (`StudentLayout`: Home, Learn, Community, and Studio for cohort members only)
- Background `surface` with 20px blur while content scrolls under it, and a hairline on top.
- **Active:** icon and label in `brand-text`, and the icon at 22px. **Inactive:** `subtle`.
- The current cream `layoutId` pill becomes `bg-foreground/[0.06]`, or is removed; test both and keep the calmer one.
- `hapticSelection()` on change, as now. No sound.

### 7.5 Cards and rows
- Card: `bg-surface-2`, radius 16 to 22, no border, padding 16 to 18.
- Rows inside a card are separated by `line` hairlines. Tapping a card: press scale 0.985 on `springs.snap`, then `tapTick()`.
- Poster artwork: 2:3 for programs and masterclasses, 16:9 for lessons and recordings. Always `object-cover` with a bottom scrim into `bg`. Missing art gets the branded placeholder: `surface-2` with the rising line in `subtle`.
- Format label on or near the art: small caps, 10.5px/650, +0.08em, on a `surface-2` pill (or `rgba(255,255,255,.16)` on artwork).

### 7.6 The next-thing card (the one loud block)
This is Stage's signature component. It shows the single most time-relevant thing for this learner. Build it on the existing session state (`SessionTimeState` in `src/lib/room.ts`: `scheduled | tonight | soon | live | ended | recorded`, and `TimeStateBadge` / `Countdown`).

**Layout** (all states):
- State pill at the top left (clock icon plus "Today, 7:30 PM").
- Artwork thumbnail 64×64 at the top right, radius 16.
- The countdown or the title below that, then one meta line, then actions.
- Radius 28, padding 18.

| State | Fill / type | Content | Actions |
|---|---|---|---|
| `scheduled` (more than 24h) | Not this card. Show it in the week strip. | | |
| `tonight` / `soon` (under 24h) | `bg-brand`, white type | Countdown (h / m / s, 56px, tabular; the unit letters at 14px/600 in the body face, full white), session title (20px/680), meta ("BFP · Batch 23 · Week 4", 14px/600) | Primary "Join opens at 7:15 PM" disabled until the join window. Inside the card, primary = `bg-brand-foreground text-brand` (inverted). Secondary actions only if the data exists. |
| `live` | `bg-live`, white type | LIVE pill (white pill, red text, pulsing red dot), title 28px, "Started 12 min ago", who is in (avatars) | "Join class": white button, red label. Plays the `live` sound and a notification haptic **once** when the state flips while the app is open. |
| `ended` (recording processing) | `bg-surface-2`, normal type | "Class ended", title, "Recording in about an hour" | None, or "Class notes" if they exist |
| `recorded` | `bg-surface-2`, normal type | State pill `bg-brand/15 text-brand-text`, title 26px | Primary `bg-brand` "Watch the recording" |

- Nothing time-bound? Then there is no card. The home screen leads with "Pick up where you left off", or the catalogue artwork for new learners.
- For applicants, the card is the application's next step ("Step 2 of 3 · Pay the application fee"), using `ApplicantStageCard`'s data.
- **Mono:** the card is white on dark or black on light, and everything else holds.

### 7.7 The week strip ("This week")
- Seven day columns. Today's date sits on a small `brand` fill, and the rest are plain.
- Each item has a **3px vertical bar**: `live` for a live class, `brand-line` for something due, and `subtle` for everything else.
- No icons. Tapping an item opens its session or assignment.

### 7.8 Lists, curriculum rows, the playing lesson
- Row: title 15px/600, meta 13px `muted-foreground` with duration in Geist Mono.
- Locked rows show a small lock in `subtle` and never grey out the title below 4.5:1.
- The playing lesson: the row gets a `brand-line` fill that grows left to right with playback (the existing `progressFill`), with the title in `brand-text`.
- Completed rows get a `success` check.

### 7.9 Progress
- Bars 3 to 4px, track `surface-3`, fill `brand-line`, rounded.
- Rings: 3px stroke, `brand-line` on `surface-3`, using the existing `durations.sweep`.
- Percentages in Geist Mono.

### 7.10 Inputs and OTP
- Filled `surface-2`, radius 16, height 52, 16px text, placeholder `subtle`.
- Focus: a 2px `ring` (brand) inset. Errors: a 2px `destructive` ring and one line of `live-text` below.
- OTP boxes follow the same rule. The existing `otpSuccess` digit condense hands over to the sign-in moment (section 8.4).

### 7.11 Sheets, dialogs, toasts
- Sheets (vaul): `surface`, top radius 28, grabber 36×4 `line-strong`, swipe down to dismiss on `springs.glide`.
- Dialogs: only for destructive confirmation. Everything else is a sheet.
- Toasts (sonner): `surface-2`, 14px, one line. Success toasts have a `success` check, errors a `destructive` dot.

### 7.12 Avatars and people
- Other people: initials on `surface-3`. The learner's own avatar: initials on `brand`.
- Stacks overlap by 8px with a 2px ring of the surface they sit on.

### 7.13 Empty, loading, error
- **Empty:** the rising line draws itself (`LevelUpMark play="draw" showWord={false}`, 84px, `brand-text`), then one sentence (H3) and one action. Never a stock illustration. Example: "Nothing due this week." / "Browse workshops".
- **Loading:** skeletons (`skeleton-shimmer`) for anything list- or page-shaped. `LevelUpLoader` for waits: paying, verifying, joining, generating a certificate.
- **Error:** "We couldn't load your classes. Check your connection and try again." plus a Retry button. Never "Something went wrong."

### 7.14 Icons
- Keep lucide-react. Use 20px in content and 22px in navigation, with stroke width 1.75, in `currentColor`.
- Never inside a filled box or circle.

---

## 8. Motion

`src/lib/motion.ts` stays the single source for springs, durations and easings. Add `src/lib/brand-moments.ts` (in `reference/code/`) for the three brand set pieces. Every animation is transform, opacity or SVG `pathLength` only. That means no `filter` and no `backdrop-filter` animation (the Android budget). Every moment has a reduced-motion path.

### 8.1 Everyday motion

| What | How |
|---|---|
| Press | `pressTap` (scale 0.97, `springs.snap`) on buttons; 0.985 on cards |
| Screen push | Existing `PageMotion` slide on PUSH, nothing on POP |
| Sheet | Rise on `springs.glide`, and follow the finger on drag |
| Arrivals (lists, cards) | Fade and move up 8px, stagger 40ms, at most 6 items staggered |
| Tab / segment selection | `layoutId` glide on `springs.glide` |
| Counters and progress | `CountUp` / `durations.sweep`, linear for playback-driven fills |
| Completion | `springs.bounce`, the only bounce in the app |
| Live dot | Pulse, 1.5s loop: a ring behind the dot that scales 1 → 2.4 and fades (transform and opacity, like `TimeStateBadge`'s ping). Paused under reduced motion |

**Never in Stage:** tilt or 3D rotation, confetti, particle bursts, "stamps", shakes (except a 3-step OTP error nudge), parallax on text, and blur animations. `Confetti.tsx` and `ChampagneDust.tsx` are not used under Stage. Completion becomes the rising line plus the `complete` sound plus `celebrate()`.

### 8.2 The first-launch intro (`BrandIntro mode="first"`)
**Who sees it:** `pickIntroMode()` in `src/lib/intro.ts` decides.
- It plays once per device: the first cold start for someone **not signed in** who has not seen it (`lu.introSeen`, set the moment it starts).
- Signed-in learners never get it. That includes every existing install when Stage turns on: they get the return beat, or nothing.
- It never plays on a deep link or a notification open.

**Hand-off from the splash:** on native, the Capacitor splash fades out over the existing 240ms onto the intro's **empty** first frame. On web, `#boot-splash` is removed the instant React mounts, and the intro's first frame is the same empty dark page. The name only starts rising at 0.45s, so this reads as a cut to black, then the title. It is not a mark jumping size. Never show a static mark at a different size in between. The intro mark is `min(64vw, 300px)` wide.

| t (s) | What happens |
|---|---|
| 0.0 | Page is `bg`. A faint accent glow (9%) sits behind centre |
| 0.1 → 1.6 | A 1px line of light (accent-tinted) sweeps across the centre and fades |
| 0.45 → 1.77 | The seven letters of "LevelUp" rise 6% and settle, 70ms apart, 0.9s each |
| 1.25, 1.45, 1.65, 1.85 | The four nodes of the rising line draw (0.45s each) and pop in on a soft spring. **Each node plays one note of the sonic logo** and a light haptic (the last one medium) |
| 1.36 → 1.98 | The three connecting lines draw between the nodes |
| 2.05 → 2.75 | "learning" fades up |
| 0.9 | "Skip" appears (bottom right, above the safe area) |
| 2.7 → 3.4 | Exit: the whole overlay fades while the mark scales 1 → 1.08 |

**Optional montage** (only if at least 6 catalogue posters are already cached): up to 12 real posters in a 3-column grid behind the mark. Each fades to 45% and back over 2.3s in a scattered order, with a radial vignette keeping the centre calm. If posters are not cached, skip the montage. Never wait for the network in an intro.

**Sound on first launch:** the app icon tap happens outside the WebView, so most platforms will not allow audio yet. If `AudioContext` is not running, the intro plays silently. **Do not add a "tap to begin" gate to get sound.** The sonic logo's first real play is the sign-in moment. (Optional, later: allow media without a gesture in the Android WebView settings, and verify on device.)

**Reduced motion:** the static mark for 0.7s, then a 200ms crossfade. No montage, no beam.

**Safety:** both overlays also call `onDone` from a timer (exit time + 250ms), so a missed animation callback can never leave a full-screen layer over the app. Skip ignores taps until it is visible.

### 8.3 The returning-user beat (`BrandIntro mode="return"`)
The repo's own goal: **a returning student sees their momentum within 1 second of opening the app** (`DESIGN-STRATEGY.md` section 6). So this beat only ever covers real loading and never adds a millisecond.

- **When:** a cold start for a signed-in learner. Not on resume from background, not on deep links, not on route changes.
- **Home cached, so no beat at all.** "Cached" is defined in `pickIntroMode()`:
  - Wait until the persisted TanStack cache has finished restoring (`useIsRestoring()` is false).
  - Then check Home's two first-paint queries, the ones `Home.tsx` already gates its skeleton crossfade on: `enrolled-progress` for this user and `catalog`. If both have data, Home paints straight away.
- **Home not cached:** the beat is the boot splash, continued. It shows the same full mark at the same 132px, in the same place and colour, with the same gentle opacity breathe (0.5 to 0.92 over 1.6s). Nothing redraws and nothing changes colour, so the hand-over from `#boot-splash` is invisible.
  - The only brand motion is the exit. The moment Home is **ready** (those two queries are no longer loading), the mark shrinks up into the header wordmark's position and fades (300ms).
- **Hard deadline:** the exit is **finished by 1000ms after navigation start** (`performance.now()`, not mount time).
  - If Home still isn't ready at 700ms, the beat leaves anyway and Home's skeletons take over.
  - If the app mounts after 700ms (a slow device), there is no beat at all.
- Silent, no haptic.
- If you can, share a framer `layoutId` with the header wordmark so the mark literally becomes the header logo.

### 8.4 The sign-in moment (`SignInMoment`)
Replaces the champagne check after a correct OTP, and plays after the existing digit condense.

- **Where:** everywhere `OtpEntryStep`'s success path runs: `Login.tsx`, `/signup` and `ClaimApplication.tsx`.
- **Navigation today:** `Login.tsx` navigates after `otpSuccess.windowMs` (850ms), and `Login.postVerifyNav.test.tsx` pins it. Under Stage, navigate in `SignInMoment`'s `onReveal` instead. Keep the 850ms path byte-identical when the flag is off, and add a flag-on case to that test.

| t (s) | What happens |
|---|---|
| 0 | Overlay fades in over 0.3s: `bg` with a 16% accent glow at upper centre |
| 0.3, 0.5, 0.7, 0.9 | **The full sonic logo plays** (audio is unlocked: the learner just typed the code). The four nodes draw on the four notes, each with a ripple ring expanding 3.4× and fading, and four haptics (light, light, light, medium) land on the same beats |
| 1.0 → 1.7 | Eyebrow and title fade up: "Welcome back" / "Arjun", or "You're in" / "Diya" |
| 2.3 | Exit starts. `onReveal` fires (render Home or onboarding underneath). The line rises 40px and scales to 0.8 while everything fades over 0.65s |

- **Reduced motion:** a static line with the text, 0.9s, then a 150ms fade. No sound, and one medium haptic so the success is still felt.
- **Total:** at most 3.5s from the last digit (0.5s condense plus 2.95s moment). **Tap anywhere after 1s to skip straight in**, so a learner who signs in often is never held.
- **Wrong OTP:** an `error` sound, an error haptic, and a 3-step nudge on the OTP row. No overlay.

### 8.5 The line drawing itself (success and empty states)
- `LevelUpMark play="draw" showWord={false}`: nodes 140ms apart. Used on ThankYou (with `success` sound plus `celebrate()`), lesson and course completion (with `complete`), and empty states (silent).
- `LevelUpLoader`: the same line, drawing in and out on a 1.6s loop.

### 8.6 Performance budget (from `ORCHESTRATION.md`, unchanged)
- 60fps on a mid-range Android WebView, measured on a real device.
- Transform and opacity only. Blur is at most 20px and never animated.
- Tap feedback within 100ms, and no layout shift.
- The montage images are `decoding="async"` and already cached; no extra requests on launch.

---

## 9. Sound

`src/lib/sound.ts` (in `reference/code/`): Web Audio, synthesised, **no audio files**.

**The sonic logo is the logo's own line, played.** The four nodes above "Up" sit low, high, middle, highest, which as pitches is **E4, B4, G#4, E5**. The tones are warm triangles with a little room reverb, and a low E sits under the last note. The whole logo lasts about 0.6s, with a 2s tail.

| Sound | When (only these) | Feel | Default |
|---|---|---|---|
| Sonic logo | Sign-in moment; first-launch intro (one note per node) if audio is allowed | Four notes rising, warm, with reverb | On |
| `success` | Payment done, application sent, assignment submitted | Two notes up, bright | On |
| `complete` | Lesson or course complete (after the video has stopped) | Four quick notes up | On |
| `live` | A class you're enrolled in goes live while the app is open | Two clear chimes | On |
| `error` | Payment failed, wrong OTP | Two notes down, soft | On |
| `soft` | Reminder set, saved | One quiet note | On |
| `tap`, `key`, `toggle`, `open`, `close` | UI ticks | Tiny clicks | **Off** (Profile > Sound > "Tap sounds") |

**Rules:**
- **Unlocking:** nothing plays before the first user gesture. Call `installAudioUnlock()` once in `main.tsx`, **only when `STAGE_ENABLED`**.
  - It listens on `pointerup`, `touchend`, `click` and `keydown`. On touch, `pointerdown` does not count as a gesture for audio.
  - It stays installed until audio is actually running.
  - It resumes audio when the app returns from background or an iOS interruption.
- **iOS:** set `navigator.audioSession.type = "ambient"` where it exists (already in `sound.ts`). Sounds then respect the silent switch and never stop the learner's music.
- **Video:** silent while any video or recording plays. Each player holds a suppression while it plays: `useEffect(() => (playing ? suppressSounds() : undefined), [playing])`. This goes in `ChapterMediaPlayer` (the app's own `<video>`), `VdoCipherPlayer` and `RecordingPlayer`. It is counted, so two players can't un-mute each other.
- **The switch:** one "Sound" switch in Profile controls all of it (stored in `lu.sound`), with a sub-switch "Tap sounds" (`lu.sound.ticks`).
- **Volume:** master 0.75 through a gentle compressor. Moment sounds peak around -18 dBFS, and UI ticks are much quieter.
- **Notifications:** push notifications use the OS sound. Do not ship custom notification audio in this pass.

---

## 10. Haptics

Keep `src/lib/haptics.ts` and its doctrine (`tapTick`, `confirm(ok)`, `celebrate`). Stage adds sync with sound and animation:

| Moment | Haptic |
|---|---|
| Any button or tab (existing) | `tapTick()` |
| Intro nodes 1 to 3, sign-in nodes 1 to 3 | `hapticImpact("light")` on each note |
| Intro node 4, sign-in node 4 | `hapticImpact("medium")` |
| Payment success, application sent | `confirm(true)` with `success` sound |
| Payment failed, wrong OTP | `confirm(false)` with `error` sound |
| Lesson or course complete | `celebrate()` with `complete` sound |
| Class goes live (app open) | `hapticNotification("warning")` once, with the `live` sound |

Fire haptics from the same timer as the sound (the `onNode` callback in `LevelUpMark`), never from animation-complete callbacks, so they never drift.

---

## 11. Voice and copy

Human, direct, specific. Say what happens and when.

| Do | Don't |
|---|---|
| "Join opens at 7:15 PM" | "Get ready for an amazing session!" |
| "Pick up where you left off" | "Continue your learning journey" |
| "Watch the recording" | "Relive the magic" |
| "Nothing due this week." | "You're all caught up! 🎉" |
| "We couldn't take the payment. Your card wasn't charged. Try again or use UPI." | "Oops! Something went wrong." |
| "Welcome back" / "Arjun" | "Welcome back to your transformative journey" |

**Rules:**
- No em dashes. Use a comma, a colon or a full stop.
- None of these words: elevate, unleash, unlock, delve, seamless, journey, transformative, empower, supercharge.
- **Never** use "level up" or "levelling up" as wordplay. The company is LevelUp, and the pun reads as cringe.
- Numbers as numerals ("4 of 15", "12 weeks"). Times as "7:30 PM". Dates as "Sat, 24 Oct".
- Sentence case. Buttons are verbs ("Join class", "Pay ₹1,499", "Watch free lesson").
- Mentor names are always real, and quotes from real mentors appear only if they actually said them.

---

## 12. Applying Stage to the real app

**What the prototype had that is NOT to be built:** Reel, Proof, pods, verdicts, the ledger, "The Cut", taste reels, "Prep notes" and "Add to calendar" actions (unless the data already exists), invented learner names, and scores. The prototype showed the brand on made-up flows. Carry the brand to the flows this app actually has.

### 12.1 Route by route

| Route / surface | What Stage changes | Keep as is |
|---|---|---|
| Native splash, `#boot-splash`, manifest | **Nothing until S5.** The splash colour `#0a0a0a` lives in seven places: `index.html` (three), the manifest, `capacitor.config.ts` (two), Android `colors.xml` and the iOS `LaunchScreen.storyboard`. None of them can follow a runtime flag, and `#0a0a0a` against `#0c0d0f` is invisible in practice. In S5, once Stage is the only look, move all seven to `#0c0d0f` in lockstep (Tier 1). | Hide timing (240ms), failsafe, breathe loop |
| App start (`main.tsx`, `App.tsx`) | `initAppearance()` before render. When `STAGE_ENABLED`: `installAudioUnlock()`, then `pickIntroMode()` and `BrandIntro` above the routes | Routing, auth, deep links (never show the intro for them) |
| `/login` (phone OTP) | Stage type, filled 52px inputs, Ember "Send code". After a correct OTP: the `SignInMoment` overlay | MSG91 flow, `otpSuccess` digit condense |
| `/onboarding` (profile, crafts) | Crafts are **picture tiles**: artwork, scrim, label in the display face. Selected = a 3px `brand-line` inset ring plus a slight image brighten. One primary button at the bottom | Steps, data |
| `/home` | The order is: greeting (H1, eyebrow with the date) → next-thing card (7.6) → Pick up where you left off → This week (7.7) → catalogue. **Enrolled**: the card is the next session. **Applicant**: the card is the next step. **New**: no card; artwork leads, then "Watch a free lesson". Remove the serif greeting | Data sources, `ApplicantStageCard` logic, catalogue search |
| Catalogue (`CatalogSection`, `CatalogCard`) | Tier chips (7.2), poster cards on `ArtworkImage` with correct ratios, format labels as words, prices in the display face | Filtering, search |
| `/learn` | Segmented control (7.3). Enrolled cards lead with progress (7.9). Empty = the line draws, plus the catalogue below | Tabs, data |
| `/courses/:id` | Header artwork plus scrim, title H1, facts as words. Curriculum rows (7.8), locked rows as in 7.8, primary "Continue" or "Enrol" in Ember | `hasAccess`, `make_free`, locks |
| `/chapters/:id` (player) | The player area is pure black. Accent only on the scrubber, the playing row and "Next lesson". Completion: the line draws, `complete` sound, `celebrate()`. No confetti. `suppressSounds()` in `ChapterMediaPlayer` while playing | HLS/VdoCipher, gestures, `UpNextList`, notes, Q&A |
| Rooms (`/room/:slug/*`) | Masthead may use the room's own accent glow (4.6). The week rail: current week on `brand`, others `surface-2`. Session slots follow the next-thing card states. `DoorsOpenCountdown` uses the countdown type | Room lifecycle, modules, flags |
| `/p/:slug` (sales page) | Display type hero, poster art leads, one Ember CTA, a sticky pay bar (`surface` plus Ember button) that springs in after the hero, prices tabular | Content, pricing logic, the native Reader rule (`ContinueOnWebCTA`, restyled as secondary) |
| `/checkout/:id` | One Ember "Pay ₹X". Loading = `LevelUpLoader` in the button. Success (`checkout/SuccessMoment.tsx`): the line draws, `success` sound plus `confirm(true)`, and no `ChampagneDust` under Stage | Razorpay flow, staged payments, coupons. **Razorpay colour:** `RAZORPAY_THEME_COLOR` in `lib/brand.ts` is a constant today. Make it a getter (`#f0561a` for Ember, `#0f1216` for Mono, today's value when the flag is off). This is payments, so it is Tier 1 |
| `/thank-you/:id` | The line draws (large), "You're in." H1, the next step as the next-thing card | Order logic |
| `/profile` | New **Appearance** section: Accent (Ember / Mono), Theme (System / Dark / Light, shown only once light mode ships), Sound (on/off), Tap sounds (off by default), Haptics | Account hub, invoices, danger zone |
| Notifications (bell) | Unread dot = 8px `brand-line`. A live-class notification row uses the LIVE pill | Data, preferences |
| Desktop sidebar | `bg`; active item = `brand-text` with a `surface-2` fill | Structure |
| Admin (`/admin/*`) | **Not in scope.** It inherits tokens through shadcn variables; fix only what becomes unreadable | Everything |

### 12.2 Retiring the old system (legacy token map)

`tokens/stage.css` aliases the old names so everything renders on-brand the moment the flag is on. Then each call site is migrated and the alias is deleted (S5).

| Old | Under Stage (alias) | Migrate call sites to |
|---|---|---|
| `--cream`, `text-cream`, `bg-cream` | `foreground` | `text-foreground`; `bg-cream` pills become `bg-surface-2` |
| `--cream-text`, `text-cream-dark` | `background` | Remove, use the component's own foreground |
| `--champagne-from/to`, `.btn-champagne`, `variant="champagne"` | `brand` (flat) | `Button` default variant |
| `--gold` (stars, hearts, PROGRAM badge, rating bars) | `foreground` (neutral, never the accent) | `text-foreground` / `fill-foreground` |
| `shadow-glow-gold`, `shadow-glow-cream` | No call sites today | Nothing: Stage has no glows. The one real glow, the champagne button's `shadow-[...]`, goes away with its Stage variant map (7.1) |
| `--accent-crimson`, `--accent-crimson-text` (today's LIVE markers) | `live`, `live-text` | `bg-live`, `text-live-text` |
| `--accent-indigo`, `--accent-violet`, `--accent-violet-deep` (fills) | `surface-3` | Format labels as words (7.5) |
| `--accent-indigo-text` | `muted-foreground` | `text-muted-foreground` |
| `--accent-emerald` | `success` | `text-success-text` |
| `--accent-amber` | `warning` | `bg-warning`, `text-warning-text` |
| `--avatar-blue` | `surface-3` | Avatars per 7.12 |
| Instrument Serif (`font-serif`, `.font-serif-italic`) | Display face, upright | Display or H2 styles |
| `.grain` | Hidden | Remove the class |
| `surface-card` border | Filled `surface-2`, no border | Card per 7.5 |
| Sonner `theme="dark"` | Unchanged in dark | Follow the resolved theme once light mode ships |

---

## 13. Implementation plan

Six stage phases, **S0 to S5**. Each is a separate PR, or a small set of PRs, and ships behind `VITE_BRAND_STAGE` under the flag-off parity rule (section 0, item 3). Write a short brief per phase in `design/stage/briefs/sN.md` and branch as `design/stage-sN`, so nothing collides with the earlier `phase-0` to `phase-6` work.

Run the repo's own loop, the way `ORCHESTRATION.md` says to invoke it (by `scriptPath`): design-phase-build, then design-qa-gate, then design-fix-sprint. For Tier 1 items, add the bugfix-council, cross-platform verification and a staged rollout. The gate bar is **no new failures** compared with `main` (section 0, item 5).

### S0: Foundation, zero visible change (Tier 1)
- Copy this pack into `design/stage/`.
- Register `VITE_BRAND_STAGE` and `VITE_BRAND_LIGHT` in `src/lib/flags.ts` (default `false`).
- Add the font files to `public/fonts/` with `@font-face` blocks, including the ₹ check from section 5. Preloads go through the flag-gated `transformIndexHtml` plugin.
- Import `tokens/stage.css` after `src/index.css` (from `main.tsx`), and merge `tokens/tailwind.stage.ts` into `tailwind.config.ts`.
- Add the reference code:
  - `src/lib/brand-moments.ts`, `sound.ts`, `appearance.ts` and `intro.ts`;
  - `src/components/brand/*`, including `mark-geometry.ts`;
  - the smoke test, in `src/components/brand/__tests__/`.
- Call `initAppearance()` in `main.tsx`. It only sets attributes when the flag is on.
- **Done when:**
  - with the flag **off**, a screenshot diff of Home, Learn, CourseDetail, the player, Login and Checkout at 360×740 shows no change, and the network log shows no new requests;
  - `StudentLayout.nav.test.tsx` still passes byte-identical;
  - the brand smoke test passes;
  - `release:gate` has no new failures.

### S1: Tokens on (Tier 1 for the flip, Tier 2 per component)
- Turn the flag on in a Vercel **preview** only (or with the localStorage override).
- Fix what reads wrong, each change flag-scoped:
  - `button.tsx` (the Stage variant map, section 7.1);
  - the switch;
  - tabs and the segmented control;
  - the tab bar;
  - chips;
  - `surface-card`;
  - headings;
  - badge variants (format labels);
  - `RoomThemeProvider`, the `RoomMasthead` glow, and the decorative `room-accent` type in `RoomMasthead`, `RosterGrid` and `MentorCard` (section 4.6).
- The Razorpay colour getter (Tier 1, payments).
- **Done when:** every learner route at 360×740 passes section 3, in Ember and Mono, with no contrast failure beyond the documented white-on-Ember and white-on-live exception.

### S2: Signature components (Tier 2)
- `NextUpCard` (7.6) on the real session states, and the week strip (7.7).
- Format labels, and poster cards on `ArtworkImage` with the branded placeholder.
- Empty states with the drawing line, and `LevelUpLoader` in the pay, verify and join buttons.
- Under Stage, `Confetti` and `SuccessMoment`'s `ChampagneDust` are replaced by the drawing line.
- **Done when:** Home has at most one accent block in every state (applicant, enrolled before / live / after, new learner).

### S3: Brand moments (Tier 1: app shell, auth)
- `pickIntroMode()` (after the cache restore, section 8.3) and `BrandIntro` (first and return), wired after the splash hides.
- `SignInMoment` after a correct OTP in Login, Signup and ClaimApplication. Navigation moves to `onReveal` when the flag is on, and `Login.postVerifyNav.test.tsx` gets a flag-on case.
- The sound engine: flag-gated unlock, `suppressSounds()` in the three players, and haptics on the same cues.
- **Done when:**
  - the intro never shows on a deep link or to a signed-in learner;
  - Home is visible within 1s of a cold start (the return beat is finished by then, and absent when Home is cached);
  - the sign-in moment is at most 3.5s from the last digit and skippable after 1s;
  - reduced motion gives the static paths;
  - 60fps on the mid-range Android test device.

### S4: Appearance and light mode (Tier 1 for the theme switch)
- Profile > Appearance: Ember / Mono, Sound, Tap sounds, Haptics.
- Light mode behind `VITE_BRAND_LIGHT`, with:
  - the Theme choice (System / Dark / Light);
  - status bar sync and Sonner following the theme;
  - the `shadow-design-*` ladder as CSS variables with a light set.
- Screenshot every learner route in all four combinations.
- **Done when:** no hard-coded dark colours remain in learner routes (grep for `#0`, `bg-black`, `text-white` outside artwork overlays).

### S5: Make Stage the only look (Tier 1 for the splash, Tier 2 for the rest)
- Migrate call sites off the legacy aliases (12.2). Delete each alias and bridge rule when unused, and remove the legacy variant maps and the `champagne` name.
- Move the splash colour to `#0c0d0f` in all seven places in lockstep, and regenerate the native splash images to match.
- Remove the Inter, Instrument Serif and JetBrains Mono files once nothing uses them.
- Delete the `VITE_BRAND_STAGE` flag once Stage has been at 100% for two weeks with no rollback.

### Rollout
Web preview → Android internal track → Android production at 10 to 20% (`userFraction`) → iOS TestFlight → Phased Release → 100%. Watch Sentry and support messages for 48 hours at each step.

---

## 14. Acceptance checklist

- [ ] Every learner screen has at most one filled accent block in view.
- [ ] The accent appears only in the places listed in 4.4.
- [ ] Red appears only for live (with LIVE and the pulse) and errors.
- [ ] No outlined cards, no icon-in-a-box, no grain, no serif, no gradient buttons, no glows in learner routes.
- [ ] Artwork is never tinted, letterboxed or left as a black void.
- [ ] All text passes 4.5:1, except the documented white-on-Ember and white-on-live exception (14px/600 minimum, full white).
- [ ] Ember and Mono both work on every learner route, with no mixed accents on a screen. Rooms use the brand accent.
- [ ] First-launch intro: signed-out first launch only, once per device, skippable at 0.9s, never on deep links, no network wait, silent if audio is locked.
- [ ] Home is visible within 1s of a cold start. No return beat when Home is cached.
- [ ] Sign-in moment: sonic logo and four haptics in sync, at most 3.5s from the last digit, skippable after 1s.
- [ ] No sound while video plays. Sound off really means silent. Tap sounds are off by default.
- [ ] Reduced motion: every moment has its static path, and nothing loops.
- [ ] 60fps on the mid-range Android device, and tap feedback under 100ms.
- [ ] 360×740 on Android WebView and iOS WKWebView, with font scale at 120%. Prices show a real ₹ in every face.
- [ ] Copy follows section 11 (no em dashes, no banned words, no "level up" wordplay).
- [ ] With the flag off, the app looks, renders and loads exactly as it did before S0.

---

## 15. Decisions still open (for LevelUp, not for Claude Code)

1. **Sound default.** This spec ships moment sounds **on** and tap sounds **off**. Flip `lu.sound`'s default in `sound.ts` if you'd rather start silent.
2. **When light mode ships** (S4). The tokens are ready; the work is auditing hard-coded colours.
3. **The first-launch montage.** It is on only if posters are cached. You can turn it off for an even calmer intro.
4. **Ember vs Ember Deep.** `#f0561a` is the decision. If an accessibility audit needs AA for all type on the fill, switch the one token to `#d44510`.
5. **Mono beyond a preference.** Mono could also become the default for a specific programme or event (a premium residency, say). The system supports it with one attribute.

---

## 16. What's in this pack

| Path | What it is |
|---|---|
| `README.md` | Start here, and the kickoff prompt to paste into Claude Code |
| `STAGE-BRAND-SPEC.md` | This document |
| `tokens/stage.css` | Drop-in tokens: dark / light × Ember / Mono, flag-scoped, legacy aliases, bridge rules. Generated |
| `tokens/stage.tokens.json` | The same values as hex, for tooling, docs, email or native |
| `tokens/tailwind.stage.ts` | What to merge into `tailwind.config.ts` |
| `reference/code/brand-moments.ts` | Timelines for the intro, the return beat, sign-in, the empty-state draw and the loader |
| `reference/code/sound.ts` | The sound engine and the sonic logo |
| `reference/code/appearance.ts` | Brand / theme / accent attributes, persistence, status bar, `useAppearance()` |
| `reference/code/LevelUpMark.tsx` | The animatable wordmark (the letters rise, the line draws) |
| `reference/code/mark-geometry.ts` | The wordmark's paths and the rising line's geometry, shared by the mark and the loader |
| `reference/code/intro.ts` | `pickIntroMode()`: who gets the first-launch intro, the return beat, or nothing |
| `reference/code/BrandIntro.tsx` | First-launch intro and return beat |
| `reference/code/SignInMoment.tsx` | The sign-in moment |
| `reference/code/LevelUpLoader.tsx` | The line as a loader |
| `reference/code/brand.smoke.test.tsx` | Vitest test for all of the above: 9 tests, passing in this repo |
| `reference/prototype/` | The prototype's original logo, sound and intro code, for behaviour reference only |
| `reference/screens/` | Screenshots of Ember and Mono, dark and light. **For feel, not for layout** |
| `tokens/build_tokens.py` | The generator for `tokens/stage.css` and `stage.tokens.json`. Edit here, rerun, commit both |

The live prototype, for feel only:
- Ember: `levelup-experience-lab.vercel.app/app.html#stage-ember`
- Mono: `levelup-experience-lab.vercel.app/app.html#stage-mono`
- All accents: `levelup-experience-lab.vercel.app/accents.html`
