import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Mail } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface Props {
  phone: string;
  channel: "sms" | "whatsapp";
  otpLength?: number;
  onVerify: (otp: string) => Promise<{ ok: boolean; error?: string }>;
  onResendSms: () => Promise<{ ok: boolean; error?: string }>;
  onSwitchToWhatsApp: () => Promise<{ ok: boolean; error?: string }>;
  onSwitchToEmail?: () => void;
  onBack: () => void;
}

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return phone.slice(0, 4) + " " + phone.slice(4, 7) + " ••••• " + phone.slice(-2);
}

export function OtpEntryStep({
  phone,
  channel,
  otpLength = 4,
  onVerify,
  onResendSms,
  onSwitchToWhatsApp,
  onSwitchToEmail,
  onBack,
}: Props) {
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCount, setResendCount] = useState(0);
  const [resendTimer, setResendTimer] = useState(30);

  useEffect(() => {
    if (resendTimer === 0) return;
    const t = window.setTimeout(() => setResendTimer((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendTimer]);

  useEffect(() => {
    if (otp.length !== otpLength || verifying) return;
    let cancelled = false;
    (async () => {
      setVerifying(true);
      setError(null);
      const res = await onVerify(otp);
      if (cancelled) return;
      setVerifying(false);
      if (!res.ok) {
        setError(res.error || "Invalid code. Please try again.");
        setOtp("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [otp, otpLength, verifying, onVerify]);

  const handleResendSms = async () => {
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
    setResendTimer(30);
  };

  const handleSwitchWA = async () => {
    setResending(true);
    setError(null);
    setOtp("");
    const res = await onSwitchToWhatsApp();
    setResending(false);
    if (!res.ok) {
      setError(res.error || "WhatsApp delivery failed.");
      return;
    }
    setResendTimer(30);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold mb-1">
          Enter <span className="font-serif-italic text-cream">code</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {channel === "whatsapp" ? "We sent a WhatsApp to " : "We sent an SMS to "}
          <span className="text-foreground font-medium">{maskPhone(phone)}</span>
        </p>
      </div>

      <div className="flex justify-center">
        <InputOTP value={otp} onChange={setOtp} maxLength={otpLength} disabled={verifying} autoFocus>
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
        <button
          type="button"
          disabled={resendTimer > 0 || resending || verifying}
          onClick={handleResendSms}
          className="w-full h-10 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:hover:text-muted-foreground transition-colors"
        >
          {resending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resending…
            </span>
          ) : resendTimer > 0 ? (
            `Resend SMS in ${resendTimer}s`
          ) : (
            "Resend SMS"
          )}
        </button>

        {channel === "sms" && (
          <button
            type="button"
            onClick={handleSwitchWA}
            disabled={resending || verifying}
            className="w-full h-10 text-sm border border-border rounded-md hover:bg-secondary/30 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
          >
            <MessageCircle className="h-4 w-4 text-[hsl(var(--accent-emerald))]" />
            Get OTP on WhatsApp
          </button>
        )}

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
