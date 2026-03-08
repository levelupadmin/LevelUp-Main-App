import { Tables } from "@/integrations/supabase/types";
import {
  Star, Clock, Users, Play, Lock, Video, FileText, BookOpen,
  FileQuestion, ClipboardList, Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

type Course = Tables<"courses">;
type Module = Tables<"course_modules">;
type Lesson = Tables<"lessons"> & { file_url?: string | null };

const lessonIcon = (type: string) => {
  switch (type) {
    case "video": return Video;
    case "pdf": return FileText;
    case "text": return BookOpen;
    case "quiz": return FileQuestion;
    default: return ClipboardList;
  }
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course;
  modules: Module[];
  lessons: Lesson[];
}

const StudentCoursePreview = ({ open, onOpenChange, course, modules, lessons }: Props) => {
  const totalLessons = lessons.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 bg-destructive/10 border-b border-destructive/20 px-5 py-2 flex items-center gap-2">
          <Eye className="h-4 w-4 text-destructive" />
          <span className="text-xs font-semibold text-destructive uppercase tracking-wider">Student Preview Mode</span>
        </div>

        {/* Hero */}
        <div className="relative aspect-video bg-secondary overflow-hidden">
          {course.thumbnail_url ? (
            <img src={course.thumbnail_url} alt={course.title} className="h-full w-full object-cover opacity-60" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-secondary">
              <Play className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-md border border-foreground/20">
              <Play className="h-7 w-7 text-white ml-1" />
            </div>
          </div>
        </div>

        {/* Course Info */}
        <div className="px-5 pt-4 pb-3 space-y-4">
          <DialogHeader className="text-left space-y-1">
            <div className="flex flex-wrap gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px]">{course.category}</Badge>
              <Badge variant="secondary" className="text-[10px] capitalize">{course.difficulty}</Badge>
            </div>
            <DialogTitle className="text-2xl font-bold leading-tight">{course.title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{course.short_description}</DialogDescription>
          </DialogHeader>

          {/* Instructor */}
          <p className="text-sm text-muted-foreground">
            by <span className="font-semibold text-foreground">{course.instructor_name}</span>
          </p>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {course.rating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 text-[hsl(var(--highlight))] fill-[hsl(var(--highlight))]" />
                <span className="font-semibold text-foreground">{Number(course.rating).toFixed(1)}</span>
              </span>
            )}
            <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {course.student_count.toLocaleString()} students</span>
            <span className="flex items-center gap-1"><Play className="h-4 w-4" /> {totalLessons} lessons</span>
            {course.estimated_duration && (
              <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {course.estimated_duration}</span>
            )}
          </div>

          {/* CTA */}
          <div className="flex flex-wrap gap-3">
            {course.is_free ? (
              <Button className="gap-2" disabled>
                <Play className="h-4 w-4" /> Start Course (Free)
              </Button>
            ) : (
              <Button
                className="gap-2 bg-[hsl(var(--highlight))] text-background hover:bg-[hsl(var(--highlight))]/90"
                disabled
              >
                Buy ₹{course.price.toLocaleString()}
              </Button>
            )}
          </div>
        </div>

        {/* Description */}
        {course.description && (
          <div className="px-5 pb-3">
            <h3 className="text-sm font-bold text-foreground mb-1">About this course</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{course.description}</p>
          </div>
        )}

        {/* Tags */}
        {course.tags && course.tags.length > 0 && (
          <div className="px-5 pb-3">
            <h3 className="text-sm font-bold text-foreground mb-2">Topics covered</h3>
            <div className="flex flex-wrap gap-2">
              {course.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Curriculum */}
        <div className="px-5 pb-6">
          <h3 className="text-sm font-bold text-foreground mb-3">Curriculum</h3>
          {modules.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No modules added yet</p>
          ) : (
            <Accordion type="multiple" defaultValue={[modules[0]?.id]} className="space-y-2">
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
                        {modLessons.map((lesson) => {
                          const Icon = lessonIcon(lesson.type);
                          return (
                            <div
                              key={lesson.id}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left"
                            >
                              {lesson.is_free ? (
                                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                              ) : (
                                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{lesson.title}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[9px] capitalize">{lesson.type}</Badge>
                                {lesson.is_free && <Badge variant="secondary" className="text-[9px]">FREE</Badge>}
                                {lesson.duration && (
                                  <span className="text-xs text-muted-foreground font-mono">{lesson.duration}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {modLessons.length === 0 && (
                          <div className="px-4 py-3 text-xs text-muted-foreground italic">No lessons yet</div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StudentCoursePreview;
