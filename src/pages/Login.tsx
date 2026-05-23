import { useState, useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowRight, CheckCircle2 } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import usePageTitle from "@/hooks/usePageTitle";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { OtpEntryStep } from "@/components/auth/OtpEntryStep";
import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp, retryOtp as widgetRetryOtp } from "@/lib/msg91-widget";
import slideBfp from "@/assets/carousel/slide-bfp.jpg";
import slideVea from "@/assets/carousel/slide-vea.jpg";
import slideUiux from "@/assets/carousel/slide-uiux.jpg";
import slideSmp from "@/assets/carousel/slide-smp.jpg";
import slideMasterclasses from "@/assets/carousel/slide-masterclasses.jpg";

const FALLBACK_SLIDES = [
  { category: "LIVE COHORT", title: "Make your first", italic: "film", subtitle: "12-week Breakthrough Filmmakers' Program", image: slideBfp },
  { category: "LIVE COHORT", title: "Cut like a", italic: "pro", subtitle: "Video Editing Academy", image: slideVea },
  { category: "LIVE COHORT", title: "Design that", italic: "ships", subtitle: "UI/UX Academy", image: slideUiux },
  { category: "LIVE COHORT", title: "Write the", italic: "story", subtitle: "Screenwriting Mastery Program", image: slideSmp },
  { category: "ALL MASTERCLASSES", title: "Learn from the", italic: "greats", subtitle: "Every masterclass. One pass.", image: slideMasterclasses },
];

interface SlideData {
  category: string;
  title: string;
  italic: string;
  subtitle: string;
  image: string;
}

type Step = "phone" | "otp" | "email_input" | "email_sent";

// While true, every user (Indian or not) auths via email magic link.
// While false, +91 phones go through the MSG91 OTP widget (browser-side
// send via window.sendOtp, then a verify-msg91-otp edge function call
// that mints a Supabase session). Non-+91 phones still fall through to
// email magic link.
//
// 2026-05-23: flipped back to false after switching from MSG91 Flow API
// (which silently dropped the ##number## substitution for our account)
// to the MSG91 widget pattern the Forge app uses. The widget renders
// the template inside MSG91's pipeline, so the blank-OTP failure mode
// no longer applies.
const EMAIL_ONLY_AUTH = false;

const VERIFY_MSG91_OTP_URL =
  "https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/verify-msg91-otp";

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

  const [slides, setSlides] = useState<SlideData[]>(FALLBACK_SLIDES);
  const [activeSlide, setActiveSlide] = useState(0);

  usePageTitle("Sign In");

  useEffect(() => {
    if (!authLoading && user) navigate("/home", { replace: true });
  }, [user, authLoading, navigate]);

  // Best-effort widget init on mount. If it fails (script blocked, env
  // vars missing) we'll retry inside handleSendOtp - the UI doesn't
  // surface this until the user actually clicks "Send OTP".
  useEffect(() => {
    if (EMAIL_ONLY_AUTH) return;
    initMsg91().catch(() => {});
  }, []);

  useEffect(() => {
    supabase
      .from("hero_slides")
      .select("*")
      .eq("is_active", true)
      .or("placement.eq.login,placement.eq.both")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (error || !data?.length) return;
        const now = new Date();
        const filtered = data.filter((s: any) =>
          s.image_url &&
          (!s.starts_at || new Date(s.starts_at) <= now) &&
          (!s.expires_at || new Date(s.expires_at) >= now)
        );
        if (filtered.length) {
          setSlides(filtered.map((s: any) => ({
            category: s.category_label || "",
            title: s.title_prefix || "",
            italic: s.title_accent || "",
            subtitle: s.subtitle || "",
            image: s.image_url || "",
          })));
        }
      });
  }, []);

  const nextSlide = useCallback(() => setActiveSlide((p) => (p + 1) % slides.length), [slides.length]);
  useEffect(() => {
    const t = setInterval(nextSlide, 6000);
    return () => clearInterval(t);
  }, [nextSlide]);

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
    // MSG91 widget path: window.sendOtp dispatches the SMS via MSG91's
    // own pipeline (the template gets rendered inside MSG91, so the
    // ##number## substitution that broke our Flow API path can't fail
    // here). waMode triggers the WhatsApp channel via retryOtp, but
    // only after an initial send - MSG91 doesn't allow channel choice
    // on the first dispatch.
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
      setStep("email_input");
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
    setStep("otp");
  };

  const handleVerify = async (otp: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      // Step 1: verify the digits with MSG91 widget. Success returns a
      // short-lived JWT access token we forward to our backend.
      let token: string;
      try {
        const r = await widgetVerifyOtp(otp);
        token = r.accessToken;
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Wrong code. Try again." };
      }

      // Step 2: backend re-verifies the token with MSG91 server-to-server
      // (defence in depth - the client could lie), then mints a Supabase
      // session for the phone-matched auth.users row.
      const resp = await fetch(VERIFY_MSG91_OTP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Matches Forge's pattern - belt-and-braces against future
          // verify_jwt flips.
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
        if (data?.error === "user_missing_email") return { ok: false, error: "Account is missing an email - contact support." };
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

  const handleSwitchToEmail = () => {
    setStep("email_input");
  };

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
    setStep("email_sent");
  };

  const slide = slides[activeSlide];

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
    <div className="flex flex-col lg:flex-row flex-1">
      <div className="lg:hidden relative h-[40vh] md:h-[50vh] overflow-hidden">
        {slide.image && (
          <img key={activeSlide} src={slide.image} alt={slide.title + " " + slide.italic} className="absolute inset-0 w-full h-full object-cover" loading="eager" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />
        <div className="relative z-10 h-full flex flex-col justify-end p-6 pb-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{slide.category}</p>
          <h2 className="text-[44px] sm:text-[56px] leading-[1] font-semibold text-foreground max-w-[14ch]">
            {slide.title} <span className="font-serif-italic text-cream">{slide.italic}</span>
          </h2>
          <div className="flex gap-1.5 mt-5">
            {slides.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all ${i === activeSlide ? "w-8 bg-white" : "w-4 bg-white/30"}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[420px] lg:min-w-[420px] flex flex-col justify-between px-6 sm:px-8 py-8 lg:border-r border-border">
        <div>
          <LevelUpWordmark className="text-xl" />
        </div>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-[340px] mx-auto">
            {step === "phone" && (
              <>
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70 mb-2">
                  Step 1 of 2
                </p>
                <h1 className="text-3xl sm:text-[32px] font-semibold tracking-[-0.01em] leading-tight mb-2">
                  Welcome <span className="font-serif-italic text-cream">back</span>
                </h1>
                <p className="text-sm text-muted-foreground mb-6">Sign in to continue your craft.</p>

                <form
                  onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm text-muted-foreground">Phone number</Label>
                    <PhoneInput value={phone} onChange={setPhone} autoFocus />
                    <p className="text-xs text-muted-foreground">
                      {isIndianPhone
                        ? "We'll send a 4-digit code via SMS."
                        : phone
                        ? "We'll send a sign-in link to your email."
                        : "+91 by default. Tap the flag to change country."}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !phone}
                    className="w-full h-12 bg-cream text-cream-text font-semibold rounded-md hover:-translate-y-0.5 transition-transform disabled:opacity-50 flex items-center justify-center gap-2 text-base"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Continue
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
                onSwitchToWhatsApp={handleSwitchToWA}
                onSwitchToEmail={handleSwitchToEmail}
                onBack={() => { setStep("phone"); setChannel("sms"); }}
              />
            )}

            {step === "email_input" && (
              <>
                <h1 className="text-2xl font-semibold mb-1">
                  Sign in with <span className="font-serif-italic text-cream">email</span>
                </h1>
                <p className="text-sm text-muted-foreground mb-6">
                  We'll email you a one-click sign-in link.
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
                      onClick={() => setStep("phone")}
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
                  onClick={() => { setStep(EMAIL_ONLY_AUTH ? "email_input" : "phone"); setEmail(""); }}
                  className="text-sm text-cream hover:underline"
                >
                  Use a different email
                </button>
              </div>
            )}
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

      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        {slide.image && (
          <img key={activeSlide} src={slide.image} alt={slide.title + " " + slide.italic} className="absolute inset-0 w-full h-full object-cover z-0" loading="eager" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 z-[1]" />

        <div className="relative z-10 flex flex-col justify-end p-12 pb-24 w-full">
          <div className="max-w-[500px] ml-auto">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">{slide.category}</p>
            <h2 className="text-3xl font-semibold text-foreground mb-3">
              {slide.title} <span className="font-serif-italic text-cream">{slide.italic}</span>
            </h2>
            <p className="text-base text-muted-foreground max-w-[400px]">{slide.subtitle}</p>
            <div className="flex items-center gap-4 mt-5">
              <span className="text-sm font-medium text-cream flex items-center gap-1 opacity-80">
                Explore <ArrowRight className="h-3 w-3" />
              </span>
              <span className="text-xs text-muted-foreground font-mono">5,000+ students</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-12 flex gap-2 z-20">
          {slides.map((_, i) => (
            <div key={i} className="w-16 h-0.5 bg-white/20 rounded-full overflow-hidden">
              <div className={`h-full bg-white rounded-full ${i === activeSlide ? "animate-slide-progress" : i < activeSlide ? "w-full" : "w-0"}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
};

export default Login;
