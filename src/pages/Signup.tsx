import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Mail } from "lucide-react";

const Signup = () => {
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [resending, setResending] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [signupError, setSignupError] = useState<string | null>(null);

  /* Password validation */
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordValid = hasMinLength && hasLetter && hasNumber;

  const validatePhone = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (digits.length !== 10) {
      setPhoneError("Please enter a valid 10-digit phone number");
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[440px] border-border bg-card shadow-elevated">
        <CardHeader className="items-center gap-2 pb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent">
            <span className="text-xl font-bold text-foreground">L</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">Create your account</h1>
          <p className="text-sm text-muted-foreground">Join LevelUp and start learning filmmaking</p>
        </CardHeader>
        <CardContent>
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
                onChange={(e) => { setPhone(e.target.value); setPhoneError(""); }}
                required
                className="bg-surface border-border focus:border-foreground h-11"
              />
              {phoneError && (
                <p className="text-xs text-destructive">{phoneError}</p>
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
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {password.length > 0 && (
                <div className="space-y-1 text-xs">
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

            <Button type="submit" className="w-full" disabled={loading || !passwordValid}>
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
  );
};

export default Signup;
