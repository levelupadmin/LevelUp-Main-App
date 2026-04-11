import StarRating from "./StarRating";
import type { RatingStats } from "@/hooks/useReviews";

interface RatingDistributionProps {
  stats: RatingStats;
}

const RatingDistribution = ({ stats }: RatingDistributionProps) => {
  const { avg_rating, total_reviews, rating_1, rating_2, rating_3, rating_4, rating_5 } = stats;
  const bars = [
    { label: "5", count: rating_5 },
    { label: "4", count: rating_4 },
    { label: "3", count: rating_3 },
    { label: "2", count: rating_2 },
    { label: "1", count: rating_1 },
  ];
  const maxCount = Math.max(...bars.map((b) => b.count), 1);

  return (
    <div className="flex gap-6 items-start">
      {/* Big rating number */}
      <div className="text-center shrink-0">
        <div className="text-4xl font-bold text-foreground">
          {total_reviews > 0 ? Number(avg_rating).toFixed(1) : "--"}
        </div>
        <StarRating rating={total_reviews > 0 ? Number(avg_rating) : 0} size="sm" className="justify-center mt-1" />
        <p className="text-xs text-muted-foreground mt-1">
          {total_reviews} {total_reviews === 1 ? "review" : "reviews"}
        </p>
      </div>

      {/* Distribution bars */}
      <div className="flex-1 space-y-1.5">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-2 text-xs">
            <span className="w-5 text-right text-muted-foreground font-mono">
              {bar.label}&#9733;
            </span>
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all"
                style={{ width: total_reviews > 0 ? `${(bar.count / maxCount) * 100}%` : "0%" }}
              />
            </div>
            <span className="w-6 text-right text-muted-foreground font-mono">
              {bar.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RatingDistribution;
