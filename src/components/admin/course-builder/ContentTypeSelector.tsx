import {
  Video, FileQuestion, Headphones, Image, FileText,
  Link2, BookOpen, Cloud,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export type ContentType = "video" | "quiz" | "audio" | "image" | "pdf" | "link" | "text" | "assignment";

const contentTypes: { type: ContentType; label: string; icon: typeof Video; description: string }[] = [
  { type: "video", label: "Video Lesson", icon: Video, description: "Upload or embed a video" },
  { type: "quiz", label: "MCQ / Quiz", icon: FileQuestion, description: "Multiple choice questions" },
  { type: "audio", label: "Audio", icon: Headphones, description: "Audio file or podcast" },
  { type: "image", label: "Image", icon: Image, description: "Image or infographic" },
  { type: "pdf", label: "PDF", icon: FileText, description: "PDF document" },
  { type: "link", label: "External Link", icon: Link2, description: "Embedded or external link" },
  { type: "text", label: "Article / Text", icon: BookOpen, description: "Rich text content" },
  { type: "assignment", label: "Assignment", icon: FileText, description: "Submission-based task" },
];

interface Props {
  onSelect: (type: ContentType) => void;
}

const ContentTypeSelector = ({ onSelect }: Props) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
        <Plus className="h-3.5 w-3.5" />
        Add Content
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      {contentTypes.map((ct) => {
        const Icon = ct.icon;
        return (
          <DropdownMenuItem
            key={ct.type}
            onClick={() => onSelect(ct.type)}
            className="flex items-start gap-3 py-2"
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">{ct.label}</div>
              <div className="text-xs text-muted-foreground">{ct.description}</div>
            </div>
          </DropdownMenuItem>
        );
      })}
      <DropdownMenuSeparator />
      <DropdownMenuItem className="flex items-start gap-3 py-2 text-[hsl(var(--info))]">
        <Cloud className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-medium">Upload to Cloud</div>
          <div className="text-xs opacity-70">Hosted media storage</div>
        </div>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ContentTypeSelector;
