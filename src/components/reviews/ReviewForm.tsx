import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import StarRating from "./StarRating";
import type { Review } from "@/hooks/useReviews";

interface ReviewFormProps {
  courseId: string;
  existingReview?: Review | null;
  onSubmitted: () => void;
  onSubmit: (rating: number, reviewText: string) => Promise<void>;
}

const MAX_CHARS = 1000;

const ReviewForm = ({ courseId, existingReview, onSubmitted, onSubmit }: ReviewFormProps) => {
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [text, setText] = useState(existingReview?.review_text ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existingReview) {
      setRating(existingReview.rating);
      setText(existingReview.review_text ?? "");
    }
  }, [existingReview]);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSaving(true);
    await onSubmit(rating, text.trim());
    setSaving(false);
    onSubmitted();
  };

  return (
    <div className="bg-card border border-border rounded-[16px] p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">
        {existingReview ? "Update Your Review" : "Write a Review"}
      </h3>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Your Rating</label>
        <StarRating rating={rating} interactive size="lg" onRate={setRating} />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Your Review (optional)</label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          placeholder="Share your experience with this course..."
          className="min-h-[100px] resize-none bg-secondary/50"
          maxLength={MAX_CHARS}
        />
        <p className="text-xs text-muted-foreground text-right">
          {text.length}/{MAX_CHARS}
        </p>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={rating === 0 || saving}
        className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
      >
        {saving ? "Saving..." : existingReview ? "Update Review" : "Submit Review"}
      </Button>
    </div>
  );
};

export default ReviewForm;
