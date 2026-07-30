import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  BookOpen,
  Video,
  FileText,
  Image as ImageIcon,
  Music,
  ClipboardList,
  HelpCircle,
  Pencil,
} from "lucide-react";

interface Props {
  offeringId: string;
}

interface ChapterRow {
  id: string;
  title: string;
  sort_order: number;
  content_type: string;
  make_free: boolean;
  section_id: string;
}

interface SectionRow {
  id: string;
  title: string;
  sort_order: number;
  course_id: string;
  chapters: ChapterRow[];
}

interface CourseRow {
  id: string;
  title: string;
  status: string;
  product_tier: string;
  sections: SectionRow[];
}

const TYPE_ICON: Record<string, typeof Video> = {
  video: Video,
  pdf: FileText,
  image: ImageIcon,
  audio: Music,
  assignment: ClipboardList,
  quiz: HelpCircle,
};

/** "Curriculum" tab for the offering editor: the course → section → chapter
 *  tree this offering actually unlocks. Read-only; editing stays in the
 *  curriculum editor so there is a single write path. */
export default function CurriculumTab({ offeringId }: Props) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!offeringId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data: links } = await supabase
        .from("offering_courses")
        .select("course_id")
        .eq("offering_id", offeringId);
      const courseIds = (links || []).map((l) => l.course_id);
      if (!courseIds.length) {
        if (!cancelled) {
          setCourses([]);
          setLoading(false);
        }
        return;
      }

      const [{ data: courseRows }, { data: sectionRows }] = await Promise.all([
        supabase
          .from("courses")
          .select("id, title, status, product_tier")
          .in("id", courseIds),
        supabase
          .from("sections")
          .select("id, title, sort_order, course_id")
          .in("course_id", courseIds)
          .order("sort_order"),
      ]);

      const sections = (sectionRows || []) as Omit<SectionRow, "chapters">[];
      const sectionIds = sections.map((s) => s.id);
      const { data: chapterRows } = sectionIds.length
        ? await supabase
            .from("chapters")
            .select("id, title, sort_order, content_type, make_free, section_id")
            .in("section_id", sectionIds)
            .order("sort_order")
        : { data: [] as ChapterRow[] };

      const chapters = (chapterRows || []) as ChapterRow[];
      const tree: CourseRow[] = ((courseRows || []) as Omit<
        CourseRow,
        "sections"
      >[]).map((c) => ({
        ...c,
        sections: sections
          .filter((s) => s.course_id === c.id)
          .map((s) => ({
            ...s,
            chapters: chapters.filter((ch) => ch.section_id === s.id),
          })),
      }));

      if (!cancelled) {
        setCourses(tree);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offeringId]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading curriculum…
      </div>
    );
  }

  if (!courses.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <p className="text-sm text-muted-foreground">
          No course is linked to this offering yet, so buyers would get access to
          nothing. Link one under <strong>Basic Info → Courses</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {courses.map((c) => {
        const chapterCount = c.sections.reduce(
          (n, s) => n + s.chapters.length,
          0
        );
        return (
          <div
            key={c.id}
            className="bg-card border border-border rounded-xl p-6 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{c.title}</span>
                <span className="text-xs text-muted-foreground">
                  {c.status} · {c.product_tier} · {c.sections.length} section
                  {c.sections.length === 1 ? "" : "s"} · {chapterCount} chapter
                  {chapterCount === 1 ? "" : "s"}
                </span>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate(`/admin/courses/${c.id}/curriculum`)}
              >
                <Pencil className="h-4 w-4" />
                Edit curriculum
              </Button>
            </div>

            {!c.sections.length ? (
              <p className="text-sm text-muted-foreground">
                This course has no sections yet.
              </p>
            ) : (
              <div className="space-y-3">
                {c.sections.map((s) => (
                  <div
                    key={s.id}
                    className="border border-border/60 rounded-lg p-4"
                  >
                    <div className="text-sm font-medium mb-2">
                      {s.title}
                      <span className="text-xs text-muted-foreground font-normal">
                        {" "}
                        · {s.chapters.length} chapter
                        {s.chapters.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {!s.chapters.length ? (
                      <p className="text-xs text-muted-foreground">
                        No chapters in this section.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {s.chapters.map((ch) => {
                          const Icon = TYPE_ICON[ch.content_type] || FileText;
                          return (
                            <li
                              key={ch.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>{ch.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {ch.content_type}
                              </span>
                              {ch.make_free && (
                                <span className="text-xs text-emerald-500">
                                  free preview
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
