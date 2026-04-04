import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo.png";
import heroImage from "@/assets/hero-filmmaking-1.jpg";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogIn, UserPlus, Eye, EyeOff, Star, Users, Award } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const { signIn, signUp, isAuthenticated, hasCompletedOnboarding } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    const dest = redirectTo || (hasCompletedOnboarding ? "/home" : "/onboarding");
    navigate(dest, { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    if (mode === "signup" && !fullName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }
    setLoading(true);
    if (mode === "signup") {
      const { error } = await signUp(email, password, fullName);
      if (error) {
        toast({ title: error, variant: "destructive" });
      } else {
        toast({ title: "Check your email to verify your account ✉️" });
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: error, variant: "destructive" });
      } else {
        toast({ title: "Welcome back! 🎬" });
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left — Cinematic image (desktop only) */}
      <div className="relative hidden w-1/2 overflow-hidden lg:block">
        <img
          src={heroImage}
          alt="Cinematic filmmaking"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/40 to-background/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />

        <div className="absolute bottom-0 left-0 right-0 p-12">
          <blockquote className="max-w-md">
            <p className="text-xl font-bold leading-snug text-foreground">
              "Level Up gave me the confidence and skills to go from hobby filmmaker to working professional."
            </p>
            <footer className="mt-4 text-sm text-muted-foreground">
              — Arjun Mehta, <span className="text-foreground font-medium">Cinematographer</span>
            </footer>
          </blockquote>
        </div>
      </div>

      {/* Right — Auth form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-12">
        {/* Mobile background image */}
        <div className="fixed inset-0 -z-10 lg:hidden">
          <img src={heroImage} alt="" className="h-full w-full object-cover opacity-10" />
          <div className="absolute inset-0 bg-background/90" />
        </div>

        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-10 text-center">
            <img
              src={logo}
              alt="Level Up"
              className="mx-auto mb-5 h-14 w-14 animate-[slide-up_0.5s_ease-out]"
            />
            <h1 className="text-2xl font-bold text-foreground mb-1">Welcome to Level Up</h1>
            <p className="text-sm text-muted-foreground">India's creative learning platform</p>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-secondary mb-5">
              <TabsTrigger value="login" className="text-xs gap-1.5"><LogIn className="h-3.5 w-3.5" />Log In</TabsTrigger>
              <TabsTrigger value="signup" className="text-xs gap-1.5"><UserPlus className="h-3.5 w-3.5" />Sign Up</TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <Input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-card"
                />
              )}
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-card"
              />
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-card pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-highlight py-3 text-sm font-bold text-highlight-foreground transition-colors hover:opacity-90 disabled:opacity-40"
              >
                {loading ? "Please wait..." : mode === "signup" ? "Create Account" : "Log In"}
              </button>
            </form>
          </Tabs>

          {/* Social proof */}
          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> 2,800+ creators</span>
            <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-highlight" /> 4.8 rating</span>
            <span className="flex items-center gap-1"><Award className="h-3.5 w-3.5" /> Certified</span>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
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
    </div>
  );
};

export default Auth;
