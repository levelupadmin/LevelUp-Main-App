import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import slideBfp from "@/assets/carousel/slide-bfp.jpg";
import slideVea from "@/assets/carousel/slide-vea.jpg";
import slideUiux from "@/assets/carousel/slide-uiux.jpg";
import slideSmp from "@/assets/carousel/slide-smp.jpg";
import slideMasterclasses from "@/assets/carousel/slide-masterclasses.jpg";

const SLIDES = [
  {
    category: "LIVE COHORT",
    title: "Make your first",
    italic: "film",
    subtitle: "12-week Breakthrough Filmmakers' Program with industry directors",
    gradient: "from-red-900/80 to-transparent",
    image: slideBfp,
    offeringId: "b1000000-0000-0000-0000-000000000004",
  },
  {
    category: "LIVE COHORT",
    title: "Cut like a",
    italic: "pro",
    subtitle: "Video Editing Academy — Premiere, DaVinci, and the craft of rhythm",
    gradient: "from-indigo-900/80 to-transparent",
    image: slideVea,
    offeringId: "b1000000-0000-0000-0000-000000000005",
  },
  {
    category: "LIVE COHORT",
    title: "Design that",
    italic: "ships",
    subtitle: "UI/UX Academy — from wireframe to production-ready interface",
    gradient: "from-emerald-900/80 to-transparent",
    image: slideUiux,
    offeringId: "b1000000-0000-0000-0000-000000000001",
  },
  {
    category: "LIVE COHORT",
    title: "Write the",
    italic: "story",
    subtitle: "Screenwriting Mastery — structure, character, and the hand-written draft",
    gradient: "from-amber-900/80 to-transparent",
    image: slideSmp,
    offeringId: "b1000000-0000-0000-0000-000000000006",
  },
  {
    category: "ALL MASTERCLASSES",
    title: "Learn from the",
    italic: "greats",
    subtitle: "One pass. Every masterclass. Karthik, Lokesh, Anthony, Nelson, Ravi & more.",
    gradient: "from-violet-900/80 to-transparent",
    image: slideMasterclasses,
    offeringId: "b1000000-0000-0000-0000-000000000004",
  },
];

const HeroCarousel = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setActiveSlide((prev) => (prev + 1) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(nextSlide, 6000);
    return () => clearInterval(timer);
  }, [nextSlide, paused]);

  const slide = SLIDES[activeSlide];

  return (
    <div
      className="relative w-full h-[420px] rounded-[20px] overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Background image + gradient */}
      <div className="absolute inset-0 transition-opacity duration-700">
        <img
          src={slide.image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          width={1600}
          height={896}
        />
        {/* Left gradient overlay for text readability */}
        <div className={`absolute inset-0 bg-gradient-to-r ${slide.gradient}`} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
      </div>

      {/* Progress bars — top-left */}
      <div className="absolute top-5 left-6 flex gap-2 z-20">
        {SLIDES.map((_, i) => (
          <div key={i} className="w-12 h-[3px] bg-white/20 rounded-full overflow-hidden">
            <div
              className={`h-full bg-white rounded-full transition-all ${
                i === activeSlide
                  ? "animate-[slideProgress_6s_linear_forwards]"
                  : i < activeSlide
                  ? "w-full"
                  : "w-0"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Text overlay — left-center */}
      <div className="relative z-10 flex items-center h-full px-8 md:px-12">
        <div className="max-w-lg">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">
            {slide.category}
          </p>
          <h2 className="text-3xl md:text-[48px] md:leading-[1.1] font-semibold text-foreground mb-3">
            {slide.title}{" "}
            <span className="font-serif-italic text-cream">{slide.italic}</span>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-md mb-6">
            {slide.subtitle}
          </p>
          <Link
            to={`/checkout/${slide.offeringId}`}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-cream text-cream-text text-sm font-semibold rounded-lg hover:-translate-y-0.5 transition-transform"
          >
            Explore program <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Dots — bottom-right */}
      <div className="absolute bottom-5 right-6 flex gap-2 z-20">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveSlide(i)}
            className={`w-2 h-2 rounded-full transition-all ${
              i === activeSlide ? "bg-white w-6" : "bg-white/30 hover:bg-white/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default HeroCarousel;
