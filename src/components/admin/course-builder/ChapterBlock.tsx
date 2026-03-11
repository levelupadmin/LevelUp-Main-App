import { useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ContentItemRow from "./ContentItemRow";
import ContentTypeSelector, { ContentType } from "./ContentTypeSelector";
import type { Lesson } from "@/hooks/useCourseAdmin";

interface Props {
  moduleId: string;
  title: string;
  description?: string | null;
  lessons: Lesson[];
  defaultOpen?: boolean;
  onAddContent?: (moduleId: string, type: ContentType) => void;
  onEditLesson?: (id: string) => void;
  onDeleteLesson?: (id: string) => void;
  onEditModule?: (id: string) => void;
  onDeleteModule?: (id: string) => void;
}

const ChapterBlock = ({
  moduleId, title, description, lessons, defaultOpen = false,
  onAddContent, onEditLesson, onDeleteLesson, onEditModule, onDeleteModule,
}: Props) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Chapter Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-secondary/30">
          <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />

          <CollapsibleTrigger className="flex items-center gap-2 flex-1 min-w-0 text-left">
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-foreground truncate">{title}</h4>
              {description && (
                <p className="text-xs text-muted-foreground truncate">{description}</p>
              )}
            </div>
          </CollapsibleTrigger>

          <span className="text-xs text-muted-foreground shrink-0">
            {lessons.length} {lessons.length === 1 ? "item" : "items"}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-md p-1.5 hover:bg-secondary transition-colors">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEditModule?.(moduleId)}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDeleteModule?.(moduleId)} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Chapter Content */}
        <CollapsibleContent>
          <div className="p-3 space-y-2">
            {lessons.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-6 text-center">
                <p className="text-sm text-muted-foreground">No content yet</p>
              </div>
            ) : (
              lessons.map((lesson) => (
                <ContentItemRow
                  key={lesson.id}
                  lesson={lesson}
                  onEdit={onEditLesson}
                  onDelete={onDeleteLesson}
                />
              ))
            )}

            {/* Add content */}
            <div className="pt-1">
              <ContentTypeSelector
                onSelect={(type) => onAddContent?.(moduleId, type)}
              />
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default ChapterBlock;
