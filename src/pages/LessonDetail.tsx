import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import { useLesson, useLessonCourse, useCourseLessons, useCourseModules } from "@/hooks/useCourseData";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import LessonContentViewer from "@/components/learn/LessonContentViewer";

const LessonDetail = () => {
  const { lessonId } = useParams();
  const navigate = useNavigate();

  const { data: lesson, isLoading: lessonLoading } = useLesson(lessonId || "");
  const { data: course } = useLessonCourse(lesson?.course_id);
  const { data: allLessons = [] } = useCourseLessons(lesson?.course_id);
  const { data: modules = [] } = useCourseModules(lesson?.course_id);

  if (lessonLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl space-y-4 p-4">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      </AppShell>
    );
  }

  if (!lesson || !course) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <p className="text-muted-foreground">Lesson not found</p>
        </div>
      </AppShell>
    );
  }

  // Sort lessons by module order then lesson order
  const sortedLessons = [...allLessons].sort((a, b) => {
    const modA = modules.find((m) => m.id === a.module_id);
    const modB = modules.find((m) => m.id === b.module_id);
    const modOrder = (modA?.sort_order ?? 0) - (modB?.sort_order ?? 0);
    return modOrder !== 0 ? modOrder : a.sort_order - b.sort_order;
  });

  const currentIndex = sortedLessons.findIndex((l) => l.id === lesson.id);
  const prevLesson = currentIndex > 0 ? sortedLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < sortedLessons.length - 1 ? sortedLessons[currentIndex + 1] : null;

  const currentModule = modules.find((m) => m.id === lesson.module_id);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        {/* Back nav */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <button
            onClick={() => navigate(`/learn/course/${course.slug}`)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="truncate max-w-[200px]">{course.title}</span>
          </button>
          <span className="text-xs text-muted-foreground ml-auto font-mono">
            {currentIndex + 1} / {sortedLessons.length}
          </span>
        </div>

        {/* Content viewer */}
        <div className="relative">
          <LessonContentViewer lesson={lesson} courseThumbnail={course.thumbnail_url} />
        </div>

        {/* Lesson header */}
        <div className="px-4 py-4 border-b border-border lg:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-foreground lg:text-xl">{lesson.title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {currentModule && <span>{currentModule.title} · </span>}
                Lesson {currentIndex + 1} of {sortedLessons.length}
                {lesson.duration && ` · ${lesson.duration}`}
              </p>
            </div>
            <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{lesson.type}</Badge>
          </div>

          {lesson.description && (
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{lesson.description}</p>
          )}
        </div>

        {/* Text/content area for non-video lessons shown below the viewer */}
        {lesson.type !== "video" && lesson.content && (
          <div className="px-4 py-4 lg:px-6">
            <div className="rounded-lg border border-border bg-card p-5">
              <pre className="whitespace-pre-wrap font-body text-sm text-muted-foreground leading-relaxed">
                {lesson.content}
              </pre>
            </div>
          </div>
        )}

        {/* Bottom nav */}
        <div className="sticky bottom-0 border-t border-border bg-background/80 backdrop-blur-md px-4 py-3 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={!prevLesson}
              onClick={() => prevLesson && navigate(`/learn/lesson/${prevLesson.id}`)}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={!nextLesson}
              onClick={() => nextLesson && navigate(`/learn/lesson/${nextLesson.id}`)}
              className="gap-1.5"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default LessonDetail;
