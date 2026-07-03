// Capacitor haptics wrapper. No-ops on web; triggers native haptics
// inside the Capacitor iOS/Android wrapper. Add `@capacitor/haptics`
// to package.json when building the native shell.

type ImpactStyle = "light" | "medium" | "heavy";
type NotificationType = "success" | "warning" | "error";

// The native @capacitor/haptics plugin matches feedback strings CASE-SENSITIVELY
// against its UPPERCASE enum values (ImpactStyle.Heavy = "HEAVY", etc.) and silently
// falls back to a default on no-match (impact ⇒ HEAVY, notification ⇒ SUCCESS) on
// BOTH Android and iOS. Our public API stays lowercase (frozen — ~30 call sites),
// so we translate to the canonical enum values here, at the native boundary.
const IMPACT_ENUM: Record<ImpactStyle, "LIGHT" | "MEDIUM" | "HEAVY"> = {
  light: "LIGHT",
  medium: "MEDIUM",
  heavy: "HEAVY",
};

const NOTIFICATION_ENUM: Record<NotificationType, "SUCCESS" | "WARNING" | "ERROR"> = {
  success: "SUCCESS",
  warning: "WARNING",
  error: "ERROR",
};

// Minimal shape of the native Haptics plugin we call. Both the bridge proxy
// (window.Capacitor.Plugins.Haptics) and the imported module's `Haptics` export
// expose this surface, so either resolution path satisfies it.
interface HapticsPlugin {
  impact(opts: { style: string }): Promise<void>;
  notification(opts: { type: string }): Promise<void>;
  selectionChanged(): Promise<void>;
}

// The Capacitor global injected by the native bridge. `Plugins` holds the
// registered native plugin proxies; absent on web/SSR.
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { Haptics?: HapticsPlugin };
}

const getCapacitor = (): CapacitorGlobal | undefined =>
  typeof window !== "undefined"
    ? (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
    : undefined;

const isNative = (): boolean => {
  const cap = getCapacitor();
  return !!cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform();
};

// Resolve the native Haptics plugin at runtime.
//
// Primary path: the registered plugin proxy on the Capacitor bridge
// (`window.Capacitor.Plugins.Haptics`). When the native shell is running and
// the plugin is installed in the shell, Capacitor exposes every plugin here —
// no module import is involved, so it works inside the WebView regardless of
// how the JS bundle resolves specifiers. This is what makes haptics fire on
// device.
//
// Why NOT a bare `import('@capacitor/haptics')` as the primary path: a bare
// specifier cannot be resolved by a browser/WebView at runtime (there is no
// module resolver or import-map for `@capacitor/haptics`), so the import
// rejects and every haptic silently no-ops on device. The previous
// `new Function("return import('@capacitor/haptics')")` hid the import from
// Vite, so the bare specifier survived into the bundle and always failed.
//
// Secondary path: a normal, statically-analyzable `import('@capacitor/haptics')`.
// Vite bundles this into a resolvable chunk at build time, so if the plugin's JS
// is present it loads correctly. This is only a fallback for the rare case where
// the bridge proxy isn't populated but the module is; it also exports the plugin
// with the same call surface (impact/notification/selectionChanged).
const loadHaptics = async (): Promise<HapticsPlugin | null> => {
  if (!isNative()) return null;

  // Primary: registered native plugin proxy — available whenever the bridge is up.
  const proxy = getCapacitor()?.Plugins?.Haptics;
  if (proxy) return proxy;

  // Secondary: Vite-visible dynamic import (real chunk, resolvable at runtime).
  try {
    const mod = (await import("@capacitor/haptics")) as { Haptics?: HapticsPlugin };
    return mod?.Haptics ?? null;
  } catch {
    return null;
  }
};

export const hapticImpact = async (style: ImpactStyle = "light"): Promise<void> => {
  const Haptics = await loadHaptics();
  if (!Haptics) return;
  try { await Haptics.impact({ style: IMPACT_ENUM[style] }); } catch { /* swallow */ }
};

export const hapticNotification = async (type: NotificationType = "success"): Promise<void> => {
  const Haptics = await loadHaptics();
  if (!Haptics) return;
  try { await Haptics.notification({ type: NOTIFICATION_ENUM[type] }); } catch { /* swallow */ }
};

export const hapticSelection = async (): Promise<void> => {
  const Haptics = await loadHaptics();
  if (!Haptics) return;
  try { await Haptics.selectionChanged(); } catch { /* swallow */ }
};

// Doctrine helpers — thin, intention-named wrappers over the primitives above.
// They inherit the same native/web guards and never throw. Prefer these at call
// sites so haptic intent reads at a glance.

// Light selection feedback — nav, tabs, toggles, card taps.
export const tapTick = (): Promise<void> => hapticSelection();

// Resolution of an async action — success or error notification.
export const confirm = (ok: boolean): Promise<void> =>
  hapticNotification(ok ? "success" : "error");

// Completion moments only — the heaviest impact.
export const celebrate = (): Promise<void> => hapticImpact("heavy");
