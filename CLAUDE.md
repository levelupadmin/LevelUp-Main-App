# LevelUp Learning — Claude operating notes

This file is auto-loaded by Claude Code. Read the **Release & deploy capability**
section before assuming any ship step needs a human — most of it is scriptable
from this repo and has been used to push live builds.

---

## Release & deploy capability — YOU can publish this app yourself

**You are not blocked on a human for the actual publish.** This repo carries a
working, dependency-free pipeline that has already shipped builds to Google Play
Production and migrations/functions to the production Supabase project. When asked
to "release", "publish", "ship", or "deploy", drive these runbooks directly
(after the usual confirmation for irreversible prod actions).

### Android → Google Play (`scripts/play-publish.mjs`)

Pure Node stdlib (crypto JWT + fetch) against the Play Android Publisher API v3 —
**no fastlane, no Docker, no npm deps.** Reusable for every release.

```bash
# Always probe first on any new key/machine — verifies auth + app access, publishes NOTHING:
PLAY_SERVICE_ACCOUNT_JSON="<sa.json>" node scripts/play-publish.mjs --probe

# Read-only: inspect what's currently on a track (defaults: prod / com.tagmango.leveluplearning):
PLAY_SERVICE_ACCOUNT_JSON="<sa.json>" node scripts/play-publish.mjs --status

# Publish a signed AAB to production at 100% rollout (status "completed"):
PLAY_SERVICE_ACCOUNT_JSON="<sa.json>" \
PLAY_RELEASE_NOTES="• line one\n• line two" \
  node scripts/play-publish.mjs <path-to.aab>
# Optional flags: --package <id>  --track <internal|alpha|beta|production>
# Use --track internal first if you want to rehearse the pipeline safely.
```

- **App:** `com.tagmango.leveluplearning` (immutable appId; updates the existing
  TagMango Play listing ~2.05k installs in place). Currently shipped: **604 / 3.2.1**
  (shipped 2026-06-08 — the pre-launch hardening + Notify-me/Android-card/polish).
- **Service-account key (NOT in repo, never commit):** kept in the iCloud secrets
  vault next to the keystore so it survives a machine switch —
  `~/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/keystores/levelups-tagmango-app-931a478c992d.json`
  — client_email `fastlane-supply@levelups-tagmango-app.iam.gserviceaccount.com`,
  granted **Release to production** in Play Console (Users & permissions).
  Play developer account id `8183819487402535302`.
  NOTE: Google emits a SA key only once at creation. If it's ever missing locally,
  generate a NEW JSON key for this SA in Cloud Console (project
  `levelups-tagmango-app` → Service Accounts → fastlane-supply → Keys); the SA keeps
  its Play access. The old `~/Downloads/Tech & Workflows/…9a185d5fc88f.json` path is
  defunct (lost with the other laptop).
- **After commit, Google may run the production update through review** before it
  reaches devices — `status:"completed"` means *our* side is done; device rollout
  can lag hours→a day. That's normal; nothing more to click.
- Granting a *new* SA Play permission is an access-control change — that part is the
  user's to do in Play Console, not yours.

### Building the signed AAB

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"  # Homebrew JDK 21 on this Mac (old /Users/rahul/android-build path is defunct)
export ANDROID_HOME="$HOME/Library/Android/sdk"                                    # build-tools 36.1.0 / 37.0.0
export LEVELUP_KEYSTORE_PATH="/Users/rahulsrinivas/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/keystores/upload-keystore.jks"
export LEVELUP_KEYSTORE_PASSWORD="<from keystore README.md or 1Password — NEVER echo/commit>"
npm run build && npx cap sync android
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

- Signing config in `android/app/build.gradle` reads `LEVELUP_KEYSTORE_PATH` +
  `LEVELUP_KEYSTORE_PASSWORD`, keyAlias `upload`.
- **The keystore key in `LevelUp Core/keystores/` IS the correct Play upload key.**
  Google approved the upload-key reset ~2026-05-26. Ignore any stale
  README_KEYSTORE caveat saying otherwise.
- `minifyEnabled false` today. **Before the next build: enable R8 (`minifyEnabled
  true`) + run an emulator smoke test** (tracked as task #160).
- Bump `versionCode`/`versionName` in `android/app/build.gradle` before each build.

### iOS → TestFlight / App Store (headless, via App Store Connect API key)

Like Android, iOS builds + uploads run entirely from the terminal — no Xcode GUI,
no screen control. Requires the **full Xcode** installed (not just CLT) and the dev
account signed into Xcode once (Settings → Accounts). First TestFlight build of
v1 shipped 2026-06-09.

- **iOS bundle id = `com.leveluplearning.app`** — NOTE this DIFFERS from Android's
  immutable `com.tagmango.leveluplearning` (iOS is greenfield; divergence documented
  in `capacitor.config.ts`). Team ID `456W8MPQWH` (LevelUp Edu Private Limited).
  App Store Connect app id `6778137800`.
- **ASC API key (NOT in repo):** `~/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/keystores/AuthKey_73S9MAX725.p8`
  — Key ID `73S9MAX725`, Issuer ID `945f1837-a6db-4daf-943f-035c9bcbf6c0`, role Admin.
  Identifiers + path live in the gitignored `.env.ios.local`; the `.p8` stays in iCloud.
  Revoke/regenerate at App Store Connect → Users and Access → Integrations.

```bash
set -a && . ./.env.ios.local && set +a
export DEVELOPER_DIR=/Applications/Xcode-26.5.0.app/Contents/Developer   # full Xcode, not CLT
npm run build && npx cap sync ios                                        # bundle latest web app

# Archive UNSIGNED — sidesteps the "team has no registered devices" dev-profile wall:
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath /tmp/LevelUp.xcarchive \
  archive CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO

# Export App Store IPA — distribution cert + App Store profile minted via the API key:
xcodebuild -exportArchive -archivePath /tmp/LevelUp.xcarchive \
  -exportPath /tmp/LevelUp-export -exportOptionsPlist ios/ExportOptions-AppStore.plist \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

# Upload to TestFlight (altool wants the key under ~/.appstoreconnect/private_keys/):
mkdir -p ~/.appstoreconnect/private_keys
cp "$ASC_KEY_PATH" ~/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8
xcrun altool --upload-app -f /tmp/LevelUp-export/App.ipa -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
```

- **`scripts/asc-api.mjs`** — dependency-free App Store Connect API client (Node
  stdlib JWT + fetch). Subcommands: `list-apps | find-app <bundleId> | users |
  builds <appId> | list-devices | register-device "<name>" <udid>`. Sources
  `.env.ios.local`. Use `builds 6778137800` to poll processing (state VALID = ready).
- **Bump the Build number (CURRENT_PROJECT_VERSION) before every upload** — App Store
  Connect rejects a duplicate build for the same CFBundleShortVersionString.
- **A NEW app record is web-only** (Apple's API can't create one): App Store Connect
  → Apps → ＋ → New App. Already done for v1.
- **DRM:** VdoCipher (FairPlay) does not play in the WKWebView yet — known gap, needs
  the FairPlay cert + likely a native plugin (see `iOS-LAUNCH.md` Track 2).
- One-time human prereqs: full Xcode on macOS 26.2+ (Xcode 26.x needs Tahoe), the
  Apple ID sign-in in Xcode, the App Store Connect app record, and adding TestFlight
  testers. The account's Apple ID is a phone number but its ASC identity / tester
  email is `ceo@leveluplearning.in`.

### Supabase → production (`npx -y supabase@latest`)

CLI is **not** globally installed — always invoke via `npx -y supabase@latest`.
Auth via `SUPABASE_ACCESS_TOKEN` (set it from `SUPABASE_PAT` in `.env.supabase`).

```bash
export SUPABASE_ACCESS_TOKEN="$SUPABASE_PAT"
npx -y supabase@latest link --project-ref ivkvluezuiojovpotlyb   # ALWAYS link explicitly
npx -y supabase@latest migration list                            # confirm Local|Remote diff
npx -y supabase@latest db push                                   # applies ALL pending migrations
npx -y supabase@latest functions deploy <name>                   # server-side bundling; no Docker needed
```

- **PROD project ref = `ivkvluezuiojovpotlyb`** (confirmed via the live app's
  `VITE_SUPABASE_URL` and `.env.supabase` `SUPABASE_MAIN_APP_REF`).
- ⚠️ **`supabase/config.toml` `project_id = "twqagwleffjggoemzfqs"` is STALE/WRONG**
  — a third project, neither prod nor the Lighthouse project
  (`xfqsmlgvpzxbfkeqkroe`, which must NOT be targeted). **Never rely on the
  config.toml default; always `link --project-ref ivkvluezuiojovpotlyb` first.**
- Secrets live in `~/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/.env.supabase`.

---

## Secret-handling rules (non-negotiable)

- Never echo to stdout/logs, and never commit: keystore password, Supabase PAT/DB
  password, Play service-account private key, service-role keys.
- Reference secrets only as shell-var references in commands. Print only variable
  names, booleans, or non-secret identifiers (project refs/URLs are public; keys and
  passwords are not).
- Service-account JSON and keystore files are device-local and `.gitignore`'d /
  outside the repo — keep them that way.

## Stack & environment quick facts

- Vite + React 18 + TypeScript + shadcn/ui + Tailwind + Supabase + Razorpay +
  VdoCipher (DRM) + Capacitor (Android + iOS) + MSG91 phone-OTP.
- iOS shell builds but is blocked on Apple Developer Org enrollment; all buy-CTA
  gates use `isNative()` so iOS is read-only (Apple Reader Rule).
- `gh` is logged in as `levelupadmin` (HTTPS PAT). Default branch `main`.
- Detailed cross-session context lives in Claude memory (`project_levelup.md`) and
  iCloud `LevelUp Core/Cowork_Context_Handoff/`.
