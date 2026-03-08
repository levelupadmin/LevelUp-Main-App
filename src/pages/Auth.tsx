import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo.png";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, LogIn, UserPlus, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, signUp, isAuthenticated, hasCompletedOnboarding } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect if already authed
  if (isAuthenticated) {
    navigate(hasCompletedOnboarding ? "/home" : "/onboarding", { replace: true });
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
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <img src={logo} alt="Level Up" className="mx-auto mb-5 h-14 w-14" />
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
