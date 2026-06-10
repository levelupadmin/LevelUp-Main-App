#!/usr/bin/env bash
# LevelUp Android — build & sign the release AAB.
#
# Prompts for the keystore password at runtime. The password is never
# echoed to the screen, never written to a file, and never saved in your
# shell history. It lives only in memory for the duration of the build and
# is scrubbed the moment Gradle finishes.
#
#   Usage:   bash sign-release.sh
#
# The password is in 1Password ("LevelUp Android upload keystore"), with a
# backup in your ceo@leveluplearning.in Drafts.

PROJECT_DIR="/Users/rahulsrinivas/Claude/LevelUp-Main-App"
KEYSTORE="/Users/rahulsrinivas/Library/Mobile Documents/com~apple~CloudDocs/Claude Projects/LevelUp Core/keystores/upload-keystore.jks"
JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

if [ ! -f "$KEYSTORE" ]; then
  echo "ERROR: upload keystore not found at:" >&2
  echo "  $KEYSTORE" >&2
  exit 1
fi
if [ ! -d "$JBR" ]; then
  echo "ERROR: Android Studio's bundled JDK not found at:" >&2
  echo "  $JBR" >&2
  exit 1
fi

export JAVA_HOME="$JBR"
export LEVELUP_KEYSTORE_PATH="$KEYSTORE"

# Hidden prompt: -s suppresses echo so the password is never displayed.
read -rsp "LevelUp keystore password: " LEVELUP_KEYSTORE_PASSWORD
export LEVELUP_KEYSTORE_PASSWORD
echo ""

cd "$PROJECT_DIR/android" || exit 1
./gradlew bundleRelease
STATUS=$?

# Scrub the password from the environment as soon as the build is done.
unset LEVELUP_KEYSTORE_PASSWORD

AAB="$PROJECT_DIR/android/app/build/outputs/bundle/release/app-release.aab"
echo ""
if [ $STATUS -eq 0 ] && [ -f "$AAB" ]; then
  echo "================================================================"
  echo " Signed AAB is ready to upload to Play Console:"
  echo "   $AAB"
  echo ""
  echo " Open the folder in Finder:"
  echo "   open \"$PROJECT_DIR/android/app/build/outputs/bundle/release/\""
  echo "================================================================"
else
  echo "Build did NOT produce a signed AAB. Scroll up for the Gradle error."
  echo "(Most common cause: the keystore password was mistyped.)"
fi
