import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate } from "react-router-dom";
import {
  useCourse,
  useCourseModules,
  useCourseLessons,
  useCourseProgress,
  useEnrollment,
} from "@/hooks/useCourseData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Play,
  CheckCircle2,
  Circle,
  Clock,
  Award,
  BookOpen,
  StickyNote,
  Download,
  Star,
  Lock,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";

const MasterclassDashboard = () => {
  const { slug } = useParams();
  const navigate = useNavigate();

  const { data: course, isLoading } = useCourse(slug || "");
  const { data: modules = [] } = useCourseModules(course?.id);
  const { data: lessons = [] } = useCourseLessons(course?.id);
  const { data: progress = [] } = useCourseProgress(course?.id);
  const { data: enrollment } = useEnrollment(course?.id);

  if (isLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl space-y-4 p-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <BookOpen className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">Course not found</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/learn")}>
            Back to Learn
          </Button>
        </div>
      </AppShell>
    );
  }

  const completedLessons = progress.filter((p) => p.status === "completed").length;
  const totalLessons = lessons.length;
  const progressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // Find the next incomplete lesson
  const sortedLessons = [...lessons].sort((a, b) => {
    const modA = modules.find((m) => m.id === a.module_id);
    const modB = modules.find((m) => m.id === b.module_id);
    return (modA?.sort_order ?? 0) - (modB?.sort_order ?? 0) || a.sort_order - b.sort_order;
  });

  const completedIds = new Set(progress.filter((p) => p.status === "completed").map((p) => p.lesson_id));
  const nextLesson = sortedLessons.find((l) => !completedIds.has(l.id)) ?? sortedLessons[0];

  // Aggregate notes
  const allNotes = progress
    .filter((p) => (p as any).notes)
    .map((p) => {
      const lesson = lessons.find((l) => l.id === p.lesson_id);
      return { lessonTitle: lesson?.title ?? "Untitled", notes: (p as any).notes as string };
    });

  const certThreshold = course.certificate_threshold ?? 70;

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
        </div>

        {/* Hero Progress Card */}
        <div className="relative overflow-hidden">
          <div className="relative h-52 sm:h-64">
            {course.thumbnail_url ? (
              <img src={course.thumbnail_url} alt={course.title} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-secondary" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <Badge className="bg-foreground/10 text-foreground border-foreground/20 backdrop-blur-sm text-[10px] uppercase tracking-widest font-semibold mb-2">
                Masterclass
              </Badge>
              <h1 className="text-xl font-bold text-foreground lg:text-2xl">{course.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{course.instructor_name}</p>
            </div>
          </div>

          {/* Progress bar + CTA */}
          <div className="border-b border-border bg-card/50 px-6 py-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex h-12 w-12 items-center justify-center">
                  <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-secondary"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className="text-highlight"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray={`${progressPct}, 100`}
                    />
                  </svg>
                  <span className="absolute text-xs font-bold text-foreground">{progressPct}%</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {completedLessons} of {totalLessons} lessons completed
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {progressPct >= 100 ? "Course completed! 🎉" : "Keep going!"}
                  </p>
                </div>
              </div>
              {nextLesson && (
                <Button
                  onClick={() => navigate(`/learn/lesson/${nextLesson.id}`)}
                  className="gap-2 font-bold shrink-0"
                >
                  <Play className="h-4 w-4" />
                  {completedLessons === 0 ? "Start Learning" : "Continue"}
                </Button>
              )}
            </div>
            <Progress value={progressPct} className="h-1.5" />
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 py-6 lg:px-6">
          <Tabs defaultValue="curriculum" className="space-y-4">
            <TabsList className="bg-muted border border-border w-full justify-start">
              <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="resources">Resources</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
            </TabsList>

            {/* Curriculum */}
            <TabsContent value="curriculum" className="space-y-2">
              <Accordion
                type="multiple"
                defaultValue={modules.map((m) => m.id)}
                className="space-y-2"
              >
                {modules.map((mod, mi) => {
                  const modLessons = lessons.filter((l) => l.module_id === mod.id);
                  const modCompleted = modLessons.filter((l) => completedIds.has(l.id)).length;
                  const modPct = modLessons.length > 0 ? Math.round((modCompleted / modLessons.length) * 100) : 0;
                  return (
                    <AccordionItem
                      key={mod.id}
                      value={mod.id}
                      className="rounded-lg border border-border bg-card overflow-hidden"
                    >
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-3 text-left flex-1">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-bold text-secondary-foreground">
                            {mi + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">{mod.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {modCompleted}/{modLessons.length} completed · {modPct}%
                            </p>
                          </div>
                          {modPct === 100 && (
                            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-0 pb-0">
                        <div className="divide-y divide-border border-t border-border">
                          {modLessons.map((lesson) => {
                            const done = completedIds.has(lesson.id);
                            return (
                              <button
                                key={lesson.id}
                                onClick={() => navigate(`/learn/lesson/${lesson.id}`)}
                                className="group/lesson flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/30"
                              >
                                {done ? (
                                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                                ) : (
                                  <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-foreground truncate">{lesson.title}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[9px] capitalize">
                                    {lesson.type}
                                  </Badge>
                                  {lesson.duration && (
                                    <span className="text-xs text-muted-foreground font-mono">
                                      {lesson.duration}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </TabsContent>

            {/* Notes */}
            <TabsContent value="notes" className="space-y-3">
              {allNotes.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                    <StickyNote className="h-10 w-10 text-muted-foreground/20" />
                    <p className="text-sm text-muted-foreground">
                      No notes yet. Start taking notes from the lesson player!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                allNotes.map((n, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold text-highlight mb-1">{n.lessonTitle}</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{n.notes}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Resources */}
            <TabsContent value="resources">
              <CourseResourcesTab courseId={course.id} />
            </TabsContent>

            {/* Reviews */}
            <TabsContent value="reviews">
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                  <Star className="h-10 w-10 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">
                    Reviews coming soon.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Certificate Progress */}
        {course.certificate_enabled && (
          <div className="mx-4 mb-8 lg:mx-6">
            <Card className={progressPct >= certThreshold ? "border-highlight/30 bg-highlight/5" : ""}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Award className={`h-6 w-6 ${progressPct >= certThreshold ? "text-highlight" : "text-muted-foreground/40"}`} />
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {progressPct >= certThreshold ? "Certificate Unlocked! 🎉" : "Earn Your Certificate"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Complete {certThreshold}% of the course to earn your certificate
                    </p>
                  </div>
                </div>
                <Progress value={Math.min(progressPct, 100)} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2 text-right">{progressPct}% / {certThreshold}%</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Instructor Card */}
        <div className="mx-4 mb-8 lg:mx-6">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent border border-border text-lg font-bold text-foreground">
                  {course.instructor_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{course.instructor_name}</p>
                  <p className="text-xs text-muted-foreground">Instructor</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
};

/* ─── Course Resources Sub-component ─── */
function CourseResourcesTab({ courseId }: { courseId: string }) {
  const { data: resources = [], isLoading } = useQuery({
    queryKey: ["course-resources", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_resources")
        .select("*")
        .eq("course_id", courseId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Loading resources…</p>;
  }

  if (resources.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <Download className="h-10 w-10 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">
            No downloadable resources yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {resources.map((res) => (
        <a
          key={res.id}
          href={res.file_url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-muted-foreground/30"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary shrink-0">
            <Download className="h-4 w-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{res.title}</p>
            <Badge variant="secondary" className="text-[10px] capitalize mt-0.5">{res.type}</Badge>
          </div>
        </a>
      ))}
    </div>
  );
}

export default MasterclassDashboard;
