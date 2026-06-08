import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the LevelUp Learning Android shell.
 *
 * The shell is a WebView that serves the BUNDLED Vite build
 * (android/app/src/main/assets/public/, copied in by `npx cap sync`)
 * under the origin https://app.leveluplearning.in. Note there is NO
 * `server.url` — `server.hostname` alone does NOT load remote content;
 * it only sets the origin the local bundle is served from. We do that
 * so the WebView shares the web app's origin (App Links / assetlinks,
 * cookies, localStorage, IndexedDB all line up) while still running
 * fully bundled, store-reviewable assets.
 *
 * Consequence: web changes do NOT reach installed apps automatically.
 * Any web fix must be re-bundled and shipped as a Play update:
 *   vite build → npx cap sync android → ./gradlew bundleRelease.
 *
 * Per Google Play "Reader Rule" (Path B): the shell shows NO purchase UI.
 * Buy/Enrol CTAs are swapped to a "Continue on web" link at runtime via
 * `src/lib/platform.ts`. Razorpay never opens inside the WebView on Android.
 */
const config: CapacitorConfig = {
  // Pinned to com.tagmango.leveluplearning so the AAB we ship updates
  // the existing Play Console listing (2.05k installs, 19 months of
  // ranking signals + reviews) in-place. The package name is
  // immutable once installs exist, so changing this would force a
  // fresh listing and lose everything.
  //
  // NOTE: this value is the Android applicationId only. iOS is greenfield
  // (no existing installs) and deliberately uses a clean bundle id
  // `com.leveluplearning.app`, set in ios/App/App.xcodeproj
  // (PRODUCT_BUNDLE_IDENTIFIER). `cap sync` does not overwrite either
  // native id, so the two platforms intentionally diverge.
  appId: "com.tagmango.leveluplearning",
  appName: "LevelUp Learning",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // Sets the origin the LOCAL bundle is served from (so App Links,
    // cookies, and storage line up with the web app). This is NOT a
    // remote loader — there's no server.url — so web fixes still require
    // a re-bundle + Play update (see the docblock above).
    hostname: "app.leveluplearning.in",
    // First-party domains and trusted third-party scripts the WebView is
    // allowed to navigate to / load from. Anything outside this list is
    // bounced to the system browser (the desired Path B behaviour for
    // payment URLs — but we also strip those CTAs on Android, see Stage 3).
    allowNavigation: [
      "*.leveluplearning.in",
      "verify.msg91.com",
      "checkout.razorpay.com",
      "player.vdocipher.com",
      "*.supabase.co",
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidSplashResourceName: "splash",
      iosSplashStoryboard: "LaunchScreen",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0a",
      overlaysWebView: true,
    },
  },
};

export default config;
