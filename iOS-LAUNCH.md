# LevelUp Learning — iOS Launch Runbook

> Companion to `CLAUDE.md` (which covers Android/Play + Supabase). This is the iOS-specific,
> beginner-friendly runbook to get the app onto **TestFlight** and then the **App Store**.
> Written 2026-06-08 after Apple Developer Org enrolment was approved.

---

## 0. Where we are right now

**The app is a Capacitor WebView wrapper of the React web app.** Android is live on Play.
iOS was blocked only on Apple Developer enrolment — **now approved**.

| Item | Status |
|---|---|
| Apple Developer Org enrolment | ✅ Approved |
| iOS read-only compliance (no purchase/steering UI) | ✅ Done in code (Track 1) |
| iOS privacy permission strings (camera/photo/mic) | ✅ Added to `Info.plist` |
| In-app account deletion (Apple requires it) | ✅ Already existed (`delete-account`) |
| `npm run build && npx cap sync ios` | ✅ Green |
| Signing Team in Xcode | ⏳ **You** (needs your Apple ID) |
| App Store Connect app record + metadata | ⏳ **You** (guide below) |
| Reviewer demo login (phone-OTP friction) | ⏳ Needed before App Store / external beta |
| **DRM video playback on iOS** | ❌ **Won't work yet** — FairPlay cert + maybe native SDK (Track 2) |
| Monetization model | ▶️ Read-only at launch (0%); **Apple IAP @ 15% planned** as fast-follow (Track 3) |

**Three tracks:**
- **Track 1 — TestFlight now.** ✅ Code done. You do the Xcode + account steps below.
- **Track 2 — DRM / FairPlay.** Required before public App Store. Start the cert *today* (Apple lead time).
- **Track 3 — Apple IAP (15%).** Lets iOS users buy in-app. Fast-follow after TestFlight; no Track-1 rework.

> ⚠️ **What the first TestFlight build will and won't do:** the app, login, navigation,
> non-DRM video (HLS/Vimeo/YouTube chapters), cohorts, etc. will work. **VdoCipher (DRM)
> lessons will fail to play** — expected, and it *confirms* why we need Track 2. Test on a
> real iPhone (DRM never works in the simulator).

---

## 1. Apple Developer account — sign the agreements (you, ~10 min)

You're logged into <https://developer.apple.com> / <https://appstoreconnect.apple.com>.

- [ ] **App Store Connect → Business / Agreements, Tax, and Banking** → accept the latest
      **Apple Developer Program License Agreement** if it shows "pending."
- [ ] For the **read-only TestFlight launch you do NOT need the Paid Apps agreement, tax forms,
      or banking** — skip them for now. (You *will* need them later for Track 3 / IAP.)

---

## 2. Build & upload to TestFlight (you, in Xcode — I've prepped everything)

Prereqs: a Mac with **Xcode** (Mac App Store), signed into your Apple ID.

```bash
# From the repo root. Re-run these two any time the web app changes:
npm run build && npx cap sync ios
npx cap open ios            # opens ios/App/App.xcworkspace in Xcode
```

In Xcode:
- [ ] **App** target → **Signing & Capabilities** → tick **Automatically manage signing**, pick your **Team**.
      Bundle id `com.leveluplearning.app` registers automatically. (Apple's namespace is separate from Google's — iOS uses this clean id; Android stays `com.tagmango.leveluplearning`, which is immutable on Play.)
- [ ] **General** → **Version** `1.0.0`, **Build** `1`. 👉 **Bump Build by 1 every upload** (`1`,`2`,`3`…) or App Store Connect rejects a duplicate.
- [ ] Run destination → **Any iOS Device (arm64)**.
- [ ] **Product → Archive** (~2–5 min) → in the Organizer, **Distribute App → App Store Connect → Upload**.
- [ ] Wait ~5–15 min for processing (email arrives).

> Export compliance is pre-answered: `Info.plist` now sets `ITSAppUsesNonExemptEncryption = false`, so App Store Connect won't prompt for it on each upload (the app uses only standard HTTPS/TLS). The `BrowsePage` catalog price/discount badges are now `isNative()`-gated too, so no commerce pricing shows on iOS.

App Store Connect → your app → **TestFlight**:
- [ ] **Internal Testing** → add yourself + team (up to 100, **no Apple review**, instant).
- [ ] Install the **TestFlight** app on your iPhone → accept invite → install.
- [ ] **Open a VdoCipher lesson on the real device** → confirm it fails (Track-2 trigger) while a non-DRM chapter plays.

> Internal TestFlight needs **no** screenshots, demo account, or review — those are only for External / App Store (§3).

---

## 3. App Store Connect — metadata for public submission

(Do this when going public — *after* Track 2 makes DRM work. Internal TestFlight above needs none of it.)

Create the app: **My Apps → + → New App** (iOS, bundle id `com.leveluplearning.app`, primary language English (India), SKU e.g. `levelup-ios-001`).

- [ ] **Name** `LevelUp Learning`, **Subtitle** (≤30), **Category** Education.
- [ ] **Description**, **Keywords**, **Promotional text**, **What's New**.
- [ ] **Support URL** + **Marketing URL** (`https://leveluplearning.in`).
- [ ] **Privacy Policy URL** (required) — `https://app.leveluplearning.in/privacy` (confirm it resolves).
- [ ] **Screenshots** — ≥3 for **6.7-inch iPhone** (1290 × 2796). Tip: submit **iPhone-only** (Xcode → General → uncheck iPad) to skip iPad screenshots/review.
- [ ] **Age rating** questionnaire.
- [ ] **App Privacy** label — declare phone, email, name, usage/analytics with purposes. Be accurate.
- [ ] **Account deletion** — point to in-app Profile → Danger Zone → Delete Account (built) + `https://app.leveluplearning.in/delete-account`. ✅

**⚠️ Reviewer demo login (do not skip):** login is phone-OTP (MSG91); an Apple reviewer can't get your SMS and will reject for "can't sign in."
- [ ] Provide a working **demo account** in **App Review Information → Sign-In required**. Needs a small server change (a fixed review OTP for one test number, or an email-login path). **Flag me — I'll build the reviewer login.** Needed before External TestFlight / App Store, not internal.

---

## 4. Track 2 — DRM / FairPlay (start TODAY; self-serve on VdoCipher)

**Why:** the app plays VdoCipher via a web `<iframe>` (`src/components/VdoCipherPlayer.tsx`). FairPlay
DRM is required for iOS playback. VdoCipher's docs say DRM does **not** play inside a `WKWebView`
(you'd need their native iOS SDK) — but the **cert is required either way**, so get it first, then we
test on a real device to learn whether the WebView plays it or we build the native plugin.

VdoCipher screen: **Security → iOS DRM Config**. (Their page says *"you do not need to code anything"* —
that's true for the DRM **licensing**; it does **not** settle the WebView-vs-native-SDK question.)

### 4a. Generate keys + apply to Apple (you)
- [ ] On **Security → iOS DRM Config**, click **Create RSA keys** to generate the key pair / signing request.
- [ ] Apply at <https://developer.apple.com/contact/fps/> **as LevelUp** (the content owner — Apple won't
      approve agency/third-party requests on your behalf). You already have the Apple Developer account.
- [ ] Apple returns the **certificate (.cer)** + **ASK** (32-char). Keep your **private key (.pem)** + passphrase safe (device-local, never commit).

### 4b. Upload to VdoCipher — self-serve, no email, no code (you)
- [ ] Back on **Security → iOS DRM Config**: upload **.cer** + **.pem**, paste **ASK** + **passphrase** → **Save**.
      VdoCipher loads it into their license server — that's the whole integration on their side.
- [ ] **Ask the one open question** via **Continue to Support Portal** on that page:
      *"Will FairPlay DRM play inside a Capacitor / WKWebView iOS app, or do we need your native iOS SDK?"*
      Their answer (authoritative, account-specific) decides whether 4c is needed.

### 4c. Native SDK plugin — only if the WebView can't play DRM (me)
- [ ] If the WebView can't play it (likely, per VdoCipher docs), I build a small **Capacitor plugin** that
      swaps the iframe for VdoCipher's native iOS player on `isIOS()`, reusing the `get-vdocipher-otp` edge
      function. If it *can* play once the cert's live, we skip this. Confirm on the first real-device TestFlight build.

---

## 5. Track 3 — Monetization on iOS (decision: add Apple IAP @ 15%)

**Decision (2026-06-08):** launch **read-only (0% to Apple)** for TestFlight, then **add Apple In-App
Purchase at 15%** (App Store Small Business Program — iOS App Store revenue is well under $1M/yr) as a
fast-follow. This captures iOS-native buyers who'd never leave the app for the web. No Track-1 rework —
the read-only gating simply gets replaced by StoreKit buy buttons on iOS when IAP ships.

When we build it (me, after TestFlight):
- [ ] Enrol in the **App Store Small Business Program** (confirms 15%) + sign **Paid Apps agreement** + tax/banking.
- [ ] **StoreKit 2** products mapped to offerings. Note: one-time course unlocks map cleanly; **cohorts /
      application-fee multi-step flows (`ApplicationStatus`) are awkward under IAP and may stay web-only**.
- [ ] **Server-side receipt validation** → grant the *same* Supabase enrolment the Razorpay webhook grants,
      so iOS + web purchases converge to one entitlement.
- [ ] **Pricing**: set Apple price tiers (you'll likely raise iOS prices to offset the 15%). Per-platform
      prices are allowed; you just can't steer users off-platform to a cheaper price.

> Alternative considered: the **reader external-link entitlement** (0% if Apple approves a link-out to web
> checkout). Kept in reserve — we can pursue it instead of/alongside IAP if Apple approves.

---

## 6. Review-risk checklist (status)

| Apple guideline | Risk | Status |
|---|---|---|
| 3.1.1 / 3.1.3 anti-steering (no external "buy on web") | Blocker | ✅ Fixed — iOS shows passive copy |
| 5.1.1(v) in-app account deletion | Blocker | ✅ Already implemented |
| Privacy usage strings (camera/photo) | Reject | ✅ Added to Info.plist |
| Sign-in for reviewer (phone-OTP) | Reject | ⏳ §3 — reviewer demo login (ping me) |
| 4.2 minimum functionality (web wrapper) | Medium | 🟡 Has splash/status-bar/offline; acceptable. Optional: enable haptics. (Deep/universal links are Android-only — no iOS associated-domains entitlement; not required for TestFlight) |
| DRM video plays | Functional | ❌ Track 2 |

---

## 7. Quick command reference

```bash
npm run build && npx cap sync ios   # rebuild web + sync into the iOS project
npx cap open ios                    # open in Xcode → Team → bump Build → Archive → Upload
```

## Appendix — Track 1 code changes (2026-06-08)
- `src/components/ContinueOnWebCTA.tsx` — passive, link-free, price-free copy on `isIOS()`.
- `src/pages/ApplicationStatus.tsx` — "Pay Confirmation/Balance" buttons hidden on `isIOS()`.
- `ios/App/App/Info.plist` — added `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription`.
- (All other purchase surfaces were already `isNative()`-gated, which covers iOS.)
