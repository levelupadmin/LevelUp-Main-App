import { useEffect, useRef, useState } from "react";
import { Loader2, Mail, RotateCw } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { hapticSelection, hapticNotification } from "@/lib/haptics";

interface Props {
  phone: string;
  channel: "sms" | "whatsapp";
  otpLength?: number;
  onVerify: (otp: string) => Promise<{ ok: boolean; error?: string }>;
  onResendSms: () => Promise<{ ok: boolean; error?: string }>;
  // WhatsApp channel kept in the type for forward compatibility but
  // the UI button is hidden until we wire a WhatsApp Flow API path.
  onSwitchToWhatsApp?: () => Promise<{ ok: boolean; error?: string }>;
  onSwitchToEmail?: () => void;
  onBack: () => void;
}

// Mask the number so it reads "+91 ····· ··321" — keep the country code and
// the last three digits (enough for the user to recognise their own number),
// dot out everything in between. Falls back to the raw string for numbers too
// short to mask meaningfully (shouldn't happen for a +91 mobile).
function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length < 6) return trimmed;
  // Country code = leading "+" plus digits up to the standard 10-digit local
  // part. For +91XXXXXXXXXX this yields "+91"; generalises for other codes.
  const digits = trimmed.replace(/[^\d]/g, "");
  const last3 = digits.slice(-3);
  const localLen = 10;
  const ccDigits = digits.length > localLen ? digits.slice(0, digits.length - localLen) : "";
  const cc = ccDigits ? `+${ccDigits}` : trimmed.startsWith("+") ? `+${digits.slice(0, Math.max(0, digits.length - 10))}` : "";
  const prefix = cc || "+91";
  return `${prefix} ••••• ••${last3}`;
}

// Seconds → "0:NN" for the resend chip (e.g. 30 → "0:30", 5 → "0:05").
function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const RESEND_SECONDS = 30;

export function OtpEntryStep({
  phone,
  channel,
  otpLength = 4,
  onVerify,
  onResendSms,
  onSwitchToEmail,
  onBack,
}: Props) {
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCount, setResendCount] = useState(0);
  const [resendTimer, setResendTimer] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (resendTimer === 0) return;
    const t = window.setTimeout(() => setResendTimer((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendTimer]);

  useEffect(() => {
    // Auto-submit the moment the last digit lands — no "Verify" button to tap.
    if (otp.length !== otpLength) return;
    // Note: `verifying` is intentionally NOT in the deps array. If we
    // include it, setVerifying(true) below changes deps -> cleanup
    // fires with cancelled=true BEFORE the await settles -> setVerifying(false)
    // is skipped -> spinner gets stuck forever. Use a ref to guard
    // against double-fires instead.
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    let cancelled = false;
    (async () => {
      setVerifying(true);
      setError(null);
      try {
        const res = await onVerify(otp);
        if (cancelled) return;
        if (!res.ok) {
          hapticNotification("error");
          setError(res.error || "Invalid code. Please try again.");
          setOtp("");
        } else {
          hapticNotification("success");
        }
      } catch (e) {
        // onVerify should always return a result object, but if it
        // throws anyway (e.g. fetch rejection on the verify edge fn)
        // we still need to clear the spinner.
        if (!cancelled) {
          hapticNotification("error");
          setError(e instanceof Error ? e.message : "Verification error. Try again.");
          setOtp("");
        }
      } finally {
        if (!cancelled) setVerifying(false);
        verifyingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, otpLength]);

  const handleResendSms = async () => {
    hapticSelection();
    setResending(true);
    setError(null);
    setOtp("");
    const res = await onResendSms();
    setResending(false);
    if (!res.ok) {
      setError(res.error || "Couldn't resend. Try a different option below.");
      return;
    }
    setResendCount((c) => c + 1);
    setResendTimer(RESEND_SECONDS);
  };

  const counting = resendTimer > 0;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
          Step 2 of 2
        </p>
        <h2 className="text-3xl sm:text-[32px] font-semibold tracking-[-0.01em] leading-tight">
          Enter the <span className="font-serif-italic text-cream">code</span> we sent
        </h2>
        <p className="text-sm text-muted-foreground">
          {channel === "whatsapp" ? "Sent via WhatsApp to " : "Sent via SMS to "}
          <span className="text-foreground font-medium font-mono">{maskPhone(phone)}</span>
        </p>
      </div>

      <div className="flex justify-center">
        <InputOTP
          value={otp}
          onChange={(v) => {
            if (v.length > otp.length) hapticSelection();
            setOtp(v);
          }}
          maxLength={otpLength}
          disabled={verifying}
          autoFocus
          // Surfaces the iOS/Android SMS-autofill chip ("From Messages") so the
          // code can be tapped in instead of memorised + re-typed.
          autoComplete="one-time-code"
          inputMode="numeric"
        >
          <InputOTPGroup className="gap-2">
            {Array.from({ length: otpLength }).map((_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="w-12 h-14 text-xl rounded-md border-l first:rounded-l-md last:rounded-r-md"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {verifying && (
        <div className="flex items-center justify-center text-sm text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
        </div>
      )}
      {error && !verifying && (
        <p className="text-sm text-destructive text-center" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-2 pt-2">
        {/* Resend control: a static countdown chip while the timer runs, then
            it morphs into a tappable button at 0:00. */}
        <div className="flex justify-center">
          {counting ? (
            <span
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-surface-2 text-xs font-mono text-muted-foreground select-none"
              aria-live="polite"
            >
              Resend in {fmtCountdown(resendTimer)}
            </span>
          ) : (
            <button
              type="button"
              disabled={resending || verifying}
              onClick={handleResendSms}
              className="pressable inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border text-xs text-cream hover:border-border-hover disabled:opacity-50 transition-colors"
            >
              {resending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resending…
                </>
              ) : (
                <>
                  <RotateCw className="h-3.5 w-3.5" /> Resend code
                </>
              )}
            </button>
          )}
        </div>

        {resendCount >= 1 && onSwitchToEmail && (
          <button
            type="button"
            onClick={onSwitchToEmail}
            className="w-full h-9 text-sm text-cream hover:underline inline-flex items-center justify-center gap-1.5"
          >
            <Mail className="h-3.5 w-3.5" /> Not getting the SMS? Use email instead
          </button>
        )}

        <button
          type="button"
          onClick={onBack}
          className="w-full h-9 text-xs text-muted-foreground hover:text-foreground"
        >
          ← Use a different number
        </button>
      </div>
    </div>
  );
}
