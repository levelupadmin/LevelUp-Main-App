import { useState } from "react";
import { supabase, supabaseUrl, supabasePublishableKey } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { toast } from "@/lib/toast";
import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp } from "@/lib/msg91-widget";
import { isStagingTestLogin } from "@/lib/stagingLogin";

/**
 * "Your details" on the checkout for someone not signed in: verify, then pay.
 *
 * - Indian number: name + phone, one SMS code (verify-msg91-otp). The phone
 *   decides the account: an existing one signs in, a new one is made with no
 *   email (the app asks for one later, optionally).
 * - Any other number: name + phone + email (required), one code to the email
 *   (checkout-email-identity). Before sending, the email and number are
 *   checked against existing accounts, and a mismatch is shown with what to do.
 *
 * Success sets the session; the checkout re-renders as signed in and the normal
 * signed-in Pay takes over, so the buyer lands on their course after paying.
 */

const MSG91_VERIFY_URL = `${supabaseUrl}/functions/v1/verify-msg91-otp`;
const EMAIL_IDENTITY_URL = `${supabaseUrl}/functions/v1/checkout-email-identity`;
const REVIEW_PHONE = "+918888777666";
const syntheticEmail = (phone: string) => `${phone.replace(/\D/g, "")}@phone.leveluplearning.in`;

type Reply = { ok: boolean; data: Record<string, string | boolean | undefined> };

const post = async (url: string, body: Record<string, string>): Promise<Reply> => {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabasePublishableKey },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, data };
};

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

type Conflict = { title: string; detail: string; canUseEmailCode: boolean };

export default function CheckoutVerify() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"details" | "code">("details");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const indian = phone === "" || phone.startsWith("+91");
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneOk = indian ? /^91\d{10}$/.test(phoneDigits) : phoneDigits.length >= 8 && phoneDigits.length <= 15;
  const reviewLike = phone === REVIEW_PHONE || isStagingTestLogin(phone);
  const codeLength = indian ? 4 : 6;

  const resetToDetails = () => {
    setStep("details");
    setCode("");
    setError(null);
  };

  const sendEmailCode = async () => {
    const r = await post(EMAIL_IDENTITY_URL, { action: "send", email: email.trim() });
    if (!r.ok) throw new Error(r.data.error === "too_many_requests" ? "Too many tries. Wait a few minutes." : "We couldn't send the code.");
    setStep("code");
    setCode("");
  };

  const getCode = async () => {
    setError(null);
    setConflict(null);
    if (!name.trim()) return setError("Please enter your name.");
    if (!phoneOk) return setError("Please enter a valid phone number.");
    if (!indian && !isEmail(email)) return setError("Please enter your email. We send your code there.");
    setBusy(true);
    try {
      if (indian) {
        if (!reviewLike) {
          await initMsg91();
          await widgetSendOtp(phone);
        }
        setStep("code");
        setCode("");
        return;
      }
      const check = await post(EMAIL_IDENTITY_URL, { action: "check", email: email.trim(), phone });
      if (!check.ok) throw new Error(check.data.error === "too_many_requests" ? "Too many tries. Wait a few minutes." : "Please check the number and email.");
      const status = check.data.status as string;
      const hint = (check.data.hint as string) || "";
      if (status === "email_other_phone") {
        setConflict({
          title: `This email is linked to ${hint}.`,
          detail: "Use that number, or a different email. Forgot your number? Get a code on this email to open your account.",
          canUseEmailCode: true,
        });
        return;
      }
      if (status === "phone_other_email" || status === "split") {
        setConflict({
          title: `This number is linked to ${hint}.`,
          detail: "Use that email, or a different number.",
          canUseEmailCode: false,
        });
        return;
      }
      await sendEmailCode();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const useEmailCodeAnyway = async () => {
    setBusy(true);
    setError(null);
    try {
      setConflict(null);
      await sendEmailCode();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.length !== codeLength) return setError(`Enter the ${codeLength}-digit code.`);
    setBusy(true);
    setError(null);
    try {
      let reply: Reply;
      if (indian) {
        let token: string | null = null;
        if (!reviewLike) {
          try {
            token = (await widgetVerifyOtp(code)).accessToken;
          } catch {
            setError("That code didn't work. Check it and try again.");
            return;
          }
        }
        const base: Record<string, string> = reviewLike ? { phone, reviewCode: code } : { phone, accessToken: token as string };
        // Sign in first; only a number with no account is created, with the
        // typed name and no email (the app asks for one later).
        reply = await post(MSG91_VERIFY_URL, base);
        if (!reply.ok && reply.data.error === "signup_requires_email_and_name") {
          reply = await post(MSG91_VERIFY_URL, { ...base, email: syntheticEmail(phone), full_name: name.trim() });
        }
      } else {
        reply = await post(EMAIL_IDENTITY_URL, { action: "verify", email: email.trim(), code, phone, name: name.trim() });
      }

      if (!reply.ok) {
        const err = reply.data.error as string;
        if (err === "invalid_otp" || err === "invalid_code" || err === "code_expired" || err === "code_already_used") {
          setError(err === "code_expired" ? "That code has expired. Get a new one." : "That code didn't work. Check it and try again.");
        } else if (err === "too_many_attempts") {
          setError("Too many wrong codes. Wait an hour, or use a different email.");
        } else if (err === "phone_other_email") {
          resetToDetails();
          setConflict({ title: `This number is linked to ${reply.data.hint || "another email"}.`, detail: "Use that email, or a different number.", canUseEmailCode: false });
        } else {
          setError((reply.data.detail as string) || "We couldn't sign you in. Try again in a moment.");
        }
        return;
      }

      const { error: setErr } = await supabase.auth.setSession({
        access_token: reply.data.access_token as string,
        refresh_token: reply.data.refresh_token as string,
      });
      if (setErr) {
        setError(setErr.message);
        return;
      }
      toast.success(reply.data.is_new_user ? "Your account is ready. Now pay to finish." : "Welcome back. Now pay to finish.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" id="checkout-verify">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your details</p>

      {step === "details" ? (
        <>
          <div>
            <label htmlFor="verify-name" className="caption mb-1 block">Full name</label>
            <Input id="verify-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="h-11" autoComplete="name" />
          </div>
          <div>
            <label htmlFor="verify-phone" className="caption mb-1 block">Phone number</label>
            <PhoneInput id="verify-phone" value={phone} onChange={(v) => { setPhone(v); setConflict(null); }} placeholder="Phone number" />
          </div>
          {!indian && (
            <div>
              <label htmlFor="verify-email" className="caption mb-1 block">Email address</label>
              <Input
                id="verify-email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setConflict(null); }}
                placeholder="Email address"
                type="email"
                inputMode="email"
                className="h-11"
                autoComplete="email"
              />
            </div>
          )}

          {conflict && (
            <div role="alert" className="rounded-xl bg-surface-2 p-3 space-y-2 text-sm">
              <p className="font-medium">{conflict.title}</p>
              <p className="text-muted-foreground">{conflict.detail}</p>
              {conflict.canUseEmailCode && (
                <Button type="button" variant="outline" size="sm" onClick={useEmailCodeAnyway} disabled={busy}>
                  Get a code on this email
                </Button>
              )}
            </div>
          )}

          <Button type="button" className="w-full h-11" onClick={getCode} disabled={busy}>
            {busy ? "Sending…" : indian ? "Get code by SMS" : "Get code by email"}
          </Button>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            {indian
              ? "We text you a code to confirm your number. Your course is tied to it."
              : "Outside India, we send your code by email. You'll sign in with this email."}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Enter the {codeLength}-digit code we sent to <span className="text-foreground">{indian ? phone : email.trim()}</span>.
          </p>
          <Input
            id="verify-code"
            aria-label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, codeLength))}
            onKeyDown={(e) => { if (e.key === "Enter") void verify(); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={"•".repeat(codeLength)}
            className="h-11 tracking-[0.4em] text-center text-lg"
            autoFocus
          />
          <Button type="button" className="w-full h-11" onClick={verify} disabled={busy}>
            {busy ? "Checking…" : "Verify and continue"}
          </Button>
          <button type="button" onClick={resetToDetails} className="text-xs text-muted-foreground hover:underline min-h-[44px]">
            Change number or email
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-[hsl(var(--destructive-text))]">{error}</p>
      )}
    </div>
  );
}
