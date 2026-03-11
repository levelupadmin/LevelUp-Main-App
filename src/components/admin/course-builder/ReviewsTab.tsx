import { Star } from "lucide-react";

const ReviewsTab = () => (
  <div className="space-y-6 max-w-2xl">
    <div>
      <h2 className="text-lg font-semibold text-foreground">Reviews</h2>
      <p className="text-sm text-muted-foreground">Student reviews and ratings for this course</p>
    </div>
    <div className="rounded-xl border border-dashed border-border py-16 text-center">
      <Star className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-muted-foreground text-sm">No reviews yet</p>
      <p className="text-xs text-muted-foreground mt-1">Reviews will appear here once students submit them</p>
    </div>
  </div>
);

export default ReviewsTab;
