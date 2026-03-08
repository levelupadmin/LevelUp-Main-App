import { Play } from "lucide-react";
import { courses } from "@/data/mockData";

const ContinueLearning = () => {
  const inProgress = courses.filter((c) => c.progress > 0);

  if (inProgress.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-lg font-bold text-foreground">Continue Learning</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {inProgress.map((course) => (
          <div
            key={course.id}
            className="group overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/30"
          >
            <div className="relative">
              <img src={course.thumbnail} alt={course.title} className="h-36 w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-background/30 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
                  <Play className="h-4 w-4 text-primary-foreground" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${course.progress}%` }}
                />
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm font-semibold text-foreground line-clamp-1">{course.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
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
