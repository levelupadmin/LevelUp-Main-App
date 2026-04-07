import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, ChevronUp, ChevronDown, Trash2, GripVertical } from "lucide-react";
import VdoCipherUploader from "@/components/admin/VdoCipherUploader";

interface Chapter {
  id: string;
  title: string;
  content_type: string;
  description: string;
  media_url: string;
  embed_url: string;
  article_body: string;
  duration_seconds: number;
  make_free: boolean;
  sort_order: number;
  video_type: string;
  vdocipher_video_id: string;
  vdocipher_watermark_text: string;
  _isNew?: boolean;
}

interface Section {
  id: string;
  title: string;
  sort_order: number;
  chapters: Chapter[];
  _isNew?: boolean;
}

const AdminCourseCurriculum = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sections, setSections] = useState<Section[]>([]);
  const [courseTitle, setCourseTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingChapter, setEditingChapter] = useState<{ sectionIdx: number; chapterIdx: number } | null>(null);
  const [courseDefaultVideoType, setCourseDefaultVideoType] = useState("standard");
  const [vdoUploadMode, setVdoUploadMode] = useState<Record<string, "upload" | "existing">>({});

  const load = useCallback(async () => {
    if (!courseId) return;
    const { data: course } = await supabase.from("courses").select("title, default_video_type").eq("id", courseId).single();
    setCourseTitle(course?.title || "");
    setCourseDefaultVideoType((course as any)?.default_video_type || "standard");

    const { data: secs } = await supabase
      .from("sections")
      .select("id, title, sort_order")
      .eq("course_id", courseId)
      .order("sort_order");

    if (!secs || secs.length === 0) {
      setSections([]);
      setLoading(false);
      return;
    }

    const secIds = secs.map((s) => s.id);
    const { data: chs } = await supabase
      .from("chapters")
      .select("id, title, content_type, description, media_url, embed_url, article_body, duration_seconds, make_free, sort_order, section_id, video_type, vdocipher_video_id, vdocipher_watermark_text")
      .in("section_id", secIds)
      .order("sort_order");

    const chapsBySection: Record<string, Chapter[]> = {};
    (chs || []).forEach((ch) => {
      if (!chapsBySection[ch.section_id]) chapsBySection[ch.section_id] = [];
      chapsBySection[ch.section_id].push({
        id: ch.id,
        title: ch.title,
        content_type: ch.content_type,
        description: ch.description || "",
        media_url: ch.media_url || "",
        embed_url: ch.embed_url || "",
        article_body: ch.article_body || "",
        duration_seconds: ch.duration_seconds || 0,
        make_free: ch.make_free,
        sort_order: ch.sort_order,
        video_type: (ch as any).video_type || "standard",
        vdocipher_video_id: (ch as any).vdocipher_video_id || "",
        vdocipher_watermark_text: (ch as any).vdocipher_watermark_text || "",
      });
    });

    setSections(secs.map((s) => ({ ...s, chapters: chapsBySection[s.id] || [] })));
    setLoading(false);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        title: "New Section",
        sort_order: prev.length,
        chapters: [],
        _isNew: true,
      },
    ]);
  };

  const addChapter = (sectionIdx: number) => {
    setSections((prev) => {
      const updated = [...prev];
      updated[sectionIdx] = {
        ...updated[sectionIdx],
        chapters: [
          ...updated[sectionIdx].chapters,
          {
            id: `new-${Date.now()}`,
            title: "New Chapter",
            content_type: "video",
            description: "",
            media_url: "",
            embed_url: "",
            article_body: "",
            duration_seconds: 0,
            make_free: false,
            sort_order: updated[sectionIdx].chapters.length,
            video_type: courseDefaultVideoType,
            vdocipher_video_id: "",
            vdocipher_watermark_text: "",
            _isNew: true,
          },
        ],
      };
      return updated;
    });
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    setSections((prev) => {
      const arr = [...prev];
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr.map((s, i) => ({ ...s, sort_order: i }));
    });
  };

  const removeSection = (idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSectionTitle = (idx: number, title: string) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, title } : s)));
  };

  const updateChapter = (sIdx: number, cIdx: number, updates: Partial<Chapter>) => {
    setSections((prev) => {
      const updated = [...prev];
      const chapters = [...updated[sIdx].chapters];
      chapters[cIdx] = { ...chapters[cIdx], ...updates };
      updated[sIdx] = { ...updated[sIdx], chapters };
      return updated;
    });
  };

  const removeChapter = (sIdx: number, cIdx: number) => {
    setSections((prev) => {
      const updated = [...prev];
      updated[sIdx] = {
        ...updated[sIdx],
        chapters: updated[sIdx].chapters.filter((_, i) => i !== cIdx),
      };
      return updated;
    });
  };

  const handleSave = async () => {
    if (!courseId) return;
    setSaving(true);

    try {
      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const sec = sections[sIdx];
        let sectionId = sec.id;

        if (sec._isNew) {
          const { data, error } = await supabase
            .from("sections")
            .insert({ course_id: courseId, title: sec.title, sort_order: sIdx })
            .select("id")
            .single();
          if (error) throw error;
          sectionId = data.id;
        } else {
          const { error } = await supabase
            .from("sections")
            .update({ title: sec.title, sort_order: sIdx })
            .eq("id", sectionId);
          if (error) throw error;
        }

        for (let cIdx = 0; cIdx < sec.chapters.length; cIdx++) {
          const ch = sec.chapters[cIdx];
          const payload: Record<string, unknown> = {
            section_id: sectionId,
            title: ch.title,
            content_type: ch.content_type,
            description: ch.description || null,
            media_url: ch.media_url || null,
            embed_url: ch.embed_url || null,
            article_body: ch.article_body || null,
            duration_seconds: ch.duration_seconds || 0,
            make_free: ch.make_free,
            sort_order: cIdx,
            video_type: ch.video_type || "standard",
            vdocipher_video_id: ch.vdocipher_video_id || null,
            vdocipher_watermark_text: ch.vdocipher_watermark_text || null,
          };

          if (ch._isNew) {
            const { error } = await supabase.from("chapters").insert(payload as any);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("chapters").update(payload as any).eq("id", ch.id);
            if (error) throw error;
          }
        }
      }

      toast({ title: "Curriculum saved" });
      load();
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const ec = editingChapter;

  return (
    <AdminLayout title={`Curriculum: ${courseTitle}`}>
      <button
        onClick={() => navigate(`/admin/courses/${courseId}/edit`)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to course
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-[hsl(var(--accent-amber))] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {sections.map((sec, sIdx) => (
            <div key={sec.id} className="bg-card border border-border rounded-xl">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  value={sec.title}
                  onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                  className="font-medium border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                />
                <div className="flex items-center gap-1 ml-auto shrink-0">
                  <button onClick={() => moveSection(sIdx, -1)} className="p-1 hover:bg-secondary rounded" disabled={sIdx === 0}>
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button onClick={() => moveSection(sIdx, 1)} className="p-1 hover:bg-secondary rounded" disabled={sIdx === sections.length - 1}>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeSection(sIdx)} className="p-1 hover:bg-destructive/20 text-destructive rounded">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Chapters */}
              <div className="p-3 space-y-2">
                {sec.chapters.map((ch, cIdx) => (
                  <div key={ch.id}>
                    <div
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer"
                      onClick={() => setEditingChapter(ec?.sectionIdx === sIdx && ec?.chapterIdx === cIdx ? null : { sectionIdx: sIdx, chapterIdx: cIdx })}
                    >
                      <span className="text-xs font-mono text-muted-foreground w-6">{cIdx + 1}</span>
                      <span className="text-sm flex-1">{ch.title}</span>
                      <span className="text-xs font-mono text-muted-foreground">{ch.content_type}</span>
                      <button onClick={(e) => { e.stopPropagation(); removeChapter(sIdx, cIdx); }} className="p-1 text-destructive hover:bg-destructive/20 rounded">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Inline editor */}
                    {ec?.sectionIdx === sIdx && ec?.chapterIdx === cIdx && (
                      <div className="mt-2 ml-9 space-y-3 p-4 border border-border rounded-lg bg-background">
                        <div>
                          <label className="block text-xs font-medium mb-1">Title</label>
                          <Input value={ch.title} onChange={(e) => updateChapter(sIdx, cIdx, { title: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Content Type</label>
                          <Select value={ch.content_type} onValueChange={(v) => updateChapter(sIdx, cIdx, { content_type: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="video">Video</SelectItem>
                              <SelectItem value="text">Text / Article</SelectItem>
                              <SelectItem value="pdf">PDF</SelectItem>
                              <SelectItem value="image">Image</SelectItem>
                              <SelectItem value="embedded">Embedded Link</SelectItem>
                              <SelectItem value="quiz">Quiz</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Description</label>
                          <Textarea value={ch.description} onChange={(e) => updateChapter(sIdx, cIdx, { description: e.target.value })} rows={2} />
                        </div>
                        {(ch.content_type === "video" || ch.content_type === "pdf" || ch.content_type === "image") && (
                          <div>
                            <label className="block text-xs font-medium mb-1">
                              {ch.content_type === "video" ? "Video URL (Vimeo, YouTube, or embed URL)" :
                               ch.content_type === "pdf" ? "PDF URL" : "Image URL"}
                            </label>
                            <Input
                              value={ch.media_url}
                              onChange={(e) => updateChapter(sIdx, cIdx, { media_url: e.target.value })}
                              placeholder={
                                ch.content_type === "video" ? "https://vimeo.com/123456789" :
                                ch.content_type === "pdf" ? "https://example.com/document.pdf" :
                                "https://example.com/image.jpg"
                              }
                            />
                          </div>
                        )}
                        {ch.content_type === "embedded" && (
                          <div>
                            <label className="block text-xs font-medium mb-1">Embed URL</label>
                            <Input
                              value={ch.embed_url}
                              onChange={(e) => updateChapter(sIdx, cIdx, { embed_url: e.target.value })}
                              placeholder="https://example.com/embed/..."
                            />
                          </div>
                        )}
                        {ch.content_type === "text" && (
                          <div>
                            <label className="block text-xs font-medium mb-1">Article Body</label>
                            <Textarea value={ch.article_body} onChange={(e) => updateChapter(sIdx, cIdx, { article_body: e.target.value })} rows={6} />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium mb-1">Duration (seconds)</label>
                            <Input type="number" value={ch.duration_seconds} onChange={(e) => updateChapter(sIdx, cIdx, { duration_seconds: Number(e.target.value) })} />
                          </div>
                          <div className="flex items-center gap-2 pt-5">
                            <Switch checked={ch.make_free} onCheckedChange={(v) => updateChapter(sIdx, cIdx, { make_free: v })} />
                            <label className="text-xs">Make Free</label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => addChapter(sIdx)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-3 py-2"
                >
                  <Plus className="h-3 w-3" /> Add Chapter
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addSection}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded-xl px-4 py-3 w-full justify-center"
          >
            <Plus className="h-4 w-4" /> Add Section
          </button>

          <div className="pt-4">
            <Button onClick={handleSave} disabled={saving} className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
              {saving ? "Saving…" : "Save Curriculum"}
            </Button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminCourseCurriculum;
