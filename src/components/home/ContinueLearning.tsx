import { Play } from "lucide-react";
import { courses } from "@/data/mockData";

const ContinueLearning = () => {
  const inProgress = courses.filter((c) => c.progress > 0);

  if (inProgress.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 px-4 font-display text-lg font-bold text-foreground">Continue Learning</h2>
      <div className="flex gap-3 overflow-x-auto px-4 hide-scrollbar">
        {inProgress.map((course) => (
          <div
            key={course.id}
            className="min-w-[260px] overflow-hidden rounded-xl border border-border bg-card shadow-card"
          >
            <div className="relative">
              <img src={course.thumbnail} alt={course.title} className="h-32 w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-primary-foreground/20">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary shadow-glow">
                  <Play className="h-4 w-4 text-primary-foreground" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary">
                <div
                  className="h-full gradient-primary rounded-full"
                  style={{ width: `${course.progress}%` }}
                />
              </div>
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-foreground line-clamp-1">{course.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {course.progress}% complete · {course.instructor}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContinueLearning;
