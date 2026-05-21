// Capacitor haptics wrapper. No-ops on web; triggers native haptics
// inside the Capacitor iOS/Android wrapper. Add `@capacitor/haptics`
// to package.json when building the native shell.

type ImpactStyle = "light" | "medium" | "heavy";
type NotificationType = "success" | "warning" | "error";

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
  try { await Haptics.impact({ style }); } catch { /* swallow */ }
};

export const hapticNotification = async (type: NotificationType = "success"): Promise<void> => {
  const Haptics = await loadHaptics();
  if (!Haptics) return;
  try { await Haptics.notification({ type }); } catch { /* swallow */ }
};

export const hapticSelection = async (): Promise<void> => {
  const Haptics = await loadHaptics();
  if (!Haptics) return;
  try { await Haptics.selectionChanged(); } catch { /* swallow */ }
};
