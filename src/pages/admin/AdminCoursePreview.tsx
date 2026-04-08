import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowLeft, Eye, Play, Lock, Clock, BookOpen } from "lucide-react";

interface Course {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  hero_image_url: string | null;
  instructor_display_name: string | null;
  duration_minutes: number | null;
  level: string | null;
  category_id: string | null;
}

interface Section {
  id: string;
  title: string;
  sort_order: number;
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

const formatDuration = (seconds: number | null) => {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s > 0 ? `${s}s` : ""}`.trim() : `${s}s`;
};

export default function AdminCoursePreview() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;
    (async () => {
      const [courseRes, sectionsRes] = await Promise.all([
        supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
        supabase.from("sections").select("*").eq("course_id", courseId).order("sort_order"),
      ]);

      if (!courseRes.data) {
        setLoading(false);
        return;
      }

      setCourse(courseRes.data as Course);
      setSections((sectionsRes.data || []) as Section[]);

      if (courseRes.data.category_id) {
        const { data: cat } = await supabase
          .from("course_categories")
          .select("name")
          .eq("id", courseRes.data.category_id)
          .maybeSingle();
        setCategoryName(cat?.name || null);
      }

      const sectionIds = (sectionsRes.data || []).map((s: any) => s.id);
      if (sectionIds.length > 0) {
        const { data: chapData } = await supabase
          .from("chapters")
          .select("id, title, section_id, sort_order, content_type, duration_seconds, make_free")
          .in("section_id", sectionIds)
          .order("sort_order");
        setChapters((chapData || []) as Chapter[]);
      }

      setLoading(false);
    })();
  }, [courseId]);

  const totalChapters = chapters.length;

  return (
    <AdminLayout title="Student Preview">
      {/* Preview banner */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(`/admin/courses/${courseId}/edit`)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to editor
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]">
          <Eye className="h-4 w-4" />
          <span className="text-xs font-medium">Student Preview Mode</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
        </div>
      ) : !course ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <BookOpen className="h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">Course not found</h1>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Hero — same as student view */}
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
                <Button
                  size="lg"
                  onClick={() => {
                    const firstChapter = chapters.sort((a, b) => a.sort_order - b.sort_order)[0];
                    if (firstChapter) navigate(`/admin/courses/${courseId}/preview/${firstChapter.id}`);
                  }}
                  disabled={totalChapters === 0}
                >
                  Continue Learning →
                </Button>
                <span className="text-sm text-muted-foreground">
                  0/{totalChapters} completed
                </span>
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

          {/* Sections + Chapters — show all unlocked like a student with access */}
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

                return (
                  <AccordionItem key={section.id} value={section.id} className="border-border">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-3 text-left">
                        <span className="font-medium">{section.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {sectionChapters.length} lessons
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-2 pb-2">
                      <div className="space-y-0.5">
                        {sectionChapters.map((chapter, idx) => (
                          <button
                            key={chapter.id}
                            onClick={() => navigate(`/admin/courses/${courseId}/preview/${chapter.id}`)}
                            className="w-full flex items-center gap-3 h-10 px-4 rounded-lg text-left text-sm transition-colors hover:bg-accent/50 group cursor-pointer"
                          >
                            <span className="w-5 h-5 flex items-center justify-center shrink-0">
                              <Play className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                            </span>
                            <span className="flex-1 truncate text-foreground">
                              {idx + 1}. {chapter.title}
                            </span>
                            {chapter.make_free && (
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
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
