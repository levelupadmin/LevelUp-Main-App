import { Play } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

interface HeroPlayChipProps {
  /** Fired on tap — caller scrolls to + starts the free preview player. */
  onClick: () => void;
  /** Label under the chip; defaults to the first-lesson framing. */
  label?: string;
}

/**
 * Champagne circular play chip overlaid on the HeroBanner. Surfaces the
 * free preview lesson directly on the fold — a MasterClass-style "play
 * the trailer right here" affordance. Only render this when a make_free
 * chapter actually exists. On tap it bubbles up to the page, which
 * scrolls to and auto-plays the FreePreviewPlayer.
 *
 * Reader-Rule-safe: this is a free-content preview, not a price/buy
 * surface, so it stays visible on native (iOS/Android) too.
 */
export default function HeroPlayChip({ onClick, label = "Watch lesson 1" }: HeroPlayChipProps) {
  return (
    <button
      type="button"
      onClick={() => {
        void hapticImpact("light");
        onClick();
      }}
      aria-label={label}
      className="group pressable absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 outline-none"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] shadow-[0_20px_45px_-12px_hsl(var(--cream)/0.65)] ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-110 group-focus-visible:scale-110 sm:h-20 sm:w-20">
        <Play className="ml-1 h-6 w-6 fill-current sm:h-8 sm:w-8" />
      </span>
      <span className="rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[hsl(var(--cream))] backdrop-blur-sm sm:text-xs">
        {label}
      </span>
    </button>
  );
}
