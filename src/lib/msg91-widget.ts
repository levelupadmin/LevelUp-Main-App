/**
 * Thin promise-based wrapper around MSG91's OTP widget runtime.
 *
 * The widget is loaded by a <script> tag in index.html. It is an Angular
 * custom-element framework: once initSendOTP({widgetId, tokenAuth, exposeMethods:true})
 * runs against a mounted <msg91-otp-provider> element, the framework
 * exposes three callbacks-style functions directly on `window`:
 *
 *   window.sendOtp(identifier, successCb, failureCb)
 *   window.verifyOtp(otp, successCb, failureCb, reqId?)
 *   window.retryOtp(channel, successCb, failureCb, reqId?)
 *
 * There is no `window.OTPWidget` namespace - earlier versions of this
 * file looked for one and timed out. The minified provider source defines
 * the surface via Object.defineProperties(window, {sendOtp, verifyOtp,
 * retryOtp, ...}) inside the Angular component lifecycle, gated on
 * config.exposeMethods.
 *
 * Channels for retryOtp:
 *   "11" -> SMS, "12" -> Voice, "13" -> WhatsApp
 */

type Cb<T> = (r: T) => void;
type WidgetReason = {
  type?: string;
  message?: string;
  hasError?: boolean;
  status?: string;
  [k: string]: unknown;
};

declare global {
  interface Window {
    initSendOTP?: (config: Record<string, unknown>) => void;
    sendOtp?: (identifier: string, success: Cb<WidgetReason>, failure: Cb<WidgetReason>) => void;
    verifyOtp?: (
      otp: number | string,
      success: Cb<WidgetReason & { message?: string }>,
      failure: Cb<WidgetReason>,
      reqId?: string,
    ) => void;
    retryOtp?: (
      channel: "11" | "12" | "13",
      success: Cb<WidgetReason>,
      failure: Cb<WidgetReason>,
      reqId?: string,
    ) => void;
    __MSG91_CONFIG__?: Record<string, unknown>;
  }
}

/**
 * Poll for the widget to expose its window methods. Usually ~500ms-1s
 * after initSendOTP runs.
 */
export const waitForMsg91 = (timeoutMs = 8000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window.sendOtp === "function") return resolve(true);
    const start = Date.now();
    const t = setInterval(() => {
      if (typeof window.sendOtp === "function") {
        clearInterval(t);
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        resolve(false);
      }
    }, 100);
  });
};

/**
 * Send an OTP via the widget. MSG91 wants the identifier as digits
 * with country code, no leading + (e.g. "919884731816").
 */
export const sendOtp = async (identifier: string): Promise<WidgetReason> => {
  const ready = await waitForMsg91();
  if (!ready || typeof window.sendOtp !== "function") {
    throw new Error("OTP service not available right now. Try again.");
  }
  const normalised = identifier.replace(/^\+/, "");
  return new Promise((resolve, reject) => {
    window.sendOtp!(
      normalised,
      (r) => resolve(r),
      (e) => reject(new Error(e?.message || "Couldn't send OTP")),
    );
  });
};

/**
 * Verify an OTP. The widget's success callback gives us an access
 * token (a JWT) in the `message` field - we forward that to our
 * verify-msg91-otp edge function which mints a Supabase session.
 */
export const verifyOtp = async (otp: string | number): Promise<{ accessToken: string }> => {
  if (typeof window.verifyOtp !== "function") {
    throw new Error("OTP service not initialised");
  }
  const otpNum = typeof otp === "string" ? Number(otp) : otp;
  return new Promise((resolve, reject) => {
    window.verifyOtp!(
      otpNum,
      (r) => {
        const token = r?.message;
        if (!token) return reject(new Error("Verify succeeded but no token returned"));
        resolve({ accessToken: token });
      },
      (e) => reject(new Error(e?.message || "Invalid OTP")),
    );
  });
};

/**
 * Resend OTP via a different channel.
 *   "sms"      -> channel code "11"
 *   "voice"    -> channel code "12"
 *   "whatsapp" -> channel code "13"
 */
export const retryOtp = async (channel: "sms" | "voice" | "whatsapp"): Promise<WidgetReason> => {
  if (typeof window.retryOtp !== "function") {
    throw new Error("OTP service not initialised");
  }
  const code = channel === "sms" ? "11" : channel === "voice" ? "12" : "13";
  return new Promise((resolve, reject) => {
    window.retryOtp!(
      code,
      (r) => resolve(r),
      (e) => reject(new Error(e?.message || "Couldn't resend OTP")),
    );
  });
};
