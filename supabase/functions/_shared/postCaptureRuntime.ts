/**
 * The edge-function entry to the post-capture step. It hands the email helpers
 * from _shared/email.ts (which imports supabase-js from a URL) to
 * postCapture.ts, so postCapture.ts itself stays importable by vitest.
 *
 * razorpay-webhook and verify-razorpay-payment import schedulePostCapture from
 * here, not from postCapture.ts.
 */
import { enqueueEmail, isEmailSuppressed, sanitizeVar } from "./email.ts";
import { schedulePostCapture as schedule, type PostCaptureOptions } from "./postCapture.ts";
export { postCaptureClaimed } from "./postCapture.ts";

const emailDeps = { enqueueEmail, isEmailSuppressed, sanitizeVar };

export function schedulePostCapture(
  admin: Parameters<typeof schedule>[0],
  paymentOrderId: string,
  opts: Omit<PostCaptureOptions, "email">,
): void {
  schedule(admin, paymentOrderId, { ...opts, email: emailDeps });
}
