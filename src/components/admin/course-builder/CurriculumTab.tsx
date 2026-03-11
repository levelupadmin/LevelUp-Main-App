import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import SectionBlock from "./SectionBlock";
import type { ContentType } from "./ContentTypeSelector";
import {
  useModules, useLessons,
  useCreateModule, useDeleteModule,
  useCreateLesson, useDeleteLesson,
  type Module, type Lesson,
} from "@/hooks/useCourseAdmin";
import { useToast } from "@/hooks/use-toast";

interface Props {
  courseId: string;
}

const CurriculumTab = ({ courseId }: Props) => {
  const { toast } = useToast();
  const { data: modules = [] } = useModules(courseId);
  const { data: lessons = [] } = useLessons(courseId);

  const createModule = useCreateModule();
  const deleteModule = useDeleteModule();
  const createLesson = useCreateLesson();
  const deleteLesson = useDeleteLesson();

  const [showAddChapter, setShowAddChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState("");

  // Group lessons by module
  const lessonsByModule: Record<string, Lesson[]> = {};
  lessons.forEach((l) => {
    if (!lessonsByModule[l.module_id]) lessonsByModule[l.module_id] = [];
    lessonsByModule[l.module_id].push(l);
  });

  const handleAddChapter = () => {
    if (!newChapterTitle.trim()) {
      toast({ title: "Enter a chapter name", variant: "destructive" });
      return;
    }
    createModule.mutate(
      { course_id: courseId, title: newChapterTitle.trim(), sort_order: modules.length },
      {
        onSuccess: () => {
          setNewChapterTitle("");
          setShowAddChapter(false);
        },
      }
    );
  };

  const handleAddContent = (moduleId: string, type: ContentType) => {
    const moduleLessons = lessonsByModule[moduleId] || [];
    createLesson.mutate({
      course_id: courseId,
      module_id: moduleId,
      title: `New ${type} lesson`,
      type: type as any,
      sort_order: moduleLessons.length,
    });
  };

  const handleDeleteLesson = (id: string) => {
    deleteLesson.mutate(id);
  };

  const handleDeleteModule = (id: string) => {
    deleteModule.mutate(id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Curriculum</h2>
          <p className="text-sm text-muted-foreground">
            {modules.length} chapters · {lessons.length} lessons
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setShowAddChapter(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Section
        </Button>
      </div>

      {/* Curriculum Tree */}
      {modules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">No chapters yet. Add your first section to get started.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4 gap-1.5"
            onClick={() => setShowAddChapter(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Chapter
          </Button>
        </div>
      ) : (
        <SectionBlock
          sectionIndex={0}
          modules={modules}
          lessonsByModule={lessonsByModule}
          onAddChapter={() => setShowAddChapter(true)}
          onAddContent={handleAddContent}
          onDeleteLesson={handleDeleteLesson}
          onDeleteModule={handleDeleteModule}
        />
      )}

      {/* Add Chapter Dialog */}
      <Dialog open={showAddChapter} onOpenChange={setShowAddChapter}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Chapter</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Chapter title"
            value={newChapterTitle}
            onChange={(e) => setNewChapterTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddChapter()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddChapter(false)}>Cancel</Button>
            <Button onClick={handleAddChapter} disabled={createModule.isPending}>
              Add Chapter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CurriculumTab;
