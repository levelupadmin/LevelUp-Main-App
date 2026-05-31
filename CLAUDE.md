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
  TagMango Play listing ~2.05k installs in place). Currently shipped: **603 / 3.2.0**.
- **Service-account key (device-local, NOT in repo, never commit):**
  `~/Downloads/Tech & Workflows/levelups-tagmango-app-9a185d5fc88f.json`
  — client_email `fastlane-supply@levelups-tagmango-app.iam.gserviceaccount.com`,
  granted **Release to production** in Play Console (Users & permissions).
  Play developer account id `8183819487402535302`.
- **After commit, Google may run the production update through review** before it
  reaches devices — `status:"completed"` means *our* side is done; device rollout
  can lag hours→a day. That's normal; nothing more to click.
- Granting a *new* SA Play permission is an access-control change — that part is the
  user's to do in Play Console, not yours.

### Building the signed AAB

```bash
export JAVA_HOME="/Users/rahul/android-build/jdk/jdk-21.0.11+10/Contents/Home"   # no-sudo JDK 21 (device-local)
export ANDROID_HOME="$HOME/Library/Android/sdk"                                   # aapt2 at build-tools/36.0.0
export LEVELUP_KEYSTORE_PATH="/Users/rahul/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/keystores/upload-keystore.jks"
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
