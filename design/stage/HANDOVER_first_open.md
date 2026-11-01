# First open: build handoff

**For:** the Claude chat (or developer) working in the LevelUp main app repo, `levelupadmin/levelup-main-app` (Vite, React 18, TypeScript, Tailwind, shadcn/ui, framer-motion, Capacitor, Supabase).
**From:** the Experience Lab chat that built the prototype, 4 Oct 2026.
**Goal:** a person who has never signed in opens the app. They see the logo intro over LevelUp's own photos, then a wall of real photos with one line and one button, then phone number, code, and they are in. Build that.

**See it:** https://levelup-experience-lab.vercel.app/start.html. Tap the app icon with sound on. `?r=welcome` opens straight on the wall. Press `R` to play it again. A copy that runs offline is in `prototype/`.

---

## 0. Read this first

1. **This sits on top of the Stage brand pack** (`stage-brand-handoff/` in this zip, `design/stage/` in the repo). Stage already specifies the first-launch intro (`BrandIntro`, section 8.2), the returning-user beat (8.3), the sign-in moment (`SignInMoment`, 8.4), sound, haptics, tokens and the `/login` styling. **All of that stands.** This file adds three things:
   - the 12 real photos for the intro montage;
   - the signed-out **wall** screen;
   - the words.
   Where the two overlap: Stage wins on how things move, sound and feel. This file wins on the pictures, the wall and the copy.
2. **The prototype is a spec for behaviour and copy, not code to paste.** It is vanilla JS with fake state. Build with the app's components and the Stage reference code (`stage-brand-handoff/reference/code/`).
3. **The repo's rules win:** `CLAUDE.md` (risk tiers), `ARCHITECTURE.md`, `ORCHESTRATION.md`, `DESIGN-STRATEGY.md`. The app shell and auth are **Tier 1**.
4. **Everything ships behind `VITE_BRAND_STAGE`** with Stage's flag-off parity rule. With the flag off, the app opens exactly as it does today.
5. **Keep the existing sign-in.** `/login` is phone OTP through MSG91 (`OtpEntryStep`, `otpSuccess`). Restyle it, do not replace it.
6. **Ask before anything that reaches real users:** merging to `main`, migrations, edge functions, flags real users can see.
7. **Real pictures only.** Every photo here is LevelUp's own, from leveluplearning.in or forgebylevelup.com. Do not add stock or AI-generated images to this flow.

---

## 1. The flow

```
Cold start, signed out, first time on this device
  -> native splash hands over to BrandIntro mode="first" (Stage 8.2), montage = the 12 photos
  -> THE WALL: one line, one sub-line, Continue
       Continue            -> /login, phone step (the wall stays above the form)
       Use email           -> the email step, if /login has one
       Look around first   -> guest browsing, only if the app already allows it
  -> code step -> correct code -> SignInMoment (Stage 8.4)
  -> onReveal: /onboarding for new people, Home for returning ones (whatever the app does today)
```

| Who opens the app | What they get |
|---|---|
| Signed out, first time on this device | Intro with the photo montage, then the wall |
| Signed out, seen the intro before | The wall, no intro |
| Signed in | Stage 8.3: the return beat or nothing, then Home. Never the wall. |
| Deep link or notification while signed out (a sales page, checkout, `/login` itself) | No intro and no wall. Go where the link points, as today. |
| Reduced motion | Stage's static mark for 0.7 s. The wall does not drift. |

Who gets the intro is `pickIntroMode()` in Stage's `reference/code/intro.ts` (`lu.introSeen`). Do not invent a second flag.

**Where the wall lives:** find the place a signed-out person lands on a plain cold start today. That is the guard or redirect that sends them to `/login`. Show the wall there. Continue opens the phone step. Any link straight to `/login` keeps going straight to the phone step, without the wall, so checkout and sales-page sign-ins don't change. Report what you find before choosing between a wall step inside `/login` and a separate signed-out route.

---

## 2. The intro: Stage's `BrandIntro`, with LevelUp's own photos

Use `BrandIntro mode="first"` exactly as Stage 8.2 specifies, with its timings, Skip, reduced motion and safety timer. One change:

**The montage.** Stage says to show the montage only when at least 6 catalogue posters are already cached. Instead, pass the 12 photos in `photos/app-ready/intro/` as the `posters` prop. Import them so they ship **inside the app bundle**. They are always there and the intro never waits for the network, so the montage always plays. About 600 KB as JPG; convert to WebP if the build supports it.

Grid order (3 across, 4 down). The files are numbered 01 to 12 in this order:

| | Left | Middle | Right |
|---|---|---|---|
| Row 1 | Lokesh Kanagaraj | Forge Filmmaking, camera | Ravi Basrur |
| Row 2 | Forge Writing Retreat | Forge, camera work | G Venket Ram |
| Row 3 | Anthony Gonsalvez | Forge Creator Residency, lighting | Forge Filmmaking, lighting |
| Row 4 | Forge, lighting | Nelson Dilipkumar | Karthik Subbaraj |

**Sound:** as Stage says, the intro is silent if audio is locked, and there is no "tap to begin" gate. The prototype plays the notes only because tapping its fake icon unlocks audio. The sonic logo's first real play is the sign-in moment.

**The app icon zoom** in the prototype only simulates the phone. On a device, the OS opens the app, and the Capacitor splash hands over to the intro (Stage 8.2).

`reference/screens/02` to `04` show the intro at 0.6 s, 1.5 s and 2.4 s.

---

## 3. The wall (new screen)

This is what a signed-out person sees before signing in. It replaces the old signed-out welcome in Stage's `reference/screens/*-welcome.jpg`. Always dark, in light and dark mode, because it is photography. Light status bar. Only under `VITE_BRAND_STAGE`.

**Layout**
- Full-screen wall of 34 photos in 3 columns: 8 px gaps, 8 px side padding, 12 px corners. Each photo keeps its own aspect ratio (`photos/photos.json`).
- Photo `k` goes in column `k mod 3`, top to bottom, in the order of `photos.json`.
- **Drift:** each column renders its list twice and moves from `translateY(0)` to `translateY(calc(-50% - 4px))`, linear, infinite, so it loops with no seam:
  - left: up, 80 s per loop;
  - middle: down (reverse), 100 s;
  - right: up, 70 s, starting 90 px higher.
- The wall stops 26% above the bottom. Two gradients sit over it:
  - top: `rgba(11,12,14,.86)` at 0%, `.5` at 9%, clear at 18%, so the logo and status bar read;
  - bottom: clear at 30%, `rgba(11,12,14,.74)` at 46%, solid `#0b0c0e` at 60%.
- Top left: the LevelUp logo in white (Stage `LevelUpMark`). Nothing top right.
- Bottom block, 20 px side padding, 14 px gaps:
  1. headline, two lines, display face, 42 px, line height 0.98;
  2. sub-line, 15.5 px, line height 1.45, white at 80%;
  3. **Continue**: the one accent block on the screen, full width, Stage primary button;
  4. "Use email" and "Look around first" side by side with a small dot between, white at 86%. Drop either one if `/login` has no email step or the app has no guest browsing. Do not build those to fill the row.
  5. legal line, 11 px, white at 50%, centred, with Terms and Privacy Policy as links.
- After the intro hands over, the headline, sub-line, button and links rise in one after another: 14 px up and fade, 38 ms apart.

**Behaviour**
- Tap a photo: a toast shows where it was taken, for example "Lighting workshop · Forge Creator Residency". The captions are in `photos.json`. The caption is also the photo's accessible label.
- Continue goes straight to the phone step. There is no field picker and no product list on this screen.
- Pause the drift when the app is in the background or the screen is not visible. No drift at all under reduced motion.
- Mono: the Continue button is white with near-black type, on light mode too, because the wall is always dark.

**Photos:** `photos/app-ready/wall/` has the 34 at 360 px wide, 900 KB in total, ready to bundle. A tile is about 119 pt wide, so 360 px covers 3x. Bundle them, or serve them from the app's own storage with the top three of each column preloaded. Do not make the first screen wait on a slow network. `photos/originals/` has the best sizes we have, if you want to make your own.

---

## 4. Phone and code: `/login`, restyled

Stage's `/login` rules apply: Stage type, filled 52 px inputs, Ember "Send code". This file adds the wall header and the words.

**Phone step**
- The wall carries on at the top, 300 px tall with 28 px rounded bottom corners. It sits in the same place it just was (same columns, same drift position), so the photos above the form are the ones that were on the wall a second ago. Gradient top and bottom. Round back button top left (40 px, dark glass) back to the wall.
- Eyebrow "Sign in or join", title "What's your number?", the line below, "+91" prefix field formatted `98765 43210`, then **Send code**. It is disabled until 10 digits, then reads "Sending" with Stage's `LevelUpLoader`.
- **WhatsApp or SMS:** the prototype has a toggle and says the code comes on WhatsApp. Check whether the MSG91 setup can send the OTP on WhatsApp.
  - If it can: keep the toggle, WhatsApp first.
  - If it can't: no toggle, and the line reads "We'll send a 6-digit code by SMS. No password." Tell the founder. Do not add a provider without asking.
- If `/login` arrives from a deep link (no wall before it), show the phone step without the photo header, Stage-styled.

**Code step**
- Wall header 240 px. Eyebrow "Check WhatsApp" (or "Check your messages" for SMS). Title "Enter the code". "Sent to **+91 …** on WhatsApp." with "Change" back to the phone step.
- Six boxes, as `OtpEntryStep` does today: one-time-code autofill, paste fills all six, backspace steps back, auto-verify on the sixth digit, "Resend in 0:30" then "Resend code".
- Wrong code: Stage 8.4 (error sound, error haptic, 3-step nudge on the row, no overlay), the boxes clear, and "That code didn't match. Try again, or get a new one."
- Right code: the existing `otpSuccess` condense, then `SignInMoment`.

**Sign-in moment:** Stage 8.4 as written. For someone brand new whose name we don't have yet, the eyebrow is "Welcome to LevelUp" and the title is "You're in." Navigate in `onReveal`.

---

## 5. Copy, word for word

| Where | Text |
|---|---|
| Wall headline | Don't just watch. / Make the work. (two lines) |
| Wall sub-line | Learn from the people behind India's films and music. Make your own work with mentors who review it. Then do it for real, on set. |
| Primary button | Continue |
| Secondary | Use email · Look around first |
| Legal | New or returning, it is the same step. By continuing you agree to our Terms and Privacy Policy. |
| Look around toast | Guests can look around everything. Sign in when you want to save, buy or join. |
| Phone eyebrow | Sign in or join |
| Phone title | What's your number? |
| Phone line | We'll send a 6-digit code on WhatsApp. No password. (SMS version in section 4) |
| Phone error | Enter a 10-digit mobile number. |
| Email title, line, error | What's your email? / We'll email you a 6-digit code. No password. / That email looks incomplete. |
| Code eyebrow, title | Check WhatsApp / Enter the code |
| Code error | That code didn't match. Try again, or get a new one. |
| OTP message | LevelUp Learning: 123456 is your sign-in code. It expires in 10 minutes. Don't share it. |
| Sign-in moment, new person | Welcome to LevelUp / You're in. |

The sub-line covers the three ways LevelUp teaches without naming them:
- learn from the people (masterclasses);
- make your own work with mentors who review it (live cohorts);
- do it for real, on set (the Forge).

Other headlines the founder can swap in, with the same sub-line: "Watching won't make you good. Making will." and "You learn a craft by making it."

**Copy rules:**
- No em dashes.
- None of these words: elevate, unleash, unlock, delve, seamless, transformative.
- No "level up" wordplay.
- No student numbers on these screens, because the two websites quote different ones.

---

## 6. Accessibility and performance

- Each wall photo is a button labelled with its caption. The wall is not needed to sign in, so screen readers can skip it.
- The headline is the screen's `h1`. The text sits on the solid end of the gradient, so contrast holds whatever drifts behind it.
- Tap targets are at least 44 px. The OTP group is labelled "6-digit code" and each box "Digit 1" to "Digit 6".
- Animate with `transform` only. No layout work per frame. Pause when hidden.
- Check at 360 × 740 (Stage's screenshot size) and 390 × 844.

---

## 7. Done when

- [ ] Flag off: launch and `/login` look and behave exactly as today. Stage's parity checks pass.
- [ ] First cold start, signed out: the intro plays with the 12 bundled photos and never waits for the network. Skip works. It is silent if audio is locked.
- [ ] Second cold start, signed out: no intro, the wall.
- [ ] Signed in: never the wall. Deep links: never the intro or the wall.
- [ ] The wall drifts at 80 s, 100 s reverse and 70 s, loops with no jump, and pauses when hidden. Tapping a photo shows its caption.
- [ ] The wall shows the exact headline, sub-line, Continue and legal line. Use email and Look around first appear only if they work. There are no field chips, no product list and no numbers.
- [ ] Continue opens the phone step with the wall above it, in the same place.
- [ ] WhatsApp or SMS is decided with the founder, and the copy matches what actually gets sent.
- [ ] The code step works: autofill, paste, backspace, auto-verify, resend, the wrong-code state.
- [ ] `SignInMoment` plays, then onboarding or Home, within Stage's 3.5 s limit.
- [ ] Ember and Mono, light and dark, reduced motion, 360 × 740 and 390 × 844.
- [ ] No picture in this flow that is not from `photos/`.

---

## 8. What is in this zip

| Path | What it is |
|---|---|
| `START-HERE.md` | Where to begin, and the prompt to paste |
| `HANDOVER_first_open.md` | This file |
| `photos/app-ready/intro/` | The 12 intro photos, numbered in grid order, up to 640 px wide, ready to bundle |
| `photos/app-ready/wall/` | The 34 wall photos, 360 px wide, ready to bundle |
| `photos/originals/` | The same 34 at the best size we have (site photos up to 1080 px wide; masterclass stills 600 and 900 px) |
| `photos/photos.json` | For every photo: caption, aspect ratio, column and order on the wall, intro position, and where it came from |
| `reference/screens/` | 18 screenshots: icon, intro at three moments, wall, photo caption, phone, code, WhatsApp notification, wrong code, sign-in moment, email, Mono, light, small phone |
| `prototype/` | The prototype, runnable offline. From that folder run `python3 -m http.server 8000`, then open `http://localhost:8000/start.html` (fonts need internet) |
| `prototype-src/intro.css` | The intro and sign-in moment CSS, cut out of the prototype for reference |
| `stage-brand-handoff/` | The Stage brand pack. Skip it if `design/stage/` is already in the repo. |
