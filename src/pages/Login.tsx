import { useState, useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Star } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import usePageTitle from "@/hooks/usePageTitle";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { OtpEntryStep } from "@/components/auth/OtpEntryStep";
import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp, retryOtp as widgetRetryOtp } from "@/lib/msg91-widget";
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
// — Social-proof line under the form ("Trusted by 12,000+ Indian
//   creators") doubles as trust signal for new + familiar for returning.
// — Step 1 → Step 2 transition is a 240ms slide-left of just the form
//   column; the hero stays static so the page feels like one continuous
//   action, not a screen swap.
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
      toast({ title: "Couldn't send email", description: error.message, variant: "destructive" });
      return;
    }
    goToStep("email_sent");
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
    <div className="flex flex-col lg:flex-row flex-1">
      {/* Mobile hero (collapses below the form on desktop) */}
      <div className="lg:hidden relative h-[38vh] md:h-[44vh] overflow-hidden">
        <img
          src={heroCinematic}
          alt="A filmmaker on set, locked into the moment behind a cinema camera"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />
        <div className="relative z-10 h-full flex flex-col justify-end p-6 pb-7">
          <h2 className="text-[40px] sm:text-[52px] leading-[1.02] font-semibold text-foreground max-w-[14ch]">
            Make your <span className="font-serif-italic text-cream">first film</span>.
          </h2>
          <p className="text-sm text-muted-foreground mt-3 max-w-[28ch]">
            Trusted by 12,000+ Indian creators learning from working filmmakers.
          </p>
        </div>
      </div>

      {/* Form column */}
      <div className="w-full lg:w-[460px] lg:min-w-[460px] flex flex-col justify-between px-6 sm:px-10 py-8 lg:border-r border-border">
        <div>
          <LevelUpWordmark className="text-xl" />
        </div>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-[360px] mx-auto">
            <div key={stepKey} className="animate-slide-left-in">
              {step === "phone" && (
                <>
                  <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70 mb-2">
                    Sign in · Step 1 of 2
                  </p>
                  <h1 className="text-[34px] sm:text-[36px] font-semibold tracking-[-0.015em] leading-[1.05] mb-2">
                    What's your <span className="font-serif-italic text-cream">number</span>?
                  </h1>
                  <p className="text-sm text-muted-foreground mb-7">
                    We'll text a code. No password to remember.
                  </p>

                  <form
                    onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm text-muted-foreground">Phone number</Label>
                      <PhoneInput value={phone} onChange={setPhone} autoFocus />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !phone}
                      className="w-full h-12 bg-cream text-cream-text font-semibold rounded-md hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2 text-base"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Send code
                    </button>
                  </form>

                  {/* Social proof — anchors trust at the moment of friction */}
                  <div className="mt-8 pt-6 border-t border-border/40">
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
                  <h1 className="text-[32px] font-semibold tracking-[-0.015em] mb-2">
                    Sign in with <span className="font-serif-italic text-cream">email</span>
                  </h1>
                  <p className="text-sm text-muted-foreground mb-7">
                    We'll email a one-click sign-in link.
                  </p>
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleEmailSubmit(); }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm text-muted-foreground">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoFocus
                        required
                        className="bg-surface border-border focus:border-foreground h-11"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full h-12 bg-cream text-cream-text font-semibold rounded-md hover:-translate-y-0.5 transition-transform disabled:opacity-50 flex items-center justify-center gap-2 text-base"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      Send sign-in link
                    </button>
                    {!EMAIL_ONLY_AUTH && (
                      <button
                        type="button"
                        onClick={() => goToStep("phone")}
                        className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
                      >
                        ← Use phone instead
                      </button>
                    )}
                  </form>
                </>
              )}

              {step === "email_sent" && (
                <div className="text-center space-y-4 py-6">
                  <div className="w-12 h-12 rounded-full bg-[hsl(var(--accent-amber)/0.15)] flex items-center justify-center mx-auto">
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
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-center text-muted-foreground">
            New here?{" "}
            <Link to="/signup" className="font-semibold text-foreground hover:underline">
              Create an account
            </Link>
          </p>
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
      </div>

      {/* Desktop hero — single static cinematic still, no carousel */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <img
          src={heroCinematic}
          alt="A filmmaker on set, locked into the moment behind a cinema camera"
          className="absolute inset-0 w-full h-full object-cover z-0"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10 z-[1]" />

        <div className="relative z-10 flex flex-col justify-end p-12 pb-16 w-full">
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
    </div>
    </div>
  );
};

export default Login;
