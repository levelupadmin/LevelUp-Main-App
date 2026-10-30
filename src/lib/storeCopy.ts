import { Capacitor } from "@capacitor/core";

/**
 * Copy for money steps the native shells cannot take.
 *
 * Android (Play Reader Rule, Path B) may tell the reader to finish a payment
 * in a web browser. iOS may not: Apple Guidelines 3.1.1 / 3.1.3 forbid
 * pointing users to an outside purchase, in words as well as links. So on
 * iOS the step is named as unavailable here, with no direction elsewhere.
 *
 * Reads Capacitor directly rather than `isIOS()` from `@/lib/platform`, so
 * the many tests that mock that module with only `isNative` keep working.
 */
export const isIOSShell = () => Capacitor.getPlatform() === "ios";

export const nativePaymentNote = () =>
  isIOSShell()
    ? "This step isn't available in the app."
    : "Complete this step from a web browser.";
