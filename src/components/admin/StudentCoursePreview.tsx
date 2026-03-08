import { useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import {
  Star, Clock, Users, Play, Video, FileText, BookOpen,
  FileQuestion, ClipboardList, Eye, ChevronLeft, ChevronRight,
  X, ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent,
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
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);

  // Sort lessons by module order then lesson order
  const sortedLessons = [...lessons].sort((a, b) => {
    const modA = modules.find((m) => m.id === a.module_id);
    const modB = modules.find((m) => m.id === b.module_id);
    const modOrder = (modA?.sort_order ?? 0) - (modB?.sort_order ?? 0);
    return modOrder !== 0 ? modOrder : a.sort_order - b.sort_order;
  });

  const currentIndex = activeLesson ? sortedLessons.findIndex((l) => l.id === activeLesson.id) : -1;
  const prevLesson = currentIndex > 0 ? sortedLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < sortedLessons.length - 1 ? sortedLessons[currentIndex + 1] : null;

  const handleClose = () => {
    setActiveLesson(null);
    onOpenChange(false);
  };

  // ─── LESSON VIEW ───
  if (activeLesson) {
    const currentModule = modules.find((m) => m.id === activeLesson.module_id);
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          {/* Preview banner */}
          <div className="sticky top-0 z-20 bg-destructive/10 border-b border-destructive/20 px-4 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-destructive" />
              <span className="text-[10px] font-semibold text-destructive uppercase tracking-wider">Student Preview</span>
            </div>
            <button
              onClick={() => setActiveLesson(null)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="h-3 w-3" /> Back to course
            </button>
          </div>

          {/* Content Viewer */}
          <div className="bg-black">
            <LessonContent lesson={activeLesson} courseThumbnail={course.thumbnail_url} />
          </div>

          {/* Lesson Info */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">{activeLesson.title}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {currentModule && <span>{currentModule.title} · </span>}
                  Lesson {currentIndex + 1} of {sortedLessons.length}
                  {activeLesson.duration && ` · ${activeLesson.duration}`}
                </p>
              </div>
              <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{activeLesson.type}</Badge>
            </div>
            {activeLesson.description && (
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{activeLesson.description}</p>
            )}
          </div>

          {/* Text content for non-video types */}
          {activeLesson.type === "text" && activeLesson.content && (
            <div className="px-5 py-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reading Material</span>
                </div>
                <pre className="whitespace-pre-wrap font-body text-sm text-muted-foreground leading-relaxed">{activeLesson.content}</pre>
              </div>
            </div>
          )}

          {(activeLesson.type === "quiz" || activeLesson.type === "assignment") && activeLesson.content && (
            <div className="px-5 py-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  {activeLesson.type === "quiz" ? <FileQuestion className="h-4 w-4 text-primary" /> : <ClipboardList className="h-4 w-4 text-primary" />}
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{activeLesson.type}</span>
                </div>
                <pre className="whitespace-pre-wrap font-body text-sm text-muted-foreground leading-relaxed">{activeLesson.content}</pre>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="sticky bottom-0 border-t border-border bg-background/90 backdrop-blur-md px-5 py-3">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                disabled={!prevLesson}
                onClick={() => prevLesson && setActiveLesson(prevLesson)}
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <span className="text-xs text-muted-foreground font-mono">
                {currentIndex + 1} / {sortedLessons.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={!nextLesson}
                onClick={() => nextLesson && setActiveLesson(nextLesson)}
                className="gap-1.5"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── COURSE OVERVIEW ───
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0 gap-0">
        {/* Preview banner */}
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
          {sortedLessons.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => setActiveLesson(sortedLessons[0])}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-md border border-foreground/20 transition-all hover:bg-foreground/20 hover:scale-105"
              >
                <Play className="h-7 w-7 text-white ml-1" />
              </button>
            </div>
          )}
        </div>

        {/* Course Info */}
        <div className="px-5 pt-4 pb-3 space-y-4">
          <div className="space-y-1">
            <div className="flex flex-wrap gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px]">{course.category}</Badge>
              <Badge variant="secondary" className="text-[10px] capitalize">{course.difficulty}</Badge>
            </div>
            <h2 className="text-2xl font-bold text-foreground leading-tight">{course.title}</h2>
            {course.short_description && (
              <p className="text-sm text-muted-foreground">{course.short_description}</p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            by <span className="font-semibold text-foreground">{course.instructor_name}</span>
          </p>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {course.rating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 text-[hsl(var(--highlight))] fill-[hsl(var(--highlight))]" />
                <span className="font-semibold text-foreground">{Number(course.rating).toFixed(1)}</span>
              </span>
            )}
            <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {course.student_count.toLocaleString()} students</span>
            <span className="flex items-center gap-1"><Play className="h-4 w-4" /> {lessons.length} lessons</span>
            {course.estimated_duration && (
              <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {course.estimated_duration}</span>
            )}
          </div>

          {sortedLessons.length > 0 && (
            <Button onClick={() => setActiveLesson(sortedLessons[0])} className="gap-2">
              <Play className="h-4 w-4" /> Start Course
            </Button>
          )}
        </div>

        {/* Description */}
        {course.description && (
          <div className="px-5 pb-3">
            <h3 className="text-sm font-bold text-foreground mb-1">About this course</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{course.description}</p>
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

        {/* Curriculum — clickable lessons */}
        <div className="px-5 pb-6">
          <h3 className="text-sm font-bold text-foreground mb-3">Curriculum</h3>
          {modules.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No modules added yet</p>
          ) : (
            <Accordion type="multiple" defaultValue={[modules[0]?.id]} className="space-y-2">
              {modules.map((mod, mi) => {
                const modLessons = lessons
                  .filter((l) => l.module_id === mod.id)
                  .sort((a, b) => a.sort_order - b.sort_order);
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
                            <button
                              key={lesson.id}
                              onClick={() => setActiveLesson(lesson)}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/30"
                            >
                              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
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
                            </button>
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

// ─── Lesson Content Renderer ───
function LessonContent({ lesson, courseThumbnail }: { lesson: Lesson; courseThumbnail?: string | null }) {
  const videoSrc = lesson.video_url || lesson.file_url;
  const pdfUrl = lesson.file_url;

  switch (lesson.type) {
    case "video": {
      // YouTube
      if (videoSrc && (videoSrc.includes("youtube.com") || videoSrc.includes("youtu.be"))) {
        const videoId = videoSrc.includes("youtu.be")
          ? videoSrc.split("/").pop()
          : new URL(videoSrc).searchParams.get("v");
        return (
          <div className="aspect-video">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }
      // Vimeo
      if (videoSrc && videoSrc.includes("vimeo.com")) {
        const vimeoId = videoSrc.split("/").pop();
        return (
          <div className="aspect-video">
            <iframe
              src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1`}
              className="h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }
      // Direct file
      if (videoSrc) {
        return (
          <div className="aspect-video">
            <video
              src={videoSrc}
              controls
              autoPlay
              className="h-full w-full"
              poster={courseThumbnail || undefined}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        );
      }
      // No video
      return (
        <div className="aspect-video relative flex items-center justify-center bg-secondary/50">
          {courseThumbnail && (
            <img src={courseThumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-10" />
          )}
          <div className="relative z-10 flex flex-col items-center gap-3">
            <Video className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No video uploaded yet</p>
          </div>
        </div>
      );
    }

    case "pdf": {
      if (pdfUrl) {
        return (
          <div className="bg-background p-4 space-y-3">
            <div className="aspect-[3/4] max-h-[60vh] rounded-lg overflow-hidden border border-border">
              <iframe src={`${pdfUrl}#toolbar=1&navpanes=1`} className="h-full w-full bg-white" title={lesson.title} />
            </div>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open PDF in new tab
            </a>
          </div>
        );
      }
      return (
        <div className="bg-background p-8 flex flex-col items-center justify-center min-h-[200px]">
          <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No PDF uploaded yet</p>
        </div>
      );
    }

    case "text": {
      return (
        <div className="bg-background p-4">
          <div className="rounded-lg border border-border bg-card p-5 min-h-[120px]">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reading Material</span>
            </div>
            {lesson.content ? (
              <pre className="whitespace-pre-wrap font-body text-sm text-muted-foreground leading-relaxed">{lesson.content}</pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">No content added yet</p>
            )}
          </div>
        </div>
      );
    }

    case "quiz":
    case "assignment": {
      const Icon = lesson.type === "quiz" ? FileQuestion : ClipboardList;
      return (
        <div className="bg-background p-4">
          <div className="rounded-lg border border-border bg-card p-5 min-h-[120px]">
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider capitalize">{lesson.type}</span>
            </div>
            {lesson.content ? (
              <pre className="whitespace-pre-wrap font-body text-sm text-muted-foreground leading-relaxed">{lesson.content}</pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">No {lesson.type} content added yet</p>
            )}
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="bg-background p-8 flex items-center justify-center min-h-[120px]">
          <p className="text-sm text-muted-foreground">Unsupported content type</p>
        </div>
      );
  }
}

export default StudentCoursePreview;
