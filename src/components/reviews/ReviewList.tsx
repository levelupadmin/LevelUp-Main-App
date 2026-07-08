import { useAuth } from "@/contexts/AuthContext";
import { useReviews, type SortOption } from "@/hooks/useReviews";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import ReviewForm from "./ReviewForm";
import ReviewCard from "./ReviewCard";
import RatingDistribution from "./RatingDistribution";
import { useState } from "react";
import { Pencil } from "lucide-react";

interface ReviewListProps {
  courseId: string;
  isEnrolled?: boolean;
}

const sortLabels: Record<SortOption, string> = {
  recent: "Most Recent",
  helpful: "Most Helpful",
  highest: "Highest Rating",
  lowest: "Lowest Rating",
};

const ReviewList = ({ courseId, isEnrolled = false }: ReviewListProps) => {
  const { user } = useAuth();
  const {
    reviews,
    stats,
    userReview,
    loading,
    sortBy,
    setSortBy,
    loadMore,
    hasMore,
    submitReview,
    toggleHelpful,
    userVotes,
  } = useReviews(courseId);

  const [showForm, setShowForm] = useState(false);

  const canReview = !!user && isEnrolled;
  const hasReviewed = !!userReview;

  return (
    <div className="space-y-6">
      {/* Rating summary.
          Note: the parent section (CourseDetail) renders a "Ratings & Reviews"
          heading with the star icon, so we intentionally don't repeat it here.
          With zero reviews we show the branded serif empty treatment (matching
          EmptyState/SystemState's voice) instead of a "-- / 0 reviews" head over
          five empty gray bars — that skeleton read as broken, not empty. */}
      {stats.total_reviews > 0 ? (
        <div>
          <RatingDistribution stats={stats} />
        </div>
      ) : !loading ? (
        <div className="text-center py-6">
          <p className="font-serif-italic text-[22px] leading-tight text-cream">
            No reviews yet
          </p>
          <p className="body-muted mt-1.5">
            {canReview
              ? "Be the first to share what you took away."
              : "Ratings appear here once students weigh in."}
          </p>
        </div>
      ) : null}

      {/* Review form / edit toggle */}
      {canReview && (
        <>
          {hasReviewed && !showForm ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">You have already reviewed this course.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowForm(true)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Review
              </Button>
            </div>
          ) : !hasReviewed || showForm ? (
            <ReviewForm
              courseId={courseId}
              existingReview={userReview}
              onSubmit={submitReview}
              onSubmitted={() => setShowForm(false)}
            />
          ) : null}
        </>
      )}

      {/* Sort + list */}
      {reviews.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {stats.total_reviews} {stats.total_reviews === 1 ? "Review" : "Reviews"}
            </h3>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(sortLabels) as SortOption[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {sortLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                onHelpful={toggleHelpful}
                hasVoted={userVotes.has(review.id)}
              />
            ))}
          </div>

          {hasMore && (
            <div className="text-center pt-2">
              <Button variant="outline" onClick={loadMore}>
                Load More
              </Button>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default ReviewList;
