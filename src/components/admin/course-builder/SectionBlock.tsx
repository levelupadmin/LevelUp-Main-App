import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChapterBlock from "./ChapterBlock";
import type { ContentType } from "./ContentTypeSelector";
import type { Module, Lesson } from "@/hooks/useCourseAdmin";

interface Props {
  sectionIndex: number;
  modules: Module[];
  lessonsByModule: Record<string, Lesson[]>;
  onAddChapter?: () => void;
  onAddContent?: (moduleId: string, type: ContentType) => void;
  onEditLesson?: (id: string) => void;
  onDeleteLesson?: (id: string) => void;
  onEditModule?: (id: string) => void;
  onDeleteModule?: (id: string) => void;
}

const SectionBlock = ({
  sectionIndex, modules, lessonsByModule,
  onAddChapter, onAddContent, onEditLesson, onDeleteLesson,
  onEditModule, onDeleteModule,
}: Props) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Section {sectionIndex + 1}
      </h3>
    </div>

    <div className="space-y-3">
      {modules.map((mod, i) => (
        <ChapterBlock
          key={mod.id}
          moduleId={mod.id}
          title={mod.title}
          description={mod.description}
          lessons={lessonsByModule[mod.id] || []}
          defaultOpen={i === 0}
          onAddContent={onAddContent}
          onEditLesson={onEditLesson}
          onDeleteLesson={onDeleteLesson}
          onEditModule={onEditModule}
          onDeleteModule={onDeleteModule}
        />
      ))}
    </div>

    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground hover:text-foreground"
      onClick={onAddChapter}
    >
      <Plus className="h-3.5 w-3.5" />
      Add Chapter
    </Button>
  </div>
);

export default SectionBlock;
