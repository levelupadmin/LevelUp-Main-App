import { cn } from "@/lib/utils";

const TIER_CONFIG: Record<string, { label: string; className: string }> = {
  live_cohort: { label: "LIVE", className: "bg-red-600 text-white" },
  masterclass: { label: "MASTERCLASS", className: "bg-amber-500 text-black" },
  advanced_program: { label: "PROGRAM", className: "bg-amber-700 text-white" },
  workshop: { label: "WORKSHOP", className: "bg-cream text-cream-text" },
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
  live_cohort: { heading: "Live Programs", accentColor: "bg-red-600" },
  masterclass: { heading: "Masterclasses", accentColor: "bg-amber-500" },
  advanced_program: { heading: "Intensive Programs", accentColor: "bg-amber-700" },
  workshop: { heading: "Workshops", accentColor: "bg-cream" },
};
