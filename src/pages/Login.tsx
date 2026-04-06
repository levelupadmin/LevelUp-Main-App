import { useState, useCallback, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
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

  usePageTitle("Sign In");

  // Fetch slides from DB
  useEffect(() => {
    supabase
      .from("hero_slides")
      .select("*")
      .eq("is_active", true)
      .or("placement.eq.login,placement.eq.both")
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const now = new Date();
          const filtered = data.filter((s: any) =>
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Redirect back to the page the user was trying to visit
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

            <div className="mt-4 text-center">
              <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Forgot password?
              </button>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-canvas px-3 text-muted-foreground">or</span>
              </div>
            </div>

            <button
              type="button"
              className="w-full h-11 border border-border rounded-md text-sm text-foreground hover:border-border-hover transition-colors flex items-center justify-center gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
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
        <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient} transition-all duration-700`}>
          {slide.image && (
            <img
              src={slide.image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        </div>

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
