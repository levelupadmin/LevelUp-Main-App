import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Mail, User, ArrowRight, ShieldCheck, ChevronLeft } from "lucide-react";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { OtpEntryStep } from "@/components/auth/OtpEntryStep";
import { InstructorProof } from "@/components/auth/InstructorProof";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import { hapticImpact } from "@/lib/haptics";
import signupHeroImage from "@/assets/carousel/slide-bfp.jpg";

// 2026-06-10: Phone-first signup (item 11). The form now collects ONLY a phone
// number; name + email move to the post-OTP onboarding step (Onboarding.tsx),
// which is the first thing a verified account sees. This drops the signup form
// to a single field (the lowest-friction path to a verified account) and
// matches the phone-first Login flow.
//
// Mechanics: the verify-msg91-otp edge fn needs an email + name to mint a NEW
// auth user. For a +91 phone we hand it a synthetic placeholder email
// (<digits>@phone.leveluplearning.in, the exact pattern the backend itself
// uses for phone-only legacy users) and "LevelUp Student" as the name, then
// Onboarding collects the real values and overwrites them in the users row.
// Non-+91 phones can't use MSG91; they fall back to an inline email magic-link
// (which DOES need an email up front), so for those we reveal a compact
// email+name capture before sending the link.

const EMAIL_ONLY_AUTH = false;

const VERIFY_MSG91_OTP_URL =
  "https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/verify-msg91-otp";

import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp, retryOtp as widgetRetryOtp } from "@/lib/msg91-widget";

type Step = "phone" | "email_form" | "otp" | "email_sent";

// Synthetic placeholder email for the phone-first signup. Mirrors the
// edge function's own legacy fallback so the account can be created before we
// ask for the real address (captured in Onboarding).
const syntheticEmail = (phone: string) =>
  `${phone.replace(/\D/g, "")}@phone.leveluplearning.in`;
const PLACEHOLDER_NAME = "LevelUp Student";

const Signup = () => {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(EMAIL_ONLY_AUTH ? "email_form" : "phone");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [loading, setLoading] = useState(false);

  const [stepKey, setStepKey] = useState(0);
  const goToStep = useCallback((next: Step) => {
    setStep(next);
    setStepKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!authLoading && user) navigate("/home", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (EMAIL_ONLY_AUTH) return;
    initMsg91().catch(() => {});
  }, []);

  if (authLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (user) return null;

  const isIndianPhone = phone.startsWith("+91");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneValid = phone.length >= 8;
  const nameValid = fullName.trim().length >= 2;

  // For +91 phones: send a real MSG91 OTP. For everyone else (or when
  // EMAIL_ONLY_AUTH): email magic link, which needs email + name up front.
  const sendSmsOtp = async (waMode = false): Promise<{ ok: boolean; error?: string }> => {
    try {
      await initMsg91();
      if (waMode) {
        await widgetRetryOtp("whatsapp");
      } else {
        await widgetSendOtp(phone);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Couldn't send OTP" };
    }
  };

  const sendEmailLink = async (): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/onboarding`,
        data: { full_name: fullName.trim(), phone },
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  // Phone-first submit: a +91 number goes straight to OTP (no name/email).
  // A non-+91 number reveals the inline email+name capture instead.
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneValid) {
      toast({ title: "Enter your phone number", variant: "destructive" });
      return;
    }
    if (EMAIL_ONLY_AUTH || !isIndianPhone) {
      goToStep("email_form");
      return;
    }
    setLoading(true);
    const res = await sendSmsOtp(false);
    setLoading(false);
    if (!res.ok) {
      toast({ title: "Couldn't send OTP", description: res.error, variant: "destructive" });
      return;
    }
    setChannel("sms");
    goToStep("otp");
  };

  // Non-+91 path: collect email+name, then email magic link.
  const handleEmailFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid || !emailValid) {
      toast({ title: "Add your name and a valid email", variant: "destructive" });
      return;
    }
    setLoading(true);
    const res = await sendEmailLink();
    setLoading(false);
    if (!res.ok) {
      const msg = (res.error || "").toLowerCase();
      if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
        toast({ title: "Account already exists", description: "Try signing in instead.", variant: "destructive" });
      } else {
        toast({ title: "Couldn't create account", description: res.error, variant: "destructive" });
      }
      return;
    }
    goToStep("email_sent");
  };

  const handleVerify = async (otp: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      let token: string;
      try {
        const r = await widgetVerifyOtp(otp);
        token = r.accessToken;
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Wrong code. Try again." };
      }

      const resp = await fetch(VERIFY_MSG91_OTP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          phone,
          accessToken: token,
          // Phone-first: provision with placeholders so the new account can be
          // created. Onboarding immediately collects the real name + email.
          email: syntheticEmail(phone),
          full_name: PLACEHOLDER_NAME,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data?.error === "invalid_otp") return { ok: false, error: "Wrong code. Try again." };
        if (data?.error === "email_in_use") return { ok: false, error: "An account already exists. Please sign in instead." };
        if (data?.error === "create_user_failed") return { ok: false, error: data?.detail || "Couldn't create account" };
        return { ok: false, error: data?.detail || data?.error || "Couldn't verify OTP" };
      }
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (setErr) return { ok: false, error: setErr.message };
      // Brand-new accounts always go through onboarding (name/email + crafts).
      // A returning/legacy phone (is_new_user=false) that already has crafts is
      // bounced to /home by Onboarding's own guard, so /onboarding is always safe.
      hapticImpact("medium");
      navigate("/onboarding", { replace: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Invalid OTP" };
    }
  };

  const handleSwitchWA = async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await sendSmsOtp(true);
    if (res.ok) setChannel("whatsapp");
    return res;
  };

  // Back affordance. iOS has no system back button, so the top-left chevron is
  // the way out. From the phone step it returns to Sign in; the email_form and
  // email_sent steps return to the phone step. The OTP step owns its own back.
  const canGoBack = step === "phone" || step === "email_form" || step === "email_sent";
  const handleBack = () => {
    if (step === "phone") {
      navigate("/login");
    } else {
      goToStep("phone");
    }
  };

  const stepBody = (
    <>
      {step === "phone" && (
        <>
          <h1 className="text-[28px] sm:text-[30px] font-semibold tracking-[-0.015em] leading-[1.1] mb-1.5">
            Create your <span className="font-serif-italic text-cream">account</span>
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Start with your number. We'll set up the rest in a sec.
          </p>

          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Phone number</Label>
              <PhoneInput value={phone} onChange={setPhone} autoFocus={false} />
              <p className="text-xs text-muted-foreground">
                {isIndianPhone
                  ? "We'll send a 4-digit OTP via SMS to verify."
                  : phone
                  ? "We'll email you a sign-in link to verify."
                  : "+91 by default. Tap the flag to change country."}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !phoneValid}
              className="btn-champagne w-full h-12 flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Continue
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Secure &amp; private
          </div>
        </>
      )}

      {step === "email_form" && (
        <>
          <h1 className="text-[28px] sm:text-[30px] font-semibold tracking-[-0.015em] leading-[1.1] mb-1.5">
            A couple of <span className="font-serif-italic text-cream">details</span>
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            We'll email you a one-click sign-in link to finish.
          </p>

          <form onSubmit={handleEmailFormSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Full name</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                  className="h-12 pl-10 text-base bg-surface border-border focus:border-foreground rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="h-12 pl-10 text-base bg-surface border-border focus:border-foreground rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !nameValid || !emailValid}
              className="btn-champagne w-full h-12 flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send sign-in link
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </>
      )}

      {step === "otp" && (
        <OtpEntryStep
          phone={phone}
          channel={channel}
          otpLength={4}
          onVerify={handleVerify}
          onResendSms={() => sendSmsOtp(false)}
          onSwitchToWhatsApp={handleSwitchWA}
          onSwitchToEmail={() => goToStep("email_form")}
          onBack={() => goToStep("phone")}
        />
      )}

      {step === "email_sent" && (
        <div className="text-center space-y-5 py-4">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-[hsl(var(--success)/0.15)] mx-auto">
            <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Check your email</h2>
            <p className="text-sm text-muted-foreground mt-2">
              We sent a sign-in link to <strong className="text-foreground">{email}</strong>. Click it to finish setting up your account.
            </p>
          </div>
          <button
            onClick={() => goToStep("email_form")}
            className="w-full h-11 rounded-xl border border-border text-sm text-foreground hover:border-border-hover flex items-center justify-center gap-2"
          >
            <Mail className="h-4 w-4" /> Use a different email
          </button>
        </div>
      )}
    </>
  );

  // One responsive composition: single column on mobile + native, two columns
  // (form left / hero right) from `lg` up on web. Mirrors Login.tsx.
  return (
    <div className="min-h-[100dvh] bg-canvas flex flex-col lg:flex-row">
      {/* HERO: slim strip on mobile/native, right pane on desktop */}
      <div className="relative h-[20vh] min-h-[140px] shrink-0 overflow-hidden lg:order-2 lg:h-auto lg:min-h-[100dvh] lg:flex-1 lg:shrink">
        <img
          src={signupHeroImage}
          alt="A creator at work on a film set"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/65 to-canvas/10 lg:from-black/85 lg:via-black/35 lg:to-black/10" />

        <div className="relative z-10 h-full flex flex-col justify-between p-6 safe-top lg:hidden">
          <div className="flex items-center justify-between">
            <LevelUpWordmark className="h-7 w-auto text-foreground" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Learn the craft · Creators who ship
          </p>
        </div>

        <div className="relative z-10 hidden lg:flex flex-col justify-end h-full p-12 pb-16">
          <div className="max-w-[520px]">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">Creators who ship</p>
            <h2 className="text-[44px] xl:text-[56px] leading-[1.02] font-semibold text-foreground mb-4 max-w-[14ch]">
              Learn the <span className="font-serif-italic text-cream">craft</span>
            </h2>
            <p className="text-base text-muted-foreground max-w-[440px] leading-relaxed">
              Join 12,000+ creators leveling up across film, writing, design,
              content, and AI, taught by India's best working creators.
            </p>
          </div>
        </div>
      </div>

      {/* FORM COLUMN: a rounded sheet rising over the hero on mobile */}
      <div className="relative z-10 flex flex-col flex-1 bg-canvas rounded-t-[28px] -mt-6 px-5 pt-7 pb-6 safe-bottom lg:bg-transparent lg:rounded-none lg:mt-0 lg:w-[480px] lg:min-w-[480px] lg:flex-none lg:border-r lg:border-border lg:px-10 lg:py-8">
        <div className="flex items-center gap-2 min-h-[44px] mb-4 lg:mb-8">
          {canGoBack && (
            <button
              type="button"
              onClick={handleBack}
              aria-label={step === "phone" ? "Back to sign in" : "Back"}
              className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground active:scale-95 transition lg:-ml-3"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          <LevelUpWordmark className="hidden lg:block text-xl" />
        </div>

        <div className="flex-1 flex flex-col justify-start">
          <div className="w-full max-w-[400px] mx-auto">
            <div key={stepKey} className="animate-slide-left-in">
              <div className="glass-card rounded-3xl p-6 sm:p-7">
                {stepBody}
              </div>
              {step === "phone" && <InstructorProof className="mt-6" />}
              {step === "phone" && (
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/login" className="font-semibold text-cream hover:underline">
                    Sign in
                  </Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
