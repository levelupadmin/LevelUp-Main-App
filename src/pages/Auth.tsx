import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo.png";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Phone, Mail, Chrome } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Auth = () => {
  const navigate = useNavigate();
  const { login, hasCompletedOnboarding } = useAuth();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState<"phone" | "email" | null>(null);
  const [otp, setOtp] = useState("");

  const handleSuccess = (method: "phone" | "email" | "google", id?: string) => {
    login(method, id);
    toast({ title: "Welcome to Level Up! 🎬" });
    navigate(hasCompletedOnboarding ? "/home" : "/onboarding", { replace: true });
  };

  const sendOtp = (method: "phone" | "email") => {
    if (method === "phone" && phoneNumber.length !== 10) {
      toast({ title: "Enter a valid 10-digit phone number", variant: "destructive" });
      return;
    }
    if (method === "email" && !email.includes("@")) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    setOtpSent(method);
    toast({ title: `OTP sent to your ${method}` });
  };

  const verifyOtp = () => {
    if (otp.length !== 4) return;
    handleSuccess(otpSent!, otpSent === "phone" ? phoneNumber : email);
  };

  const resetOtp = () => {
    setOtpSent(null);
    setOtp("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        {/* Logo & heading */}
        <div className="mb-10 text-center">
          <img src={logo} alt="Level Up" className="mx-auto mb-5 h-14 w-14" />
          <h1 className="text-2xl font-bold text-foreground mb-1">Welcome to Level Up</h1>
          <p className="text-sm text-muted-foreground">India's creative learning platform</p>
        </div>

        {otpSent ? (
          /* OTP verification */
          <div className="space-y-5 text-center">
            <p className="text-sm text-muted-foreground">
              Enter the 4-digit code sent to{" "}
              <span className="font-semibold text-foreground">
                {otpSent === "phone" ? `+91 ${phoneNumber}` : email}
              </span>
            </p>
            <div className="flex justify-center">
              <InputOTP maxLength={4} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <button
              onClick={verifyOtp}
              disabled={otp.length !== 4}
              className="w-full rounded-md bg-highlight py-3 text-sm font-bold text-highlight-foreground transition-colors hover:opacity-90 disabled:opacity-40"
            >
              Verify
            </button>
            <button onClick={resetOtp} className="text-xs text-muted-foreground hover:text-foreground">
              ← Change {otpSent === "phone" ? "number" : "email"}
            </button>
          </div>
        ) : (
          /* Sign in methods */
          <Tabs defaultValue="phone" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-secondary mb-5">
              <TabsTrigger value="phone" className="text-xs gap-1.5"><Phone className="h-3.5 w-3.5" />Phone</TabsTrigger>
              <TabsTrigger value="email" className="text-xs gap-1.5"><Mail className="h-3.5 w-3.5" />Email</TabsTrigger>
            </TabsList>

            <TabsContent value="phone" className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex h-10 items-center rounded-md border border-input bg-card px-3 text-sm text-muted-foreground">+91</span>
                <Input
                  type="tel"
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
                  className="bg-card"
                />
              </div>
              <button
                onClick={() => sendOtp("phone")}
                className="w-full rounded-md bg-highlight py-3 text-sm font-bold text-highlight-foreground transition-colors hover:opacity-90"
              >
                Send OTP
              </button>
            </TabsContent>

            <TabsContent value="email" className="space-y-4">
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-card"
              />
              <button
                onClick={() => sendOtp("email")}
                className="w-full rounded-md bg-highlight py-3 text-sm font-bold text-highlight-foreground transition-colors hover:opacity-90"
              >
                Send OTP
              </button>
            </TabsContent>
          </Tabs>
        )}

        {/* Divider */}
        {!otpSent && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or continue with</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <button
              onClick={() => handleSuccess("google")}
              className="flex w-full items-center justify-center gap-2.5 rounded-md border border-border bg-card py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <Chrome className="h-4 w-4" />
              Sign in with Google
            </button>
          </>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Just want to look around?{" "}
          <Link to="/explore" className="font-semibold text-highlight hover:underline">
            Browse catalog
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          By continuing, you agree to our Terms &amp; Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default Auth;
