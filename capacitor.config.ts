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
    // The native splash is hidden by the WEB layer, not the OS: `main.tsx`
    // calls `SplashScreen.hide({ fadeOutDuration: durationsMs.base })` (240ms,
    // the --motion-base token from src/lib/motion.ts) inside a double-rAF
    // (a painted React frame is guaranteed to exist first), so the splash
    // lifts straight onto rendered content with no black gap and no
    // double-flash. `launchAutoHide: false` is what hands that control to JS
    // — with it true the OS would auto-hide after `launchShowDuration`,
    // racing the first paint and reintroducing the gap. A 4s failsafe in
    // main.tsx force-hides if JS ever errors before mounting, so users are
    // never trapped on the splash. `backgroundColor` matches the branded dark
    // canvas (#0a0a0a — same as the manifest/theme/StatusBar) so any frame
    // the OS paints for the splash window blends into the app, not black.
    // `launchFadeOutDuration` is load-bearing on the Android 12+ Splash Screen
    // API: there the OS ignores the fadeOutDuration passed to SplashScreen.hide()
    // and uses THIS value for the fade instead (see @capacitor/splash-screen
    // HideOptions.fadeOutDuration docs), so keep it in sync with the 240ms JS
    // fade — deleting it silently regresses the Android 12+ fade to the 200ms
    // default.
    SplashScreen: {
      launchAutoHide: false,
      // Pinned to durationsMs.base (--motion-base, 240ms) in src/lib/motion.ts —
      // this config is evaluated by the Capacitor CLI at build time and can't
      // import that runtime ESM token, so the literal is duplicated by hand and
      // kept in lockstep with the SplashScreen.hide() fade in src/main.tsx.
      launchFadeOutDuration: 240,
      backgroundColor: "#0a0a0a",
      androidSplashResourceName: "splash",
      iosSplashStoryboard: "LaunchScreen",
    },
    // StatusBar overlays the WebView (does NOT reserve its own opaque band).
    // This is the correct and ONLY consistent pairing with the web layer's
    // `viewport-fit=cover` viewport: the WebView already draws edge-to-edge
    // under the Dynamic Island, and the web side reclaims that region with
    // the `.pt-safe` / `env(safe-area-inset-top)` helpers in src/index.css.
    // If overlaysWebView were false, the native status-bar band PLUS the web
    // safe-area padding would both inset the top — the "double-clip" of the
    // logo bar. `style: DARK` here means dark *content* (light glyphs) suited
    // to our near-black canvas; backgroundColor is moot while overlaying.
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0a",
      overlaysWebView: true,
    },
    // NOTE (not applied here): the "page becomes scrollable / shifts when the
    // keyboard opens" symptom is the Keyboard resize mode. The fix is the
    // @capacitor/keyboard plugin with `Keyboard: { resize: "native" }` (iOS
    // resizes the WebView viewport to the keyboard instead of letting content
    // scroll under it). That plugin is NOT currently a dependency, so adding
    // an inert config block would do nothing. Flagged for the verify/owner
    // agent: `npm i @capacitor/keyboard` + this block is the proper remedy.
  },
};

export default config;
