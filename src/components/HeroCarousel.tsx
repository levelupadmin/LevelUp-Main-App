import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Users, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

// Fallback images keyed by sort_order
import slideBfp from "@/assets/carousel/slide-bfp.jpg";
import slideVea from "@/assets/carousel/slide-vea.jpg";
import slideUiux from "@/assets/carousel/slide-uiux.jpg";
import slideSmp from "@/assets/carousel/slide-smp.jpg";
import slideMasterclasses from "@/assets/carousel/slide-masterclasses.jpg";

const FALLBACK_IMAGES: Record<number, string> = {
  1: slideBfp,
  2: slideVea,
  3: slideUiux,
  4: slideSmp,
  5: slideMasterclasses,
};

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
  const [direction, setDirection] = useState(1);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("hero_slides")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setSlides((data as HeroSlide[]) ?? []));
  }, []);

  const goTo = useCallback(
    (i: number) => {
      setDirection(i > activeIndex ? 1 : -1);
      setActiveIndex(i);
    },
    [activeIndex]
  );

  const next = useCallback(() => {
    if (!slides.length) return;
    setDirection(1);
    setActiveIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (paused || !slides.length) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [next, paused, slides.length]);

  // Reset progress bar animation on slide change
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.style.animation = "none";
      // Force reflow
      void progressRef.current.offsetHeight;
      progressRef.current.style.animation = "";
    }
  }, [activeIndex]);

  if (!slides.length) return null;

  const slide = slides[activeIndex];
  const imageUrl = slide.image_url || FALLBACK_IMAGES[slide.sort_order] || "";
  const pills = [
    { icon: Clock, label: slide.duration_label },
    { icon: Users, label: slide.student_count_label },
    { icon: CalendarDays, label: slide.next_batch_label },
  ].filter((p) => p.label);

  return (
    <div
      className="relative w-full h-[420px] rounded-[20px] overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Crossfade image layers ── */}
      <AnimatePresence initial={false}>
        <motion.div
          key={slide.id}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        >
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            width={1600}
            height={896}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* ── Progress bars — top-left ── */}
      <div className="absolute top-5 left-6 flex gap-2 z-20">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className="w-12 h-[3px] bg-white/20 rounded-full overflow-hidden cursor-pointer"
          >
            {i === activeIndex ? (
              <div
                ref={i === activeIndex ? progressRef : undefined}
                className="h-full bg-white rounded-full"
                style={{
                  animation: paused ? "none" : "slideProgress 6s linear forwards",
                  animationPlayState: paused ? "paused" : "running",
                }}
              />
            ) : (
              <div
                className={`h-full bg-white rounded-full transition-all duration-300 ${
                  i < activeIndex ? "w-full" : "w-0"
                }`}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Text overlay — left-center, animated ── */}
      <div className="relative z-10 flex items-center h-full px-8 md:px-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id + "-text"}
            className="max-w-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], staggerChildren: 0.08 }}
          >
            <motion.p
              className="font-mono text-xs uppercase tracking-widest text-white/50 mb-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              {slide.category_label}
            </motion.p>

            <motion.h2
              className="text-3xl md:text-[48px] md:leading-[1.1] font-semibold text-foreground mb-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
            >
              {slide.title_prefix}{" "}
              <span className="font-serif-italic text-cream">{slide.title_accent}</span>
            </motion.h2>

            <motion.p
              className="text-sm md:text-base text-white/60 max-w-md mb-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              {slide.subtitle}
            </motion.p>

            {/* Key info pills */}
            {pills.length > 0 && (
              <motion.div
                className="flex flex-wrap gap-2 mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.4 }}
              >
                {pills.map((pill, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-xs font-mono text-white/80"
                  >
                    <pill.icon className="h-3 w-3" />
                    {pill.label}
                  </span>
                ))}
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
            >
              <Link
                to={slide.cta_link}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-cream text-cream-text text-sm font-semibold rounded-lg hover:-translate-y-0.5 transition-transform"
              >
                {slide.cta_text} <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Dots — bottom-right ── */}
      <div className="absolute bottom-5 right-6 flex gap-2 z-20">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === activeIndex ? "bg-white w-6" : "bg-white/30 hover:bg-white/50 w-2"
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default HeroCarousel;
