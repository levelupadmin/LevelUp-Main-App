import { useEffect, useState } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StudentLayout from "@/components/layout/StudentLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { CheckCircle2, Lock, Play, Clock, BookOpen, Star } from "lucide-react";
import ReviewList from "@/components/reviews/ReviewList";

interface Course {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  hero_image_url: string | null;
  instructor_display_name: string | null;
  student_count: number | null;
  rating_avg: number | null;
  duration_minutes: number | null;
  total_lessons: number | null;
  level: string | null;
  category_id: string | null;
}

interface Section {
  id: string;
  title: string;
  sort_order: number;
  drip_days_after_enrolment: number | null;
  drip_specific_date: string | null;
}

interface Chapter {
  id: string;
  title: string;
  section_id: string;
  sort_order: number;
  content_type: string;
  duration_seconds: number | null;
  make_free: boolean;
}

interface ChapterProgress {
  chapter_id: string;
  completed_at: string | null;
  last_position_seconds: number;
}

const isNotFoundError = (code?: string | null) => code === "PGRST116";

const CourseDetail = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [progress, setProgress] = useState<ChapterProgress[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [dripMode, setDripMode] = useState("no_drip");
  const [loading, setLoading] = useState(true);
  const [categoryName, setCategoryName] = useState<string | null>(null);

  usePageTitle(course?.title ?? "Course");

  useEffect(() => {
    if (!courseId || authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadCourse();
  }, [courseId, user, authLoading, profile]);

  const loadCourse = async () => {
    if (!courseId || !user) return;

    setLoading(true);
    const [courseRes, sectionsRes, dripRes] = await Promise.all([
      supabase.from("courses").select("*").eq("id", courseId!).maybeSingle(),
      supabase.from("sections").select("*").eq("course_id", courseId!).order("sort_order"),
      supabase.from("course_drip_config").select("drip_mode").eq("course_id", courseId!).maybeSingle(),
    ]);

    if (courseRes.error) {
      if (import.meta.env.DEV) console.error("[CourseDetail] course fetch error:", courseRes.error);
      toast.error("Could not load this course right now");
      setLoading(false);
      return;
    }

    if (!courseRes.data) {
      toast.error("Course not found");
      setLoading(false);
      return;
    }

    setCourse(courseRes.data as Course);
    setSections((sectionsRes.data || []) as Section[]);
    setDripMode(dripRes.data?.drip_mode || "no_drip");

    // Load category name
    if (courseRes.data.category_id) {
      const { data: cat } = await supabase
        .from("course_categories")
        .select("name")
        .eq("id", courseRes.data.category_id)
        .maybeSingle();
      setCategoryName(cat?.name || null);
    }

    // Load chapters for all sections
    const sectionIds = (sectionsRes.data || []).map((s: any) => s.id);
    if (sectionIds.length > 0) {
      const { data: chapData } = await supabase
        .from("chapters")
        .select("id, title, section_id, sort_order, content_type, duration_seconds, make_free")
        .in("section_id", sectionIds)
        .order("sort_order");
      setChapters((chapData || []) as Chapter[]);
    }

    // Check access
    if (user) {
      const { data: accessData, error: accessErr } = await supabase.rpc("has_course_access", {
        p_course_id: courseId!,
      });
      const isAdmin = profile?.role === "admin";
      if (accessErr) {
        toast.error("Couldn't verify your access, retrying...");
        // Fallback: check enrolments table directly
        const { data: enrolmentCheck } = await supabase
          .from("enrolments")
          .select("id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1);
        setHasAccess(!!enrolmentCheck?.length || isAdmin);
      } else {
        setHasAccess(!!accessData || isAdmin);
      }

      // Load progress
      const { data: prog } = await supabase
        .from("chapter_progress")
        .select("chapter_id, completed_at, last_position_seconds")
        .eq("user_id", user.id)
        .eq("course_id", courseId!);
      setProgress((prog || []) as ChapterProgress[]);
    }

    setLoading(false);
  };

  const isChapterCompleted = (chapterId: string) =>
    progress.some((p) => p.chapter_id === chapterId && p.completed_at);

  const getChapterProgress = (chapterId: string) =>
    progress.find((p) => p.chapter_id === chapterId);

  const isChapterLocked = (chapter: Chapter, sectionChapters: Chapter[]) => {
    if (chapter.make_free) return false;
    if (profile?.role === "admin") return false;
    if (!hasAccess) return true;

    if (dripMode === "by_completion") {
      const idx = sectionChapters.findIndex((c) => c.id === chapter.id);
      if (idx > 0) {
        const prevChapter = sectionChapters[idx - 1];
        if (!isChapterCompleted(prevChapter.id)) return true;
      }
    }
    return false;
  };

  const getNextIncompleteChapter = () => {
    for (const section of sections) {
      const sectionChapters = chapters
        .filter((c) => c.section_id === section.id)
        .sort((a, b) => a.sort_order - b.sort_order);
      for (const ch of sectionChapters) {
        if (!isChapterCompleted(ch.id)) return ch;
      }
    }
    return chapters[0] || null;
  };

  const handleChapterClick = (chapter: Chapter, sectionChapters: Chapter[]) => {
    if (isChapterLocked(chapter, sectionChapters)) {
      toast("This chapter is locked", {
        description: "Enrol in this course to unlock all chapters.",
      });
      return;
    }
    navigate(`/chapters/${chapter.id}`);
  };

  const handleEnrollOrContinue = () => {
    if (hasAccess) {
      const next = getNextIncompleteChapter();
      if (next) navigate(`/chapters/${next.id}`);
    } else {
      navigate(`/browse`);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s > 0 ? `${s}s` : ""}`.trim() : `${s}s`;
  };

  if (loading) {
    return (
      <StudentLayout title="Loading...">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
        </div>
      </StudentLayout>
    );
  }

  if (!course) {
    return (
      <StudentLayout title="Not Found">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <BookOpen className="h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">Course not found</h1>
          <p className="text-sm text-muted-foreground">This course doesn't exist or is no longer available.</p>
          <Link to="/home" className="text-sm text-primary hover:underline">← Back to Home</Link>
        </div>
      </StudentLayout>
    );
  }

  const totalChapters = chapters.length;
  const completedCount = progress.filter((p) => p.completed_at).length;

  return (
    <StudentLayout title={course.title}>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4 flex-wrap">
          <Link to="/my-courses" className="hover:text-foreground transition-colors">My Courses</Link>
          <span>&rsaquo;</span>
          <span className="text-foreground truncate">{course.title}</span>
        </div>
        {/* Hero */}
        <div className="relative rounded-[20px] overflow-hidden bg-card border border-border">
          {course.hero_image_url && (
            <img
              src={course.hero_image_url}
              alt={course.title}
              className="w-full h-56 object-cover opacity-40"
            />
          )}
          <div className={`${course.hero_image_url ? "absolute inset-0" : ""} p-8 flex flex-col justify-end gap-3`}>
            <div className="flex items-center gap-2">
              {categoryName && (
                <Badge variant="secondary" className="font-mono text-xs uppercase tracking-wider">
                  {categoryName}
                </Badge>
              )}
              {course.level && (
                <Badge variant="outline" className="text-xs capitalize">
                  {course.level}
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-bold text-foreground">{course.title}</h1>
            {course.subtitle && (
              <p className="text-muted-foreground text-base max-w-2xl">{course.subtitle}</p>
            )}
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              {course.instructor_display_name && (
                <span>by {course.instructor_display_name}</span>
              )}
              {course.duration_minutes && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {Math.round(course.duration_minutes / 60)}h {course.duration_minutes % 60}m
                </span>
              )}
              <span className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                {totalChapters} lessons
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <Button size="lg" onClick={handleEnrollOrContinue}>
                {hasAccess ? "Continue Learning →" : "Enroll Now"}
              </Button>
              {hasAccess && totalChapters > 0 && (
                <span className="text-sm text-muted-foreground">
                  {completedCount}/{totalChapters} completed
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {course.description && (
          <div className="bg-card border border-border rounded-[16px] p-6">
            <h2 className="text-lg font-semibold mb-3">About this course</h2>
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
              {course.description}
            </p>
          </div>
        )}

        {/* Ratings & Reviews */}
        <div className="bg-card border border-border rounded-[16px] p-6 space-y-6">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
            <h2 className="text-lg font-semibold">Ratings & Reviews</h2>
          </div>
          <ReviewList courseId={courseId!} isEnrolled={hasAccess} />
        </div>

        {/* Sections + Chapters */}
        <div className="bg-card border border-border rounded-[16px] overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">
              Course Content
              <span className="text-sm text-muted-foreground font-normal ml-2">
                {sections.length} sections · {totalChapters} lessons
              </span>
            </h2>
          </div>
          <Accordion type="multiple" defaultValue={sections.map((s) => s.id)} className="px-2">
            {sections.map((section) => {
              const sectionChapters = chapters
                .filter((c) => c.section_id === section.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              const sectionCompleted = sectionChapters.filter((c) =>
                isChapterCompleted(c.id)
              ).length;

              return (
                <AccordionItem key={section.id} value={section.id} className="border-border">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <span className="font-medium">{section.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {sectionCompleted}/{sectionChapters.length}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-2 pb-2">
                    <div className="space-y-0.5">
                      {sectionChapters.map((chapter, idx) => {
                        const locked = isChapterLocked(chapter, sectionChapters);
                        const completed = isChapterCompleted(chapter.id);

                        const chapterProg = getChapterProgress(chapter.id);
                        const posSeconds = chapterProg?.last_position_seconds || 0;
                        const showProgressBar = posSeconds > 0 && !completed;

                        return (
                          <div key={chapter.id}>
                            <button
                              onClick={() => handleChapterClick(chapter, sectionChapters)}
                              className="w-full flex items-center gap-3 h-10 px-4 rounded-lg text-left text-sm transition-colors hover:bg-accent/50 group"
                            >
                              <span className="w-5 h-5 flex items-center justify-center shrink-0">
                                {completed ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                ) : locked ? (
                                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <Play className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                                )}
                              </span>
                              <span
                                className={`flex-1 truncate ${
                                  locked ? "text-muted-foreground" : "text-foreground"
                                }`}
                              >
                                {idx + 1}. {chapter.title}
                              </span>
                              {chapter.make_free && !hasAccess && (
                                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                                  Free
                                </Badge>
                              )}
                              {chapter.duration_seconds && (
                                <span className="text-xs text-muted-foreground font-mono shrink-0">
                                  {formatDuration(chapter.duration_seconds)}
                                </span>
                              )}
                            </button>
                            {showProgressBar && (
                              <div className="h-0.5 bg-surface-2 rounded-full overflow-hidden mx-4 mt-0.5">
                                <div
                                  className="h-full bg-[hsl(var(--cream))] rounded-full transition-all"
                                  style={{ width: `${Math.min((posSeconds / (chapter.duration_seconds || 600)) * 100, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </div>
    </StudentLayout>
  );
};

export default CourseDetail;
