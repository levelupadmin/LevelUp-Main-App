import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

const CourseRatingBadge = (props: CourseRatingBadgeProps) => {
  const [avg, setAvg] = useState(props.avgRating ?? 0);
  const [count, setCount] = useState(props.totalReviews ?? 0);
  const [loaded, setLoaded] = useState(!props.courseId);

  useEffect(() => {
    if (!props.courseId) return;
    (supabase as any)
      .from("course_rating_stats")
      .select("avg_rating, total_reviews")
      .eq("course_id", props.courseId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setAvg(Number(data.avg_rating));
          setCount(data.total_reviews);
        }
        setLoaded(true);
      });
  }, [props.courseId]);

  if (!loaded || count === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
      <span className="font-medium text-foreground">{avg.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
};

export default CourseRatingBadge;
