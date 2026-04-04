import AppShell from "@/components/layout/AppShell";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useCourse, useCourseModules, useCourseLessons, useEnrollment, useEnrollInCourse, useCourseProgress } from "@/hooks/useCourseData";
import { useDripLockMap } from "@/hooks/useDripLock";
import { useCertificate, useGenerateCertificate } from "@/hooks/useCertificate";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Star, Clock, Users, Play, Lock, CheckCircle2, Calendar, Bell,
  BookOpen, Award, Shield, ChevronDown, Eye, Sparkles, GraduationCap,
  Circle, ChevronLeft, ChevronRight, Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
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
  const { user } = useAuth();

  const { data: course, isLoading: courseLoading } = useCourse(slug || "");
  const { data: modules = [] } = useCourseModules(course?.id);
  const { data: lessons = [] } = useCourseLessons(course?.id);
  const { data: enrollment } = useEnrollment(course?.id);
  const { data: progress = [] } = useCourseProgress(course?.id);
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

  // Certificate — must be called before any early returns
  const { data: certificate } = useCertificate(course?.id);
  const generateCert = useGenerateCertificate();

  // Drip lock — must be called before any early returns
  const dripMap = useDripLockMap(course, modules, lessons, enrollment, progress);

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

  const isEnrolled = !!enrollment;
  const totalLessons = lessons.length;
  const freeLessons = lessons.filter((l) => l.is_free);
  const completedIds = new Set(progress.filter((p) => p.status === "completed").map((p) => p.lesson_id));
  const completedLessons = completedIds.size;
  const progressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const sortedLessons = [...lessons].sort((a, b) => {
    const modA = modules.find((m) => m.id === a.module_id);
    const modB = modules.find((m) => m.id === b.module_id);
    return (modA?.sort_order ?? 0) - (modB?.sort_order ?? 0) || a.sort_order - b.sort_order;
  });

  const nextLesson = sortedLessons.find((l) => !completedIds.has(l.id) && !dripMap.get(l.id)?.isLocked) ?? sortedLessons[0];

  const handleStartCourse = () => {
    if (enrollment) {
      navigate(`/learn/course/${course.slug}/dashboard`);
      return;
    }
    if (course.is_free) {
      enrollMutation.mutate({ courseId: course.id, courseTitle: course.title }, {
        onSuccess: () => navigate(`/learn/course/${course.slug}/dashboard`),
      });
      return;
    }
    // Paid course — redirect to checkout
    navigate(`/checkout/${course.slug}`);
  };

  const enrollUrl = course.payment_page_url
    ? `${course.payment_page_url}${slotParam ? (course.payment_page_url.includes("?") ? "&" : "?") + `slot=${slotParam}` : ""}`
    : null;

  // ═══════════════════════════════════════════════
  // ENROLLED VIEW — Learning Dashboard
  // ═══════════════════════════════════════════════
  if (isEnrolled) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl animate-slide-up">
          {/* Back nav */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <button
              onClick={() => navigate("/learn")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Learn
            </button>
          </div>

          {/* Compact Hero with Progress */}
          <div className="relative overflow-hidden">
            <div className="relative h-48 sm:h-56">
              {course.thumbnail_url ? (
                <img src={course.thumbnail_url} alt={course.title} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-secondary" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/30" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <Badge className="bg-highlight/15 text-highlight border-highlight/25 text-[10px] uppercase tracking-widest font-semibold mb-2">
                  {course.course_type === "cohort" ? "Cohort Program" : course.course_type === "workshop" ? "Workshop" : "Masterclass"}
                </Badge>
                <h1 className="text-xl font-bold text-foreground lg:text-2xl max-w-2xl">{course.title}</h1>
                <p className="text-sm text-muted-foreground mt-1">{course.instructor_name}</p>
              </div>
            </div>
          </div>

          {/* Progress Strip */}
          <div className="border-b border-border bg-card/60 backdrop-blur-sm px-6 py-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                {/* Circular progress */}
                <div className="relative flex h-12 w-12 items-center justify-center shrink-0">
                  <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-secondary"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke="currentColor" strokeWidth="3"
                    />
                    <path
                      className="text-highlight"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke="currentColor" strokeWidth="3"
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
                    {progressPct >= 100 ? "Course completed! 🎉" : progressPct > 0 ? "Keep going!" : "Ready to start"}
                  </p>
                </div>
              </div>
              {nextLesson && (
                <Button onClick={() => navigate(`/learn/lesson/${nextLesson.id}`)} className="gap-2 font-bold shrink-0">
                  <Play className="h-4 w-4" />
                  {completedLessons === 0 ? "Start Learning" : "Continue"}
                </Button>
              )}
            </div>
            <Progress value={progressPct} className="h-1.5" />
          </div>

          {/* Enrolled Curriculum — All unlocked */}
          <div className="px-4 py-6 lg:px-6 space-y-4">
            <h2 className="text-base font-bold text-foreground">Course Content</h2>
            <Accordion type="multiple" defaultValue={modules.map((m) => m.id)} className="space-y-2">
              {modules.map((mod, mi) => {
                const modLessons = sortedLessons.filter((l) => l.module_id === mod.id);
                const modCompleted = modLessons.filter((l) => completedIds.has(l.id)).length;
                const modPct = modLessons.length > 0 ? Math.round((modCompleted / modLessons.length) * 100) : 0;
                return (
                  <AccordionItem key={mod.id} value={mod.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-3 text-left flex-1">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${modPct === 100 ? "bg-highlight/15 text-highlight" : "bg-secondary text-secondary-foreground"}`}>
                          {modPct === 100 ? <CheckCircle2 className="h-4 w-4" /> : mi + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{mod.title}</p>
                          <p className="text-xs text-muted-foreground">{modCompleted}/{modLessons.length} completed</p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-0 pb-0">
                      <div className="divide-y divide-border border-t border-border">
                        {modLessons.map((lesson) => {
                          const done = completedIds.has(lesson.id);
                          const isNext = nextLesson?.id === lesson.id;
                          const drip = dripMap.get(lesson.id);
                          const isLocked = drip?.isLocked ?? false;
                          return (
                            <button
                              key={lesson.id}
                              onClick={() => !isLocked && navigate(`/learn/lesson/${lesson.id}`)}
                              disabled={isLocked}
                              className={`group/lesson flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isLocked ? "opacity-50 cursor-not-allowed" : "hover:bg-secondary/30"} ${isNext ? "bg-highlight/5 border-l-2 border-l-highlight" : ""}`}
                            >
                              {isLocked ? (
                                <Lock className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                              ) : done ? (
                                <CheckCircle2 className="h-4 w-4 text-highlight shrink-0" />
                              ) : isNext ? (
                                <Play className="h-4 w-4 text-highlight shrink-0" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm truncate ${isLocked ? "text-muted-foreground" : isNext ? "text-foreground font-medium" : done ? "text-muted-foreground" : "text-foreground"}`}>
                                  {lesson.title}
                                </p>
                                {isLocked && drip?.reason && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{drip.reason}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[9px] capitalize">{lesson.type}</Badge>
                                {lesson.duration && <span className="text-xs text-muted-foreground font-mono">{lesson.duration}</span>}
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

            {/* Certificate Progress */}
            {course.certificate_enabled && (
              <Card className={progressPct >= (course.certificate_threshold ?? 70) ? "border-highlight/30 bg-highlight/5" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Award className={`h-6 w-6 ${progressPct >= (course.certificate_threshold ?? 70) ? "text-highlight" : "text-muted-foreground/40"}`} />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">
                        {certificate ? "Certificate Earned! 🎉" : progressPct >= (course.certificate_threshold ?? 70) ? "Certificate Unlocked! 🎉" : "Earn Your Certificate"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Complete {course.certificate_threshold ?? 70}% of the course
                      </p>
                    </div>
                    {progressPct >= (course.certificate_threshold ?? 70) && !certificate && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5 text-xs"
                        disabled={generateCert.isPending}
                        onClick={() => generateCert.mutate({ courseId: course.id, completionPct: progressPct })}
                      >
                        <Award className="h-3.5 w-3.5" />
                        {generateCert.isPending ? "Generating…" : "Get Certificate"}
                      </Button>
                    )}
                    {certificate && (
                      <Badge className="bg-highlight/15 text-highlight text-[10px]">Issued</Badge>
                    )}
                  </div>
                  <Progress value={Math.min(progressPct, 100)} className="h-2" />
                </CardContent>
              </Card>
            )}

            {/* Instructor */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  {course.instructor_image_url ? (
                    <img src={course.instructor_image_url} alt={course.instructor_name} className="h-14 w-14 rounded-full object-cover border border-border" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent border border-border text-lg font-bold text-foreground">
                      {course.instructor_name.charAt(0)}
                    </div>
                  )}
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
  }

  // ═══════════════════════════════════════════════
  // NON-ENROLLED VIEW — Cinematic Sales Page
  // ═══════════════════════════════════════════════

  const renderCTA = (className?: string) => (
    <div className={className}>
      {enrollUrl && !course.is_free ? (
        <Button asChild size="lg" className="gap-2 font-bold bg-highlight text-highlight-foreground hover:bg-highlight/90">
          <a
            href={enrollUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { if (slotParam) localStorage.setItem("pending_slot", slotParam); }}
          >
            <Sparkles className="h-4 w-4" />
            {`Enroll Now · ₹${course.price.toLocaleString()}`}
          </a>
        </Button>
      ) : (
        <Button onClick={handleStartCourse} size="lg" className="gap-2 font-bold bg-highlight text-highlight-foreground hover:bg-highlight/90" disabled={enrollMutation.isPending}>
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
          <div className="relative h-[480px] sm:h-[540px] lg:h-[600px]">
            {course.thumbnail_url ? (
              <img src={course.thumbnail_url} alt={course.title} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-secondary" />
            )}
            {/* Cinematic overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/5" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-transparent" />

            {/* Play trailer button */}
            {totalLessons > 0 && (
              <button
                onClick={handleStartCourse}
                className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 group"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-foreground/30 bg-foreground/10 backdrop-blur-xl transition-all group-hover:bg-foreground/20 group-hover:scale-110 group-hover:border-foreground/50">
                  <Play className="h-8 w-8 text-foreground ml-1" />
                </div>
                <p className="mt-3 text-xs text-foreground/70 font-medium tracking-wider uppercase text-center">
                  {freeLessons.length > 0 ? "Watch Preview" : "Play Trailer"}
                </p>
              </button>
            )}

            {/* Hero content */}
            <div className="absolute inset-x-0 bottom-0 p-6 lg:p-10">
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge className="bg-highlight/15 text-highlight border-highlight/25 text-[10px] uppercase tracking-widest font-bold">
                  {course.course_type === "cohort" ? "Cohort Program" : course.course_type === "workshop" ? "Workshop" : "Masterclass"}
                </Badge>
                <Badge className="bg-foreground/10 text-foreground border-foreground/20 backdrop-blur-sm text-[10px] uppercase tracking-widest font-semibold capitalize">
                  {course.difficulty}
                </Badge>
              </div>

              <h1 className="text-3xl font-bold text-foreground lg:text-5xl leading-[1.08] max-w-3xl">
                {course.title}
              </h1>
              {course.short_description && (
                <p className="mt-3 text-sm text-foreground/70 max-w-2xl leading-relaxed lg:text-base">
                  {course.short_description}
                </p>
              )}

              {/* Instructor strip */}
              <div className="mt-5 flex items-center gap-3">
                {course.instructor_image_url ? (
                  <img
                    src={course.instructor_image_url}
                    alt={course.instructor_name}
                    className="h-11 w-11 rounded-full object-cover border-2 border-foreground/20"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent border-2 border-foreground/20 text-sm font-bold text-foreground">
                    {course.instructor_name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">{course.instructor_name}</p>
                  <p className="text-xs text-foreground/50">Instructor</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Social Proof Strip ── */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm">
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
              <Video className="h-4 w-4" />
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
                Certificate
              </span>
            )}
          </div>
        </div>

        {/* ── CTA Section ── */}
        <div className="px-6 pt-6 pb-4 lg:px-10 space-y-4">
          {/* Slot badge */}
          {activeSlot && (
            <div className="flex items-center gap-2 rounded-lg border border-highlight/20 bg-highlight/5 px-4 py-3">
              <Calendar className="h-5 w-5 text-highlight" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {DAY_LABELS[(activeSlot as any).day_of_week]} at {(activeSlot as any).start_time?.slice(0, 5)}
                  {(activeSlot as any).end_time ? ` – ${(activeSlot as any).end_time?.slice(0, 5)}` : ""}
                </p>
                {(activeSlot as any).label && <p className="text-xs text-muted-foreground">{(activeSlot as any).label}</p>}
              </div>
            </div>
          )}

          <div ref={ctaRef} className="flex flex-wrap items-center gap-3">
            {renderCTA()}
            {(course as any).max_students && course.student_count >= (course as any).max_students && (
              <Button variant="outline" onClick={() => setShowWaitlist(true)} className="gap-2">
                <Bell className="h-4 w-4" /> Join Waitlist
              </Button>
            )}
            {!course.is_free && (
              <p className="text-xs text-muted-foreground">
                One-time payment · Lifetime access · 7-day refund
              </p>
            )}
          </div>
        </div>

        {/* ── What You'll Learn ── */}
        {course.tags && course.tags.length > 0 && (
          <div className="px-6 py-4 lg:px-10">
            <div className="rounded-xl border border-border bg-card/80 p-6">
              <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-highlight" />
                What you'll learn
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {course.tags.map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-highlight shrink-0" />
                    <span className="text-sm text-muted-foreground">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Available batches (recurring) ── */}
        {!slotParam && course.is_recurring && schedules.length > 0 && (
          <div className="px-6 py-4 lg:px-10 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Available Batches</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {schedules.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/course/${slug}?slot=${s.slug || s.id}`)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-all hover:border-highlight/30 hover:bg-card/80"
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

        {/* ── Tabs: Overview + Curriculum ── */}
        <div className="px-6 py-6 pb-8 lg:px-10">
          <Tabs defaultValue="curriculum" className="space-y-4">
            <TabsList className="bg-muted border border-border w-full justify-start">
              <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
            </TabsList>

            {/* Curriculum — Locked view for non-enrolled */}
            <TabsContent value="curriculum" className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">
                  {modules.length} modules · {totalLessons} lessons
                  {course.estimated_duration ? ` · ${course.estimated_duration}` : ""}
                </p>
                {freeLessons.length > 0 && (
                  <Badge variant="outline" className="text-[10px] border-highlight/30 text-highlight">
                    {freeLessons.length} free preview{freeLessons.length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>

              <Accordion type="multiple" defaultValue={modules.length > 0 ? [modules[0].id] : []} className="space-y-2">
                {modules.map((mod, mi) => {
                  const modLessons = sortedLessons.filter((l) => l.module_id === mod.id);
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
                              onClick={() => {
                                if (lesson.is_free) navigate(`/learn/lesson/${lesson.id}`);
                              }}
                              disabled={!lesson.is_free}
                              className={`group/lesson flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                                lesson.is_free ? "hover:bg-secondary/30 cursor-pointer" : "opacity-60 cursor-default"
                              }`}
                            >
                              {lesson.is_free ? (
                                <Play className="h-4 w-4 text-highlight shrink-0" />
                              ) : (
                                <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{lesson.title}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {lesson.is_free && (
                                  <Badge className="bg-highlight/15 text-highlight border-highlight/25 text-[9px] font-bold">
                                    FREE
                                  </Badge>
                                )}
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

              {/* Upsell after curriculum */}
              {!course.is_free && modules.length > 0 && (
                <div className="rounded-xl border border-highlight/20 bg-highlight/5 p-6 text-center mt-4">
                  <Lock className="h-6 w-6 text-highlight mx-auto mb-2" />
                  <p className="text-sm font-bold text-foreground mb-1">Unlock all {totalLessons} lessons</p>
                  <p className="text-xs text-muted-foreground mb-4">Get lifetime access to the full course</p>
                  {renderCTA("inline-flex")}
                </div>
              )}
            </TabsContent>

            {/* Overview */}
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
                  { icon: Video, label: `${totalLessons} Lessons` },
                  { icon: Users, label: `${course.student_count}+ Students` },
                ].map((badge) => (
                  <div key={badge.label} className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center">
                    <badge.icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{badge.label}</span>
                  </div>
                ))}
              </div>

              {/* Instructor detail */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-base font-bold text-foreground mb-4">Your Instructor</h3>
                <div className="flex items-start gap-4">
                  {course.instructor_image_url ? (
                    <img src={course.instructor_image_url} alt={course.instructor_name} className="h-20 w-20 rounded-xl object-cover border border-border" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-accent border border-border text-2xl font-bold text-foreground">
                      {course.instructor_name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-bold text-foreground">{course.instructor_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {course.category} · {course.difficulty} level
                    </p>
                  </div>
                </div>
              </div>
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
