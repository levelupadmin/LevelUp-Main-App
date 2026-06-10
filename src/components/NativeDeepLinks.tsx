import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Handles Capacitor `appUrlOpen` events for Android App Links.
 *
 * When the app is ALREADY running (backgrounded) and the user taps a
 * https://app.leveluplearning.in/<path> link elsewhere, Android routes
 * it back into this app (our activity is singleTask with an
 * autoVerify'd intent-filter) WITHOUT reloading the WebView. Capacitor
 * surfaces that as an `appUrlOpen` event. We translate the URL's path
 * into an in-app navigation so the deep link lands on the right screen
 * instead of dumping the user wherever they last were.
 *
 * Cold-start deep links (app not running) need no handling here: the
 * WebView boots the bundled SPA directly at the deep-linked path.
 *
 * Renders nothing. No-op on web: the dynamic import resolves but
 * isNativePlatform() is false, so no listener is attached.
 */
const NativeDeepLinks = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App: CapApp } = await import("@capacitor/app");
        const handle = await CapApp.addListener("appUrlOpen", ({ url }) => {
          try {
            const parsed = new URL(url);
            // Only our own origin. OAuth / custom-scheme callbacks are
            // handled by their own plugins, not routed through here.
            if (parsed.host !== "app.leveluplearning.in") return;
            const path = parsed.pathname + parsed.search + parsed.hash;
            // Avoid a redundant nav if we're already on that path.
            if (path && path !== window.location.pathname + window.location.search + window.location.hash) {
              navigate(path);
            }
          } catch {
            /* malformed URL, ignore */
          }
        });
        remove = () => handle.remove();
      } catch {
        /* @capacitor/app not available (web), no-op */
      }
    })();
    return () => {
      remove?.();
    };
  }, [navigate]);

  return null;
};

export default NativeDeepLinks;
