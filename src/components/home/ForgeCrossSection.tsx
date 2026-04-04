import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowRight, MapPin, Flame, Users } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import forgeLogo from "@/assets/forge-logo.png";
import forgeFilmmaking from "@/assets/forge-filmmaking-banner.jpg";
import forgeWriting from "@/assets/forge-writing-banner.jpg";
import forgeCreators from "@/assets/forge-creators-banner.jpg";

const forgePrograms = [
  {
    id: "writing",
    title: "Writing Retreat",
    subtitle:
      "A 6-day scenic retreat where writers unplug, immerse deeply, and learn from bestselling storytellers.",
    location: "Coorg · June 2026",
    image: forgeWriting,
    cta: "https://www.forgebylevelup.com/writingresidency",
  },
  {
    id: "filmmaking",
    title: "Filmmaking Bootcamp",
    subtitle:
      "An intensive 15-day bootcamp where filmmakers write, direct, and shoot short films with top mentors.",
    location: "Goa · April 2026",
    image: forgeFilmmaking,
    cta: "https://www.forgebylevelup.com/",
  },
  {
    id: "creators",
    title: "Creator Residency",
    subtitle:
      "An invite-only 12-day residency where founders build personal brands through daily content and creator mentorship.",
    location: "Goa · May 2026 / Bali · June 2026",
    image: forgeCreators,
    cta: "https://creators.forgebylevelup.com/",
  },
];

const forgeStats = [
  { value: "11", label: "Cities" },
  { value: "25+", label: "Editions" },
  { value: "600+", label: "Dreamers" },
];

const featurePoints = [
  { label: "Learn by doing", icon: Flame },
  { label: "Build with community", icon: Users },
  { label: "Immersive & offline", icon: MapPin },
];

const ForgeCrossSection = () => {
  const autoplayPlugin = useRef(
    Autoplay({ delay: 4000, stopOnInteraction: false })
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      align: "start",
      containScroll: "trimSnaps",
      slidesToScroll: 1,
      loop: true,
    },
    [autoplayPlugin.current]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollTo = useCallback(
    (index: number) => emblaApi && emblaApi.scrollTo(index),
    [emblaApi]
  );

  return (
    <section className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <span className="inline-block rounded-full border border-border/50 bg-secondary px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Offline Residencies
          </span>
          <div className="flex items-center gap-3">
            <img
              src={forgeLogo}
              alt="Forge"
              className="h-8 w-auto opacity-90"
            />
            <span className="text-sm font-medium text-muted-foreground">
              Learn. Do. Become.
            </span>
          </div>
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl tracking-tight">
            Where creators go to{" "}
            <span className="text-primary">make real work.</span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            The Forge is an offline, immersive learning experience that brings
            together travel, hands-on creation, and a like-minded community.
          </p>
        </div>

        <div className="flex gap-6">
          {forgeStats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature points */}
      <div className="flex flex-wrap gap-4">
        {featurePoints.map((point) => (
          <span
            key={point.label}
            className="inline-flex items-center gap-2 rounded-lg border border-border/30 bg-secondary/60 px-4 py-2 text-xs font-medium text-muted-foreground"
          >
            <point.icon className="h-3.5 w-3.5 text-primary" />
            {point.label}
          </span>
        ))}
      </div>

      {/* Embla Carousel — one by one */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4 md:gap-6">
          {forgePrograms.map((card, index) => (
            <div
              key={card.id}
              className={`flex-[0_0_85%] md:flex-[0_0_65%] min-w-0 transition-opacity duration-500 ${
                index === selectedIndex ? "opacity-100" : "opacity-40"
              }`}
            >
              <a
                href={card.cta}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block overflow-hidden rounded-2xl border border-border/30 transition-all hover:border-primary/30 hover:shadow-design-lg"
              >
                <div className="relative aspect-[3/4] md:aspect-[16/10] overflow-hidden">
                  <img
                    src={card.image}
                    alt={card.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />

                  {/* Location badge */}
                  <span className="absolute right-4 top-4 md:right-6 md:top-6 inline-flex items-center gap-1 rounded-full bg-background/70 px-3 py-1.5 text-[10px] md:text-xs font-medium text-foreground backdrop-blur-sm">
                    <MapPin className="h-3 w-3" />
                    {card.location}
                  </span>

                  {/* Content at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 md:p-8">
                    <h3 className="text-xl md:text-2xl lg:text-3xl font-semibold text-white mb-2">
                      {card.title}
                    </h3>
                    <p className="text-xs md:text-sm text-white/70 max-w-md leading-relaxed mb-4">
                      {card.subtitle}
                    </p>
                    <span className="inline-flex items-center gap-2 rounded-[12px] bg-primary px-5 py-2.5 text-[11px] md:text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90">
                      Request an invite
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Progress Dots */}
      <div className="flex justify-center gap-2">
        {forgePrograms.map((_, index) => (
          <button
            key={index}
            onClick={() => scrollTo(index)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index === selectedIndex
                ? "w-8 bg-primary"
                : "w-2 bg-muted-foreground/30"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
};

export default ForgeCrossSection;
