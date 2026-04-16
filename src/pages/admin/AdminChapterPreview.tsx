import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DOMPurify from "dompurify";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  HelpCircle,
  Info,
  MessageSquare,
  ArrowLeft,
  Eye,
  Play,
} from "lucide-react";
import VdoCipherPlayer from "@/components/VdoCipherPlayer";

interface Chapter {
  id: string;
  title: string;
  description: string | null;
  content_type: string;
  media_url: string | null;
  embed_url: string | null;
  article_body: string | null;
  make_free: boolean;
  section_id: string;
  sort_order: number;
  duration_seconds: number | null;
}

interface Resource {
  id: string;
  filename: string;
  file_url: string;
  file_size_bytes: number | null;
}

export default function AdminChapterPreview() {
  const { courseId, chapterId } = useParams<{ courseId: string; chapterId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [siblings, setSiblings] = useState<{ id: string; title: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChapter = useCallback(async () => {
    if (!chapterId || !user) return;
    setLoading(true);

    const { data: ch, error } = await supabase
      .from("chapters")
      .select("*")
      .eq("id", chapterId)
      .maybeSingle();

    if (error || !ch) {
      setLoading(false);
      return;
    }

    setChapter(ch as Chapter);

    // Load siblings for prev/next nav
    if (courseId) {
      const { data: allSections } = await supabase
        .from("sections")
        .select("id, sort_order")
        .eq("course_id", courseId)
        .order("sort_order");

      if (allSections && allSections.length > 0) {
        const sectionIds = allSections.map((s) => s.id);
        const { data: allChapters } = await supabase
          .from("chapters")
          .select("id, title, section_id, sort_order")
          .in("section_id", sectionIds)
          .order("sort_order");

        if (allChapters) {
          const sectionOrder = new Map(allSections.map((s, i) => [s.id, i]));
          const sorted = allChapters.sort((a, b) => {
            const sa = sectionOrder.get(a.section_id) ?? 0;
            const sb = sectionOrder.get(b.section_id) ?? 0;
            return sa !== sb ? sa - sb : a.sort_order - b.sort_order;
          });
          setSiblings(sorted.map((c) => ({ id: c.id, title: c.title })));
          setCurrentIndex(sorted.findIndex((c) => c.id === chapterId));
        }
      }
    }

    // Load resources
    const { data: res } = await supabase
      .from("chapter_resources")
      .select("id, filename, file_url, file_size_bytes")
      .eq("chapter_id", chapterId)
      .order("sort_order");

    setResources((res || []) as Resource[]);
    setLoading(false);
  }, [chapterId, courseId, user]);

  useEffect(() => {
    loadChapter();
  }, [loadChapter]);

  const goToChapter = (id: string) => {
    navigate(`/admin/courses/${courseId}/preview/${id}`);
  };

  return (
    <>
      {/* Preview banner */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => navigate(`/admin/courses/${courseId}/preview`)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to course preview
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]">
          <Eye className="h-4 w-4" />
          <span className="text-xs font-medium">Student Preview Mode</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
        </div>
      ) : !chapter ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Play className="h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">Chapter not found</h1>
          <Link to="/admin/courses" className="text-sm text-cream hover:underline mt-2 inline-block">
            ← Back to Courses
          </Link>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1 space-y-6">
            {/* Content renderer — mirrors ChapterViewer exactly */}
            {chapter.content_type === "video" && (chapter as any).video_type === "vdocipher" && (chapter as any).vdocipher_video_id ? (
              <VdoCipherPlayer chapterId={chapter.id} />
            ) : chapter.content_type === "video" && (chapter.media_url || chapter.embed_url) ? (
              <div className="aspect-video bg-card rounded-[16px] border border-border overflow-hidden">
                <iframe
                  src={(() => {
                    const url = chapter.embed_url || chapter.media_url || "";
                    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
                    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=0&title=0&byline=0&portrait=0`;
                    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
                    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
                    return url;
                  })()}
                  className="w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  frameBorder="0"
                  title={chapter.title}
                />
              </div>
            ) : chapter.content_type === "pdf" && chapter.media_url ? (
              <div className="w-full rounded-[16px] border border-border overflow-hidden bg-card" style={{ height: "70vh" }}>
                <iframe src={chapter.media_url} className="w-full h-full" title={`${chapter.title} — PDF`} />
              </div>
            ) : chapter.content_type === "image" && chapter.media_url ? (
              <div className="w-full rounded-[16px] border border-border overflow-hidden bg-card flex items-center justify-center p-4">
                <img src={chapter.media_url} alt={chapter.title} className="max-w-full max-h-[70vh] object-contain rounded-lg" />
              </div>
            ) : chapter.content_type === "embedded" && chapter.embed_url ? (
              <div className="aspect-video bg-card rounded-[16px] border border-border overflow-hidden">
                <iframe src={chapter.embed_url} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen frameBorder="0" title={chapter.title} />
              </div>
            ) : chapter.content_type === "article" || chapter.content_type === "text" ? (
              <div className="bg-card rounded-[16px] border border-border p-8">
                {chapter.article_body ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(chapter.article_body) }} />
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">📄</div>
                    <div>
                      <p className="font-medium">{chapter.title}</p>
                      <p className="text-muted-foreground text-sm mt-1">No article content yet</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-video bg-card rounded-[16px] border border-border flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-2">📚</div>
                  <p className="text-muted-foreground text-sm">{chapter.title}</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">Content not available</p>
                </div>
              </div>
            )}

            {/* Chapter info */}
            <div className="space-y-3">
              <h1 className="text-2xl font-bold">{chapter.title}</h1>
              {chapter.description && (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {chapter.description}
                </p>
              )}
            </div>

            {/* Prev / Next nav */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                disabled={currentIndex <= 0}
                onClick={() => goToChapter(siblings[currentIndex - 1]?.id)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1} / {siblings.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentIndex >= siblings.length - 1}
                onClick={() => goToChapter(siblings[currentIndex + 1]?.id)}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:w-[360px] border-t lg:border-t-0 lg:border-l border-border lg:pl-6">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="overview" className="text-xs gap-1">
                  <Info className="h-3 w-3" /> Overview
                </TabsTrigger>
                <TabsTrigger value="resources" className="text-xs gap-1">
                  <FileText className="h-3 w-3" /> Files
                </TabsTrigger>
                <TabsTrigger value="discussion" className="text-xs gap-1">
                  <MessageSquare className="h-3 w-3" /> Discussion
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                {chapter.description ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {chapter.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground/60">No description available.</p>
                )}
                {chapter.article_body && chapter.content_type !== "article" && chapter.content_type !== "text" && (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(chapter.article_body) }} />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="resources" className="mt-4 space-y-2">
                {resources.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60">No resources for this chapter.</p>
                ) : (
                  resources.map((r) => (
                    <a
                      key={r.id}
                      href={r.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/30 transition-colors text-sm"
                    >
                      <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{r.filename}</span>
                      {r.file_size_bytes && (
                        <span className="text-xs text-muted-foreground">
                          {(r.file_size_bytes / 1024).toFixed(0)}KB
                        </span>
                      )}
                    </a>
                  ))
                )}
              </TabsContent>

              <TabsContent value="discussion" className="mt-4">
                <p className="text-sm text-muted-foreground/60">
                  Q&A and comments are visible to students. Preview-only mode — no posting.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </>
  );
}
