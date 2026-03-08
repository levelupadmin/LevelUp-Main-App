import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, Play, BookOpen, StickyNote, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Module, Lesson, LessonProgress } from "@/hooks/useCourseData";

interface Props {
  modules: Module[];
  lessons: Lesson[];
  progress: LessonProgress[];
  currentLessonId: string;
  courseId: string;
  notes: string;
  onSaveNotes: (notes: string) => void;
  savingNotes: boolean;
  open: boolean;
  onClose: () => void;
}

const LessonSidebar = ({
  modules,
  lessons,
  progress,
  currentLessonId,
  courseId,
  notes: initialNotes,
  onSaveNotes,
  savingNotes,
  open,
  onClose,
}: Props) => {
  const navigate = useNavigate();
  const [localNotes, setLocalNotes] = useState(initialNotes);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocalNotes(initialNotes);
    setDirty(false);
  }, [initialNotes, currentLessonId]);

  const getStatus = (lessonId: string) => {
    const p = progress.find((pr) => pr.lesson_id === lessonId);
    return p?.status ?? "not_started";
  };

  const handleSave = () => {
    onSaveNotes(localNotes);
    setDirty(false);
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-border bg-card transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-bold text-foreground">Course Content</span>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        <Tabs defaultValue="lessons" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-3 mt-2 bg-muted border border-border w-auto justify-start">
            <TabsTrigger value="lessons" className="gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              Lessons
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-1.5 text-xs">
              <StickyNote className="h-3.5 w-3.5" />
              Notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lessons" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <div className="py-2">
                {modules.map((mod, mi) => {
                  const modLessons = lessons.filter((l) => l.module_id === mod.id);
                  const completed = modLessons.filter((l) => getStatus(l.id) === "completed").length;
                  return (
                    <div key={mod.id} className="mb-1">
                      <div className="flex items-center gap-2 px-4 py-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-secondary text-[10px] font-bold text-secondary-foreground">
                          {mi + 1}
                        </span>
                        <span className="flex-1 text-xs font-semibold text-foreground truncate">{mod.title}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {completed}/{modLessons.length}
                        </span>
                      </div>
                      {modLessons.map((lesson) => {
                        const status = getStatus(lesson.id);
                        const isCurrent = lesson.id === currentLessonId;
                        return (
                          <button
                            key={lesson.id}
                            onClick={() => navigate(`/learn/lesson/${lesson.id}`)}
                            className={cn(
                              "flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-secondary/40",
                              isCurrent && "bg-highlight/10 border-l-2 border-highlight"
                            )}
                          >
                            {status === "completed" ? (
                              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                            ) : isCurrent ? (
                              <Play className="h-4 w-4 text-highlight shrink-0" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-xs truncate", isCurrent ? "text-foreground font-semibold" : "text-muted-foreground")}>
                                {lesson.title}
                              </p>
                            </div>
                            {lesson.duration && (
                              <span className="text-[10px] text-muted-foreground font-mono shrink-0">{lesson.duration}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="notes" className="flex-1 flex flex-col overflow-hidden mt-0 p-3 gap-3">
            <Textarea
              value={localNotes}
              onChange={(e) => {
                setLocalNotes(e.target.value);
                setDirty(true);
              }}
              placeholder="Write your notes for this lesson..."
              className="flex-1 resize-none bg-background text-sm"
            />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty || savingNotes}
              className="w-full"
            >
              {savingNotes ? "Saving…" : "Save Notes"}
            </Button>
          </TabsContent>
        </Tabs>
      </aside>
    </>
  );
};

export default LessonSidebar;
