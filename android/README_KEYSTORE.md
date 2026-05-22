# Android Release Keystore

> **Do NOT commit this keystore or its passwords.** Store the `.jks` file and
> the credentials in your password manager (1Password / Bitwarden) and back
> them up. If you lose this keystore you cannot ship app updates — Google
> Play tightly couples the upload-key to your package name.

The LevelUp Learning Android shell uses the package id `in.leveluplearning.lms`.
This README documents the one-time keystore generation step. Run it on your
own machine — do not let Claude or any CI system create it.

## 1. Generate the upload keystore

From a directory **outside** this repo (e.g. `~/Keys/leveluplearning/`):

```bash
keytool -genkey -v \
  -keystore leveluplearning-upload.jks \
  -alias leveluplearning-upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

`keytool` will prompt for:

- **Keystore password** — pick a strong random string, save in your password manager.
- **Key password** — can be the same as the keystore password.
- **Name / OU / Org / City / State / Country code** — use:
  - Name: `LevelUp Learning`
  - Organisation: `LevelUp Learning`
  - City: `Bangalore`
  - State: `Karnataka`
  - Country code: `IN`

After this you'll have `leveluplearning-upload.jks`. Store it in your password
manager (1Password supports file attachments) and in at least one offline
backup.

## 2. Wire it into the Android build

In `android/keystore.properties` (gitignored — see `android/.gitignore`),
create:

```properties
storeFile=/absolute/path/to/leveluplearning-upload.jks
storePassword=...
keyAlias=leveluplearning-upload
keyPassword=...
```

Then update `android/app/build.gradle` to read these and add a `release`
`signingConfig`. The Capacitor docs walk through this:
https://capacitorjs.com/docs/android/deploying-to-google-play#signing-an-apk-for-release

## 3. Build the signed bundle (AAB)

```bash
cd android
./gradlew bundleRelease
```

The output AAB lands at `android/app/build/outputs/bundle/release/app-release.aab`.
Upload that to Google Play Console.

## 4. Play App Signing (recommended)

When you create the Play Console listing, enrol in **Play App Signing**.
Google will hold the production signing key for you, and you'll only need to
guard the upload key generated above. This is the safer default — recovery
from a lost upload key is possible; recovery from a lost production signing
key is not.
