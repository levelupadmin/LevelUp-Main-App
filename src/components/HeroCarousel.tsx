import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Users, CalendarDays, Sparkles, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

// Fallback / cinematic backdrop images keyed by sort_order.
// Note: sort_order 3 (UI/UX — off-brand for a filmmaking platform) is intentionally
// remapped to a cinematic still instead of the old iPad mock-up that looked broken.
import slideBfp from "@/assets/carousel/slide-bfp.jpg";
import slideVea from "@/assets/carousel/slide-vea.jpg";
import slideSmp from "@/assets/carousel/slide-smp.jpg";
import slideMasterclasses from "@/assets/carousel/slide-masterclasses.jpg";
import heroCinematography from "@/assets/hero-cinematography-1.jpg";
import heroFilmmaking from "@/assets/hero-filmmaking-1.jpg";

// Mentor portraits for the All-Access bundle slide
import mcLokesh from "@/assets/mc-lokesh-kanagaraj.png";
import mcKarthik from "@/assets/mc-karthik-subbaraj.png";
import mcAnthony from "@/assets/mc-anthony-gonsalvez.png";
import mcNelson from "@/assets/mc-nelson-dilipkumar.jpg";
import mcRavi from "@/assets/mc-ravi-basrur.webp";
import mcVenket from "@/assets/mc-venket-ram.png";
import mcDrKiran from "@/assets/mc-drk-kiran.webp";

const FALLBACK_IMAGES: Record<number, string> = {
  1: slideBfp,
  2: slideVea,
  3: heroCinematography, // replaces the broken UI/UX slide
  4: slideSmp,
  5: slideMasterclasses,
};

// Featured mentor that appears as the poster portrait on each standard slide.
// Maps slide sort_order → mentor asset. Falls back to the backdrop image if unset.
const FEATURED_MENTOR: Record<number, { src: string; name: string } | null> = {
  1: null,
  2: { src: mcAnthony, name: "Anthony Gonsalvez" },
  3: { src: mcVenket, name: "Venket Ram" },
  4: null,
  5: { src: mcLokesh, name: "Lokesh Kanagaraj" },
};

const BUNDLE_SORT_ORDER = 6;

// Synthetic default bundle slide — injected if the DB doesn't provide one so the
// All-Access Pass promo always appears on the dashboard. Admins can override by
// inserting a real hero_slides row with sort_order = 6.
const DEFAULT_BUNDLE_SLIDE = {
  id: "__bundle__",
  title_prefix: "One pass.",
  title_accent: "every masterclass.",
  subtitle: "Lifetime access to 7 industry-defining masterclasses — from the directors, editors, cinematographers, and composers behind India's biggest films.",
  category_label: "All-Access Pass",
  cta_text: "Get All-Access",
  cta_link: "/browse?bundle=all-access",
  image_url: null,
  gradient_class: "from-black/80 via-black/40 to-transparent",
  duration_label: "7 masterclasses",
  student_count_label: "Lifetime access",
  next_batch_label: "Save 40%",
  sort_order: BUNDLE_SORT_ORDER,
};

const BUNDLE_MENTORS: { src: string; name: string; craft: string }[] = [
  { src: mcLokesh, name: "Lokesh Kanagaraj", craft: "Direction" },
  { src: mcKarthik, name: "Karthik Subbaraj", craft: "Direction" },
  { src: mcNelson, name: "Nelson Dilipkumar", craft: "Direction" },
  { src: mcAnthony, name: "Anthony Gonsalvez", craft: "Editing" },
  { src: mcRavi, name: "Ravi Basrur", craft: "Score" },
  { src: mcVenket, name: "Venket Ram", craft: "Photography" },
  { src: mcDrKiran, name: "Dr. K Kiran", craft: "Storytelling" },
];

interface HeroSlide {
  id: string;
  title_prefix: string;
  title_accent: string;
  subtitle: string | null;
  category_label: string;
  cta_text: string;
  cta_link: string;
  image_url: string | null;
  gradient_class: string;
  duration_label: string | null;
  student_count_label: string | null;
  next_batch_label: string | null;
  sort_order: number;
}

const HeroCarousel = () => {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("hero_slides")
      .select("*")
      .eq("is_active", true)
      .or("placement.eq.dashboard,placement.eq.both")
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const now = new Date();
        const filtered = (data ?? []).filter((s: any) =>
          (!s.starts_at || new Date(s.starts_at) <= now) &&
          (!s.expires_at || new Date(s.expires_at) >= now)
        ) as HeroSlide[];

        // Inject the bundle slide at the end if the DB doesn't provide one.
        // This guarantees the All-Access Pass promo is always on the dashboard.
        const hasBundle = filtered.some((s) => s.sort_order === BUNDLE_SORT_ORDER);
        const final = hasBundle ? filtered : [...filtered, DEFAULT_BUNDLE_SLIDE as HeroSlide];
        setSlides(final);
      });
  }, []);

  const goTo = useCallback((i: number) => setActiveIndex(i), []);

  const next = useCallback(() => {
    if (!slides.length) return;
    setActiveIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (paused || !slides.length) return;
    const timer = setInterval(next, 7000);
    return () => clearInterval(timer);
  }, [next, paused, slides.length]);

  // Keyboard navigation for accessibility
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && slides.length) {
        setActiveIndex((p) => (p - 1 + slides.length) % slides.length);
      } else if (e.key === "ArrowRight" && slides.length) {
        setActiveIndex((p) => (p + 1) % slides.length);
      }
    };
    // Only attach when the carousel is focused — scoped via tabIndex=0 below
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.style.animation = "none";
      void progressRef.current.offsetHeight;
      progressRef.current.style.animation = "";
    }
  }, [activeIndex]);

  const slide = slides[activeIndex];
  const isBundle = slide?.sort_order === BUNDLE_SORT_ORDER;
  const featuredMentor = useMemo(() => {
    if (!slide) return null;
    return FEATURED_MENTOR[slide.sort_order] ?? null;
  }, [slide]);

  if (!slides.length || !slide) return null;

  const imageUrl = slide.image_url || FALLBACK_IMAGES[slide.sort_order] || heroFilmmaking;
  const pills = [
    { icon: Clock, label: slide.duration_label },
    { icon: Users, label: slide.student_count_label },
    { icon: CalendarDays, label: slide.next_batch_label },
  ].filter((p) => p.label);

  return (
    <div
      role="region"
      aria-label="Featured programs"
      aria-roledescription="carousel"
      tabIndex={0}
      className="group relative w-full rounded-[24px] overflow-hidden bg-surface-2 focus-ring"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setActiveIndex((p) => (p - 1 + slides.length) % slides.length);
        if (e.key === "ArrowRight") setActiveIndex((p) => (p + 1) % slides.length);
      }}
    >
      {/* Cinematic aspect — taller on desktop for movie-poster feel */}
      <div className="relative w-full aspect-[16/10] sm:aspect-[16/8] md:aspect-[16/7] min-h-[420px] md:min-h-[480px]">
        {/* ───────── Backdrop ───────── */}
        <AnimatePresence initial={false}>
          <motion.div
            key={slide.id + "-bg"}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            {isBundle ? (
              /* Bundle backdrop = layered dark gradient over cinematic still */
              <>
                <img
                  src={heroFilmmaking}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover opacity-40"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0c0a08] to-[#1a0f05]" />
              </>
            ) : (
              <>
                <img
                  src={imageUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover"
                  width={1600}
                  height={900}
                />
                {/* Dark scrim — left side deep for legibility, right fades to reveal portrait */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              </>
            )}
            {/* Film grain overlay — ties the hero to the rest of the app's grain */}
            <div className="absolute inset-0 grain opacity-60 pointer-events-none" />
          </motion.div>
        </AnimatePresence>

        {/* ───────── Progress bars (top-left) ───────── */}
        <div className="absolute top-5 left-5 md:left-8 right-24 md:right-32 flex gap-1.5 z-20">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="flex-1 h-[3px] bg-white/15 rounded-full overflow-hidden cursor-pointer hover:bg-white/25 transition-colors"
            >
              {i === activeIndex ? (
                <div
                  ref={progressRef}
                  className="h-full bg-cream rounded-full"
                  style={{
                    animation: paused ? "none" : "slideProgress 7s linear forwards",
                    animationPlayState: paused ? "paused" : "running",
                  }}
                />
              ) : (
                <div
                  className={`h-full bg-white rounded-full transition-all duration-500 ${
                    i < activeIndex ? "w-full" : "w-0"
                  }`}
                />
              )}
            </button>
          ))}
        </div>

        {/* ───────── Split layout: content (left) + portrait/collage (right) ───────── */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-0 h-full">
          {/* LEFT — content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id + "-text"}
              className="flex flex-col justify-center px-6 md:px-10 lg:px-14 py-16 md:py-12 max-w-2xl"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Eyebrow with dot */}
              <motion.div
                className="flex items-center gap-2.5 mb-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${isBundle ? "bg-cream animate-pulse" : "bg-cream/60"}`} />
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-cream">
                  {slide.category_label}
                </span>
                {isBundle && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-cream/30 bg-cream/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-cream">
                    <Sparkles className="h-2.5 w-2.5" />
                    New
                  </span>
                )}
              </motion.div>

              {/* Title */}
              <motion.h2
                className="font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.05] font-semibold text-white tracking-tight mb-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.5 }}
              >
                {slide.title_prefix}{" "}
                <span className="font-serif-italic text-cream">{slide.title_accent}</span>
              </motion.h2>

              {/* Featured mentor attribution */}
              {featuredMentor && (
                <motion.p
                  className="font-mono text-xs uppercase tracking-widest text-white/50 mb-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.35 }}
                >
                  Taught by <span className="text-cream/80 normal-case tracking-normal font-sans">{featuredMentor.name}</span>
                </motion.p>
              )}

              {/* Subtitle */}
              {slide.subtitle && (
                <motion.p
                  className="text-sm md:text-[15px] leading-relaxed text-white/70 max-w-[42ch] mb-6"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22, duration: 0.4 }}
                >
                  {slide.subtitle}
                </motion.p>
              )}

              {/* Info pills */}
              {pills.length > 0 && (
                <motion.div
                  className="flex flex-wrap gap-2 mb-7"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.35 }}
                >
                  {pills.map((pill, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-[11px] font-mono text-white/80"
                    >
                      <pill.icon className="h-3 w-3 text-cream" />
                      {pill.label}
                    </span>
                  ))}
                </motion.div>
              )}

              {/* CTAs */}
              <motion.div
                className="flex flex-wrap items-center gap-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.38, duration: 0.4 }}
              >
                <Link
                  to={slide.cta_link}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-cream text-cream-text text-sm font-semibold rounded-lg press-scale focus-ring hover:shadow-[0_10px_32px_-10px_rgba(245,237,216,0.4)] transition-shadow"
                >
                  {slide.cta_text} <ArrowRight className="h-4 w-4" />
                </Link>
                {isBundle && (
                  <Link
                    to="/browse?category=masterclass"
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white/80 hover:text-white rounded-lg border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] press-scale focus-ring transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    Browse masterclasses
                  </Link>
                )}
              </motion.div>
            </motion.div>
          </AnimatePresence>

          {/* RIGHT — portrait or collage */}
          <div className="relative hidden md:flex items-center justify-center p-8 lg:p-12">
            <AnimatePresence mode="wait">
              {isBundle ? (
                /* Bundle — 3-col x 3-row grid of mentor portraits */
                <motion.div
                  key="bundle-grid"
                  className="relative w-full max-w-sm lg:max-w-md grid grid-cols-3 gap-2 lg:gap-3"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  {BUNDLE_MENTORS.slice(0, 6).map((m, i) => (
                    <motion.div
                      key={m.name}
                      className="relative aspect-[3/4] rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/10 group/portrait"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.06, duration: 0.4, ease: "easeOut" }}
                    >
                      <img
                        src={m.src}
                        alt={`${m.name} — ${m.craft}`}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover/portrait:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-1.5 lg:p-2">
                        <p className="text-[10px] lg:text-[11px] font-semibold text-white leading-tight line-clamp-1">{m.name}</p>
                        <p className="text-[9px] lg:text-[10px] font-mono uppercase tracking-wider text-cream/80">{m.craft}</p>
                      </div>
                    </motion.div>
                  ))}
                  {/* +N more tile */}
                  <motion.div
                    className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gradient-to-br from-cream/15 to-cream/5 ring-1 ring-cream/20 flex flex-col items-center justify-center"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.56, duration: 0.4 }}
                  >
                    <span className="text-2xl lg:text-3xl font-display font-semibold text-cream">+{BUNDLE_MENTORS.length - 6}</span>
                    <span className="text-[9px] lg:text-[10px] font-mono uppercase tracking-wider text-cream/70 mt-1">more</span>
                  </motion.div>
                </motion.div>
              ) : featuredMentor ? (
                /* Featured portrait — big poster with mentor name tag */
                <motion.div
                  key={slide.id + "-portrait"}
                  className="relative w-full max-w-[340px] lg:max-w-[380px] aspect-[3/4]"
                  initial={{ opacity: 0, x: 30, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="absolute inset-0 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
                    <img
                      src={featuredMentor.src}
                      alt={featuredMentor.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <p className="text-xs font-mono uppercase tracking-[0.2em] text-cream/80">Mentor</p>
                      <p className="text-lg font-semibold text-white leading-tight mt-0.5">{featuredMentor.name}</p>
                    </div>
                  </div>
                  {/* Decorative corner notch */}
                  <div className="absolute -top-2 -right-2 h-12 w-12 border-t-2 border-r-2 border-cream/40 rounded-tr-xl pointer-events-none" />
                  <div className="absolute -bottom-2 -left-2 h-12 w-12 border-b-2 border-l-2 border-cream/40 rounded-bl-xl pointer-events-none" />
                </motion.div>
              ) : (
                /* Fallback — atmospheric image poster */
                <motion.div
                  key={slide.id + "-backdrop"}
                  className="relative w-full max-w-[420px] aspect-[4/5]"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="absolute inset-0 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
                    <img
                      src={imageUrl}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-transparent to-black/60" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ───────── Dots (bottom-right) ───────── */}
        <div className="absolute bottom-5 right-5 md:right-8 flex items-center gap-2 z-20">
          <span className="font-mono text-[10px] text-white/40 tabular-nums mr-2 hidden sm:block">
            {String(activeIndex + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
          </span>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 focus-ring ${
                i === activeIndex ? "bg-cream w-6" : "bg-white/30 hover:bg-white/50 w-1.5"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default HeroCarousel;
