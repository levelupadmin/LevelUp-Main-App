import { useState, useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Star, ArrowRight, ShieldCheck } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import usePageTitle from "@/hooks/usePageTitle";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { OtpEntryStep } from "@/components/auth/OtpEntryStep";
import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp, retryOtp as widgetRetryOtp } from "@/lib/msg91-widget";
import { isNative } from "@/lib/platform";
import heroCinematic from "@/assets/login/hero-cinematic.jpg";

type Step = "phone" | "otp" | "email_input" | "email_sent";

// While true, every user (Indian or not) auths via email magic link.
// While false, +91 phones go through the MSG91 OTP widget (browser-side
// send via window.sendOtp, then a verify-msg91-otp edge function call
// that mints a Supabase session). Non-+91 phones still fall through to
// email magic link.
const EMAIL_ONLY_AUTH = false;

const VERIFY_MSG91_OTP_URL =
  "https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/verify-msg91-otp";

// 2026-05-26: Login refactor (Mobbin synthesis).
// — Killed the 5-slide carousel; replaced with one static cinematic still
//   (generated via gpt-image-2). Carousels split attention and tank the
//   only metric that matters here: did the user complete OTP.
// — Headline is now a singular question ("What's your number?") instead
//   of the returning-user "Welcome back" framing — ~half of /login
//   arrivals are first-touch from ads.
//
// 2026-05-30: Cinematic redesign. One unified responsive composition for
// web AND native (reverses the earlier native logo-only layout): a
// full-bleed hero with the "Make your first film." headline, then a glassy
// form card with a champagne "Send code →" CTA, a Secure & private line,
// star social proof, and a slim legal footer. Single column on mobile +
// native; two columns (form left / hero right) from `lg` up on web. The
// auth logic (phone/OTP/email) is unchanged.
const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [step, setStep] = useState<Step>(EMAIL_ONLY_AUTH ? "email_input" : "phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [loading, setLoading] = useState(false);

  // Animation key so the form column re-mounts the slide-in animation
  // on every step transition.
  const [stepKey, setStepKey] = useState(0);
  const goToStep = useCallback((next: Step) => {
    setStep(next);
    setStepKey((k) => k + 1);
  }, []);

  usePageTitle("Sign In");

  useEffect(() => {
    if (!authLoading && user) navigate("/home", { replace: true });
  }, [user, authLoading, navigate]);

  // Best-effort widget init on mount. If it fails (script blocked, env
  // vars missing) we'll retry inside handleSendOtp — the UI doesn't
  // surface this until the user actually clicks "Continue".
  useEffect(() => {
    if (EMAIL_ONLY_AUTH) return;
    initMsg91().catch(() => {});
  }, []);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (user) return null;

  const rawFrom = (location.state as any)?.from?.pathname || "/home";
  const redirectTarget = rawFrom.startsWith("/") && !rawFrom.includes("//") ? rawFrom : "/home";
  const isIndianPhone = phone.startsWith("+91");

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

  const handleSendOtp = async () => {
    if (!phone) {
      toast({ title: "Enter your phone number", variant: "destructive" });
      return;
    }
    if (!isIndianPhone) {
      goToStep("email_input");
      return;
    }
    setLoading(true);
    const res = await sendSmsOtp(false);
    setLoading(false);
    if (!res.ok) {
      const msg = (res.error || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("invalid")) {
        toast({
          title: "No account with this number",
          description: "Create an account first or check the number.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Couldn't send OTP", description: res.error, variant: "destructive" });
      }
      return;
    }
    setChannel("sms");
    goToStep("otp");
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
        body: JSON.stringify({ phone, accessToken: token }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data?.error === "signup_requires_email_and_name") {
          return { ok: false, error: "No account with this number. Sign up first." };
        }
        if (data?.error === "invalid_otp") return { ok: false, error: "Wrong code. Try again." };
        if (data?.error === "user_missing_email") return { ok: false, error: "Account is missing an email — contact support." };
        return { ok: false, error: data?.detail || data?.error || "Verification failed" };
      }
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (setErr) return { ok: false, error: setErr.message };
      navigate(redirectTarget, { replace: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Invalid OTP" };
    }
  };

  const handleSwitchToWA = async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await sendSmsOtp(true);
    if (res.ok) setChannel("whatsapp");
    return res;
  };

  const handleSwitchToEmail = () => goToStep("email_input");

  const handleEmailSubmit = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}${redirectTarget}`,
      },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Couldn't send email", description: "We couldn't send the login email. Please check the address and try again.", variant: "destructive" });
      return;
    }
    goToStep("email_sent");
  };

  const native = isNative();
  const stepNum = step === "phone" ? 1 : step === "otp" ? 2 : null;

  const stepContent = (
    <>
      {step === "phone" && (
        <>
          <h1 className="text-[28px] sm:text-[30px] font-semibold tracking-[-0.015em] leading-[1.1] mb-2">
            What's your <span className="font-serif-italic text-cream">number</span>?
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            We'll text a code. No password to remember.
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs text-muted-foreground">Phone number</Label>
              <PhoneInput value={phone} onChange={setPhone} autoFocus={!native} />
            </div>

            <button
              type="submit"
              disabled={loading || !phone}
              className="btn-champagne w-full h-12 flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send code
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Secure &amp; private
          </div>
        </>
      )}

      {step === "otp" && (
        <OtpEntryStep
          phone={phone}
          channel={channel}
          otpLength={4}
          onVerify={handleVerify}
          onResendSms={() => sendSmsOtp(false)}
          onSwitchToWhatsApp={handleSwitchToWA}
          onSwitchToEmail={handleSwitchToEmail}
          onBack={() => { goToStep("phone"); setChannel("sms"); }}
        />
      )}

      {step === "email_input" && (
        <>
          <h1 className="text-[28px] font-semibold tracking-[-0.015em] mb-2">
            Sign in with <span className="font-serif-italic text-cream">email</span>
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            We'll email a one-click sign-in link.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); handleEmailSubmit(); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={!native}
                required
                className="bg-surface border-border focus:border-foreground h-12 rounded-xl"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-champagne w-full h-12 flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send sign-in link
            </button>
            {!EMAIL_ONLY_AUTH && (
              <button
                type="button"
                onClick={() => goToStep("phone")}
                className="block w-full text-center text-xs text-muted-foreground hover:text-cream"
              >
                ← Use phone instead
              </button>
            )}
          </form>
        </>
      )}

      {step === "email_sent" && (
        <div className="text-center space-y-4 py-6">
          <div className="w-12 h-12 rounded-full bg-[hsl(var(--gold)/0.15)] flex items-center justify-center mx-auto">
            <Mail className="h-6 w-6 text-cream" />
          </div>
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to <span className="text-foreground font-medium">{email}</span>
          </p>
          <button
            onClick={() => { goToStep(EMAIL_ONLY_AUTH ? "email_input" : "phone"); setEmail(""); }}
            className="text-sm text-cream hover:underline"
          >
            Use a different email
          </button>
        </div>
      )}
    </>
  );

  // ── Reusable composition fragments ──────────────────────────────────
  const stepDivider = stepNum ? (
    <div className="flex items-center gap-3 mb-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Sign in</span>
      <span className="h-px flex-1 bg-border/70" />
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Step {stepNum} of 2</span>
    </div>
  ) : null;

  const socialProof = (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1.5">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="h-3 w-3 fill-cream text-cream" />
        ))}
        <span className="text-xs font-mono text-muted-foreground ml-1">4.8 · 1,200+ reviews</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Trusted by <span className="text-foreground">12,000+ Indian creators</span> learning from Lokesh, Nelson, Ravi Basrur, DRK Kiran &amp; more.
      </p>
    </div>
  );

  const formBlock = (
    <div className="w-full max-w-[400px] mx-auto">
      <div key={stepKey} className="animate-slide-left-in">
        {stepDivider}
        <div className="glass-card rounded-3xl p-6 sm:p-7">
          {stepContent}
        </div>
        {step === "phone" && socialProof}
        {step === "phone" && (
          <p className="mt-6 text-sm text-center text-muted-foreground">
            New here?{" "}
            <Link to="/signup" className="font-semibold text-cream hover:underline">
              Create an account
            </Link>
          </p>
        )}
      </div>
    </div>
  );

  const legalFooter = (
    <div className="space-y-2 pt-6">
      <div className="flex items-center justify-center gap-3 text-[11px] font-mono text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
        <span className="opacity-30">·</span>
        <Link to="/terms" className="hover:text-foreground">Terms</Link>
        <span className="opacity-30">·</span>
        <Link to="/refunds" className="hover:text-foreground">Refunds</Link>
        <span className="opacity-30">·</span>
        <a href="https://api.whatsapp.com/send?phone=919791520177&text=Hi" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Support</a>
      </div>
      <p className="text-[10px] text-center font-mono text-muted-foreground/60">
        © 2026 LevelUp Learning
      </p>
    </div>
  );

  // ── One responsive composition: single column on mobile + native,
  //    two columns (form left / hero right) from `lg` up on web. ───────
  return (
    <div className="min-h-screen bg-canvas flex flex-col lg:flex-row">
      {/* HERO — top on mobile/native, right pane on desktop */}
      <div className="relative h-[40vh] min-h-[300px] overflow-hidden lg:order-2 lg:h-auto lg:min-h-screen lg:flex-1">
        <img
          src={heroCinematic}
          alt="A filmmaker on set, locked into the moment behind a cinema camera"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        {/* Mobile gradient fades to canvas so the form sheet blends in */}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/65 to-canvas/10 lg:from-black/85 lg:via-black/35 lg:to-black/10" />

        {/* Mobile/native hero copy */}
        <div className="relative z-10 h-full flex flex-col justify-between p-6 safe-top lg:hidden">
          <div className="flex items-center justify-between">
            <LevelUpWordmark className="h-7 w-auto text-foreground" />
          </div>
          <div>
            <h2 className="text-[40px] sm:text-[48px] leading-[1.02] font-semibold text-foreground max-w-[14ch]">
              Make your <span className="font-serif-italic text-cream">first film</span>.
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-[32ch]">
              Trusted by 12,000+ Indian creators learning from working filmmakers.
            </p>
          </div>
        </div>

        {/* Desktop hero copy */}
        <div className="relative z-10 hidden lg:flex flex-col justify-end h-full p-12 pb-16">
          <div className="max-w-[520px]">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
              Make. Ship. Repeat.
            </p>
            <h2 className="text-[44px] xl:text-[56px] leading-[1.02] font-semibold text-foreground mb-4 max-w-[14ch]">
              Make your <span className="font-serif-italic text-cream">first film</span>.
            </h2>
            <p className="text-base text-muted-foreground max-w-[440px] leading-relaxed">
              Cohorts, masterclasses, and craft programs taught by India's
              best working filmmakers, editors, photographers, and storytellers.
            </p>
          </div>
        </div>
      </div>

      {/* FORM COLUMN — a rounded sheet rising over the hero on mobile */}
      <div className="relative z-10 flex flex-col flex-1 bg-canvas rounded-t-[28px] -mt-6 px-5 pt-7 pb-6 safe-bottom lg:bg-transparent lg:rounded-none lg:mt-0 lg:w-[480px] lg:min-w-[480px] lg:flex-none lg:border-r lg:border-border lg:px-10 lg:py-8">
        {/* Desktop wordmark (mobile shows it inside the hero) */}
        <div className="hidden lg:block mb-8">
          <LevelUpWordmark className="text-xl" />
        </div>

        <div className="flex-1 flex flex-col justify-center">
          {formBlock}
        </div>

        {legalFooter}
      </div>
    </div>
  );
};

export default Login;
