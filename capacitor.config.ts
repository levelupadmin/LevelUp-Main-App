import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the LevelUp Learning Android shell.
 *
 * The shell is a thin WebView wrapper around https://app.leveluplearning.in
 * (the production web app). We intentionally point `server.hostname` at the
 * live origin instead of bundling a local copy — that way the Android app
 * always runs the same JS/CSS as the web, including hot-fixes.
 *
 * Per Google Play "Reader Rule" (Path B): the shell shows NO purchase UI.
 * Buy/Enrol CTAs are swapped to a "Continue on web" link at runtime via
 * `src/lib/platform.ts`. Razorpay never opens inside the WebView on Android.
 */
const config: CapacitorConfig = {
  appId: "in.leveluplearning.lms",
  appName: "LevelUp Learning",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // Load the production origin inside the WebView so the shell stays in
    // sync with the web app — no rebuild needed when web ships a fix.
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
