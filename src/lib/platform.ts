import { Capacitor } from "@capacitor/core";

/**
 * Platform-detection helpers for the LevelUp shell.
 *
 * The same React bundle ships to three runtimes:
 *  - web (Vercel)
 *  - Android (Capacitor WebView)
 *  - iOS (future)
 *
 * On Android we MUST hide every purchase entry point to comply with the
 * Google Play "Reader Rule" (Path B): users see a "Continue on web" CTA
 * that bounces them out to the browser, where Razorpay handles payment.
 * See `src/pages/PublicOffering.tsx` etc. for the gating callsites.
 */

export const isAndroid = () => Capacitor.getPlatform() === "android";
export const isIOS = () => Capacitor.getPlatform() === "ios";
export const isWeb = () => Capacitor.getPlatform() === "web";
export const isNative = () => Capacitor.isNativePlatform();
