import { ThumbsUp, BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import InitialsAvatar from "@/components/InitialsAvatar";
import StarRating from "./StarRating";
import type { Review } from "@/hooks/useReviews";
import { cn } from "@/lib/utils";

interface ReviewCardProps {
  review: Review;
  onHelpful: (reviewId: string) => void;
  hasVoted: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const ReviewCard = ({ review, onHelpful, hasVoted }: ReviewCardProps) => {
  const name = review.user?.full_name || "Anonymous";

  return (
    <div className="bg-card border border-border rounded-[16px] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <InitialsAvatar
          name={name}
          photoUrl={review.user?.avatar_url}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">
              {name}
            </span>
            {review.is_verified_purchase && (
              <Badge variant="success" className="text-[10px] gap-1 px-1.5 py-0">
                <BadgeCheck className="h-3 w-3" />
                Verified Purchase
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <StarRating rating={review.rating} size="sm" />
            <span className="text-xs text-muted-foreground">
              {timeAgo(review.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      {review.review_text && (
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
          {review.review_text}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center pt-1">
        <button
          onClick={() => onHelpful(review.id)}
          className={cn(
            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors",
            hasVoted
              ? "bg-[hsl(var(--cream))/0.15] text-[hsl(var(--cream))]"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <ThumbsUp className={cn("h-3.5 w-3.5", hasVoted && "fill-current")} />
          Helpful{review.helpful_count > 0 ? ` (${review.helpful_count})` : ""}
        </button>
      </div>
    </div>
  );
};

export default ReviewCard;
