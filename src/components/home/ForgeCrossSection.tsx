import { ArrowRight, MapPin } from "lucide-react";
import forgeLogo from "@/assets/forge-logo.png";
import forgeFilmmaking from "@/assets/forge-filmmaking-banner.jpg";
import forgeWriting from "@/assets/forge-writing-banner.jpg";
import forgeCreators from "@/assets/forge-creators-banner.jpg";

const forgePrograms = [
  {
    id: "writing",
    title: "Writing Retreat",
    subtitle: "A 6-day fully offline residency for aspiring writers — disconnect, create, and find your voice",
    location: "Coorg · June 2026",
    image: forgeWriting,
    cta: "https://www.forgebylevelup.com/writingresidency",
  },
  {
    id: "filmmaking",
    title: "Filmmaking Bootcamp",
    subtitle: "Intensive online + offline bootcamp for filmmakers — script to screen in 10 days",
    location: "Goa · April 2026",
    image: forgeFilmmaking,
    cta: "https://www.forgebylevelup.com/",
  },
  {
    id: "creators",
    title: "Creator Residency",
    subtitle: "Bootcamp for content creators — build, shoot, launch with your tribe",
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

const ForgeCrossSection = () => {
  return (
    <section className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <span className="inline-block rounded-full border border-border/50 bg-card/60 px-4 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Offline Residencies
          </span>
          <div className="flex items-center gap-3">
            <img src={forgeLogo} alt="Forge" className="h-8 w-auto opacity-90" />
            <span className="font-display text-sm font-medium text-muted-foreground">
              Learn. Do. Become.
            </span>
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Where creators go to{" "}
            <span className="text-gradient-amber">make real work.</span>
          </h2>
        </div>

        <div className="flex gap-6">
          {forgeStats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature points */}
      <div className="flex flex-wrap gap-4">
        {["Learn by doing", "Build with community", "Immersive & offline"].map((point) => (
          <span
            key={point}
            className="inline-flex items-center gap-2 rounded-lg border border-border/30 bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-highlight" />
            {point}
          </span>
        ))}
      </div>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {forgePrograms.map((prog) => (
          <a
            key={prog.id}
            href={prog.cta}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative overflow-hidden rounded-2xl border border-border/30 transition-all hover:border-highlight/30 hover:shadow-[0_0_20px_2px_hsl(38_75%_55%/0.12)]"
          >
            <div className="relative h-64 w-full overflow-hidden sm:h-72">
              <img
                src={prog.image}
                alt={prog.title}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

              {/* Location badge */}
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/70 px-3 py-1 text-[10px] font-semibold text-foreground backdrop-blur-sm">
                <MapPin className="h-3 w-3" />
                {prog.location}
              </span>
            </div>

            <div className="p-5">
              <h3 className="font-display text-base font-bold text-foreground">{prog.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{prog.subtitle}</p>
              <div className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-highlight transition-all group-hover:gap-3">
                Request an invite
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export default ForgeCrossSection;
