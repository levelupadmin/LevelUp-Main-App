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
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = displayRating >= star ? 1 : displayRating >= star - 0.5 ? 0.5 : 0;

        return (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            className={cn(
              "relative p-0 border-0 bg-transparent",
              interactive && "cursor-pointer hover:scale-110 transition-transform",
              !interactive && "cursor-default"
            )}
            onClick={() => interactive && onRate?.(star)}
            onMouseEnter={() => interactive && setHoverRating(star)}
          >
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
                  "absolute inset-0 fill-yellow-400 text-yellow-400"
                )}
                strokeWidth={1.5}
                style={
                  fill === 0.5
                    ? { clipPath: "inset(0 50% 0 0)" }
                    : undefined
                }
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default StarRating;
