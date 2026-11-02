# Stage brand handoff (LevelUp app)

Everything Claude Code needs to move the LevelUp learner app to the **Stage** brand:

- **Accent:** Ember `#f0561a` with white type as the default, and **Mono** as the alternative.
- **Themes:** dark first, light later.
- **Brand moments:** the logo animation, the sign-in moment with the sonic logo, sound and haptics.

The pack is written for the real codebase (`levelupadmin/levelup-main-app`), not for the prototype. It carries the design thinking and leaves the mock screens behind.

## How to use it

1. Copy this whole folder into the app repo as `design/stage/`.
2. Open Claude Code in the repo and paste the kickoff prompt below.
3. Review after each stage phase. The spec breaks the work into six (S0 to S5). Each ships on its own behind a flag, so nothing changes for students until you turn it on. To preview Stage on the live site before that, set `localStorage["VITE_BRAND_STAGE"] = "on"` in the browser and reload.

## Kickoff prompt (paste into Claude Code)

```
Read design/stage/STAGE-BRAND-SPEC.md end to end, then CLAUDE.md, ARCHITECTURE.md,
ORCHESTRATION.md and DESIGN-STRATEGY.md. We are moving the learner app to the Stage
brand: Ember #f0561a with white type as the default accent, Mono as the alternative,
dark first. The spec replaces the visual parts of DESIGN-STRATEGY.md and keeps its
motion, haptic and performance doctrine.

Do stage phase S0 only (spec section 13): register the flags, add the fonts,
design/stage/tokens/stage.css, the Tailwind merge from tokens/tailwind.stage.ts,
and the reference code from design/stage/reference/code into src/lib and
src/components/brand, all behind VITE_BRAND_STAGE, with zero visible change and
no new network requests while the flag is off (the flag-off parity rule,
section 0).

This touches Tier 1 surfaces: run the bugfix-council, compare flag-off screenshots
at 360x740 for Home, Learn, CourseDetail, the player, Login and Checkout, run the
brand smoke test, and run npm run release:gate (bar: no new failures versus main).
Stop after S0 and show me the diff summary and the screenshot comparison before
starting S1.

Do not copy screens from the prototype and do not build any feature the app does
not already have. When a screen is not covered, use the spec's principles
(section 2) and decision rules (section 3).
```

For later phases, say "Do stage phase S1 of design/stage/STAGE-BRAND-SPEC.md, same rules" (then S2, and so on).

## What's inside

| | |
|---|---|
| `STAGE-BRAND-SPEC.md` | The spec: principles, decision rules, colour, type, components, motion, the intro and sign-in timelines, sound, haptics, copy, route-by-route changes, the phased plan, the acceptance checklist |
| `tokens/` | Drop-in `stage.css`, the same values as JSON, the Tailwind merge, and the generator |
| `reference/code/` | Working TypeScript for the brand pieces: the animatable logo, intro, sign-in moment, loader, sound engine, appearance switch, timelines, plus a 9-test suite. They typecheck and lint clean against the app, and the tests pass |
| `reference/screens/` | Ember and Mono screenshots, plus frame strips of the intro and sign-in moment at exact times. For feel, not layout |
| `reference/prototype/` | The prototype's original logo, sound and intro code, for behaviour reference |

## Decided

- **Accent:** Ember `#f0561a`, white type on it. This is 3.5:1, below the AA standard for normal-size text: a known, accepted trade-off, with guardrails in spec 4.2. The fallback is Ember Deep `#d44510` if an audit ever needs 4.5:1.
- **Mono:** no accent colour (white on dark, black on light). Learners can pick it in Profile > Appearance.
- **Red:** only for live classes (and errors). A live class always shows the word LIVE and a pulse.
- **Type:** Bricolage Grotesque for headlines, Geist for everything else, Geist Mono for numbers. The serif, the grain and the champagne buttons are retired.
- **Sound:** moment sounds on (sign-in, success, completion, live, error). Tap sounds off.

The open questions for LevelUp are listed in spec section 15.
