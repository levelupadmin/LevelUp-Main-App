import {
  Video, FileQuestion, Headphones, Image, FileText,
  Link2, BookOpen, GripVertical, MoreHorizontal, Trash2, Pencil, Eye,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Lesson } from "@/hooks/useCourseAdmin";

const typeIcons: Record<string, typeof Video> = {
  video: Video,
  quiz: FileQuestion,
  audio: Headphones,
  image: Image,
  pdf: FileText,
  link: Link2,
  text: BookOpen,
  assignment: FileText,
};

const typeLabels: Record<string, string> = {
  video: "Video",
  quiz: "Quiz",
  audio: "Audio",
  image: "Image",
  pdf: "PDF",
  link: "Link",
  text: "Article",
  assignment: "Assignment",
};

interface Props {
  lesson: Lesson;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const ContentItemRow = ({ lesson, onEdit, onDelete }: Props) => {
  const Icon = typeIcons[lesson.type] || FileText;
  const label = typeLabels[lesson.type] || lesson.type;

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border/50 bg-background/50 px-3 py-2.5 hover:border-border transition-colors">
      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab shrink-0" />

      <div className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
        "bg-secondary text-muted-foreground"
      )}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{lesson.title}</p>
        {lesson.duration && (
          <p className="text-xs text-muted-foreground">{lesson.duration}</p>
        )}
      </div>

      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 bg-secondary/50">
        {label}
      </Badge>

      {lesson.is_free && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-[hsl(var(--success))]/30 text-[hsl(var(--success))]">
          Free
        </Badge>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1 hover:bg-secondary">
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => onEdit?.(lesson.id)}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete?.(lesson.id)} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default ContentItemRow;
