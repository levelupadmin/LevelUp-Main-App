/**
 * Thin promise-based wrapper around MSG91's OTP widget exposed methods.
 *
 * The widget is loaded by a script tag in index.html with
 * exposeMethods: true, which puts window.OTPWidget on the page.
 * That object exposes sendOTP / retryOTP / verifyOTP, each of which
 * takes (data, successCb, failureCb). This wrapper turns them into
 * proper Promises so React components can `await` them.
 *
 * The widget uses MSG91's pre-approved default DLT template under the
 * hood, so SMS delivery works the moment a token is provisioned --
 * no wait on our own DLT template.
 */

type OtpSuccess = { type?: string; message?: string; req_id?: string; [k: string]: unknown };
type OtpFailure = { type?: string; message?: string; [k: string]: unknown };

interface OtpWidget {
  sendOTP: (
    data: { identifier: string },
    success: (r: OtpSuccess) => void,
    failure: (e: OtpFailure) => void,
  ) => void;
  retryOTP: (
    channel: "11" | "12" | "13", // 11=text/sms, 12=voice, 13=whatsapp
    success: (r: OtpSuccess) => void,
    failure: (e: OtpFailure) => void,
  ) => void;
  verifyOTP: (
    otp: number | string,
    success: (r: OtpSuccess & { message?: string }) => void,
    failure: (e: OtpFailure) => void,
  ) => void;
}

declare global {
  interface Window {
    OTPWidget?: OtpWidget;
    initSendOTP?: (config: Record<string, unknown>) => void;
    __MSG91_CONFIG__?: Record<string, unknown>;
  }
}

/**
 * Wait for the widget to finish loading. Polls window.OTPWidget for
 * up to `timeoutMs`. Returns true if loaded, false on timeout.
 *
 * Most calls resolve within ~500ms — the script tag in index.html
 * triggers a `msg91:ready` event as soon as initSendOTP returns.
 */
export const waitForOtpWidget = (timeoutMs = 8000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (window.OTPWidget) return resolve(true);
    const start = Date.now();
    const t = setInterval(() => {
      if (window.OTPWidget) {
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
 * Send an OTP to the given phone (E.164 with country code, no +).
 * MSG91 wants `91` + 10-digit, not `+91...`, so the caller can pass
 * either format -- we normalise.
 */
export const sendOtp = async (identifier: string): Promise<OtpSuccess> => {
  const ready = await waitForOtpWidget();
  if (!ready || !window.OTPWidget) {
    throw new Error("OTP service not available right now. Try again.");
  }
  const normalised = identifier.replace(/^\+/, "");
  return new Promise((resolve, reject) => {
    window.OTPWidget!.sendOTP(
      { identifier: normalised },
      (r) => resolve(r),
      (e) => reject(new Error(e?.message || "Couldn't send OTP")),
    );
  });
};

/**
 * Verify an OTP. Returns the widget's response payload which contains
 * a `message` field that is the access token (a JWT) we forward to
 * our edge function for backend verification + Supabase session mint.
 */
export const verifyOtp = async (otp: string | number): Promise<{ accessToken: string }> => {
  if (!window.OTPWidget) throw new Error("OTP service not initialised");
  return new Promise((resolve, reject) => {
    window.OTPWidget!.verifyOTP(
      typeof otp === "string" ? Number(otp) : otp,
      (r) => {
        // MSG91 returns { message: "<JWT>", type: "success" } on verify.
        const token = (r as { message?: string }).message;
        if (!token) return reject(new Error("Verify succeeded but no token returned"));
        resolve({ accessToken: token });
      },
      (e) => reject(new Error(e?.message || "Invalid OTP")),
    );
  });
};

/**
 * Retry channel codes per MSG91 docs:
 *   11 = SMS  (default)
 *   12 = Voice
 *   13 = WhatsApp
 */
export const retryOtp = async (channel: "sms" | "voice" | "whatsapp"): Promise<OtpSuccess> => {
  if (!window.OTPWidget) throw new Error("OTP service not initialised");
  const code = channel === "sms" ? "11" : channel === "voice" ? "12" : "13";
  return new Promise((resolve, reject) => {
    window.OTPWidget!.retryOTP(
      code,
      (r) => resolve(r),
      (e) => reject(new Error(e?.message || "Couldn't resend OTP")),
    );
  });
};
