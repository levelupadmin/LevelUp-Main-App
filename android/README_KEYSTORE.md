# Android Release Keystore

> **The keystore already exists.** This file documents how to use it, not
> how to generate it. If you need the actual generation history, see the
> README inside the keystore folder itself.

## Where the keystore lives

```
~/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/keystores/
  upload-keystore.jks      ← signs every Android release
  upload_certificate.pem   ← public cert uploaded to Play Console once
  README.md                ← password + metadata
```

The password is also in:
- A "🔐 LevelUp Android upload keystore" email in `ceo@leveluplearning.in`'s
  inbox (search Gmail for that subject)
- (Recommended) 1Password / Apple Keychain as a Secure Note

## Which Play Console listing this signs

| Field | Value |
|---|---|
| Package name | `com.tagmango.leveluplearning` |
| Play Console listing | https://play.google.com/store/apps/details?id=com.tagmango.leveluplearning |
| Developer account | LevelUp Learning (id `8183819487402535302`) |
| Install base when keystore was minted | ~2.05k installs, 464 MAU |
| Last production release before this rewrite | 26 Dec 2023 (TagMango white-label build) |

The current Play Console upload-key fingerprint shows the OLD upload key
(TagMango's). Until Google approves our "Request upload key reset" form,
any AAB uploaded to this listing must still be signed with TagMango's
key. Once Google approves (24–48h after submitting `upload_certificate.pem`)
this keystore takes over.

## Building a signed AAB

Two env vars wire the keystore into Gradle (see `android/app/build.gradle`):

```bash
export LEVELUP_KEYSTORE_PATH="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/keystores/upload-keystore.jks"
export LEVELUP_KEYSTORE_PASSWORD="<from the keystore README or your password manager>"
```

Then from the repo root:

```bash
bun run build          # builds the React app into dist/
npx cap sync android   # copies dist/ into android/app/src/main/assets
cd android
./gradlew bundleRelease
```

The signed AAB lands at:

```
android/app/build/outputs/bundle/release/app-release.aab
```

Upload that to Play Console → Production track.

## Play App Signing

The listing is already enrolled in Play App Signing — Google holds the
master key (SHA-256 `A0:05:04:9B:A8:6B:EB:03:52:B6:AE:E6:45:1E:8A:24:E8:DB:4F:6A:66:60:74:FB:D8:F2:1D:30:EC:70:88:29`).
Our keystore is the *upload* key only, which is recoverable via
`App signing → Request upload key reset` if ever lost.
