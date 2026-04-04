import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import heroFilmmaking from "@/assets/hero-filmmaking-1.jpg";
import heroEditing from "@/assets/hero-editing-1.jpg";
import heroCinematography from "@/assets/hero-cinematography-1.jpg";

const defaultWords = ["filmmakers", "editors", "storytellers", "cinematographers", "creators"];
const defaultImages = [heroFilmmaking, heroEditing, heroCinematography];
const defaultHeadline = "Where India's next great";
const defaultSubtitle = "On-demand masterclasses. Live mentor-led cohorts. Immersive offline residencies. One platform for serious creators.";
const defaultCtaLabel = "See all Programs";
const defaultCtaLink = "/explore";

const WORD_MS = 3000;
const BG_MS = 6000;

const HeroCarousel = () => {
  const navigate = useNavigate();
  const [wordIdx, setWordIdx] = useState(0);
  const [bgIdx, setBgIdx] = useState(0);

  const { data: dbSlides } = useQuery({
    queryKey: ["hero-slides-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_slides")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const hasDbSlides = dbSlides && dbSlides.length > 0;
  const rotatingWords = hasDbSlides ? dbSlides[0].rotating_words as string[] : defaultWords;
  const bgImages = hasDbSlides
    ? dbSlides.filter((s) => s.image_url).map((s) => s.image_url as string)
    : defaultImages;
  const headline = hasDbSlides ? dbSlides[0].title : defaultHeadline;
  const subtitle = hasDbSlides && dbSlides[0].subtitle ? dbSlides[0].subtitle : defaultSubtitle;
  const ctaLabel = hasDbSlides ? dbSlides[0].cta_label : defaultCtaLabel;
  const ctaLink = hasDbSlides ? dbSlides[0].cta_link : defaultCtaLink;

  useEffect(() => {
    if (rotatingWords.length === 0) return;
    const t = setInterval(() => setWordIdx((i) => (i + 1) % rotatingWords.length), WORD_MS);
    return () => clearInterval(t);
  }, [rotatingWords.length]);

  useEffect(() => {
    if (bgImages.length === 0) return;
    const t = setInterval(() => setBgIdx((i) => (i + 1) % bgImages.length), BG_MS);
    return () => clearInterval(t);
  }, [bgImages.length]);

  return (
    <section className="relative -mx-6 -mt-6 overflow-hidden lg:-mx-10 lg:-mt-10">
      <div className="relative h-[520px] w-full sm:h-[560px] lg:h-[640px]">
        {/* Background images with Ken Burns */}
        {bgImages.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
              i === bgIdx ? "opacity-100 animate-ken-burns" : "opacity-0"
            }`}
          />
        ))}

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 pb-28 sm:pb-32 lg:p-16 lg:pb-36">
          {/* Stagger-animated content */}
          <p
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground opacity-0 animate-hero-stagger"
            style={{ animationDelay: "0.1s" }}
          >
            LevelUp Learning
          </p>

          <h1
            className="mt-4 max-w-4xl font-display text-3xl font-bold leading-[1.05] text-hero-headline sm:text-5xl lg:text-[4.5rem] opacity-0 animate-hero-stagger"
            style={{ animationDelay: "0.25s" }}
          >
            {headline}
            <br />
            <span className="relative inline-block h-[1.15em] overflow-hidden align-bottom">
              <AnimatePresence mode="wait">
                <motion.span
                  key={rotatingWords[wordIdx]}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -40, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-block text-gradient-amber"
                >
                  {rotatingWords[wordIdx]}
                </motion.span>
              </AnimatePresence>
            </span>{" "}
            <span className="text-muted-foreground font-light">are made.</span>
          </h1>

          <p
            className="mt-5 max-w-xl text-base leading-relaxed text-hero-subtext sm:text-lg opacity-0 animate-hero-stagger"
            style={{ animationDelay: "0.4s" }}
          >
            On-demand masterclasses. Live mentor-led cohorts. Immersive offline
            residencies. One platform for serious creators.
          </p>

          <div
            className="mt-8 opacity-0 animate-hero-stagger"
            style={{ animationDelay: "0.55s" }}
          >
            <button
              onClick={() => navigate(ctaLink)}
              className="inline-flex items-center gap-2.5 rounded-full bg-foreground px-8 py-3.5 text-sm font-semibold text-background transition-all hover:scale-[1.03] hover:shadow-[0_0_24px_4px_hsl(38_75%_55%/0.2)]"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Dot indicators for bg */}
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          {bgImages.map((_, i) => (
            <button
              key={i}
              onClick={() => setBgIdx(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === bgIdx
                  ? "w-8 bg-foreground"
                  : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/60"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroCarousel;
