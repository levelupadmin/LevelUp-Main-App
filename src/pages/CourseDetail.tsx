import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useCourse, useCourseModules, useCourseLessons } from "@/hooks/useCourseData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Star, Clock, Users, Play, Lock, CheckCircle2, Calendar, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import WaitlistForm from "@/components/course/WaitlistForm";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CourseDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const slotParam = searchParams.get("slot");
  const [showWaitlist, setShowWaitlist] = useState(false);

  const { data: course, isLoading: courseLoading } = useCourse(slug || "");
  const { data: modules = [] } = useCourseModules(course?.id);
  const { data: lessons = [] } = useCourseLessons(course?.id);

  // Fetch schedules for recurring courses
  const { data: schedules = [] } = useQuery({
    queryKey: ["course-schedules", course?.id],
    enabled: !!course?.id && course?.is_recurring,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_schedules")
        .select("*")
        .eq("course_id", course!.id)
        .eq("is_active", true)
        .order("day_of_week");
      if (error) throw error;
      return data;
    },
  });

  // Find the active slot based on URL param
  const activeSlot = slotParam
    ? schedules.find((s: any) => s.slug === slotParam || s.id === slotParam)
    : null;

  if (courseLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl space-y-4 p-4">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <p className="text-muted-foreground">Course not found</p>
        </div>
      </AppShell>
    );
  }

  const totalLessons = lessons.length;
  const freeLessons = lessons.filter((l) => l.is_free);

  const handleStartCourse = () => {
    if (freeLessons.length > 0) {
      navigate(`/learn/lesson/${freeLessons[0].id}`);
    } else if (lessons.length > 0) {
      navigate(`/learn/lesson/${lessons[0].id}`);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        {/* Hero */}
        <div className="relative aspect-video bg-black overflow-hidden">
          {course.thumbnail_url ? (
            <img src={course.thumbnail_url} alt={course.title} className="h-full w-full object-cover opacity-60" />
          ) : (
            <div className="h-full w-full bg-secondary" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={handleStartCourse}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-md border border-foreground/20 transition-all hover:bg-foreground/20 hover:scale-105"
            >
              <Play className="h-7 w-7 text-white ml-1" />
            </button>
          </div>
        </div>

        {/* Course info */}
        <div className="px-4 pt-5 pb-4 lg:px-6 space-y-4">
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge variant="secondary" className="text-[10px]">{course.category}</Badge>
              <Badge variant="secondary" className="text-[10px] capitalize">{course.difficulty}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-foreground lg:text-3xl leading-tight">{course.title}</h1>
            {course.short_description && (
              <p className="text-sm text-muted-foreground mt-1">{course.short_description}</p>
            )}
          </div>

          {/* Slot-specific schedule badge */}
          {activeSlot && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {DAY_LABELS[(activeSlot as any).day_of_week]} at {(activeSlot as any).start_time?.slice(0, 5)}
                  {(activeSlot as any).end_time ? ` – ${(activeSlot as any).end_time?.slice(0, 5)}` : ""}
                </p>
                {(activeSlot as any).label && (
                  <p className="text-xs text-muted-foreground">{(activeSlot as any).label}</p>
                )}
              </div>
            </div>
          )}

          {/* Instructor */}
          <p className="text-sm text-muted-foreground">
            by <span className="font-semibold text-foreground">{course.instructor_name}</span>
          </p>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {course.rating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 text-[hsl(var(--highlight))] fill-[hsl(var(--highlight))]" />
                <span className="font-semibold text-foreground">{course.rating}</span>
              </span>
            )}
            <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {course.student_count} students</span>
            <span className="flex items-center gap-1"><Play className="h-4 w-4" /> {totalLessons} lessons</span>
            {course.estimated_duration && (
              <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {course.estimated_duration}</span>
            )}
          </div>

          {/* CTA */}
          <div className="flex flex-wrap gap-3">
            {course.payment_page_url && !course.is_free ? (
              <Button asChild className="gap-2">
                <a
                  href={`${course.payment_page_url}${slotParam ? (course.payment_page_url.includes("?") ? "&" : "?") + `slot=${slotParam}` : ""}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (slotParam) localStorage.setItem("pending_slot", slotParam);
                  }}
                >
                  <Play className="h-4 w-4" />
                  {`Enroll Now · ₹${course.price.toLocaleString()}`}
                </a>
              </Button>
            ) : (
              <Button onClick={handleStartCourse} className="gap-2">
                <Play className="h-4 w-4" />
                {course.is_free ? "Start Course (Free)" : `Start Course · ₹${course.price.toLocaleString()}`}
              </Button>
            )}
            {(course as any).max_students && course.student_count >= (course as any).max_students && (
              <Button variant="outline" onClick={() => setShowWaitlist(true)} className="gap-2">
                <Bell className="h-4 w-4" />
                Join Waitlist
              </Button>
            )}
          </div>

          {/* Available slots (only when no slot param and course is recurring) */}
          {!slotParam && course.is_recurring && schedules.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Available Batches</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {schedules.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/course/${slug}?slot=${s.slug || s.id}`)}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary/30"
                  >
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{DAY_LABELS[s.day_of_week]} at {s.start_time?.slice(0, 5)}</p>
                      {s.label && <p className="text-xs text-muted-foreground">{s.label}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="px-4 pb-8 lg:px-6">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="bg-muted border border-border w-full justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {course.description && (
                <div>
                  <h3 className="text-base font-bold text-foreground mb-2">About this course</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{course.description}</p>
                </div>
              )}
              {course.tags && course.tags.length > 0 && (
                <div>
                  <h3 className="text-base font-bold text-foreground mb-2">Topics covered</h3>
                  <div className="flex flex-wrap gap-2">
                    {course.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="curriculum" className="space-y-2">
              <Accordion type="multiple" defaultValue={modules.length > 0 ? [modules[0].id] : []} className="space-y-2">
                {modules.map((mod, mi) => {
                  const modLessons = lessons.filter((l) => l.module_id === mod.id);
                  return (
                    <AccordionItem key={mod.id} value={mod.id} className="rounded-lg border border-border bg-card overflow-hidden">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-3 text-left">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-bold text-secondary-foreground">
                            {mi + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{mod.title}</p>
                            <p className="text-xs text-muted-foreground">{modLessons.length} lessons</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-0 pb-0">
                        <div className="divide-y divide-border border-t border-border">
                          {modLessons.map((lesson) => (
                            <button
                              key={lesson.id}
                              onClick={() => navigate(`/learn/lesson/${lesson.id}`)}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/30"
                            >
                              {lesson.is_free ? (
                                <Play className="h-4 w-4 text-foreground shrink-0" />
                              ) : (
                                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{lesson.title}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {lesson.is_free && <Badge variant="secondary" className="text-[9px]">FREE</Badge>}
                                <Badge variant="outline" className="text-[9px] capitalize">{lesson.type}</Badge>
                                {lesson.duration && <span className="text-xs text-muted-foreground font-mono">{lesson.duration}</span>}
                              </div>
                            </button>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
              {modules.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Curriculum coming soon</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
};

export default CourseDetail;
