import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { Check, Loader2, RotateCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { hapticNotification, tapTick } from "@/lib/haptics";
import { durations, easings, instant, springs, useMotionSafe } from "@/lib/motion";
import {
  sendEmailOtp,
  verifyEmailOtpForSession,
  type EmailOtpSession,
} from "@/hooks/useClaimApplication";

/**
 * OtpTabs — the passwordless entry surface for the identity spine (PHASE SP).
 *
 * The Phone tab is the production MSG91 flow, passed in verbatim by the caller:
 * this file never re-implements it, never wraps its network calls, and never
 * changes where it navigates. The Email tab is purely additive and dark-shipped
 * behind `VITE_EMAIL_OTP_TAB`, so if it is off or broken the phone path is
 * exactly what it is today.
 *
 * There is NO password field in here, and there is none anywhere downstream of
 * it: both channels are one-time codes.
 */

/** Uniform action result: mirrors `ClaimResult` in useClaimApplication. */
type ActionResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * MUST NOT be shorter than the server's `OTP_RESEND_COOLDOWN_SECONDS`
 * (`supabase/functions/_shared/otp.ts` = 60). Inside that cooldown BOTH email
 * endpoints answer the resend from the code already in flight and mail nothing,
 * while still returning the same generic success literal — so a shorter timer
 * here offers a button that clears the user's boxes, restarts the countdown and
 * silently produces no email. Someone who missed the first code (spam folder,
 * slow delivery) then waits out two cycles before anything can arrive.
 *
 * Mirrored rather than imported: the server module is Deno-targeted and pulls
 * in `./crypto.ts`, which has no business in the login bundle.
 */
const RESEND_SECONDS = 60;
const EMAIL_CODE_LENGTH = 6;

const TABS = [
  { key: "phone" as const, label: "Phone" },
  { key: "email" as const, label: "Email" },
];

export type OtpTab = "phone" | "email";

interface OtpTabsProps {
  value: OtpTab;
  onValueChange: (tab: OtpTab) => void;
  /** The existing phone step, rendered untouched. */
  phone: ReactNode;
  /** The additive email step. */
  email: ReactNode;
}

/** Seconds → "0:NN" for the resend chip (mirrors OtpEntryStep's formatting). */
function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const TAB_ORDER: OtpTab[] = TABS.map((t) => t.key);

export function OtpTabs({ value, onValueChange, phone, email }: OtpTabsProps) {
  const ms = useMotionSafe();
  const tabRefs = useRef<Record<OtpTab, HTMLButtonElement | null>>({
    phone: null,
    email: null,
  });

  const select = (next: OtpTab) => {
    if (next === value) return;
    tapTick();
    onValueChange(next);
  };

  /**
   * The ARIA tabs pattern, which `role="tablist"` is a promise to honour: the
   * whole strip is ONE tab stop (the roving tabindex below), and the arrows,
   * Home and End move between tabs, activating as they go. Without this a
   * keyboard or screen-reader user is told there is a tablist and then finds a
   * widget that does not behave like one.
   */
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = TAB_ORDER.indexOf(value);
    let next: OtpTab | null = null;
    if (e.key === "ArrowRight") next = TAB_ORDER[(i + 1) % TAB_ORDER.length];
    else if (e.key === "ArrowLeft")
      next = TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length];
    else if (e.key === "Home") next = TAB_ORDER[0];
    else if (e.key === "End") next = TAB_ORDER[TAB_ORDER.length - 1];
    if (!next) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sign in method"
        className="mb-5 flex rounded-full border border-border bg-surface p-1"
      >
        {TABS.map((tab) => {
          const active = value === tab.key;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[tab.key] = el;
              }}
              type="button"
              role="tab"
              id={`otp-tab-${tab.key}`}
              aria-selected={active}
              // Only ONE panel is ever rendered, so only the selected tab may
              // claim to control it. Pointing the inactive tab at an id that
              // does not exist is a dangling reference, not a hint.
              aria-controls={active ? `otp-panel-${tab.key}` : undefined}
              tabIndex={active ? 0 : -1}
              onKeyDown={handleKeyDown}
              onClick={() => select(tab.key)}
              className={`relative flex-1 min-h-[44px] rounded-full px-4 text-sm font-medium transition-colors ${
                active ? "text-cream" : "text-muted-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="otp-tab-indicator"
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-surface-2"
                  transition={ms.reduced ? instant : springs.snap}
                />
              )}
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`otp-panel-${value}`}
        aria-labelledby={`otp-tab-${value}`}
      >
        {value === "phone" ? phone : email}
      </div>
    </div>
  );
}

interface EmailOtpPanelProps {
  heading: ReactNode;
  description: ReactNode;
  /** Champagne CTA on the address step. */
  sendLabel?: string;
  /** Copy under the success check. */
  successCaption: string;
  /** Send a code to this address. Resolves ok even for an unknown address. */
  onSend: (email: string) => Promise<ActionResult>;
  /** Verify the code. The caller owns whatever happens next on success. */
  onVerify: (email: string, code: string) => Promise<ActionResult>;
  /** Native keyboards shouldn't pop on mount; web autofocuses. */
  autoFocus?: boolean;
}

/**
 * The email half of the passwordless flow: address in, six-digit code out,
 * code in, caller-owned outcome. Presentational and fully injected, so the
 * sign-in tab and the claim step share one implementation with two different
 * server-side meanings.
 */
export function EmailOtpPanel({
  heading,
  description,
  sendLabel = "Send code",
  successCaption,
  onSend,
  onVerify,
  autoFocus,
}: EmailOtpPanelProps) {
  const ms = useMotionSafe();
  const [stage, setStage] = useState<"address" | "code" | "done">("address");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setSending(true);
    setError(null);
    const res = await onSend(email.trim());
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStage("code");
  };

  if (stage === "done") {
    return (
      <div
        role="status"
        className="flex min-h-[220px] flex-col items-center justify-center gap-5 py-6 text-center"
      >
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--cream))]"
          initial={ms.enabled ? { scale: 0, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={ms.springs.bounce}
        >
          <Check className="h-8 w-8 text-[hsl(var(--cream-text))]" strokeWidth={3} />
        </motion.div>
        <motion.p
          className="font-serif-italic text-2xl text-cream"
          initial={ms.enabled ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={ms.enabled ? { duration: durations.base, ease: easings.out } : instant}
        >
          {successCaption}
        </motion.p>
      </div>
    );
  }

  if (stage === "code") {
    return (
      <EmailCodeEntry
        email={email.trim()}
        onVerify={async (code) => {
          const res = await onVerify(email.trim(), code);
          if (res.ok) setStage("done");
          return res;
        }}
        onResend={() => onSend(email.trim())}
        onBack={() => {
          setStage("address");
          setError(null);
        }}
      />
    );
  }

  return (
    <>
      <h1 className="mb-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.015em]">
        {heading}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">{description}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="otp-email" className="text-xs text-muted-foreground">
            Email
          </Label>
          <Input
            id="otp-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            autoFocus={autoFocus}
            aria-invalid={!!error}
            aria-describedby={error ? "otp-email-error" : undefined}
            className="h-12 rounded-xl border-border bg-surface text-base focus:border-foreground"
          />
        </div>

        {error && (
          <p id="otp-email-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={sending || !email}
          className="btn-champagne pressable flex h-12 w-full items-center justify-center gap-2 text-base disabled:pointer-events-none disabled:opacity-50"
        >
          {sending && <Loader2 className="h-4 w-4 animate-spin" />}
          {sendLabel}
        </button>
      </form>
    </>
  );
}

interface EmailCodeEntryProps {
  email: string;
  onVerify: (code: string) => Promise<ActionResult>;
  onResend: () => Promise<ActionResult>;
  onBack: () => void;
}

/**
 * Six-digit code entry for the email channel. Mirrors OtpEntryStep's proven
 * mechanics (auto-submit on the last digit, a ref guard against double fires,
 * a 30s resend countdown) with the copy the email channel needs; the phone
 * channel keeps using OtpEntryStep itself, untouched.
 */
function EmailCodeEntry({ email, onVerify, onResend, onBack }: EmailCodeEntryProps) {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (resendTimer === 0) return;
    const t = window.setTimeout(() => setResendTimer((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendTimer]);

  useEffect(() => {
    if (code.length !== EMAIL_CODE_LENGTH) return;
    // `verifying` is deliberately not a dependency: flipping it would re-run
    // the cleanup mid-await and strand the spinner. A ref guards double fires
    // instead (same reasoning as OtpEntryStep).
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    let cancelled = false;
    (async () => {
      setVerifying(true);
      setError(null);
      try {
        const res = await onVerify(code);
        if (cancelled) return;
        if (!res.ok) {
          hapticNotification("error");
          setError(res.error);
          setCode("");
        } else {
          hapticNotification("success");
        }
      } catch {
        if (!cancelled) {
          hapticNotification("error");
          setError("We couldn't verify that code. Try again.");
          setCode("");
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
  }, [code]);

  const handleResend = async () => {
    tapTick();
    setResending(true);
    setError(null);
    setResent(false);
    setCode("");
    const res = await onResend();
    setResending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // The countdown is now at least the server's own cooldown, so a resend that
    // reaches this line really did produce a new email. Say so: the boxes were
    // just cleared, and silence there reads as "nothing happened".
    setResent(true);
    setResendTimer(RESEND_SECONDS);
  };

  const counting = resendTimer > 0;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold leading-tight tracking-[-0.01em] sm:text-[32px]">
          Enter the <span className="font-serif-italic text-cream">code</span> we sent
        </h2>
        <p className="text-sm text-muted-foreground">
          Sent to <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>

      <div className="flex justify-center">
        <InputOTP
          value={code}
          onChange={(v) => {
            if (v.length > code.length) tapTick();
            if (resent) setResent(false);
            setCode(v);
          }}
          maxLength={EMAIL_CODE_LENGTH}
          disabled={verifying}
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
        >
          <InputOTPGroup className="gap-1.5">
            {Array.from({ length: EMAIL_CODE_LENGTH }).map((_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="h-12 w-10 rounded-md border-l text-lg first:rounded-l-md last:rounded-r-md sm:h-14 sm:w-11"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {verifying && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
        </div>
      )}
      {error && !verifying && (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {resent && !error && !verifying && (
        <p className="text-center text-sm text-muted-foreground" role="status">
          New code sent. It replaces the previous one.
        </p>
      )}

      <div className="space-y-2 pt-2">
        <div className="flex justify-center">
          {counting ? (
            <span
              className="inline-flex min-h-[44px] select-none items-center gap-1.5 rounded-full bg-surface-2 px-4 font-mono text-xs text-muted-foreground"
              aria-live="polite"
            >
              Resend in {fmtCountdown(resendTimer)}
            </span>
          ) : (
            <button
              type="button"
              disabled={resending || verifying}
              onClick={handleResend}
              className="pressable inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border px-4 text-xs text-cream transition-colors disabled:opacity-50 [@media(hover:hover)]:hover:border-border-hover"
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

        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] w-full items-center justify-center text-xs text-muted-foreground [@media(hover:hover)]:hover:text-foreground"
        >
          ← Use a different email
        </button>
      </div>
    </div>
  );
}

interface EmailSignInPanelProps {
  /**
   * Hands the minted tokens back to the page, which owns `setSession` and the
   * post-auth destination exactly as the phone path does.
   */
  onSession: (session: EmailOtpSession) => Promise<ActionResult>;
  autoFocus?: boolean;
}

/**
 * The Email SIGN-IN tab: S-3's `verify-email-otp` wired into EmailOtpPanel.
 * Every failure is contained here and rendered inline, so a broken email path
 * can never take the phone tab down with it.
 */
export function EmailSignInPanel({ onSession, autoFocus }: EmailSignInPanelProps) {
  return (
    <EmailOtpPanel
      autoFocus={autoFocus}
      heading={
        <>
          What's your <span className="font-serif-italic text-cream">email</span>?
        </>
      }
      description="We'll email a code. No password to remember."
      successCaption="Welcome back"
      onSend={sendEmailOtp}
      onVerify={async (email, code) => {
        const res = await verifyEmailOtpForSession(email, code);
        if (!res.ok) return { ok: false, error: res.error };
        return onSession(res.session);
      }}
    />
  );
}
