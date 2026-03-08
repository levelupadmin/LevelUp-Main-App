import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import heroFilmmaking from "@/assets/hero-filmmaking-1.jpg";
import heroEditing from "@/assets/hero-editing-1.jpg";
import heroCinematography from "@/assets/hero-cinematography-1.jpg";

const heroSlides = [
  {
    id: "slide-1",
    image: heroFilmmaking,
    category: "Masterclass",
    headline: "Learn cinematic storytelling",
    headlineAccent: "that actually gets watched",
    supporting: "Build taste, craft and execution through a premium creator-first learning experience.",
    cta: "Explore Program",
    route: "/learn/course/1",
    meta: ["21 Modules", "Mentor-led", "Certificate", "Beginner Friendly"],
  },
  {
    id: "slide-2",
    image: heroEditing,
    category: "Masterclass",
    headline: "Master the edit.",
    headlineAccent: "Own the story.",
    supporting: "From raw footage to final cut — learn professional editing workflows used by India's top editors.",
    cta: "View Curriculum",
    route: "/learn/course/2",
    meta: ["32 Lessons", "Project-based", "Live Feedback", "DaVinci Resolve"],
  },
  {
    id: "slide-3",
    image: heroCinematography,
    category: "Cohort",
    headline: "Cinematography",
    headlineAccent: "fundamentals, redefined",
    supporting: "Master the visual language of cinema — from framing to lighting — in a 12-week mentor-led cohort.",
    cta: "Apply Now",
    route: "/learn/course/4",
    meta: ["12 Weeks", "Mentor-led", "Invite Only", "Live Feedback"],
  },
];

const AUTOPLAY_MS = 6000;

const HeroCarousel = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % heroSlides.length);
  }, []);

  const prev = useCallback(() => {
    setCurrent((c) => (c - 1 + heroSlides.length) % heroSlides.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [isPaused, next]);

  const slide = heroSlides[current];

  return (
    <section
      className="group relative -mx-6 -mt-6 cursor-pointer overflow-hidden lg:-mx-10 lg:-mt-10"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onClick={() => navigate(slide.route)}
    >
      <div className="relative h-[480px] w-full sm:h-[520px] lg:h-[600px]">
        {/* Background images — all rendered, only current visible */}
        {heroSlides.map((s, i) => (
          <img
            key={s.id}
            src={s.image}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              i === current ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/30 to-transparent" />

        {/* Content overlay */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 pb-24 sm:pb-28 lg:p-16 lg:pb-32">
          {/* Eyebrow */}
          <span className="mb-4 inline-flex w-fit rounded-full border border-border/50 bg-background/40 px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground backdrop-blur-sm">
            {slide.category}
          </span>

          {/* Headline */}
          <h1 className="max-w-3xl text-3xl font-bold leading-[1.08] text-foreground sm:text-5xl lg:text-[4.25rem]">
            {slide.headline}
            <br />
            <em className="font-light italic text-muted-foreground">
              {slide.headlineAccent}
            </em>
          </h1>

          {/* CTA + Metadata row */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(slide.route);
              }}
              className="inline-flex items-center gap-2.5 rounded-full bg-foreground px-7 py-3.5 text-sm font-semibold text-background transition-all hover:bg-foreground/90"
            >
              {slide.cta}
              <ArrowRight className="h-4 w-4" />
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {slide.meta.map((tag, idx) => (
                <span key={tag} className="flex items-center gap-2">
                  <span className="rounded-full border border-foreground/20 bg-foreground/10 px-4 py-2 font-mono text-xs font-semibold tracking-wide text-foreground/90 backdrop-blur-md">
                    {tag}
                  </span>
                  {idx < slide.meta.length - 1 && (
                    <span className="hidden text-muted-foreground/30 sm:inline">·</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Navigation arrows */}
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border/30 bg-background/50 p-2 text-foreground opacity-0 backdrop-blur-sm transition-all hover:bg-background/80 group-hover:opacity-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border/30 bg-background/50 p-2 text-foreground opacity-0 backdrop-blur-sm transition-all hover:bg-background/80 group-hover:opacity-100"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Dot indicators */}
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          {heroSlides.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
              className={`h-1.5 rounded-full transition-all ${
                i === current
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
