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

const isNative = (): boolean => {
  const cap = (typeof window !== "undefined" ? (window as any).Capacitor : undefined);
  return !!cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform();
};

const loadHaptics = async (): Promise<any | null> => {
  if (!isNative()) return null;
  try {
    // Dynamic import so web builds don't crash when the package is absent.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await (new Function("return import('@capacitor/haptics')")()) as any;
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
