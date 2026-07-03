import { cn } from "@/lib/utils";

// Tier → accent, retinted to the strategy's champagne/cream/gold/violet family
// (DESIGN-STRATEGY §"Accent discipline"): Cohort = violet, Masterclass = champagne,
// Program = gold, Workshop = cream. Retires the old red/amber one-offs so tier
// badges stop fighting the champagne/cream system. Shared with MyCoursesPage +
// admin course lists — each renders this as a solid pill over artwork, so solid
// fills with legible foregrounds read correctly on every surface.
const TIER_CONFIG: Record<string, { label: string; className: string }> = {
  live_cohort: { label: "COHORT", className: "bg-accent-violet-deep text-white" },
  masterclass: { label: "MASTERCLASS", className: "bg-cream text-cream-text" },
  advanced_program: { label: "PROGRAM", className: "bg-gold text-cream-text" },
  workshop: {
    label: "WORKSHOP",
    className: "bg-cream/15 text-cream ring-1 ring-inset ring-cream/30",
  },
  resource: { label: "RESOURCE", className: "bg-muted text-muted-foreground" },
};

export const TierBadge = ({ tier }: { tier: string }) => {
  const config = TIER_CONFIG[tier] ?? TIER_CONFIG.resource;
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase font-mono",
        config.className
      )}
    >
      {config.label}
    </span>
  );
};

export const TIER_SECTION_CONFIG: Record<string, { heading: string; accentColor: string }> = {
  live_cohort: { heading: "Mentorship Cohorts", accentColor: "bg-accent-violet" },
  masterclass: { heading: "Masterclasses", accentColor: "bg-cream" },
  advanced_program: { heading: "Programs", accentColor: "bg-gold" },
  workshop: { heading: "Workshops", accentColor: "bg-cream/50" },
};
