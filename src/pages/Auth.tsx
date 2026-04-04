import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo.png";
import heroImage from "@/assets/hero-filmmaking-1.jpg";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogIn, UserPlus, Star, Users, Award, ArrowLeft, Phone, Mail } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Step = "info" | "email_otp" | "phone_verify" | "login_input" | "login_otp";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const { sendOtp, verifyOtp, updateUserPhone, verifyPhoneUpdate, isAuthenticated, hasCompletedOnboarding } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<Step>("login_input");

  // Signup fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Login fields
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const [loginValue, setLoginValue] = useState("");

  // OTP
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      const dest = redirectTo || (hasCompletedOnboarding ? "/home" : "/onboarding");
      navigate(dest, { replace: true });
    }
  }, [isAuthenticated, hasCompletedOnboarding, redirectTo, navigate]);

  const resetForm = () => {
    setOtp("");
    setLoading(false);
  };

  const handleModeChange = (v: string) => {
    setMode(v as "login" | "signup");
    setStep(v === "login" ? "login_input" : "info");
    resetForm();
  };

  // ── Signup: Step 1 – collect info & send email OTP ──
  const handleSignupSendOtp = async () => {
    if (!fullName.trim()) { toast({ title: "Enter your name", variant: "destructive" }); return; }
    if (!email.trim()) { toast({ title: "Enter your email", variant: "destructive" }); return; }
    if (!phone.trim()) { toast({ title: "Enter your phone number", variant: "destructive" }); return; }
    setLoading(true);
    const { error } = await sendOtp("email", email, { full_name: fullName, phone });
    setLoading(false);
    if (error) { toast({ title: error, variant: "destructive" }); return; }
    toast({ title: "OTP sent to your email ✉️" });
    setStep("email_otp");
  };

  // ── Signup: Step 2 – verify email OTP ──
  const handleSignupVerifyEmail = async () => {
    if (otp.length < 6) { toast({ title: "Enter the 6-digit OTP", variant: "destructive" }); return; }
    setLoading(true);
    const { error } = await verifyOtp("email", email, otp);
    if (error) { setLoading(false); toast({ title: error, variant: "destructive" }); return; }
    // Update profile with name & phone
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ name: fullName, phone }).eq("id", user.id);
    }
    // Now attach phone to auth user → triggers phone OTP
    const phoneResult = await updateUserPhone(phone);
    setLoading(false);
    if (phoneResult.error) {
      toast({ title: `Email verified! But phone update failed: ${phoneResult.error}`, variant: "destructive" });
      return;
    }
    toast({ title: "Email verified! Now verify your phone 📱" });
    setOtp("");
    setStep("phone_verify");
  };

  // ── Signup: Step 3 – verify phone OTP ──
  const handleSignupVerifyPhone = async () => {
    if (otp.length < 6) { toast({ title: "Enter the 6-digit OTP", variant: "destructive" }); return; }
    setLoading(true);
    const { error } = await verifyPhoneUpdate(phone, otp);
    setLoading(false);
    if (error) { toast({ title: error, variant: "destructive" }); return; }
    toast({ title: "Phone verified! Welcome to Level Up 🎬" });
  };

  // ── Login: send OTP ──
  const handleLoginSendOtp = async () => {
    if (!loginValue.trim()) { toast({ title: `Enter your ${loginMethod}`, variant: "destructive" }); return; }
    setLoading(true);
    const { error } = await sendOtp(loginMethod, loginValue);
    setLoading(false);
    if (error) { toast({ title: error, variant: "destructive" }); return; }
    toast({ title: `OTP sent to your ${loginMethod === "email" ? "email ✉️" : "phone 📱"}` });
    setStep("login_otp");
  };

  // ── Login: verify OTP ──
  const handleLoginVerifyOtp = async () => {
    if (otp.length < 6) { toast({ title: "Enter the 6-digit OTP", variant: "destructive" }); return; }
    setLoading(true);
    const { error } = await verifyOtp(loginMethod, loginValue, otp);
    setLoading(false);
    if (error) { toast({ title: error, variant: "destructive" }); return; }
    toast({ title: "Welcome back! 🎬" });
  };

  const handleResendOtp = async () => {
    setLoading(true);
    if (step === "email_otp") {
      await sendOtp("email", email);
    } else if (step === "phone_verify") {
      await updateUserPhone(phone);
    } else if (step === "login_otp") {
      await sendOtp(loginMethod, loginValue);
    }
    setLoading(false);
    toast({ title: "OTP resent!" });
  };

  const renderStep = () => {
    // ── SIGNUP FLOW ──
    if (mode === "signup") {
      if (step === "info") {
        return (
          <div className="space-y-4">
            <Input type="text" placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} className="bg-card" />
            <Input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} className="bg-card" />
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="tel" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} className="bg-card pl-10" />
            </div>
            <button onClick={handleSignupSendOtp} disabled={loading} className="w-full rounded-md bg-highlight py-3 text-sm font-bold text-highlight-foreground transition-colors hover:opacity-90 disabled:opacity-40">
              {loading ? "Sending OTP..." : "Get Email OTP"}
            </button>
          </div>
        );
      }
      if (step === "email_otp") {
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">Enter the 6-digit code sent to <span className="font-semibold text-foreground">{email}</span></p>
            <Input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} className="bg-card text-center text-lg tracking-[0.5em] font-mono" />
            <button onClick={handleSignupVerifyEmail} disabled={loading} className="w-full rounded-md bg-highlight py-3 text-sm font-bold text-highlight-foreground transition-colors hover:opacity-90 disabled:opacity-40">
              {loading ? "Verifying..." : "Verify Email"}
            </button>
            <button type="button" onClick={handleResendOtp} disabled={loading} className="w-full text-sm text-muted-foreground hover:text-foreground">Resend OTP</button>
            <button type="button" onClick={() => { setStep("info"); setOtp(""); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
          </div>
        );
      }
      if (step === "phone_verify") {
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">Enter the 6-digit code sent to <span className="font-semibold text-foreground">{phone}</span></p>
            <Input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} className="bg-card text-center text-lg tracking-[0.5em] font-mono" />
            <button onClick={handleSignupVerifyPhone} disabled={loading} className="w-full rounded-md bg-highlight py-3 text-sm font-bold text-highlight-foreground transition-colors hover:opacity-90 disabled:opacity-40">
              {loading ? "Verifying..." : "Verify Phone"}
            </button>
            <button type="button" onClick={handleResendOtp} disabled={loading} className="w-full text-sm text-muted-foreground hover:text-foreground">Resend OTP</button>
          </div>
        );
      }
    }

    // ── LOGIN FLOW ──
    if (step === "login_input") {
      return (
        <div className="space-y-4">
          <div className="flex gap-2 mb-2">
            <button onClick={() => { setLoginMethod("email"); setLoginValue(""); }} className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors ${loginMethod === "email" ? "bg-highlight text-highlight-foreground" : "bg-secondary text-muted-foreground"}`}>
              <Mail className="h-3.5 w-3.5" /> Email
            </button>
            <button onClick={() => { setLoginMethod("phone"); setLoginValue(""); }} className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors ${loginMethod === "phone" ? "bg-highlight text-highlight-foreground" : "bg-secondary text-muted-foreground"}`}>
              <Phone className="h-3.5 w-3.5" /> Phone
            </button>
          </div>
          {loginMethod === "email" ? (
            <Input type="email" placeholder="your@email.com" value={loginValue} onChange={e => setLoginValue(e.target.value)} className="bg-card" />
          ) : (
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="tel" placeholder="+91 98765 43210" value={loginValue} onChange={e => setLoginValue(e.target.value)} className="bg-card pl-10" />
            </div>
          )}
          <button onClick={handleLoginSendOtp} disabled={loading} className="w-full rounded-md bg-highlight py-3 text-sm font-bold text-highlight-foreground transition-colors hover:opacity-90 disabled:opacity-40">
            {loading ? "Sending OTP..." : "Get OTP"}
          </button>
        </div>
      );
    }

    if (step === "login_otp") {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">Enter the 6-digit code sent to <span className="font-semibold text-foreground">{loginValue}</span></p>
          <Input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} className="bg-card text-center text-lg tracking-[0.5em] font-mono" />
          <button onClick={handleLoginVerifyOtp} disabled={loading} className="w-full rounded-md bg-highlight py-3 text-sm font-bold text-highlight-foreground transition-colors hover:opacity-90 disabled:opacity-40">
            {loading ? "Verifying..." : "Verify & Log In"}
          </button>
          <button type="button" onClick={handleResendOtp} disabled={loading} className="w-full text-sm text-muted-foreground hover:text-foreground">Resend OTP</button>
          <button type="button" onClick={() => { setStep("login_input"); setOtp(""); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left — Cinematic image (desktop only) */}
      <div className="relative hidden w-1/2 overflow-hidden lg:block">
        <img src={heroImage} alt="Cinematic filmmaking" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/40 to-background/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />
        <div className="absolute bottom-0 left-0 right-0 p-12">
          <blockquote className="max-w-md">
            <p className="text-xl font-bold leading-snug text-foreground">"Level Up gave me the confidence and skills to go from hobby filmmaker to working professional."</p>
            <footer className="mt-4 text-sm text-muted-foreground">— Arjun Mehta, <span className="text-foreground font-medium">Cinematographer</span></footer>
          </blockquote>
        </div>
      </div>

      {/* Right — Auth form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-12">
        <div className="fixed inset-0 -z-10 lg:hidden">
          <img src={heroImage} alt="" className="h-full w-full object-cover opacity-10" />
          <div className="absolute inset-0 bg-background/90" />
        </div>

        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-10 text-center">
            <img src={logo} alt="Level Up" className="mx-auto mb-5 h-14 w-14 animate-[slide-up_0.5s_ease-out]" />
            <h1 className="text-2xl font-bold text-foreground mb-1">Welcome to Level Up</h1>
            <p className="text-sm text-muted-foreground">India's creative learning platform</p>
          </div>

          <Tabs value={mode} onValueChange={handleModeChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-secondary mb-5">
              <TabsTrigger value="login" className="text-xs gap-1.5"><LogIn className="h-3.5 w-3.5" />Log In</TabsTrigger>
              <TabsTrigger value="signup" className="text-xs gap-1.5"><UserPlus className="h-3.5 w-3.5" />Sign Up</TabsTrigger>
            </TabsList>

            {renderStep()}
          </Tabs>

          {/* Social proof */}
          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> 2,800+ creators</span>
            <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-highlight" /> 4.8 rating</span>
            <span className="flex items-center gap-1"><Award className="h-3.5 w-3.5" /> Certified</span>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Just want to look around?{" "}
            <Link to="/explore" className="font-semibold text-highlight hover:underline">Browse catalog</Link>
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">By continuing, you agree to our Terms &amp; Privacy Policy</p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
