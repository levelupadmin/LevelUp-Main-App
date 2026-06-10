import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isIOS, isNative } from "@/lib/platform";

/**
 * JS bridge for the native VdoCipher FairPlay player plugin (iOS only).
 *
 * WKWebView cannot play FairPlay-protected streams, so inside the iOS
 * Capacitor shell the chapter player hands the freshly minted OTP +
 * playbackInfo to a local Swift plugin (jsName "VdoPlayer", registered via
 * bridge.registerPluginInstance in the custom bridge view controller),
 * which presents VdoCipher's own VdoPlayerViewController fullscreen.
 *
 * No npm package backs this: registerPlugin() returns a proxy that resolves
 * the natively registered implementation at call time. There is deliberately
 * NO web fallback implementation — callers must gate on
 * isNativeDrmAvailable(). Web and Android keep the iframe embed (Widevine
 * works in the Android WebView); calling play() there would reject with
 * "not implemented".
 */

export interface VdoPlayerNativePlugin {
  /**
   * Present the native fullscreen player and start FairPlay playback.
   *
   * OTPs are minted with ttl=300s, so fetch the OTP at tap time and call
   * this immediately (never mint at page load — VdoCipher error 2013
   * "OTP expired" otherwise).
   *
   * `videoId` is needed by the native SDK (VdoAsset.createAsset) and is
   * forwarded when the get-vdocipher-otp edge fn includes it in its
   * response. `title` and `startPosition` are best-effort extras for the
   * player chrome and resume parity with the web iframe's `&t=` param.
   */
  play(options: {
    otp: string;
    playbackInfo: string;
    title?: string;
    videoId?: string;
    startPosition?: number;
  }): Promise<void>;

  /**
   * Periodic playback position from the native player (~every 5s) so the iOS
   * fullscreen path can record watch progress the way the web iframe does via
   * postMessage. There is no iframe to listen to on iOS.
   */
  addListener(
    eventName: "playerTimeUpdate",
    listenerFunc: (data: { currentSeconds: number; totalSeconds: number }) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Fired when the native player is dismissed. Carries the final position so the
   * caller can persist completion/resume; `error` is set if it closed on an SDK
   * failure rather than a user close.
   */
  addListener(
    eventName: "playerClosed",
    listenerFunc: (data: { error?: string; currentSeconds?: number; totalSeconds?: number }) => void,
  ): Promise<PluginListenerHandle>;
}

/** Name must equal the Swift plugin's `jsName` ("VdoPlayer"), not its identifier. */
export const VdoPlayerNative = registerPlugin<VdoPlayerNativePlugin>("VdoPlayer");

/**
 * True only inside the iOS Capacitor shell — the one runtime where FairPlay
 * requires the native handoff. Everywhere else the iframe path stays.
 */
export const isNativeDrmAvailable = (): boolean => isIOS() && isNative();
