import { CheckCircle2, Circle } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { Progress } from "@/components/ui/progress";

interface CourseSetupChecklistProps {
  course: Tables<"courses">;
  modulesCount: number;
  lessonsCount: number;
  schedulesCount: number;
  onNavigateTab: (tab: string) => void;
}

interface ChecklistItem {
  label: string;
  done: boolean;
  tab: string;
}

const CourseSetupChecklist = ({
  course,
  modulesCount,
  lessonsCount,
  schedulesCount,
  onNavigateTab,
}: CourseSetupChecklistProps) => {
  const courseType = (course as any).course_type || "masterclass";
  const isRecurring = (course as any).is_recurring || false;

  const items: ChecklistItem[] = [
    { label: "Add course title & description", done: !!(course.title && course.description), tab: "settings" },
    { label: "Upload thumbnail", done: !!course.thumbnail_url, tab: "settings" },
    { label: "Set pricing", done: course.is_free || course.price > 0, tab: "pricing" },
    { label: "Add at least one module", done: modulesCount > 0, tab: "content" },
    { label: "Add at least one lesson", done: lessonsCount > 0, tab: "content" },
    ...(courseType === "workshop" || courseType === "cohort" || isRecurring
      ? [{ label: "Set up schedule", done: schedulesCount > 0, tab: "schedule" }]
      : []),
    { label: "Publish course", done: course.status === "published", tab: "settings" },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const progress = Math.round((completedCount / items.length) * 100);

  // Don't show if everything is done
  if (progress === 100) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Setup Checklist</h3>
        <span className="text-xs text-muted-foreground">{completedCount}/{items.length} complete</span>
      </div>
      <Progress value={progress} className="h-2" />
      <div className="grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => onNavigateTab(item.tab)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/30"
          >
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CourseSetupChecklist;
