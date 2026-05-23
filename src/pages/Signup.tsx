import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Mail } from "lucide-react";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { OtpEntryStep } from "@/components/auth/OtpEntryStep";
import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp, retryOtp as widgetRetryOtp } from "@/lib/msg91-widget";
import signupHeroImage from "@/assets/carousel/slide-bfp.jpg";

type Step = "form" | "otp" | "email_sent";

// Mirrors Login.tsx. 2026-05-23: flipped back to false after switching
// from MSG91 Flow API (silently dropping ##number## substitution) to
// the MSG91 widget pattern the Forge app ships.
const EMAIL_ONLY_AUTH = false;

// MSG91 widget verify URL (edge fn bridges widget access token → Supabase session).
const VERIFY_MSG91_OTP_URL =
  "https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/verify-msg91-otp";

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
        headers: { "Content-Type": "application/json" },
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1">
      <div className="lg:hidden relative h-[40vh] md:h-[50vh] overflow-hidden">
        <img src={signupHeroImage} alt="" className="absolute inset-0 w-full h-full object-cover" loading="eager" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />
        <div className="relative z-10 h-full flex flex-col justify-end p-6 pb-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">CREATORS WHO SHIP</p>
          <h2 className="text-[44px] sm:text-[56px] leading-[1] font-semibold text-foreground max-w-[14ch]">
            Learn the <span className="font-serif-italic text-cream">craft</span>
          </h2>
        </div>
      </div>

      <div className="flex lg:min-h-screen lg:items-center lg:justify-center px-4 py-8 lg:py-12">
        <Card className="w-full lg:max-w-[460px] border-none lg:border-border bg-transparent lg:bg-card shadow-none lg:shadow-elevated">
          <CardHeader className="items-center gap-2 pb-2">
            <h1 className="text-xl font-bold text-foreground">
              {step === "otp" ? "Verify your number" : "Create your account"}
            </h1>
            {step === "form" && (
              <p className="text-sm text-muted-foreground text-center">
                Join LevelUp. Learn from India's best creators.
              </p>
            )}
          </CardHeader>
          <CardContent>
            {step === "form" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="h-12 text-base"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
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

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 text-base"
                  />
                </div>

                <Button type="submit" className="w-full h-12 text-base" disabled={loading || !formValid}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </form>
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
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-[hsl(var(--accent-emerald)/0.15)] mx-auto">
                  <CheckCircle2 className="h-8 w-8 text-[hsl(var(--accent-emerald))]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Check your email</h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    We sent a sign-in link to <strong className="text-foreground">{email}</strong>. Click it to finish setting up your account.
                  </p>
                </div>
                <Button variant="outline" onClick={() => setStep("form")} className="w-full">
                  <Mail className="h-4 w-4 mr-2" /> Use a different email
                </Button>
              </div>
            )}

            {step === "form" && (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-foreground hover:underline">
                  Sign in
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
      {/* Minimal legal strip — no full Footer on a focused conversion page */}
      <div className="px-6 pb-6 pt-2 space-y-2">
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
    </div>
  );
};

export default Signup;
