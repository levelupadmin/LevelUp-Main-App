import { useState, useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import usePageTitle from "@/hooks/usePageTitle";
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

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [slides, setSlides] = useState<SlideData[]>(FALLBACK_SLIDES);
  const [activeSlide, setActiveSlide] = useState(0);
  const [loginMode, setLoginMode] = useState<"password" | "magic_link">("password");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  usePageTitle("Sign In");

  // Fetch slides from DB
  useEffect(() => {
    supabase
      .from("hero_slides")
      .select("*")
      .eq("is_active", true)
      .or("placement.eq.login,placement.eq.both")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load hero slides:", error);
          return;
        }
        if (data && data.length > 0) {
          const now = new Date();
          const filtered = data.filter((s: any) =>
            s.image_url &&
            (!s.starts_at || new Date(s.starts_at) <= now) &&
            (!s.expires_at || new Date(s.expires_at) >= now)
          );
          if (filtered.length > 0) {
            setSlides(filtered.map((s: any) => ({
              category: s.category_label || "",
              title: s.title_prefix || "",
              italic: s.title_accent || "",
              subtitle: s.subtitle || "",
              image: s.image_url || "",
            })));
          }
        }
      });
  }, []);

  const nextSlide = useCallback(() => {
    setActiveSlide((prev) => (prev + 1) % slides.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(nextSlide, 6000);
    return () => clearInterval(timer);
  }, [nextSlide]);

  const redirectTarget = (location.state as any)?.from?.pathname || "/home";

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Enter your email first", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${redirectTarget}`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "We sent a password reset link." });
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      toast({ title: "Enter your email", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/home` },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMagicLinkSent(true);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const from = (location.state as any)?.from?.pathname || "/";
    navigate(from, { replace: true });
  };

  const slide = slides[activeSlide];

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Left sidebar */}
      <div className="w-full lg:w-[420px] lg:min-w-[420px] flex flex-col justify-between px-6 sm:px-8 py-8 border-r border-border">
        <div>
          <LevelUpWordmark className="text-xl" />
        </div>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-[340px] mx-auto">
            <h1 className="text-2xl font-semibold mb-1">
              Welcome <span className="font-serif-italic text-cream">back</span>
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              Sign in to continue your craft
            </p>

            {loginMode === "password" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm text-muted-foreground">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-surface border-border focus:border-foreground h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm text-muted-foreground">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-surface border-border focus:border-foreground h-11"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-cream text-cream-text font-semibold rounded-md hover:-translate-y-0.5 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign in
                </button>
              </form>
            ) : magicLinkSent ? (
              <div className="text-center space-y-4 py-6">
                <div className="w-12 h-12 rounded-full bg-[hsl(var(--accent-amber)/0.15)] flex items-center justify-center mx-auto">
                  <Mail className="h-6 w-6 text-cream" />
                </div>
                <h2 className="text-lg font-semibold">Check your email</h2>
                <p className="text-sm text-muted-foreground">
                  We sent a login link to <span className="text-foreground font-medium">{email}</span>
                </p>
                <button
                  onClick={() => { setMagicLinkSent(false); setLoginMode("password"); }}
                  className="text-sm text-cream hover:underline"
                >
                  Back to password login
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="magic-email" className="text-sm text-muted-foreground">Email</Label>
                  <Input
                    id="magic-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-surface border-border focus:border-foreground h-11"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleMagicLink}
                  disabled={loading}
                  className="w-full h-11 bg-cream text-cream-text font-semibold rounded-md hover:-translate-y-0.5 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send login link
                </button>
              </div>
            )}

            <div className="mt-4 flex items-center justify-center gap-2 text-sm">
              {loginMode === "password" ? (
                <>
                  <button onClick={handleForgotPassword} className="text-muted-foreground hover:text-foreground transition-colors">
                    Forgot password?
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    onClick={() => setLoginMode("magic_link")}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Sign in with email link
                  </button>
                </>
              ) : !magicLinkSent && (
                <button
                  onClick={() => setLoginMode("password")}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign in with password instead
                </button>
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
          <p className="text-xs text-center font-mono text-muted-foreground">
            © 2026 LevelUp Learning · v1.0
          </p>
        </div>
      </div>

      {/* Right hero carousel */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        {slide.image && (
          <img
            key={activeSlide}
            src={slide.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover z-0"
            loading="eager"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 z-[1]" />

        <div className="relative z-10 flex flex-col justify-end p-12 pb-24 w-full">
          <div className="max-w-[500px] ml-auto">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
              {slide.category}
            </p>
            <h2 className="text-3xl font-semibold text-foreground mb-3">
              {slide.title}{" "}
              <span className="font-serif-italic text-cream">{slide.italic}</span>
            </h2>
            <p className="text-base text-muted-foreground max-w-[400px]">
              {slide.subtitle}
            </p>
          </div>
        </div>

        <div className="absolute bottom-8 left-12 flex gap-2 z-20">
          {slides.map((_, i) => (
            <div key={i} className="w-16 h-0.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className={`h-full bg-white rounded-full ${
                  i === activeSlide ? "animate-slide-progress" : i < activeSlide ? "w-full" : "w-0"
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Login;
