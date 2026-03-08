import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useCourse, useCourseModules, useCourseLessons, useEnrollment, useEnrollInCourse } from "@/hooks/useCourseData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Star, Clock, Users, Play, Lock, CheckCircle2, Calendar, Bell, BookOpen, Award, Shield, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useRef } from "react";
import WaitlistForm from "@/components/course/WaitlistForm";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CourseDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const slotParam = searchParams.get("slot");
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);

  const { data: course, isLoading: courseLoading } = useCourse(slug || "");
  const { data: modules = [] } = useCourseModules(course?.id);
  const { data: lessons = [] } = useCourseLessons(course?.id);
  const { data: enrollment } = useEnrollment(course?.id);
  const enrollMutation = useEnrollInCourse();

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

  const activeSlot = slotParam
    ? schedules.find((s: any) => s.slug === slotParam || s.id === slotParam)
    : null;

  // Sticky CTA bar on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 }
    );
    if (ctaRef.current) observer.observe(ctaRef.current);
    return () => observer.disconnect();
  }, [course]);

  if (courseLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl space-y-4 p-4">
          <Skeleton className="aspect-[21/9] w-full rounded-lg" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
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
          <Button variant="outline" size="sm" onClick={() => navigate("/explore")}>Browse courses</Button>
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

  const enrollUrl = course.payment_page_url
    ? `${course.payment_page_url}${slotParam ? (course.payment_page_url.includes("?") ? "&" : "?") + `slot=${slotParam}` : ""}`
    : null;

  const renderCTA = (className?: string) => (
    <div className={className}>
      {enrollUrl && !course.is_free ? (
        <Button asChild size="lg" className="gap-2 font-bold">
          <a
            href={enrollUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { if (slotParam) localStorage.setItem("pending_slot", slotParam); }}
          >
            <Play className="h-4 w-4" />
            {`Enroll Now · ₹${course.price.toLocaleString()}`}
          </a>
        </Button>
      ) : (
        <Button onClick={handleStartCourse} size="lg" className="gap-2 font-bold">
          <Play className="h-4 w-4" />
          {course.is_free ? "Start Course (Free)" : `Start Course · ₹${course.price.toLocaleString()}`}
        </Button>
      )}
    </div>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl animate-slide-up">
        {/* ── Cinematic Full-Bleed Hero ── */}
        <div className="relative -mx-4 -mt-0 overflow-hidden lg:-mx-0">
          <div className="relative h-[420px] sm:h-[480px] lg:h-[540px]">
            {course.thumbnail_url ? (
              <img
                src={course.thumbnail_url}
                alt={course.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-secondary" />
            )}
            {/* Vignette overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-transparent to-transparent" />

            {/* Play button */}
            {totalLessons > 0 && (
              <button
                onClick={handleStartCourse}
                className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 flex h-20 w-20 items-center justify-center rounded-full border border-foreground/20 bg-foreground/10 backdrop-blur-md transition-all hover:bg-foreground/20 hover:scale-110"
              >
                <Play className="h-8 w-8 text-foreground ml-1" />
              </button>
            )}

            {/* Hero content — bottom */}
            <div className="absolute inset-x-0 bottom-0 p-6 lg:p-10">
              {/* Category badges */}
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge className="bg-foreground/10 text-foreground border-foreground/20 backdrop-blur-sm text-[10px] uppercase tracking-widest font-semibold">
                  {course.category}
                </Badge>
                <Badge className="bg-foreground/10 text-foreground border-foreground/20 backdrop-blur-sm text-[10px] uppercase tracking-widest font-semibold capitalize">
                  {course.difficulty}
                </Badge>
              </div>

              {/* Title */}
              <h1 className="text-3xl font-bold text-foreground lg:text-5xl leading-[1.08] max-w-3xl">
                {course.title}
              </h1>
              {course.short_description && (
                <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed lg:text-base">
                  {course.short_description}
                </p>
              )}

              {/* Instructor in hero */}
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent border border-border text-sm font-bold text-foreground">
                  {course.instructor_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{course.instructor_name}</p>
                  <p className="text-xs text-muted-foreground">Instructor</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Social Proof Strip ── */}
        <div className="border-b border-border bg-card/50">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 lg:px-10">
            {course.rating > 0 && (
              <span className="flex items-center gap-1.5">
                <Star className="h-4 w-4 text-highlight fill-highlight" />
                <span className="text-sm font-bold text-foreground">{course.rating}</span>
                <span className="text-xs text-muted-foreground">rating</span>
              </span>
            )}
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="font-semibold text-foreground">{course.student_count.toLocaleString()}</span> students
            </span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Play className="h-4 w-4" />
              <span className="font-semibold text-foreground">{totalLessons}</span> lessons
            </span>
            {course.estimated_duration && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {course.estimated_duration}
              </span>
            )}
            {course.certificate_enabled && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Award className="h-4 w-4 text-highlight" />
                Certificate included
              </span>
            )}
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="px-4 pt-6 pb-4 lg:px-6 space-y-6">
          {/* Slot-specific schedule badge */}
          {activeSlot && (
            <div className="flex items-center gap-2 rounded-lg border border-highlight/20 bg-highlight/5 px-4 py-3">
              <Calendar className="h-5 w-5 text-highlight" />
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

          {/* CTA (observed for sticky bar) */}
          <div ref={ctaRef} className="flex flex-wrap gap-3">
            {renderCTA()}
            {(course as any).max_students && course.student_count >= (course as any).max_students && (
              <Button variant="outline" onClick={() => setShowWaitlist(true)} className="gap-2">
                <Bell className="h-4 w-4" />
                Join Waitlist
              </Button>
            )}
          </div>

          {/* What you'll learn — icon grid */}
          {course.tags && course.tags.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-base font-bold text-foreground mb-4">What you'll learn</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {course.tags.map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-success shrink-0" />
                    <span className="text-sm text-muted-foreground">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available slots */}
          {!slotParam && course.is_recurring && schedules.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Available Batches</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {schedules.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/course/${slug}?slot=${s.slug || s.id}`)}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-all hover:border-muted-foreground/30 hover:shadow-[0_0_0_1px_hsl(var(--highlight)/0.1)]"
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

        {/* ── Tabs ── */}
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

              {/* Trust badges */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: Shield, label: "Lifetime Access" },
                  { icon: Award, label: "Certificate" },
                  { icon: Play, label: `${totalLessons} Lessons` },
                  { icon: Users, label: `${course.student_count}+ Students` },
                ].map((badge) => (
                  <div key={badge.label} className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center">
                    <badge.icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{badge.label}</span>
                  </div>
                ))}
              </div>
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
                              className="group/lesson flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/30"
                            >
                              {lesson.is_free ? (
                                <Play className="h-4 w-4 text-foreground shrink-0" />
                              ) : (
                                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{lesson.title}</p>
                                {lesson.description && (
                                  <p className="text-xs text-muted-foreground truncate opacity-0 group-hover/lesson:opacity-100 transition-opacity">
                                    {lesson.description}
                                  </p>
                                )}
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
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <BookOpen className="h-10 w-10 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">Curriculum coming soon</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Floating Sticky CTA Bar ── */}
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl transition-all duration-300 lg:left-60 ${
            showStickyBar ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
          }`}
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 lg:px-6">
            <div className="min-w-0 mr-4">
              <p className="text-sm font-bold text-foreground truncate">{course.title}</p>
              <p className="text-xs text-muted-foreground">
                {course.is_free ? "Free" : `₹${course.price.toLocaleString()}`}
                {course.rating > 0 && ` · ⭐ ${course.rating}`}
              </p>
            </div>
            {renderCTA("shrink-0")}
          </div>
        </div>
      </div>

      <WaitlistForm
        open={showWaitlist}
        onOpenChange={setShowWaitlist}
        courseId={course.id}
        scheduleId={activeSlot?.id}
        courseTitle={course.title}
      />
    </AppShell>
  );
};

export default CourseDetail;
