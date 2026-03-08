import { Tables } from "@/integrations/supabase/types";
import { FileText, Play, BookOpen, FileQuestion, ClipboardList } from "lucide-react";

type Lesson = Tables<"lessons">;

interface Props {
  lesson: Lesson;
  courseThumbnail?: string | null;
}

const LessonContentViewer = ({ lesson, courseThumbnail }: Props) => {
  switch (lesson.type) {
    case "video":
      return <VideoViewer lesson={lesson} courseThumbnail={courseThumbnail} />;
    case "pdf":
      return <PdfViewer lesson={lesson} />;
    case "text":
      return <TextViewer lesson={lesson} />;
    case "quiz":
    case "assignment":
      return <ActivityViewer lesson={lesson} />;
    default:
      return <PlaceholderViewer />;
  }
};

function VideoViewer({ lesson, courseThumbnail }: { lesson: Lesson; courseThumbnail?: string | null }) {
  const videoSrc = lesson.video_url || (lesson as any).file_url;

  // If it's a YouTube/Vimeo URL, embed it
  if (videoSrc && (videoSrc.includes("youtube.com") || videoSrc.includes("youtu.be"))) {
    const videoId = videoSrc.includes("youtu.be")
      ? videoSrc.split("/").pop()
      : new URL(videoSrc).searchParams.get("v");
    return (
      <div className="aspect-video bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (videoSrc && videoSrc.includes("vimeo.com")) {
    const vimeoId = videoSrc.split("/").pop();
    return (
      <div className="aspect-video bg-black">
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}`}
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // Direct video file URL
  if (videoSrc) {
    return (
      <div className="aspect-video bg-black">
        <video src={videoSrc} controls className="h-full w-full" poster={courseThumbnail || undefined}>
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  // Placeholder
  return (
    <div className="aspect-video bg-[hsl(0,0%,5%)] flex items-center justify-center">
      {courseThumbnail && (
        <img src={courseThumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
      )}
      <div className="relative z-10 flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/10 backdrop-blur-md border border-foreground/20">
          <Play className="h-7 w-7 text-foreground ml-1" />
        </div>
        <p className="text-xs text-muted-foreground">Video content will be available soon</p>
      </div>
    </div>
  );
}

function PdfViewer({ lesson }: { lesson: Lesson }) {
  const pdfUrl = (lesson as any).file_url;

  if (pdfUrl) {
    return (
      <div className="space-y-3">
        <div className="aspect-[3/4] max-h-[70vh] border border-border rounded-lg overflow-hidden bg-card">
          <iframe src={`${pdfUrl}#toolbar=1`} className="h-full w-full" title={lesson.title} />
        </div>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <FileText className="h-4 w-4" /> Open PDF in new tab
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
      <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">PDF content will be available soon</p>
    </div>
  );
}

function TextViewer({ lesson }: { lesson: Lesson }) {
  if (lesson.content) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reading Material</span>
        </div>
        <div className="prose prose-invert prose-sm max-w-none">
          <pre className="whitespace-pre-wrap font-body text-sm text-muted-foreground leading-relaxed">{lesson.content}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
      <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">Text content will be available soon</p>
    </div>
  );
}

function ActivityViewer({ lesson }: { lesson: Lesson }) {
  const Icon = lesson.type === "quiz" ? FileQuestion : ClipboardList;
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{lesson.type}</span>
      </div>
      {lesson.content ? (
        <pre className="whitespace-pre-wrap font-body text-sm text-muted-foreground leading-relaxed">{lesson.content}</pre>
      ) : (
        <p className="text-sm text-muted-foreground">Activity content coming soon</p>
      )}
    </div>
  );
}

function PlaceholderViewer() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
      <p className="text-sm text-muted-foreground">Content not available</p>
    </div>
  );
}

export default LessonContentViewer;
