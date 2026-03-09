import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Link as LinkIcon, Download, Video, Presentation } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  lessonId: string;
  courseId: string;
}

const iconMap: Record<string, typeof FileText> = {
  pdf: FileText,
  link: LinkIcon,
  recording: Video,
  slide: Presentation,
  template: FileText,
};

const LessonResourcesList = ({ lessonId, courseId }: Props) => {
  const { data: resources = [], isLoading } = useQuery({
    queryKey: ["lesson-resources", lessonId],
    enabled: !!lessonId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_resources")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-4 text-center">Loading resources…</p>;

  if (resources.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No resources for this lesson</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {resources.map((res) => {
        const Icon = iconMap[res.type] || FileText;
        return (
          <a
            key={res.id}
            href={res.file_url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-muted-foreground/30"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary shrink-0">
              <Icon className="h-4 w-4 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{res.title}</p>
              <Badge variant="secondary" className="text-[10px] capitalize mt-0.5">{res.type}</Badge>
            </div>
            {res.file_url && <Download className="h-4 w-4 text-muted-foreground shrink-0" />}
          </a>
        );
      })}
    </div>
  );
};

export default LessonResourcesList;
