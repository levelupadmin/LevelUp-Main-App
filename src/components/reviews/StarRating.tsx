import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  interactive?: boolean;
  size?: "sm" | "md" | "lg";
  onRate?: (rating: number) => void;
  className?: string;
}

const sizeMap = { sm: "h-3.5 w-3.5", md: "h-5 w-5", lg: "h-6 w-6" };

const StarRating = ({
  rating,
  interactive = false,
  size = "md",
  onRate,
  className,
}: StarRatingProps) => {
  const [hoverRating, setHoverRating] = useState(0);

  const displayRating = interactive && hoverRating > 0 ? hoverRating : rating;

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      onMouseLeave={() => interactive && setHoverRating(0)}
      // Non-interactive stars are purely a visual rating readout: expose a single
      // label on the group instead of five unlabeled buttons.
      role={interactive ? undefined : "img"}
      aria-label={interactive ? undefined : `Rated ${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = displayRating >= star ? 1 : displayRating >= star - 0.5 ? 0.5 : 0;

        const icons = (
          <span className="relative inline-flex" aria-hidden={interactive ? true : undefined}>
            {/* Empty star (background) */}
            <Star
              className={cn(sizeMap[size], "text-muted-foreground/40")}
              strokeWidth={1.5}
            />

            {/* Filled star (overlay) */}
            {fill > 0 && (
              <Star
                className={cn(
                  sizeMap[size],
                  "absolute inset-0 fill-gold text-gold"
                )}
                strokeWidth={1.5}
                style={fill === 0.5 ? { clipPath: "inset(0 50% 0 0)" } : undefined}
              />
            )}
          </span>
        );

        // Display mode: render a non-interactive element (no sub-44px control,
        // no empty aria-label). The group above carries the label.
        if (!interactive) {
          return (
            <span key={star} className="inline-flex">
              {icons}
            </span>
          );
        }

        // Interactive mode: a real ≥44px tap target (min-h/w-11) centered on the
        // star. The icon keeps its visual size; only the hit area expands.
        return (
          <button
            key={star}
            type="button"
            aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
            className="relative flex min-h-[44px] min-w-[44px] items-center justify-center border-0 bg-transparent p-0 cursor-pointer transition-transform hover:scale-110"
            onClick={() => onRate?.(star)}
            onMouseEnter={() => setHoverRating(star)}
          >
            {icons}
          </button>
        );
      })}
    </div>
  );
};

export default StarRating;
