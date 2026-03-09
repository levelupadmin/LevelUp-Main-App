import { useNavigate } from "react-router-dom";
import { Star, Clock, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { MockCourse } from "@/data/learnMockData";

interface Props {
  course: MockCourse;
  compact?: boolean;
  showProgress?: boolean;
}

const CourseCard = ({ course, compact, showProgress }: Props) => {
  const navigate = useNavigate();
  const progressPct = course.completedLessons.length
    ? Math.round((course.completedLessons.length / course.totalLessons) * 100)
    : 0;

  return (
    <button
      onClick={() => navigate(`/learn/course/${course.slug}`)}
      className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden text-left transition-all hover:border-[hsl(var(--highlight))/30] hover:shadow-lg w-full"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full bg-secondary overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <span className="text-xs">16:9</span>
        </div>
        {showProgress && course.isPurchased && progressPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0">
            <Progress value={progressPct} className="h-1 rounded-none bg-secondary" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-1 flex-col gap-2 p-3 ${compact ? "p-2.5" : "p-3"}`}>
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-[hsl(var(--highlight))] transition-colors">
          {course.title}
        </h3>

        {/* Instructor */}
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center">
            <User className="h-3 w-3 text-muted-foreground" />
          </div>
          <span className="text-xs text-muted-foreground">{course.instructor.name}</span>
        </div>

        {/* Rating + duration */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-[hsl(var(--highlight))] text-[hsl(var(--highlight))]" />
            {course.rating}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {course.duration}
          </span>
        </div>

        {/* Price or progress */}
        <div className="mt-auto pt-1">
          {showProgress && course.isPurchased ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{progressPct}% complete</span>
              <span className="text-xs font-medium text-[hsl(var(--highlight))]">Resume</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">₹{course.price.toLocaleString("en-IN")}</span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

export default CourseCard;
