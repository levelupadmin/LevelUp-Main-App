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
import { sendOtp as msg91SendOtp, verifyOtp as msg91VerifyOtp, retryOtp as msg91RetryOtp } from "@/lib/msg91-widget";
import Footer from "@/components/Footer";
import signupHeroImage from "@/assets/carousel/slide-bfp.jpg";

type Step = "form" | "otp" | "email_sent";

// Mirrors Login.tsx. While false, +91 phones go through the MSG91
// widget; non-+91 phones still fall through to email magic link.
const EMAIL_ONLY_AUTH = false;

// MSG91 widget verify URL (our edge function bridges widget JWT → Supabase session).
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
    // +91 phones use MSG91 widget for SMS OTP. Edge function handles
    // user creation + session minting after widget verify.
    if (!EMAIL_ONLY_AUTH && isIndianPhone) {
      try {
        if (waMode) {
          await msg91RetryOtp("whatsapp");
        } else {
          await msg91SendOtp(phone);
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
      const { accessToken } = await msg91VerifyOtp(otp);
      const resp = await fetch(VERIFY_MSG91_OTP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          accessToken,
          email,
          full_name: fullName.trim(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
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
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading || !formValid}>
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
      <Footer />
    </div>
  );
};

export default Signup;
