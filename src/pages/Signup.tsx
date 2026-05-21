import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import SocialAuthButtons from "@/components/SocialAuthButtons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Mail } from "lucide-react";
import signupHeroImage from "@/assets/carousel/slide-bfp.jpg";

const Signup = () => {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [resending, setResending] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [signupError, setSignupError] = useState<string | null>(null);

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

  /* Password validation */
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordValid = hasMinLength && hasLetter && hasNumber;

  const validatePhone = (val: string) => {
    let digits = val.replace(/\D/g, "");
    // Strip common prefixes: +91, 91, or leading 0
    if (digits.startsWith("91") && digits.length > 10) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0") && digits.length > 10) {
      digits = digits.slice(1);
    }
    if (digits.length !== 10) {
      setPhoneError("Please enter a valid 10-digit mobile number (without country code)");
      return false;
    }
    setPhoneError("");
    return true;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);

    if (!validatePhone(phone)) return;
    if (!passwordValid) {
      toast({ title: "Password doesn't meet requirements", variant: "destructive" });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone: phone.replace(/\D/g, "") },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists")) {
        setSignupError("already_registered");
      } else {
        toast({ title: "Signup failed", description: error.message, variant: "destructive" });
      }
      setLoading(false);
      return;
    }

    setSignupComplete(true);
    setLoading(false);
  };

  const handleResend = async () => {
    setResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Confirmation email resent!", description: "Check your inbox." });
    }
    setResending(false);
  };

  if (signupComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-[440px] border-border bg-card shadow-elevated">
          <CardContent className="pt-8 pb-6 text-center space-y-5">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-[hsl(var(--accent-emerald)/0.15)] mx-auto">
              <CheckCircle2 className="h-8 w-8 text-[hsl(var(--accent-emerald))]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Account created!</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Check your email at <strong className="text-foreground">{email}</strong> to verify your account before signing in.
              </p>
            </div>
            <div className="space-y-3 pt-2">
              <Button
                variant="outline"
                onClick={handleResend}
                disabled={resending}
                className="w-full"
              >
                {resending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                Resend confirmation email
              </Button>
              <Link
                to="/login"
                className="block text-sm font-semibold text-foreground hover:underline"
              >
                ← Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile/tablet hero — hidden on desktop where the centered card is self-contained */}
      <div className="lg:hidden relative h-[40vh] md:h-[50vh] overflow-hidden">
        <img
          src={signupHeroImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />
        <div className="relative z-10 h-full flex flex-col justify-end p-6 pb-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            CREATORS WHO SHIP
          </p>
          <h2 className="text-[44px] sm:text-[56px] leading-[1] font-semibold text-foreground max-w-[14ch]">
            Learn the <span className="font-serif-italic text-cream">craft</span>
          </h2>
        </div>
      </div>

      <div className="flex lg:min-h-screen lg:items-center lg:justify-center px-4 py-8 lg:py-12">
        <Card className="w-full lg:max-w-[440px] border-none lg:border-border bg-transparent lg:bg-card shadow-none lg:shadow-elevated">
        <CardHeader className="items-center gap-2 pb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent lg:flex hidden">
            <span className="text-xl font-bold text-foreground">L</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">Create your account</h1>
          <p className="text-sm text-muted-foreground">Join LevelUp. Learn from India's best creators.</p>
          <p className="text-xs text-muted-foreground/70 font-mono">Join 5,000+ creators learning new skills</p>
        </CardHeader>
        <CardContent>
          <SocialAuthButtons redirectTo="/home" />
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">or</span>
            <div className="flex-1 border-t border-border" />
          </div>
          <form onSubmit={handleSignup} className="space-y-4">
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
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="9876543210"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value;
                  setPhone(val);
                  if (phoneError) {
                    let digits = val.replace(/\D/g, "");
                    if (digits.startsWith("91") && digits.length > 10) {
                      digits = digits.slice(2);
                    } else if (digits.startsWith("0") && digits.length > 10) {
                      digits = digits.slice(1);
                    }
                    if (digits.length >= 10) {
                      setPhoneError("");
                    }
                  }
                }}
                required
                aria-invalid={!!phoneError}
                aria-describedby="phone-error"
                className="bg-surface border-border focus:border-foreground h-11"
              />
              <p className="text-xs text-muted-foreground">10-digit mobile number (without country code)</p>
              {phoneError && (
                <p id="phone-error" className="text-xs text-destructive">{phoneError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setSignupError(null); }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-describedby="password-requirements"
              />
              {password.length > 0 && (
                <div id="password-requirements" className="space-y-1 text-xs">
                  <p className={hasMinLength ? "text-[hsl(var(--accent-emerald))]" : "text-muted-foreground"}>
                    {hasMinLength ? "✓" : "○"} At least 8 characters
                  </p>
                  <p className={hasLetter ? "text-[hsl(var(--accent-emerald))]" : "text-muted-foreground"}>
                    {hasLetter ? "✓" : "○"} Contains a letter
                  </p>
                  <p className={hasNumber ? "text-[hsl(var(--accent-emerald))]" : "text-muted-foreground"}>
                    {hasNumber ? "✓" : "○"} Contains a number
                  </p>
                </div>
              )}
            </div>

            {/* Duplicate account error */}
            {signupError === "already_registered" && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-foreground">
                  This email is already registered.{" "}
                  <Link to="/login" className="font-semibold text-foreground underline">Sign in instead</Link>
                  {" or "}
                  <Link to="/login?mode=forgot" className="font-semibold text-foreground underline">Reset password</Link>
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create account
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-foreground hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
