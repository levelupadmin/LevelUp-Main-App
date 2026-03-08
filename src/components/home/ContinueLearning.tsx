import { useNavigate } from "react-router-dom";
import { courses } from "@/data/mockData";
import { ArrowRight } from "lucide-react";

const ContinueLearning = () => {
  const navigate = useNavigate();
  const inProgress = courses.filter((c) => c.progress > 0);

  if (inProgress.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Continue learning</h2>
        <button
          onClick={() => navigate("/learn/my-learning")}
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {inProgress.map((course) => (
          <div
            key={course.id}
            onClick={() => navigate(`/learn/course/${course.id}`)}
            className="group cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/20"
          >
            <div className="flex gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                <img src={course.thumbnail} alt={course.title} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{course.category}</p>
                <h3 className="mt-1 text-sm font-bold text-foreground">{course.title}</h3>
                <div className="mt-2 h-1 rounded-full bg-accent">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${course.progress}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{course.progress}% complete</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ContinueLearning;
