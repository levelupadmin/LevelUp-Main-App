import { Check } from "lucide-react";
import { hapticSelection } from "@/lib/haptics";
import { cn } from "@/lib/utils";

// The crafts a new student can say they want to make. Values are the stable
// slugs persisted to users.craft_interests (text[]); labels + still images are
// presentation only. Keeping the slugs terse and lowercase means we can map
// them to catalog tiers / recommendations later without a migration.
export interface CraftOption {
  slug: string;
  label: string;
  /** Short verb-led line shown under the label. */
  blurb: string;
  /** Instructor-still / craft-still image URL. */
  image: string;
}

// Cinematic stills sourced from Unsplash (royalty-free, hotlink-stable CDN).
// Each is cropped to a craft moment (a hand on a camera, an edit bay, a mic)
// so the grid reads as "people making things", not stock clip-art.
export const CRAFT_OPTIONS: CraftOption[] = [
  {
    slug: "filmmaking",
    label: "Films",
    blurb: "Direct & shoot",
    image:
      "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=400&q=70",
  },
  {
    slug: "editing",
    label: "Editing",
    blurb: "Cut & color",
    image:
      "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=400&q=70",
  },
  {
    slug: "photography",
    label: "Photography",
    blurb: "Frame the light",
    image:
      "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=400&q=70",
  },
  {
    slug: "music",
    label: "Music & Score",
    blurb: "Compose & mix",
    image:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=70",
  },
  {
    slug: "writing",
    label: "Writing",
    blurb: "Script & story",
    image:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=400&q=70",
  },
  {
    slug: "vfx",
    label: "VFX & Motion",
    blurb: "Composite & animate",
    image:
      "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=400&q=70",
  },
];

interface Props {
  selected: string[];
  onToggle: (slug: string) => void;
  className?: string;
}

export function CraftPicker({ selected, onToggle, className }: Props) {
  const selectedSet = new Set(selected);

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", className)} role="group" aria-label="Crafts">
      {CRAFT_OPTIONS.map((craft) => {
        const isOn = selectedSet.has(craft.slug);
        return (
          <button
            key={craft.slug}
            type="button"
            aria-pressed={isOn}
            onClick={() => {
              hapticSelection();
              onToggle(craft.slug);
            }}
            className={cn(
              "pressable group relative aspect-[4/5] overflow-hidden rounded-2xl border text-left transition-all",
              isOn
                ? "border-cream ring-2 ring-cream/60"
                : "border-border hover:border-border-hover"
            )}
          >
            <img
              src={craft.image}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
                isOn ? "scale-105" : ""
              )}
            />
            {/* Scrim so the label stays legible over any still. */}
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-t transition-opacity",
                isOn
                  ? "from-canvas/95 via-canvas/40 to-canvas/10"
                  : "from-canvas/90 via-canvas/30 to-transparent"
              )}
            />

            {/* Selected check badge */}
            <div
              className={cn(
                "absolute top-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full transition-all",
                isOn
                  ? "bg-cream text-canvas scale-100"
                  : "bg-canvas/50 text-transparent scale-90 ring-1 ring-border"
              )}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </div>

            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {craft.label}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                {craft.blurb}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default CraftPicker;
