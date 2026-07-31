// Ratings & reviews are hidden for now (product decision — not needed yet).
// Kept as a no-op component so the call sites (course cards, My Courses,
// Continue Learning, catalog) don't need editing, and re-enabling is a revert
// of this one file. See git history for the original implementation.

interface CourseRatingBadgePropsWithData {
  avgRating: number;
  totalReviews: number;
  courseId?: never;
}

interface CourseRatingBadgePropsWithId {
  courseId: string;
  avgRating?: never;
  totalReviews?: never;
}

type CourseRatingBadgeProps = CourseRatingBadgePropsWithData | CourseRatingBadgePropsWithId;

const CourseRatingBadge = (_props: CourseRatingBadgeProps) => null;

export default CourseRatingBadge;
