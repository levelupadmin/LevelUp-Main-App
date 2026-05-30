import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Mail, User, ArrowRight, ShieldCheck } from "lucide-react";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { OtpEntryStep } from "@/components/auth/OtpEntryStep";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import signupHeroImage from "@/assets/carousel/slide-bfp.jpg";

type Step = "form" | "otp" | "email_sent";

// Mirrors Login.tsx. 2026-05-23: flipped back to false after switching
// from MSG91 Flow API (silently dropping ##number## substitution) to
// the MSG91 widget pattern the Forge app ships.
const EMAIL_ONLY_AUTH = false;

// MSG91 widget verify URL (edge fn bridges widget access token → Supabase session).
const VERIFY_MSG91_OTP_URL =
  "https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/verify-msg91-otp";

// 2026-05-30: Cinematic redesign — mirrors Login.tsx. One unified
// responsive composition (web + native): full-bleed hero ("Learn the
// craft") + a glassy form card with mono-uppercase labels, icon-leading
// inputs, and a champagne "Create account →" CTA. Single column on
// mobile/native; two columns from `lg` up. Auth logic is unchanged.
import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp, retryOtp as widgetRetryOtp } from "@/lib/msg91-widget";

const Signup = () => {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("form");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate("/home", { replace: true });
  }, [user, authLoading, navigate]);

  // Best-effort widget init on mount. If the script is blocked or env
  // vars are missing we'll surface the error inside triggerOtp.
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

  const isIndianPhone = phone.startsWith("+91");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneValid = phone.length >= 8;
  const nameValid = fullName.trim().length >= 2;
  const formValid = nameValid && phoneValid && emailValid;

  const triggerOtp = async (waMode = false): Promise<{ ok: boolean; error?: string }> => {
    // +91 phones: MSG91 widget. window.sendOtp drops the SMS via MSG91's
    // own pipeline so the ##number## substitution issue that bit the
    // Flow API path can't happen here.
    if (!EMAIL_ONLY_AUTH && isIndianPhone) {
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
    }
    // Non-Indian phones (or fallback when EMAIL_ONLY_AUTH=true): email magic link.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/home`,
        data: { full_name: fullName.trim(), phone },
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) {
      toast({ title: "Please complete all fields", variant: "destructive" });
      return;
    }
    setLoading(true);
    const res = await triggerOtp(false);
    setLoading(false);
    if (!res.ok) {
      const msg = (res.error || "").toLowerCase();
      if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
        toast({
          title: "Account already exists",
          description: "Try signing in instead.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Couldn't create account", description: res.error, variant: "destructive" });
      }
      return;
    }
    setChannel("sms");
    // While DLT pending → email link for everyone. After flag flips,
    // Indian users get the OTP entry screen and others still get email.
    setStep(!EMAIL_ONLY_AUTH && isIndianPhone ? "otp" : "email_sent");
  };

  const handleVerify = async (otp: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      // Step 1: ask the widget to verify the digits with MSG91. On
      // success we get a short-lived access token (JWT) we hand to our
      // backend, which re-verifies with MSG91 server-to-server and
      // then mints the actual Supabase session for this phone.
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
          // Matches Forge's pattern - belt-and-braces against future
          // verify_jwt flips.
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          phone,
          accessToken: token,
          email,
          full_name: fullName.trim(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data?.error === "invalid_otp") return { ok: false, error: "Wrong code. Try again." };
        if (data?.error === "create_user_failed") return { ok: false, error: data?.detail || "Couldn't create account" };
        return { ok: false, error: data?.detail || data?.error || "Couldn't verify OTP" };
      }
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (setErr) return { ok: false, error: setErr.message };
      navigate("/home", { replace: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Invalid OTP" };
    }
  };

  const handleSwitchWA = async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await triggerOtp(true);
    if (res.ok) setChannel("whatsapp");
    return res;
  };

  const stepBody = (
    <>
      {step === "form" && (
        <>
          <h1 className="text-[28px] sm:text-[30px] font-semibold tracking-[-0.015em] leading-[1.1] mb-1.5">
            Create your <span className="font-serif-italic text-cream">account</span>
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Join LevelUp. Learn from India's best creators.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                  required
                  className="h-12 pl-10 text-base bg-surface border-border focus:border-foreground rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone" className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Phone number</Label>
              <PhoneInput value={phone} onChange={setPhone} />
              <p className="text-xs text-muted-foreground">
                {EMAIL_ONLY_AUTH
                  ? "We'll email you a sign-in link to verify your account."
                  : isIndianPhone
                  ? "We'll send a 4-digit OTP via SMS to verify."
                  : phone
                  ? "We'll email you a sign-in link to verify."
                  : "+91 by default. Tap the flag to change country."}
              </p>
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
                  required
                  className="h-12 pl-10 text-base bg-surface border-border focus:border-foreground rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !formValid}
              className="btn-champagne w-full h-12 flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
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
          onResendSms={() => triggerOtp(false)}
          onSwitchToWhatsApp={handleSwitchWA}
          onSwitchToEmail={() => {
            // For signup, "use email instead" means: switch to email magic link
            triggerOtp(false).then(() => setStep("email_sent")).catch(() => {});
          }}
          onBack={() => setStep("form")}
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
            onClick={() => setStep("form")}
            className="w-full h-11 rounded-xl border border-border text-sm text-foreground hover:border-border-hover flex items-center justify-center gap-2"
          >
            <Mail className="h-4 w-4" /> Use a different email
          </button>
        </div>
      )}
    </>
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
      <p className="text-[10px] text-center font-mono text-muted-foreground/60">© 2026 LevelUp Learning</p>
    </div>
  );

  // ── One responsive composition: single column on mobile + native,
  //    two columns (form left / hero right) from `lg` up on web. ───────
  return (
    <div className="min-h-screen bg-canvas flex flex-col lg:flex-row">
      {/* HERO — top on mobile/native, right pane on desktop */}
      <div className="relative h-[40vh] min-h-[300px] overflow-hidden lg:order-2 lg:h-auto lg:min-h-screen lg:flex-1">
        <img
          src={signupHeroImage}
          alt="A creator at work on a film set"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/65 to-canvas/10 lg:from-black/85 lg:via-black/35 lg:to-black/10" />

        {/* Mobile/native hero copy */}
        <div className="relative z-10 h-full flex flex-col justify-between p-6 safe-top lg:hidden">
          <div className="flex items-center justify-between">
            <LevelUpWordmark className="h-7 w-auto text-foreground" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Creators who ship</p>
            <h2 className="text-[44px] sm:text-[52px] leading-[1] font-semibold text-foreground max-w-[14ch]">
              Learn the <span className="font-serif-italic text-cream">craft</span>
            </h2>
          </div>
        </div>

        {/* Desktop hero copy */}
        <div className="relative z-10 hidden lg:flex flex-col justify-end h-full p-12 pb-16">
          <div className="max-w-[520px]">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">Creators who ship</p>
            <h2 className="text-[44px] xl:text-[56px] leading-[1.02] font-semibold text-foreground mb-4 max-w-[14ch]">
              Learn the <span className="font-serif-italic text-cream">craft</span>
            </h2>
            <p className="text-base text-muted-foreground max-w-[440px] leading-relaxed">
              Join 12,000+ creators learning directly from India's best working
              filmmakers, editors, photographers, and storytellers.
            </p>
          </div>
        </div>
      </div>

      {/* FORM COLUMN — a rounded sheet rising over the hero on mobile */}
      <div className="relative z-10 flex flex-col flex-1 bg-canvas rounded-t-[28px] -mt-6 px-5 pt-7 pb-6 safe-bottom lg:bg-transparent lg:rounded-none lg:mt-0 lg:w-[480px] lg:min-w-[480px] lg:flex-none lg:border-r lg:border-border lg:px-10 lg:py-8">
        <div className="hidden lg:block mb-8">
          <LevelUpWordmark className="text-xl" />
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <div className="w-full max-w-[400px] mx-auto">
            <div className="glass-card rounded-3xl p-6 sm:p-7">
              {stepBody}
            </div>
            {step === "form" && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-cream hover:underline">
                  Sign in
                </Link>
              </p>
            )}
          </div>
        </div>

        {legalFooter}
      </div>
    </div>
  );
};

export default Signup;
